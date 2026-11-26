import { useMemo, useState } from "react";
import { AlertTriangle, ArrowDownWideNarrow, ArrowUpNarrowWide, Download, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatDay } from "@/lib/plans";
import { FEATURE_CATALOG } from "@/lib/pm-feature-catalog";
import { FEATURE_GROUPS, featureStats, secondaryOf, volumeOf, type FeatureGroup, type FeatureStat } from "@/lib/pm-features";
import { matchesProduct } from "@/lib/pm-insights";
import { PRODUCT_LABELS, productName, toCsv } from "@/lib/pm-view";
import { useFeatureData } from "@/services/pm-api";
import { Pager, usePaged } from "./Pager";
import { downloadText, usePmData } from "./use-pm-data";

const num = (v: number) => v.toLocaleString("en-IN", { maximumFractionDigits: 0 });
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const selectCls = "h-9 rounded-md border bg-background px-2 text-sm";

type ListView = "HIGHEST" | "LOWEST" | "STUCK" | "NOT_STARTED";

/** One feature as a card: its own volume (calls made, courses created …) leads. */
function FeatureCard({ s, active, onClick }: { s: FeatureStat; active: boolean; onClick: () => void }) {
  const top = s.ranking[0];
  const users = s.ranking.length;
  return (
    <button type="button" onClick={onClick} className={cn("rounded-lg border bg-card p-4 text-left transition-colors hover:border-primary/60", active && "border-primary ring-1 ring-primary")}>
      <p className="text-sm font-medium">{s.def.label}</p>
      {s.loaded ? (
        <>
          <p className="mt-1 text-3xl font-bold tabular-nums">{num(s.total)}</p>
          <p className="text-xs text-muted-foreground">{s.def.unit}</p>
          <div className="mt-3 space-y-0.5 text-xs">
            <p>
              <b className="tabular-nums">{num(s.total30)}</b> <span className="text-muted-foreground">in the last 30 days</span>
            </p>
            <p>
              <b className="tabular-nums">{num(s.totalSecondary)}</b> <span className="text-muted-foreground">{s.def.secondary}</span>
            </p>
            <p className="text-muted-foreground">
              {num(users)} institute{users === 1 ? "" : "s"}
              {users ? ` · avg ${num(s.total / users)} each` : ""}
              {s.stuck.length > 0 && <span className="text-amber-700 dark:text-amber-400"> · {num(s.stuck.length)} stuck</span>}
            </p>
            {top && top.value > 0 && (
              <p className="truncate text-muted-foreground" title={top.account.name}>
                Top: <span className="font-medium text-foreground">{top.account.name}</span> ({num(top.value)})
              </p>
            )}
          </div>
        </>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">Loading…</p>
      )}
    </button>
  );
}

/**
 * PM View › Feature usage: each product's features measured by their own volume (calls made,
 * courses created, assessments created …), with institutes ranked highest to lowest, plus who
 * started a feature and didn't finish. Read-only platform data.
 */
