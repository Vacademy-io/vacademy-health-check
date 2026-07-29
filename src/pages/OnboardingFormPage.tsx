import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { QuestionField } from "@/components/onboarding/QuestionField";
import { DemoHandoffView } from "@/components/onboarding/DemoHandoffView";
import {
  fetchPublicLink,
  submitOnboarding,
  type PublicLinkConfig,
  type Question,
  type SubmitResponse,
} from "@/services/onboarding-api";

type Answers = Record<string, unknown>;

export default function OnboardingFormPage() {
  const { slug = "general" } = useParams();
  const {
    data: config,
    isLoading,
    isError,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["onboarding", "public-link", slug],
    queryFn: () => fetchPublicLink(slug),
    retry: 1,
  });

  if (isLoading) {
    return (
      <Shell>
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
          <p className="text-sm">Setting things up…</p>
        </div>
      </Shell>
    );
  }

  // A failed fetch is usually a transient backend blip, not a dead link — offer a retry
  // rather than telling a prospect their link doesn't exist.
  if (isError || !config) {
    return (
      <Shell>
        <Message
          title="We couldn't load this page"
          body="Something went wrong on our side. Give it another try — if it keeps happening, email us at hello@vacademy.io."
          action={
            <Button onClick={() => refetch()} disabled={isFetching} variant="outline">
              {isFetching ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-1.5 h-4 w-4" />
              )}
              Try again
            </Button>
          }
        />
      </Shell>
    );
  }

  if (!config.active) {
    return (
      <Shell>
        <Message
          title="This link is no longer available"
          body={
            config.expired
              ? "It has expired. Ask your contact at Vacademy for a fresh one."
              : "It has been deactivated. Ask your contact at Vacademy for a fresh one."
          }
        />
      </Shell>
    );
  }

  return <OnboardingWizard config={config} slug={slug} />;
}

