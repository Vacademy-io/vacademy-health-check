import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Info,
  Lock,
  RefreshCw,
  RotateCcw,
  Save,
  Undo2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SearchInput } from "@/components/shared/SearchInput";
import { Toggle } from "@/components/shared/Toggle";
import { ToastStack, useToasts } from "@/components/shared/Toast";
import { SectionErrorBoundary } from "@/components/shared/SectionErrorBoundary";
import {
  useCapabilityCatalog,
  useDisplaySettingsMany,
  useInstituteModules,
  useInstituteRoles,
  useSaveDisplaySettings,
} from "@/services/institute-modules-api";
import {
  buildGovernance,
  conflictCurrentVersion,
  entitlementBlock,
  errorMessage,
  isApiUnavailable,
  isVersionConflict,
  modulesOf,
  roleColumns,
  type Governance,
  type RoleColumn,
} from "@/lib/modules-catalog";
import { mergeRoleNav, type MergedNav } from "@/lib/nav-preview";
import {
  applyRoleEdits,
  catRowKey,
  cellOf,
  editCount,
  emptyEdits,
  nextCellState,
  postLoginRouteOf,
  subRowKey,
  tabRowKey,
  uiToggleOf,
  UI_TOGGLES,
  type CellState,
  type RoleEdits,
  type UiToggleKey,
} from "@/lib/role-nav-edits";
import type {
  CapabilityCatalog,
  NavManifest,
  ResolvedEntitlements,
  RoleDisplaySettings,
} from "@/types/modules";
import { cn } from "@/lib/utils";
import { ApiUnavailable, ModuleChip, QueryState, ReasonDialog } from "./shared";
import { plural } from "./format";

