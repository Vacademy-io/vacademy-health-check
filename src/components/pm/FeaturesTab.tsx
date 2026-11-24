import { useMemo, useState } from "react";
import { AlertTriangle, Download, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatDay } from "@/lib/plans";
import { FEATURE_CATALOG } from "@/lib/pm-feature-catalog";
import { byUsage, FEATURE_GROUPS, FEATURE_STATE_LABEL, featureStats, stuckRanking, type FeatureGroup, type FeatureState, type FeatureStat } from "@/lib/pm-features";
import { matchesProduct } from "@/lib/pm-insights";
import { PRODUCT_LABELS, productName, toCsv, type AccountRow } from "@/lib/pm-view";
import { useFeatureData } from "@/services/pm-api";
import { Pager, usePaged } from "./Pager";
import { downloadText, usePmData } from "./use-pm-data";

const num = (v: number) => v.toLocaleString("en-IN", { maximumFractionDigits: 0 });
const pct = (v: number) => `${Math.round(v * 100)}%`;
const selectCls = "h-9 rounded-md border bg-background px-2 text-sm";
const STATE_TONE: Record<FeatureState, string> = {
  COMPLETED: "bg-emerald-500",
  STUCK: "bg-amber-500",
  NOT_STARTED: "bg-muted-foreground/25",
};

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-2xl font-bold">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

/** Three-part bar: using it / started but stuck / not started. */
function StateBar({ s }: { s: FeatureStat }) {
  if (!s.base) return null;
  const part = (n: number) => `${(n / s.base) * 100}%`;
  return (
    <div className="flex h-2 w-full overflow-hidden rounded bg-muted" aria-hidden>
      <div className={STATE_TONE.COMPLETED} style={{ width: part(s.completed.length) }} />
      <div className={STATE_TONE.STUCK} style={{ width: part(s.stuck.length) }} />
    </div>
  );
}

/**
 * PM View › Feature usage: each product's features, how many institutes use each one, who started
 * and didn't finish, and who never started. Read-only platform data.
 */
