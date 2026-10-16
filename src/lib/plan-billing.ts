// Pure helpers for paid AI subscriptions in the portal: plan listing (storefront marketing),
// audience rules, the storefront rollout page, the subscription billing timeline (charges,
// mandates, staff money actions) and the invoice / credit-note list. No React and no "@/"
// imports, so `node --test tests/` runs them directly (tests/plan-billing.test.ts).
import { toNumber } from "./metering.ts";
import { parseRupeesToMinor, formatInrMinor, toLocalInput } from "./plans.ts";
import type { AiSettingEntry } from "../types/ai-settings";
import type {
  AudienceMode,
  AudiencePreview,
  AudiencePutBody,
  AudienceRule,
  AudienceRuleKind,
  BillingDocKind,
  BillingDocument,
  BrandMode,
  ChargeStatus,
  MandateStatus,
  MarkPaidBody,
  PlanListing,
  PlanListingPatch,
  RefundBody,
  StorefrontInstitute,
  StorefrontInstitutePut,
  StorefrontMode,
  StorefrontState,
  SubscriptionBilling,
  SubscriptionCharge,
  SubscriptionMandate,
} from "../types/plan-billing";

// ---------------------------------------------------------------- vocabulary

/** AI setting: OFF | ALLOWLIST | SEGMENTS | ALL. OFF (the default) hides the storefront everywhere. */
export const STOREFRONT_MODE_SETTING_KEY = "billing.storefront.mode";
/** AI setting: false (default) = no subscription payment links or debits are created. */
export const SUBSCRIPTION_PAYMENTS_SETTING_KEY = "billing.subscriptions.payments.enabled";
/** AI setting: false (default) = no mandate is registered or charged. */
export const AUTOPAY_SETTING_KEY = "billing.autopay.enabled";

export const STOREFRONT_MODES: readonly StorefrontMode[] = ["OFF", "ALLOWLIST", "SEGMENTS", "ALL"];
export const AUDIENCE_MODES: readonly AudienceMode[] = ["ALLOWLIST", "SEGMENT", "ALL"];
export const BRAND_MODES: readonly BrandMode[] = ["VACADEMY", "NEUTRAL"];
export const CHARGE_STATUSES: readonly ChargeStatus[] = ["DUE", "LINK_SENT", "DEBIT_SCHEDULED", "PAID", "FAILED", "VOID", "WAIVED", "REFUNDED", "PARTIALLY_REFUNDED"];
export const MANDATE_STATUSES: readonly MandateStatus[] = ["PENDING", "ACTIVE", "PAUSED", "CANCELLED", "REJECTED", "EXPIRED"];

export const STOREFRONT_MODE_LABEL: Record<StorefrontMode, string> = {
  OFF: "Off",
  ALLOWLIST: "Allowlist",
  SEGMENTS: "Segments",
  ALL: "All institutes",
};
export const STOREFRONT_MODE_HINT: Record<StorefrontMode, string> = {
  OFF: "No institute sees the storefront. Super admins can still assign paid plans.",
  ALLOWLIST: "Only institutes on the storefront allowlist below, or switched on individually, see it.",
  SEGMENTS: "Institutes in the listed segments, plus the allowlist and individual switches, see it.",
  ALL: "Every institute's admins see it, except institutes switched off individually.",
};
export const AUDIENCE_MODE_LABEL: Record<AudienceMode, string> = {
  ALLOWLIST: "Allowlist",
  SEGMENT: "Segments",
  ALL: "Everyone with the storefront",
};
export const AUDIENCE_MODE_HINT: Record<AudienceMode, string> = {
  ALLOWLIST: "Offered only to the institutes listed below.",
  SEGMENT: "Offered to institutes in the segments below (and any institute listed).",
  ALL: "Offered to every institute that can see the storefront.",
};
export const BRAND_MODE_LABEL: Record<BrandMode, string> = { VACADEMY: "Vacademy", NEUTRAL: "Neutral (white-label)" };
export const BRAND_MODE_HINT: Record<BrandMode, string> = {
  VACADEMY: "Storefront, invoice trade name, payment page and billing emails may say Vacademy.",
  NEUTRAL: "Nothing says Vacademy. Invoices show only the legal supplier and its GSTIN.",
};

export const CHARGE_STATUS_LABEL: Record<string, string> = {
  DUE: "Due",
  LINK_SENT: "Link sent",
  DEBIT_SCHEDULED: "Debit scheduled",
  PAID: "Paid",
  FAILED: "Failed",
  VOID: "Void",
  WAIVED: "Waived",
  REFUNDED: "Refunded",
  PARTIALLY_REFUNDED: "Partly refunded",
};
export const CHARGE_KIND_LABEL: Record<string, string> = { PERIOD: "Period", UPGRADE: "Upgrade (pro-rata)" };
export const MANDATE_STATUS_LABEL: Record<string, string> = {
  PENDING: "Awaiting approval",
  ACTIVE: "Active",
  PAUSED: "Paused",
  CANCELLED: "Cancelled",
  REJECTED: "Rejected",
  EXPIRED: "Expired",
};
export const MANDATE_METHOD_LABEL: Record<string, string> = { UPI: "UPI Autopay", CARD: "Card", EMANDATE: "Bank e-mandate" };
export const ITEM_KIND_LABEL: Record<string, string> = { CREDIT_PACK: "Credit pack", AI_SUBSCRIPTION: "AI plan" };

