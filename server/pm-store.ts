/**
 * PM View store: the PM's own data (classifications, Customer Register, edit history, inbox task
 * state). It is deliberately SEPARATE from the Vacademy platform backend: nothing here reads or
 * writes platform databases, and no platform service reads this store. Deleting it leaves the
 * platform untouched.
 *
 * Runs server-side only:
 *   production  Cloudflare Pages Function (functions/[[route]].ts) with a D1 database bound as PM_DB
 *   pnpm dev    Vite middleware (vite.config.ts) with a JSON file in .pm-data/ (git-ignored)
 *
 * Setup guide: docs/command-center/PM_STORE_SETUP.md
 */
import { diffRecords, sanitizeRecord, type PmHistoryEntry, type PmRecord, type PmTaskState } from "../src/lib/pm-record.ts";

export const PM_ROUTE_PREFIX = "/pm-api/v1";

export interface PmStore {
  kind: "d1" | "file" | "memory";
  listRecords(): Promise<PmRecord[]>;
  getRecords(ids: string[]): Promise<Map<string, PmRecord>>;
  putRecords(records: PmRecord[], history: PmHistoryEntry[]): Promise<void>;
  deleteRecord(id: string, history: PmHistoryEntry): Promise<void>;
  history(id: string): Promise<PmHistoryEntry[]>;
  listTasks(): Promise<PmTaskState[]>;
  putTask(task: PmTaskState): Promise<void>;
  deleteTask(key: string): Promise<void>;
}

// ---------------------------------------------------------------- snapshot store (dev file, tests)

export interface PmSnapshot {
  records: Record<string, PmRecord>;
  history: PmHistoryEntry[];
  tasks: Record<string, PmTaskState>;
}

const emptySnapshot = (): PmSnapshot => ({ records: {}, history: [], tasks: {} });
const HISTORY_CAP = 20_000;

/** A store kept as one JSON snapshot; `load`/`save` decide where it lives (file in dev, memory in tests). */
export function snapshotStore(kind: "file" | "memory", load: () => Promise<PmSnapshot | null>, save: (s: PmSnapshot) => Promise<void>): PmStore {
  const read = async () => {
    const s = await load();
    return { ...emptySnapshot(), ...(s ?? {}) };
  };
  return {
    kind,
    async listRecords() {
      return Object.values((await read()).records).map(sanitizeRecord).filter((r): r is PmRecord => r !== null);
    },
    async getRecords(ids) {
      const s = await read();
      return new Map(ids.filter((id) => s.records[id]).map((id) => [id, sanitizeRecord(s.records[id])!]));
    },
    async putRecords(records, history) {
      const s = await read();
      for (const r of records) s.records[r.instituteId] = r;
      s.history = [...s.history, ...history].slice(-HISTORY_CAP);
      await save(s);
    },
    async deleteRecord(id, entry) {
      const s = await read();
      delete s.records[id];
      s.history = [...s.history, entry].slice(-HISTORY_CAP);
      await save(s);
    },
    async history(id) {
      return (await read()).history.filter((h) => h.instituteId === id).reverse();
    },
    async listTasks() {
      return Object.values((await read()).tasks);
    },
    async putTask(task) {
      const s = await read();
      s.tasks[task.key] = task;
      await save(s);
    },
    async deleteTask(key) {
      const s = await read();
      delete s.tasks[key];
      await save(s);
    },
  };
}

export function memoryStore(): PmStore {
  let snap: PmSnapshot = emptySnapshot();
  return snapshotStore("memory", async () => structuredClone(snap), async (s) => {
    snap = structuredClone(s);
  });
}

// ---------------------------------------------------------------- D1 store (production)

/** The slice of Cloudflare's D1 binding this file uses. */
export interface D1Like {
  prepare(sql: string): D1StatementLike;
  batch(statements: D1StatementLike[]): Promise<unknown>;
}
interface D1StatementLike {
  bind(...values: unknown[]): D1StatementLike;
  all<T = Record<string, unknown>>(): Promise<{ results?: T[] }>;
  run(): Promise<unknown>;
}

const SCHEMA = [
  "CREATE TABLE IF NOT EXISTS pm_records (institute_id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT, updated_by TEXT)",
  "CREATE TABLE IF NOT EXISTS pm_history (id INTEGER PRIMARY KEY AUTOINCREMENT, institute_id TEXT NOT NULL, at TEXT NOT NULL, by TEXT, changes TEXT NOT NULL)",
  "CREATE INDEX IF NOT EXISTS pm_history_institute ON pm_history (institute_id, id)",
  "CREATE TABLE IF NOT EXISTS pm_tasks (key TEXT PRIMARY KEY, state TEXT NOT NULL, until TEXT, at TEXT, by TEXT)",
];

