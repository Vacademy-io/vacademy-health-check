// Run: npm test  (node --test with native TypeScript stripping; no extra deps)
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatActor, isSystemActor, shortActorId } from "../src/lib/actor-name.ts";

const ID = "a1f0c3d6-9b47-4e28-8c15-0d7a2f6e5b31";
const ME = "7d2e9a10-1111-4c4c-9e9e-123456789abc";

test("no actor id → 'unknown' (or the caller's empty label)", () => {
  assert.deepEqual(formatActor(null), { kind: "none", label: "unknown" });
  assert.deepEqual(formatActor(undefined), { kind: "none", label: "unknown" });
  assert.deepEqual(formatActor("   "), { kind: "none", label: "unknown" });
  assert.equal(formatActor(null, { empty: "—" }).label, "—");
  assert.equal(formatActor("", { empty: "—" }).title, undefined);
});

test("'system' is shown as system, in any case, and never as You or a name", () => {
  assert.equal(formatActor("system").label, "system");
  assert.equal(formatActor("SYSTEM").kind, "system");
  assert.equal(formatActor(" System ", { currentUserId: "system", names: { system: "Bot" } }).label, "system");
  assert.equal(isSystemActor("system"), true);
  assert.equal(isSystemActor("systematic"), false);
  assert.equal(isSystemActor(null), false);
});

test("the signed-in user is 'You'; tooltip has the name (when known) and the id", () => {
  assert.deepEqual(formatActor(ME, { currentUserId: ME }), { kind: "self", label: "You", title: ME });
  assert.deepEqual(formatActor(ME, { currentUserId: ME, names: { [ME]: "Shreyash Jain" } }), {
    kind: "self",
    label: "You",
    title: `Shreyash Jain · ${ME}`,
  });
  assert.equal(formatActor(` ${ME} `, { currentUserId: ME }).label, "You");
});

test("a resolved id shows the name, full id in the tooltip (Map or record)", () => {
  assert.deepEqual(formatActor(ID, { names: new Map([[ID, "  Riya Jain "]]) }), {
    kind: "named",
    label: "Riya Jain",
    title: ID,
  });
  assert.equal(formatActor(ID, { names: { [ID]: "Riya Jain" }, currentUserId: ME }).label, "Riya Jain");
});

test("an unresolved id is shortened, never shown raw; blank names do not count", () => {
  assert.deepEqual(formatActor(ID), { kind: "unresolved", label: "user a1f0c3d6…", title: ID });
  assert.equal(formatActor(ID, { names: { [ID]: "   " } }).label, "user a1f0c3d6…");
  assert.equal(formatActor(ID, { names: { other: "Someone" }, currentUserId: null }).kind, "unresolved");
});

test("shortActorId keeps short ids whole", () => {
  assert.equal(shortActorId(ID), "a1f0c3d6…");
  assert.equal(shortActorId("abc"), "abc");
  assert.equal(shortActorId("123456789"), "123456789");
  assert.equal(shortActorId("1234567890"), "12345678…");
});