/** Per-debit ceiling without additional authentication (RBI e-mandate rules); larger plans get payment links. */
export const AFA_FREE_CEILING_MINOR = 15_000_00;

// ---------------------------------------------------------------- small parsers

const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const bool = (v: unknown, fallback: boolean): boolean => (typeof v === "boolean" ? v : fallback);
const boolOrNull = (v: unknown): boolean | null => (typeof v === "boolean" ? v : v === "true" ? true : v === "false" ? false : null);
const numOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = toNumber(v, Number.NaN);
  return Number.isNaN(n) ? null : n;
};
const pickOrNull = <T extends string>(list: readonly T[], v: unknown): T | null =>
  typeof v === "string" && (list as readonly string[]).includes(v.toUpperCase()) ? (v.toUpperCase() as T) : null;

function listOf(raw: unknown, ...keys: string[]): unknown[] {
  if (Array.isArray(raw)) return raw;
  const o = obj(raw);
  for (const k of [...keys, "items", "rows", "data", "results"]) {
    if (Array.isArray(o[k])) return o[k] as unknown[];
  }
  return [];
}

/** The string value of an AI setting (effective first). null = not registered. */
export function settingString(entry: AiSettingEntry | null | undefined): string | null {
  if (!entry) return null;
  for (const v of [entry.effective, entry.value, entry.default]) {
    if (typeof v === "string" && v !== "") return v;
  }
  return null;
}

/** billing.storefront.mode; anything unknown or unregistered reads as OFF (dark by default). */
export function storefrontModeOf(entry: AiSettingEntry | null | undefined): StorefrontMode {
  return pickOrNull(STOREFRONT_MODES, settingString(entry)) ?? "OFF";
}

// ---------------------------------------------------------------- brand-word lint

/** Platform brand tokens that must never reach a tenant-facing field (white-labelled institutes see them too). */
export const BRAND_TOKENS: readonly string[] = ["vacademy", "vidyayatan"];

/** The brand tokens a text contains (case-insensitive, ignoring spaces, dots and zero-width characters). */
export function brandWords(text: string | null | undefined): string[] {
  if (!text) return [];
  const squashed = text.toLowerCase().replace(/[\s.\-_\u200b-\u200d\ufeff]/g, "");
  return BRAND_TOKENS.filter((t) => squashed.includes(t));
}

export interface BrandFinding {
  field: string;
  words: string[];
}

/** Every tenant-facing field of a listing (plus the plan's name and description) with a brand word. */
export function lintListing(fields: { name?: string | null; description?: string | null; tagline?: string | null; badge?: string | null; highlights?: string[] }): BrandFinding[] {
  const out: BrandFinding[] = [];
  const add = (field: string, text: string | null | undefined) => {
    const words = brandWords(text);
    if (words.length > 0) out.push({ field, words });
  };
  add("Plan name", fields.name);
  add("Plan description", fields.description);
  add("Tagline", fields.tagline);
  add("Badge", fields.badge);
  (fields.highlights ?? []).forEach((h, i) => add(`Highlight ${i + 1}`, h));
  return out;
}

// ---------------------------------------------------------------- listing

/** Mirrors ai-service ListingPatch (tagline ≤160, badge ≤32, ≤6 highlights of ≤80); a little stricter where it reads better. */
export const LISTING_LIMITS = { tagline: 140, badge: 24, highlight: 80, highlights: 6, sortMax: 9999 } as const;

function highlightsOf(v: unknown): string[] {
  let raw: unknown = v;
  if (typeof v === "string" && v.trim().startsWith("[")) {
    try {
      raw = JSON.parse(v);
    } catch {
      raw = [];
    }
  }
  if (!Array.isArray(raw)) return [];
  return raw
    .map((h) => (typeof h === "string" ? h : str(obj(h).text) ?? str(obj(h).label)))
    .filter((h): h is string => !!h && h.trim() !== "")
    .map((h) => h.trim());
}

/** The listing columns of an ai_plan row (top level or under "listing"). Unlisted and ALLOWLIST by default. */
export function normalizeListing(raw: unknown): PlanListing {
  const top = obj(raw);
  const r = { ...top, ...obj(top.listing) };
  return {
    listed: bool(r.listed, false),
    tagline: str(r.tagline),
    highlights: highlightsOf(r.highlights),
    badge: str(r.badge),
    sort_order: toNumber(r.sort_order, 100),
    audience_mode: pickOrNull(AUDIENCE_MODES, r.audience_mode) ?? "ALLOWLIST",
  };
}

export interface ListingDraft {
  listed: boolean;
  tagline: string;
  /** One highlight per entry; blank entries are dropped on save. */
  highlights: string[];
  badge: string;
  sort_order: string;
  audience_mode: AudienceMode;
  reason: string;
}

export function listingDraft(l: PlanListing): ListingDraft {
  return {
    listed: l.listed,
    tagline: l.tagline ?? "",
    highlights: l.highlights.length > 0 ? [...l.highlights] : [""],
    badge: l.badge ?? "",
    sort_order: String(l.sort_order),
    audience_mode: l.audience_mode,
    reason: "",
  };
}

/**
 * PATCH /plans/{id}/listing body. Blocks brand words (the server lints too), over-long text and
 * listing a plan that has no PUBLISHED INR version (subscriptions are INR only).
 */
