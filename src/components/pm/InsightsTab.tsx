import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, Download, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatDay } from "@/lib/plans";
import {
  accountSignal,
  biggestDrop,
  buildFunnel,
  churnSummary,
  cohort,
  featureAdoption,
  matchesProduct,
  signupsByWeek,
  toolLabel,
  type AccountSignal,
  type FunnelKey,
} from "@/lib/pm-insights";
import { isTestAccount, PRODUCT_LABELS, productName, toCsv, type AccountRow } from "@/lib/pm-view";
import { useInstituteSignals } from "@/services/pm-api";
import { downloadText, usePmData } from "./use-pm-data";
import { PeriodPicker } from "./PeriodPicker";
import { previousRange, resolvePeriod, type Period } from "@/lib/pm-range";

const WINDOWS = [30, 90, 180, 365] as const;
const num = (v: number) => v.toLocaleString("en-IN", { maximumFractionDigits: 0 });
const pctText = (v: number) => `${Math.round(v * 100)}%`;
const share = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "—");
const inr = (v: number) => `₹${Math.round(v).toLocaleString("en-IN")}`;
const shortDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
const TOOLTIP = { background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 };
const selectCls = "h-9 rounded-md border bg-background px-2 text-sm";

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-3xl font-bold tabular-nums">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function Question({ n, title, description, children }: { n: number; title: string; description: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          <span className="mr-2 text-muted-foreground">{n}.</span>
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/**
 * PM View › Product insights: the seven growth questions, answered from platform data (read-only)
 * plus your own Lost reasons from the PM store.
 */
