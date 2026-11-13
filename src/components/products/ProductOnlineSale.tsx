import { AlertCircle, CheckCircle2, CircleDashed, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUpdateAiSetting } from "@/services/ai-settings-api";
import { useBillingFeatures } from "@/services/plans-api";
import { useCreditPacks } from "@/services/products-api";
import type { ProductStorefront } from "@/services/product-plans-api";
import { STOREFRONT_MODE_SETTING_KEY } from "@/lib/plan-billing";
import { newPlans, packCreditPrice, saleState, soldFor, type ProductPlan } from "./plans";

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

/**
 * Below the plan rows on Products → Pricing: what buyers can actually pay for right now. Saving the
 * tab makes the storefront sell exactly the rows above (ai-service product plans), so this is the
 * one place a product's prices change.
 */
export function ProductOnlineSale({
  displayName,
  plans,
  months,
  extra,
  storefront,
  loading,
  features,
  onFeatures,
  migrate,
  onMigrate,
  onExtra,
  onRefresh,
}: {
  displayName: string;
  plans: ProductPlan[];
  months: number | null | undefined;
  extra: number | null | undefined;
  /** undefined while loading; null when this ai-service cannot sell product plans yet. */
  storefront: ProductStorefront | null | undefined;
  loading: boolean;
  features: string[];
  onFeatures: (keys: string[]) => void;
  migrate: boolean;
  onMigrate: (v: boolean) => void;
  onExtra: (v: number) => void;
  onRefresh: () => void;
}) {
  const billingFeatures = useBillingFeatures();
  const packs = useCreditPacks();
  const setMode = useUpdateAiSetting();
  const packPrice = packCreditPrice(packs.data);

  if (loading) {
    return <p className="text-sm text-muted-foreground">Checking what is on sale…</p>;
  }
  if (storefront === null) {
    return (
      <p role="alert" className="text-sm text-destructive">
        This ai-service cannot sell product plans yet. Deploy ai-service, then reload this page.
      </p>
    );
  }
  if (!storefront) return null;

  const sold = storefront.plans;
  const fresh = newPlans(plans, sold);
  const anyDiffers = plans.some((p) => saleState(p, soldFor(p, sold), months) === "differs");
  const choosable = (billingFeatures.data ?? []).filter((f) => f.is_active && f.eligibility !== "ALWAYS_CHARGED");
  const mode = storefront.storefront.mode;
  const toggle = (key: string) =>
    onFeatures(features.includes(key) ? features.filter((k) => k !== key) : [...features, key]);

  return (
    <section className="space-y-3 rounded-lg border p-3">
      <div>
        <h3 className="text-sm font-semibold">Selling online</h3>
        <p className="text-xs text-muted-foreground">
          The website&apos;s Buy buttons open sign-up, then that plan&apos;s checkout inside the {displayName} app.
          Saving this tab puts exactly the plans above on sale. A new price publishes a new plan version.
        </p>
      </div>

      <ul className="space-y-1 text-sm">
        {plans.map((p) => {
          const s = soldFor(p, sold);
          const state = saleState(p, s, months);
          const v = s?.published;
          return (
            <li key={p.key} className="flex items-start gap-2">
              {state === "on_sale" ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              ) : (
                <CircleDashed className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              )}
              <span>
                <strong>{p.name || p.key}</strong>{" "}
                {state === "on_sale" && v
                  ? `on sale: ${inr(v.price_inr)} for ${v.period_months} months, ${v.credits.toLocaleString("en-IN")} credits.`
                  : state === "differs" && v
                    ? `sells at ${inr(v.price_inr)} for ${v.period_months} months, ${v.credits.toLocaleString("en-IN")} credits. Save to change it.`
                    : "is not on sale yet. Save to put it on sale."}
              </span>
            </li>
          );
        })}
        {sold
          .filter((s) => s.listed && !plans.some((p) => soldFor(p, [s])))
          .map((s) => (
            <li key={s.plan_key} className="flex items-start gap-2 text-amber-700">
              <CircleDashed className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                <strong>{s.name}</strong> is on sale but not in the list above. Save to stop selling it.
              </span>
            </li>
          ))}
      </ul>

      {fresh.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-sm font-medium">What the credits of a new plan pay for</p>
          <p className="text-xs text-muted-foreground">
            For {fresh.map((p) => p.name || p.key).join(", ")}. Plans already on sale keep theirs (change them on the Plans
            page).
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {choosable.map((f) => (
              <label key={f.feature_key} className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" checked={features.includes(f.feature_key)} onChange={() => toggle(f.feature_key)} />
                {f.label}
              </label>
            ))}
          </div>
          {features.length === 0 && (
            <p role="alert" className="text-xs text-destructive">
              Tick at least one, for example AI answer-sheet evaluation.
            </p>
          )}
        </div>
      )}

      {anyDiffers && (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={migrate} onChange={(e) => onMigrate(e.target.checked)} />
          <span>
            Move current subscribers to the new price at their next renewal.{" "}
            <span className="text-muted-foreground">Off: they keep the price they bought at.</span>
          </span>
        </label>
      )}

      <div className="space-y-1 text-sm">
        {!storefront.storefront.payments_enabled && (
          <p role="alert" className="flex items-start gap-1 text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            Online payments are switched off (AI settings: billing.subscriptions.payments.enabled). Nobody can buy.
          </p>
        )}
        {(mode === "OFF" || mode === "ALLOWLIST") && (
          <div className="flex flex-wrap items-center gap-2 text-amber-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>
              The plans page is in {mode === "OFF" ? "Off" : "Allowlist"} mode, so {displayName} sign-ups cannot see it.
              Segments mode keeps every allowlisted institute and adds {displayName}&apos;s.
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={setMode.isPending}
              onClick={() =>
                setMode.mutate({ key: STOREFRONT_MODE_SETTING_KEY, value: "SEGMENTS" }, { onSuccess: onRefresh })
              }
            >
              {setMode.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Switch to Segments
            </Button>
          </div>
        )}
        {setMode.isError && (
          <p role="alert" className="text-destructive">
            The mode could not be changed. Try again, or change it on AI settings.
          </p>
        )}
        {plans.length > 0 && !storefront.storefront.open_to_segment && (
          <p className="text-muted-foreground">Saving also opens the plans page to every {displayName} institute.</p>
        )}
      </div>

      {packPrice !== null && extra != null && Math.abs(packPrice - extra) >= 0.005 && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-amber-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>
            The website says an extra credit is {inr(extra)}, but recharge packs sell at {inr(packPrice)} a credit.
          </span>
          <Button size="sm" variant="outline" onClick={() => onExtra(packPrice)}>
            Show {inr(packPrice)} on the website
          </Button>
        </div>
      )}
    </section>
  );
}