export function buildListingPatch(
  d: ListingDraft,
  ctx: { name?: string | null; description?: string | null; hasPublishedInr: boolean }
): { body: PlanListingPatch } | { error: string } {
  const tagline = d.tagline.trim();
  const badge = d.badge.trim();
  const highlights = d.highlights.map((h) => h.trim()).filter((h) => h !== "");
  if (tagline.length > LISTING_LIMITS.tagline) return { error: `Tagline: at most ${LISTING_LIMITS.tagline} characters` };
  if (badge.length > LISTING_LIMITS.badge) return { error: `Badge: at most ${LISTING_LIMITS.badge} characters` };
  if (highlights.length > LISTING_LIMITS.highlights) return { error: `At most ${LISTING_LIMITS.highlights} highlights` };
  const long = highlights.findIndex((h) => h.length > LISTING_LIMITS.highlight);
  if (long >= 0) return { error: `Highlight ${long + 1}: at most ${LISTING_LIMITS.highlight} characters` };
  if (new Set(highlights.map((h) => h.toLowerCase())).size !== highlights.length) return { error: "Two highlights say the same thing" };
  const sortText = d.sort_order.trim();
  const sort = sortText === "" ? 100 : Number(sortText);
  if (!Number.isInteger(sort) || sort < 0 || sort > LISTING_LIMITS.sortMax) return { error: `Sort order: a whole number from 0 to ${LISTING_LIMITS.sortMax}` };
  const lint = lintListing({ name: ctx.name, description: ctx.description, tagline, badge, highlights });
  if (lint.length > 0) {
    const f = lint[0];
    return { error: `${f.field} contains "${f.words.join('", "')}". Tenant-facing text must not name the platform (white-labelled institutes see it).` };
  }
  if (d.listed && !ctx.hasPublishedInr) return { error: "Publish an INR version before listing this plan (subscriptions are sold in INR only)" };
  if (d.listed && tagline === "") return { error: "A listed plan needs a tagline" };
  if (d.reason.trim() === "") return { error: "Give a reason (it lands in the change log)" };
  return {
    body: {
      listed: d.listed,
      tagline: tagline === "" ? null : tagline,
      highlights,
      badge: badge === "" ? null : badge,
      sort_order: sort,
      audience_mode: d.audience_mode,
      reason: d.reason.trim(),
    },
  };
}

/** "₹5,000 / month + GST" — the storefront price line (tax is added on top unless inclusive). */
export function storefrontPriceLine(v: { price_minor: number; period_months: number; is_tax_inclusive: boolean }): string {
  const per = v.period_months === 1 ? "month" : v.period_months === 12 ? "year" : `${v.period_months} months`;
  return `${formatInrMinor(v.price_minor)} / ${per}${v.is_tax_inclusive ? " incl. GST" : " + GST"}`;
}

// ---------------------------------------------------------------- audience

/** Segment keys: lowercase, start with a letter. Reserved: pilot, internal. */
export const SEGMENT_KEY_RE = /^[a-z][a-z0-9_-]{0,47}$/;

const ruleKind = (v: unknown): AudienceRuleKind => (typeof v === "string" && v.toUpperCase() === "EXCLUDE" ? "EXCLUDE" : "INCLUDE");

export function normalizeAudienceRule(raw: unknown): AudienceRule | null {
  const r = obj(raw);
  const institute_id = str(r.institute_id);
  const segment_key = str(r.segment_key) ?? str(r.segment);
  if (!institute_id && !segment_key) return null;
  return { rule: ruleKind(r.rule), institute_id, institute_name: str(r.institute_name), segment_key: institute_id ? null : segment_key };
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.trim()) : []);

/**
 * ai-service shape {institute_ids, segments, exclude_institute_ids, exclude_segments} (GET
 * /plans/{id}/audience, GET /storefront/audience), or a list of rule rows.
 */
export function normalizeAudience(raw: unknown): AudienceRule[] {
  const o = obj(raw);
  const grouped = ["institute_ids", "segments", "exclude_institute_ids", "exclude_segments"].some((k) => Array.isArray(o[k]));
  let rules: AudienceRule[];
  if (grouped) {
    const mk = (rule: AudienceRuleKind, inst: string | null, seg: string | null): AudienceRule => ({ rule, institute_id: inst, institute_name: null, segment_key: seg });
    rules = [
      ...strings(o.institute_ids).map((i) => mk("INCLUDE", i, null)),
      ...strings(o.segments).map((g) => mk("INCLUDE", null, g)),
      ...strings(o.exclude_institute_ids).map((i) => mk("EXCLUDE", i, null)),
      ...strings(o.exclude_segments).map((g) => mk("EXCLUDE", null, g)),
    ];
  } else {
    rules = listOf(raw, "rules", "audience")
      .map(normalizeAudienceRule)
      .filter((r): r is AudienceRule => r !== null);
  }
  return rules.reduce<AudienceRule[]>((acc, r) => addRule(acc, r), []);
}

/** Same target (institute or segment), whatever the rule: one target has one rule. */
export function sameRule(a: Pick<AudienceRule, "institute_id" | "segment_key">, b: Pick<AudienceRule, "institute_id" | "segment_key">): boolean {
  return (a.institute_id ?? "") === (b.institute_id ?? "") && (a.segment_key ?? "") === (b.segment_key ?? "");
}