let schemaReady: Promise<unknown> | null = null;

export function d1Store(db: D1Like): PmStore {
  const ready = () => (schemaReady ??= db.batch(SCHEMA.map((sql) => db.prepare(sql))).catch((e) => {
    schemaReady = null;
    throw e;
  }));
  const parse = (rows: { data: string }[] | undefined) =>
    (rows ?? []).map((r) => sanitizeRecord(JSON.parse(r.data))).filter((r): r is PmRecord => r !== null);
  const historyStmt = (h: PmHistoryEntry) =>
    db.prepare("INSERT INTO pm_history (institute_id, at, by, changes) VALUES (?, ?, ?, ?)").bind(h.instituteId, h.at, h.by, JSON.stringify(h.changes));

  return {
    kind: "d1",
    async listRecords() {
      await ready();
      return parse((await db.prepare("SELECT data FROM pm_records").all<{ data: string }>()).results);
    },
    async getRecords(ids) {
      await ready();
      const out = new Map<string, PmRecord>();
      for (let i = 0; i < ids.length; i += 50) {
        const chunk = ids.slice(i, i + 50);
        const rows = await db.prepare(`SELECT data FROM pm_records WHERE institute_id IN (${chunk.map(() => "?").join(",")})`).bind(...chunk).all<{ data: string }>();
        for (const r of parse(rows.results)) out.set(r.instituteId, r);
      }
      return out;
    },
    async putRecords(records, history) {
      await ready();
      const stmts = [
        ...records.map((r) =>
          db
            .prepare("INSERT INTO pm_records (institute_id, data, updated_at, updated_by) VALUES (?, ?, ?, ?) ON CONFLICT(institute_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at, updated_by = excluded.updated_by")
            .bind(r.instituteId, JSON.stringify(r), r.updatedAt, r.updatedBy)
        ),
        ...history.map(historyStmt),
      ];
      for (let i = 0; i < stmts.length; i += 100) await db.batch(stmts.slice(i, i + 100));
    },
    async deleteRecord(id, entry) {
      await ready();
      await db.batch([db.prepare("DELETE FROM pm_records WHERE institute_id = ?").bind(id), historyStmt(entry)]);
    },
    async history(id) {
      await ready();
      const rows = await db.prepare("SELECT institute_id, at, by, changes FROM pm_history WHERE institute_id = ? ORDER BY id DESC LIMIT 200").bind(id).all<{ institute_id: string; at: string; by: string; changes: string }>();
      return (rows.results ?? []).map((r) => ({ instituteId: r.institute_id, at: r.at, by: r.by, changes: JSON.parse(r.changes) }));
    },
    async listTasks() {
      await ready();
      const rows = await db.prepare("SELECT key, state, until, at, by FROM pm_tasks").all<PmTaskState>();
      return rows.results ?? [];
    },
    async putTask(t) {
      await ready();
      await db
        .prepare("INSERT INTO pm_tasks (key, state, until, at, by) VALUES (?, ?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET state = excluded.state, until = excluded.until, at = excluded.at, by = excluded.by")
        .bind(t.key, t.state, t.until, t.at, t.by)
        .run();
    },
    async deleteTask(key) {
      await ready();
      await db.prepare("DELETE FROM pm_tasks WHERE key = ?").bind(key).run();
    },
  };
}

// ---------------------------------------------------------------- merge (bulk classify / import)

/** Applies only the fields present in `patch` onto `existing` (or a new record), then re-validates. */
export function mergeRecord(existing: PmRecord | null, patch: Record<string, unknown>, actor: string, now: string): PmRecord | null {
  const id = String(patch.instituteId ?? existing?.instituteId ?? "").trim();
  if (!id) return null;
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) if (v !== undefined && k !== "updatedAt" && k !== "updatedBy") clean[k] = v;
  const merged = sanitizeRecord({ ...(existing ?? {}), ...clean, instituteId: id });
  return merged ? { ...merged, updatedAt: now, updatedBy: actor } : null;
}

// ---------------------------------------------------------------- HTTP handler

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

const NOT_CONFIGURED =
  "The PM store isn't connected, so nothing can be saved yet. Bind a D1 database named PM_DB to the portal's Pages project (docs/command-center/PM_STORE_SETUP.md).";
const MAX_BULK = 2000;

/**
 * Answers /pm-api/v1/*. `verify` must confirm the bearer token belongs to a portal user (the caller
 * checks the allowlist and asks the backend to accept the token). `actor` is the username recorded
 * in the edit history.
 */
