/**
 * Google Analytics 4 → Command Center.
 *
 * Runs server-side only: in the Cloudflare Pages Function (functions/[[route]].ts) in production and
 * in a Vite dev middleware (vite.config.ts) locally. The service-account key never reaches the browser.
 *
 * Configuration (server env vars / Cloudflare secrets, never VITE_-prefixed):
 *   GA_SERVICE_ACCOUNT_JSON  the whole JSON key file of a Google service account that has
 *                            Viewer access on every property below
 *   GA_PRODUCTS              JSON array, one entry per product site, e.g.
 *     [{"product":"voomsales","propertyId":"123456789"},
 *      {"product":"vacademy","propertyId":"987654321","hostnames":["vacademy.io","www.vacademy.io"]},
 *      {"product":"telleo","propertyId":"987654321","hostnames":["telleo.ai","www.telleo.ai"]},
 *      {"product":"evalezy","propertyId":"987654321","hostnames":["evalezy.com","www.evalezy.com"]}]
 *     hostnames splits one property shared by several sites (vacademy.io, telleo.ai and evalezy.com
 *     share GTM-5C4DDJ6W). leadEvents (optional) lists GA event names counted as demo requests.
 *
 * Setup guide: docs/command-center/GA_SETUP.md
 */

export interface GaProductConfig {
  product: string;
  propertyId: string;
  hostnames?: string[];
  leadEvents?: string[];
}

export interface GaEnv {
  GA_SERVICE_ACCOUNT_JSON?: string;
  GA_PRODUCTS?: string;
}

export interface GaTotals {
  activeUsers: number;
  newUsers: number;
  sessions: number;
  pageViews: number;
  engagedSessions: number;
  leads: number;
}

export interface GaDay extends GaTotals {
  /** YYYY-MM-DD in the property's time zone. */
  date: string;
}

export interface GaSplitRow {
  name: string;
  activeUsers: number;
  sessions: number;
}

export interface GaProductReport {
  product: string;
  propertyId: string;
  hostnames: string[];
  error: string | null;
  totals: GaTotals;
  daily: GaDay[];
  devices: GaSplitRow[];
  channels: GaSplitRow[];
}

export interface GaReport {
  configured: boolean;
  /** Why it isn't configured, or a config parse error. */
  message: string | null;
  days: number;
  generatedAt: string;
  products: GaProductReport[];
}

export const DEFAULT_LEAD_EVENTS = ["generate_lead", "demo_request", "demo_form_submit", "trial_signup_complete"];
export const ALLOWED_DAYS = [7, 30, 90];

const SCOPE = "https://www.googleapis.com/auth/analytics.readonly";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DATA_API = "https://analyticsdata.googleapis.com/v1beta";
const CACHE_MS = 10 * 60 * 1000;

// ---------------------------------------------------------------- config

export function parseProducts(raw: string | undefined): { products: GaProductConfig[]; error: string | null } {
  if (!raw || !raw.trim()) return { products: [], error: "GA_PRODUCTS is not set." };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { products: [], error: "GA_PRODUCTS is not valid JSON." };
  }
  if (!Array.isArray(parsed)) return { products: [], error: "GA_PRODUCTS must be a JSON array." };
  const products: GaProductConfig[] = [];
  for (const item of parsed) {
    const r = (item ?? {}) as Record<string, unknown>;
    const product = typeof r.product === "string" ? r.product.trim() : "";
    const propertyId = String(r.propertyId ?? "").replace(/^properties\//, "").trim();
    if (!product || !/^\d+$/.test(propertyId)) {
      return { products: [], error: `GA_PRODUCTS entry needs "product" and a numeric "propertyId" (got ${JSON.stringify(item)}).` };
    }
    const list = (v: unknown) => (Array.isArray(v) ? v.map((x) => String(x).trim().toLowerCase()).filter(Boolean) : undefined);
    products.push({ product, propertyId, hostnames: list(r.hostnames), leadEvents: list(r.leadEvents) });
  }
  return { products, error: null };
}

export function clampDays(raw: unknown): number {
  const n = Number(raw);
  return ALLOWED_DAYS.includes(n) ? n : 30;
}

// ---------------------------------------------------------------- parsing (pure)

interface ApiRow {
  dimensionValues?: { value?: string }[];
  metricValues?: { value?: string }[];
}
export interface ApiReport {
  rows?: ApiRow[];
}

const num = (v: string | undefined) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** "20261103" → "2026-11-03". */
export function gaDate(v: string | undefined): string {
  const s = v ?? "";
  return /^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : s;
}

export const BASE_METRICS = ["activeUsers", "newUsers", "sessions", "screenPageViews", "engagedSessions"];