/** Adds a rule; a rule for a target already there replaces it (so flipping include/exclude is one step). */
export function addRule(rules: AudienceRule[], rule: AudienceRule): AudienceRule[] {
  const i = rules.findIndex((r) => sameRule(r, rule));
  if (i < 0) return [...rules, rule];
  if (rules[i].rule === rule.rule && (rules[i].institute_name || !rule.institute_name)) return rules;
  const next = [...rules];
  next[i] = { ...rule, institute_name: rule.institute_name ?? rules[i].institute_name };
  return next;
}

export function ruleKey(r: Pick<AudienceRule, "rule" | "institute_id" | "segment_key">): string {
  return `${r.rule}|${r.institute_id ?? ""}|${r.segment_key ?? ""}`;
}

export function parseSegmentKey(raw: string): { value: string } | { error: string } {
  const k = raw.trim().toLowerCase();
  if (!SEGMENT_KEY_RE.test(k)) return { error: "Segment: lowercase letters, digits, - or _, starting with a letter" };
  return { value: k };
}

/** ai-service AudiencePut body (plan or storefront): unique targets, each included or excluded. */
export function buildAudiencePut(rules: AudienceRule[], reason: string): { body: AudiencePutBody } | { error: string } {
  const body: AudiencePutBody = { institute_ids: [], segments: [], exclude_institute_ids: [], exclude_segments: [], reason: "" };
  const seen = new Set<string>();
  for (const r of rules) {
    const inst = r.institute_id?.trim() || null;
    const seg = r.segment_key?.trim().toLowerCase() || null;
    if (!inst && !seg) continue;
    if (inst && inst.length > 64) return { error: `Institute id "${inst.slice(0, 12)}…" is too long` };
    if (!inst && seg && !SEGMENT_KEY_RE.test(seg)) return { error: `Segment "${seg}" is not a valid key` };
    const target = inst ? `i:${inst}` : `s:${seg}`;
    if (seen.has(target)) continue;
    seen.add(target);
    const ex = r.rule === "EXCLUDE";
    if (inst) (ex ? body.exclude_institute_ids : body.institute_ids).push(inst);
    else (ex ? body.exclude_segments : body.segments).push(seg as string);
  }
  if (reason.trim() === "") return { error: "Give a reason (it lands in the change log)" };
  body.reason = reason.trim();
  return { body };
}

/** ai-service storefront_access reasons, in words. */
export const STOREFRONT_REASON_TEXT: Record<string, string> = {
  SUBORG: "A sub-org institute: its parent buys",
  MODE_OFF: "Global mode is Off",
  PAYMENTS_OFF: "Subscription payments are switched off",
  INSTITUTE_OFF: "Switched off for this institute",
  EXCLUDED: "Excluded (institute or one of its segments)",
  INSTITUTE_ON: "Switched on for this institute",
  ALL: "Mode is All institutes",
  ALLOWLIST: "On the storefront allowlist",
  SEGMENT: "In a storefront segment",
  NOT_IN_ROLLOUT: "Not on the allowlist or in a listed segment",
};

/**
 * GET /storefront/preview?institute_id= is the institute's whole catalogue (built as if the
 * storefront were open). A plan is offered when its card is there.
 */
export function normalizeAudiencePreview(raw: unknown, planId?: string | null): AudiencePreview {
  const r = obj(raw);
  // Legacy / direct shape {offered, why}.
  if (typeof r.offered === "boolean" && !Array.isArray(r.plans)) {
    const why = Array.isArray(r.why) ? r.why.map((w) => (typeof w === "string" ? w : str(obj(w).text) ?? JSON.stringify(w))) : [];
    return { offered: r.offered, storefront_allowed: bool(r.storefront_allowed, r.offered), in_catalogue: r.offered, why };
  }
  const access = obj(r.storefront);
  const allowed = bool(access.allowed, false);
  const code = str(access.reason);
  const segs = strings(access.segments);
  const card = (Array.isArray(r.plans) ? r.plans : []).map(obj).find((p) => !!planId && (str(p.plan_id) === planId || str(p.plan_key) === planId));
  const why: string[] = [];
  why.push(`Plans page: ${allowed ? "visible" : "hidden"}${code ? ` (${STOREFRONT_REASON_TEXT[code] ?? code})` : ""}`);
  if (segs.length > 0) why.push(`Segments: ${segs.join(", ")}`);
  if (card) {
    why.push(card.listed === false ? "Shown only as the institute's current plan (not listed)" : "Plan: in its catalogue (listed, in the audience, published INR version)");
    if (card.is_current === true) why.push("It is the institute's current plan");
    const action = str(card.action);
    if (action && action !== "CURRENT") why.push(`Would be offered as: ${action.toLowerCase()}`);
  } else if (planId) {
    why.push("Plan: not in its catalogue (unlisted, outside the audience, excluded, or no published INR version of at least ₹1)");
  }
  return { offered: !!card && allowed, storefront_allowed: allowed, in_catalogue: !!card, why };
}

// ---------------------------------------------------------------- storefront

export function normalizeStorefrontInstitute(raw: unknown): StorefrontInstitute {
  const r = obj(raw);
  const inst = obj(r.institute);
  return {
    institute_id: str(r.institute_id) ?? str(inst.id) ?? "",
    institute_name: str(r.institute_name) ?? str(inst.name),
    storefront_enabled: boolOrNull(r.storefront_enabled),
    brand_mode_override: pickOrNull(BRAND_MODES, r.brand_mode_override),
    brand_mode: pickOrNull(BRAND_MODES, r.brand_mode ?? r.effective_brand_mode),
    storefront_visible: boolOrNull(r.storefront_visible ?? r.visible),
    updated_by: str(r.updated_by),
    updated_at: str(r.updated_at),
  };
}

