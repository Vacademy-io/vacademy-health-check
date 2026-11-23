import { useMemo, type ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowRight, BookOpen, Building2, CheckCircle2, Download, GraduationCap, IndianRupee, Loader2, PhoneCall, RefreshCw, Sparkles, Wifi } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatDay } from "@/lib/plans";
import { dashboardStats, isTestAccount, productName, toCsv, TRIAL_STAGE_LABEL, type QuickFilter, type TrialFilter, type TrialStage } from "@/lib/pm-view";
import { downloadText, usePmData } from "./use-pm-data";

const num = (v: number) => v.toLocaleString("en-IN", { maximumFractionDigits: 0 });
const shortDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
const TOOLTIP = { background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 };
const AXIS = { fontSize: 11 };
const STAGES: TrialStage[] = ["NOT_LOGGED_IN", "SETTING_UP", "BUILDING", "ACTIVE", "EXPIRED", "CONVERTED"];
const STAGE_BAR: Record<TrialStage, string> = {
  NOT_LOGGED_IN: "bg-red-500",
  SETTING_UP: "bg-amber-500",
  BUILDING: "bg-sky-500",
  ACTIVE: "bg-emerald-500",
  EXPIRED: "bg-muted-foreground/40",
  CONVERTED: "bg-violet-500",
};
const PLATFORM_STATUS: Record<string, string> = { PROD: "PROD tag", FREE_TRIAL: "Free trial", LEAD: "Lead", TEST: "Test" };

/** One headline number. Clicking it opens the list behind it. */
function Kpi({ icon: Icon, label, value, sub, onClick }: { icon: typeof Building2; label: string; value: string; sub: string; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} disabled={!onClick} className="group rounded-lg border bg-card p-4 text-left transition hover:border-primary/50 hover:shadow-sm disabled:cursor-default disabled:hover:border-border disabled:hover:shadow-none">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{label}</p>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <p className="mt-1 text-3xl font-bold tabular-nums">{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>
    </button>
  );
}

function AttentionRow({ count, text, tone, onClick }: { count: number; text: string; tone: "red" | "amber" | "sky"; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-4 px-4 py-3 text-left hover:bg-accent/50">
      <span className={cn("w-10 shrink-0 text-right text-2xl font-bold tabular-nums", tone === "red" ? "text-red-600" : tone === "amber" ? "text-amber-600" : "text-sky-600")}>{count}</span>
      <span className="flex-1 text-sm">{text}</span>
      <span className="flex items-center text-xs font-medium text-primary">
        View <ArrowRight className="ml-1 h-3.5 w-3.5" />
      </span>
    </button>
  );
}

function Panel({ title, description, action, children }: { title: string; description?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
        <div>
          <CardTitle className="text-base">{title}</CardTitle>
          {description && <CardDescription className="text-xs">{description}</CardDescription>}
        </div>
        {action}
      </CardHeader>
      <CardContent className="p-0">{children}</CardContent>
    </Card>
  );
}

interface Props {
  onOpenAccount: (id: string) => void;
  onOpenTrials: (filter: TrialFilter) => void;
  onOpenAccounts: (filters: QuickFilter[]) => void;
  onOpenCalls: () => void;
}

