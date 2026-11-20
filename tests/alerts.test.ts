import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ago,
  badgeText,
  isUnread,
  markRead,
  MARK_TTL_MS,
  parseMarks,
  unreadItems,
  type AlertItem,
} from "../src/components/alerts/alerts.ts";
import { failureLabel, failureToAlert } from "../src/components/alerts/external-api-items.ts";
import { failingVendors, failureHint, reasonHint } from "../src/components/external-apis/attention.ts";

const item = (over: Partial<AlertItem>): AlertItem => ({
  key: "external-apis|tts.navana.ai||Key refused",
  source: "external-apis",
  title: "Navana",
  detail: "Key refused",
  count: 3,
  lastAt: "2026-11-20T05:00:00Z",
  ...over,
});

test("the badge counts unread alerts, capped at 99+", () => {
  assert.equal(badgeText(0), null);
  assert.equal(badgeText(7), "7");
  assert.equal(badgeText(100), "99+");
});

test("an alert is unread until marked, and unread again when it happens after the mark", () => {
  const a = item({});
  assert.equal(isUnread(a, {}), true);
  const marks = markRead({}, [a], Date.parse("2026-11-20T06:00:00Z"));
  assert.equal(isUnread(a, marks), false);
  assert.equal(isUnread({ ...a, lastAt: "2026-11-20T05:30:00Z" }, marks), true);
});

test("marking one alert read leaves the others; unread comes latest first", () => {
  const a = item({ key: "a", lastAt: "2026-11-20T01:00:00Z" });
  const b = item({ key: "b", lastAt: "2026-11-20T03:00:00Z" });
  const c = item({ key: "c", lastAt: "2026-11-20T02:00:00Z" });
  assert.deepEqual(unreadItems([a, b, c], {}).map((i) => i.key), ["b", "c", "a"]);
  const marks = markRead({}, [b], Date.parse("2026-11-20T04:00:00Z"));
  assert.deepEqual(unreadItems([a, b, c], marks).map((i) => i.key), ["c", "a"]);
});

test("old marks are dropped; unreadable storage is no marks", () => {
  const now = Date.parse("2026-11-20T00:00:00Z");
  const old = new Date(now - MARK_TTL_MS - 1000).toISOString();
  const marks = markRead({ stale: old, fresh: "2026-11-19T00:00:00Z" }, [], now);
  assert.deepEqual(Object.keys(marks), ["fresh"]);
  assert.deepEqual(parseMarks("not json"), {});
  assert.deepEqual(parseMarks("[1,2]"), {});
  assert.deepEqual(parseMarks('{"a":"2026-11-20T00:00:00Z","b":5}'), { a: "2026-11-20T00:00:00Z" });
});

test("times read as how long ago", () => {
  const now = Date.parse("2026-11-20T12:00:00Z");
  assert.equal(ago("2026-11-20T11:59:30Z", now), "just now");
  assert.equal(ago("2026-11-20T11:55:00Z", now), "5 min ago");
  assert.equal(ago("2026-11-20T09:00:00Z", now), "3 h ago");
  assert.equal(ago("2026-11-17T12:00:00Z", now), "3 days ago");
});

test("an external API failure becomes an alert named by its status, or by the vendor's words", () => {
  assert.equal(failureLabel({ http_status: 402, reason: "" }), "HTTP 402");
  assert.equal(failureLabel({ http_status: null, reason: "" }), "No answer");
  const a = failureToAlert({
    vendor: "tts.navana.ai",
    http_status: null,
    reason: "Key refused: invalid, revoked or out of credit",
    failed: 105,
    last_at: "2026-11-20T05:42:01Z",
  });
  assert.equal(a.source, "external-apis");
  assert.equal(a.detail, "Key refused: invalid, revoked or out of credit");
  assert.equal(a.hint, "Key refused: check the key");
  assert.equal(a.count, 105);
  assert.ok(a.key.startsWith("external-apis|tts.navana.ai|"));
  // The same kind keeps its key across refreshes, so a read mark sticks.
  assert.equal(failureToAlert({ vendor: "x", http_status: 500, reason: "", failed: 1, last_at: "" }).key,
    failureToAlert({ vendor: "x", http_status: 500, reason: "", failed: 9, last_at: "z" }).key);
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
