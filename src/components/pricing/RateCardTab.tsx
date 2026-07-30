import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  adminListPlans,
  adminListProducts,
  adminListSettings,
  adminSavePlan,
  adminSaveProduct,
  adminSaveSetting,
  type AdminPlan,
  type AdminProduct,
} from "@/services/pricing-api";

const MODEL_HELP: Record<string, string> = {
  PER_LEARNER_TIER: "Price is per learner per year; the plan's learner count multiplies it.",
  FLAT_ANNUAL: "Price is the yearly charge.",
  ONE_TIME: "Price is charged once.",
  SEAT_BASED: "Base price covers the included seats; extras cost the unit price each.",
  COUNT_BASED: "Unit price × however many they ask for, per year.",
  USAGE: "Unit price × usage per month × 12.",
};

/**
 * Edits the live rate card. Everything here writes straight to the database, so a price change
 * takes effect on the next quote — no deploy.
 */
export function RateCardTab() {
  const { data: products, isLoading, isError } = useQuery({
    queryKey: ["pricing", "admin", "products"],
    queryFn: adminListProducts,
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError || !products) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        Couldn't load the rate card. The pricing backend may not be deployed yet.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <SettingsPanel />

      <div>
        <h3 className="mb-1 text-sm font-semibold">Products & plans</h3>
        <p className="mb-3 text-xs text-muted-foreground">
          Changes save immediately and apply to the next quote built. Existing quotes keep the
          prices they were saved with.
        </p>
        <div className="space-y-2">
          {products.map((p) => (
            <ProductRow key={p.id} product={p} />
          ))}
        </div>
      </div>
    </div>
  );
}

/** GST, FX and the billing-cycle multipliers. */
function SettingsPanel() {
  const qc = useQueryClient();
  const { data: settings } = useQuery({
    queryKey: ["pricing", "admin", "settings"],
    queryFn: adminListSettings,
  });
  const save = useMutation({
    mutationFn: adminSaveSetting,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pricing", "admin", "settings"] }),
  });

  if (!settings) return null;

  return (
    <div className="rounded-lg border p-4">
      <h3 className="mb-1 text-sm font-semibold">Commercial terms</h3>
      <p className="mb-3 text-xs text-muted-foreground">
        Multipliers apply to the recurring subtotal. 1.20 adds 20%, 0.85 takes 15% off.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {settings.map((s) => (
          <SettingField key={s.key} setting={s} onSave={(value) => save.mutate({ ...s, value })} />
        ))}
      </div>
    </div>
  );
}

function SettingField({
  setting,
  onSave,
}: {
  setting: { key: string; value: string; label?: string };
  onSave: (value: string) => void;
}) {
  const [value, setValue] = useState(setting.value);
  const dirty = value !== setting.value;
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium">{setting.label ?? setting.key}</label>
      <div className="flex gap-1.5">
        <Input value={value} onChange={(e) => setValue(e.target.value)} className="h-8 text-sm" />
        <Button size="sm" variant={dirty ? "default" : "outline"} disabled={!dirty} onClick={() => onSave(value)}>
          {dirty ? "Save" : <Check className="h-3.5 w-3.5" />}
        </Button>
      </div>
    </div>
  );
}

function ProductRow({ product }: { product: AdminProduct }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();

  const { data: plans } = useQuery({
    queryKey: ["pricing", "admin", "plans", product.code],
    queryFn: () => adminListPlans(product.code),
    enabled: open,
  });

  const saveProduct = useMutation({
    mutationFn: adminSaveProduct,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pricing", "admin", "products"] }),
  });

  return (
    <div className={cn("rounded-lg border", !product.active && "opacity-60")}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-3 p-3 text-left"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <span className="flex-1">
          <span className="text-sm font-medium">{product.name}</span>
          <span className="ml-2 text-xs text-muted-foreground">{product.code}</span>
        </span>
        <span className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">
          {product.pricingModel.replace(/_/g, " ").toLowerCase()}
        </span>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[11px] font-medium",
            product.active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"
          )}
        >
          {product.active ? "Active" : "Hidden"}
        </span>
      </button>

      {open && (
        <div className="space-y-4 border-t p-4">
          <p className="text-xs text-muted-foreground">{MODEL_HELP[product.pricingModel]}</p>

          {/* Product-level knobs, only the ones the model actually uses. */}
          {(product.pricingModel === "SEAT_BASED" ||
            product.pricingModel === "COUNT_BASED" ||
            product.pricingModel === "USAGE") && (
            <ProductKnobs product={product} onSave={(next) => saveProduct.mutate(next)} />
          )}

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Plans
            </p>
            {!plans ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : plans.length === 0 ? (
              <p className="text-sm text-muted-foreground">No plans configured.</p>
            ) : (
              <div className="space-y-1.5">
                {plans.map((pl) => (
                  <PlanRow key={pl.id} plan={pl} model={product.pricingModel} />
                ))}
              </div>
            )}
          </div>

          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={product.active}
              onChange={(e) => saveProduct.mutate({ ...product, active: e.target.checked })}
            />
            Show this product in the plan builder
          </label>
        </div>
      )}
    </div>
  );
}