export async function handlePmRequest(
  request: Request,
  store: PmStore | null,
  verify: (bearer: string, clientId: string | null) => Promise<boolean>,
  actor: string
): Promise<Response> {
  const auth = request.headers.get("Authorization") ?? "";
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!bearer || !(await verify(bearer, request.headers.get("clientId")))) return json(401, { message: "Sign in to the portal to use the PM View." });

  const url = new URL(request.url);
  const path = url.pathname.slice(PM_ROUTE_PREFIX.length).replace(/\/+$/, "") || "/";
  const method = request.method.toUpperCase();

  if (path === "/status" && method === "GET") return json(200, { configured: !!store, store: store?.kind ?? null, message: store ? null : NOT_CONFIGURED });
  if (!store) return json(method === "GET" ? 200 : 503, { configured: false, message: NOT_CONFIGURED, records: [], tasks: [], history: [] });

  const now = new Date().toISOString();
  const body = async (): Promise<Record<string, unknown>> => {
    try {
      return ((await request.json()) ?? {}) as Record<string, unknown>;
    } catch {
      return {};
    }
  };

  try {
    if (path === "/records" && method === "GET") return json(200, { configured: true, store: store.kind, records: await store.listRecords() });

    if (path === "/records/bulk" && method === "POST") {
      const items = (await body()).records;
      if (!Array.isArray(items) || items.length === 0) return json(400, { message: "Send { records: [...] } with at least one record." });
      if (items.length > MAX_BULK) return json(400, { message: `At most ${MAX_BULK} records per request.` });
      const patches = items.map((x) => (x ?? {}) as Record<string, unknown>);
      const ids = [...new Set(patches.map((p) => String(p.instituteId ?? "").trim()).filter(Boolean))];
      const existing = await store.getRecords(ids);
      const saved = new Map<string, PmRecord>();
      const history: PmHistoryEntry[] = [];
      let skipped = 0;
      for (const p of patches) {
        const id = String(p.instituteId ?? "").trim();
        const before = saved.get(id) ?? existing.get(id) ?? null;
        const after = mergeRecord(before, p, actor, now);
        if (!after) {
          skipped++;
          continue;
        }
        const changes = diffRecords(before, after);
        if (changes.length === 0) continue;
        saved.set(id, after);
        history.push({ instituteId: id, at: now, by: actor, changes });
      }
      await store.putRecords([...saved.values()], history);
      return json(200, { saved: saved.size, skipped, records: [...saved.values()] });
    }

    const rec = /^\/records\/([^/]+)$/.exec(path);
    if (rec) {
      const id = decodeURIComponent(rec[1]);
      const before = (await store.getRecords([id])).get(id) ?? null;
      if (method === "PUT") {
        const after = mergeRecord(null, { ...(await body()), instituteId: id }, actor, now);
        if (!after) return json(400, { message: "Invalid record." });
        const changes = diffRecords(before, after);
        if (changes.length) await store.putRecords([after], [{ instituteId: id, at: now, by: actor, changes }]);
        return json(200, { record: changes.length ? after : before ?? after });
      }
      if (method === "DELETE") {
        if (before) await store.deleteRecord(id, { instituteId: id, at: now, by: actor, changes: diffRecords(before, null) });
        return json(200, { deleted: !!before });
      }
    }

    const hist = /^\/records\/([^/]+)\/history$/.exec(path);
    if (hist && method === "GET") return json(200, { history: await store.history(decodeURIComponent(hist[1])) });

    if (path === "/tasks" && method === "GET") return json(200, { tasks: await store.listTasks() });
    const task = /^\/tasks\/([^/]+)$/.exec(path);
    if (task) {
      const key = decodeURIComponent(task[1]).slice(0, 300);
      if (method === "PUT") {
        const b = await body();
        const state = b.state === "SNOOZED" ? "SNOOZED" : "DONE";
        const until = state === "SNOOZED" ? String(b.until ?? "") : "";
        if (state === "SNOOZED" && Number.isNaN(new Date(until).getTime())) return json(400, { message: "Snooze needs a valid 'until' time." });
        const t: PmTaskState = { key, state, until, at: now, by: actor };
        await store.putTask(t);
        return json(200, { task: t });
      }
      if (method === "DELETE") {
        await store.deleteTask(key);
        return json(200, { deleted: true });
      }
    }

    return json(404, { message: "Unknown PM store route." });
  } catch (e) {
    return json(500, { message: e instanceof Error ? e.message : String(e) });
  }
}
