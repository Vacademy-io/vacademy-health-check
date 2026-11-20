// What needs someone now: accounts to top up and vendors that are failing. No imports, so the
// Node tests can load this file directly.

export interface AttentionBalance {
  vendor: string;
  account: string | null;
  institute_name: string | null;
  status: "ok" | "not_set_up" | "error" | "unknown";
  kind: "account_balance" | "key_limit" | "account_status";
  state_label?: string | null;
  balance: number | null;
  currency: string | null;
  message: string | null;
}

export interface AttentionFailure {
  vendor: string;
  http_status: number | null;
  reason: string;
  failed: number;
  last_at: string;
}

/** Below this an account is flagged. Same figures as the Balances tab. */
const LOW: Record<string, number> = { USD: 5, INR: 500, EUR: 5, GBP: 5 };

export type TopUpWhy = "empty" | "low" | "out_of_credits" | "unreadable";

export interface TopUp {
  row: AttentionBalance;
  why: TopUpWhy;
  /** Where to add money, when the vendor has a billing page. */
  url: string | null;
}

/** Billing pages, by a word in the vendor's name. Public links, no account ids. */
const TOP_UP_PAGES: Array<[string, string]> = [
  ["openrouter", "https://openrouter.ai/settings/credits"],
  ["fal", "https://fal.ai/dashboard/billing"],
  ["runpod", "https://www.runpod.io/console/user/billing"],
  ["sarvam", "https://dashboard.sarvam.ai"],
  ["plivo", "https://console.plivo.com/billing/"],
  ["exotel", "https://my.exotel.com"],
  ["isoquant", "https://isoquant.ai"],
  ["wati", "https://app.wati.io"],
  ["cloudconvert", "https://cloudconvert.com/dashboard/api/v2/billing"],
  ["serper", "https://serper.dev/billing"],
  ["mathpix", "https://console.mathpix.com"],
];

export const topUpUrl = (vendor: string | null | undefined): string | null => {
  const v = (vendor ?? "").toLowerCase();
  for (const [word, url] of TOP_UP_PAGES) if (v.includes(word)) return url;
  return null;
};

/** Why an account needs money now, or null when it is fine. */
export const topUpReason = (row: AttentionBalance): TopUpWhy | null => {
  if (row.kind === "account_status") {
    const label = (row.state_label ?? "").toLowerCase();
    return label.includes("out of credit") || label.includes("exhausted") ? "out_of_credits" : null;
  }
  if (row.status === "error") return "unreadable";
  if (row.status !== "ok" || row.balance == null) return null;
  if (row.balance <= 0) return "empty";
  const floor = LOW[(row.currency || "USD").toUpperCase()];
  return floor != null && row.balance < floor ? "low" : null;
};

const WHY_ORDER: Record<TopUpWhy, number> = { empty: 0, out_of_credits: 1, low: 2, unreadable: 3 };

/** Accounts that need attention, the most urgent first: empty, out of credits, low, unreadable. */
export const topUps = (rows: AttentionBalance[]): TopUp[] =>
  rows
    .map((row) => ({ row, why: topUpReason(row), url: topUpUrl(row.vendor) }))
    .filter((t): t is TopUp => t.why != null)
    .sort((a, b) => WHY_ORDER[a.why] - WHY_ORDER[b.why] || (a.row.balance ?? 0) - (b.row.balance ?? 0));

export const TOP_UP_WORDS: Record<TopUpWhy, string> = {
  empty: "Empty",
  out_of_credits: "Out of credits",
  low: "Low",
  unreadable: "Could not read",
};

export interface FailingVendor {
  vendor: string;
  failed: number;
  last_at: string;
  /** Status codes (or "no answer") with their counts, the most frequent first. */
  statuses: Array<{ label: string; failed: number }>;
  /** Out of credits / bad key / rate limited, read from the status codes. */
  hint: string | null;
}

const statusLabel = (r: AttentionFailure) => (r.http_status == null ? r.reason || "No answer" : String(r.http_status));

const HINTS: Array<[(code: number) => boolean, string]> = [
  [(c) => c === 402, "Out of credits: top up"],
  [(c) => c === 401 || c === 403, "Key refused: check the key"],
  [(c) => c === 429, "Rate limited or quota used up"],
  [(c) => c >= 500, "The vendor is having trouble"],
  [(c) => c === 400 || c === 422, "We sent something it rejected: open a call"],
  [(c) => c === 404, "Not found: an id or URL is wrong"],
];

/**
 * What a failure without a status code means, read from its words. The voice bot reports key
 * refusals, capacity refusals and dropped sockets this way ("Key refused: invalid, revoked or
 * out of credit"), and calling those "no answer" sent people looking at the network.
 */
const REASON_HINTS: Array<[RegExp, string]> = [
  [/key refused|invalid key|invalid api key|revoked|unauthori[sz]ed|forbidden|authentication/i, "Key refused: check the key"],
  [/capacity|concurrency|too many (sockets|connections|streams)/i, "At capacity: too many connections on this key"],
  [/credit|exhausted|insufficient (funds|balance)|payment required|quota/i, "Out of credits: top up"],
  [/rate.?limit|too many requests/i, "Rate limited or quota used up"],
  [/time(d)? ?out|connect|unreachable|reset|no answer|refused/i, "No answer: timeout or connection refused"],
];

export const reasonHint = (reason: string | null | undefined): string | null => {
  const r = (reason ?? "").trim();
  if (!r) return null;
  for (const [pattern, words] of REASON_HINTS) if (pattern.test(r)) return words;
  return null;
};

/** The hint for one kind of failure: from its status code when it has one, else from its words. */
export const failureHint = (httpStatus: number | null | undefined, reason: string | null | undefined): string | null => {
  if (httpStatus != null) {
    for (const [test, words] of HINTS) if (test(httpStatus)) return words;
    return null;
  }
  return reasonHint(reason) ?? (reason?.trim() ? null : "No answer: timeout or connection refused");
};

/** The failure rows grouped per vendor, the vendor with the latest failure first. */
export const failingVendors = (rows: AttentionFailure[]): FailingVendor[] => {
  const by = new Map<string, FailingVendor>();
  for (const r of rows) {
    const v = by.get(r.vendor) ?? { vendor: r.vendor, failed: 0, last_at: r.last_at, statuses: [], hint: null };
    v.failed += r.failed;
    if (r.last_at > v.last_at) v.last_at = r.last_at;
    v.statuses.push({ label: statusLabel(r), failed: r.failed });
    by.set(r.vendor, v);
  }
  const out = [...by.values()];
  for (const v of out) {
    v.statuses.sort((a, b) => b.failed - a.failed);
    const codes = v.statuses.map((s) => Number(s.label)).filter((n) => Number.isFinite(n));
    v.hint = null;
    for (const [test, words] of HINTS) {
      if (codes.some(test)) {
        v.hint = words;
        break;
      }
    }
    if (!v.hint) {
      // No status-code hint: read the reasons of the failures without a code.
      for (const s of v.statuses) {
        if (Number.isFinite(Number(s.label))) continue;
        v.hint = reasonHint(s.label);
        if (v.hint) break;
      }
    }
    if (!v.hint && codes.length === 0) v.hint = "No answer: timeout or connection refused";
  }
  return out.sort((a, b) => (a.last_at < b.last_at ? 1 : a.last_at > b.last_at ? -1 : b.failed - a.failed));
};
