// Run: node --test tests/*.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { assembleProduct, buildRequests, clampDays, gaDate, handleGaRequest, parseProducts, type ApiReport } from "../server/ga-report.ts";

test("GA_PRODUCTS: valid config parses, hostnames lower-cased, properties/ prefix stripped", () => {
  const { products, error } = parseProducts(
    JSON.stringify([
      { product: "voomsales", propertyId: "properties/123" },
      { product: "telleo", propertyId: 456, hostnames: ["Telleo.ai", " www.telleo.ai "] },
    ])
  );
  assert.equal(error, null);
  assert.deepEqual(products[0], { product: "voomsales", propertyId: "123", hostnames: undefined, leadEvents: undefined });
  assert.deepEqual(products[1].hostnames, ["telleo.ai", "www.telleo.ai"]);
});

test("GA_PRODUCTS: missing, bad JSON and bad entries are reported, not thrown", () => {
  assert.match(parseProducts(undefined).error!, /not set/);
  assert.match(parseProducts("{oops").error!, /not valid JSON/);
  assert.match(parseProducts("{}").error!, /array/);
  assert.match(parseProducts(JSON.stringify([{ product: "x", propertyId: "G-ABC" }])).error!, /numeric/);
});

test("days are limited to 7, 30 or 90", () => {
  assert.equal(clampDays("7"), 7);
  assert.equal(clampDays(90), 90);
  assert.equal(clampDays("365"), 30);
  assert.equal(clampDays(null), 30);
});

test("GA dates convert to ISO", () => {
  assert.equal(gaDate("20261103"), "2026-11-03");
  assert.equal(gaDate("(other)"), "(other)");
});

test("requests: host filter only when hostnames are set; lead events combine with it", () => {
  const plain = buildRequests({ product: "voomsales", propertyId: "1" }, 30);
  assert.equal(plain.length, 5);
  assert.equal("dimensionFilter" in plain[0], false);
  assert.deepEqual((plain[0].dateRanges as unknown[])[0], { startDate: "29daysAgo", endDate: "today" });
  const hosted = buildRequests({ product: "telleo", propertyId: "1", hostnames: ["telleo.ai"], leadEvents: ["demo_request"] }, 7);
  const f0 = hosted[0].dimensionFilter as { filter: { fieldName: string } };
  assert.equal(f0.filter.fieldName, "hostName");
  const f4 = hosted[4].dimensionFilter as { andGroup: { expressions: { filter: { fieldName: string; inListFilter: { values: string[] } } }[] } };
  assert.deepEqual(f4.andGroup.expressions.map((e) => e.filter.fieldName), ["hostName", "eventName"]);
  assert.deepEqual(f4.andGroup.expressions[1].filter.inListFilter.values, ["demo_request"]);
});

test("assemble: totals, zero-filled days with leads, device and channel splits", () => {
  const m = (...v: number[]) => v.map((x) => ({ value: String(x) }));
  const reports: ApiReport[] = [
    { rows: [{ metricValues: m(120, 80, 200, 900, 150) }] },
    { rows: [{ dimensionValues: [{ value: "20261103" }], metricValues: m(50, 30, 70, 300, 60) }] },
    { rows: [{ dimensionValues: [{ value: "mobile" }], metricValues: m(40, 50) }, { dimensionValues: [{ value: "desktop" }], metricValues: m(90, 150) }] },
    { rows: [{ dimensionValues: [{ value: "Organic Search" }], metricValues: m(70, 100) }] },
    { rows: [{ dimensionValues: [{ value: "20261103" }], metricValues: m(4) }, { dimensionValues: [{ value: "20261102" }], metricValues: m(1) }] },
  ];
  const r = assembleProduct({ product: "voomsales", propertyId: "1" }, reports, 3, new Date("2026-11-03T10:00:00Z"));
  assert.equal(r.totals.activeUsers, 120);
  assert.equal(r.totals.leads, 5);
  assert.deepEqual(r.daily.map((d) => d.date), ["2026-11-01", "2026-11-02", "2026-11-03"]);
  assert.equal(r.daily[0].activeUsers, 0);
  assert.equal(r.daily[1].leads, 1);
  assert.equal(r.daily[2].activeUsers, 50);
  assert.equal(r.daily[2].leads, 4);
  assert.deepEqual(r.devices.map((d) => d.name), ["desktop", "mobile"]);
  assert.equal(r.channels[0].name, "Organic Search");
});

test("handler: no token → 401; verified but unconfigured → configured:false with the reason", async () => {
  const noToken = await handleGaRequest(new Request("http://x/ga-api/v1/report"), {}, async () => true);
  assert.equal(noToken.status, 401);
  const rejected = await handleGaRequest(new Request("http://x/ga-api/v1/report", { headers: { Authorization: "Bearer t" } }), {}, async () => false);
  assert.equal(rejected.status, 401);
  const ok = await handleGaRequest(new Request("http://x/ga-api/v1/report?days=7", { headers: { Authorization: "Bearer t" } }), {}, async () => true);
  assert.equal(ok.status, 200);
  const body = (await ok.json()) as { configured: boolean; message: string; days: number };
  assert.equal(body.configured, false);
  assert.equal(body.days, 7);
  assert.match(body.message, /GA_SERVICE_ACCOUNT_JSON/);
});
