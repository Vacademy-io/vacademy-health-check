// Pure helpers for the Model defaults page. No React and no "@/" imports, so
// `node --test tests/` can run them directly (see tests/model-defaults.test.ts).
import type { ModelOption, UseCaseEntry } from "../types/model-defaults";

/** The platform-wide default every AI feature should use (served via Isoquant). */
export const GLM_MODEL_ID = "z-ai/glm-5.3-flash";
/** The one non-GLM fallback the platform owner allows. */
export const GEMINI_FALLBACK_ID = "google/gemini-2.5-flash";
/** Copy-check deduction re-check — changes student marks, so it is surfaced on its own. */
export const COPY_CHECK_DEDUCTION = "copy_check_deduction";

/** A dry run carries this placeholder reason; the real one is asked for before applying. */
export const DRY_RUN_REASON = "dry-run preview";

/** Display order of use-case groups; unknown groups go last, alphabetically. */
export const GROUP_ORDER = [
  "Learner AI",
  "Content & courses",
  "Assessment & evaluation",
  "Video",
  "Admin & CRM",
  "Platform",
];

const NON_CHAT_CATEGORIES = new Set(["image", "video", "embedding", "tts"]);

/** Chat models only: drop image / video / embedding / TTS registry rows. */
export function isChatModel(m: Pick<ModelOption, "category">): boolean {
  return !NON_CHAT_CATEGORIES.has((m.category || "").toLowerCase());
}

export type Gateway = { key: string; label: string };

/** Which gateway serves a model: llm.model_routes wins; anything unrouted goes via OpenRouter. */
export function gatewayFor(modelId: string | null | undefined, routes: Record<string, string> | undefined): Gateway | null {
  if (!modelId) return null;
  const key = (routes?.[modelId] || "openrouter").toLowerCase();
  const label = key === "isoquant" ? "Isoquant" : key === "openrouter" ? "OpenRouter" : key.charAt(0).toUpperCase() + key.slice(1);
  return { key, label };
}

/** "$0.10 in · $0.40 out /1M" from string DECIMALs; null when the registry has no price. */
export function formatPrice(m: Pick<ModelOption, "input_price_per_1m" | "output_price_per_1m"> | undefined): string | null {
  if (!m) return null;
  const fmt = (v: string | null) => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    if (!Number.isFinite(n)) return v;
    return `$${n < 1 ? Number(n.toPrecision(3)) : Number(n.toFixed(2))}`;
  };
  const input = fmt(m.input_price_per_1m);
  const output = fmt(m.output_price_per_1m);
  if (!input && !output) return null;
  return `${input ?? "?"} in · ${output ?? "?"} out /1M`;
}

export function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

/** Short model label: the registry name, else the part after the provider slash. */
export function modelName(modelId: string | null | undefined, byId: Map<string, ModelOption>): string {
  if (!modelId) return "—";
  return byId.get(modelId)?.name || modelId.split("/").pop() || modelId;
}

/** Group use cases by their `group`, in GROUP_ORDER, entries sorted by label. */
export function groupUseCases(useCases: UseCaseEntry[]): [string, UseCaseEntry[]][] {
  const byGroup = new Map<string, UseCaseEntry[]>();
  for (const u of useCases) {
    const g = u.group || "Other";
    const list = byGroup.get(g) ?? [];
    list.push(u);
    byGroup.set(g, list);
  }
  const rank = (g: string) => {
    const i = GROUP_ORDER.indexOf(g);
    return i === -1 ? GROUP_ORDER.length : i;
  };
  return Array.from(byGroup.entries())
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
    .map(([g, list]) => [g, list.slice().sort((a, b) => (a.label || a.use_case).localeCompare(b.label || b.use_case))]);
}

/** Case-insensitive match on label, use case id, description and the current models. */
export function matchesUseCase(u: UseCaseEntry, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [u.label, u.use_case, u.description, u.group, u.row?.default_model_id, u.row?.fallback_model_id]
    .filter(Boolean)
    .some((s) => String(s).toLowerCase().includes(q));
}

export function matchesModel(m: ModelOption, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [m.name, m.model_id, m.provider].some((s) => (s || "").toLowerCase().includes(q));
}

/**
 * Render a change-log value (a model id string or a row snapshot object) as text.
 * For objects pass `other` to keep only the keys that changed between old and new.
 */
export function describeValue(value: unknown, other?: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value !== "object") return String(value);
  if (Array.isArray(value)) return value.map((v) => describeValue(v)).join(", ");
  const rec = value as Record<string, unknown>;
  const otherRec = other && typeof other === "object" && !Array.isArray(other) ? (other as Record<string, unknown>) : null;
  const keys = Object.keys(rec).filter((k) => !otherRec || JSON.stringify(rec[k]) !== JSON.stringify(otherRec[k]));
  const shown = (keys.length > 0 ? keys : Object.keys(rec)).filter((k) => !["updated_at", "created_at", "id"].includes(k));
  if (shown.length === 0) return "—";
  return shown
    .map((k) => {
      const v = rec[k];
      return `${k.replace(/_model_id$|_id$/, "")}: ${v === null || v === undefined ? "none" : typeof v === "object" ? JSON.stringify(v) : String(v)}`;
    })
    .join(" · ");
}

/** DOM id of a use-case row, for "jump to" links. */
export function rowAnchorId(useCase: string): string {
  return `use-case-${useCase}`;
}

/** True for an axios-style error carrying HTTP 404 — the backend isn't deployed yet. */
export function isNotFound(err: unknown): boolean {
  return (err as { response?: { status?: number } } | null)?.response?.status === 404;
}
