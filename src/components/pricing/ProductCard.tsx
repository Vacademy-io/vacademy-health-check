import {
  Building2,
  Check,
  CreditCard,
  Globe,
  GraduationCap,
  LayoutGrid,
  LifeBuoy,
  Lock,
  MessageCircle,
  Smartphone,
  TrendingUp,
  Users,
  Video,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  hasPlanChoice,
  money,
  needsQuantity,
  type Product,
  type Selection,
} from "@/services/pricing-api";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "graduation-cap": GraduationCap,
  "trending-up": TrendingUp,
  "credit-card": CreditCard,
  "message-circle": MessageCircle,
  smartphone: Smartphone,
  users: Users,
  globe: Globe,
  "building-2": Building2,
  video: Video,
  "life-buoy": LifeBuoy,
};

/**
 * One product in the builder. Selecting it expands the card in place to reveal whatever that
 * product needs — a plan picker, a quantity, or nothing at all — so every product can price
 * differently without the builder growing extra steps.
 */
export function ProductCard({
  product,
  selection,
  currencySymbol,
  lockedBy,
  mirroredPlanName,
  onToggle,
  onChange,
}: {
  product: Product;
  selection?: Selection;
  currencySymbol: string;
  /** Set when this product can't be bought without another one. */
  lockedBy?: string;
  /** When the product mirrors another, the plan name it has inherited. */
  mirroredPlanName?: string;
  onToggle: () => void;
  onChange: (next: Selection) => void;
}) {
  const Icon = ICONS[product.icon ?? ""] ?? LayoutGrid;
  const on = Boolean(selection);
  const locked = Boolean(lockedBy);
  const plan = product.plans.find((p) => p.code === selection?.planCode);
  const showPlans = on && hasPlanChoice(product);
  const showQty = on && needsQuantity(product);

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border transition-all duration-200",
        locked
          ? "border-dashed border-border bg-muted/20 opacity-60"
          : on
            ? "border-primary/60 bg-primary/[0.03] shadow-sm ring-1 ring-primary/20"
            : "border-border bg-card hover:border-primary/30 hover:shadow-sm"
      )}
    >
      <button
        type="button"
        onClick={locked ? undefined : onToggle}
        disabled={locked}
        aria-pressed={on}
        className="flex w-full items-start gap-3 p-4 text-left disabled:cursor-not-allowed"
      >
        <span
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors",
            on ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
          )}
        >
          {locked ? <Lock className="h-4 w-4" /> : <Icon className="h-5 w-5" />}
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-sm font-semibold text-foreground">{product.name}</span>
            {!on && product.fromPrice != null && (
              <span className="text-xs text-muted-foreground">
                from {money(product.fromPrice, currencySymbol)}
                {product.pricingModel === "ONE_TIME" ? " one-time" : "/year"}
              </span>
            )}
          </span>
          <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
            {locked ? `Available with ${lockedBy}` : product.tagline}
          </span>
        </span>

        <span
          className={cn(
            "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-all",
            on ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/30"
          )}
        >
          {on && <Check className="h-3 w-3" strokeWidth={3} />}
        </span>
      </button>

      {/* Expanded configuration — only rendered once the product is actually selected. */}
      {on && (showPlans || showQty || mirroredPlanName) && (
        <div className="border-t border-dashed px-4 pb-4 pt-3">
          {mirroredPlanName && (
            <p className="text-xs text-muted-foreground">
              Follows your {product.mirrorsProductCode === "LMS" ? "LMS" : "main"} plan —{" "}
              <span className="font-medium text-foreground">{mirroredPlanName}</span>
            </p>
          )}

          {showPlans && (
            <>
              <p className="mb-2 text-xs font-medium text-muted-foreground">Choose a plan</p>
              <div className="flex flex-wrap gap-1.5">
                {product.plans.map((p) => {
                  const active = p.code === selection?.planCode;
                  return (
                    <button
                      key={p.code}
                      type="button"
                      onClick={() => onChange({ ...selection!, planCode: p.code })}
                      className={cn(
                        "relative rounded-lg border px-3 py-2 text-left transition-all",
                        active
                          ? "border-primary bg-primary text-primary-foreground shadow-sm"
                          : "border-input bg-card hover:border-primary/40"
                      )}
                    >
                      <span className="block text-xs font-semibold">{p.name}</span>
                      <span
                        className={cn(
                          "block text-[11px]",
                          active ? "text-primary-foreground/80" : "text-muted-foreground"
                        )}
                      >
                        {p.unitCount
                          ? `up to ${p.unitCount.toLocaleString("en-IN")}`
                          : money(p.annualPrice, currencySymbol)}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* What this plan does and doesn't include. */}
              {plan && plan.features.length > 0 && (
                <ul className="mt-3 grid gap-1 sm:grid-cols-2">
                  {plan.features.map((f) => (
                    <li
                      key={f.label}
                      className={cn(
                        "flex items-start gap-1.5 text-xs",
                        f.included ? "text-muted-foreground" : "text-muted-foreground/60"
                      )}
                    >
                      {f.included ? (
                        <Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" strokeWidth={3} />
                      ) : (
                        <X className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground/50" strokeWidth={3} />
                      )}
                      <span className={cn(!f.included && "line-through")}>{f.label}</span>
                    </li>
                  ))}
                </ul>
              )}

              {plan && (
                <p className="mt-2.5 text-xs text-muted-foreground">
                  {plan.unitCount
                    ? `${plan.unitCount.toLocaleString("en-IN")} learners × ${money(plan.price, currencySymbol)} = `
                    : ""}
                  <span className="font-semibold text-foreground">
                    {money(plan.annualPrice, currencySymbol)}
                  </span>{" "}
                  per year
                </p>
              )}
            </>
          )}

          {showQty && (
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs font-medium text-foreground">
                  How many {product.unitLabel ?? "units"}?
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {product.pricingModel === "SEAT_BASED" && product.includedUnits
                    ? `First ${product.includedUnits} included, then ${money(product.unitPrice ?? 0, currencySymbol)} each per year`
                    : product.pricingModel === "USAGE"
                      ? `${money(product.unitPrice ?? 0, currencySymbol)} per session-hour · free with your own Zoom or Meet`
                      : `${money(product.unitPrice ?? 0, currencySymbol)} each per year`}
                </p>
              </div>
              <Stepper
                value={selection?.quantity ?? product.includedUnits ?? product.minQuantity}
                min={product.pricingModel === "USAGE" ? 0 : product.minQuantity}
                onChange={(v) => onChange({ ...selection!, quantity: v })}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Stepper({
  value,
  min,
  onChange,
}: {
  value: number;
  min: number;
  onChange: (v: number) => void;
}) {
  return (
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
  );
}
