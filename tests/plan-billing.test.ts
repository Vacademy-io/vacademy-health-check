// Run: npm test  (node --test with native TypeScript stripping; no extra deps)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addRule,
  billingInFlight,
  brandWords,
  buildAudiencePut,
  buildListingPatch,
  buildMarkPaid,
  buildRefund,
  buildStaffCreditNote,
  canIssueCreditNote,
  creditableMinor,
  buildSegmentPut,
  buildStorefrontInstitutePut,
  chargeActions,
  chargeAmountText,
  currentMandate,
  documentTotals,
  emptyMarkPaidDraft,
  fromTriState,
  lintListing,
  linkExpired,
  listingDraft,
  normalizeAudience,
  normalizeAudiencePreview,
  normalizeBilling,
  normalizeCharge,
  normalizeDocuments,
  normalizeListing,
  normalizeStorefront,
  parseSegmentKey,
  refundEffect,
  storefrontModeOf,
  storefrontPriceLine,
  storefrontVerdict,
  triState,
} from "../src/lib/plan-billing.ts";
import { buildAssign, currentSubscription, emptyAssignDraft, normalizeFeatures, normalizePlan, normalizeSubscription } from "../src/lib/plans.ts";
import type { AiSettingEntry } from "../src/types/ai-settings.ts";
import type { SubscriptionCharge } from "../src/types/plan-billing.ts";

const setting = (key: string, value: unknown): AiSettingEntry => ({
  key,
  group: "rollout",
  group_label: "Rollout",
  label: key,
  description: "",
  type: "enum",
  nullable: false,
  options: [],
  value: value as AiSettingEntry["value"],
  default: "OFF",
  source: "portal",
  updated_by: null,
  updated_at: null,
});

const charge = (over: Record<string, unknown> = {}): SubscriptionCharge =>
  normalizeCharge({
    id: "c1",
    subscription_id: "s1",
    kind: "PERIOD",
    status: "DUE",
    service_start: "2026-11-01T00:00:00Z",
    service_end: "2026-12-01T00:00:00Z",
    base_minor: 500000,
    tax_minor: 90000,
    total_minor: 590000,
    ...over,
  });

// ---------------------------------------------------------------- brand lint

test("brandWords: case, spacing, dots and zero-width characters do not hide the platform name", () => {
  assert.deepEqual(brandWords("Powered by Vacademy"), ["vacademy"]);
  assert.deepEqual(brandWords("V a c a d e m y Pro"), ["vacademy"]);
  assert.deepEqual(brandWords("Vida\u200byatan.Tech"), []);
  assert.deepEqual(brandWords("Vidya\u200byatan Technologies"), ["vidyayatan"]);
  assert.deepEqual(brandWords("vacademy and VIDYAYATAN"), ["vacademy", "vidyayatan"]);
  assert.deepEqual(brandWords("Academy Pro"), []);
  assert.deepEqual(brandWords(null), []);
});

test("lintListing names every offending field, including the plan name", () => {
  const out = lintListing({ name: "Vacademy Pro", tagline: "fine", badge: "Vidyayatan pick", highlights: ["ok", "by vacademy"] });
  assert.deepEqual(
    out.map((f) => f.field),
    ["Plan name", "Badge", "Highlight 2"]
  );
});

// ---------------------------------------------------------------- listing

test("normalizeListing: unlisted + ALLOWLIST by default; highlights from strings, objects or a JSON string", () => {
  assert.deepEqual(normalizeListing({}), { listed: false, tagline: null, highlights: [], badge: null, sort_order: 100, audience_mode: "ALLOWLIST" });
  const l = normalizeListing({ listed: true, tagline: "Everyday AI", highlights: '["A", {"text":"B"}, "  ", 3]', badge: "Popular", sort_order: "5", audience_mode: "all" });
  assert.equal(l.listed, true);
  assert.deepEqual(l.highlights, ["A", "B"]);
  assert.equal(l.sort_order, 5);
  assert.equal(l.audience_mode, "ALL");
  // Nested under "listing" works too, and an unknown audience mode falls back to ALLOWLIST.
  assert.equal(normalizeListing({ listing: { tagline: "x", audience_mode: "EVERYONE" } }).audience_mode, "ALLOWLIST");
  assert.equal(normalizeListing({ listing: { tagline: "x" } }).tagline, "x");
});

