import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  CreditCard,
  GraduationCap,
  Globe,
  Loader2,
  MessageCircle,
  Smartphone,
  Sparkles,
  TrendingUp,
  Users,
  Video,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  fetchRateCatalog,
  money,
  priceQuote,
  saveQuote,
  type BillingCycle,
  type Quote,
  type QuoteRequest,
  type SupportTier,
} from "@/services/pricing-api";

/** Modules a prospect can buy. Each is independent — LMS is not a prerequisite. */
const MODULES: {
  key: keyof QuoteRequest;
  label: string;
  blurb: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { key: "lms", label: "LMS", blurb: "Courses, batches, exams, live classes", icon: GraduationCap },
  { key: "crm", label: "CRM", blurb: "Leads, pipeline and follow-ups", icon: TrendingUp },
  { key: "payments", label: "Payments & invoicing", blurb: "Collect fees, auto-invoice", icon: CreditCard },
  { key: "whatsapp", label: "WhatsApp", blurb: "Broadcasts and notifications", icon: MessageCircle },
  { key: "android", label: "Android app", blurb: "Your brand on the Play Store", icon: Smartphone },
  { key: "ios", label: "iOS app", blurb: "Your brand on the App Store", icon: Smartphone },
  { key: "parentApp", label: "Parent app", blurb: "Keep parents in the loop", icon: Users },
  { key: "website", label: "Website builder", blurb: "Site and course catalogue", icon: Globe },
  { key: "subOrgs", label: "Sub-orgs & partners", blurb: "Branches, franchisees, VLEs", icon: Building2 },
  { key: "vacademyMeet", label: "Vacademy Meet", blurb: "Live classes without Zoom", icon: Video },
];

const CYCLES: { key: BillingCycle; label: string; note: string }[] = [
  { key: "MONTHLY", label: "Monthly", note: "+20%" },
  { key: "HALF_YEARLY", label: "Half-yearly", note: "List price" },
  { key: "ANNUAL", label: "Annual upfront", note: "Save 15%" },
];

const SUPPORT: { key: SupportTier; label: string; note: string }[] = [
  { key: "BASIC", label: "Basic", note: "Included" },
  { key: "PREMIUM", label: "Premium", note: "Faster response" },
  { key: "DEDICATED", label: "Dedicated", note: "Your own manager" },
];