/** PM View › Dashboard: the numbers that matter, what needs attention, and the newest institutes. Test accounts are left out. */
export function DashboardTab({ onOpenAccount, onOpenTrials, onOpenAccounts, onOpenCalls }: Props) {
  const data = usePmData();
  const d = useMemo(() => dashboardStats(data.accounts, data.today), [data.accounts, data.today]);
  const newest = useMemo(() => data.accounts.filter((a) => !isTestAccount(a)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 8), [data.accounts]);
  const a = d.attention;
  const callers = useMemo(() => data.accounts.filter((x) => !isTestAccount(x) && (x.calls30?.calls ?? 0) > 0).sort((x, y) => y.calls30!.calls - x.calls30!.calls), [data.accounts]);
  const totalCalls = callers.reduce((t, x) => t + x.calls30!.calls, 0);
  const totalMinutes = callers.reduce((t, x) => t + x.calls30!.minutes, 0);
  const callsLoaded = data.accounts.some((x) => x.calls30 !== null);
  const attention = [
    { count: a.notLoggedIn, text: "trial accounts haven't logged in yet", tone: "red" as const, go: () => onOpenTrials("NOT_LOGGED_IN") },
    { count: a.endingIn3, text: "trials end in the next 3 days", tone: "red" as const, go: () => onOpenTrials("ENDING") },
    { count: a.noCourse, text: "trials logged in but haven't created a course", tone: "amber" as const, go: () => onOpenTrials("SETTING_UP") },
    { count: a.followUpsDue, text: "check-ins you planned are due", tone: "amber" as const, go: () => onOpenTrials("DUE") },
    { count: a.endedNotPaying, text: "trials ended in the last 2 weeks without paying", tone: "amber" as const, go: () => onOpenTrials("EXPIRED") },
    { count: a.lowCredits, text: "paying or trial accounts are low on AI credits", tone: "sky" as const, go: () => onOpenAccounts(["lowcredits"]) },
    { count: a.renewals30, text: "renewals in the next 30 days (from your records)", tone: "sky" as const, go: () => onOpenAccounts(["expiring"]) },
  ].filter((x) => x.count > 0);
  const stageMax = Math.max(1, ...STAGES.map((s) => d.trialStages[s]));
  const weekly = d.weekly.map((w) => ({ ...w, label: shortDate(w.week) }));
  const weekDelta = d.newThisWeek - d.newLastWeek;

  const exportSummary = () => {
    const rows: (string | number)[][] = [
      ["Institutes (excl. test)", d.institutes, `${d.newThisWeek} new this week, ${d.newLastWeek} last week`],
      ["On trial now", d.onTrial, `${d.trialsEndingIn7} end within 7 days`],
      ["Paying or PROD tag", d.paying, ""],
      ["Courses created", d.courses, `in ${d.institutesWithCourses} institutes`],
      ["Students", d.students, ""],
      ["Institutes online now", d.onlineInstitutes, `${d.onlinePeople} people`],
      ["AI credits used", Math.round(d.aiCreditsUsed), ""],
      ["AI calls, last 30 days", totalCalls, `${Math.round(totalMinutes)} minutes, ${callers.length} institutes`],
      ...callers.slice(0, 10).map((x, i) => [`  #${i + 1} ${x.name}`, x.calls30!.calls, `${Math.round(x.calls30!.minutes)} min`]),
      [],
      ["Needs attention", "", ""],
      ...attention.map((x) => [x.text, x.count, ""]),
      [],
      ["Trial accounts by stage", "", ""],
      ...STAGES.map((s) => [TRIAL_STAGE_LABEL[s], d.trialStages[s], ""]),
      [],
      ["Week starting", "New institutes", "Trials started"],
      ...d.weekly.map((w) => [w.week, w.institutes, w.trials]),
    ];
    downloadText(`pm-dashboard-${data.today}.csv`, toCsv(["Item", "Value", "Notes"], rows));
  };

  if (data.isLoading)
    return (
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-28" />)}</div>
        <Skeleton className="h-64" />
      </div>
    );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">All products together. Test and internal accounts are left out. Click any number to see the list behind it.</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportSummary}>
            <Download className="mr-1.5 h-4 w-4" /> Export
          </Button>
          <Button variant="outline" size="sm" onClick={data.refetch}>
            {data.isFetching ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />} Refresh
          </Button>
        </div>
      </div>

      {/* ------------------------------------------------ headline numbers */}
      <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <Kpi icon={Building2} label="Institutes" value={num(d.institutes)} sub={`${d.newThisWeek} new this week${weekDelta === 0 ? "" : ` (${weekDelta > 0 ? "+" : ""}${weekDelta} vs last)`}`} onClick={() => onOpenAccounts([])} />
        <Kpi icon={Sparkles} label="On trial" value={num(d.onTrial)} sub={`${d.trialsEndingIn7} end within 7 days`} onClick={() => onOpenTrials("ALL")} />
        <Kpi icon={IndianRupee} label="Paying or PROD" value={num(d.paying)} sub="Paid subscription, or tagged PROD" onClick={() => onOpenAccounts(["paying"])} />
        <Kpi icon={BookOpen} label="Courses created" value={num(d.courses)} sub={`in ${num(d.institutesWithCourses)} institutes`} />
        <Kpi icon={GraduationCap} label="Students" value={num(d.students)} sub={`AI credits used: ${num(d.aiCreditsUsed)}`} />
        <Kpi icon={Wifi} label="Online now" value={num(d.onlineInstitutes)} sub={`institutes · ${num(d.onlinePeople)} people`} onClick={() => onOpenAccounts(["active"])} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        {/* ------------------------------------------------ needs attention */}
        <Panel title="Needs attention" description="Each line opens the accounts behind it.">
          {attention.length === 0 ? (
            <p className="flex items-center gap-2 px-4 pb-4 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Nothing needs attention right now.
            </p>
          ) : (
            <div className="divide-y border-t">
              {attention.map((x) => (
                <AttentionRow key={x.text} count={x.count} text={x.text} tone={x.tone} onClick={x.go} />
              ))}
            </div>
          )}
        </Panel>

        {/* ------------------------------------------------ trial stages */}
        <Panel title="Trial accounts by stage" description="Live trials and those that ended in the last 2 weeks. Click a stage to see them.">
          <div className="space-y-2.5 border-t px-4 py-4">
            {STAGES.map((s) => (
              <button key={s} type="button" onClick={() => onOpenTrials(s)} className="flex w-full items-center gap-3 text-left text-sm hover:opacity-80">
                <span className="w-52 shrink-0 text-muted-foreground">{TRIAL_STAGE_LABEL[s]}</span>
                <span className="h-3 flex-1 rounded bg-muted">
                  <span className={cn("block h-3 rounded", STAGE_BAR[s])} style={{ width: `${(d.trialStages[s] / stageMax) * 100}%` }} />
                </span>
                <span className="w-8 text-right font-semibold tabular-nums">{d.trialStages[s]}</span>
              </button>
            ))}
          </div>
        </Panel>
      </div>

      {/* ------------------------------------------------ AI calls */}
      <Panel
        title="AI calls · last 30 days"
        description={callsLoaded ? `${num(totalCalls)} calls · ${num(totalMinutes)} minutes · ${callers.length} institutes calling` : "Loading the call log…"}
        action={
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onOpenCalls}>
            All AI calls <ArrowRight className="ml-1 h-3.5 w-3.5" />
          </Button>
        }
      >
        {callsLoaded && callers.length === 0 ? (
          <p className="border-t px-4 py-4 text-sm text-muted-foreground">No AI calls in the last 30 days.</p>
        ) : (
          <div className="grid gap-x-6 border-t px-4 py-3 sm:grid-cols-2 xl:grid-cols-5">
            {callers.slice(0, 5).map((x, i) => (
              <button key={x.id} type="button" onClick={() => onOpenAccount(x.id)} className="flex items-center gap-3 rounded-md py-2 text-left hover:bg-accent/50">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{i + 1}</span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{x.name}</span>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <PhoneCall className="h-3 w-3" /> {num(x.calls30!.calls)} calls · {num(x.calls30!.minutes)} min
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        {/* ------------------------------------------------ weekly chart */}
        <Panel title="New institutes per week" description="Last 12 weeks, with trials started.">
          <div className="border-t px-2 py-4">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={weekly}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="label" tick={AXIS} stroke="hsl(var(--muted-foreground))" interval={1} />
                <YAxis tick={AXIS} stroke="hsl(var(--muted-foreground))" allowDecimals={false} width={30} />
                <Tooltip contentStyle={TOOLTIP} labelFormatter={(v) => `Week of ${v}`} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="institutes" name="New institutes" fill="hsl(var(--chart-1))" radius={[3, 3, 0, 0]} />
                <Bar dataKey="trials" name="Trials started" fill="hsl(var(--chart-3))" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        {/* ------------------------------------------------ newest institutes */}
        <Panel
          title="Newest institutes"
          description="Who signed up most recently and how far they've got."
          action={
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onOpenAccounts([])}>
              All accounts <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          }
        >
          <table className="w-full border-t text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="px-4 py-2 text-left font-medium">Institute</th>
                <th className="px-2 py-2 text-left font-medium">Status</th>
                <th className="px-2 py-2 text-right font-medium">Courses</th>
                <th className="px-2 py-2 text-right font-medium">Students</th>
                <th className="px-4 py-2 text-right font-medium">Logged in</th>
              </tr>
            </thead>
            <tbody>
              {newest.map((r) => (
                <tr key={r.id} onClick={() => onOpenAccount(r.id)} className="cursor-pointer border-b last:border-0 hover:bg-accent/40">
                  <td className="max-w-[14rem] px-4 py-2">
                    <p className="truncate font-medium">{r.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDay(r.createdAt)}
                      {r.products.length > 0 && ` · ${r.products.map(productName).join(", ")}`}
                    </p>
                  </td>
                  <td className="px-2 py-2 text-xs">{r.paid ? "Paying" : r.trialStage ? TRIAL_STAGE_LABEL[r.trialStage] : PLATFORM_STATUS[r.platformTag ?? ""] ?? "No tag"}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{r.courses}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{r.students}</td>
                  <td className="px-4 py-2 text-right text-xs text-muted-foreground">{r.usage ? `${r.usage.loggedIn}/${r.usage.users}` : r.activeNow ? "online now" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>
    </div>
  );
}
