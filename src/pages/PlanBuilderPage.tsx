import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Check, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProductCard } from "@/components/pricing/ProductCard";
import { cn } from "@/lib/utils";
import {
  fetchRateCatalog,
  money,
  needsQuantity,
  priceQuote,
  saveQuote,
  type BillingCycle,
  type Product,
  type Quote,
  type QuoteRequest,
  type Selection,
} from "@/services/pricing-api";

const CYCLES: { key: BillingCycle; label: string; note: string }[] = [
  { key: "MONTHLY", label: "Monthly", note: "+20%" },
  { key: "HALF_YEARLY", label: "Half-yearly", note: "List price" },
  { key: "ANNUAL", label: "Annual upfront", note: "Save 15%" },
];

/**
 * Applies a selection, then pulls in whatever that plan bundles for free — picking Premier
 * ticks the Android and iOS apps rather than leaving the prospect to discover they're included.
 * Nothing is ever auto-removed: dropping to a smaller plan keeps the product, now priced.
 */
function withInclusions(
  base: Record<string, Selection>,
  code: string,
  next: Selection,
  products: Product[]
): Record<string, Selection> {
  const merged = { ...base, [code]: next };
  const plan = products.find((p) => p.code === code)?.plans.find((p) => p.code === next.planCode);
  for (const inc of plan?.inclusions ?? []) {
    const target = products.find((p) => p.code === inc.productCode);
    if (!target) continue;
    const existing = merged[inc.productCode];
    merged[inc.productCode] = {
      productCode: inc.productCode,
      // A plan-specific inclusion (premium support) selects that exact plan.
      planCode: inc.planCode ?? existing?.planCode ?? target.plans[0]?.code,
      quantity:
        existing?.quantity ??
        (needsQuantity(target) ? (inc.quantity ?? target.minQuantity) : undefined),
    };
  }
  return merged;
}

/** Which selected plan, if any, is giving this product away — and how many units it covers. */
function inclusionFor(
  productCode: string,
  selections: Record<string, Selection>,
  products: Product[]
): { planName: string; quantity?: number } | undefined {
  for (const sel of Object.values(selections)) {
    const plan = products
      .find((p) => p.code === sel.productCode)
      ?.plans.find((p) => p.code === sel.planCode);
    const inc = plan?.inclusions?.find((i) => i.productCode === productCode);
    if (!inc) continue;
    // A plan-specific inclusion only counts when that exact plan is the one chosen.
    if (inc.planCode && selections[productCode]?.planCode !== inc.planCode) continue;
    return { planName: plan!.name, quantity: inc.quantity };
  }
  return undefined;
}

/** Smallest learner tier that covers the headcount we captured on the onboarding form. */
function planForLearners(product: Product | undefined, learners: number): string | undefined {
  if (!product) return undefined;
  const fit = product.plans.find((p) => (p.unitCount ?? 0) >= learners);
  return (fit ?? product.plans[product.plans.length - 1])?.code;
}

