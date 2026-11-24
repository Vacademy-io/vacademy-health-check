import { useMemo } from "react";
import { buildTrials } from "@/lib/command-center";
import type { PmRecord } from "@/lib/pm-record";
import { buildAccounts, callsByInstitute, localDate, productsFromSelections } from "@/lib/pm-view";
import { useRecentQuotes, useTaggedTrials } from "@/services/command-center-api";
import { useSubscriptions } from "@/services/plans-api";
import { useAccountUsage, useCallsSince, usePlatformProducts, useCreditsMap, usePlatformInstitutes, usePmRecords } from "@/services/pm-api";

/**
 * Everything the PM View tabs share: platform data (read-only) joined with the PM store's records.
 * React Query de-duplicates the requests, so both tabs can call this.
 */
// The platform's "online now" count is not reliable (sessions are never closed), so the PM View doesn't use it.
const NO_ONLINE_DATA = new Map<string, number>();

export function usePmData() {
  const institutes = usePlatformInstitutes();
  const subs = useSubscriptions();
  const quotes = useRecentQuotes();
  const tagged = useTaggedTrials();
  const pm = usePmRecords();

  const today = localDate(new Date());
  const records = useMemo(() => new Map<string, PmRecord>((pm.data?.records ?? []).map((r) => [r.instituteId, r])), [pm.data]);
  const trials = useMemo(() => buildTrials(quotes.data?.content ?? [], tagged.data?.content ?? [], subs.data ?? []), [quotes.data, tagged.data, subs.data]);
  // Sign-in data for trial accounts that are live or ended in the last 2 weeks.
  const trialIds = useMemo(() => trials.filter((t) => t.daysLeft === null || t.daysLeft >= -14).map((t) => t.instituteId).sort(), [trials]);
  const usageQ = useAccountUsage(trialIds);
  const usageKey = [...usageQ.usage.entries()].map(([k, v]) => `${k}:${v.loggedIn}:${v.lastLogin}`).join("|");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const usage = useMemo(() => usageQ.usage, [usageKey]);
  const credits = useCreditsMap();
  const calls30Q = useCallsSince(daysAgo(29));
  const calls30 = useMemo(() => (calls30Q.data ? new Map(callsByInstitute(calls30Q.data.calls).map((c) => [c.instituteId, c])) : undefined), [calls30Q.data]);
  const platformProducts = usePlatformProducts();
  const quoteProducts = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const q of quotes.data?.content ?? []) {
      if (!q.provisionedInstituteId) continue;
      const p = productsFromSelections(q.selections);
      if (p.length) m.set(q.provisionedInstituteId, p);
    }
    return m;
  }, [quotes.data]);
  const accounts = useMemo(
    () => buildAccounts(institutes.data ?? [], subs.data ?? [], trials, NO_ONLINE_DATA, records, today, { usage, credits: credits.data, quoteProducts, platformProducts: platformProducts.data, calls30 }),
    [institutes.data, subs.data, trials, records, today, usage, credits.data, quoteProducts, platformProducts.data, calls30]
  );

  return {
    today,
    accounts,
    records,
    trials,
    institutes: institutes.data ?? [],
    subs: subs.data ?? [],
    quotes: quotes.data?.content ?? [],
    pmConfigured: pm.data?.configured ?? false,
    pmMessage: pm.isError ? (pm.error as { response?: { data?: { message?: string } } })?.response?.data?.message ?? (pm.error as Error).message : pm.data?.message ?? null,
    isLoading: institutes.isLoading || subs.isLoading || pm.isLoading,
    usageLoading: usageQ.isLoading,
    isFetching: institutes.isFetching || subs.isFetching || pm.isFetching || quotes.isFetching,
    refetch: () => {
      institutes.refetch();
      subs.refetch();
      quotes.refetch();
      platformProducts.refetch();
      tagged.refetch();
      pm.refetch();
      credits.refetch();
      calls30Q.refetch();
    },
  };
}

/** Local date `n` days ago as YYYY-MM-DD. */
export function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return localDate(d);
}

/** Triggers a browser download of a text file (CSV exports, template). */
export function downloadText(filename: string, text: string, type = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