function OnboardingWizard({ config, slug }: { config: PublicLinkConfig; slug: string }) {
  const [answers, setAnswers] = useState<Answers>(() => ({
    ...(config.prefilled ?? {}),
    ...(config.forcedInstituteType ? { institute_type: config.forcedInstituteType } : {}),
  }));
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SubmitResponse | null>(null);

  // Ordered, de-duplicated sections from the visible questions.
  const sections = useMemo(() => {
    const order: string[] = [];
    const byKey = new Map<string, { key: string; label: string; questions: Question[] }>();
    for (const q of config.questions) {
      if (!byKey.has(q.section)) {
        byKey.set(q.section, { key: q.section, label: q.sectionLabel, questions: [] });
        order.push(q.section);
      }
      byKey.get(q.section)!.questions.push(q);
    }
    return order.map((k) => byKey.get(k)!);
  }, [config.questions]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [step]);

  const isVisible = (q: Question) => {
    if (!q.dependsOnKey) return true;
    const v = answers[q.dependsOnKey];
    const want = q.dependsOnValue;
    if (want === "true") return v === true || v === "true";
    if (want === "false") return v === false || v === "false";
    return String(v ?? "") === String(want ?? "");
  };

  const set = (key: string, v: unknown) => {
    setAnswers((a) => ({ ...a, [key]: v }));
    setErrors((e) => {
      if (!e[key]) return e;
      const { [key]: _drop, ...rest } = e;
      return rest;
    });
    setFormError(null);
  };

  if (result) {
    return (
      <Shell wide>
        <DemoHandoffView handoff={result.handoff} />
      </Shell>
    );
  }

  // Direct-demo links carry no questions — should be launched via /demo, but guard anyway.
  if (sections.length === 0) {
    return (
      <Shell>
        <Message title="Nothing to fill in" body="This link has no questions configured." />
      </Shell>
    );
  }

  const current = sections[step];
  const visibleQuestions = current.questions.filter(isVisible);
  const isLast = step === sections.length - 1;

  /** Validates the current step, marking every offending field rather than just the first. */
  const validate = () => {
    const found: Record<string, string> = {};
    for (const q of visibleQuestions) {
      const v = answers[q.key];
      const empty =
        v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);

      if (q.required && empty) {
        found[q.key] =
          q.type === "FEATURE_GROUPS" || q.type === "MULTISELECT"
            ? "Pick at least one option."
            : "This one's required.";
        continue;
      }
      if (empty) continue;

      const text = String(v).trim();
      if (q.type === "EMAIL" && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(text)) {
        found[q.key] = "That doesn't look like a valid email address.";
      }
      // Digits only, ignoring +, spaces, dashes and brackets — enough to catch typos
      // without rejecting the many legitimate international formats.
      if (q.type === "PHONE" && !/^\d{7,15}$/.test(text.replace(/[\s()+-]/g, ""))) {
        found[q.key] = "Enter a valid phone number, including the country code.";
      }
    }
    setErrors(found);
    return Object.keys(found).length === 0;
  };

  const next = () => {
    if (validate()) setStep((s) => Math.min(s + 1, sections.length - 1));
  };

  const submit = async () => {
    if (!validate()) return;
    setSubmitting(true);
    setFormError(null);
    try {
      const res = await submitOnboarding({
        slug,
        instituteType: (answers.institute_type as string) || config.forcedInstituteType,
        answers,
        referrer: document.referrer || undefined,
      });
      setResult(res);
    } catch (e) {
      setFormError(
        e instanceof Error ? e.message : "Something went wrong. Please try again in a moment."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Shell>
      <div className="mx-auto w-full max-w-2xl">
        {/* header */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
            <Sparkles className="h-5 w-5" />
          </div>
          <h1 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
            {config.introHeading || "See Vacademy in action"}
          </h1>
          {config.introSubheading && (
            <p className="mx-auto mt-2.5 max-w-md text-pretty text-sm leading-relaxed text-muted-foreground">
              {config.introSubheading}
            </p>
          )}
        </div>

        {/* stepper */}
        <div className="mb-6 flex items-center gap-3">
          {sections.map((s, i) => {
            const done = i < step;
            const active = i === step;
            return (
              <div key={s.key} className="flex flex-1 items-center gap-2">
                <span
                  className={[
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-all",
                    done
                      ? "bg-primary text-primary-foreground"
                      : active
                        ? "bg-primary text-primary-foreground ring-4 ring-primary/15"
                        : "bg-muted text-muted-foreground",
                  ].join(" ")}
                >
                  {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : i + 1}
                </span>
                <span
                  className={[
                    "hidden truncate text-xs font-medium sm:block",
                    active ? "text-foreground" : "text-muted-foreground",
                  ].join(" ")}
                >
                  {s.label}
                </span>
                {i < sections.length - 1 && (
                  <span className="h-px flex-1 bg-border">
                    <span
                      className="block h-px bg-primary transition-all duration-300"
                      style={{ width: done ? "100%" : "0%" }}
                    />
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* card */}
        <div className="rounded-2xl border bg-card/80 p-6 shadow-sm backdrop-blur-sm sm:p-8">
          <div key={current.key} className="animate-in fade-in slide-in-from-right-2 duration-300">
            <h2 className="mb-1 text-base font-semibold sm:hidden">{current.label}</h2>
            <div className="space-y-6">
              {visibleQuestions.map((q) => (
                <QuestionField
                  key={q.key}
                  question={q}
                  value={answers[q.key]}
                  error={errors[q.key]}
                  onChange={(v) => set(q.key, v)}
                />
              ))}
            </div>
          </div>

          {formError && (
            <div className="mt-5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
              {formError}
            </div>
          )}

          <div className="mt-7 flex items-center justify-between gap-3 border-t pt-5">
            <Button
              variant="ghost"
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              disabled={step === 0 || submitting}
              className={step === 0 ? "invisible" : undefined}
            >
              <ArrowLeft className="mr-1 h-4 w-4" /> Back
            </Button>
            {isLast ? (
              <Button onClick={submit} disabled={submitting} size="lg" className="min-w-[10rem]">
                {submitting ? (
                  <>
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Setting up…
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-1.5 h-4 w-4" /> Get my demo
                  </>
                )}
              </Button>
            ) : (
              <Button onClick={next} disabled={submitting} size="lg">
                Continue <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        <p className="mt-5 text-center text-xs text-muted-foreground">
          Takes under a minute · No credit card · We'll never share your details
        </p>
      </div>
    </Shell>
  );
}

function Shell({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-b from-muted/50 via-background to-background px-4 py-12">
      {/* soft ambient wash behind the card */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(60%_100%_at_50%_0%,hsl(var(--primary)/0.10),transparent)]"
      />
      <div className={["relative w-full", wide ? "max-w-3xl" : "max-w-2xl"].join(" ")}>{children}</div>
    </div>
  );
}

function Message({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-md text-center">
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}