/**
 * The storefront page's state. ai-service serves it as two reads, merged here:
 * GET /storefront/audience {institute_ids…, segment_members, mode} and GET /storefront/institutes {institutes}.
 */
export function normalizeStorefront(raw: unknown, institutesRaw?: unknown): StorefrontState {
  const r = obj(raw);
  const audienceRaw = r.audience ?? r.allowlist ?? r.rules ?? r;
  const membersRaw = obj(r.segment_members);
  const segment_members: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(membersRaw)) segment_members[k] = strings(v);
  const instSource = institutesRaw !== undefined ? institutesRaw : r.institutes ?? r.overrides ?? [];
  return {
    mode: pickOrNull(STOREFRONT_MODES, r.mode),
    audience: normalizeAudience(audienceRaw),
    institutes: listOf(instSource, "institutes")
      .map(normalizeStorefrontInstitute)
      .filter((i) => i.institute_id !== ""),
    segment_members,
  };
}

/** PUT /storefront/segments/{key} body: unique institute ids. */
export function buildSegmentPut(ids: string[], reason: string): { body: { institute_ids: string[]; reason: string } } | { error: string } {
  const out: string[] = [];
  for (const raw of ids) {
    const id = raw.trim();
    if (id === "") continue;
    if (id.length > 64) return { error: `Institute id "${id.slice(0, 12)}…" is too long` };
    if (!out.includes(id)) out.push(id);
  }
  if (reason.trim() === "") return { error: "Give a reason (it lands in the change log)" };
  return { body: { institute_ids: out, reason: reason.trim() } };
}

export type InheritOnOff = "INHERIT" | "ON" | "OFF";

export function triState(v: boolean | null): InheritOnOff {
  return v === null ? "INHERIT" : v ? "ON" : "OFF";
}

export function fromTriState(v: InheritOnOff): boolean | null {
  return v === "INHERIT" ? null : v === "ON";
}

export function buildStorefrontInstitutePut(d: { storefront: InheritOnOff; brand: BrandMode | "AUTO"; reason: string }): { body: StorefrontInstitutePut } | { error: string } {
  if (d.reason.trim() === "") return { error: "Give a reason (it lands in the change log)" };
  return { body: { storefront_enabled: fromTriState(d.storefront), brand_mode_override: d.brand === "AUTO" ? null : d.brand, reason: d.reason.trim() } };
}

/**
 * What the rollout rules say for one institute, in ai-service storefront_access order: mode Off,
 * payments off, the per-institute Off switch, an EXCLUDE rule, the On switch, mode All, the
 * allowlist, then segments. null = it depends on segment membership, which the server resolves.
 * The server's verdict always wins; this only explains the switches on the page.
 */
export function storefrontVerdict(
  mode: StorefrontMode,
  override: boolean | null,
  onAllowlist: boolean,
  opts: { paymentsEnabled?: boolean | null; excluded?: boolean; inListedSegment?: boolean } = {}
): { visible: boolean | null; why: string } {
  if (mode === "OFF") return { visible: false, why: STOREFRONT_REASON_TEXT.MODE_OFF };
  if (opts.paymentsEnabled === false) return { visible: false, why: STOREFRONT_REASON_TEXT.PAYMENTS_OFF };
  if (override === false) return { visible: false, why: STOREFRONT_REASON_TEXT.INSTITUTE_OFF };
  if (opts.excluded) return { visible: false, why: "Excluded on the storefront list" };
  if (override === true) return { visible: true, why: STOREFRONT_REASON_TEXT.INSTITUTE_ON };
  if (mode === "ALL") return { visible: true, why: STOREFRONT_REASON_TEXT.ALL };
  if (onAllowlist) return { visible: true, why: STOREFRONT_REASON_TEXT.ALLOWLIST };
  if (mode === "SEGMENTS") {
    if (opts.inListedSegment) return { visible: true, why: STOREFRONT_REASON_TEXT.SEGMENT };
    return opts.inListedSegment === false ? { visible: false, why: "Not in a listed segment" } : { visible: null, why: "Visible only if it is in a listed segment" };
  }
  return { visible: false, why: "Not on the allowlist" };
}

// ---------------------------------------------------------------- charges and mandates

export function normalizeCharge(raw: unknown): SubscriptionCharge {
  const r = obj(raw);
  const invoice = obj(r.invoice);
  return {
    id: str(r.id) ?? str(r.charge_id) ?? "",
    subscription_id: str(r.subscription_id),
    kind: str(r.kind) ?? "PERIOD",
    status: str(r.status) ?? "DUE",
    service_start: str(r.service_start),
    service_end: str(r.service_end),
    plan_version_id: str(r.plan_version_id),
    base_minor: numOrNull(r.base_minor),
    tax_minor: numOrNull(r.tax_minor),
    total_minor: numOrNull(r.total_minor),
    refunded_minor: toNumber(r.refunded_minor, 0),
    place_of_supply: str(r.place_of_supply),
    currency: str(r.currency) ?? "INR",
    platform_payment_id: str(r.platform_payment_id),
    vendor_payment_id: str(r.vendor_payment_id),
    payment_link_url: str(r.payment_link_url) ?? str(r.link_url),
    link_expires_at: str(r.link_expires_at),
    mandate_id: str(r.mandate_id),
    debit_attempts: toNumber(r.debit_attempts, 0),
    next_attempt_at: str(r.next_attempt_at),
    pre_debit_notice_sent_at: str(r.pre_debit_notice_sent_at),
    period_id: str(r.period_id),
    invoice_id: str(r.invoice_id) ?? str(invoice.id),
    invoice_number: str(r.invoice_number) ?? str(invoice.invoice_number) ?? str(invoice.number),
    created_at: str(r.created_at),
    updated_at: str(r.updated_at),
  };
}

