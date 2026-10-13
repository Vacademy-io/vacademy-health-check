// Roles & navigation matrix: cell states and the write-side merge into a
// role's stored display-settings blob. Writes touch ONLY `visible`/`locked` of
// the edited ids (plus the side-panel fields) and keep everything else in the
// blob — custom tabs, ordering, labels and keys this portal does not know.
// Pure: no React, no "@/" imports (run by `node --test tests/`).
import type { NavManifest } from "../types/modules";
import { obj } from "./modules-catalog.ts";
import { defaultsKeyFor, type MergedNav } from "./nav-preview.ts";

export type CellState = "VISIBLE" | "HIDDEN" | "LOCKED";

export const CELL_CYCLE: CellState[] = ["VISIBLE", "HIDDEN", "LOCKED"];

export function nextCellState(s: CellState): CellState {
  return CELL_CYCLE[(CELL_CYCLE.indexOf(s) + 1) % CELL_CYCLE.length];
}

export function cellFrom(visible: boolean, locked: boolean): CellState {
  if (!visible) return "HIDDEN";
  return locked ? "LOCKED" : "VISIBLE";
}

export const catRowKey = (id: string) => `cat:${id}`;
export const tabRowKey = (id: string) => `tab:${id}`;
export const subRowKey = (tabId: string, subId: string) => `sub:${tabId}/${subId}`;

export type RowRef =
  | { kind: "cat"; id: string }
  | { kind: "tab"; id: string }
  | { kind: "sub"; tabId: string; id: string };

export function parseRowKey(key: string): RowRef | null {
  if (key.startsWith("cat:")) return { kind: "cat", id: key.slice(4) };
  if (key.startsWith("tab:")) return { kind: "tab", id: key.slice(4) };
  if (key.startsWith("sub:")) {
    const rest = key.slice(4);
    const slash = rest.indexOf("/");
    if (slash <= 0) return null;
    return { kind: "sub", tabId: rest.slice(0, slash), id: rest.slice(slash + 1) };
  }
  return null;
}

/** Current cell of a row for one role, from the merged nav (stored entry or role default). */
export function cellOf(merged: MergedNav, key: string): { state: CellState; explicit: boolean } | null {
  const ref = parseRowKey(key);
  if (!ref) return null;
  if (ref.kind === "cat") {
    const c = merged.categories.find((x) => x.id === ref.id);
    return c ? { state: cellFrom(c.visible, c.locked), explicit: c.explicit } : null;
  }
  if (ref.kind === "tab") {
    const t = merged.tabs.find((x) => x.id === ref.id);
    return t ? { state: cellFrom(t.visible, t.locked), explicit: t.explicit } : null;
  }
  const t = merged.tabs.find((x) => x.id === ref.tabId);
  const s = t?.sub_tabs.find((x) => x.id === ref.id);
  return s ? { state: cellFrom(s.visible, s.locked), explicit: s.explicit } : null;
}

// ── side panel: post-login route + UI toggles ───────────────────────────────

export type UiToggleKey =
  | "showSidebar"
  | "showAiCredits"
  | "showStatus"
  | "showSettings"
  | "showAssistDock"
  | "showSupportButton";

/** Defaults mirror the admin app's admin-defaults.ts / teacher-defaults.ts `ui` block. */
export const UI_TOGGLES: Array<{ key: UiToggleKey; label: string; defaults: { ADMIN: boolean; TEACHER: boolean } }> = [
  { key: "showSidebar", label: "Sidebar", defaults: { ADMIN: true, TEACHER: true } },
  { key: "showAiCredits", label: "AI credits", defaults: { ADMIN: true, TEACHER: false } },
  { key: "showStatus", label: "Status link", defaults: { ADMIN: true, TEACHER: true } },
  { key: "showSettings", label: "Settings gear", defaults: { ADMIN: true, TEACHER: false } },
  { key: "showAssistDock", label: "Assist dock", defaults: { ADMIN: true, TEACHER: false } },
  { key: "showSupportButton", label: "Support button", defaults: { ADMIN: true, TEACHER: true } },
];