function totalsFrom(metrics: { value?: string }[] | undefined, leads = 0): GaTotals {
  const m = metrics ?? [];
  return {
    activeUsers: num(m[0]?.value),
    newUsers: num(m[1]?.value),
    sessions: num(m[2]?.value),
    pageViews: num(m[3]?.value),
    engagedSessions: num(m[4]?.value),
    leads,
  };
}

/** Builds one product's report from the five batch responses (order fixed by buildRequests). */
export function assembleProduct(cfg: GaProductConfig, reports: ApiReport[], days: number, today: Date): Omit<GaProductReport, "error"> {
  const [totalsR, dailyR, devicesR, channelsR, leadsR] = reports;

  const leadsByDate = new Map<string, number>();
  let leadTotal = 0;
  for (const row of leadsR?.rows ?? []) {
    const d = gaDate(row.dimensionValues?.[0]?.value);
    const c = num(row.metricValues?.[0]?.value);
    leadsByDate.set(d, (leadsByDate.get(d) ?? 0) + c);
    leadTotal += c;
  }

  const byDate = new Map<string, GaDay>();
  for (const row of dailyR?.rows ?? []) {
    const date = gaDate(row.dimensionValues?.[0]?.value);
    byDate.set(date, { date, ...totalsFrom(row.metricValues, leadsByDate.get(date) ?? 0) });
  }
  // Every day in the window, zero-filled, oldest first, so charts line up across products.
  const daily: GaDay[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    const date = d.toISOString().slice(0, 10);
    daily.push(byDate.get(date) ?? { date, activeUsers: 0, newUsers: 0, sessions: 0, pageViews: 0, engagedSessions: 0, leads: leadsByDate.get(date) ?? 0 });
  }

  const split = (r: ApiReport | undefined): GaSplitRow[] =>
    (r?.rows ?? [])
      .map((row) => ({ name: row.dimensionValues?.[0]?.value || "(not set)", activeUsers: num(row.metricValues?.[0]?.value), sessions: num(row.metricValues?.[1]?.value) }))
      .sort((a, b) => b.activeUsers - a.activeUsers);

  return {
    product: cfg.product,
    propertyId: cfg.propertyId,
    hostnames: cfg.hostnames ?? [],
    totals: totalsFrom(totalsR?.rows?.[0]?.metricValues, leadTotal),
    daily,
    devices: split(devicesR),
    channels: split(channelsR).slice(0, 8),
  };
}

/** The five runReport requests for one product, in the order assembleProduct expects. */
export function buildRequests(cfg: GaProductConfig, days: number): Record<string, unknown>[] {
  const dateRanges = [{ startDate: `${days - 1}daysAgo`, endDate: "today" }];
  const metrics = (names: string[]) => names.map((name) => ({ name }));
  const host = cfg.hostnames?.length ? { filter: { fieldName: "hostName", inListFilter: { values: cfg.hostnames, caseSensitive: false } } } : null;
  const withHost = (extra?: Record<string, unknown>) => {
    const filters = [host, extra].filter(Boolean);
    if (filters.length === 0) return {};
    return { dimensionFilter: filters.length === 1 ? filters[0] : { andGroup: { expressions: filters } } };
  };
  const leadEvents = cfg.leadEvents?.length ? cfg.leadEvents : DEFAULT_LEAD_EVENTS;

  return [
    { dateRanges, metrics: metrics(BASE_METRICS), ...withHost() },
    { dateRanges, dimensions: [{ name: "date" }], metrics: metrics(BASE_METRICS), limit: 400, ...withHost() },
    { dateRanges, dimensions: [{ name: "deviceCategory" }], metrics: metrics(["activeUsers", "sessions"]), ...withHost() },
    { dateRanges, dimensions: [{ name: "sessionDefaultChannelGroup" }], metrics: metrics(["activeUsers", "sessions"]), ...withHost() },
    {
      dateRanges,
      dimensions: [{ name: "date" }],
      metrics: metrics(["eventCount"]),
      limit: 400,
      ...withHost({ filter: { fieldName: "eventName", inListFilter: { values: leadEvents } } }),
    },
  ];
}

// ---------------------------------------------------------------- Google auth (service account → access token)