test("normalizePlan carries the listing", () => {
  const p = normalizePlan({ id: "p1", plan_key: "pro", name: "Pro", listed: true, tagline: "T", highlights: ["H"], versions: [] });
  assert.equal(p.listing.listed, true);
  assert.deepEqual(p.listing.highlights, ["H"]);
  assert.equal(normalizePlan({ id: "p2", plan_key: "x", name: "X" }).listing.listed, false);
});

test("buildListingPatch validates and trims", () => {
  const base = { ...listingDraft(normalizeListing({})), tagline: " Everyday AI ", highlights: [" A ", "", "B"], badge: " Popular ", sort_order: "10", reason: " launch " };
  const ctx = { name: "Pro", description: null, hasPublishedInr: true };
  const ok = buildListingPatch({ ...base, listed: true }, ctx);
  assert.ok("body" in ok);
  assert.deepEqual(ok.body, { listed: true, tagline: "Everyday AI", highlights: ["A", "B"], badge: "Popular", sort_order: 10, audience_mode: "ALLOWLIST", reason: "launch" });

  const err = (d: Partial<typeof base>, c: Partial<typeof ctx> = {}) => {
    const r = buildListingPatch({ ...base, ...d }, { ...ctx, ...c });
    assert.ok("error" in r, JSON.stringify(d));
    return r.error;
  };
  assert.match(err({ tagline: "Built by Vacademy" }), /Tagline contains "vacademy"/);
  assert.match(err({}, { name: "Vidyayatan Max" }), /Plan name/);
  assert.match(err({ tagline: "x".repeat(141) }), /Tagline: at most 140/);
  assert.match(err({ badge: "x".repeat(25) }), /Badge/);
  assert.match(err({ highlights: ["1", "2", "3", "4", "5", "6", "7"] }), /At most 6/);
  assert.match(err({ highlights: ["Same", "same "] }), /same thing/);
  assert.match(err({ highlights: ["x".repeat(121)] }), /Highlight 1/);
  assert.match(err({ sort_order: "1.5" }), /Sort order/);
  assert.match(err({ sort_order: "10000" }), /Sort order/);
  assert.match(err({ listed: true }, { hasPublishedInr: false }), /INR version/);
  assert.match(err({ listed: true, tagline: "" }), /needs a tagline/);
  assert.match(err({ reason: " " }), /reason/);
  // Unlisting needs neither a version nor a tagline; blank fields become null; blank sort = 100.
  const off = buildListingPatch({ ...base, listed: false, tagline: "", badge: "", sort_order: "" }, { ...ctx, hasPublishedInr: false });
  assert.ok("body" in off);
  assert.equal(off.body.tagline, null);
  assert.equal(off.body.badge, null);
  assert.equal(off.body.sort_order, 100);
});

test("storefrontPriceLine: + GST unless inclusive; month / year / n months", () => {
  assert.equal(storefrontPriceLine({ price_minor: 500000, period_months: 1, is_tax_inclusive: false }), "₹5,000 / month + GST");
  assert.equal(storefrontPriceLine({ price_minor: 5900000, period_months: 12, is_tax_inclusive: true }), "₹59,000 / year incl. GST");
  assert.equal(storefrontPriceLine({ price_minor: 1500000, period_months: 3, is_tax_inclusive: false }), "₹15,000 / 3 months + GST");
});

// ---------------------------------------------------------------- audience