export const DEFAULT_POST_LOGIN_ROUTE = "/dashboard";

export function uiToggleOf(
  blob: Record<string, unknown> | null | undefined,
  key: UiToggleKey,
  roleKey: string
): { value: boolean; explicit: boolean } {
  const ui = obj(blob?.ui);
  const v = ui?.[key];
  if (typeof v === "boolean") return { value: v, explicit: true };
  const def = UI_TOGGLES.find((t) => t.key === key)!.defaults[defaultsKeyFor(roleKey)];
  return { value: def, explicit: false };
}

export function postLoginRouteOf(blob: Record<string, unknown> | null | undefined): { value: string; explicit: boolean } {
  const v = blob?.postLoginRedirectRoute;
  return typeof v === "string" && v ? { value: v, explicit: true } : { value: DEFAULT_POST_LOGIN_ROUTE, explicit: false };
}

// ── pending edits per role ──────────────────────────────────────────────────

export interface RoleEdits {
  cells: Record<string, CellState>;
  ui: Partial<Record<UiToggleKey, boolean>>;
  post_login_route?: string;
}

export const emptyEdits = (): RoleEdits => ({ cells: {}, ui: {} });

export function editCount(e: RoleEdits | undefined): number {
  if (!e) return 0;
  return Object.keys(e.cells).length + Object.keys(e.ui).length + (e.post_login_route !== undefined ? 1 : 0);
}

function findOrAdd(list: unknown[], id: string): Record<string, unknown> {
  const hit = list.find((x) => obj(x)?.id === id);
  if (hit) return hit as Record<string, unknown>;
  // A new entry carries the id only: the admin app merges it over the role
  // default ({...default, ...saved}), so order/label/route keep their defaults.
  const fresh: Record<string, unknown> = { id };
  list.push(fresh);
  return fresh;
}

function arrayAt(o: Record<string, unknown>, key: string): unknown[] {
  if (!Array.isArray(o[key])) o[key] = [];
  return o[key] as unknown[];
}

function setCell(entry: Record<string, unknown>, state: CellState) {
  entry.visible = state !== "HIDDEN";
  entry.locked = state === "LOCKED";
}

/**
 * The blob to PUT for one role: a deep copy of the stored blob (or {} when the
 * institute never saved one) with only the edited fields changed.
 */
export function applyRoleEdits(
  blob: Record<string, unknown> | null | undefined,
  edits: RoleEdits
): Record<string, unknown> {
  const out: Record<string, unknown> = blob ? structuredClone(blob) : {};
  for (const [key, state] of Object.entries(edits.cells)) {
    const ref = parseRowKey(key);
    if (!ref) continue;
    if (ref.kind === "cat") {
      setCell(findOrAdd(arrayAt(out, "sidebarCategories"), ref.id), state);
    } else if (ref.kind === "tab") {
      setCell(findOrAdd(arrayAt(out, "sidebar"), ref.id), state);
    } else {
      const tab = findOrAdd(arrayAt(out, "sidebar"), ref.tabId);
      setCell(findOrAdd(arrayAt(tab, "subTabs"), ref.id), state);
    }
  }
  if (Object.keys(edits.ui).length > 0) {
    out.ui = { ...(obj(out.ui) ?? {}), ...edits.ui };
  }
  if (edits.post_login_route !== undefined) {
    out.postLoginRedirectRoute = edits.post_login_route;
  }
  return out;
}

/** Row keys of the matrix, in display order (categories → tabs → sub-tabs). */
export function matrixRowKeys(nav: NavManifest): string[] {
  const keys: string[] = [];
  for (const c of nav.categories) {
    keys.push(catRowKey(c.id));
    for (const t of nav.tabs.filter((x) => x.category === c.id)) {
      keys.push(tabRowKey(t.id));
      for (const s of t.sub_tabs) keys.push(subRowKey(t.id, s.id));
    }
  }
  return keys;
}