function b64url(input: Uint8Array | string): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  const bin = Array.from(bytes, (b) => String.fromCharCode(b)).join("");
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToDer(pem: string): ArrayBuffer {
  const body = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const bin = atob(body);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

let cachedToken: { token: string; exp: number; email: string } | null = null;

async function accessToken(serviceAccountJson: string): Promise<string> {
  let sa: { client_email?: string; private_key?: string };
  try {
    sa = JSON.parse(serviceAccountJson);
  } catch {
    throw new Error("GA_SERVICE_ACCOUNT_JSON is not valid JSON.");
  }
  if (!sa.client_email || !sa.private_key) throw new Error("GA_SERVICE_ACCOUNT_JSON needs client_email and private_key.");
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.email === sa.client_email && cachedToken.exp - 60 > now) return cachedToken.token;

  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({ iss: sa.client_email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 }));
  const key = await crypto.subtle.importKey("pkcs8", pemToDer(sa.private_key), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${header}.${claims}`)));

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=${encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer")}&assertion=${header}.${claims}.${b64url(sig)}`,
  });
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error_description?: string; error?: string };
  if (!res.ok || !body.access_token) throw new Error(`Google sign-in failed: ${body.error_description ?? body.error ?? res.status}`);
  cachedToken = { token: body.access_token, exp: now + (body.expires_in ?? 3600), email: sa.client_email };
  return body.access_token;
}

// ---------------------------------------------------------------- report

const reportCache = new Map<string, { at: number; report: GaReport }>();

async function runProduct(cfg: GaProductConfig, days: number, token: string, today: Date): Promise<GaProductReport> {
  try {
    const res = await fetch(`${DATA_API}/properties/${cfg.propertyId}:batchRunReports`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ requests: buildRequests(cfg, days) }),
    });
    const body = (await res.json().catch(() => ({}))) as { reports?: ApiReport[]; error?: { message?: string } };
    if (!res.ok) throw new Error(body.error?.message ?? `Google Analytics returned ${res.status}`);
    return { ...assembleProduct(cfg, body.reports ?? [], days, today), error: null };
  } catch (e) {
    const empty = assembleProduct(cfg, [], days, today);
    return { ...empty, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function gaReport(env: GaEnv, daysRaw: unknown, opts: { fresh?: boolean } = {}): Promise<GaReport> {
  const days = clampDays(daysRaw);
  const base = { days, generatedAt: new Date().toISOString(), products: [] as GaProductReport[] };
  if (!env.GA_SERVICE_ACCOUNT_JSON) return { ...base, configured: false, message: "GA_SERVICE_ACCOUNT_JSON is not set." };
  const { products, error } = parseProducts(env.GA_PRODUCTS);
  if (error) return { ...base, configured: false, message: error };

  const key = `${days}|${env.GA_PRODUCTS}`;
  const hit = reportCache.get(key);
  if (!opts.fresh && hit && Date.now() - hit.at < CACHE_MS) return hit.report;

  const token = await accessToken(env.GA_SERVICE_ACCOUNT_JSON);
  const today = new Date();
  const report: GaReport = { ...base, configured: true, message: null, products: await Promise.all(products.map((p) => runProduct(p, days, token, today))) };
  reportCache.set(key, { at: Date.now(), report });
  return report;
}

// ---------------------------------------------------------------- HTTP handler (shared by Cloudflare and Vite dev)

export const GA_ROUTE = "/ga-api/v1/report";

/**
 * Answers GET /ga-api/v1/report?days=30. `verify` must confirm the bearer token belongs to a portal
 * user (the caller checks the allowlist and asks the backend to accept the token): the JWT here is
 * only decoded, never signature-checked, so it must not be trusted on its own.
 */
export async function handleGaRequest(request: Request, env: GaEnv, verify: (bearer: string, clientId: string | null) => Promise<boolean>): Promise<Response> {
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  if (request.method !== "GET") return json(405, { message: "GET only" });
  const auth = request.headers.get("Authorization") ?? "";
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!bearer || !(await verify(bearer, request.headers.get("clientId")))) return json(401, { message: "Sign in to the portal to see analytics." });
  const url = new URL(request.url);
  try {
    return json(200, await gaReport(env, url.searchParams.get("days"), { fresh: url.searchParams.get("fresh") === "1" }));
  } catch (e) {
    return json(502, { message: e instanceof Error ? e.message : String(e) });
  }
}

/** Token check against the backend: a cheap authenticated super-admin call, cached for 5 minutes. */
const verified = new Map<string, number>();
export async function verifyWithBackend(bearer: string, backendBase: string, clientId: string | null): Promise<boolean> {
  const now = Date.now();
  const until = verified.get(bearer);
  if (until && until > now) return true;
  try {
    const headers: Record<string, string> = { Authorization: `Bearer ${bearer}` };
    if (clientId) headers.clientId = clientId;
    const res = await fetch(`${backendBase}/admin-core-service/super-admin/v1/dashboard`, { headers });
    if (res.ok) {
      verified.set(bearer, now + 5 * 60 * 1000);
      return true;
    }
  } catch {
    /* treat as not verified */
  }
  return false;
}