export function FeaturesTab({ onOpenAccount }: { onOpenAccount: (id: string) => void }) {
  const data = usePmData();
  const features = useFeatureData();
  const [group, setGroup] = useState<FeatureGroup>("LMS");
  const [product, setProduct] = useState("");
  const [open, setOpen] = useState<{ key: string; state: FeatureState } | null>(null);

  const scoped = useMemo(() => data.accounts.filter((a) => matchesProduct(a, product)), [data.accounts, product]);
  const allStats = useMemo(() => featureStats(FEATURE_CATALOG, scoped, features.rows), [scoped, features.rows]);
  const stats = useMemo(() => allStats.filter((s) => s.def.group === group).sort(byUsage), [allStats, group]);
  const loaded = useMemo(() => stats.filter((s) => s.loaded), [stats]);
  const mostUsed = loaded[0] ?? null;
  const leastUsed = loaded.length > 1 ? loaded[loaded.length - 1] : null;
  const stuckTop = stuckRanking(loaded)[0] ?? null;
  const anyUse = useMemo(() => {
    const ids = new Set<string>();
    for (const s of loaded) for (const a of s.completed) ids.add(a.id);
    return ids.size;
  }, [loaded]);
  const base = stats[0]?.base ?? 0;

  const openStat = open ? stats.find((s) => s.def.key === open.key) ?? null : null;
  const openList = useMemo((): AccountRow[] => {
    if (!open || !openStat) return [];
    const list = open.state === "COMPLETED" ? openStat.completed : open.state === "STUCK" ? openStat.stuck : openStat.notStarted;
    const rows = features.rows[openStat.def.key];
    return [...list].sort((a, b) => String(rows?.get(b.id)?.lastAt ?? b.createdAt).localeCompare(String(rows?.get(a.id)?.lastAt ?? a.createdAt)));
  }, [open, openStat, features.rows]);
  const sortedList = openList;
  const paged = usePaged(sortedList, 20, `${open?.key}|${open?.state}|${product}`);

  const exportCsv = () => {
    const header = ["Product area", "Feature", "Started means", "Finished means", "Institutes", "Using it", "Started, didn't finish", "Not started", "Active last 30 days", "Adoption", "Stuck rate"];
    const rows = allStats.map((s) => [FEATURE_GROUPS.find((g) => g.key === s.def.group)?.label ?? s.def.group, s.def.label, s.def.started, s.def.completed, s.base, s.completed.length, s.stuck.length, s.notStarted.length, s.active30, pct(s.adoption), pct(s.stuckRate)]);
    // Second block: every institute that started a feature and didn't finish, for follow-up.
    const stuckRows = allStats.flatMap((s) => s.stuck.map((a) => ["Stuck", s.def.label, a.name, a.id, a.email, a.products.map(productName).join(", "), features.rows[s.def.key]?.get(a.id)?.lastAt?.slice(0, 10) ?? "", "", "", "", ""]));
    downloadText(`feature-usage-${data.today}.csv`, toCsv(header, [...rows, [], ["", "Feature", "Institute", "Institute ID", "Email", "Product", "Last activity"], ...stuckRows]));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Every feature, institute by institute: <b className="text-emerald-700 dark:text-emerald-400">using it</b>, <b className="text-amber-700 dark:text-amber-400">started but didn't finish</b>, or <b>not started</b>. Test and internal accounts are left out. Click a number to see the institutes.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <select value={product} onChange={(e) => setProduct(e.target.value)} className={selectCls} aria-label="Product">
            <option value="">All products</option>
            {Object.keys(PRODUCT_LABELS).map((p) => <option key={p} value={p}>{productName(p)} institutes</option>)}
          </select>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={features.isLoading}>
            <Download className="mr-1.5 h-4 w-4" /> Export
          </Button>
          <Button variant="outline" size="sm" onClick={() => features.refetch()}>
            {features.isFetching ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />} Refresh
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Product area">
        {FEATURE_GROUPS.map((g) => (
          <button
            key={g.key}
            type="button"
            role="tab"
            aria-selected={group === g.key}
            onClick={() => {
              setGroup(g.key);
              setOpen(null);
            }}
            className={cn("rounded-full border px-3.5 py-1.5 text-sm font-medium", group === g.key ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent")}
            title={g.hint}
          >
            {g.label}
          </button>
        ))}
      </div>

      {features.errors.length > 0 && (
        <div className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">Some features couldn't be loaded and show as not started:</p>
            <ul className="mt-1 list-disc pl-4">{features.errors.map((e) => <li key={e}>{e}</li>)}</ul>
          </div>
        </div>
      )}

      {data.isLoading || (features.isLoading && loaded.length === 0) ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div>
          <Skeleton className="h-72" />
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi label="Institutes using any of these" value={`${num(anyUse)} of ${num(base)}`} sub={base ? `${pct(anyUse / base)} of institutes` : undefined} />
            <Kpi label="Most used" value={mostUsed?.def.label ?? "—"} sub={mostUsed ? `${num(mostUsed.completed.length)} institutes (${pct(mostUsed.adoption)})` : undefined} />
            <Kpi label="Least used" value={leastUsed?.def.label ?? "—"} sub={leastUsed ? `${num(leastUsed.completed.length)} institutes (${pct(leastUsed.adoption)})` : undefined} />
            <Kpi label="Where people get stuck most" value={stuckTop?.def.label ?? "—"} sub={stuckTop ? `${pct(stuckTop.stuckRate)} of those who tried didn't finish (${num(stuckTop.stuck.length)})` : "Nobody stuck yet"} />
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{FEATURE_GROUPS.find((g) => g.key === group)?.label}: every feature, most used first</CardTitle>
              <CardDescription>Hover a feature to see what “started” and “finished” mean for it.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-y text-xs text-muted-foreground">
                    <th className="px-4 py-2 text-left font-medium">Feature</th>
                    <th className="px-2 py-2 text-right font-medium">Using it</th>
                    <th className="px-2 py-2 text-right font-medium">Started, didn't finish</th>
                    <th className="px-2 py-2 text-right font-medium">Not started</th>
                    <th className="px-2 py-2 text-right font-medium">Active last 30 days</th>
                    <th className="w-40 px-4 py-2 text-left font-medium">Split</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.map((s, i) => {
                    const cell = (state: FeatureState, n: number, tone: string) => (
                      <button
                        type="button"
                        disabled={!n}
                        onClick={() => setOpen(open?.key === s.def.key && open.state === state ? null : { key: s.def.key, state })}
                        className={cn("rounded px-1.5 py-0.5 tabular-nums disabled:cursor-default", n ? "hover:bg-accent hover:underline" : "text-muted-foreground", open?.key === s.def.key && open.state === state && "bg-primary/10 font-semibold", tone)}
                      >
                        {s.loaded ? num(n) : "…"}
                      </button>
                    );
                    return (
                      <tr key={s.def.key} className={cn("border-b last:border-0", open?.key === s.def.key && "bg-primary/5")}>
                        <td className="px-4 py-2" title={`Started: ${s.def.started}\nFinished: ${s.def.completed}`}>
                          <p className="font-medium">
                            {s.def.label}
                            {s.loaded && i === 0 && s.completed.length > 0 && <span className="ml-1.5 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">MOST USED</span>}
                            {s.loaded && i === stats.length - 1 && stats.length > 1 && <span className="ml-1.5 rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">LEAST USED</span>}
                          </p>
                          <p className="text-xs text-muted-foreground">Finished = {s.def.completed}</p>
                        </td>
                        <td className="px-2 py-2 text-right">
                          {cell("COMPLETED", s.completed.length, "text-emerald-700 dark:text-emerald-400")} <span className="text-xs text-muted-foreground">{s.loaded ? pct(s.adoption) : ""}</span>
                        </td>
                        <td className="px-2 py-2 text-right">
                          {cell("STUCK", s.stuck.length, s.stuck.length ? "text-amber-700 dark:text-amber-400" : "")}
                          {s.loaded && s.stuck.length > 0 && <span className="text-xs text-muted-foreground"> {pct(s.stuckRate)} of tries</span>}
                        </td>
                        <td className="px-2 py-2 text-right">{cell("NOT_STARTED", s.notStarted.length, "")}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{s.loaded ? num(s.active30) : "…"}</td>
                        <td className="px-4 py-2">
                          <StateBar s={s} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>

          {openStat && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  {openStat.def.label}: {FEATURE_STATE_LABEL[open!.state].toLowerCase()} ({num(openList.length)})
                </CardTitle>
                <CardDescription>
                  {open!.state === "STUCK"
                    ? `They ${openStat.def.started.toLowerCase()}, but haven't yet ${openStat.def.completed.toLowerCase()}. Newest activity first: a good list to follow up.`
                    : open!.state === "NOT_STARTED"
                      ? `They haven't ${openStat.def.started.toLowerCase()} yet. Newest sign-ups first.`
                      : `Finished = ${openStat.def.completed}.`}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <ul className="divide-y text-sm">
                  {paged.items.map((a) => {
                    const r = features.rows[openStat.def.key]?.get(a.id);
                    return (
                      <li key={a.id}>
                        <button type="button" onClick={() => onOpenAccount(a.id)} className="flex w-full flex-wrap items-center justify-between gap-2 px-4 py-2 text-left hover:bg-accent/50">
                          <span className="min-w-0">
                            <span className="font-medium">{a.name}</span>
                            <span className="ml-2 text-xs text-muted-foreground">{a.products.map(productName).join(", ")}</span>
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {r?.lastAt ? `last activity ${formatDay(r.lastAt)}` : `signed up ${formatDay(a.createdAt)}`}
                            {r && r.started > 0 && ` · ${num(r.started)} started, ${num(r.completed)} finished`}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <div className="px-4 pb-3">
                  <Pager {...paged} noun="institutes" />
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
