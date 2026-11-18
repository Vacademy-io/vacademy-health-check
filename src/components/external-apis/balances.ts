// Live vendor balances: the shape both services return, and how the Balances tab shows them.
// No imports, so the Node tests can load this file directly.

/** unknown: nothing has used the account recently, so whether it works is not known. */
export type BalanceStatus = "ok" | "not_set_up" | "error" | "unknown";

export interface VendorBalance {
  vendor: string;
  /** A masked key ("key …ab12"), an account name, or null. Never a secret. */
  account: string | null;
  institute_id: string | null;
  institute_name: string | null;
  status: BalanceStatus;
  /**
   * account_balance: money left with the vendor. key_limit: what one key may still spend under its cap.
   * account_status: no figure, only whether the account works (Sarvam has no balance API).
   */
  kind: "account_balance" | "key_limit" | "account_status";
  /** For account_status: "Working", "Out of credits", ... */
  state_label?: string | null;
  balance: number | null;
  currency: string | null;
  spend_per_hour: number | null;
  message: string | null;
  checked_at: string;
  /** Set on the Plivo master row: how many institute subaccounts draw on this one balance. */
  shared_by?: number | null;
}

export const money = (amount: number | null | undefined, currency: string | null | undefined): string => {
  if (amount == null) return "—";
  const code = (currency || "USD").toUpperCase();
  // A fraction of a cent (one AI call) keeps enough digits to be read; anything else shows cents.
  const tiny = amount !== 0 && Math.abs(amount) < 0.01;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency", currency: code,
      minimumFractionDigits: 2, maximumFractionDigits: tiny ? 6 : 2,
    }).format(amount);
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

const STATUS_ORDER: Record<BalanceStatus, number> = { ok: 0, error: 1, unknown: 2, not_set_up: 3 };

/**
 * How close a balance is to its currency's alert level (1 = at it), so $10 and ₹600 compare fairly:
 * plain numbers would put $10 below ₹600. A currency with no alert level counts its raw amount.
 */
const relativeLevel = (r: VendorBalance): number =>
  r.balance == null ? Infinity : r.balance / (LOW_BALANCE[(r.currency || "USD").toUpperCase()] ?? 1);

/** Readable balances first, closest to running out first (relative to each currency's alert level); then failures. */
export const sortBalances = (rows: VendorBalance[]): VendorBalance[] =>
  [...rows].sort((a, b) =>
    STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
    || relativeLevel(a) - relativeLevel(b)
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

/**
 * Plivo subaccounts have no wallet of their own, so every one reports our master balance.
 * Folds those into one row so the balance is shown and totalled once. Failed checks stay
 * per institute. A row the server already folded passes through unchanged.
 */
export const collapseSharedPlivo = (rows: VendorBalance[]): VendorBalance[] => {
  const readable = rows.filter((r) => r.vendor === "Plivo" && r.status === "ok");
  if (!readable.length) return rows;
  const shared = readable.reduce((n, r) => n + (r.shared_by ?? 1), 0);
  const master: VendorBalance = {
    ...readable[0],
    account: "Vacademy master account",
    institute_id: null,
    institute_name: null,
    shared_by: shared,
    message: `Every institute's Plivo subaccount draws on this one balance (${shared} subaccount${shared === 1 ? "" : "s"}).`,
  };
  return [master, ...rows.filter((r) => !(r.vendor === "Plivo" && r.status === "ok"))];
};

/** Below this, an account is flagged so someone tops it up before calls or generations fail. */
export const LOW_BALANCE: Record<string, number> = { USD: 5, INR: 500, EUR: 5, GBP: 5 };

export const isLow = (row: Pick<VendorBalance, "status" | "balance" | "currency">): boolean => {
  if (row.status !== "ok" || row.balance == null) return false;
  const floor = LOW_BALANCE[(row.currency || "USD").toUpperCase()];
  return floor != null && row.balance < floor;
};

/** Vendors with no balance API, and why, so the tab says what it leaves out instead of hiding it. */
export const NOT_REPORTED: Array<{ vendors: string; reason: string }> = [
  { vendors: "Serper, Mathpix, Smallest.ai", reason: "they don't let us read the balance; check their own dashboards" },
  { vendors: "Sarvam (amount)", reason: "no balance API: the card above says whether it works, from the voice bot's last calls" },
  { vendors: "OpenAI, Gemini, Meta WhatsApp, AWS", reason: "billed to a card each month, so there is no balance to run out" },
  { vendors: "YouTube, Pexels, Pixabay", reason: "free daily quotas rather than a balance" },
  { vendors: "WATI, CloudConvert", reason: "they report a balance, but we can't read it from here yet; coming next" },
];

/** "₹1,200 · $30": amounts per currency, never added across currencies. Zero amounts are left out. */
export const amountsLabel = (rows: Array<{ currency: string | null; amount: number }>): string => {
  const totals = new Map<string, number>();
  for (const r of rows) {
    if (!r.amount) continue;
    const code = (r.currency || "").toUpperCase();
    totals.set(code, (totals.get(code) ?? 0) + r.amount);
  }
  if (!totals.size) return "—";
  return [...totals]
    .sort((a, b) => b[1] - a[1])
    .map(([code, total]) => (code ? money(total, code) : `${total.toFixed(2)} (currency not recorded)`))
    .join(" · ");
};
