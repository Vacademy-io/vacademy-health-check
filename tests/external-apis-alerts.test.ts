import { test } from "node:test";
import assert from "node:assert/strict";
import {
  afterMarkRead,
  ago,
  alertLabel,
  badgeText,
  markAll,
  markKind,
  type AlertGroup,
  type Alerts,
} from "../src/components/external-apis/alerts.ts";
import { failingVendors, failureHint, reasonHint } from "../src/components/external-apis/attention.ts";

const group = (over: Partial<AlertGroup>): AlertGroup => ({
  vendor: "tts.navana.ai",
  http_status: null,
  reason: "Key refused: invalid, revoked or out of credit",
  failed: 105,
  first_at: "2026-11-19T11:49:48Z",
  last_at: "2026-11-20T05:42:01Z",
  ...over,
});

const alerts = (): Alerts => ({
  unread: 112,
  as_of: "2026-11-20T06:00:00Z",
  groups: [group({}), group({ http_status: 401, reason: "", failed: 7 })],
});

test("the badge counts unread failures, capped at 99+", () => {
  assert.equal(badgeText(0), null);
  assert.equal(badgeText(7), "7");
  assert.equal(badgeText(112), "99+");
});

test("a kind is named by its status, or by the vendor's words when it has none", () => {
  assert.equal(alertLabel(group({ http_status: 429, reason: "" })), "HTTP 429");
  assert.equal(alertLabel(group({})), "Key refused: invalid, revoked or out of credit");
  assert.equal(alertLabel(group({ reason: "  " })), "No answer");
});

test("times read as how long ago", () => {
  const now = Date.parse("2026-11-20T06:00:00Z");
  assert.equal(ago("2026-11-20T05:59:30Z", now), "just now");
  assert.equal(ago("2026-11-20T05:42:01Z", now), "18 min ago");
  assert.equal(ago("2026-11-20T01:00:00Z", now), "5 h ago");
  assert.equal(ago("2026-11-17T06:00:00Z", now), "3 days ago");
});

test("marking one kind read names it exactly and only up to what admin-core showed", () => {
  const a = alerts();
  assert.deepEqual(markKind(a, a.groups[0]), {
    vendor: "tts.navana.ai",
    http_status: null,
    reason: "Key refused: invalid, revoked or out of credit",
    up_to: "2026-11-20T06:00:00Z",
  });
  assert.deepEqual(markKind(a, a.groups[1]), { vendor: "tts.navana.ai", http_status: 401, up_to: "2026-11-20T06:00:00Z" });
  assert.deepEqual(markAll(a), { all: true, up_to: "2026-11-20T06:00:00Z" });
});

test("a kind marked read leaves the bell at once; the other kind stays", () => {
  const a = alerts();
  const after = afterMarkRead(a, markKind(a, a.groups[0]));
  assert.equal(after.unread, 7);
  assert.equal(after.groups.length, 1);
  assert.equal(after.groups[0].http_status, 401);

  const cleared = afterMarkRead(a, markAll(a));
  assert.equal(cleared.unread, 0);
  assert.equal(cleared.groups.length, 0);
});

test("a failure without a status is explained by its words, not called a timeout", () => {
  assert.equal(reasonHint("Key refused: invalid, revoked or out of credit"), "Key refused: check the key");
  assert.equal(reasonHint("Refused for capacity: too many sockets on this key"), "At capacity: too many connections on this key");
  assert.equal(reasonHint('Out of credits: Sarvam said "Credits exhausted"'), "Out of credits: top up");
  assert.equal(reasonHint("ConnectTimeout"), "No answer: timeout or connection refused");
  assert.equal(reasonHint(""), null);
  assert.equal(failureHint(402, ""), "Out of credits: top up");
  assert.equal(failureHint(null, ""), "No answer: timeout or connection refused");
  assert.equal(failureHint(null, "Speech-to-text failed mid-call; switched to GoogleSTTService"), null);
});

test("Needs attention gives Navana's key refusals the key hint", () => {
  const [v] = failingVendors([
    { vendor: "tts.navana.ai", http_status: null, reason: "Key refused: invalid, revoked or out of credit", failed: 47, last_at: "2026-11-20T05:42:01Z" },
  ]);
  assert.equal(v.hint, "Key refused: check the key");
});
