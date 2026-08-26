/**
 * Shared formatting for the cache screens.
 *
 * The one rule that matters: null never means zero. hit_rate, inr_saved and inr_wasted
 * are null when nothing was ever measured, and a cache that was never switched on is
 * not a cache performing badly — so those render as an em dash, never as 0.
 */
export const DASH = "—";

export const rupees = (n: number | null | undefined) =>
  n == null ? DASH : `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export const num = (n: number | null | undefined) =>
  n == null ? DASH : n.toLocaleString("en-IN");

/** hit_rate arrives as a percentage, 0-100 — not a fraction. */
export const pct = (n: number | null | undefined) =>
  n == null ? DASH : `${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}%`;

export const bytes = (n: number | null | undefined) => {
  if (n == null) return DASH;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
};

export const seconds = (n: number | null | undefined) =>
  n == null ? DASH : n >= 60 ? `${Math.floor(n / 60)}m ${Math.round(n % 60)}s` : `${n.toFixed(1)}s`;

export const stamp = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("en-IN") : DASH;

/** How stale the mirror is, in the words a person would use. */
export function ago(iso: string | null | undefined) {
  if (!iso) return DASH;
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

/** Some numbers arrive wrapped in bidi marks, which break copy-paste and alignment. */
export const phone = (p: string | null | undefined) =>
  p == null ? DASH
    : Array.from(p)
      .filter((ch) => {
        const c = ch.codePointAt(0) ?? 0;
        return !(c === 0x200e || c === 0x200f || (c >= 0x202a && c <= 0x202e) || (c >= 0x2066 && c <= 0x2069));
      })
      .join("")
      .trim();

/** A wait of zero is the next call out, not an absent estimate. */
export const eta = (mins: number | null | undefined) =>
  mins == null ? DASH : mins <= 0 ? "next up" : mins === 1 ? "1 min" : `${mins} min`;

/** OFF explains an agent's zeroes, so it reads differently from a mode that is on. */
export const MODE_TONE: Record<string, string> = {
  FULL: "border-emerald-300 bg-emerald-50 text-emerald-700",
  FIXED: "border-blue-300 bg-blue-50 text-blue-700",
  OFF: "border-muted-foreground/30 text-muted-foreground",
};

export const STATUS_TONE: Record<string, string> = {
  DONE: "border-emerald-300 bg-emerald-50 text-emerald-700",
  FAILED: "border-red-300 bg-red-50 text-red-700",
  PENDING: "border-amber-300 bg-amber-50 text-amber-700",
  CLAIMED: "border-amber-300 bg-amber-50 text-amber-700",
};