/** InstituteDetailPage → "Roles & navigation": per-role sidebar matrix (spec §7.2). */
export function RolesNavTab({ instituteId }: { instituteId: string }) {
  const catalogQ = useCapabilityCatalog();
  const rolesQ = useInstituteRoles(instituteId);
  const modulesQ = useInstituteModules(instituteId);
  const { toasts, push, dismiss } = useToasts();

  const columns = useMemo(() => roleColumns(rolesQ.data), [rolesQ.data]);
  const roleKeys = useMemo(() => [...new Set(columns.filter((c) => !c.readOnly).map((c) => c.roleKey))], [columns]);
  const settingsQs = useDisplaySettingsMany(instituteId, rolesQ.isLoading ? [] : roleKeys);

  const loading = catalogQ.isLoading || rolesQ.isLoading || settingsQs.some((q) => q.isLoading);
  const blocking = catalogQ.error ?? settingsQs.find((q) => q.error && isApiUnavailable(q.error))?.error ?? null;

  if (loading || blocking) {
    return (
      <QueryState
        isLoading={loading}
        error={blocking}
        what="roles & navigation"
        onRetry={() => {
          catalogQ.refetch();
          settingsQs.forEach((q) => q.refetch());
        }}
      />
    );
  }
  const nav = catalogQ.data?.nav;
  if (!nav) return <ApiUnavailable what="Nav manifest" />;

  const settings: Record<string, { data?: RoleDisplaySettings; error: unknown; refetch: () => void }> = {};
  roleKeys.forEach((k, i) => {
    const q = settingsQs[i];
    settings[k] = { data: q?.data, error: q?.error ?? null, refetch: () => void q?.refetch() };
  });

  return (
    <div className="space-y-4">
      {rolesQ.error != null && (
        <p className="flex items-center gap-2 rounded-md bg-muted/60 p-3 text-sm text-muted-foreground">
          <Info className="h-4 w-4 shrink-0" />
          {isApiUnavailable(rolesQ.error)
            ? "The roles API is not deployed yet — showing Admin and Teacher only."
            : `Could not load custom roles (${errorMessage(rolesQ.error)}) — showing Admin and Teacher only.`}
        </p>
      )}
      <SectionErrorBoundary title="Roles & navigation">
        <RolesMatrix
          key={instituteId}
          instituteId={instituteId}
          nav={nav}
          catalog={catalogQ.data?.catalog ?? null}
          resolved={modulesQ.data?.resolved ?? null}
          columns={columns}
          settings={settings}
          notify={push}
        />
      </SectionErrorBoundary>
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}

interface MatrixRow {
  key: string;
  level: 0 | 1 | 2;
  label: string;
  id: string;
  tabId?: string;
  custom: boolean;
  adminOnly?: boolean;
  features: string[];
  hasChildren?: boolean;
}

function buildRows(nav: NavManifest, mergedByRole: Record<string, MergedNav>, gov: Governance): MatrixRow[] {
  const rows: MatrixRow[] = [];
  const mergedList = Object.values(mergedByRole);
  // Tabs: manifest order, then custom tabs found in any role's blob.
  const customTabs = new Map<string, { label: string; category: string }>();
  const customSubs = new Map<string, Map<string, string>>();
  for (const m of mergedList) {
    for (const t of m.tabs) {
      if (t.custom && !customTabs.has(t.id)) customTabs.set(t.id, { label: t.label, category: t.category });
      for (const s of t.sub_tabs) {
        if (!s.custom) continue;
        const map = customSubs.get(t.id) ?? new Map<string, string>();
        if (!map.has(s.id)) map.set(s.id, s.label);
        customSubs.set(t.id, map);
      }
    }
  }
  const categories = [...nav.categories].sort((a, b) => a.order - b.order);
  for (const c of categories) {
    rows.push({ key: catRowKey(c.id), level: 0, label: c.label, id: c.id, custom: false, features: [] });
    const tabs: Array<{ id: string; label: string; custom: boolean; subs: Array<{ id: string; label: string; custom: boolean; adminOnly: boolean }> }> = [];
    for (const t of [...nav.tabs].filter((x) => x.category === c.id).sort((a, b) => a.order - b.order)) {
      tabs.push({
        id: t.id,
        label: t.label,
        custom: false,
        subs: [
          ...t.sub_tabs.map((s) => ({ id: s.id, label: s.label, custom: false, adminOnly: s.admin_only })),
          ...[...(customSubs.get(t.id) ?? new Map<string, string>()).entries()].map(([id, label]) => ({ id, label, custom: true, adminOnly: false })),
        ],
      });
    }
    for (const [id, t] of customTabs) {
      if (t.category !== c.id) continue;
      tabs.push({
        id,
        label: t.label,
        custom: true,
        subs: [...(customSubs.get(id) ?? new Map<string, string>()).entries()].map(([sid, label]) => ({ id: sid, label, custom: true, adminOnly: false })),
      });
    }
    for (const t of tabs) {
      rows.push({
        key: tabRowKey(t.id),
        level: 1,
        label: t.label,
        id: t.id,
        custom: t.custom,
        features: t.custom ? [] : gov.featuresForTab(t.id),
        hasChildren: t.subs.length > 0,
      });
      for (const s of t.subs) {
        rows.push({
          key: subRowKey(t.id, s.id),
          level: 2,
          label: s.label,
          id: s.id,
          tabId: t.id,
          custom: s.custom,
          adminOnly: s.adminOnly,
          features: s.custom ? [] : gov.featuresForSub(t.id, s.id),
        });
      }
    }
  }
  return rows;
}

const CELL_STYLE: Record<CellState, { icon: typeof Eye; label: string; className: string }> = {
  VISIBLE: { icon: Eye, label: "Visible", className: "text-emerald-700 dark:text-emerald-300" },
  HIDDEN: { icon: EyeOff, label: "Hidden", className: "text-muted-foreground" },
  LOCKED: { icon: Lock, label: "Locked", className: "text-amber-700 dark:text-amber-300" },
};

function RolesMatrix({
  instituteId,
  nav,
  catalog,
  resolved,
  columns,
  settings,
  notify,
}: {
  instituteId: string;
  nav: NavManifest;
  catalog: CapabilityCatalog | null;
  resolved: ResolvedEntitlements | null;
  columns: RoleColumn[];
  settings: Record<string, { data?: RoleDisplaySettings; error: unknown; refetch: () => void }>;
  notify: (tone: "success" | "error" | "info", text: string) => void;
}) {
  const gov = useMemo(() => buildGovernance(catalog), [catalog]);
  const save = useSaveDisplaySettings(instituteId);
  const [edits, setEdits] = useState<Record<string, RoleEdits>>({});
  const [conflicts, setConflicts] = useState<string[]>([]);
  const [conflictVersions, setConflictVersions] = useState<Record<string, string | null>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [panelRole, setPanelRole] = useState<string>("ADMIN");
  const [saving, setSaving] = useState(false);

  const blobOf = (roleKey: string) => settings[roleKey]?.data?.data ?? null;
  const mergedByRole = useMemo(() => {
    const out: Record<string, MergedNav> = {};
    // A role whose settings failed to load gets no column data ("—"), never defaults it could save over.
    for (const k of Object.keys(settings)) {
      if (settings[k].data) out[k] = mergeRoleNav(nav, settings[k].data!.data, k);
    }
    return out;
  }, [nav, settings]);
  const rows = useMemo(() => buildRows(nav, mergedByRole, gov), [nav, mergedByRole, gov]);

  const q = search.trim().toLowerCase();
  const visibleRows = rows.filter((r) => {
    if (q) return r.label.toLowerCase().includes(q) || r.id.toLowerCase().includes(q);
    return r.level < 2 || expanded.has(r.tabId!);
  });

  const editedRoles = Object.keys(edits).filter((k) => editCount(edits[k]) > 0);
  const editable = columns.filter((c) => !c.readOnly);

  const setCell = (roleKey: string, rowKey: string) => {
    const merged = mergedByRole[roleKey];
    const original = merged ? cellOf(merged, rowKey) : null;
    if (!original) return;
    setEdits((all) => {
      const e = all[roleKey] ?? emptyEdits();
      const current = e.cells[rowKey] ?? original.state;
      const next = nextCellState(current);
      const cells = { ...e.cells };
      if (next === original.state) delete cells[rowKey];
      else cells[rowKey] = next;
      return { ...all, [roleKey]: { ...e, cells } };
    });
  };

  const patchRole = (roleKey: string, patch: (e: RoleEdits) => RoleEdits) =>
    setEdits((all) => ({ ...all, [roleKey]: patch(all[roleKey] ?? emptyEdits()) }));

  const saveAll = async (reason: string) => {
    setSaving(true);
    const ok: string[] = [];
    const conflicted: string[] = [];
    const failed: string[] = [];
    for (const roleKey of editedRoles) {
      const stored = settings[roleKey]?.data;
      if (!stored?.version) {
        failed.push(`${nameOf(roleKey)}: settings not loaded — reload the tab`);
        continue;
      }
      try {
        await save.mutateAsync({
          roleKey,
          body: { data: applyRoleEdits(stored.data, edits[roleKey]), expected_version: stored.version, reason },
        });
        ok.push(roleKey);
      } catch (e) {
        if (isVersionConflict(e)) {
          conflicted.push(roleKey);
          noteConflict(roleKey, e);
        } else failed.push(`${nameOf(roleKey)}: ${errorMessage(e)}`);
      }
    }
    setSaving(false);
    setEdits((all) => {
      const next = { ...all };
      for (const k of ok) delete next[k];
      return next;
    });
    setConflicts((c) => [...new Set([...c.filter((k) => !ok.includes(k)), ...conflicted])]);
    if (ok.length > 0) notify("success", `Saved ${plural(ok.length, "role")}: ${ok.map(nameOf).join(", ")}.`);
    if (conflicted.length > 0) notify("error", `${plural(conflicted.length, "role")} changed in the institute since you loaded — see the banner.`);
    for (const f of failed) notify("error", `Save failed — ${f}`);
  };

  function noteConflict(roleKey: string, e: unknown) {
    const v = conflictCurrentVersion(e);
    setConflictVersions((m) => ({ ...m, [roleKey]: v }));
  }

  /** data: null removes the role's stored blob; the admin app falls back to its defaults. */
  const resetRole = async (roleKey: string, reason: string) => {
    const stored = settings[roleKey]?.data;
    if (!stored?.version) throw new Error("Settings not loaded — reload the tab.");
    try {
      await save.mutateAsync({ roleKey, body: { data: null, expected_version: stored.version, reason } });
    } catch (e) {
      if (!isVersionConflict(e)) throw e;
      noteConflict(roleKey, e);
      setConflicts((c) => [...new Set([...c, roleKey])]);
      notify("error", `${nameOf(roleKey)} changed in the institute since you loaded — nothing was reset.`);
      return;
    }
    setEdits((all) => {
      const next = { ...all };
      delete next[roleKey];
      return next;
    });
    notify("success", `${nameOf(roleKey)} reset to the app defaults.`);
  };

  function nameOf(roleKey: string) {
    return columns.find((c) => c.roleKey === roleKey && !c.readOnly)?.name ?? roleKey;
  }

  const panelCol = editable.find((c) => c.roleKey === panelRole) ?? editable[0];

  return (
    <div className="space-y-4">
      {conflicts.map((roleKey) => (
        <div
          key={roleKey}
          className="flex flex-wrap items-center gap-3 rounded-md border border-destructive/40 bg-red-50 p-3 text-sm text-red-900 dark:bg-red-950/40 dark:text-red-100"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="flex-1">
            <strong>{nameOf(roleKey)}</strong>: changed in the institute since you loaded
            {conflictVersions[roleKey] ? ` (now version ${conflictVersions[roleKey]!.slice(0, 8)})` : ""} — nothing was
            saved for this role. Reload to get the institute's latest settings; your edits stay pending on top of them so you can
            review before saving again.
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              settings[roleKey]?.refetch();
              setConflicts((c) => c.filter((k) => k !== roleKey));
            }}
          >
            <RefreshCw className="mr-2 h-4 w-4" /> Reload
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              settings[roleKey]?.refetch();
              setEdits((all) => {
                const next = { ...all };
                delete next[roleKey];
                return next;
              });
              setConflicts((c) => c.filter((k) => k !== roleKey));
            }}
          >
            Reload &amp; discard my edits
          </Button>
        </div>
      ))}

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div className="space-y-1">
            <CardTitle className="text-base">Roles &amp; navigation</CardTitle>
            <CardDescription>
              Click a cell to cycle Visible → Hidden → Locked. Dim cells show the role default (nothing stored). Saves
              write only the changed entries into each role's settings, with conflict detection.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput value={search} onChange={setSearch} placeholder="Find a tab..." />
            <Button size="sm" variant="ghost" onClick={() => setExpanded(new Set(nav.tabs.map((t) => t.id)))}>
              Expand all
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setExpanded(new Set())}>
              Collapse
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {Object.values(settings).some((s) => s.error) && (
            <p className="mb-3 text-sm text-destructive">
              Some roles' settings could not be loaded:{" "}
              {Object.entries(settings)
                .filter(([, s]) => s.error)
                .map(([k, s]) => `${nameOf(k)} (${errorMessage(s.error)})`)
                .join(", ")}
            </p>
          )}
          <div className="grid gap-4 xl:grid-cols-[1fr_300px]">
            <div className="max-h-[70vh] overflow-auto rounded-md border">
              <table className="w-full border-collapse text-sm">
                <thead className="sticky top-0 z-10 bg-background">
                  <tr className="border-b">
                    <th className="sticky left-0 z-20 min-w-[260px] bg-background px-3 py-2 text-left font-medium">Item</th>
                    {columns.map((c) => (
                      <th key={`${c.kind}-${c.id}`} className="min-w-[96px] px-2 py-2 text-center align-bottom font-medium">
                        <button
                          type="button"
                          disabled={c.readOnly}
                          onClick={() => setPanelRole(c.roleKey)}
                          className={cn(
                            "w-full rounded px-1 py-0.5 text-xs",
                            !c.readOnly && "hover:bg-accent",
                            !c.readOnly && panelCol?.roleKey === c.roleKey && "bg-accent"
                          )}
                          title={c.readOnly ? "Uses Teacher settings (the admin app routes this role to them)" : "Show role options"}
                        >
                          <div className="truncate font-semibold">{c.name}</div>
                          <div className="text-[10px] font-normal text-muted-foreground">
                            {c.kind === "SYSTEM" ? "uses Teacher settings" : c.kind.toLowerCase()}
                            {c.userCount != null && ` · ${c.userCount}`}
                          </div>
                          {!c.readOnly && editCount(edits[c.roleKey]) > 0 && (
                            <Badge variant="warning" className="mt-0.5 px-1.5 py-0 text-[10px]">
                              {editCount(edits[c.roleKey])} edits
                            </Badge>
                          )}
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.length === 0 && (
                    <tr>
                      <td colSpan={columns.length + 1} className="py-8 text-center text-muted-foreground">
                        No matching items.
                      </td>
                    </tr>
                  )}
                  {visibleRows.map((row) => {
                    const block = resolved && row.features.length > 0 ? entitlementBlock(row.features, resolved, gov) : null;
                    const mods = modulesOf(row.features, gov);
                    return (
                      <tr key={row.key} className={cn("border-b last:border-0", row.level === 0 && "bg-muted/50")}>
                        <td
                          className={cn(
                            "sticky left-0 z-[5] px-3 py-1.5",
                            row.level === 0 ? "bg-muted font-semibold" : "bg-background",
                            row.level === 1 && "pl-5",
                            row.level === 2 && "pl-11"
                          )}
                        >
                          <div className="flex items-center gap-1.5">
                            {row.level === 1 && row.hasChildren ? (
                              <button
                                type="button"
                                className="rounded p-0.5 text-muted-foreground hover:bg-accent"
                                onClick={() =>
                                  setExpanded((s) => {
                                    const n = new Set(s);
                                    if (n.has(row.id)) n.delete(row.id);
                                    else n.add(row.id);
                                    return n;
                                  })
                                }
                                aria-label="Toggle sub-tabs"
                              >
                                {expanded.has(row.id) || q ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                              </button>
                            ) : row.level === 1 ? (
                              <span className="w-[18px]" />
                            ) : null}
                            <span className={cn(block && "text-muted-foreground")}>
                              {row.level === 0 ? `${row.label} (rail category)` : row.label}
                            </span>
                            {row.custom && <ModuleChip label="custom" muted />}
                            {row.adminOnly && <ModuleChip label="admin only" muted />}
                            {mods.map((m) => (
                              <ModuleChip key={m} label={gov.moduleByKey.get(m)?.label ?? m} title={row.features.join(", ")} />
                            ))}
                          </div>
                        </td>
                        {columns.map((c) => {
                          const merged = mergedByRole[c.roleKey];
                          const original = merged ? cellOf(merged, row.key) : null;
                          if (!original) {
                            return (
                              <td key={`${c.kind}-${c.id}`} className="px-2 py-1.5 text-center text-muted-foreground">
                                —
                              </td>
                            );
                          }
                          const edited = !c.readOnly ? edits[c.roleKey]?.cells[row.key] : undefined;
                          const state = edited ?? (c.readOnly ? edits.TEACHER?.cells[row.key] : undefined) ?? original.state;
                          const style = CELL_STYLE[state];
                          const Icon = style.icon;
                          return (
                            <td key={`${c.kind}-${c.id}`} className="px-2 py-1 text-center">
                              <button
                                type="button"
                                disabled={c.readOnly}
                                onClick={() => setCell(c.roleKey, row.key)}
                                title={`${style.label}${!original.explicit && !edited ? " (role default)" : ""}${
                                  block ? ` — ${block.reason === "MODULE_OFF" ? "module" : "feature"} off for this institute` : ""
                                }`}
                                className={cn(
                                  "inline-flex min-w-[76px] items-center justify-center gap-1 rounded border px-1.5 py-1 text-[11px]",
                                  style.className,
                                  !original.explicit && !edited && "border-dashed opacity-60",
                                  edited && "ring-2 ring-primary",
                                  block && "bg-muted text-muted-foreground opacity-60",
                                  c.readOnly ? "cursor-default" : "hover:bg-accent"
                                )}
                              >
                                <Icon className="h-3.5 w-3.5" />
                                {block ? (block.reason === "MODULE_OFF" ? "Module off" : "Feature off") : style.label}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {panelCol && (
              <RoleSidePanel
                key={panelCol.roleKey}
                column={panelCol}
                blob={blobOf(panelCol.roleKey)}
                version={settings[panelCol.roleKey]?.data?.version ?? null}
                edits={edits[panelCol.roleKey] ?? emptyEdits()}
                onPatch={(p) => patchRole(panelCol.roleKey, p)}
                onReset={(reason) => resetRole(panelCol.roleKey, reason)}
              />
            )}
          </div>
        </CardContent>
      </Card>

      {editedRoles.length > 0 && (
        <div className="sticky bottom-4 z-10 flex flex-wrap items-center gap-3 rounded-lg border bg-background/95 px-4 py-3 shadow-lg backdrop-blur">
          <AlertTriangle className="h-4 w-4 text-yellow-600" />
          <span className="text-sm font-medium">
            Unsaved edits for {editedRoles.map((k) => `${nameOf(k)} (${editCount(edits[k])})`).join(", ")}
          </span>
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setEdits({})}>
              <Undo2 className="mr-2 h-4 w-4" /> Discard all
            </Button>
            <SaveRolesButton
              roles={editedRoles.map(nameOf)}
              saving={saving}
              onSave={saveAll}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function SaveRolesButton({ roles, saving, onSave }: { roles: string[]; saving: boolean; onSave: (reason: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} disabled={saving}>
        <Save className="mr-2 h-4 w-4" /> Save {plural(roles.length, "role")}
      </Button>
      {open && (
        <ReasonDialog
          title="Save role navigation"
          description={`Writes ${roles.join(", ")} through the platform display-settings endpoint. A role the institute changed since you loaded is refused, never overwritten.`}
          confirmLabel="Save"
          onClose={() => setOpen(false)}
          onConfirm={async (reason) => {
            await onSave(reason);
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

function RoleSidePanel({
  column,
  blob,
  version,
  edits,
  onPatch,
  onReset,
}: {
  column: RoleColumn;
  blob: Record<string, unknown> | null;
  version: string | null;
  edits: RoleEdits;
  onPatch: (patch: (e: RoleEdits) => RoleEdits) => void;
  onReset: (reason: string) => Promise<void>;
}) {
  const [resetting, setResetting] = useState(false);
  const route = postLoginRouteOf(blob);
  const routeValue = edits.post_login_route ?? route.value;

  const setUi = (key: UiToggleKey, value: boolean) =>
    onPatch((e) => {
      const ui = { ...e.ui };
      if (uiToggleOf(blob, key, column.roleKey).value === value) delete ui[key];
      else ui[key] = value;
      return { ...e, ui };
    });

  return (
    <div className="space-y-4 rounded-md border p-3 text-sm">
      <div>
        <p className="font-semibold">{column.name}</p>
        <p className="text-xs text-muted-foreground">
          role key <span className="font-mono">{column.roleKey}</span>
          {blob ? (version ? ` · v ${version.slice(0, 8)}` : "") : " · never saved (defaults)"}
        </p>
      </div>
      <div className="space-y-1">
        <label htmlFor="post-login-route" className="text-xs font-medium text-muted-foreground">
          Post-login page {!route.explicit && edits.post_login_route === undefined && "(default)"}
        </label>
        <Input
          id="post-login-route"
          className="h-8 font-mono text-xs"
          value={routeValue}
          onChange={(e) =>
            onPatch((x) => {
              const v = e.target.value;
              const next = { ...x };
              if (v === route.value) delete next.post_login_route;
              else next.post_login_route = v;
              return next;
            })
          }
          placeholder="/dashboard"
        />
      </div>
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">UI</p>
        {UI_TOGGLES.map((t) => {
          const stored = uiToggleOf(blob, t.key, column.roleKey);
          const value = edits.ui[t.key] ?? stored.value;
          const edited = edits.ui[t.key] !== undefined;
          return (
            <div key={t.key} className="flex items-center justify-between gap-2">
              <span className={cn(!stored.explicit && !edited && "text-muted-foreground")}>
                {t.label}
                {edited && <span className="ml-1 text-[10px] text-primary">edited</span>}
                {!stored.explicit && !edited && <span className="ml-1 text-[10px]">default</span>}
              </span>
              <Toggle checked={value} onChange={(v) => setUi(t.key, v)} label={t.label} />
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Dashboard widgets and other options stay in the institute's own Settings for now.
      </p>
      {blob && (
        <Button size="sm" variant="outline" className="w-full" onClick={() => setResetting(true)}>
          <RotateCcw className="mr-2 h-4 w-4" /> Reset role to app defaults
        </Button>
      )}
      {resetting && (
        <ReasonDialog
          title={`Reset ${column.name} to the app defaults?`}
          destructive
          confirmLabel="Reset"
          pendingLabel="Resetting..."
          description="Removes this role's stored display settings (custom tabs, labels, widgets and every other option), so the admin app uses its built-in defaults. Pending edits for this role are dropped. The old value stays in History and can be restored."
          onClose={() => setResetting(false)}
          onConfirm={async (reason) => {
            await onReset(reason);
            setResetting(false);
          }}
        />
      )}
    </div>
  );
}