export function normalizeMandate(raw: unknown): SubscriptionMandate | null {
  if (!raw || typeof raw !== "object") return null;
  const r = obj(raw);
  const id = str(r.id) ?? str(r.mandate_id);
  if (!id) return null;
  return {
    id,
    subscription_id: str(r.subscription_id),
    method: str(r.method),
    status: str(r.status) ?? "PENDING",
    max_amount_minor: numOrNull(r.max_amount_minor),
    token_id: str(r.token_id),
    registration_link_url: str(r.registration_link_url) ?? str(r.registration_url),
    created_at: str(r.created_at),
    updated_at: str(r.updated_at),
  };
}

/** Newest service period first, then newest created. */
export function sortCharges(charges: SubscriptionCharge[]): SubscriptionCharge[] {
  return [...charges].sort(
    (a, b) => (b.service_start ?? "").localeCompare(a.service_start ?? "") || (b.created_at ?? "").localeCompare(a.created_at ?? "")
  );
}

/** GET /subscriptions/{sid}/billing: { charges, mandates | mandate }. A bare list is charges. */
export function normalizeBilling(raw: unknown): SubscriptionBilling {
  const r = obj(raw);
  const charges = listOf(Array.isArray(raw) ? raw : r.charges ?? [], "charges")
    .map(normalizeCharge)
    .filter((c) => c.id !== "");
  const mandates = [...listOf(r.mandates ?? [], "mandates"), ...(r.mandate ? [r.mandate] : [])]
    .map(normalizeMandate)
    .filter((m): m is SubscriptionMandate => m !== null);
  const seen = new Set<string>();
  return {
    charges: sortCharges(charges),
    mandates: mandates.filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true))).sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? "")),
  };
}

const OPEN_CHARGE: readonly string[] = ["DUE", "LINK_SENT", "FAILED"];
const PAID_CHARGE: readonly string[] = ["PAID", "PARTIALLY_REFUNDED"];

export interface ChargeActions {
  /** "send" when no link exists yet, "resend" to cancel and replace it; null = not offered. */
  link: "send" | "resend" | null;
  markPaid: boolean;
  waive: boolean;
  refund: boolean;
  refundableMinor: number;
}

/**
 * Staff actions a charge allows. A scheduled debit offers nothing (a link or an offline payment on
 * top of a debit that goes through would collect twice); refunds need the online payment record.
 */
export function chargeActions(c: SubscriptionCharge): ChargeActions {
  const open = OPEN_CHARGE.includes(c.status);
  const refundable = c.total_minor !== null ? Math.max(0, c.total_minor - c.refunded_minor) : 0;
  return {
    link: open ? (c.payment_link_url ? "resend" : "send") : null,
    markPaid: open,
    waive: open,
    refund: PAID_CHARGE.includes(c.status) && !!c.platform_payment_id && refundable > 0,
    refundableMinor: refundable,
  };
}

/** Something can settle without anyone in the portal acting: poll while it is so. */
export function billingInFlight(b: SubscriptionBilling | undefined): boolean {
  if (!b) return false;
  return b.charges.some((c) => ["LINK_SENT", "DEBIT_SCHEDULED"].includes(c.status) || (c.status === "DUE" && !!c.payment_link_url)) || b.mandates.some((m) => m.status === "PENDING");
}

export function mandateCancellable(m: SubscriptionMandate): boolean {
  return m.status === "PENDING" || m.status === "ACTIVE" || m.status === "PAUSED";
}

/** The mandate that charges renewals now: the newest ACTIVE one, else the newest still pending/paused. */
export function currentMandate(mandates: SubscriptionMandate[]): SubscriptionMandate | null {
  return mandates.find((m) => m.status === "ACTIVE") ?? mandates.find((m) => m.status === "PENDING" || m.status === "PAUSED") ?? null;
}

export type Tone = "ok" | "warn" | "error" | "info" | "muted";

export function chargeTone(status: string): Tone {
  if (status === "PAID") return "ok";
  if (status === "FAILED") return "error";
  if (status === "DUE" || status === "LINK_SENT") return "warn";
  if (status === "DEBIT_SCHEDULED") return "info";
  return "muted";
}

export function mandateTone(status: string): Tone {
  if (status === "ACTIVE") return "ok";
  if (status === "PENDING" || status === "PAUSED") return "warn";
  if (status === "REJECTED") return "error";
  return "muted";
}

