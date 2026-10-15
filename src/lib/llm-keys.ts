// Pure helpers for the Claude keys page. No React and no "@/" imports, so
// `node --test tests/` can run them directly (see tests/llm-keys.test.ts).
import type { AnthropicRoute, LlmKeyMonth, LlmKeyView, LlmKeysResponse } from "../types/llm-keys";

/** Defaults the backend applies when a field is omitted on create. */
export const DEFAULT_BUDGET_USD = 200;
export const DEFAULT_SOFT_LIMIT_PCT = 95;
export const DEFAULT_WEIGHT = 1;

/** The backend allows one test call per key per 10 s; the button waits the same. */
export const TEST_COOLDOWN_MS = 10_000;

/** NUMERIC columns can arrive as strings; anything unparseable becomes `fallback`. */
export function toNumber(v: unknown, fallback = 0): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : fallback;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

function normalizeMonth(raw: unknown): LlmKeyMonth {
  const m = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    metered_usd: toNumber(m.metered_usd),
    calls: toNumber(m.calls),
    errors: toNumber(m.errors),
    input_tokens: toNumber(m.input_tokens),
    output_tokens: toNumber(m.output_tokens),
    cache_read_tokens: toNumber(m.cache_read_tokens),
    cache_write_tokens: toNumber(m.cache_write_tokens),
  };
}

export function normalizeKey(raw: unknown): LlmKeyView {
  const k = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    id: String(k.id ?? ""),
    provider: str(k.provider) ?? "anthropic",
    label: str(k.label) ?? "",
    org_label: str(k.org_label),
    key_hint: str(k.key_hint) ?? "",
    monthly_budget_usd: toNumber(k.monthly_budget_usd, DEFAULT_BUDGET_USD),
    soft_limit_pct: toNumber(k.soft_limit_pct, DEFAULT_SOFT_LIMIT_PCT),
    weight: toNumber(k.weight, DEFAULT_WEIGHT),
    status: str(k.status) ?? "active",
    cooldown_until: str(k.cooldown_until),
    exhausted_until: str(k.exhausted_until),
    last_error: str(k.last_error),
    last_error_at: str(k.last_error_at),
    last_used_at: str(k.last_used_at),
    created_at: str(k.created_at),
    created_by: str(k.created_by),
    month: normalizeMonth(k.month),
  };
}

/** Anthropic API id for a registry id: strip "anthropic/", dots become dashes (claude-sonnet-4.5 → claude-sonnet-4-5). */
export function deriveWireModel(modelId: string): string {
  return modelId.replace(/^anthropic\//, "").replace(/\./g, "-");
}

export function normalizeKeysResponse(raw: unknown): LlmKeysResponse {
  const d = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const routes: AnthropicRoute[] = (Array.isArray(d.anthropic_routes) ? d.anthropic_routes : [])
    .map((r) => (r && typeof r === "object" ? (r as Record<string, unknown>) : {}))
    .filter((r) => typeof r.model_id === "string" && r.model_id)
    .map((r) => ({
      model_id: r.model_id as string,
      wire_model: str(r.wire_model) ?? deriveWireModel(r.model_id as string),
    }));
  return {
    keys: (Array.isArray(d.keys) ? d.keys : []).map(normalizeKey),
    // Absent = unknown; treat as not ready so the page never invites a key it cannot store.
    encryption_ready: d.encryption_ready === true,
    anthropic_routes: routes,
    period_month: str(d.period_month) ?? "",
  };
}

/** Local date-time for an ISO timestamp; "—" for none (same as Model defaults' formatWhen). */
export function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

const isFuture = (iso: string | null, now: number) => {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) && t > now;
};

export type SpendLevel = "ok" | "near" | "over";

/** Month-to-date spend against the budget; "over" once it reaches the soft limit (where routing stops). */
export function spendState(key: Pick<LlmKeyView, "monthly_budget_usd" | "soft_limit_pct" | "month">) {
  const budget = key.monthly_budget_usd;
  const spent = key.month.metered_usd;
  const softPct = Math.min(100, Math.max(0, key.soft_limit_pct));
  const pct = budget > 0 ? (spent / budget) * 100 : spent > 0 ? 100 : 0;
  const level: SpendLevel = pct >= softPct ? "over" : pct >= softPct * 0.8 ? "near" : "ok";
  return { spent, budget, pct, barPct: Math.min(100, pct), softPct, level };
}

export type StatusTone = "ok" | "warn" | "error" | "off";

/** What the key is doing right now, folding timed stops and the soft limit into the stored status. */
export function effectiveStatus(key: LlmKeyView, now = Date.now()): { label: string; tone: StatusTone; detail: string | null } {
  if (key.status === "auth_failed") {
    return { label: "Auth failed", tone: "error", detail: "Anthropic rejected this key. Fix or replace it, then enable it again." };
  }
  if (key.status === "disabled") return { label: "Disabled", tone: "off", detail: "Not used for any call." };
  if (key.status !== "active") return { label: key.status, tone: "warn", detail: null };
  if (isFuture(key.exhausted_until, now)) {
    return { label: "Budget stop", tone: "warn", detail: `Skipped until ${formatWhen(key.exhausted_until)}` };
  }
  if (isFuture(key.cooldown_until, now)) {
    return { label: "Cooling down", tone: "warn", detail: `Rate-limited; skipped until ${formatWhen(key.cooldown_until)}` };
  }
  if (spendState(key).level === "over") {
    return { label: "At soft limit", tone: "warn", detail: "Month-to-date spend reached the soft limit; calls go to other keys or OpenRouter." };
  }
  return { label: "Active", tone: "ok", detail: null };
}

/** Keys that can take a call right now. */
export function usableKeyCount(keys: LlmKeyView[], now = Date.now()): number {
  return keys.filter((k) => effectiveStatus(k, now).tone === "ok").length;
}

export function formatUsd(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** "October 2026" from "2026-10-01"; the raw string when it does not parse. */
export function formatPeriod(period: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(period);
  if (!m) return period;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1));
  return d.toLocaleString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });
}

export interface KeyFormValues {
  label: string;
  org_label: string;
  api_key: string;
  monthly_budget_usd: string;
  soft_limit_pct: string;
  weight: string;
  reason: string;
}

/** First problem with the form, or null. `requireKey` is true on create (the secret is never edited). */
export function validateKeyForm(v: KeyFormValues, requireKey: boolean): string | null {
  if (!v.label.trim()) return "Give the key a label";
  if (v.label.trim().length > 120) return "Label is at most 120 characters";
  if (v.org_label.trim().length > 120) return "Org label is at most 120 characters";
  if (requireKey && !v.api_key.trim()) return "Paste the API key";
  if (requireKey && /\s/.test(v.api_key.trim())) return "The API key cannot contain spaces";
  const budget = Number(v.monthly_budget_usd);
  if (v.monthly_budget_usd.trim() === "" || !Number.isFinite(budget) || budget <= 0) return "Monthly budget must be more than $0";
  const soft = Number(v.soft_limit_pct);
  if (!Number.isInteger(soft) || soft < 1 || soft > 100) return "Soft limit is a whole percent from 1 to 100";
  const weight = Number(v.weight);
  if (!Number.isInteger(weight) || weight < 1 || weight > 1000) return "Weight is a whole number from 1 to 1000";
  if (!v.reason.trim()) return "Say why (it lands in the change log)";
  return null;
}

/** Anthropic console keys look like sk-ant-…; anything else is probably a paste mistake (warn, don't block). */
export function looksLikeAnthropicKey(key: string): boolean {
  return /^sk-ant-/.test(key.trim());
}
