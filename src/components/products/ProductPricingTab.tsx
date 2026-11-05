import { useEffect, useState } from "react";
import { AlertCircle, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToolPricing, useUpdateToolPricing } from "@/services/ai-settings-api";
import { useCreditPacks, useUpdateCreditPack, type CreditPack } from "@/services/products-api";
import type { ToolPricingEntry } from "@/types/ai-settings";
import { errorText } from "./errors";

const RATE_TOOL = "copy_check_evaluation";
const SYMBOL: Record<string, string> = { INR: "₹", USD: "$" };

function Saved({ text, error }: { text: string | null; error: string | null }) {
  if (error) {
    return (
      <p role="alert" className="flex items-center gap-1 text-sm text-destructive">
        <AlertCircle className="h-4 w-4 shrink-0" /> {error}
      </p>
    );
  }
  return text ? (
    <p role="status" className="flex items-center gap-1 text-sm text-muted-foreground">
      <Check className="h-4 w-4 shrink-0" /> {text}
    </p>
  ) : null;
}

/** What one page and one typed answer cost, in credits. */
function CheckingRate({ row }: { row: ToolPricingEntry }) {
  const answerRate = () => String(row.params?.typed_per_answer ?? "");
  const [page, setPage] = useState(String(row.per_unit_credits));
  const [answer, setAnswer] = useState(answerRate());
  const [reason, setReason] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const update = useUpdateToolPricing();

  useEffect(() => {
    setPage(String(row.per_unit_credits));
    setAnswer(String(row.params?.typed_per_answer ?? ""));
  }, [row]);

  const changed = Number(page) !== Number(row.per_unit_credits) || answer !== answerRate();
  const valid = Number(page) > 0 && Number(answer) > 0 && reason.trim().length > 0;

  const save = () => {
    setSaved(null);
    setError(null);
    update.mutate(
      {
        toolKey: RATE_TOOL,
        per_unit_credits: Number(page),
        params: { ...row.params, typed_per_answer: Number(answer) },
        reason: reason.trim(),
      },
      {
        onSuccess: () => {
          setReason("");
          setSaved("Saved. New checks use this rate.");
        },
        onError: (e) => setError(errorText(e)),
      }
    );
  };

  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold">Copy check rate</h3>
        <p className="text-xs text-muted-foreground">
          Applies to every institute on the platform, on every product, unless an institute has its own rate on the AI
          Settings page.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="rate-page">Credits per page</Label>
          <Input id="rate-page" type="number" min={0} step="0.1" value={page} onChange={(e) => setPage(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rate-answer">Credits per typed answer</Label>
          <Input
            id="rate-answer"
            type="number"
            min={0}
            step="0.1"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rate-reason">Why it is changing</Label>
          <Input id="rate-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={save} disabled={!changed || !valid || update.isPending}>
          {update.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save rate
        </Button>
        <Saved text={saved} error={error} />
      </div>
    </section>
  );
}

const toMajor = (minor: number) => String(minor / 100);

function PackRow({ pack }: { pack: CreditPack }) {
  const fresh = () => ({
    credits: String(pack.credits),
    active: pack.is_active,
    prices: Object.fromEntries(pack.prices.map((p) => [p.currency, toMajor(p.amount_minor)])),
  });
  const [form, setForm] = useState(fresh);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const update = useUpdateCreditPack();

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setForm(fresh()), [pack]);

  const dirty = JSON.stringify(form) !== JSON.stringify(fresh());
  const valid = Number(form.credits) >= 1 && Object.values(form.prices).every((v) => Number(v) > 0);

  const save = () => {
    setSaved(null);
    setError(null);
    update.mutate(
      {
        ...pack,
        credits: Number(form.credits),
        is_active: form.active,
        prices: pack.prices.map((p) => ({
          currency: p.currency,
          amount_minor: Math.round(Number(form.prices[p.currency]) * 100),
        })),
      },
      { onSuccess: () => setSaved("Saved."), onError: (e) => setError(errorText(e)) }
    );
  };

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-end gap-3">
        <p className="w-28 text-sm font-medium">{pack.name}</p>
        <div className="w-28 space-y-1">
          <Label htmlFor={`pack-credits-${pack.id}`}>Credits</Label>
          <Input
            id={`pack-credits-${pack.id}`}
            type="number"
            min={1}
            value={form.credits}
            onChange={(e) => setForm({ ...form, credits: e.target.value })}
          />
        </div>
        {pack.prices.map((price) => (
          <div key={price.currency} className="w-28 space-y-1">
            <Label htmlFor={`pack-${price.currency}-${pack.id}`}>
              {price.currency} {SYMBOL[price.currency] ?? ""}
            </Label>
            <Input
              id={`pack-${price.currency}-${pack.id}`}
              type="number"
              min={0}
              step="0.01"
              value={form.prices[price.currency] ?? ""}
              onChange={(e) =>
                setForm({ ...form, prices: { ...form.prices, [price.currency]: e.target.value } })
              }
            />
          </div>
        ))}
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input
            type="checkbox"
            aria-label={`${pack.name} on sale`}
            checked={form.active}
            onChange={(e) => setForm({ ...form, active: e.target.checked })}
          />
          On sale
        </label>
        <Button size="sm" onClick={save} disabled={!dirty || !valid || update.isPending}>
          {update.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save
        </Button>
      </div>
      <Saved text={saved} error={error} />
    </div>
  );
}

/** What checking costs in credits, and what credits cost in money. */
export function ProductPricingTab() {
  const pricing = useToolPricing();
  const packs = useCreditPacks();
  const rate = pricing.data?.tools.find((tool) => tool.tool_key === RATE_TOOL);

  return (
    <div className="space-y-6">
      {pricing.isLoading && <Skeleton className="h-28 w-full" />}
      {pricing.isError && (
        <p role="alert" className="text-sm text-destructive">
          The copy check rate could not be loaded.
        </p>
      )}
      {rate && <CheckingRate row={rate} />}

      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold">Credit packs</h3>
          <p className="text-xs text-muted-foreground">
            What customers pay to recharge, on every product. Prices exclude tax where the pack says so. Past purchases
            do not change.
          </p>
        </div>
        {packs.isLoading && <Skeleton className="h-40 w-full" />}
        {packs.isError && (
          <p role="alert" className="text-sm text-destructive">
            The credit packs could not be loaded.
          </p>
        )}
        {packs.data?.map((pack) => <PackRow key={pack.id} pack={pack} />)}
      </section>

      <p className="text-xs text-muted-foreground">
        The yearly plans on the product's website are in the website's own code, and are not changed from here.
      </p>
    </div>
  );
}