export default function PlanBuilderPage() {
  const { slug } = useParams();
  const [params] = useSearchParams();
  const submissionId = params.get("submission") ?? undefined;

  const { data: catalog, isLoading, isError } = useQuery({
    queryKey: ["pricing", "catalog"],
    queryFn: fetchRateCatalog,
    retry: 1,
  });

  const [req, setReq] = useState<QuoteRequest>(() => ({
    submissionId,
    slug,
    currency: "INR",
    billingCycle: "ANNUAL",
    // Seed from whatever the onboarding form captured, if we were handed it.
    studentCount: Number(params.get("students")) || 300,
    lms: true,
    crm: false,
    payments: false,
    whatsapp: false,
    android: false,
    ios: false,
    parentApp: false,
    website: false,
    subOrgs: false,
    vacademyMeet: false,
    supportTier: "BASIC",
    contactName: params.get("name") ?? undefined,
    contactEmail: params.get("email") ?? undefined,
    contactPhone: params.get("phone") ?? undefined,
    organizationName: params.get("org") ?? undefined,
  }));

  // Anyone arriving from the onboarding form is already identified; a cold visit is not.
  const [identified, setIdentified] = useState(
    Boolean(submissionId || params.get("email") || params.get("phone"))
  );
  const [quote, setQuote] = useState<Quote | null>(null);
  const [pricing, setPricing] = useState(false);
  const [saved, setSaved] = useState<Quote | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reprice whenever the configuration changes. The endpoint is stateless and cheap.
  useEffect(() => {
    let cancelled = false;
    setPricing(true);
    const t = setTimeout(() => {
      priceQuote(req)
        .then((q) => !cancelled && setQuote(q))
        .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Pricing failed"))
        .finally(() => !cancelled && setPricing(false));
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [req]);

  const bracket = useMemo(
    () => catalog?.brackets.find((b) => b.code === quote?.bracketCode),
    [catalog, quote]
  );

  const set = <K extends keyof QuoteRequest>(key: K, value: QuoteRequest[K]) =>
    setReq((r) => ({ ...r, [key]: value }));

  const toggle = (key: keyof QuoteRequest) =>
    setReq((r) => ({ ...r, [key]: !r[key] } as QuoteRequest));

  const onSave = async () => {
    setSaving(true);
    setError(null);
    try {
      setSaved(await saveQuote(req));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save this plan.");
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <Shell>
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
        </div>
      </Shell>
    );
  }

  if (isError || !catalog) {
    return (
      <Shell>
        <div className="py-24 text-center">
          <h1 className="text-xl font-semibold">We couldn't load pricing</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Please refresh, or email hello@vacademy.io and we'll send your plan across.
          </p>
        </div>
      </Shell>
    );
  }

  // Cold visitors (no lead behind them) identify themselves before the builder opens, so the
  // quote is still attached to someone we can follow up with.
  if (!identified) {
    return (
      <Shell>
        <LeadGate
          initial={req}
          onDone={(lead) => {
            setReq((r) => ({ ...r, ...lead }));
            setIdentified(true);
          }}
        />
      </Shell>
    );
  }

  if (saved) {
    return (
      <Shell>
        <div className="mx-auto max-w-lg py-20 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 ring-1 ring-emerald-500/20">
            <CheckCircle2 className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Your plan is saved</h1>
          <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
            {saved.bracketName} · {money(saved.total, saved.currencySymbol)} {saved.perPaymentLabel}.
            Our team will reach out on WhatsApp to walk you through it and get you started.
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="mb-8 text-center">
        <h1 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
          Build your plan
        </h1>
        <p className="mx-auto mt-2.5 max-w-lg text-pretty text-sm leading-relaxed text-muted-foreground">
          Pick what you need and see the price update as you go. Nothing is locked in — our team
          will go through it with you.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        {/* ---- configuration ---- */}
        <div className="space-y-8">
          {/* learners */}
          <section>
            <SectionTitle step={1} title="How many learners?" />
            <div className="flex flex-wrap gap-2">
              {catalog.brackets.map((b) => {
                const on = quote?.bracketCode === b.code;
                return (
                  <button
                    key={b.code}
                    type="button"
                    onClick={() => setReq((r) => ({ ...r, bracketCode: b.code, studentCount: b.maxStudents }))}
                    className={cn(
                      "rounded-xl border px-4 py-2.5 text-left transition-all",
                      on
                        ? "border-primary bg-primary/5 shadow-sm ring-1 ring-primary/20"
                        : "border-input bg-card hover:border-primary/40"
                    )}
                  >
                    <span className="block text-sm font-semibold text-foreground">
                      Up to {b.maxStudents.toLocaleString("en-IN")}
                    </span>
                    <span className="block text-xs text-muted-foreground">{b.name}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* modules */}
          <section>
            <SectionTitle step={2} title="What do you need?" />
            <div className="grid gap-2.5 sm:grid-cols-2">
              {MODULES.map((m) => {
                const on = Boolean(req[m.key]);
                const free = bracket ? isFreeAtBracket(m.key, bracket) : false;
                return (
                  <button
                    key={m.key as string}
                    type="button"
                    onClick={() => toggle(m.key)}
                    aria-pressed={on}
                    className={cn(
                      "flex items-start gap-3 rounded-xl border p-3.5 text-left transition-all",
                      on
                        ? "border-primary/60 bg-primary/[0.04] ring-1 ring-primary/20"
                        : "border-input bg-card hover:border-primary/30"
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                        on ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                      )}
                    >
                      <m.icon className="h-[18px] w-[18px]" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-foreground">{m.label}</span>
                        {free && (
                          <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-600">
                            Free
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">{m.blurb}</span>
                    </span>
                    <span
                      className={cn(
                        "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                        on ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/30"
                      )}
                    >
                      {on && <Check className="h-3 w-3" strokeWidth={3} />}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* fine tuning — only what's relevant to the chosen modules */}
          {(req.crm || req.subOrgs || req.vacademyMeet) && (
            <section>
              <SectionTitle step={3} title="A few details" />
              <div className="space-y-3 rounded-xl border bg-card p-4">
                {req.crm && (
                  <NumberRow
                    label="CRM team members"
                    hint={`First ${catalog.crmIncludedSeats} included, then ${money(catalog.crmExtraSeat, "₹")}/year each`}
                    value={req.crmSeats ?? catalog.crmIncludedSeats}
                    min={1}
                    onChange={(v) => set("crmSeats", v)}
                  />
                )}
                {req.subOrgs && (
                  <NumberRow
                    label="Sub-organizations"
                    hint={
                      bracket && bracket.includedSubOrgs > 0
                        ? `${bracket.includedSubOrgs} included, then ${money(catalog.extraSubOrg, "₹")}/year each`
                        : `${money(catalog.extraSubOrg, "₹")}/year each`
                    }
                    value={req.subOrgCount ?? bracket?.includedSubOrgs ?? 1}
                    min={1}
                    onChange={(v) => set("subOrgCount", v)}
                  />
                )}
                {req.vacademyMeet && (
                  <NumberRow
                    label="Live sessions per month"
                    hint={`${money(catalog.meetPerSessionHour, "₹")} per session-hour · free if you bring your own Zoom or Meet`}
                    value={req.meetSessionsPerMonth ?? 0}
                    min={0}
                    onChange={(v) => set("meetSessionsPerMonth", v)}
                  />
                )}
              </div>
            </section>
          )}

          {/* support */}
          <section>
            <SectionTitle step={req.crm || req.subOrgs || req.vacademyMeet ? 4 : 3} title="Support" />
            <div className="grid gap-2 sm:grid-cols-3">
              {SUPPORT.map((s) => {
                const on = req.supportTier === s.key;
                return (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => set("supportTier", s.key)}
                    className={cn(
                      "rounded-xl border px-4 py-3 text-left transition-all",
                      on ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "border-input bg-card hover:border-primary/40"
                    )}
                  >
                    <span className="block text-sm font-semibold text-foreground">{s.label}</span>
                    <span className="block text-xs text-muted-foreground">{s.note}</span>
                  </button>
                );
              })}
            </div>
            {req.supportTier === "DEDICATED" && (
              <p className="mt-2 text-xs text-muted-foreground">
                Dedicated support replaces premium — you're not charged for both.
              </p>
            )}
          </section>
        </div>

        {/* ---- the price ---- */}
        <div className="lg:sticky lg:top-8">
          <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
            <div className="border-b bg-gradient-to-b from-primary/[0.06] to-transparent p-5">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold tracking-tight text-foreground">
                  {quote ? money(quote.total, quote.currencySymbol) : "—"}
                </span>
                {pricing && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {quote ? `${quote.perPaymentLabel} · incl. ${quote.taxLabel}` : "Configuring…"}
              </p>
              {quote && (
                <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                  <Sparkles className="h-3 w-3" />
                  {quote.bracketName} · up to {quote.studentCount.toLocaleString("en-IN")} learners
                </p>
              )}
            </div>

            {/* currency + cycle */}
            <div className="space-y-3 border-b p-4">
              <div className="flex gap-1.5">
                {(["INR", "USD"] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => set("currency", c)}
                    className={cn(
                      "flex-1 rounded-lg border px-2 py-1.5 text-xs font-medium transition-all",
                      req.currency === c
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-input bg-card text-muted-foreground hover:border-primary/40"
                    )}
                  >
                    {c === "INR" ? "₹ INR" : "$ USD"}
                  </button>
                ))}
              </div>
              <div className="space-y-1.5">
                {CYCLES.map((c) => {
                  const on = req.billingCycle === c.key;
                  return (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => set("billingCycle", c.key)}
                      className={cn(
                        "flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm transition-all",
                        on ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "border-input hover:border-primary/40"
                      )}
                    >
                      <span className={cn("font-medium", on ? "text-foreground" : "text-muted-foreground")}>
                        {c.label}
                      </span>
                      <span
                        className={cn(
                          "text-xs font-medium",
                          c.key === "ANNUAL" ? "text-emerald-600" : "text-muted-foreground"
                        )}
                      >
                        {c.note}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* breakdown */}
            {quote && (
              <div className="space-y-1.5 p-4 text-sm">
                {[...quote.recurringLines, ...quote.oneTimeLines].map((l) => (
                  <div key={l.code} className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 flex-1 truncate text-muted-foreground">
                      {l.label}
                      {l.oneTime && <span className="ml-1 text-[10px] uppercase">one-time</span>}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 tabular-nums",
                        l.includedFree ? "text-emerald-600" : "text-foreground"
                      )}
                    >
                      {l.includedFree ? "Free" : money(l.amount, quote.currencySymbol)}
                    </span>
                  </div>
                ))}

                <div className="!mt-3 space-y-1.5 border-t pt-3">
                  {quote.cycleAdjustment !== 0 && (
                    <Row
                      label={quote.cycleAdjustmentLabel}
                      value={money(quote.cycleAdjustment, quote.currencySymbol)}
                      accent={quote.cycleAdjustment < 0 ? "positive" : undefined}
                    />
                  )}
                  <Row label="Subtotal" value={money(quote.subtotal, quote.currencySymbol)} />
                  <Row label={quote.taxLabel} value={money(quote.taxAmount, quote.currencySymbol)} />
                  <div className="flex items-baseline justify-between border-t pt-2 text-base font-semibold">
                    <span>Total</span>
                    <span className="tabular-nums">{money(quote.total, quote.currencySymbol)}</span>
                  </div>
                </div>
              </div>
            )}

            <div className="border-t p-4">
              {error && <p className="mb-2 text-xs text-red-600">{error}</p>}
              <Button className="w-full" size="lg" onClick={onSave} disabled={saving || !quote}>
                {saving ? (
                  <>
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Saving…
                  </>
                ) : (
                  <>
                    Save my plan <ArrowRight className="ml-1 h-4 w-4" />
                  </>
                )}
              </Button>
              <p className="mt-2 text-center text-[11px] leading-relaxed text-muted-foreground">
                No payment now. We'll confirm everything with you first.
              </p>
            </div>
          </div>

          {quote && quote.included.length > 0 && (
            <div className="mt-4 rounded-xl border border-dashed bg-muted/30 p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Included at no extra cost
              </p>
              <ul className="space-y-1">
                {quote.included.map((i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                    <Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" strokeWidth={3} />
                    {i}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </Shell>
  );
}

/** True when the chosen bracket already bundles this module, so we can badge it "Free". */
function isFreeAtBracket(key: keyof QuoteRequest, b: { androidIncluded: boolean; iosIncluded: boolean; websiteIncluded: boolean; commsIncluded: boolean }) {
  switch (key) {
    case "android":
      return b.androidIncluded;
    case "ios":
      return b.iosIncluded;
    case "website":
      return b.websiteIncluded;
    case "whatsapp":
    case "payments":
      return b.commsIncluded;
    default:
      return false;
  }
}

/** Minimal identify-yourself step for the public /pricing link. */
function LeadGate({
  initial,
  onDone,
}: {
  initial: QuoteRequest;
  onDone: (lead: Partial<QuoteRequest>) => void;
}) {
  const [name, setName] = useState(initial.contactName ?? "");
  const [org, setOrg] = useState(initial.organizationName ?? "");
  const [email, setEmail] = useState(initial.contactEmail ?? "");
  const [phone, setPhone] = useState(initial.contactPhone ?? "");
  const [err, setErr] = useState<string | null>(null);

  const go = () => {
    if (!name.trim()) return setErr("Please tell us your name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim()))
      return setErr("Please enter a valid email address.");
    if (!/^\d{7,15}$/.test(phone.replace(/[\s()+-]/g, "")))
      return setErr("Please enter a valid phone number.");
    onDone({
      contactName: name.trim(),
      organizationName: org.trim() || undefined,
      contactEmail: email.trim(),
      contactPhone: phone.trim(),
    });
  };

  const field =
    "w-full rounded-lg border border-input bg-white/80 px-3 py-2 text-sm shadow-sm transition-all placeholder:text-muted-foreground/70 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 dark:bg-slate-900/60";

  return (
    <div className="mx-auto max-w-md py-12">
      <div className="mb-7 text-center">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Build your plan</h1>
        <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
          A few details first, so we can send your plan across and pick up where you left off.
        </p>
      </div>
      <div className="space-y-4 rounded-2xl border bg-card/80 p-6 shadow-sm backdrop-blur-sm">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Your name</label>
          <input className={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Institute / organization</label>
          <input className={field} value={org} onChange={(e) => setOrg(e.target.value)} placeholder="Bright Future Academy" />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Work email</label>
          <input className={field} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@yourbrand.com" />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">WhatsApp number</label>
          <input className={field} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" />
        </div>
        {err && <p className="text-xs font-medium text-red-600">{err}</p>}
        <Button className="w-full" size="lg" onClick={go}>
          Start building <ArrowRight className="ml-1 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function SectionTitle({ step, title }: { step: number; title: string }) {
  return (
    <div className="mb-3 flex items-center gap-2.5">
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
        {step}
      </span>
      <h2 className="text-base font-semibold tracking-tight">{title}</h2>
    </div>
  );
}

function NumberRow({
  label,
  hint,
  value,
  min,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  min: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - 1))}
          className="h-8 w-8 rounded-lg border text-muted-foreground transition-colors hover:bg-muted"
        >
          −
        </button>
        <input
          type="number"
          inputMode="numeric"
          value={value}
          min={min}
          onChange={(e) => onChange(Math.max(min, Number(e.target.value) || min))}
          className="h-8 w-14 rounded-lg border bg-card text-center text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <button
          type="button"
          onClick={() => onChange(value + 1)}
          className="h-8 w-8 rounded-lg border text-muted-foreground transition-colors hover:bg-muted"
        >
          +
        </button>
      </div>
    </div>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: "positive" }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("tabular-nums", accent === "positive" ? "text-emerald-600" : "text-foreground")}>
        {value}
      </span>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="brand-vacademy relative min-h-screen overflow-hidden bg-gradient-to-b from-muted/40 via-background to-background">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-96 bg-[radial-gradient(70%_100%_at_50%_0%,hsl(var(--primary)/0.10),transparent)]"
      />
      <header className="relative mx-auto flex max-w-6xl items-center px-4 pt-8 lg:px-8">
        <a
          href="https://www.vacademy.io"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xl font-extrabold tracking-tight"
        >
          <span className="bg-gradient-to-r from-[#ED7424] to-[#FF9B55] bg-clip-text text-transparent">
            vacademy
          </span>
        </a>
      </header>
      <main className="relative mx-auto max-w-6xl px-4 py-10 sm:py-14 lg:px-8">{children}</main>
    </div>
  );
}