test("audience rules: normalise, de-duplicate, validate segment keys", () => {
  const rules = normalizeAudience({ rules: [{ institute_id: "i1", institute_name: "One" }, { segment: "pilot" }, {}, { institute_id: "i2", segment_key: "x" }] });
  assert.deepEqual(rules, [
    { rule: "INCLUDE", institute_id: "i1", institute_name: "One", segment_key: null },
    { rule: "INCLUDE", institute_id: null, institute_name: null, segment_key: "pilot" },
    { rule: "INCLUDE", institute_id: "i2", institute_name: null, segment_key: null },
  ]);
  assert.equal(addRule(rules, { rule: "INCLUDE", institute_id: "i1", institute_name: null, segment_key: null }).length, 3);
  assert.equal(addRule(rules, { rule: "INCLUDE", institute_id: null, institute_name: null, segment_key: "internal" }).length, 4);
  // Flipping a target to EXCLUDE replaces its rule (one rule per target) and keeps the known name.
  const flipped = addRule(rules, { rule: "EXCLUDE", institute_id: "i1", institute_name: null, segment_key: null });
  assert.equal(flipped.length, 3);
  assert.deepEqual(flipped[0], { rule: "EXCLUDE", institute_id: "i1", institute_name: "One", segment_key: null });
  assert.deepEqual(parseSegmentKey(" Pilot "), { value: "pilot" });
  assert.ok("error" in parseSegmentKey("9lives"));
  assert.ok("error" in parseSegmentKey("has space"));

  // The ai-service AudiencePut body: includes and excludes, institutes and segments, unique targets.
  const put = buildAudiencePut([...flipped, rules[1], { rule: "INCLUDE", institute_id: " ", institute_name: null, segment_key: null }, { rule: "EXCLUDE", institute_id: null, institute_name: null, segment_key: "internal" }], " why ");
  assert.ok("body" in put);
  assert.deepEqual(put.body, {
    institute_ids: ["i2"],
    segments: ["pilot"],
    exclude_institute_ids: ["i1"],
    exclude_segments: ["internal"],
    reason: "why",
  });
  assert.ok("error" in buildAudiencePut([{ rule: "INCLUDE", institute_id: null, institute_name: null, segment_key: "Bad Key" }], "r"));
  assert.ok("error" in buildAudiencePut([{ rule: "INCLUDE", institute_id: "x".repeat(65), institute_name: null, segment_key: null }], "r"));
  assert.ok("error" in buildAudiencePut(rules, ""));
  // An empty list is a valid save (clears the audience).
  assert.deepEqual(buildAudiencePut([], "clear"), { body: { institute_ids: [], segments: [], exclude_institute_ids: [], exclude_segments: [], reason: "clear" } });
});

test("normalizeAudience reads the ai-service grouped shape (GET /plans/{id}/audience, /storefront/audience)", () => {
  const rules = normalizeAudience({ institute_ids: ["i1", "i1"], segments: ["pilot"], exclude_institute_ids: ["i9"], exclude_segments: ["internal"], audience_mode: "SEGMENT" });
  assert.deepEqual(
    rules.map((r) => [r.rule, r.institute_id, r.segment_key]),
    [
      ["INCLUDE", "i1", null],
      ["INCLUDE", null, "pilot"],
      ["EXCLUDE", "i9", null],
      ["EXCLUDE", null, "internal"],
    ]
  );
  // Round trip: what was read saves back unchanged.
  const put = buildAudiencePut(rules, "same");
  assert.ok("body" in put);
  assert.deepEqual(put.body.exclude_segments, ["internal"]);
  assert.deepEqual(normalizeAudience({ institute_ids: [] }), []);
});

test("normalizeAudiencePreview: the plan's card in GET /storefront/preview decides; the page verdict is separate", () => {
  const catalogue = {
    institute_id: "i1",
    storefront: { mode: "ALLOWLIST", allowed: true, reason: "ALLOWLIST", segments: ["pilot"] },
    plans: [{ plan_id: "p1", plan_key: "pro", listed: true, action: "UPGRADE", is_current: false }],
  };
  const yes = normalizeAudiencePreview(catalogue, "p1");
  assert.equal(yes.offered, true);
  assert.equal(yes.in_catalogue, true);
  assert.equal(yes.storefront_allowed, true);
  assert.ok(yes.why.some((w) => /visible \(On the storefront allowlist\)/.test(w)));
  assert.ok(yes.why.some((w) => /pilot/.test(w)));
  assert.ok(yes.why.some((w) => /upgrade/.test(w)));
  // By plan_key too.
  assert.equal(normalizeAudiencePreview(catalogue, "pro").offered, true);

  const other = normalizeAudiencePreview(catalogue, "p2");
  assert.equal(other.offered, false);
  assert.equal(other.in_catalogue, false);
  assert.ok(other.why.some((w) => /not in its catalogue/.test(w)));

  // Preview builds the catalogue even when the page is hidden: in the catalogue, not offered.
  const hidden = normalizeAudiencePreview({ ...catalogue, storefront: { allowed: false, reason: "MODE_OFF" } }, "p1");
  assert.equal(hidden.offered, false);
  assert.equal(hidden.in_catalogue, true);
  assert.ok(hidden.why[0].includes("Global mode is Off"));

  // Direct {offered, why} shape still reads.
  assert.deepEqual(normalizeAudiencePreview({ offered: true, why: ["listed", { text: "allowlisted" }] }), { offered: true, storefront_allowed: true, in_catalogue: true, why: ["listed", "allowlisted"] });
  assert.equal(normalizeAudiencePreview(null, "p1").offered, false);
});