function ProductKnobs({
  product,
  onSave,
}: {
  product: AdminProduct;
  onSave: (next: AdminProduct) => void;
}) {
  const [base, setBase] = useState(product.basePrice?.toString() ?? "");
  const [unit, setUnit] = useState(product.unitPrice?.toString() ?? "");
  const [included, setIncluded] = useState(product.includedUnits?.toString() ?? "");
  const dirty =
    base !== (product.basePrice?.toString() ?? "") ||
    unit !== (product.unitPrice?.toString() ?? "") ||
    included !== (product.includedUnits?.toString() ?? "");

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-md bg-muted/40 p-3">
      {product.pricingModel === "SEAT_BASED" && (
        <Field label="Base price / year" value={base} onChange={setBase} />
      )}
      <Field label="Unit price" value={unit} onChange={setUnit} />
      {product.pricingModel === "SEAT_BASED" && (
        <Field label="Included units" value={included} onChange={setIncluded} />
      )}
      <Button
        size="sm"
        disabled={!dirty}
        onClick={() =>
          onSave({
            ...product,
            basePrice: base === "" ? undefined : Number(base),
            unitPrice: unit === "" ? undefined : Number(unit),
            includedUnits: included === "" ? undefined : Number(included),
          })
        }
      >
        Save
      </Button>
    </div>
  );
}

function PlanRow({ plan, model }: { plan: AdminPlan; model: string }) {
  const qc = useQueryClient();
  const [price, setPrice] = useState(plan.price.toString());
  const [name, setName] = useState(plan.name);
  const save = useMutation({
    mutationFn: adminSavePlan,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pricing", "admin", "plans", plan.productCode] }),
  });
  const dirty = price !== plan.price.toString() || name !== plan.name;

  const annual =
    model === "PER_LEARNER_TIER" && plan.unitCount
      ? Number(price) * plan.unitCount
      : Number(price);

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-md border p-2.5">
      <div className="w-40 space-y-1">
        <label className="text-[11px] text-muted-foreground">Name</label>
        <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 text-sm" />
      </div>
      {plan.unitCount != null && (
        <div className="w-28 space-y-1">
          <label className="text-[11px] text-muted-foreground">Learners</label>
          <Input value={plan.unitCount} readOnly className="h-8 bg-muted/50 text-sm" />
        </div>
      )}
      <div className="w-32 space-y-1">
        <label className="text-[11px] text-muted-foreground">
          {model === "PER_LEARNER_TIER" ? "₹ / learner / yr" : "Price"}
        </label>
        <Input value={price} onChange={(e) => setPrice(e.target.value)} className="h-8 text-sm tabular-nums" />
      </div>
      {model === "PER_LEARNER_TIER" && plan.unitCount != null && (
        <p className="pb-1.5 text-xs text-muted-foreground">
          = ₹{annual.toLocaleString("en-IN")} / year
        </p>
      )}
      <Button
        size="sm"
        variant={dirty ? "default" : "outline"}
        disabled={!dirty || save.isPending}
        onClick={() => save.mutate({ ...plan, name, price: Number(price) })}
        className="ml-auto"
      >
        {save.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : dirty ? "Save" : "Saved"}
      </Button>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="w-36 space-y-1">
      <label className="text-[11px] text-muted-foreground">{label}</label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} className="h-8 text-sm tabular-nums" />
    </div>
  );
}