export function FeaturesTab({ onOpenAccount }: { onOpenAccount: (id: string) => void }) {
  const data = usePmData();
  const features = useFeatureData();
  const [group, setGroup] = useState<FeatureGroup>("LMS");
  const [product, setProduct] = useState("");
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [view, setView] = useState<ListView>("HIGHEST");

  const scoped = useMemo(() => data.accounts.filter((a) => matchesProduct(a, product)), [data.accounts, product]);
  const allStats = useMemo(() => featureStats(FEATURE_CATALOG, scoped, features.rows), [scoped, features.rows]);
  const stats = useMemo(() => allStats.filter((s) => s.def.group === group), [allStats, group]);
  const open = stats.find((s) => s.def.key === openKey) ?? stats[0] ?? null;

  const list = useMemo(() => {
    if (!open) return [];
    const rows = features.rows[open.def.key];
    const fromAccounts = (accts: FeatureStat["stuck"]) =>
      accts
        .map((a) => {
          const r = rows?.get(a.id);
          return { account: a, value: volumeOf(open.def, r), secondary: secondaryOf(open.def, r), d30: r?.d30 ?? 0, lastAt: r?.lastAt ?? null };
        })
        .sort((x, y) => String(y.lastAt ?? y.account.createdAt).localeCompare(String(x.lastAt ?? x.account.createdAt)));
    if (view === "HIGHEST") return open.ranking;
    if (view === "LOWEST") return [...open.ranking].reverse();
    return fromAccounts(view === "STUCK" ? open.stuck : open.notStarted);
  }, [open, view, features.rows]);
  const paged = usePaged(list, 20, `${open?.def.key}|${view}|${product}`);

  const exportCsv = () => {
    const header = ["Product area", "Feature", "Volume", "Measures", "Last 30 days", "Second count", "Second count measures", "Institutes using", "Stuck (started, didn't finish)", "Not started", "Top institute", "Top institute volume"];
    const rows = allStats.map((s) => [FEATURE_GROUPS.find((g) => g.key === s.def.group)?.label ?? s.def.group, s.def.label, s.total, s.def.unit, s.total30, s.totalSecondary, s.def.secondary, s.ranking.length, s.stuck.length, s.notStarted.length, s.ranking[0]?.account.name ?? "", s.ranking[0]?.value ?? ""]);
    const perInstitute = allStats.flatMap((s) => s.ranking.map((r, i) => [s.def.label, i + 1, r.account.name, r.account.id, r.value, s.def.unit, r.d30, r.secondary, s.def.secondary, r.lastAt?.slice(0, 10) ?? ""]));
    downloadText(
      `feature-usage-${data.today}.csv`,
      toCsv(header, [...rows, [], ["Feature", "Rank", "Institute", "Institute ID", "Volume", "Measures", "Last 30 days", "Second count", "Measures", "Last activity"], ...perInstitute])
    );
  };

  const VIEWS: { key: ListView; label: string; count: number }[] = open
    ? [
        { key: "HIGHEST", label: "Highest first", count: open.ranking.length },
        { key: "LOWEST", label: "Lowest first", count: open.ranking.length },
        { key: "STUCK", label: "Started, didn't finish", count: open.stuck.length },
        { key: "NOT_STARTED", label: "Not started", count: open.notStarted.length },
      ]
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Each feature measured by what it does: calls made, courses created, assessments created. Click a feature to rank institutes from highest to lowest, or to see who started and didn't finish. Test and internal accounts are left out.
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
              setOpenKey(null);
              setView("HIGHEST");
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
            <p className="font-medium">Some features couldn't be loaded and show as zero:</p>
            <ul className="mt-1 list-disc pl-4">{features.errors.map((e) => <li key={e}>{e}</li>)}</ul>
          </div>
        </div>
      )}

      {data.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-40" />)}</div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {stats.map((s) => (
              <FeatureCard
                key={s.def.key}
                s={s}
                active={open?.def.key === s.def.key}
                onClick={() => {
                  setOpenKey(s.def.key);
                  setView("HIGHEST");
                }}
              />
            ))}
          </div>

          {open && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  {open.def.label}: {num(open.total)} {open.def.unit}
                </CardTitle>
                <CardDescription>
                  {cap(open.def.unit)} per institute. Started = {open.def.started.toLowerCase()}; finished = {open.def.completed}.
                </CardDescription>
                <div className="flex flex-wrap gap-1.5 pt-2" role="group" aria-label="Institute list">
                  {VIEWS.map((v) => (
                    <button
                      key={v.key}
                      type="button"
                      aria-pressed={view === v.key}
                      onClick={() => setView(v.key)}
                      className={cn("inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium", view === v.key ? "border-primary bg-primary/10" : "hover:bg-accent", v.key === "STUCK" && v.count > 0 && "text-amber-700 dark:text-amber-400")}
                    >
                      {v.key === "HIGHEST" && <ArrowDownWideNarrow className="h-3.5 w-3.5" />}
                      {v.key === "LOWEST" && <ArrowUpNarrowWide className="h-3.5 w-3.5" />}
                      {v.label} <span className="text-muted-foreground">({num(v.count)})</span>
                    </button>
                  ))}
                </div>
              </CardHeader>
              <CardContent className="overflow-x-auto p-0">
                {list.length === 0 ? (
                  <p className="px-4 py-6 text-sm text-muted-foreground">{open.loaded ? "No institutes here." : "Still loading…"}</p>
                ) : (
                  <table className="w-full min-w-[640px] text-sm">
                    <thead>
                      <tr className="border-y text-xs text-muted-foreground">
                        <th className="w-10 px-4 py-2 text-left font-medium">#</th>
                        <th className="px-2 py-2 text-left font-medium">Institute</th>
                        <th className="px-2 py-2 text-right font-medium">{cap(open.def.unit)}</th>
                        <th className="px-2 py-2 text-right font-medium">Last 30 days</th>
                        <th className="px-2 py-2 text-right font-medium">{cap(open.def.secondary)}</th>
                        <th className="px-4 py-2 text-right font-medium">Last activity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paged.items.map((r, i) => (
                        <tr key={r.account.id} onClick={() => onOpenAccount(r.account.id)} className="cursor-pointer border-b last:border-0 hover:bg-accent/40">
                          <td className="px-4 py-2 text-xs text-muted-foreground tabular-nums">{paged.page * paged.pageSize + i + 1}</td>
                          <td className="px-2 py-2">
                            <span className="font-medium">{r.account.name}</span>
                            <span className="ml-2 text-xs text-muted-foreground">{r.account.products.map(productName).join(", ")}</span>
                          </td>
                          <td className="px-2 py-2 text-right font-semibold tabular-nums">{num(r.value)}</td>
                          <td className="px-2 py-2 text-right tabular-nums">{num(r.d30)}</td>
                          <td className="px-2 py-2 text-right tabular-nums">{num(r.secondary)}</td>
                          <td className="px-4 py-2 text-right text-xs text-muted-foreground">{r.lastAt ? formatDay(r.lastAt) : `signed up ${formatDay(r.account.createdAt)}`}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {list.length > 0 && (
                  <div className="px-4 pb-3">
                    <Pager {...paged} noun="institutes" />
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