// ---------------------------------------------------------------- storefront

test("storefrontModeOf: unregistered or unknown values read as OFF (dark by default)", () => {
  assert.equal(storefrontModeOf(null), "OFF");
  assert.equal(storefrontModeOf(setting("billing.storefront.mode", "ALLOWLIST")), "ALLOWLIST");
  assert.equal(storefrontModeOf(setting("billing.storefront.mode", "all")), "ALL");
  assert.equal(storefrontModeOf(setting("billing.storefront.mode", "SOMETIMES")), "OFF");
  assert.equal(storefrontModeOf({ ...setting("billing.storefront.mode", "ALL"), effective: "SEGMENTS" }), "SEGMENTS");
});

test("storefrontVerdict mirrors ai-service storefront_access order", () => {
  assert.equal(storefrontVerdict("OFF", true, true).visible, false);
  assert.equal(storefrontVerdict("ALL", false, true).visible, false);
  assert.equal(storefrontVerdict("ALLOWLIST", true, false).visible, true);
  assert.equal(storefrontVerdict("ALL", null, false).visible, true);
  assert.equal(storefrontVerdict("ALLOWLIST", null, true).visible, true);
  assert.equal(storefrontVerdict("ALLOWLIST", null, false).visible, false);
  assert.equal(storefrontVerdict("SEGMENTS", null, false).visible, null);
  assert.equal(storefrontVerdict("SEGMENTS", null, true).visible, true);
  // Payments off hides it even with the On switch; so does an exclusion.
  assert.equal(storefrontVerdict("ALL", true, true, { paymentsEnabled: false }).visible, false);
  assert.equal(storefrontVerdict("ALL", true, true, { excluded: true }).visible, false);
  // Unknown payments switch (null) does not hide it here; the server decides.
  assert.equal(storefrontVerdict("ALL", null, false, { paymentsEnabled: null }).visible, true);
  // Segment membership known: a definite answer in SEGMENTS mode, and ignored in ALLOWLIST mode.
  assert.equal(storefrontVerdict("SEGMENTS", null, false, { inListedSegment: true }).visible, true);
  assert.equal(storefrontVerdict("SEGMENTS", null, false, { inListedSegment: false }).visible, false);
  assert.equal(storefrontVerdict("ALLOWLIST", null, false, { inListedSegment: true }).visible, false);
});

test("normalizeStorefront merges GET /storefront/audience and GET /storefront/institutes", () => {
  const s = normalizeStorefront(
    { institute_ids: ["i1"], segments: ["pilot"], exclude_institute_ids: [], exclude_segments: ["internal"], segment_members: { pilot: ["i2", "i3"], internal: ["i4"], bad: "x" }, mode: "SEGMENTS" },
    { institutes: [{ institute_id: "i2", institute_name: "Two", storefront_enabled: true, brand_mode_override: null, updated_by: "u", updated_at: "2026-10-16T10:00:00Z" }] }
  );
  assert.equal(s.mode, "SEGMENTS");
  assert.equal(s.audience.length, 3);
  assert.equal(s.audience[2].rule, "EXCLUDE");
  assert.deepEqual(s.segment_members, { pilot: ["i2", "i3"], internal: ["i4"], bad: [] });
  assert.equal(s.institutes.length, 1);
  assert.equal(s.institutes[0].storefront_enabled, true);
  assert.equal(s.institutes[0].brand_mode_override, null);
  assert.equal(normalizeStorefront({}).institutes.length, 0);
  assert.deepEqual(normalizeStorefront({}).segment_members, {});
});

test("buildSegmentPut: unique trimmed ids, reason required, empty list allowed", () => {
  assert.deepEqual(buildSegmentPut([" i1 ", "i2", "i1", ""], " r "), { body: { institute_ids: ["i1", "i2"], reason: "r" } });
  assert.deepEqual(buildSegmentPut([], "empty it"), { body: { institute_ids: [], reason: "empty it" } });
  assert.ok("error" in buildSegmentPut(["i1"], " "));
  assert.ok("error" in buildSegmentPut(["x".repeat(65)], "r"));
});

