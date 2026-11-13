import { Plus, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ProductPlan } from "@/services/products-api";
import { MAX_PLANS, plansProblem } from "./plans";

/**
 * The paid plans of a product, in one place: what its website shows (price, credits, users, length,
 * extra credit price) and, on Save, what its storefront sells (see ProductOnlineSale).
 */
export function ProductPlansSection({
  displayName,
  plans,
  months,
  extra,
  onChange,
  onlineSale,
  saveRow,
}: {
  displayName: string;
  plans: ProductPlan[] | null | undefined;
  months: number | null | undefined;
  extra: number | null | undefined;
  onChange: (patch: { plans?: ProductPlan[]; plan_validity_months?: number | null; extra_credit_price_inr?: number | null }) => void;
  /** What is on sale right now, and what Save will change there. */
  onlineSale?: ReactNode;
  saveRow: ReactNode;
}) {
  const list = plans ?? [];
  const setPlan = (i: number, patch: Partial<ProductPlan>) =>
    onChange({ plans: list.map((p, j) => (j === i ? { ...p, ...patch } : p)) });
  const num = (v: string) => (v === "" ? Number.NaN : Number(v));
  const problem = plansProblem(list, months, extra);

  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold">Plans</h3>
        <p className="text-xs text-muted-foreground">
          What {displayName} sells: its website shows these plans and buyers pay these prices. Prices are in rupees
          before GST, for one plan period. Change a price here and Save: the website and the checkout both follow.
        </p>
      </div>
      {list.map((plan, i) => (
        <div key={i} className="flex flex-wrap items-end gap-3 rounded-lg border p-3">
          <div className="w-36 space-y-1">
            <Label htmlFor={`plan-name-${i}`}>Name</Label>
            <Input id={`plan-name-${i}`} value={plan.name} onChange={(e) => setPlan(i, { name: e.target.value })} />
          </div>
          <div className="w-28 space-y-1">
            <Label htmlFor={`plan-key-${i}`}>Id</Label>
            <Input id={`plan-key-${i}`} value={plan.key} onChange={(e) => setPlan(i, { key: e.target.value })} />
          </div>
          <div className="w-32 space-y-1">
            <Label htmlFor={`plan-price-${i}`}>Price ₹</Label>
            <Input
              id={`plan-price-${i}`}
              type="number"
              min={0}
              value={Number.isNaN(plan.price_inr) ? "" : plan.price_inr}
              onChange={(e) => setPlan(i, { price_inr: num(e.target.value) })}
            />
          </div>
          <div className="w-28 space-y-1">
            <Label htmlFor={`plan-credits-${i}`}>AI credits</Label>
            <Input
              id={`plan-credits-${i}`}
              type="number"
              min={0}
              value={Number.isNaN(plan.credits) ? "" : plan.credits}
              onChange={(e) => setPlan(i, { credits: num(e.target.value) })}
            />
          </div>
          <div className="w-24 space-y-1">
            <Label htmlFor={`plan-users-${i}`}>Users</Label>
            <Input
              id={`plan-users-${i}`}
              type="number"
              min={1}
              value={Number.isNaN(plan.users) ? "" : plan.users}
              onChange={(e) => setPlan(i, { users: num(e.target.value) })}
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            aria-label={`Remove ${plan.name || "plan"}`}
            onClick={() => onChange({ plans: list.filter((_, j) => j !== i) })}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      {list.length < MAX_PLANS && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => onChange({ plans: [...list, { key: "", name: "", price_inr: 0, credits: 0, users: 1 }] })}
        >
          <Plus className="mr-1 h-4 w-4" /> Add plan
        </Button>
      )}
      <div className="grid max-w-lg gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="plan-months">Plan lasts (months)</Label>
          <Input
            id="plan-months"
            type="number"
            min={1}
            max={60}
            value={months ?? ""}
            onChange={(e) => onChange({ plan_validity_months: e.target.value === "" ? null : Number(e.target.value) })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="plan-extra">Extra credit price ₹</Label>
          <Input
            id="plan-extra"
            type="number"
            min={0}
            step="0.01"
            value={extra ?? ""}
            onChange={(e) =>
              onChange({ extra_credit_price_inr: e.target.value === "" ? null : Number(e.target.value) })
            }
          />
          <p className="text-xs text-muted-foreground">
            What the website says one more credit costs. Recharge prices themselves are the credit packs below.
          </p>
        </div>
      </div>
      {onlineSale}
      {problem && (
        <p role="alert" className="text-sm text-destructive">
          {problem}
        </p>
      )}
      {saveRow}
    </section>
  );
}
