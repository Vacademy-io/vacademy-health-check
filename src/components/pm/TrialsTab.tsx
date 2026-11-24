import { useMemo, useState } from "react";
import { MessageSquarePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatDay } from "@/lib/plans";
import { FOLLOW_UP_LABEL } from "@/lib/pm-record";
import { daysBetween, productName, TRIAL_STAGE_LABEL, type AccountRow, type TrialFilter, type TrialStage } from "@/lib/pm-view";
import { FollowUpDialog } from "./FollowUpDialog";
import { Pager, usePaged } from "./Pager";
import { usePmData } from "./use-pm-data";

const STAGES: TrialStage[] = ["NOT_LOGGED_IN", "SETTING_UP", "BUILDING", "ACTIVE", "EXPIRED", "CONVERTED"];
const STAGE_TONE: Record<TrialStage, string> = {
  NOT_LOGGED_IN: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  SETTING_UP: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  BUILDING: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  ACTIVE: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  EXPIRED: "bg-muted text-muted-foreground",
  CONVERTED: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
};

const rel = (today: string, iso: string | null | undefined) => {
  const d = daysBetween(today, iso);
  if (d === null) return "—";
  return d === 0 ? "today" : d < 0 ? `${-d}d ago` : `in ${d}d`;
};
const credits = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 0 });