test("normalizeStorefront and the per-institute switch body", () => {
  const s = normalizeStorefront({
    mode: "ALLOWLIST",
    audience: [{ institute_id: "i1" }],
    institutes: [
      { institute_id: "i1", storefront_enabled: false, brand_mode_override: "neutral", brand_mode: "NEUTRAL", storefront_visible: false },
      { institute: { id: "i2", name: "Two" }, storefront_enabled: null },
      { storefront_enabled: true },
    ],
  });
  assert.equal(s.mode, "ALLOWLIST");
  assert.equal(s.audience.length, 1);
  assert.equal(s.institutes.length, 2);
  assert.equal(s.institutes[0].brand_mode_override, "NEUTRAL");
  assert.equal(s.institutes[0].storefront_enabled, false);
  assert.equal(s.institutes[1].institute_name, "Two");
  assert.equal(s.institutes[1].storefront_enabled, null);
  assert.equal(s.institutes[1].storefront_visible, null);
  assert.equal(normalizeStorefront({}).mode, null);

  assert.equal(triState(null), "INHERIT");
  assert.equal(triState(true), "ON");
  assert.equal(fromTriState("OFF"), false);
  assert.deepEqual(buildStorefrontInstitutePut({ storefront: "INHERIT", brand: "AUTO", reason: " r " }), {
    body: { storefront_enabled: null, brand_mode_override: null, reason: "r" },
  });
  assert.deepEqual(buildStorefrontInstitutePut({ storefront: "ON", brand: "NEUTRAL", reason: "r" }), {
    body: { storefront_enabled: true, brand_mode_override: "NEUTRAL", reason: "r" },
  });
  assert.ok("error" in buildStorefrontInstitutePut({ storefront: "ON", brand: "AUTO", reason: "" }));
});

// ---------------------------------------------------------------- charges and mandates

test("normalizeBilling: charges newest first, single or listed mandates, de-duplicated", () => {
  const b = normalizeBilling({
    charges: [
      { id: "old", service_start: "2026-10-01T00:00:00Z", status: "PAID" },
      { id: "new", service_start: "2026-11-01T00:00:00Z", status: "DUE", link_url: "https://rzp.io/l/x", invoice: { id: "inv1", invoice_number: "VT/2026-27/I00001" } },
      { status: "DUE" },
    ],
    mandate: { id: "m2", status: "ACTIVE", created_at: "2026-10-02" },
    mandates: [
      { id: "m1", status: "CANCELLED", created_at: "2026-09-01" },
      { id: "m2", status: "ACTIVE", created_at: "2026-10-02" },
    ],
  });
  assert.deepEqual(
    b.charges.map((c) => c.id),
    ["new", "old"]
  );
  assert.equal(b.charges[0].payment_link_url, "https://rzp.io/l/x");
  assert.equal(b.charges[0].invoice_number, "VT/2026-27/I00001");
  assert.deepEqual(
    b.mandates.map((m) => m.id),
    ["m2", "m1"]
  );
  assert.equal(currentMandate(b.mandates)?.id, "m2");
  assert.equal(currentMandate([]), null);
  assert.deepEqual(normalizeBilling([{ id: "x" }]).charges.map((c) => c.id), ["x"]);
  assert.deepEqual(normalizeBilling(null), { charges: [], mandates: [] });
});

test("chargeActions: what staff may do in each charge state", () => {
  assert.deepEqual(chargeActions(charge()), { link: "send", markPaid: true, waive: true, refund: false, refundableMinor: 590000 });
  assert.equal(chargeActions(charge({ status: "LINK_SENT", payment_link_url: "https://rzp.io/l/x" })).link, "resend");
  assert.equal(chargeActions(charge({ status: "FAILED", payment_link_url: "https://rzp.io/l/x" })).markPaid, true);
  // A scheduled debit offers nothing: a second collection path could take the money twice.
  assert.deepEqual(chargeActions(charge({ status: "DEBIT_SCHEDULED" })), { link: null, markPaid: false, waive: false, refund: false, refundableMinor: 590000 });
  // Paid: refund only, and only with the online payment record.
  assert.equal(chargeActions(charge({ status: "PAID" })).refund, false);
  const paid = chargeActions(charge({ status: "PAID", platform_payment_id: "pp1" }));
  assert.equal(paid.refund, true);
  assert.equal(paid.link, null);
  assert.equal(paid.markPaid, false);
  const part = chargeActions(charge({ status: "PARTIALLY_REFUNDED", platform_payment_id: "pp1", refunded_minor: 90000 }));
  assert.equal(part.refund, true);
  assert.equal(part.refundableMinor, 500000);
  assert.equal(chargeActions(charge({ status: "REFUNDED", platform_payment_id: "pp1", refunded_minor: 590000 })).refund, false);
  for (const s of ["VOID", "REFUNDED"]) assert.deepEqual(chargeActions(charge({ status: s })).link, null);
});

