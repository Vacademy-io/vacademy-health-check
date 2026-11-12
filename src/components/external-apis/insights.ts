// The arithmetic behind each tab's summary: shares, period changes, rates and runway.
// No imports, so the Node tests can load this file directly.

/** part as a percentage of whole, or null when there is no whole to compare against. */
export const pct = (part: number, whole: number): number | null => (whole > 0 ? (part / whole) * 100 : null);

export const pctLabel = (p: number | null): string => {
  if (p == null) return "—";
  if (p > 0 && p < 1) return "under 1%";
  if (p < 100 && p > 99) return "over 99%";
  return `${Math.round(p)}%`;
};

/** "up 24%" / "down 10%" against the previous window of the same length. */
export const changeLabel = (current: number, previous: number, period: string): string | null => {
  if (current === 0 && previous === 0) return null;
  if (previous === 0) return `Nothing in the ${period} before`;
  const change = ((current - previous) / previous) * 100;
  if (Math.abs(change) < 1) return `About the same as the ${period} before`;
  return `${change > 0 ? "Up" : "Down"} ${Math.round(Math.abs(change))}% on the ${period} before`;
};

/** "7 days", "24 hours", "hour": the window in words, for "the 7 days before". */
export const periodWords = (hours: number): string => {
  if (hours === 1) return "hour";
  if (hours < 48) return `${hours} hours`;
  return `${Math.round(hours / 24)} days`;
};

/** A vendor value without the "likely:" or "model:" prefix the queries add, lowercased. */
export const vendorKey = (raw: string): string => raw.replace(/^(likely|model):/, "").toLowerCase();

/** Recorded vendor cost per day, by vendor key, over a window of `hours`. */
export const dailySpendByVendor = (
  rows: Array<{ provider: string; cost_usd: number }>,
  hours: number,
): Map<string, number> => {
  const days = hours / 24;
  const out = new Map<string, number>();
  for (const r of rows) {
    const key = vendorKey(r.provider);
    out.set(key, (out.get(key) ?? 0) + r.cost_usd / days);
  }
  return out;
};

/** Days a balance lasts at a daily spend; null when there is no spend to divide by. */
export const runwayDays = (balance: number | null, perDay: number | null | undefined): number | null =>
  balance != null && perDay != null && perDay > 0 ? balance / perDay : null;

export const daysWords = (days: number): string => {
  if (days < 1) return "less than a day";
  if (days > 365) return "more than a year";
  const whole = Math.floor(days);
  return `about ${whole} day${whole === 1 ? "" : "s"}`;
};

/** The largest entry by `value`, and its share of the total. */
export const leader = <T>(rows: T[], value: (r: T) => number): { row: T; share: number | null } | null => {
  let best: T | null = null;
  let total = 0;
  for (const r of rows) {
    const v = value(r);
    total += v;
    if (best == null || v > value(best)) best = r;
  }
  return best == null || value(best) <= 0 ? null : { row: best, share: pct(value(best), total) };
};

/** Sum `value` over rows grouped by `key`, largest first. */
export const groupSum = <T>(rows: T[], key: (r: T) => string, value: (r: T) => number): Array<{ key: string; total: number }> => {
  const totals = new Map<string, number>();
  for (const r of rows) totals.set(key(r), (totals.get(key(r)) ?? 0) + value(r));
  return [...totals].map(([k, total]) => ({ key: k, total })).sort((a, b) => b.total - a.total);
};

export const minutes = (seconds: number): string => {
  const m = seconds / 60;
  return m >= 100 ? Math.round(m).toLocaleString("en-US") : m.toFixed(m < 10 ? 1 : 0);
};

/** Telephony statuses that mean the call is over, and of those, the one where someone talked. */
export const ENDED_CALL_STATUSES = ["COMPLETED", "NO_ANSWER", "BUSY", "FAILED", "CANCELLED"];
export const CONNECTED_CALL_STATUS = "COMPLETED";

const HTTP_MEANINGS: Record<number, string> = {
  400: "Bad request: the vendor rejected what we sent",
  401: "Key refused: missing, wrong or expired",
  402: "Out of credit with the vendor",
  403: "Not allowed: the key lacks access",
  404: "Not found",
  408: "Vendor timed out",
  409: "Conflict with an earlier request",
  413: "Request too large",
  422: "Vendor couldn't process the input",
  429: "Rate limited: too many requests",
  500: "Vendor error",
  502: "Vendor unreachable (bad gateway)",
  503: "Vendor unavailable",
  504: "Vendor timed out",
};

/** An HTTP status in words. No status means the request never got an answer. */
export const httpMeaning = (code: number | null | undefined): string => {
  if (code == null) return "No answer: network error or our own timeout";
  if (HTTP_MEANINGS[code]) return HTTP_MEANINGS[code];
  if (code >= 500) return "Vendor error";
  if (code >= 400) return "Request refused";
  return "Unexpected response";
};

const WHATSAPP_ERRORS: Record<string, string> = {
  "131026": "Number isn't on WhatsApp or can't receive messages",
  "131042": "Payment problem on the WhatsApp Business account",
  "131047": "Outside the 24-hour window: needs an approved template",
  "131048": "Blocked for spam: too many people reported or blocked",
  "131049": "Meta held a marketing message back to protect engagement",
  "131050": "The person opted out of marketing messages",
  "131051": "Message type not supported",
  "131053": "Media couldn't be uploaded",
  "131056": "Too many messages to the same number too fast",
  "131000": "Something went wrong at Meta",
  "130429": "Rate limit reached",
  "130472": "Held back by a Meta experiment",
  "132000": "Template variables don't match the template",
  "132001": "Template doesn't exist or isn't approved in this language",
  "132007": "Template content breaks WhatsApp policy",
  "132012": "Template variables are in the wrong format",
  "132015": "Template paused for low quality",
  "132016": "Template disabled for low quality",
  "133010": "Phone number not registered on WhatsApp Business",
  "368": "Account temporarily blocked for policy violations",
  "470": "Outside the 24-hour window: needs an approved template",
  "none": "No reason given",
};

export const whatsappErrorMeaning = (code: string): string => WHATSAPP_ERRORS[code] ?? "See Meta's error code list";
