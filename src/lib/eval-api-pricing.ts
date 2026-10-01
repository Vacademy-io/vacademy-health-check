// Pure helpers for the Pricing & API tab, the AI Settings rate card and the
// Credits page. No React and no "@/" imports, so `node --test tests/` can run
// them directly (see tests/eval-api-pricing.test.ts).
import type {
  ActiveOverride,
  ApiSegment,
  InstituteToolPricingRow,
  PricingHistoryEntry,
  SetInstituteToolPricingRequest,
  ToolPricingOverride,
  ToolRate,
} from "../types/eval-api";

/** The tool key API traffic bills under — per page, fixed price. */
export const API_EVAL_TOOL_KEY = "copy_check_evaluation_api";
/** The dashboard copy-check tool — per question, max(quote, actual). */
export const DASHBOARD_EVAL_TOOL_KEY = "copy_check_evaluation";

export const API_EVAL_TOOL_LABEL = "AI evaluation — API partners (per page, fixed price)";

/** Same ceiling the backend enforces on a global rate edit. */
export const MAX_RATE = 10000;

/** Daily copy quota per segment preset (spec §6.1); unset segment = 2,000. */
export const SEGMENT_PRESETS: Record<ApiSegment, number> = {
  school: 3000,
  university: 6000,
  upsc: 10000,
};
export const DEFAULT_DAILY_COPY_QUOTA = 2000;

export function presetQuota(segment: ApiSegment | null | undefined): number {
  return segment ? SEGMENT_PRESETS[segment] : DEFAULT_DAILY_COPY_QUOTA;
}

/** Scopes an institute key can carry in Phase 1 (spec §6.2). */
export const PHASE1_SCOPES = [
  { scope: "evaluation:read", hint: "read exams, submissions, results, credits" },
  { scope: "evaluation:write", hint: "create exams, upload copies, submit, re-evaluate" },
  { scope: "evaluation:review", hint: "override marks" },
  { scope: "evaluation:finalize", hint: "finalize and unfinalize results" },
] as const;
export const DEFAULT_SCOPES = ["evaluation:read", "evaluation:write"];

/** Display label for a tool; the API default price row gets its spec label. */
export function toolLabel(toolKey: string, fallback?: string | null): string {
  if (toolKey === API_EVAL_TOOL_KEY) return API_EVAL_TOOL_LABEL;
  return fallback || toolKey.replace(/_/g, " ");
}

const UNIT_NOUNS: Record<string, [string, string]> = {
  pages: ["page", "pages"],
  questions: ["question", "questions"],
  audio_minutes: ["minute", "minutes"],
  chars: ["length unit", "length units"],
  images: ["image", "images"],
  flat: ["call", "calls"],
};

/** "page" / "pages" for a tool's unit_field. */
export function unitNoun(unitField: string | undefined, count = 1): string {
  const pair = UNIT_NOUNS[unitField ?? ""] ?? ["unit", "units"];
  return count === 1 ? pair[0] : pair[1];
}