test("billingInFlight polls only while something can settle on its own", () => {
  assert.equal(billingInFlight(undefined), false);
  assert.equal(billingInFlight({ charges: [charge()], mandates: [] }), false);
  assert.equal(billingInFlight({ charges: [charge({ payment_link_url: "u" })], mandates: [] }), true);
  assert.equal(billingInFlight({ charges: [charge({ status: "DEBIT_SCHEDULED" })], mandates: [] }), true);
  assert.equal(billingInFlight({ charges: [charge({ status: "PAID" })], mandates: [{ id: "m", subscription_id: null, method: "UPI", status: "PENDING", max_amount_minor: null, token_id: null, registration_link_url: null, created_at: null, updated_at: null }] }), true);
});

test("chargeAmountText and linkExpired", () => {
  assert.equal(chargeAmountText(charge()), "₹5,000 + GST ₹900 = ₹5,900");
  assert.equal(chargeAmountText(charge({ tax_minor: null, total_minor: null })), "₹5,000 + GST (not priced yet)");
  assert.equal(linkExpired(charge({ link_expires_at: "2026-10-01T00:00:00Z" }), new Date("2026-10-02T00:00:00Z")), true);
  assert.equal(linkExpired(charge({ link_expires_at: "2026-10-03T00:00:00Z" }), new Date("2026-10-02T00:00:00Z")), false);
  assert.equal(linkExpired(charge()), false);
});

test("buildMarkPaid: the amount must equal the GST-inclusive total; no future dates", () => {
  const now = new Date("2026-11-02T10:00:00Z");
  const c = charge();
  const d = { ...emptyMarkPaidDraft(c, now), reference: " UTR123 ", reason: " NEFT received " };
  assert.equal(d.amount_rupees, "5900");
  const ok = buildMarkPaid(d, c, now);
  assert.ok("body" in ok);
  assert.equal(ok.body.amount_minor, 590000);
  assert.equal(ok.body.reference, "UTR123");
  assert.equal(ok.body.reason, "NEFT received");
  assert.equal(ok.body.paid_at, new Date(d.paid_at).toISOString());

  const err = (over: Partial<typeof d>, ch: SubscriptionCharge = c) => {
    const r = buildMarkPaid({ ...d, ...over }, ch, now);
    assert.ok("error" in r, JSON.stringify(over));
    return r.error;
  };
  assert.match(err({ amount_rupees: "5000" }), /must equal the charge total ₹5,900/);
  assert.match(err({ amount_rupees: "5,900.01" }), /must equal/);
  assert.match(err({ reference: "" }), /reference/);
  // admin_core's MANUAL:<reference> rule: 3-50 of A-Z a-z 0-9 / _ . -
  assert.match(err({ reference: "ab" }), /3-50/);
  assert.match(err({ reference: "UTR 123" }), /3-50/);
  assert.match(err({ reference: "x".repeat(51) }), /3-50/);
  assert.ok("body" in buildMarkPaid({ ...d, reference: "CHQ/2026-11.04_a" }, c, now));
  assert.match(err({ paid_at: "2026-11-09T10:00" }), /future/);
  assert.match(err({ paid_at: "" }), /received/);
  assert.match(err({ amount_rupees: "abc" }), /Amount/);
  assert.match(err({ reason: "" }), /reason/);
  // Not priced yet: any positive amount goes; admin_core prices the charge and refuses a mismatch.
  const unpriced = buildMarkPaid(d, charge({ total_minor: null, tax_minor: null }), now);
  assert.ok("body" in unpriced);
  assert.equal(unpriced.body.amount_minor, 590000);
  assert.ok("body" in buildMarkPaid({ ...d, amount_rupees: "₹5,900" }, c, now));
});

test("buildRefund: capped at what is still refundable; needs a paid online payment", () => {
  const c = charge({ status: "PAID", platform_payment_id: "pp1", refunded_minor: 100000 });
  const ok = buildRefund({ amount_rupees: "4900", reason: " goodwill " }, c);
  assert.deepEqual(ok, { body: { platform_payment_id: "pp1", charge_id: "c1", amount_minor: 490000, reason: "goodwill" } });
  assert.match((buildRefund({ amount_rupees: "4900.01", reason: "r" }, c) as { error: string }).error, /At most ₹4,900/);
  assert.match((buildRefund({ amount_rupees: "0", reason: "r" }, c) as { error: string }).error, /amount/);
  assert.match((buildRefund({ amount_rupees: "10", reason: "" }, c) as { error: string }).error, /credit note/);
  assert.match((buildRefund({ amount_rupees: "10", reason: "r" }, charge()) as { error: string }).error, /Only a paid/);
  assert.match(refundEffect(c, 490000), /Full refund/);
  assert.match(refundEffect(c, 100), /Partial refund/);
});

