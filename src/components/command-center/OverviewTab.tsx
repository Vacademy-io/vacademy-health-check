import { useMemo, type ReactNode } from "react";
import { Building2, FileText, IndianRupee, Sparkles } from "lucide-react";
import { SectionErrorBoundary } from "@/components/shared/SectionErrorBoundary";
import { StatCard } from "@/components/shared/StatCard";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { buildTrials, stageCounts, summarizeRevenue, type Stage } from "@/lib/command-center";
import { formatInrMinor } from "@/lib/plans";
import { QUOTE_FETCH_LIMIT, useRecentQuotes, useStageTotals, useTaggedTrials } from "@/services/command-center-api";
import { useSubmissionCounts } from "@/services/onboarding-api";
import { useSubscriptions } from "@/services/plans-api";

const STAGE_ORDER: Stage[] = ["Lead", "Trial", "Paid", "Test", "Untagged"];
const STAGE_BAR: Record<Stage, string> = {
  Lead: "bg-sky-500",
  Trial: "bg-amber-500",
  Paid: "bg-emerald-500",
  Test: "bg-slate-400",
  Untagged: "bg-muted-foreground/30",
};

const n = (v: unknown) => Number(v) || 0;
const num = (v: number) => v.toLocaleString("en-IN");

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

const Loading = ({ h = "h-28" }: { h?: string }) => <Skeleton className={cn("w-full", h)} />;
const Failed = ({ what }: { what: string }) => <p className="rounded-md border border-destructive/40 p-3 text-xs text-destructive">Couldn't load {what}.</p>;

/**
 * Command Center › Overview: revenue, pipeline and stages. Platform totals (Dashboard), logins
 * (Analytics tab) and AI usage (AI Usage / Metering pages) are left to the pages that own them.
 */
export function OverviewTab() {
  const subs = useSubscriptions();
  const stages = useStageTotals();
  const quotes = useRecentQuotes();
  const tagged = useTaggedTrials();
  const submissions = useSubmissionCounts();

  const revenue = useMemo(() => (subs.data ? summarizeRevenue(subs.data) : null), [subs.data]);
  const counts = useMemo(() => (stages.data ? stageCounts(stages.data.total, stages.data.byTag) : null), [stages.data]);
  const trialCount = useMemo(
    () => buildTrials(quotes.data?.content ?? [], tagged.data?.content ?? [], subs.data ?? []).filter((t) => t.daysLeft === null || t.daysLeft >= 0).length,
    [quotes.data, tagged.data, subs.data]
  );

  const quoteRows = quotes.data?.content ?? [];
  const pipeline = [
    { label: "Onboarding forms", value: submissions.data ? Object.values(submissions.data).reduce((t, v) => t + n(v), 0) : null, hint: "submitted" },
    { label: "Quotes sent", value: quotes.data ? quoteRows.filter((q) => q.status === "SENT" || q.status === "AGREED").length : null, hint: "sent or agreed" },
    { label: "Quotes agreed", value: quotes.data ? quoteRows.filter((q) => q.status === "AGREED").length : null, hint: "agreed" },
    { label: "Demo workspaces", value: quotes.data ? quoteRows.filter((q) => q.provisionedInstituteId).length : null, hint: "provisioned" },
    { label: "On trial now", value: quotes.data && tagged.data && subs.data ? trialCount : null, hint: "not expired" },
    { label: "Paying", value: revenue ? revenue.payingInstitutes : null, hint: "subscription paid" },
  ];
  const quotesCapped = (quotes.data?.totalElements ?? 0) > QUOTE_FETCH_LIMIT;

  return (
    <div className="space-y-8">
      <Section title="Revenue" description="From platform billing (AI plan subscriptions). See the Revenue tab for detail.">
        {subs.isLoading ? <Loading /> : subs.isError || !revenue ? <Failed what="subscriptions" /> : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard title="MRR" value={formatInrMinor(revenue.mrrMinor)} description="Paid subscriptions, annual ÷ 12" icon={IndianRupee} />
            <StatCard title="Paying institutes" value={revenue.payingInstitutes} description="Current period paid" icon={Building2} />
            <StatCard title="Awaiting payment" value={formatInrMinor(revenue.dueMinor)} description={`${revenue.dueCount} not collected yet`} icon={FileText} />
            <StatCard title="On trial" value={quotes.data && tagged.data ? trialCount : "…"} description="Demo, tagged or AI plan trial" icon={Sparkles} />
          </div>
        )}
      </Section>

      <SectionErrorBoundary title="Pipeline">
        <Section
          title="Pipeline"
          description="Counts from each step's own source, all time. Not a cohort funnel: the same institute isn't followed from step to step yet (plan v2, Phase 3)."
        >
          <Card>
            <CardContent className="grid grid-cols-2 gap-px overflow-hidden rounded-lg bg-border p-0 sm:grid-cols-3 lg:grid-cols-6">
              {pipeline.map((p, i) => (
                <div key={p.label} className="bg-card p-4">
                  <p className="text-[11px] font-medium text-muted-foreground">
                    {i + 1}. {p.label}
                  </p>
                  <p className="mt-1 text-2xl font-bold tabular-nums">{p.value === null ? "…" : num(p.value)}</p>
                  <p className="text-[11px] text-muted-foreground">{p.hint}</p>
                </div>
              ))}
            </CardContent>
          </Card>
          {quotesCapped && <p className="text-[11px] text-muted-foreground">Quote steps count the newest {QUOTE_FETCH_LIMIT} quotes.</p>}
        </Section>
      </SectionErrorBoundary>

      <SectionErrorBoundary title="Stages">
        <Section title="Institutes by stage" description="From lead tags. Untagged = institutes nobody has tagged yet.">
          {stages.isLoading ? <Loading h="h-20" /> : stages.isError || !counts || !stages.data ? <Failed what="stage counts" /> : (
            <Card>
              <CardContent className="space-y-3 p-4">
                <div className="flex h-3 overflow-hidden rounded-full bg-muted" role="img" aria-label="Institutes by stage">
                  {STAGE_ORDER.map((s) =>
                    counts[s] > 0 ? <div key={s} className={STAGE_BAR[s]} style={{ width: `${(counts[s] / Math.max(1, stages.data!.total)) * 100}%` }} title={`${s}: ${counts[s]}`} /> : null
                  )}
                </div>
                <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                  {STAGE_ORDER.map((s) => (
                    <div key={s} className="flex items-center gap-2">
                      <span className={cn("h-2.5 w-2.5 rounded-sm", STAGE_BAR[s])} />
                      <span className="text-muted-foreground">{s}</span>
                      <span className="font-semibold tabular-nums">{num(counts[s])}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </Section>
      </SectionErrorBoundary>
    </div>
  );
}
