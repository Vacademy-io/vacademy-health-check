import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatDay } from "@/lib/plans";
import {
  buildConversions,
  CONVERSION_STEP_LABEL,
  CONVERSION_STEPS,
  PRODUCT_LABELS,
  productName,
  summarizeConversions,
  toCsv,
  type ConversionRow,
  type ConversionStep,
  type ConversionSummary,
} from "@/lib/pm-view";
import { useGaReport } from "@/services/ga-api";
import { Pager, usePaged } from "./Pager";
import { downloadText, usePmData } from "./use-pm-data";

const PERIODS = [
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: 180, label: "6 months" },
  { days: 0, label: "All time" },
] as const;
const num = (v: number) => v.toLocaleString("en-IN");
const pct = (a: number, b: number) => (b > 0 ? `${((a / b) * 100).toFixed(1)}%` : "—");
const STEP_TONE: Record<ConversionStep, string> = {
  REQUESTED: "bg-muted text-foreground",
  TRIAL: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  USING: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  PAID: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
};
type StepFilter = ConversionStep | "LOST" | "ALL";

function SummaryTable({ title, description, rows }: { title: string; description: string; rows: ConversionSummary[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{title}</CardTitle>
        <CardDescription className="text-xs">{description}</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
        {rows.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-muted-foreground">No demo requests in this period.</p>
        ) : (
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-y text-xs text-muted-foreground">
                <th className="px-4 py-2 text-left font-medium">{title.startsWith("By source") ? "Source" : "Product"}</th>
                <th className="px-2 py-2 text-right font-medium">Requests</th>
                <th className="px-2 py-2 text-right font-medium">Got a trial</th>
                <th className="px-2 py-2 text-right font-medium">Used it</th>
                <th className="px-2 py-2 text-right font-medium">Paying</th>
                <th className="px-2 py-2 text-right font-medium">Request → paid</th>
                <th className="px-4 py-2 text-right font-medium">Days to pay</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.name} className="border-b last:border-0">
                  <td className={cn("px-4 py-1.5", (r.name === "Not recorded" || r.name === "Product not set") && "text-muted-foreground")}>{r.name}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{num(r.requests)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{num(r.trials)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{num(r.using)}</td>
                  <td className="px-2 py-1.5 text-right font-medium tabular-nums">{num(r.paid)}</td>
                  <td className={cn("px-2 py-1.5 text-right tabular-nums", r.paid > 0 && "font-medium text-emerald-600")}>{r.rate === null ? "—" : `${r.rate}%`}</td>
                  <td className="px-4 py-1.5 text-right tabular-nums text-muted-foreground">{r.medianDaysToPaid === null ? "—" : `${r.medianDaysToPaid}d`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

/** PM View › Conversions: who asked for a demo, who got a trial, who is using it, who pays, and from which source. */
export function ConversionsTab({ onOpenAccount }: { onOpenAccount: (id: string) => void }) {
  const data = usePmData();
  const [period, setPeriod] = useState<number>(90);
  const [product, setProduct] = useState("all");
  const [step, setStep] = useState<StepFilter>("ALL");
  const [search, setSearch] = useState("");
  const ga = useGaReport(period === 30 ? 30 : 90);

  const all = useMemo(() => buildConversions(data.accounts, data.quotes), [data.accounts, data.quotes]);
  const from = useMemo(() => {
    if (!period) return "";
    const d = new Date();
    d.setDate(d.getDate() - (period - 1));
    return d.toISOString().slice(0, 10);
  }, [period]);
  const inPeriod = useMemo(
    () => all.filter((r) => (!from || r.requestedAt.slice(0, 10) >= from) && (product === "all" || r.products.includes(product))),
    [all, from, product]
  );
  const total = summarizeConversions(inPeriod, () => ["all"])[0];
  const bySource = useMemo(() => summarizeConversions(inPeriod, (r) => [r.source]), [inPeriod]);
  const byProduct = useMemo(() => summarizeConversions(inPeriod, (r) => (r.products.length ? r.products.map(productName) : ["Product not set"])), [inPeriod]);

  const gaProducts = (ga.data?.configured ? ga.data.products.filter((p) => !p.error) : []).filter((p) => product === "all" || p.product === product);
  const demoClicks = gaProducts.reduce((t, p) => t + p.totals.leads, 0);

  const q = search.trim().toLowerCase();
  const list = inPeriod.filter(
    (r) => (step === "ALL" || (step === "LOST" ? r.lost : r.step === step && !r.lost)) && (!q || `${r.name} ${r.contact} ${r.source}`.toLowerCase().includes(q))
  );
  const paged = usePaged(list, 15, `${step}|${q}|${period}|${product}`);
  const stepCount = (s: StepFilter) => (s === "ALL" ? inPeriod.length : s === "LOST" ? inPeriod.filter((r) => r.lost).length : inPeriod.filter((r) => r.step === s && !r.lost).length);

  const exportCsv = () =>
    downloadText(
      `demo-to-paid-${data.today}.csv`,
      toCsv(
        ["Requested", "Institute / contact", "Contact", "Source", "Product", "Status", "Lost", "Paying since", "Days to pay", "Your last update"],
        list.map((r: ConversionRow) => [r.requestedAt.slice(0, 10), r.name, r.contact, r.source, r.products.map(productName).join(", "), CONVERSION_STEP_LABEL[r.step], r.lost ? "yes" : "", r.paidSince?.slice(0, 10) ?? "", r.daysToPaid ?? "", r.lastUpdate ?? ""])
      )
    );

  const funnel = [
    { label: "Demo clicks on websites", value: demoClicks, note: ga.data?.configured ? `Google Analytics lead events, last ${period === 30 ? 30 : 90} days` : "Google Analytics not connected", ga: true },
    { label: "Demo requests", value: total?.requests ?? 0, note: "Quotes + trial accounts" },
    { label: "Got a trial", value: total?.trials ?? 0, note: "Workspace created" },
    { label: "Used it", value: total?.using ?? 0, note: "Logged in or built something" },
    { label: "Paying", value: total?.paid ?? 0, note: total?.medianDaysToPaid != null ? `Typically ${total.medianDaysToPaid}d from request` : "Paid subscription" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Everyone who asked for a demo (website pricing page, onboarding form, or added by the team) and every trial account, followed through to paying. Use it to see which sources turn into real users.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-md border p-0.5" role="group" aria-label="Period">
            {PERIODS.map((p) => (
              <button key={p.days} type="button" aria-pressed={period === p.days} onClick={() => setPeriod(p.days)} className={cn("rounded px-3 py-1 text-xs font-medium", period === p.days ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent")}>
                {p.label}
              </button>
            ))}
          </div>
          <select value={product} onChange={(e) => setProduct(e.target.value)} className="h-8 rounded-md border bg-background px-2 text-xs" aria-label="Product">
            <option value="all">All products</option>
            {Object.keys(PRODUCT_LABELS).map((p) => <option key={p} value={p}>{productName(p)}</option>)}
          </select>
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download className="mr-1.5 h-4 w-4" /> Export
          </Button>
        </div>
      </div>

      {data.isLoading ? (
        <Skeleton className="h-28 w-full" />
      ) : (
        <div className="grid gap-2 sm:grid-cols-5">
          {funnel.map((s, i) => (
            <Card key={s.label} className={cn(s.ga && "border-dashed")}>
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className="text-2xl font-bold tabular-nums">{num(s.value)}</p>
                <p className="text-[11px] text-muted-foreground">{s.note}</p>
                {i > 1 && <p className="mt-1 text-xs font-medium text-primary">{pct(s.value, funnel[i - 1].value)} of previous step</p>}
                {i === 4 && <p className="text-xs font-medium text-emerald-600">{pct(s.value, funnel[1].value)} of requests</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <p className="-mt-3 text-[11px] text-muted-foreground">Website demo clicks are counted by Google Analytics and can't be matched to a person, so they're shown for context only. The funnel starts at demo requests.</p>

      <div className="grid gap-4 xl:grid-cols-2">
        <SummaryTable title="By source" description="Where the request came from. For trials without a quote, the lead source you set in the register." rows={bySource} />
        <SummaryTable title="By product" description="Product from the register, else from the quote." rows={byProduct} />
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {(["ALL", ...CONVERSION_STEPS, "LOST"] as StepFilter[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStep(s)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium",
                s === "ALL" || s === "LOST" ? "border" : STEP_TONE[s],
                step === s && (s === "ALL" || s === "LOST" ? "border-primary bg-primary text-primary-foreground" : "ring-2 ring-primary ring-offset-1")
              )}
            >
              {s === "ALL" ? "All" : s === "LOST" ? "Trial ended, not paying" : CONVERSION_STEP_LABEL[s]} {stepCount(s)}
            </button>
          ))}
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, contact, source…" className="ml-auto h-8 w-60" />
        </div>
        <Card>
          <CardContent className="overflow-x-auto p-0">
            {paged.total === 0 ? (
              <p className="p-8 text-center text-sm text-muted-foreground">No demo requests here.</p>
            ) : (
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                    <th className="px-4 py-2 text-left font-medium">Who</th>
                    <th className="px-3 py-2 text-left font-medium">Requested</th>
                    <th className="px-3 py-2 text-left font-medium">Product</th>
                    <th className="px-3 py-2 text-left font-medium">Where they are</th>
                    <th className="px-3 py-2 text-left font-medium">Paying since</th>
                    <th className="px-4 py-2 text-left font-medium">Your last update</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.items.map((r) => (
                    <tr key={r.key} onClick={() => r.instituteId && onOpenAccount(r.instituteId)} className={cn("border-b align-top last:border-0", r.instituteId && "cursor-pointer hover:bg-accent/40")}>
                      <td className="max-w-[15rem] px-4 py-2">
                        <p className="truncate font-medium">{r.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{r.contact || "—"}</p>
                      </td>
                      <td className="px-3 py-2 text-xs">
                        <p>{formatDay(r.requestedAt)}</p>
                        <p className="text-muted-foreground">{r.source}</p>
                      </td>
                      <td className="px-3 py-2 text-xs">{r.products.length ? r.products.map(productName).join(", ") : <span className="text-muted-foreground">Not set</span>}</td>
                      <td className="px-3 py-2 text-xs">
                        <span className={cn("inline-block rounded px-1.5 py-0.5 text-[11px] font-medium", STEP_TONE[r.step])}>{CONVERSION_STEP_LABEL[r.step]}</span>
                        {r.lost && <p className="mt-0.5 font-medium text-red-600">Trial ended, not paying</p>}
                      </td>
                      <td className="px-3 py-2 text-xs">{r.paidSince ? <>{formatDay(r.paidSince)}{r.daysToPaid !== null && <span className="block text-muted-foreground">{r.daysToPaid}d after request</span>}</> : "—"}</td>
                      <td className="max-w-[16rem] px-4 py-2 text-xs text-muted-foreground"><p className="line-clamp-2">{r.lastUpdate ?? "—"}</p></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
        <Pager {...paged} noun="requests" />
      </div>
    </div>
  );
}
