// The bell in the header: unread failed calls to integrated vendors, one entry per kind.
// No imports, so the Node tests can load this file directly.

/** One kind of unread failure, as admin-core groups it: vendor + status, or vendor + reason. */
export interface AlertGroup {
  vendor: string;
  http_status: number | null;
  /** The error text when there is no status ("Key refused: invalid, revoked or out of credit"), else "". */
  reason: string;
  failed: number;
  first_at: string;
  last_at: string;
}

export interface Alerts {
  /** Unread failed calls in the window, across every kind (the list may be cut at 50 kinds). */
  unread: number;
  groups: AlertGroup[];
  /** When admin-core read them: "mark read" marks only what happened up to here. */
  as_of: string;
}

/** What one "mark read" names: a kind, or every unread failure. */
export interface MarkReadRequest {
  all?: boolean;
  vendor?: string;
  http_status?: number | null;
  reason?: string;
  up_to: string;
}

/** The badge on the bell: nothing for none, "99+" past 99. */
export const badgeText = (unread: number): string | null =>
  unread <= 0 ? null : unread > 99 ? "99+" : String(unread);

/** What a kind failed with: the status code, or the vendor's own words. */
export const alertLabel = (g: Pick<AlertGroup, "http_status" | "reason">): string =>
  g.http_status != null ? `HTTP ${g.http_status}` : g.reason.trim() || "No answer";

/** "just now", "5 min ago", "3 h ago", "2 days ago". */
export const ago = (iso: string, now: number = Date.now()): string => {
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (!Number.isFinite(seconds)) return "";
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
};

const sameKind = (a: Pick<AlertGroup, "vendor" | "http_status" | "reason">, b: typeof a) =>
  a.vendor === b.vendor && (a.http_status ?? null) === (b.http_status ?? null) &&
  (a.http_status != null || a.reason === b.reason);

/** The request that marks one kind read, up to what admin-core showed. */
export const markKind = (alerts: Alerts, g: AlertGroup): MarkReadRequest =>
  g.http_status != null
    ? { vendor: g.vendor, http_status: g.http_status, up_to: alerts.as_of }
    : { vendor: g.vendor, http_status: null, reason: g.reason, up_to: alerts.as_of };

/** The request that marks everything shown read. */
export const markAll = (alerts: Alerts): MarkReadRequest => ({ all: true, up_to: alerts.as_of });

/** The alerts as they look once a mark-read lands, so the bell clears at once. */
export const afterMarkRead = (alerts: Alerts, req: MarkReadRequest): Alerts => {
  if (req.all) return { ...alerts, unread: 0, groups: [] };
  const gone = alerts.groups.filter((g) =>
    sameKind(g, { vendor: req.vendor ?? "", http_status: req.http_status ?? null, reason: req.reason ?? "" }));
  const removed = gone.reduce((n, g) => n + g.failed, 0);
  return {
    ...alerts,
    unread: Math.max(0, alerts.unread - removed),
    groups: alerts.groups.filter((g) => !gone.includes(g)),
  };
};