/** The trial accounts the PM looks after: one row each, in the order they need attention. */
export function TrialsTab({ onOpenAccount, stage, onStageChange }: { onOpenAccount: (id: string) => void; stage: TrialFilter; onStageChange: (s: TrialFilter) => void }) {
  const data = usePmData();
  const setStage = onStageChange;
  const [search, setSearch] = useState("");
  const [updating, setUpdating] = useState<AccountRow | null>(null);

  const trials = useMemo(
    () =>
      data.accounts
        .filter((a) => a.trialStage && (a.trial!.daysLeft === null || a.trial!.daysLeft >= -14) && a.pmClass !== "TEST" && a.pmClass !== "INTERNAL")
        .sort((x, y) => STAGES.indexOf(x.trialStage!) - STAGES.indexOf(y.trialStage!) || (x.trial!.daysLeft ?? 999) - (y.trial!.daysLeft ?? 999)),
    [data.accounts]
  );
  const counts = useMemo(() => Object.fromEntries(STAGES.map((s) => [s, trials.filter((t) => t.trialStage === s).length])) as Record<TrialStage, number>, [trials]);
  const q = search.trim().toLowerCase();
  const today = data.today;
  const matches = (t: AccountRow) =>
    stage === "ALL" ||
    (stage === "ENDING" ? !t.paid && t.trial!.daysLeft !== null && t.trial!.daysLeft >= 0 && t.trial!.daysLeft <= 3 : stage === "DUE" ? !!t.record?.nextFollowUp && (daysBetween(today, t.record.nextFollowUp) ?? 1) <= 0 : t.trialStage === stage);
  const filtered = trials.filter((t) => matches(t) && (!q || `${t.name} ${t.email} ${t.trial?.contact ?? ""} ${t.subdomain}`.toLowerCase().includes(q)));
  const paged = usePaged(filtered, 15, `${stage}|${q}`);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Every institute on a trial (live, or ended in the last 2 weeks). Check where each one is, then use <span className="font-medium text-foreground">Add update</span> after you speak to them.
        Click a row for the full account.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setStage("ALL")} className={cn("rounded-full border px-3 py-1 text-xs font-medium", stage === "ALL" ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent")}>
          All {trials.length}
        </button>
        {(stage === "ENDING" || stage === "DUE") && (
          <button type="button" onClick={() => setStage("ALL")} className="rounded-full border border-primary bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">
            {stage === "ENDING" ? "Ending in 3 days" : "Check-in due"} {filtered.length} ✕
          </button>
        )}
        {STAGES.map((s) => (
          <button key={s} type="button" onClick={() => setStage(s)} className={cn("rounded-full px-3 py-1 text-xs font-medium", STAGE_TONE[s], stage === s && "ring-2 ring-primary ring-offset-1")}>
            {TRIAL_STAGE_LABEL[s]} {counts[s]}
          </button>
        ))}
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search institute or contact…" className="ml-auto h-8 w-60" />
      </div>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          {data.isLoading ? (
            <div className="space-y-2 p-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : paged.total === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">No trial accounts here.</p>
          ) : (
            <table className="w-full min-w-[1080px] text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                  <th className="px-4 py-2 text-left font-medium">Institute</th>
                  <th className="px-3 py-2 text-left font-medium">Product & plan</th>
                  <th className="px-3 py-2 text-left font-medium">Trial period</th>
                  <th className="px-3 py-2 text-left font-medium">Where they are</th>
                  <th className="px-3 py-2 text-left font-medium">Usage</th>
                  <th className="px-3 py-2 text-left font-medium">Your last update</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {paged.items.map((a) => {
                  const t = a.trial!;
                  const last = a.record?.followUps[0];
                  const next = a.record?.nextFollowUp;
                  const nextLeft = daysBetween(today, next);
                  const plan = a.record?.planName || a.platformPlan;
                  return (
                    <tr key={a.id} className="cursor-pointer border-b align-top last:border-0 hover:bg-accent/40" onClick={() => onOpenAccount(a.id)}>
                      <td className="max-w-[15rem] px-4 py-2.5">
                        <p className="truncate font-medium">{a.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{t.contact || a.email || a.subdomain || "—"}</p>
                        <p className="text-xs text-muted-foreground">Registered {formatDay(a.createdAt)}</p>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {a.products.length ? (
                            a.products.map((p) => <span key={p} className="rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">{productName(p)}</span>)
                          ) : (
                            <span className="text-xs text-muted-foreground">Product not set</span>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">{plan ? `Plan: ${plan}` : "No plan yet"}</p>
                      </td>
                      <td className="px-3 py-2.5 text-xs">
                        <p>{formatDay(t.startedAt ?? a.createdAt)} → {t.endsAt ? formatDay(t.endsAt) : "no end date"}</p>
                        <p className={cn("font-medium", t.daysLeft !== null && t.daysLeft >= 0 && t.daysLeft <= 3 ? "text-red-600" : "text-muted-foreground")}>
                          {t.daysLeft === null ? "Open-ended" : t.daysLeft < 0 ? `Ended ${-t.daysLeft}d ago` : t.daysLeft === 0 ? "Ends today" : `${t.daysLeft} days left`}
                        </p>
                        <p className="text-muted-foreground">{a.credentialsSentAt ? `Login sent ${rel(today, a.credentialsSentAt)}` : "Tagged trial (no demo login)"}</p>
                      </td>
                      <td className="px-3 py-2.5 text-xs">
                        <span className={cn("inline-block rounded px-1.5 py-0.5 text-[11px] font-medium", STAGE_TONE[a.trialStage!])}>{TRIAL_STAGE_LABEL[a.trialStage!]}</span>
                        <p className="mt-1 text-muted-foreground">
                          {a.usage ? `${a.usage.loggedIn} of ${a.usage.users} users logged in` : data.usageLoading ? "Checking logins…" : "Logins unknown"}
                        </p>
                        <p className="text-muted-foreground">
                          {a.usage?.lastLogin ? `Last login ${rel(today, a.usage.lastLogin)}` : a.usage ? "Never logged in" : ""}
                        </p>
                      </td>
                      <td className="px-3 py-2.5 text-xs">
                        <p>{a.courses} course{a.courses === 1 ? "" : "s"} · {a.students} student{a.students === 1 ? "" : "s"}</p>
                        <p className={cn("text-muted-foreground", a.credits?.low && "font-medium text-amber-600")}>
                          {a.credits ? `AI credits: ${credits(a.credits.used)} used, ${credits(a.credits.balance)} left` : "AI credits: —"}
                        </p>
                      </td>
                      <td className="max-w-[15rem] px-3 py-2.5 text-xs">
                        {last ? (
                          <>
                            <p>
                              <span className="font-medium">{FOLLOW_UP_LABEL[last.outcome]}</span> <span className="text-muted-foreground">· {rel(today, last.date)}</span>
                            </p>
                            {last.note && <p className="line-clamp-2 text-muted-foreground">{last.note}</p>}
                          </>
                        ) : (
                          <p className="text-muted-foreground">No update yet</p>
                        )}
                        {next && <p className={cn("mt-0.5", nextLeft !== null && nextLeft <= 0 ? "font-medium text-red-600" : "text-muted-foreground")}>Next check-in {rel(today, next)}</p>}
                      </td>
                      <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <Button size="sm" variant="outline" className="h-8 text-xs" disabled={!data.pmConfigured} onClick={() => setUpdating(a)}>
                          <MessageSquarePlus className="mr-1 h-3.5 w-3.5" /> Add update
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
      <Pager {...paged} noun="trial accounts" />

      <FollowUpDialog account={updating} onOpenChange={(o) => !o && setUpdating(null)} pmConfigured={data.pmConfigured} />
    </div>
  );
}
