import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Download, History, Info, Layers, ListChecks, Package, Save, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatCard } from "@/components/shared/StatCard";
import { ToastStack, useToasts } from "@/components/shared/Toast";
import { SectionErrorBoundary } from "@/components/shared/SectionErrorBoundary";
import {
  useCapabilityCatalog,
  useDisplaySettings,
  useInstituteModules,
  useUpdateInstituteModules,
} from "@/services/institute-modules-api";
import {
  buildGovernance,
  diffChanges,
  resolvedCounts,
  storedState,
  type EntitlementState,
} from "@/lib/modules-catalog";
import { importModulesFromSettings } from "@/lib/nav-preview";
import type { CapabilityCatalog, InstituteModules, NavManifest } from "@/types/modules";
import { ModuleCard } from "./ModuleCard";
import { ModuleHistoryDrawer } from "./ModuleHistory";
import { ApplyPresetDialog } from "./ApplyPresetDialog";
import { ApiUnavailable, ModeBadge, QueryState, ReasonDialog } from "./shared";
import { day, plural, when } from "./format";

/** InstituteDetailPage → "Modules": entitlements per module/feature (spec §7.1). */
export function ModulesTab({ instituteId }: { instituteId: string }) {
  const catalogQ = useCapabilityCatalog();
  const modulesQ = useInstituteModules(instituteId);
  const { toasts, push, dismiss } = useToasts();

  const loading = catalogQ.isLoading || modulesQ.isLoading;
  const error = catalogQ.error ?? modulesQ.error;

  return (
    <div className="space-y-4">
      {loading || error ? (
        <QueryState
          isLoading={loading}
          error={error}
          what="modules"
          onRetry={() => {
            catalogQ.refetch();
            modulesQ.refetch();
          }}
        />
      ) : !catalogQ.data?.catalog ? (
        <ApiUnavailable what="Capability catalogue" />
      ) : modulesQ.data ? (
        <SectionErrorBoundary title="Modules">
          <ModulesEditor
            key={instituteId}
            instituteId={instituteId}
            catalog={catalogQ.data.catalog}
            nav={catalogQ.data.nav}
            data={modulesQ.data}
            notify={(tone, text) => push(tone, text)}
          />
        </SectionErrorBoundary>
      ) : (
        <Skeleton className="h-40 w-full" />
      )}
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}

function ModulesEditor({
  instituteId,
  catalog,
  nav,
  data,
  notify,
}: {
  instituteId: string;
  catalog: CapabilityCatalog;
  nav: NavManifest | null;
  data: InstituteModules;
  notify: (tone: "success" | "error" | "info", text: string) => void;
}) {
  const gov = useMemo(() => buildGovernance(catalog), [catalog]);
  const update = useUpdateInstituteModules(instituteId);
  const [draft, setDraft] = useState<Record<string, EntitlementState>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<null | "save" | "mode" | "preset" | "import">(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const stateOf = (key: string) => draft[key] ?? storedState(key, data.entitlements, gov);
  const changes = diffChanges(draft, data.entitlements, gov);
  const changedKeys = new Set(changes.map((c) => c.key));
  const counts = resolvedCounts(data.resolved, catalog);
  const dirty = changes.length > 0;

  const change = (key: string, patch: Partial<EntitlementState>) =>
    setDraft((d) => ({ ...d, [key]: { ...(d[key] ?? storedState(key, data.entitlements, gov)), ...patch } }));

  const labelOf = (key: string) => {
    const m = gov.moduleByKey.get(key);
    if (m) return m.label;
    const f = gov.featureByKey.get(key);
    return f ? `${gov.moduleByKey.get(gov.moduleOfFeature.get(key) ?? "")?.label ?? ""} › ${f.label}` : key;
  };

  const nextMode = data.mode === "LEGACY" ? "MANAGED" : "LEGACY";
  const resolvedOnModules = catalog.modules.filter((m) => m.core || data.resolved.modules[m.key]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              Modules <ModeBadge mode={data.mode} />
            </CardTitle>
            <CardDescription>
              What this institute has. A module or feature that is off is hidden in the admin app once the institute
              is MANAGED. Catalogue v{catalog.version}
              {data.mode_updated_at && ` · mode set ${when(data.mode_updated_at)} by ${data.mode_updated_by ?? "unknown"}`}
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setDialog("preset")} disabled={dirty}>
              <Package className="mr-2 h-4 w-4" /> Apply preset
            </Button>
            <Button size="sm" variant="outline" onClick={() => setDialog("import")} disabled={!nav}>
              <Download className="mr-2 h-4 w-4" /> Import from current settings
            </Button>
            <Button size="sm" variant="outline" asChild>
              <Link to="/module-presets">
                <ListChecks className="mr-2 h-4 w-4" /> Presets
              </Link>
            </Button>
            <Button size="sm" variant="outline" onClick={() => setHistoryOpen(true)}>
              <History className="mr-2 h-4 w-4" /> History
            </Button>
            <Button
              size="sm"
              variant={nextMode === "MANAGED" ? "default" : "destructive"}
              onClick={() => setDialog("mode")}
              disabled={dirty}
              title={dirty ? "Save or discard module changes first" : undefined}
            >
              Switch to {nextMode}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          {data.mode === "LEGACY" && (
            <p className="flex items-start gap-2 rounded-md bg-muted/60 p-3 text-sm text-muted-foreground">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              LEGACY: the admin app shows every module today. Configure and preview here, then switch to MANAGED to
              apply. Switching back to LEGACY is the instant rollback.
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <StatCard
              title="Modules on (resolved)"
              value={`${counts.modulesOn} / ${counts.modulesTotal}`}
              description="What MANAGED mode applies, incl. core"
              icon={Layers}
            />
            <StatCard
              title="Features on (resolved)"
              value={`${counts.featuresOn} / ${counts.featuresTotal}`}
              description="Expired rows count as off"
              icon={ListChecks}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{plural(catalog.modules.length, "module")} in the catalogue</p>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => setExpanded(new Set(catalog.modules.map((m) => m.key)))}>
            Expand all
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setExpanded(new Set())}>
            Collapse all
          </Button>
        </div>
      </div>

      {catalog.modules.length === 0 ? (
        <p className="rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">
          The catalogue lists no modules.
        </p>
      ) : (
        <div className="space-y-3">
          {catalog.modules.map((m) => (
            <ModuleCard
              key={m.key}
              module={m}
              stateOf={stateOf}
              isChanged={(k) => changedKeys.has(k)}
              resolved={data.resolved}
              expanded={expanded.has(m.key)}
              onToggleExpand={() =>
                setExpanded((s) => {
                  const next = new Set(s);
                  if (next.has(m.key)) next.delete(m.key);
                  else next.add(m.key);
                  return next;
                })
              }
              onChange={change}
            />
          ))}
        </div>
      )}

      {dirty && (
        <div className="sticky bottom-4 z-10 flex flex-wrap items-center gap-3 rounded-lg border bg-background/95 px-4 py-3 shadow-lg backdrop-blur">
          <AlertTriangle className="h-4 w-4 text-yellow-600" />
          <span className="text-sm font-medium">{plural(changes.length, "unsaved change")}</span>
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setDraft({})}>
              <Undo2 className="mr-2 h-4 w-4" /> Discard
            </Button>
            <Button size="sm" onClick={() => setDialog("save")}>
              <Save className="mr-2 h-4 w-4" /> Review &amp; save
            </Button>
          </div>
        </div>
      )}

      {dialog === "save" && (
        <ReasonDialog
          title="Save module changes"
          description={`${plural(changes.length, "change")} for this institute, saved together.`}
          confirmLabel="Save changes"
          onClose={() => setDialog(null)}
          onConfirm={async (reason) => {
            await update.mutateAsync({ changes, reason });
            setDraft({});
            setDialog(null);
            notify("success", `Saved ${plural(changes.length, "module change")}.`);
          }}
        >
          <ul className="max-h-60 space-y-1 overflow-y-auto rounded-md border p-2 text-sm">
            {changes.map((c) => (
              <li key={c.key} className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{labelOf(c.key)}</span>
                <Badge variant={c.enabled ? "success" : "secondary"}>{c.enabled ? "on" : "off"}</Badge>
                {c.expires_at && <span className="text-xs text-muted-foreground">until {day(c.expires_at)}</span>}
                {c.note && <span className="text-xs text-muted-foreground">“{c.note}”</span>}
              </li>
            ))}
          </ul>
        </ReasonDialog>
      )}

      {dialog === "mode" && (
        <ReasonDialog
          title={`Switch to ${nextMode}?`}
          destructive={nextMode === "LEGACY"}
          confirmLabel={`Switch to ${nextMode}`}
          description={
            nextMode === "MANAGED"
              ? "The admin app will start hiding every module and feature that is off for this institute, for every role. Preview each role first."
              : "Every module becomes available again in the admin app (today's behaviour). Module rows are kept, so switching back to MANAGED restores them."
          }
          onClose={() => setDialog(null)}
          onConfirm={async (reason) => {
            await update.mutateAsync({ mode: nextMode, changes: [], reason });
            setDialog(null);
            notify("success", `Institute is now ${nextMode}.`);
          }}
        >
          {nextMode === "MANAGED" && (
            <div className="space-y-1 text-sm">
              <p className="text-muted-foreground">Modules that will be on:</p>
              <div className="flex flex-wrap gap-1">
                {resolvedOnModules.map((m) => (
                  <Badge key={m.key} variant="outline">
                    {m.label}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </ReasonDialog>
      )}

      {dialog === "preset" && (
        <ApplyPresetDialog
          instituteIds={[instituteId]}
          onClose={() => setDialog(null)}
          onDone={(r) => {
            setDialog(null);
            if (r.failed.length === 0) notify("success", "Preset applied.");
            else notify("error", `Preset failed: ${r.failed[0].error}`);
          }}
        />
      )}

      {dialog === "import" && nav && (
        <ImportFromSettingsDialog
          instituteId={instituteId}
          catalog={catalog}
          nav={nav}
          onClose={() => setDialog(null)}
          onApply={(next) => {
            setDraft((d) => ({ ...d, ...next }));
            setDialog(null);
            notify("info", "Toggles pre-filled from the Admin role's settings — review, then save.");
          }}
          stateOf={stateOf}
        />
      )}

      <ModuleHistoryDrawer instituteId={instituteId} open={historyOpen} onOpenChange={setHistoryOpen} />
    </div>
  );
}

/** Proposes module/feature toggles from the ADMIN role's stored display settings. */
function ImportFromSettingsDialog({
  instituteId,
  catalog,
  nav,
  stateOf,
  onClose,
  onApply,
}: {
  instituteId: string;
  catalog: CapabilityCatalog;
  nav: NavManifest;
  stateOf: (key: string) => EntitlementState;
  onClose: () => void;
  onApply: (draft: Record<string, EntitlementState>) => void;
}) {
  const settings = useDisplaySettings(instituteId, "ADMIN");
  const proposal = useMemo(
    () => (settings.data ? importModulesFromSettings(catalog, nav, settings.data.data) : null),
    [settings.data, catalog, nav]
  );

  const apply = () => {
    if (!proposal) return;
    const next: Record<string, EntitlementState> = {};
    for (const [key, enabled] of [...Object.entries(proposal.modules), ...Object.entries(proposal.features)]) {
      if (stateOf(key).enabled !== enabled) next[key] = { ...stateOf(key), enabled };
    }
    onApply(next);
  };

  const modules = catalog.modules.filter((m) => !m.core);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import from current settings</DialogTitle>
          <DialogDescription>
            From the Admin role's display settings: a module is on when any sidebar item it governs is visible and its
            rail category is visible. Nothing is saved until you review the toggles and save with a reason.
          </DialogDescription>
        </DialogHeader>
        {settings.isLoading || settings.error ? (
          <QueryState isLoading={settings.isLoading} error={settings.error} what="Admin display settings" />
        ) : (
          proposal && (
            <div className="space-y-3 text-sm">
              {!settings.data?.data && (
                <p className="rounded-md bg-muted/60 p-2 text-muted-foreground">
                  This institute never saved Admin display settings — the Admin defaults were used.
                </p>
              )}
              <ul className="divide-y rounded-md border">
                {modules.map((m) => {
                  const proposed = proposal.modules[m.key];
                  const current = stateOf(m.key).enabled;
                  return (
                    <li key={m.key} className="flex flex-wrap items-start gap-2 px-3 py-2">
                      <span className="w-40 font-medium">{m.label}</span>
                      {proposed === undefined ? (
                        <span className="text-muted-foreground">no sidebar item — left as is</span>
                      ) : (
                        <>
                          <Badge variant={proposed ? "success" : "secondary"}>{proposed ? "on" : "off"}</Badge>
                          {proposed !== current && <Badge variant="warning">changes</Badge>}
                          <span className="min-w-0 flex-1 text-xs text-muted-foreground">
                            {proposal.evidence[m.key]?.length
                              ? `visible: ${proposal.evidence[m.key].slice(0, 4).join(", ")}${proposal.evidence[m.key].length > 4 ? "…" : ""}`
                              : "nothing it governs is visible"}
                          </span>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={apply} disabled={!proposal}>
            Pre-fill toggles
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