/** "base ₹5,000 + tax ₹900 = ₹5,900" when the tax snapshot exists, else the base only. */
export function chargeAmountText(c: Pick<SubscriptionCharge, "base_minor" | "tax_minor" | "total_minor">): string {
  if (c.total_minor !== null && c.tax_minor !== null && c.base_minor !== null)
    return `${formatInrMinor(c.base_minor)} + GST ${formatInrMinor(c.tax_minor)} = ${formatInrMinor(c.total_minor)}`;
  if (c.total_minor !== null) return formatInrMinor(c.total_minor);
  return c.base_minor !== null ? `${formatInrMinor(c.base_minor)} + GST (not priced yet)` : "—";
}

/** A link counts as live until its expiry. */
export function linkExpired(c: Pick<SubscriptionCharge, "link_expires_at">, now: Date = new Date()): boolean {
  if (!c.link_expires_at) return false;
  const t = new Date(c.link_expires_at).getTime();
  return Number.isFinite(t) && t <= now.getTime();
}

// ---------------------------------------------------------------- staff money actions

/** admin_core AiSubscriptionOpsService.markPaidOffline reference rule. */
export const MANUAL_REFERENCE_RE = /^[A-Za-z0-9/_.-]{3,50}$/;

export interface MarkPaidDraft {
  reference: string;
  paid_at: string;
  amount_rupees: string;
  reason: string;
}

export function emptyMarkPaidDraft(c: SubscriptionCharge, now: Date = new Date()): MarkPaidDraft {
  const total = c.total_minor;
  return {
    reference: "",
    paid_at: toLocalInput(now),
    amount_rupees: total === null ? "" : Number.isInteger(total / 100) ? String(total / 100) : (total / 100).toFixed(2),
    reason: "",
  };
}

/**
 * Offline payment (bank transfer, cheque). The amount must equal the charge's GST-inclusive total
 * snapshot, because the server compares the two and will not activate on a mismatch.
 */
export function buildMarkPaid(d: MarkPaidDraft, c: SubscriptionCharge, now: Date = new Date()): { body: MarkPaidBody } | { error: string } {
  const ref = d.reference.trim();
  if (ref === "") return { error: "Enter the bank / UTR / cheque reference" };
  // admin_core stores it as vendor_payment_id MANUAL:<reference> (unique) and accepts only these.
  if (!MANUAL_REFERENCE_RE.test(ref)) return { error: "The reference is 3-50 letters, digits or / _ . - (no spaces)" };
  const paid = new Date(d.paid_at);
  if (d.paid_at.trim() === "" || Number.isNaN(paid.getTime())) return { error: "Enter when the money was received" };
  if (paid.getTime() > now.getTime() + 5 * 60_000) return { error: "The payment date cannot be in the future" };
  const amount = parseRupeesToMinor(d.amount_rupees);
  if ("error" in amount) return { error: `Amount: ${amount.error.toLowerCase()}` };
  if (amount.value === null || amount.value <= 0) return { error: "Enter the amount received" };
  // Not priced yet (no tax snapshot): admin_core prices the charge and refuses any other amount.
  if (c.total_minor !== null && amount.value !== c.total_minor)
    return { error: `The amount must equal the charge total ${formatInrMinor(c.total_minor)} (GST included). For a different amount, waive this charge and agree a custom deal.` };
  if (d.reason.trim() === "") return { error: "Give a reason (it lands in the subscription's history)" };
  return { body: { reference: ref, paid_at: paid.toISOString(), amount_minor: amount.value, reason: d.reason.trim() } };
}

export interface RefundDraft {
  amount_rupees: string;
  reason: string;
}

/** A refund (full or partial) of a paid charge; the server issues a GST credit note for it. */
export function buildRefund(d: RefundDraft, c: SubscriptionCharge): { body: RefundBody } | { error: string } {
  const acts = chargeActions(c);
  if (!acts.refund || !c.platform_payment_id) return { error: "Only a paid online payment can be refunded here" };
  const amount = parseRupeesToMinor(d.amount_rupees);
  if ("error" in amount) return { error: `Amount: ${amount.error.toLowerCase()}` };
  if (amount.value === null || amount.value <= 0) return { error: "Enter the amount to refund" };
  if (amount.value > acts.refundableMinor) return { error: `At most ${formatInrMinor(acts.refundableMinor)} can still be refunded` };
  if (d.reason.trim() === "") return { error: "Give a reason (it is printed on the credit note)" };
  return { body: { platform_payment_id: c.platform_payment_id, charge_id: c.id, amount_minor: amount.value, reason: d.reason.trim() } };
}

/** A full refund of the current period ends the plan now; a partial one keeps it. */
export function refundEffect(c: SubscriptionCharge, amountMinor: number): string {
  const full = c.total_minor !== null && amountMinor >= c.total_minor - c.refunded_minor;
  return full
    ? "Full refund: the charge becomes Refunded and, for the current period, plan benefits stop now."
    : "Partial refund: the plan stays as it is; the credit note reduces the invoice by this amount.";
}

// ---------------------------------------------------------------- invoices and credit notes

function taxOf(r: Record<string, unknown>, base: number | null, total: number | null): number | null {
  const direct = numOrNull(r.tax_minor ?? r.tax_amount_minor);
  if (direct !== null) return direct;
  const parts = [r.cgst_amount_minor, r.sgst_amount_minor, r.igst_amount_minor].map(numOrNull);
  if (parts.some((p) => p !== null)) return parts.reduce<number>((s, p) => s + (p ?? 0), 0);
  // Inclusive-price rule: tax = total - base.
  return base !== null && total !== null ? total - base : null;
}