export function InsightsTab({ onOpenAccount }: { onOpenAccount: (id: string) => void }) {
  const data = usePmData();
  const signals = useInstituteSignals();
  const [period, setPeriod] = useState<Period>({ kind: "preset", days: 90 });
  const [product, setProduct] = useState("");
  const [openStep, setOpenStep] = useState<FunnelKey | null>(null);
  const today = data.today;
  const range = resolvePeriod(period, today);

  const sig = useMemo(() => {
    const byId = new Map<string, AccountSignal>(data.accounts.map((a) => [a.id, accountSignal(a, signals, today)]));
    return (a: AccountRow) => byId.get(a.id) ?? accountSignal(a, signals, today);
  }, [data.accounts, signals, today]);

  const scoped = useMemo(() => data.accounts.filter((a) => matchesProduct(a, product)), [data.accounts, product]);
  const signups = useMemo(() => cohort(data.accounts, { from: range.from, to: range.to }, product), [data.accounts, range.from, range.to, product]);
  const previous = useMemo(() => cohort(data.accounts, previousRange(range), product).length, [data.accounts, range, product]);
  const weeks = useMemo(() => signupsByWeek(scoped.filter((a) => !isTestAccount(a)), today, 12).map((w) => ({ ...w, label: shortDate(w.week) })), [scoped, today]);
  const funnel = useMemo(() => buildFunnel(signups, sig), [signups, sig]);
  const drop = biggestDrop(funnel);
  const adoption = useMemo(() => featureAdoption(scoped, sig), [scoped, sig]);
  const churn = useMemo(() => churnSummary(scoped, data.subs, { from: range.from, to: range.to }), [scoped, data.subs, range.from, range.to]);

  const real = scoped.filter((a) => !isTestAccount(a));
  const activeAll = real.filter((a) => sig(a).active30).length;
  const onboarded = funnel.find((s) => s.key === "students")?.count ?? 0;
  const active = funnel.find((s) => s.key === "active")?.count ?? 0;
  const stuck = openStep ? funnel.find((s) => s.key === openStep)?.stuck ?? [] : [];
  const loading = data.isLoading || (signals.isLoading && !signals.staff);

  const exportCsv = () =>
    downloadText(
      `product-insights-${range.from}-to-${range.to}.csv`,
      toCsv(
        ["Section", "Item", "Count", "Share", "Detail"],
        [
          ["Sign-ups", range.label, signups.length, "", `${previous} in the ${range.days} days before`],
          ...funnel.map((s) => ["Funnel", s.label, s.count, pctText(s.ofStart), `${s.stuck.length} stopped here`]),
          ...adoption.map((f) => ["Features", f.label, f.using, share(f.using, real.length), `Paying ${share(f.payingUsing, f.payingTotal)} vs non-paying ${share(f.freeUsing, f.freeTotal)}; revenue ${inr(f.revenue)}/month`]),
          ...(signals.aiTools ?? []).map((t) => ["AI tools (30 days)", toolLabel(t.request_type), t.requests, "", `${t.institutes} institutes`]),
          ...churn.reasons.map((r) => ["Why they left", r.label, r.count, share(r.count, churn.lostTotal), ""]),
          ...[...churn.plansEnded, ...churn.cancelling, ...churn.trialsLost].map((c) => ["Cancellations", c.name, 1, "", `${c.what}${c.reason ? ` — ${c.reason}` : ""}`]),
        ]
      )
    );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Seven growth questions, answered from platform data (read-only). Test and internal accounts are left out. Click a funnel step to see who stopped there.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <select value={product} onChange={(e) => setProduct(e.target.value)} className={selectCls} aria-label="Product">
            <option value="">All products</option>
            {Object.keys(PRODUCT_LABELS).map((p) => <option key={p} value={p}>{productName(p)}</option>)}
            <option value="NONE">Product not set</option>
          </select>
          <PeriodPicker presets={WINDOWS} value={period} onChange={setPeriod} today={today} />
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={loading}>
            <Download className="mr-1.5 h-4 w-4" /> Export
          </Button>
          <Button variant="outline" size="sm" onClick={() => { data.refetch(); signals.refetch(); }}>
            {signals.isLoading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />} Refresh
          </Button>
        </div>
      </div>

      {signals.errors.length > 0 && (
        <div className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">Some usage data couldn't be loaded, so those numbers may be low:</p>
            <ul className="mt-1 list-disc pl-4">{signals.errors.map((e) => <li key={e}>{e}</li>)}</ul>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div>
          <Skeleton className="h-72" />
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi label="Signed up" value={num(signups.length)} sub={`${range.label} · ${previous} in the ${range.days} days before`} />
            <Kpi label="Completed onboarding" value={share(onboarded, signups.length)} sub={`${num(onboarded)} logged in, made a course and added students`} />
            <Kpi label="Actually using it" value={share(active, signups.length)} sub={`${num(active)} of the new sign-ups · ${num(activeAll)} of all ${num(real.length)} institutes`} />
            <Kpi label="Biggest drop-off" value={drop ? drop.label : "—"} sub={drop ? `${num(drop.stuck.length)} stopped before this step (${pctText(drop.dropFromPrev)})` : "No sign-ups in this period"} />
          </div>

          <Question n={1} title="How many institutes sign up?" description="New institutes per week, last 12 weeks.">
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weeks} margin={{ left: -20, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={TOOLTIP} formatter={(v) => [num(Number(v) || 0), "Sign-ups"]} labelFormatter={(l) => `Week of ${l}`} />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Question>

          <Question
            n={2}
            title="How many complete onboarding, use the product, and where do they drop off?"
            description={`Institutes that signed up ${range.custom ? `between ${range.label}` : `in the ${range.label}`}. Each step counts only those who also passed the steps above it.`}
          >
            <div className="space-y-2">
              {funnel.map((s, i) => {
                const isDrop = drop?.key === s.key;
                return (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => setOpenStep(openStep === s.key ? null : s.key)}
                    disabled={i === 0 || s.stuck.length === 0}
                    className={cn("block w-full rounded-md border p-2 text-left disabled:cursor-default", openStep === s.key ? "border-primary" : "hover:bg-accent/50")}
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                      <span className="font-medium">
                        {s.label} <span className="font-normal text-muted-foreground">· {s.hint}</span>
                      </span>
                      <span className="tabular-nums">
                        <b>{num(s.count)}</b> <span className="text-muted-foreground">({pctText(s.ofStart)})</span>
                        {i > 0 && s.stuck.length > 0 && <span className={cn("ml-2 text-xs", isDrop ? "font-semibold text-red-600" : "text-muted-foreground")}>−{num(s.stuck.length)} stopped</span>}
                      </span>
                    </div>
                    <div className="mt-1.5 h-2 rounded bg-muted">
                      <div className={cn("h-2 rounded", isDrop ? "bg-red-500" : "bg-primary")} style={{ width: `${Math.max(s.ofStart * 100, s.count ? 1 : 0)}%` }} />
                    </div>
                  </button>
                );
              })}
            </div>
            {openStep && stuck.length > 0 && (
              <div className="mt-4 rounded-md border">
                <p className="border-b bg-muted/50 px-3 py-2 text-xs font-medium">
                  {num(stuck.length)} stopped before “{funnel.find((s) => s.key === openStep)?.label}”{stuck.length > 25 ? " (newest 25)" : ""}
                </p>
                <ul className="divide-y text-sm">
                  {[...stuck].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 25).map((a) => (
                    <li key={a.id}>
                      <button type="button" onClick={() => onOpenAccount(a.id)} className="flex w-full justify-between gap-2 px-3 py-2 text-left hover:bg-accent/50">
                        <span className="truncate font-medium">{a.name}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">signed up {formatDay(a.createdAt)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Question>

          <Question
            n={3}
            title="Which features are used, and which ones paying customers use"
            description="All real institutes. “Paying vs non-paying” compares paying customers with non-paying institutes that logged in at least once. A big gap hints that a feature matters for paying, though it doesn't prove it."
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="py-2 pr-2 text-left font-medium">Feature</th>
                    <th className="px-2 py-2 text-right font-medium">Institutes using</th>
                    <th className="px-2 py-2 text-right font-medium">Used last 30 days</th>
                    <th className="px-2 py-2 text-right font-medium">Paying customers</th>
                    <th className="px-2 py-2 text-right font-medium">Non-paying</th>
                    <th className="py-2 pl-2 text-right font-medium">Revenue from users</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {adoption.map((f, i) => (
                    <tr key={f.key}>
                      <td className="py-2 pr-2">
                        <p className="font-medium">
                          {f.label}
                          {i === 0 && f.using > 0 && <span className="ml-1.5 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">MOST USED</span>}
                          {i === adoption.length - 1 && <span className="ml-1.5 rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">LEAST USED</span>}
                        </p>
                        <p className="text-xs text-muted-foreground">{f.hint}</p>
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">{num(f.using)} <span className="text-xs text-muted-foreground">({share(f.using, real.length)})</span></td>
                      <td className="px-2 py-2 text-right tabular-nums">{num(f.using30)}</td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        <b>{share(f.payingUsing, f.payingTotal)}</b> <span className="text-xs text-muted-foreground">{f.payingUsing}/{f.payingTotal}</span>
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {share(f.freeUsing, f.freeTotal)}
                        {f.payingTotal > 0 && f.freeTotal > 0 && Math.abs(f.lift) >= 10 && (
                          <span className={cn("ml-1 text-xs font-medium", f.lift > 0 ? "text-emerald-600" : "text-red-600")}>{f.lift > 0 ? "+" : ""}{f.lift} pts</span>
                        )}
                      </td>
                      <td className="py-2 pl-2 text-right tabular-nums">{f.revenue ? `${inr(f.revenue)}/mo` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {signals.aiTools && signals.aiTools.length > 0 && (
              <div className="mt-5">
                <p className="mb-2 text-sm font-medium">AI tools used, last 30 days</p>
                <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
                  {signals.aiTools.slice(0, 12).map((t) => (
                    <div key={t.request_type} className="flex justify-between border-b py-1 text-sm">
                      <span>{toolLabel(t.request_type)}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {num(t.requests)} uses · {num(t.institutes)} institutes
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <p className="mt-3 text-xs text-muted-foreground">Revenue is the platform plan's monthly value, or the price in your register when there's no platform plan.</p>
          </Question>

          <Question
            n={4}
            title="Why are institutes cancelling?"
            description={`${range.custom ? range.label : range.label.charAt(0).toUpperCase() + range.label.slice(1)}. The platform doesn't ask customers why they leave, so the reasons come from you: give an account the Lost label and pick “Why did they leave?” in its details.`}
          >
            <div className="grid gap-3 sm:grid-cols-3">
              <Kpi label="AI plans cancelled or expired" value={num(churn.plansEnded.length)} sub="and no other active plan" />
              <Kpi label="Set to cancel" value={num(churn.cancelling.length)} sub="active now, ends at period end" />
              <Kpi label="Trials ended without paying" value={num(churn.trialsLost.length)} />
            </div>
            <div className="mt-5 grid gap-6 lg:grid-cols-2">
              <div>
                <p className="mb-2 text-sm font-medium">Reasons you recorded ({num(churn.lostTotal)} Lost)</p>
                {churn.reasons.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No accounts have the Lost label yet.</p>
                ) : (
                  <div className="space-y-2">
                    {churn.reasons.map((r) => (
                      <div key={r.reason}>
                        <div className="flex justify-between text-sm">
                          <span className={r.reason === "NONE" ? "text-muted-foreground" : ""}>{r.label}</span>
                          <span className="tabular-nums">{num(r.count)} <span className="text-xs text-muted-foreground">({share(r.count, churn.lostTotal)})</span></span>
                        </div>
                        <div className="mt-1 h-1.5 rounded bg-muted">
                          <div className={cn("h-1.5 rounded", r.reason === "NONE" ? "bg-muted-foreground/40" : "bg-red-500")} style={{ width: share(r.count, churn.lostTotal) }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <p className="mb-2 text-sm font-medium">Who left or is leaving</p>
                {[...churn.cancelling, ...churn.plansEnded, ...churn.trialsLost].length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nobody in this period.</p>
                ) : (
                  <ul className="max-h-72 divide-y overflow-y-auto rounded-md border text-sm">
                    {[...churn.cancelling, ...churn.plansEnded, ...churn.trialsLost].map((c, i) => (
                      <li key={`${c.instituteId}-${i}`}>
                        <button type="button" onClick={() => onOpenAccount(c.instituteId)} className="w-full px-3 py-2 text-left hover:bg-accent/50">
                          <div className="flex justify-between gap-2">
                            <span className="truncate font-medium">{c.name}</span>
                            <span className="shrink-0 text-xs text-muted-foreground">{c.when ? formatDay(c.when) : ""}</span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {c.what}
                            {c.reason ? ` · “${c.reason}”` : " · no reason recorded"}
                          </p>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </Question>
        </>
      )}
    </div>
  );
}
