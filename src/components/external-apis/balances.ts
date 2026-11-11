// Live vendor balances: the shape both services return, and how the Balances tab shows them.
// No imports, so the Node tests can load this file directly.

export type BalanceStatus = "ok" | "not_set_up" | "error";

export interface VendorBalance {
  vendor: string;
  /** A masked key ("key …ab12"), an account name, or null. Never a secret. */
  account: string | null;
  institute_id: string | null;
  institute_name: string | null;
  status: BalanceStatus;
  /** account_balance: money left with the vendor. key_limit: what one key may still spend under its cap. */
  kind: "account_balance" | "key_limit";
  balance: number | null;
  currency: string | null;
  spend_per_hour: number | null;
  message: string | null;
  checked_at: string;
}

export const money = (amount: number | null | undefined, currency: string | null | undefined): string => {
  if (amount == null) return "—";
  const code = (currency || "USD").toUpperCase();
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: code, maximumFractionDigits: 2 }).format(amount);
  } catch {
    // An unknown currency code: show it beside the number rather than fail.
    return `${amount.toFixed(2)} ${code}`;
  }
};

/** Days until the balance runs out at the vendor's reported spend rate, when it reports one. */
export const daysLeft = (row: Pick<VendorBalance, "balance" | "spend_per_hour">): number | null =>
  row.balance != null && row.spend_per_hour != null && row.spend_per_hour > 0
    ? row.balance / (row.spend_per_hour * 24)
    : null;

export const runwayLabel = (days: number | null): string | null => {
  if (days == null) return null;
  if (days < 1) return "Less than a day left at the current spend";
  const whole = Math.floor(days);
  return `About ${whole} day${whole === 1 ? "" : "s"} left at the current spend`;
};

const STATUS_ORDER: Record<BalanceStatus, number> = { ok: 0, error: 1, not_set_up: 2 };

/** Readable balances first, lowest first so the account closest to running out is on top; then failures. */
export const sortBalances = (rows: VendorBalance[]): VendorBalance[] =>
  [...rows].sort((a, b) =>
    STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
    || (a.balance ?? Infinity) - (b.balance ?? Infinity)
    || a.vendor.localeCompare(b.vendor)
    || (a.institute_name ?? a.account ?? "").localeCompare(b.institute_name ?? b.account ?? ""));

/** Totals per currency, so INR and USD are never added together. */
export const totalsByCurrency = (rows: VendorBalance[]): Array<{ currency: string; total: number; accounts: number }> => {
  const totals = new Map<string, { total: number; accounts: number }>();
  for (const r of rows) {
    if (r.status !== "ok" || r.balance == null || r.kind !== "account_balance") continue;
    const code = (r.currency || "USD").toUpperCase();
    const t = totals.get(code) ?? { total: 0, accounts: 0 };
    t.total += r.balance;
    t.accounts += 1;
    totals.set(code, t);
  }
  return [...totals].map(([currency, t]) => ({ currency, ...t })).sort((a, b) => a.currency.localeCompare(b.currency));
};

/** How long ago, in words, for "checked 4 minutes ago". */
export const agoLabel = (iso: string, now: number = Date.now()): string => {
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (Number.isNaN(seconds)) return "at an unknown time";
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  return `${hours} hour${hours === 1 ? "" : "s"} ago`;
};

/** Vendors with no balance API, and why, so the tab says what it leaves out instead of hiding it. */
export const NOT_REPORTED: Array<{ vendors: string; reason: string }> = [
  { vendors: "Sarvam, Serper, Mathpix, Smallest.ai", reason: "no balance API; only their own dashboards show it" },
  { vendors: "OpenAI, Gemini, Meta WhatsApp, AWS", reason: "billed to a card each month, so there is no balance to run out" },
  { vendors: "YouTube, Pexels, Pixabay", reason: "free daily quotas rather than a balance" },
  { vendors: "WATI, CloudConvert", reason: "report a balance, but their keys sit in notification-service and media-service; next to add" },
];
