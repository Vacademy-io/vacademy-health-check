import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Ban, Building2, Eye, Loader2, TriangleAlert } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { SectionErrorBoundary } from "@/components/shared/SectionErrorBoundary";
import { StatCard } from "@/components/shared/StatCard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { GlobalEnforceNote, LimitsSectionError, ModePill } from "@/components/institute-limits/LimitsTab";
import { cn } from "@/lib/utils";
import { validateInstituteId } from "@/lib/metering";
import { LIMITS_MODES, MODE_LABEL, overviewTotals } from "@/lib/limits";
import { useGlobalEnforce, useLimitsOverview } from "@/services/limits-api";
import type { LimitsOverviewRow } from "@/types/limits";

const FILTERS = ["ALL", ...LIMITS_MODES] as const;
type Filter = (typeof FILTERS)[number];

/** Super-admin view of every institute with an AI limits policy (no policy row = limits off, as today). */
export default function LimitsOverviewPage() {
  const overview = useLimitsOverview();
  const global = useGlobalEnforce(overview.data?.enforce_globally_enabled);
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>("ALL");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState("");
  const [openError, setOpenError] = useState<string | null>(null);

  const rows = overview.data?.institutes ?? [];
  const t = overviewTotals(rows);
  const q = search.trim().toLowerCase();
  const visible = rows.filter(
    (r) =>
      (filter === "ALL" || r.mode === filter) &&
      (q === "" || r.institute_id.toLowerCase().includes(q) || (r.institute_name ?? "").toLowerCase().includes(q))
  );

  const openInstitute = () => {
    const err = openId.trim() === "*" ? "Enter one institute id" : validateInstituteId(openId);
    if (err) {
      setOpenError(err);
      return;
    }
    navigate(`/institutes/${encodeURIComponent(openId.trim())}?tab=ai-limits`);
  };

  return (
    <div>
      <PageHeader
        title="AI limits"
        description="Institutes with an AI usage limits policy. An institute without one is never counted against a cap or blocked. Shadow logs what would have been blocked; Enforce refuses the call with 429 once a hard limit is reached. Limits never change what a call is charged."
        actions={
          <Button variant="outline" size="sm" onClick={() => overview.refetch()}>
            {overview.isFetching && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Refresh
          </Button>
        }
      />

      <div className="space-y-6">
        <GlobalEnforceNote enabled={global.enabled} known={global.known} />

        {overview.data && (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              title="Institutes with a policy"
              value={t.institutes}
              description={LIMITS_MODES.map((m) => `${t.byMode[m] ?? 0} ${MODE_LABEL[m].toLowerCase()}`).join(" · ")}
              icon={Building2}
            />
            <StatCard title="Blocked · 7 days" value={t.blocked_7d} description="Calls refused with 429 AI_USAGE_LIMIT" icon={Ban} className={t.blocked_7d > 0 ? "border-destructive/40" : undefined} />
            <StatCard title="Would block · 7 days" value={t.would_block_7d} description="Shadow mode: logged, let through" icon={Eye} className={t.would_block_7d > 0 ? "border-amber-500/50" : undefined} />
            <StatCard title="Overruns · 7 days" value={t.overrun_7d} description="A call finished past its hard limit" icon={TriangleAlert} />
          </div>
        )}

        <SectionErrorBoundary title="Institutes with limits">
          <Card>
            <CardHeader>
              <CardTitle>Institutes</CardTitle>
              <CardDescription>
                Open an institute's "AI limits" tab to change its policy, add platform caps or see its counters. To give a
                new institute a policy, open it by id.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              <div className="flex flex-wrap items-center gap-3">
                <div className="inline-flex rounded-md border p-0.5" role="group" aria-label="Mode filter">
                  {FILTERS.map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setFilter(f)}
                      aria-pressed={filter === f}
                      className={cn(
                        "rounded px-3 py-1 text-xs font-medium transition-colors",
                        filter === f ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
                      )}
                    >
                      {f === "ALL" ? "All" : MODE_LABEL[f]}
                    </button>
                  ))}
                </div>
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter by name or id" className="h-8 max-w-xs text-xs" aria-label="Filter institutes" />
                <form
                  className="ml-auto flex items-center gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    openInstitute();
                  }}
                >
                  <Input
                    value={openId}
                    onChange={(e) => {
                      setOpenId(e.target.value);
                      setOpenError(null);
                    }}
                    placeholder="Institute id"
                    className="h-8 w-72 font-mono text-xs"
                    aria-label="Institute id to open"
                  />
                  <Button type="submit" size="sm" variant="outline">
                    Open
                  </Button>
                </form>
              </div>
              {openError && <p className="text-right text-xs text-destructive">{openError}</p>}

              {overview.isLoading ? (
                <Skeleton className="h-40 w-full" />
              ) : overview.isError ? (
                <LimitsSectionError error={overview.error} what="overview" onRetry={() => overview.refetch()} />
              ) : (
                <OverviewTable rows={visible} total={rows.length} globalEnforce={global.enabled} />
              )}
            </CardContent>
          </Card>
        </SectionErrorBoundary>
      </div>
    </div>
  );
}

function OverviewTable({ rows, total, globalEnforce }: { rows: LimitsOverviewRow[]; total: number; globalEnforce: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th className="py-2 pr-3 font-medium">Institute</th>
            <th className="px-2 py-2 font-medium">Mode</th>
            <th className="px-2 py-2 font-medium">Admins may enforce</th>
            <th className="px-2 py-2 text-right font-medium">Institute rows</th>
            <th className="px-2 py-2 text-right font-medium">Platform rows</th>
            <th className="px-2 py-2 text-right font-medium">Would block 7d</th>
            <th className="px-2 py-2 text-right font-medium">Blocked 7d</th>
            <th className="py-2 pl-2 text-right font-medium">Overrun 7d</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.institute_id} className="border-b last:border-0">
              <td className="py-2 pr-3">
                <Link to={`/institutes/${encodeURIComponent(r.institute_id)}?tab=ai-limits`} className="font-medium hover:underline">
                  {r.institute_name ?? r.institute_id}
                </Link>
                {r.institute_name && <p className="font-mono text-[11px] text-muted-foreground">{r.institute_id}</p>}
              </td>
              <td className="px-2 py-2">
                <ModePill mode={r.mode} globalEnforce={globalEnforce} />
              </td>
              <td className="px-2 py-2 text-xs">{r.tenant_may_enforce ? "Yes" : <span className="text-muted-foreground">No</span>}</td>
              <td className="px-2 py-2 text-right tabular-nums">{r.rows.toLocaleString()}</td>
              <td className="px-2 py-2 text-right tabular-nums">{r.platform_rows.toLocaleString()}</td>
              <td className={cn("px-2 py-2 text-right tabular-nums", r.would_block_7d > 0 && "font-semibold text-amber-700 dark:text-amber-300")}>
                {r.would_block_7d.toLocaleString()}
              </td>
              <td className={cn("px-2 py-2 text-right tabular-nums", r.blocked_7d > 0 && "font-semibold text-destructive")}>{r.blocked_7d.toLocaleString()}</td>
              <td className="py-2 pl-2 text-right tabular-nums">{r.overrun_7d.toLocaleString()}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={8} className="py-6 text-center text-xs text-muted-foreground">
                {total === 0 ? "No institute has a limits policy yet, so AI usage is not capped anywhere." : "No institute matches."}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
