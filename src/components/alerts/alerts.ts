// The bell in the header: alerts from every source (external APIs today, more later).
// No imports, so the Node tests can load this file directly.

/** One thing that needs someone's attention, from any source. */
export interface AlertItem {
  /** Stable across refreshes, unique across sources: "<source>|<what>". Marking read keys on it. */
  key: string;
  /** Which source raised it, e.g. "external-apis". */
  source: string;
  /** The headline: who or what is affected. */
  title: string;
  /** What happened, in one line. */
  detail: string;
  /** The likely cause or what to do, when known. */
  hint?: string | null;
  /** How many times it happened in the source's window. */
  count: number;
  /** When it last happened (ISO). A newer occurrence than the read mark makes it unread again. */
  lastAt: string;
}

/** What one source contributes to the bell. */
export interface AlertSourceState {
  key: string;
  /** The section heading in the bell. */
  label: string;
  /** Where "open" goes for the full picture. */
  href: string;
  /** How far back the source looks, for the empty and summary text ("last 7 days"). */
  window: string;
  items: AlertItem[];
  isLoading: boolean;
  isError: boolean;
}

/** Item key -> the lastAt it was marked read at. */
export type ReadMarks = Record<string, string>;

const time = (iso: string): number => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : NaN;
};

/** Unread: never marked, or it happened again after it was marked. */
export const isUnread = (item: Pick<AlertItem, "key" | "lastAt">, marks: ReadMarks): boolean => {
  const mark = marks[item.key];
  if (!mark) return true;
  const last = time(item.lastAt);
  const read = time(mark);
  return !Number.isFinite(last) || !Number.isFinite(read) || last > read;
};

/** The unread items, latest first. */
export const unreadItems = (items: AlertItem[], marks: ReadMarks): AlertItem[] =>
  items.filter((i) => isUnread(i, marks)).sort((a, b) => (time(b.lastAt) || 0) - (time(a.lastAt) || 0));

/** The badge on the bell: nothing for none, "99+" past 99. */
export const badgeText = (unread: number): string | null =>
  unread <= 0 ? null : unread > 99 ? "99+" : String(unread);

/** Marks older than this can never matter again: no source looks back further. */
export const MARK_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** The marks with these items read up to what was shown, and marks past their use dropped. */
export const markRead = (marks: ReadMarks, items: Pick<AlertItem, "key" | "lastAt">[], now: number = Date.now()): ReadMarks => {
  const next: ReadMarks = {};
  for (const [key, at] of Object.entries(marks)) {
    const t = time(at);
    if (Number.isFinite(t) && now - t < MARK_TTL_MS) next[key] = at;
  }
  for (const item of items) next[item.key] = item.lastAt;
  return next;
};

/** Read marks from storage text; anything unreadable is no marks. */
export const parseMarks = (raw: string | null | undefined): ReadMarks => {
  if (!raw) return {};
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const out: ReadMarks = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) if (typeof v === "string") out[k] = v;
    return out;
  } catch {
    return {};
  }
};

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