/** Sample sizes the live preview prices, chosen to match real papers. */
export function previewSamples(unitField: string | undefined): number[] {
  switch (unitField) {
    case "pages":
      return [3, 12, 32];
    case "questions":
      return [10, 40, 64];
    case "audio_minutes":
      return [1, 10, 30];
    case "flat":
      return [1];
    default:
      return [1, 10];
  }
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Round up to a whole credit like ToolCostEstimator._ceil_whole, without float dust (1 + 0.2×40 ≠ 9.000…02 → 10). */
export function ceilWhole(value: number): number {
  return Math.ceil(Math.round(value * 1e6) / 1e6);
}

function slabCredits(slabs: unknown[], count: number): number {
  for (const slab of slabs) {
    const s = (slab ?? {}) as { upto?: unknown; credits?: unknown };
    const upto = num(s.upto);
    if (upto === null || count <= upto) return num(s.credits) ?? 0;
  }
  const last = (slabs[slabs.length - 1] ?? {}) as { credits?: unknown };
  return num(last.credits) ?? 0;
}

export function typedPerAnswer(rate: Pick<ToolRate, "params"> | null | undefined): number | null {
  return num(rate?.params?.typed_per_answer);
}

/**
 * Credits for `units` of a tool at `rate` — the estimator's parametric formula
 * (questions with optional slabs, pages, images, minutes, flat), rounded up.
 * `typed` prices typed answers: units × params.typed_per_answer.
 */
export function computeCredits(rate: ToolRate, units: number, opts: { typed?: boolean } = {}): number {
  const flat = Math.max(0, rate.flat ?? 0);
  const perUnit = Math.max(0, rate.per_unit ?? 0);
  const n = Math.max(0, Math.floor(units));
  if (opts.typed) {
    const perAnswer = typedPerAnswer(rate);
    if (perAnswer !== null) return ceilWhole(n * perAnswer);
  }
  const params = rate.params ?? {};
  switch (rate.unit_field) {
    case "questions": {
      const slabs = params.slabs;
      const q = Array.isArray(slabs) && slabs.length > 0 ? slabCredits(slabs, n) : n * perUnit;
      return ceilWhole(flat + q);
    }
    case "audio_minutes": {
      const min = num(params.min_credits) ?? 0;
      return ceilWhole(Math.max(min, flat + n * perUnit));
    }
    case "flat":
      return ceilWhole(flat);
    default:
      return ceilWhole(flat + n * perUnit);
  }
}

/** True when the rate charges exactly the quote (no token overage). */
export function isFixedPrice(rate: ToolRate | null | undefined, toolKey?: string): boolean {
  if (toolKey === API_EVAL_TOOL_KEY) return true;
  return rate?.params?.fixed_price === true || rate?.no_token_overage === true;
}

/** "12-page copy = 12 credits (standard 12)". */
export function previewLine(rate: ToolRate, standard: ToolRate | null, units: number): string {
  const credits = computeCredits(rate, units);
  const noun = unitNoun(rate.unit_field, 1);
  const head =
    rate.unit_field === "flat"
      ? `One call = ${credits} credit${credits === 1 ? "" : "s"}`
      : `${units}-${noun} copy = ${credits} credit${credits === 1 ? "" : "s"}`;
  if (!standard) return head;
  return `${head} (standard ${computeCredits(standard, units)})`;
}

/** "4 typed answers = 4 credits (standard 4)", or null when the tool has no typed rate. */
export function typedPreviewLine(rate: ToolRate, standard: ToolRate | null, answers = 4): string | null {
  if (typedPerAnswer(rate) === null) return null;
  const credits = computeCredits(rate, answers, { typed: true });
  const head = `${answers} typed answer${answers === 1 ? "" : "s"} = ${credits} credit${credits === 1 ? "" : "s"}`;
  if (!standard || typedPerAnswer(standard) === null) return head;
  return `${head} (standard ${computeCredits(standard, answers, { typed: true })})`;
}

/** One-line rate, e.g. "1 credit per page" or "1 + 0.2 per question". */
export function formatRate(rate: ToolRate | null | undefined): string {
  if (!rate) return "—";
  const flat = rate.flat ?? 0;
  const per = rate.per_unit ?? 0;
  if (rate.unit_field === "flat") return `${flat} per call`;
  if (Array.isArray(rate.params?.slabs) && rate.params!.slabs.length > 0) {
    return `${flat > 0 ? `${flat} + ` : ""}slab price`;
  }
  const unit = unitNoun(rate.unit_field, 1);
  return flat > 0 ? `${flat} + ${per} per ${unit}` : `${per} per ${unit}`;
}

/** Source badge for a rate-card row: an override is a contract price. */
export function sourceBadge(source: string | null | undefined): { label: "Contract" | "Standard"; detail: string } {
  const s = source ?? "";
  if (s.startsWith("override")) return { label: "Contract", detail: "institute override" };
  if (s.startsWith("partner")) return { label: "Contract", detail: "partner price" };
  if (s === "default") return { label: "Standard", detail: "code default" };
  return { label: "Standard", detail: "global rate" };
}

// ── Override edit dialog ────────────────────────────────────────────────────

export interface OverrideDraft {
  /** Blank = inherit the global value. */
  flat: string;
  perUnit: string;
  typedPerAnswer: string;
  noOverage: boolean;
  reason: string;
}

export function draftFromRow(row: InstituteToolPricingRow): OverrideDraft {
  const o = row.override;
  const oTyped = typedPerAnswer(o ?? undefined);
  return {
    flat: o?.flat != null ? String(o.flat) : "",
    perUnit: o?.per_unit != null ? String(o.per_unit) : "",
    typedPerAnswer: oTyped != null ? String(oTyped) : "",
    noOverage: o?.no_token_overage ?? false,
    reason: "",
  };
}

/** The rate the draft would produce: blank fields inherit the global row. */
export function draftRate(row: InstituteToolPricingRow, draft: OverrideDraft): ToolRate {
  const g = row.global;
  const flat = num(draft.flat);
  const per = num(draft.perUnit);
  const typed = num(draft.typedPerAnswer);
  const params = { ...(g.params ?? {}) } as Record<string, unknown>;
  if (typed !== null) params.typed_per_answer = typed;
  return {
    flat: flat ?? g.flat,
    per_unit: per ?? g.per_unit,
    unit_field: g.unit_field ?? row.effective.unit_field,
    params,
    no_token_overage: draft.noOverage,
  };
}

function checkRate(label: string, raw: string): string | null {
  if (raw.trim() === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > MAX_RATE) return `${label} must be between 0 and ${MAX_RATE}`;
  return null;
}

/** Validates a draft and builds the PUT body, or returns the first error. */
export function buildOverrideRequest(
  row: InstituteToolPricingRow,
  draft: OverrideDraft
): { ok: true; body: SetInstituteToolPricingRequest } | { ok: false; error: string } {
  const reason = draft.reason.trim();
  if (!reason) return { ok: false, error: "A reason (contract reference) is required" };
  const noun = unitNoun(row.global.unit_field, 1);
  const err =
    checkRate("Base credits", draft.flat) ??
    checkRate(`Credits per ${noun}`, draft.perUnit) ??
    checkRate("Credits per typed answer", draft.typedPerAnswer);
  if (err) return { ok: false, error: err };
  const flat = num(draft.flat);
  const per = num(draft.perUnit);
  const typed = num(draft.typedPerAnswer);
  if (flat === null && per === null && typed === null && !draft.noOverage) {
    return { ok: false, error: "Set at least one price, or use Revert to go back to the standard rate" };
  }
  const body: SetInstituteToolPricingRequest = { reason, no_token_overage: draft.noOverage };
  if (flat !== null) body.flat_base_credits = flat;
  if (per !== null) body.per_unit_credits = per;
  // params replace the global params wholesale (non-null override fields win), so
  // carry the global ones and change only typed_per_answer.
  if (typed !== null) body.params = { ...(row.global.params ?? {}), typed_per_answer: typed };
  return { ok: true, body };
}

// ── Response normalisers (tolerate array or wrapped bodies, both field namings) ──

function list(raw: unknown, keys: string[]): Record<string, unknown>[] {
  if (Array.isArray(raw)) return raw as Record<string, unknown>[];
  if (raw && typeof raw === "object") {
    for (const k of keys) {
      const v = (raw as Record<string, unknown>)[k];
      if (Array.isArray(v)) return v as Record<string, unknown>[];
    }
  }
  return [];
}

function str(v: unknown): string | null {
  return v === null || v === undefined || v === "" ? null : String(v);
}

function obj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function rateOf(raw: unknown, fallbackUnit?: string): ToolRate {
  const r = obj(raw) ?? {};
  return {
    flat: num(r.flat ?? r.flat_base_credits),
    per_unit: num(r.per_unit ?? r.per_unit_credits),
    unit_field: str(r.unit_field) ?? fallbackUnit,
    params: obj(r.params ?? r.params_json),
    no_token_overage: r.no_token_overage === true,
  };
}

function overrideOf(raw: unknown): ToolPricingOverride | null {
  const r = obj(raw);
  if (!r) return null;
  return {
    id: str(r.id) ?? "",
    flat: num(r.flat ?? r.flat_base_credits),
    per_unit: num(r.per_unit ?? r.per_unit_credits),
    params: obj(r.params ?? r.params_json),
    no_token_overage: r.no_token_overage === true,
    effective_from: str(r.effective_from),
    reason: str(r.reason),
    created_by: str(r.created_by),
    created_at: str(r.created_at),
  };
}

export function normalizeInstitutePricing(raw: unknown): InstituteToolPricingRow[] {
  return list(raw, ["tools", "items", "rows"]).map((r) => {
    const global = rateOf(r.global);
    const override = overrideOf(r.override);
    return {
      tool_key: String(r.tool_key ?? ""),
      label: str(r.label) ?? String(r.tool_key ?? ""),
      global,
      override,
      effective: rateOf(r.effective, global.unit_field),
      source: str(r.source) ?? (override ? `override:${override.id}` : "global"),
    };
  });
}

export function normalizeOverrides(raw: unknown): ActiveOverride[] {
  return list(raw, ["overrides", "items", "institutes"])
    .map((r) => ({
      institute_id: String(r.institute_id ?? ""),
      tool_key: String(r.tool_key ?? ""),
      id: str(r.id ?? r.override_id),
      flat: num(r.flat ?? r.flat_base_credits),
      per_unit: num(r.per_unit ?? r.per_unit_credits),
      no_token_overage: r.no_token_overage === true,
      effective_from: str(r.effective_from),
      reason: str(r.reason),
      created_by: str(r.created_by),
    }))
    .filter((o) => o.institute_id && o.tool_key);
}

/**
 * History rows come in two shapes: global edits from ai_tool_pricing_history
 * ({old_json, new_json, changed_by, changed_at}) and institute_tool_pricing rows
 * ({flat_base_credits, …, created_by, effective_from, effective_to}). Newest first.
 */
export function normalizeHistory(raw: unknown): PricingHistoryEntry[] {
  const rows = list(raw, ["history", "entries", "items"]).map((r, i): PricingHistoryEntry => {
    const isGlobal = r.scope === "global" || r.kind === "global" || "new_json" in r;
    const src = isGlobal ? (obj(r.new_json) ?? r) : r;
    return {
      id: str(r.id) ?? `row-${i}`,
      scope: isGlobal ? "global" : "override",
      tool_key: String(r.tool_key ?? src.tool_key ?? ""),
      institute_id: isGlobal ? null : str(r.institute_id),
      flat: num(src.flat ?? src.flat_base_credits),
      per_unit: num(src.per_unit ?? src.per_unit_credits),
      params: obj(src.params ?? src.params_json),
      no_token_overage: typeof src.no_token_overage === "boolean" ? src.no_token_overage : null,
      reason: str(r.reason),
      changed_by: str(r.changed_by ?? r.created_by),
      changed_at: str(r.changed_at ?? r.effective_from ?? r.created_at),
      effective_to: str(r.effective_to),
      ended_by: str(r.ended_by),
    };
  });
  return rows.sort((a, b) => (b.changed_at ?? "").localeCompare(a.changed_at ?? ""));
}

/** institute count per tool_key, for "N institutes override". */
export function overrideCountsByTool(overrides: ActiveOverride[]): Record<string, number> {
  const seen = new Map<string, Set<string>>();
  for (const o of overrides) {
    const set = seen.get(o.tool_key) ?? new Set<string>();
    set.add(o.institute_id);
    seen.set(o.tool_key, set);
  }
  return Object.fromEntries(Array.from(seen.entries()).map(([k, v]) => [k, v.size]));
}

/** tool keys per institute, for the Credits page "Custom pricing" badge. */
export function overriddenToolsByInstitute(overrides: ActiveOverride[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const o of overrides) {
    const tools = (out[o.institute_id] ??= []);
    if (!tools.includes(o.tool_key)) tools.push(o.tool_key);
  }
  return out;
}

// ── Bulk enable ─────────────────────────────────────────────────────────────

const INSTITUTE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{7,63}$/;

/** Splits a pasted list (newlines, commas, spaces) into unique ids plus the tokens that don't look like ids. */
export function parseInstituteIds(text: string): { ids: string[]; invalid: string[] } {
  const ids: string[] = [];
  const invalid: string[] = [];
  for (const token of text.split(/[\s,;]+/)) {
    const t = token.trim().replace(/^["']|["']$/g, "");
    if (!t) continue;
    if (!INSTITUTE_ID_RE.test(t)) {
      if (!invalid.includes(t)) invalid.push(t);
    } else if (!ids.includes(t)) {
      ids.push(t);
    }
  }
  return { ids, invalid };
}

/** Optional integer input: blank → null, otherwise a non-negative integer or NaN. */
export function parseOptionalInt(raw: string): number | null {
  if (raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : Number.NaN;
}

/** Readable message from an axios error: FastAPI `detail`, Spring `ex` / `message`, else the error text. */
export function errorDetail(err: unknown, fallback = "Request failed"): string {
  const data = (err as { response?: { data?: unknown } })?.response?.data;
  if (typeof data === "string" && data.trim()) return data.trim().slice(0, 300);
  const d = obj(data);
  if (d) {
    const detail = d.detail;
    if (typeof detail === "string" && detail) return detail;
    if (Array.isArray(detail) && detail.length > 0) {
      const first = obj(detail[0]);
      if (first && typeof first.msg === "string") return first.msg;
    }
    for (const k of ["ex", "message", "error"]) {
      const v = d[k];
      if (typeof v === "string" && v) return v;
      const nested = obj(v);
      if (nested && typeof nested.message === "string") return nested.message;
    }
  }
  const msg = (err as { message?: unknown })?.message;
  return typeof msg === "string" && msg ? msg : fallback;
}
