// Structural diff for setting-history values (old → new). Arrays whose items
// all carry a string `id` (sidebar tabs, categories, widgets) are matched by id
// so a reorder or one toggled tab reads as one change, not a cascade.
// Pure: no React, no "@/" imports (run by `node --test tests/`).

export type DiffKind = "added" | "removed" | "changed";

export interface DiffEntry {
  path: string;
  kind: DiffKind;
  before?: unknown;
  after?: unknown;
}

/** Setting values are stored as text; parse JSON when it is JSON. */
export function parseJsonish(v: string | null | undefined): unknown {
  if (v == null) return null;
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const idOf = (v: unknown) => (isObj(v) && typeof v.id === "string" ? v.id : null);

function join(path: string, key: string) {
  return path ? `${path}.${key}` : key;
}

export function jsonDiff(before: unknown, after: unknown, path = "", out: DiffEntry[] = [], limit = 500): DiffEntry[] {
  if (out.length >= limit) return out;
  if (Object.is(before, after)) return out;

  if (isObj(before) && isObj(after)) {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
    for (const k of keys) {
      if (!(k in after)) out.push({ path: join(path, k), kind: "removed", before: before[k] });
      else if (!(k in before)) out.push({ path: join(path, k), kind: "added", after: after[k] });
      else jsonDiff(before[k], after[k], join(path, k), out, limit);
      if (out.length >= limit) break;
    }
    return out;
  }

  if (Array.isArray(before) && Array.isArray(after)) {
    const keyed = [...before, ...after].length > 0 && [...before, ...after].every((x) => idOf(x) !== null);
    if (keyed) {
      const a = new Map(before.map((x) => [idOf(x)!, x]));
      const b = new Map(after.map((x) => [idOf(x)!, x]));
      const ids = [...new Set([...a.keys(), ...b.keys()])];
      for (const id of ids) {
        const p = `${path}[id=${id}]`;
        if (!b.has(id)) out.push({ path: p, kind: "removed", before: a.get(id) });
        else if (!a.has(id)) out.push({ path: p, kind: "added", after: b.get(id) });
        else jsonDiff(a.get(id), b.get(id), p, out, limit);
        if (out.length >= limit) break;
      }
      return out;
    }
    const n = Math.max(before.length, after.length);
    for (let i = 0; i < n; i++) {
      const p = `${path}[${i}]`;
      if (i >= after.length) out.push({ path: p, kind: "removed", before: before[i] });
      else if (i >= before.length) out.push({ path: p, kind: "added", after: after[i] });
      else jsonDiff(before[i], after[i], p, out, limit);
      if (out.length >= limit) break;
    }
    return out;
  }

  if (before === undefined) out.push({ path: path || "(value)", kind: "added", after });
  else if (after === undefined) out.push({ path: path || "(value)", kind: "removed", before });
  else out.push({ path: path || "(value)", kind: "changed", before, after });
  return out;
}

export function previewValue(v: unknown, max = 120): string {
  const s = typeof v === "string" ? JSON.stringify(v) : JSON.stringify(v) ?? String(v);
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