export function normalizeDocument(raw: unknown, fallbackKind: BillingDocKind): BillingDocument {
  const r = obj(raw);
  const k = String(r.doc_kind ?? r.doc_type ?? r.document_type ?? r.type ?? "").toUpperCase();
  const doc_kind: BillingDocKind = k === "CREDIT_NOTE" || k === "INVOICE" ? k : fallbackKind;
  const base = numOrNull(r.base_minor ?? r.base_amount_minor);
  const total = numOrNull(r.total_minor ?? r.total_amount_minor ?? r.amount_minor);
  return {
    id: str(r.id) ?? "",
    doc_kind,
    number: str(r.number) ?? str(r.invoice_number) ?? str(r.credit_note_number),
    item_kind: str(r.item_kind),
    issued_at: str(r.issued_at) ?? str(r.created_at),
    currency: str(r.currency) ?? "INR",
    base_minor: base,
    tax_minor: taxOf(r, base, total),
    total_minor: total,
    platform_payment_id: str(r.platform_payment_id),
    invoice_id: doc_kind === "CREDIT_NOTE" ? str(r.invoice_id) : null,
    invoice_number: doc_kind === "CREDIT_NOTE" ? str(r.invoice_number) ?? str(r.against_invoice_number) ?? str(r.original_invoice_number) : null,
    reason: str(r.reason),
    buyer_legal_name: str(r.buyer_legal_name),
    brand_mode: pickOrNull(BRAND_MODES, r.brand_mode),
    description: str(r.description),
  };
}

/** { invoices, credit_notes } or one mixed list (each row with doc_kind). Newest first. */
export function normalizeDocuments(raw: unknown): BillingDocument[] {
  const r = obj(raw);
  const rows: BillingDocument[] = [];
  if (Array.isArray(raw)) rows.push(...raw.map((x) => normalizeDocument(x, "INVOICE")));
  else {
    rows.push(...listOf(r.invoices ?? [], "invoices").map((x) => normalizeDocument(x, "INVOICE")));
    rows.push(...listOf(r.credit_notes ?? r.creditNotes ?? [], "credit_notes").map((x) => normalizeDocument(x, "CREDIT_NOTE")));
    if (rows.length === 0) rows.push(...listOf(r.documents ?? [], "documents").map((x) => normalizeDocument(x, "INVOICE")));
  }
  return rows.filter((d) => d.id !== "").sort((a, b) => (b.issued_at ?? "").localeCompare(a.issued_at ?? ""));
}

/** Invoiced minus credited, per currency, for the totals row. */
export function documentTotals(docs: BillingDocument[]): { currency: string; invoiced: number; credited: number; net: number }[] {
  const by = new Map<string, { invoiced: number; credited: number }>();
  for (const d of docs) {
    const t = by.get(d.currency) ?? { invoiced: 0, credited: 0 };
    if (d.doc_kind === "INVOICE") t.invoiced += d.total_minor ?? 0;
    else t.credited += d.total_minor ?? 0;
    by.set(d.currency, t);
  }
  return [...by.entries()].map(([currency, t]) => ({ currency, ...t, net: t.invoiced - t.credited }));
}

/** What a staff credit note may still take off an invoice: its total less the credit notes against it. */
export function creditableMinor(invoice: BillingDocument, docs: BillingDocument[]): number {
  if (invoice.doc_kind !== "INVOICE") return 0;
  const credited = docs
    .filter((d) => d.doc_kind === "CREDIT_NOTE" && (d.invoice_id === invoice.id || (!d.invoice_id && !!invoice.number && d.invoice_number === invoice.number)))
    .reduce((s, d) => s + (d.total_minor ?? 0), 0);
  return Math.max(0, (invoice.total_minor ?? 0) - credited);
}

/** Staff credit notes are for AI-plan invoices with something left to credit (packs: refund the payment). */
export function canIssueCreditNote(invoice: BillingDocument, docs: BillingDocument[]): boolean {
  return invoice.doc_kind === "INVOICE" && invoice.item_kind === "AI_SUBSCRIPTION" && creditableMinor(invoice, docs) > 0;
}

export interface StaffCreditNoteDraft {
  amount_rupees: string;
  reason: string;
}

export function buildStaffCreditNote(
  d: StaffCreditNoteDraft,
  invoice: BillingDocument,
  docs: BillingDocument[]
): { body: { amount_minor: number; reason: string } } | { error: string } {
  if (!canIssueCreditNote(invoice, docs)) return { error: "Nothing left to credit on this invoice" };
  const amount = parseRupeesToMinor(d.amount_rupees);
  if ("error" in amount) return { error: `Amount: ${amount.error.toLowerCase()}` };
  if (amount.value === null || amount.value <= 0) return { error: "Enter the amount to credit" };
  const left = creditableMinor(invoice, docs);
  if (amount.value > left) return { error: `At most ${formatInrMinor(left)} is left on this invoice` };
  if (d.reason.trim().length < 3) return { error: "Give a reason (it is printed on the credit note)" };
  return { body: { amount_minor: amount.value, reason: d.reason.trim() } };
}

export function formatMinor(minor: number | null | undefined, currency: string): string {
  if (currency === "INR") return formatInrMinor(minor);
  if (minor === null || minor === undefined || !Number.isFinite(minor)) return "—";
  return `${currency} ${(minor / 100).toFixed(2)}`;
}
