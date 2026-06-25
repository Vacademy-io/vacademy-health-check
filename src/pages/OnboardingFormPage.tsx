import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Loader2, CheckCircle2 } from "lucide-react";
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
  const { data: config, isLoading, isError } = useQuery({
    queryKey: ["onboarding", "public-link", slug],
    queryFn: () => fetchPublicLink(slug),
    retry: false,
  });

  if (isLoading) return <FullScreen><Loader2 className="h-8 w-8 animate-spin text-primary" /></FullScreen>;
  if (isError || !config) return <FullScreen><Message title="Link not found" body="This onboarding link doesn't exist or has been removed." /></FullScreen>;
  if (!config.active) return <FullScreen><Message title="Link unavailable" body={config.expired ? "This link has expired." : "This link is no longer active."} /></FullScreen>;

  return <OnboardingWizard config={config} slug={slug} />;
}

function OnboardingWizard({ config, slug }: { config: PublicLinkConfig; slug: string }) {
  const [answers, setAnswers] = useState<Answers>(() => ({
    ...(config.prefilled ?? {}),
    ...(config.forcedInstituteType ? { institute_type: config.forcedInstituteType } : {}),
  }));
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
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
    setError(null);
  };

  if (result) {
    return <FullScreen><DemoHandoffView handoff={result.handoff} /></FullScreen>;
  }

  // Direct-demo links carry no questions — should be launched via /demo, but guard anyway.
  if (sections.length === 0) {
    return <FullScreen><Message title="Nothing to fill" body="This link has no questions configured." /></FullScreen>;
  }

  const current = sections[step];
  const visibleQuestions = current.questions.filter(isVisible);
  const isLast = step === sections.length - 1;
  const progress = ((step + 1) / sections.length) * 100;

  const validate = () => {
    for (const q of visibleQuestions) {
      if (!q.required) continue;
      const v = answers[q.key];
      const empty = v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
      if (empty) {
        setError(`Please fill in "${q.label}".`);
        return false;
      }
    }
    return true;
  };

  const next = () => {
    if (!validate()) return;
    setStep((s) => Math.min(s + 1, sections.length - 1));
  };

  const submit = async () => {
    if (!validate()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await submitOnboarding({
        slug,
        instituteType: (answers.institute_type as string) || config.forcedInstituteType,
        answers,
        referrer: document.referrer || undefined,
      });
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <FullScreen>
      <div className="mx-auto w-full max-w-xl">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            {config.introHeading || "Welcome to Vacademy"}
          </h1>
          {config.introSubheading && (
            <p className="mt-2 text-sm text-muted-foreground">{config.introSubheading}</p>
          )}
        </div>

        {/* progress */}
        <div className="mb-6">
          <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{current.label}</span>
            <span>
              Step {step + 1} of {sections.length}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>

        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <div className="space-y-5">
            {visibleQuestions.map((q) => (
              <QuestionField key={q.key} question={q} value={answers[q.key]} onChange={(v) => set(q.key, v)} />
            ))}
          </div>

          {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

          <div className="mt-6 flex items-center justify-between gap-3">
            <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || submitting}>
              <ArrowLeft className="mr-1 h-4 w-4" /> Back
            </Button>
            {isLast ? (
              <Button onClick={submit} disabled={submitting}>
                {submitting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1 h-4 w-4" />}
                Get my demo
              </Button>
            ) : (
              <Button onClick={next} disabled={submitting}>
                Continue <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </FullScreen>
  );
}

function FullScreen({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-muted/40 to-background px-4 py-12">
      {children}
    </div>
  );
}

function Message({ title, body }: { title: string; body: string }) {
  return (
    <div className="mx-auto max-w-md text-center">
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="mt-2 text-muted-foreground">{body}</p>
    </div>
  );
}