// ---------------------------------------------------------------- invoices and credit notes

test("normalizeDocuments: split or mixed lists, tax derived, newest first, totals net of credit notes", () => {
  const docs = normalizeDocuments({
    invoices: [
      { id: "i1", invoice_number: "CR-2026-0001", item_kind: "CREDIT_PACK", issued_at: "2026-09-01", base_amount_minor: 100000, cgst_amount_minor: 9000, sgst_amount_minor: 9000, total_amount_minor: 118000 },
      { id: "i2", number: "VT/2026-27/I00001", item_kind: "AI_SUBSCRIPTION", issued_at: "2026-11-01", base_minor: 500000, total_minor: 590000, brand_mode: "NEUTRAL" },
    ],
    credit_notes: [{ id: "n1", number: "VT/2026-27/C00001", invoice_id: "i2", invoice_number: "VT/2026-27/I00001", issued_at: "2026-11-05", base_minor: 100000, tax_minor: 18000, total_minor: 118000, reason: "goodwill" }],
  });
  assert.deepEqual(
    docs.map((d) => `${d.doc_kind}:${d.id}`),
    ["CREDIT_NOTE:n1", "INVOICE:i2", "INVOICE:i1"]
  );
  assert.equal(docs[2].tax_minor, 18000); // cgst + sgst
  assert.equal(docs[1].tax_minor, 90000); // total - base
  assert.equal(docs[1].brand_mode, "NEUTRAL");
  assert.equal(docs[0].invoice_number, "VT/2026-27/I00001");
  assert.equal(docs[1].invoice_number, null);
  assert.deepEqual(documentTotals(docs), [{ currency: "INR", invoiced: 708000, credited: 118000, net: 590000 }]);

  const mixed = normalizeDocuments([{ id: "a", doc_kind: "CREDIT_NOTE", total_minor: 5 }, { id: "b", total_minor: 7 }, { total_minor: 9 }]);
  assert.deepEqual(
    mixed.map((d) => d.doc_kind).sort(),
    ["CREDIT_NOTE", "INVOICE"]
  );
  assert.deepEqual(normalizeDocuments({ documents: [{ id: "z", type: "invoice" }] }).map((d) => d.doc_kind), ["INVOICE"]);
  assert.deepEqual(normalizeDocuments(null), []);
});

// ---------------------------------------------------------------- assignment (sales-led PAYMENT)

const published = { id: "v1", status: "PUBLISHED" as const, currency: "INR" };

test("buildAssign PAYMENT: always Live, no start date, send_link, INR only, at least ₹1", () => {
  const d = { ...emptyAssignDraft(new Date("2026-10-16T10:00:00Z"), "inst1"), plan_version_id: "v1", source: "PAYMENT" as const, enforcement: "SHADOW" as const, reason: "deal" };
  const ok = buildAssign(d, published);
  assert.ok("body" in ok);
  assert.equal(ok.body.enforcement, "LIVE");
  assert.equal(ok.body.source, "PAYMENT");
  assert.equal(ok.body.send_link, true);
  assert.equal("start_at" in ok.body, false);
  // A paid plan bills the version's own period: ai-service refuses a different period_months.
  assert.equal("period_months" in ok.body, false);
  const quiet = buildAssign({ ...d, send_link: false, start_at: "" }, published);
  assert.ok("body" in quiet);
  assert.equal(quiet.body.send_link, false);
  assert.match((buildAssign(d, { ...published, currency: "USD" }) as { error: string }).error, /INR only/);
  assert.match((buildAssign({ ...d, price_override_rupees: "0.5" }, published) as { error: string }).error, /at least ₹1/);
  const deal = buildAssign({ ...d, price_override_rupees: "4,000" }, published);
  assert.ok("body" in deal);
  assert.equal(deal.body.price_override_minor, 400000);
});