export default function PlanBuilderPage() {
  const { slug } = useParams();
  const [params] = useSearchParams();
  const submissionId = params.get("submission") ?? undefined;
  const learnersHint = Number(params.get("students")) || 0;

  const {
    data: catalog,
    isLoading,
    isError,
    error: loadError,
  } = useQuery({
    queryKey: ["pricing", "catalog"],
    queryFn: fetchRateCatalog,
    retry: 1,
  });

  const [identified, setIdentified] = useState(
    Boolean(submissionId || params.get("email") || params.get("phone"))
  );
  const [contact, setContact] = useState<Contact>({
    contactName: params.get("name") ?? undefined,
    contactEmail: params.get("email") ?? undefined,
    contactPhone: params.get("phone") ?? undefined,
    organizationName: params.get("org") ?? undefined,
  });

  const [selections, setSelections] = useState<Record<string, Selection>>({});
  const [currency, setCurrency] = useState<"INR" | "USD">("INR");
  const [cycle, setCycle] = useState<BillingCycle>("ANNUAL");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [pricing, setPricing] = useState(false);
  const [saved, setSaved] = useState<Quote | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Seed a sensible starting basket once the catalogue lands: LMS at the tier that matches
  // whatever the onboarding form told us, plus basic support.
  useEffect(() => {
    if (!catalog || Object.keys(selections).length > 0) return;
    let seed: Record<string, Selection> = {};
    const support = catalog.products.find((p) => p.code === "SUPPORT");
    if (support) {
      seed.SUPPORT = { productCode: "SUPPORT", planCode: support.plans[0]?.code };
    }
    const lms = catalog.products.find((p) => p.code === "LMS");
    if (lms) {
      // Seeded through the same path as a click, so the tier's freebies come along with it.
      seed = withInclusions(
        seed,
        "LMS",
        { productCode: "LMS", planCode: planForLearners(lms, learnersHint || 300) },
        catalog.products
      );
    }
    setSelections(seed);
  }, [catalog, learnersHint, selections]);

  const request: QuoteRequest = useMemo(
    () => ({
      submissionId,
      slug,
      ...contact,
      currency,
      billingCycle: cycle,
      selections: Object.values(selections),
    }),
    [submissionId, slug, contact, currency, cycle, selections]
  );

  // Reprice on every change. The endpoint is stateless and cheap.
  useEffect(() => {
    if (!catalog) return;
    let cancelled = false;
    setPricing(true);
    const t = setTimeout(() => {
      priceQuote(request)
        .then((q) => !cancelled && setQuote(q))
        .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Pricing failed"))
        .finally(() => !cancelled && setPricing(false));
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [request, catalog]);

  const toggle = (product: Product) =>
    setSelections((s) => {
      const next = { ...s };
      if (next[product.code]) {
        delete next[product.code];
        // Anything that depends on this product goes with it.
        for (const [code, sel] of Object.entries(next)) {
          const dep = catalog?.products.find((p) => p.code === sel.productCode);
          if (dep?.requiresProductCode === product.code) delete next[code];
        }
      } else {
        next[product.code] = {
          productCode: product.code,
          planCode: product.mirrorsProductCode ? undefined : product.plans[0]?.code,
          quantity: needsQuantity(product)
            ? (product.includedUnits ?? product.minQuantity)
            : undefined,
        };
      }
      return next;
    });

  const update = (code: string, next: Selection) =>
    setSelections((s) => withInclusions(s, code, next, catalog?.products ?? []));

  const onSave = async () => {
    setSaving(true);
    setError(null);
    try {
      setSaved(await saveQuote(request));
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

  if (isError || !catalog || catalog.products.length === 0) {
    return (
      <Shell>
        <div className="py-24 text-center">
          <h1 className="text-xl font-semibold">We couldn't load pricing</h1>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
            {loadError?.message ??
              "Please refresh, or email hello@vacademy.io and we'll send your plan across."}
          </p>
        </div>
      </Shell>
    );
  }

  if (!identified) {
    return (
      <Shell>
        <LeadGate
          initial={contact}
          onDone={(lead) => {
            setContact(lead);
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
            {money(saved.perPaymentAmount, saved.currencySymbol)} {saved.perPaymentLabel}. Our team
            will reach out on WhatsApp to walk you through it and get you started.
          </p>
        </div>
      </Shell>
    );
  }

  const symbol = quote?.currencySymbol ?? (currency === "INR" ? "₹" : "$");

  return (
    <Shell>
      <div className="mb-8 text-center">
        <h1 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
          Build your plan
        </h1>
        <p className="mx-auto mt-2.5 max-w-lg text-pretty text-sm leading-relaxed text-muted-foreground">
          Pick the products you need and choose a plan for each. The price updates as you go, and
          nothing is locked in — our team will go through it with you.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="space-y-3">
          {catalog.products.map((product) => {
            const parent = product.requiresProductCode;
            const parentSelected = parent ? Boolean(selections[parent]) : true;
            const parentName = parent
              ? catalog.products.find((p) => p.code === parent)?.name
              : undefined;
            const mirrored = product.mirrorsProductCode
              ? mirroredPlanName(selections, product)
              : undefined;

            return (
              <ProductCard
                key={product.code}
                product={product}
                selection={selections[product.code]}
                currencySymbol={symbol}
                lockedBy={parentSelected ? undefined : parentName}
                mirroredPlanName={mirrored}
                includedBy={inclusionFor(product.code, selections, catalog.products)}
                onToggle={() => toggle(product)}
                onChange={(next) => update(product.code, next)}
              />
            );
          })}
        </div>

        {/* ---- the price ---- */}
        <div className="lg:sticky lg:top-8">
          <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
            <div className="border-b bg-gradient-to-b from-primary/[0.06] to-transparent p-5">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold tracking-tight text-foreground">
                  {quote ? money(quote.perPaymentAmount, symbol) : "—"}
                </span>
                {quote && (
                  <span className="text-sm font-medium text-muted-foreground">
                    {quote.perPaymentLabel}
                  </span>
                )}
                {pricing && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              </div>
              {quote && (
                <p className="mt-1 text-xs text-muted-foreground">
                  incl. {quote.taxLabel}
                  {quote.paymentsPerYear > 1 && ` · ${quote.paymentsPerYear} payments a year`}
                </p>
              )}
              {quote && quote.oneTimeTotalWithTax > 0 && (
                <p className="mt-1 text-xs font-medium text-foreground">
                  + {money(quote.oneTimeTotalWithTax, symbol)} one-time, with your first invoice
                </p>
              )}
            </div>

            <div className="space-y-3 border-b p-4">
              <div className="flex gap-1.5">
                {(["INR", "USD"] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCurrency(c)}
                    className={cn(
                      "flex-1 rounded-lg border px-2 py-1.5 text-xs font-medium transition-all",
                      currency === c
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
                  const on = cycle === c.key;
                  return (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => setCycle(c.key)}
                      className={cn(
                        "flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm transition-all",
                        on
                          ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                          : "border-input hover:border-primary/40"
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

            {quote && (
              <div className="space-y-1.5 p-4 text-sm">
                {[...quote.recurringLines, ...quote.oneTimeLines].length === 0 && (
                  <p className="py-2 text-center text-xs text-muted-foreground">
                    Pick a product to see your price.
                  </p>
                )}
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
                      {l.includedFree ? "Free" : money(l.amount, symbol)}
                    </span>
                  </div>
                ))}

                <div className="!mt-3 space-y-1.5 border-t pt-3">
                  {quote.cycleAdjustment !== 0 && (
                    <Row
                      label={quote.cycleAdjustmentLabel}
                      value={money(quote.cycleAdjustment, symbol)}
                      accent={quote.cycleAdjustment < 0 ? "positive" : undefined}
                    />
                  )}
                  <Row label="Subtotal" value={money(quote.subtotal, symbol)} />
                  <Row label={quote.taxLabel} value={money(quote.taxAmount, symbol)} />
                  <div className="flex items-baseline justify-between border-t pt-2 text-base font-semibold">
                    <span>First year total</span>
                    <span className="tabular-nums">{money(quote.total, symbol)}</span>
                  </div>
                  {quote.paymentsPerYear > 1 && (
                    <p className="text-xs text-muted-foreground">
                      Paid as {quote.paymentsPerYear} × {money(quote.perPaymentAmount, symbol)}
                      {quote.oneTimeTotalWithTax > 0 &&
                        `, plus ${money(quote.oneTimeTotalWithTax, symbol)} once`}
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className="border-t p-4">
              {error && <p className="mb-2 text-xs text-red-600">{error}</p>}
              <Button
                className="w-full"
                size="lg"
                onClick={onSave}
                disabled={saving || !quote || Object.keys(selections).length === 0}
              >
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

/** Name of the plan a mirroring product has inherited from its parent. */
function mirroredPlanName(
  selections: Record<string, Selection>,
  product: Product
): string | undefined {
  const parentCode = product.mirrorsProductCode;
  if (!parentCode) return undefined;
  const parentPlan = selections[parentCode]?.planCode;
  if (!parentPlan) return undefined;
  return product.plans.find((p) => p.code === parentPlan)?.name;
}

type Contact = {
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  organizationName?: string;
};

/** Minimal identify-yourself step for the public /pricing link. */
function LeadGate({
  initial,
  onDone,
}: {
  initial: Contact;
  onDone: (lead: Contact) => void;
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
