// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { handlePmRequest, memoryStore, mergeRecord } from "../server/pm-store.ts";

const BASE = "http://localhost/pm-api/v1";
const ok = async () => true;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const j = async (r: Response): Promise<any> => r.json();
const call = (store: ReturnType<typeof memoryStore> | null, path: string, init: RequestInit = {}, verify = ok) =>
  handlePmRequest(new Request(`${BASE}${path}`, { ...init, headers: { Authorization: "Bearer t", "Content-Type": "application/json", ...(init.headers ?? {}) } }), store, verify, "pm_user");

test("rejects callers the backend doesn't accept", async () => {
  const res = await call(memoryStore(), "/records", {}, async () => false);
  assert.equal(res.status, 401);
  const noToken = await handlePmRequest(new Request(`${BASE}/records`), memoryStore(), ok, "x");
  assert.equal(noToken.status, 401);
});

test("without a store: reads say not configured, writes refuse", async () => {
  const read = await call(null, "/records");
  assert.equal(read.status, 200);
  assert.equal((await j(read)).configured, false);
  const write = await call(null, "/records/a", { method: "PUT", body: JSON.stringify({ classification: "PRODUCTION" }) });
  assert.equal(write.status, 503);
});

test("save, read back, history, delete", async () => {
  const store = memoryStore();
  const put = await call(store, "/records/inst-1", { method: "PUT", body: JSON.stringify({ classification: "PRODUCTION", planName: "Growth", finalPrice: "60000" }) });
  assert.equal(put.status, 200);
  const saved = (await j(put)).record;
  assert.equal(saved.classification, "PRODUCTION");
  assert.equal(saved.finalPrice, 60000);
  assert.equal(saved.updatedBy, "pm_user");

  await call(store, "/records/inst-1", { method: "PUT", body: JSON.stringify({ ...saved, classification: "LOST" }) });
  const list = await j(await call(store, "/records"));
  assert.equal(list.records.length, 1);
  assert.equal(list.records[0].classification, "LOST");

  const hist = await j(await call(store, "/records/inst-1/history"));
  assert.equal(hist.history.length, 2);
  assert.deepEqual(hist.history[0].changes.map((c: { field: string }) => c.field), ["classification"]);

  const del = await j(await call(store, "/records/inst-1", { method: "DELETE" }));
  assert.equal(del.deleted, true);
  assert.equal((await j(await call(store, "/records"))).records.length, 0);
});

test("bulk merge keeps fields that aren't sent", async () => {
  const store = memoryStore();
  await call(store, "/records/a", { method: "PUT", body: JSON.stringify({ planName: "Growth", owner: "Asha" }) });
  const res = await j(await call(store, "/records/bulk", { method: "POST", body: JSON.stringify({ records: [{ instituteId: "a", classification: "PRODUCTION" }, { instituteId: "b", classification: "TEST" }, { classification: "X" }] }) }));
  assert.equal(res.saved, 2);
  assert.equal(res.skipped, 1);
  const a = (await j(await call(store, "/records"))).records.find((r: { instituteId: string }) => r.instituteId === "a");
  assert.equal(a.planName, "Growth");
  assert.equal(a.owner, "Asha");
  assert.equal(a.classification, "PRODUCTION");
});

test("task done / snooze / reopen", async () => {
  const store = memoryStore();
  await call(store, "/tasks/renewal%3Aa", { method: "PUT", body: JSON.stringify({ state: "DONE" }) });
  const bad = await call(store, "/tasks/x", { method: "PUT", body: JSON.stringify({ state: "SNOOZED", until: "never" }) });
  assert.equal(bad.status, 400);
  let tasks = (await j(await call(store, "/tasks"))).tasks;
  assert.equal(tasks[0].key, "renewal:a");
  await call(store, "/tasks/renewal%3Aa", { method: "DELETE" });
  tasks = (await j(await call(store, "/tasks"))).tasks;
  assert.equal(tasks.length, 0);
});

test("mergeRecord ignores client-supplied audit fields", () => {
  const r = mergeRecord(null, { instituteId: "a", updatedBy: "someone-else", updatedAt: "1999" }, "pm_user", "2026-11-21T00:00:00Z");
  assert.equal(r?.updatedBy, "pm_user");
  assert.equal(r?.updatedAt, "2026-11-21T00:00:00Z");
});