test("buildAssign MANUAL / COMPLIMENTARY are unchanged: start date kept, no send_link, enforcement as picked", () => {
  const d = { ...emptyAssignDraft(new Date("2026-10-16T10:00:00Z"), "inst1"), plan_version_id: "v1", reason: "pilot" };
  const ok = buildAssign(d, { id: "v1", status: "PUBLISHED" });
  assert.ok("body" in ok);
  assert.equal(ok.body.enforcement, "SHADOW");
  assert.equal(ok.body.source, "MANUAL");
  assert.equal(typeof ok.body.start_at, "string");
  assert.equal(ok.body.period_months, d.period_months);
  assert.equal("send_link" in ok.body, false);
  // A non-INR version is fine for a manual plan (no payment).
  assert.ok("body" in buildAssign(d, { id: "v1", status: "PUBLISHED", currency: "USD" }));
  assert.ok("error" in buildAssign({ ...d, start_at: "" }, { id: "v1", status: "PUBLISHED" }));
});

test("currentSubscription prefers the live one, else the one pending payment", () => {
  const s = (id: string, status: string) => normalizeSubscription({ id, institute_id: "i", plan_version_id: "v", status });
  assert.equal(currentSubscription([s("a", "EXPIRED"), s("b", "PENDING")])?.id, "b");
  assert.equal(currentSubscription([s("b", "PENDING"), s("c", "ACTIVE")])?.id, "c");
  assert.equal(currentSubscription([s("a", "CANCELLED")]), null);
});

test("normalizeFeatures keeps tenant_label", () => {
  const f = normalizeFeatures([{ feature_key: "assistant", label: "Vacademy Assistant", tenant_label: "AI assistant", eligibility: "INCLUDABLE" }]);
  assert.equal(f[0].tenant_label, "AI assistant");
  assert.equal(normalizeFeatures([{ feature_key: "x" }])[0].tenant_label, null);
});

test("documents from admin-core ops (doc_type, against_invoice_number) normalise to credit notes", () => {
  const docs = normalizeDocuments({
    documents: [
      { id: "cn1", doc_type: "CREDIT_NOTE", number: "VT/2627/C00001", against_invoice_number: "VT/2627/I00001", total_minor: 100, issued_at: "2026-10-02T00:00:00Z" },
      { id: "in1", doc_type: "INVOICE", number: "VT/2627/I00001", total_minor: 590000, issued_at: "2026-10-01T00:00:00Z" },
    ],
  });
  assert.equal(docs[0].doc_kind, "CREDIT_NOTE");
  assert.equal(docs[0].invoice_number, "VT/2627/I00001");
  assert.equal(docs[1].doc_kind, "INVOICE");
});

test("staff credit note: AI-plan invoices only, never above what is left, a reason is required", () => {
  const docs = normalizeDocuments({
    invoices: [
      { id: "i1", invoice_number: "CR-2026-0001", item_kind: "CREDIT_PACK", issued_at: "2026-09-01", total_amount_minor: 118000 },
      { id: "i2", number: "VT/2627/I00001", item_kind: "AI_SUBSCRIPTION", issued_at: "2026-11-01", base_minor: 500000, total_minor: 590000 },
    ],
    credit_notes: [{ id: "n1", number: "VT/2627/C00001", invoice_id: "i2", invoice_number: "VT/2627/I00001", issued_at: "2026-11-05", total_minor: 118000 }],
  });
  const pack = docs.find((d) => d.id === "i1")!;
  const plan = docs.find((d) => d.id === "i2")!;
  const note = docs.find((d) => d.id === "n1")!;
  assert.equal(creditableMinor(plan, docs), 472000);
  assert.equal(canIssueCreditNote(plan, docs), true);
  assert.equal(canIssueCreditNote(pack, docs), false, "packs: refund the payment instead");
  assert.equal(canIssueCreditNote(note, docs), false);
  assert.deepEqual(buildStaffCreditNote({ amount_rupees: "4720", reason: "returned by NEFT" }, plan, docs), {
    body: { amount_minor: 472000, reason: "returned by NEFT" },
  });
  assert.match((buildStaffCreditNote({ amount_rupees: "4720.01", reason: "x y z" }, plan, docs) as { error: string }).error, /At most/);
  assert.match((buildStaffCreditNote({ amount_rupees: "10", reason: " " }, plan, docs) as { error: string }).error, /reason/);
  assert.match((buildStaffCreditNote({ amount_rupees: "abc", reason: "why not" }, plan, docs) as { error: string }).error, /Amount/);
  const fully = [...docs, { ...note, id: "n2", total_minor: 472000 }];
  assert.equal(canIssueCreditNote(plan, fully), false);
});
