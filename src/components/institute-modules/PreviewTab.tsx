import { useMemo, useState } from "react";
import { Flag, Info, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Toggle } from "@/components/shared/Toggle";
import { SectionErrorBoundary } from "@/components/shared/SectionErrorBoundary";
import {
  useCapabilityCatalog,
  useDisplaySettings,
  useInstituteModules,
  useInstituteRoles,
} from "@/services/institute-modules-api";
import { buildGovernance, isApiUnavailable, roleColumns } from "@/lib/modules-catalog";
import { REASON_LABELS, resolvePreview, type HiddenReason, type PreviewRow } from "@/lib/nav-preview";
import { cn } from "@/lib/utils";
import { ApiUnavailable, ModuleChip, QueryState } from "./shared";

const REASON_STYLE: Record<HiddenReason, string> = {
  MODULE_OFF: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  FEATURE_OFF: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200",
  ADMIN_ONLY: "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-200",
  HIDDEN_FOR_ROLE: "bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200",
  CATEGORY_HIDDEN: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
};

function ReasonChip({ row }: { row: PreviewRow }) {
  if (!row.reason) return null;
  const all = row.reasons.map((r) => REASON_LABELS[r]).join(", ");
  return (
    <span
      className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide", REASON_STYLE[row.reason])}
      title={`${all}${row.note ? ` — ${row.note}` : ""}${row.features.length ? ` · governed by ${row.features.join(", ")}` : ""}`}
    >
      {row.reason}
    </span>
  );
}

function LockedChip() {
  return (
    <span className="inline-flex items-center gap-0.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 dark:bg-amber-950 dark:text-amber-200">
      <Lock className="h-2.5 w-2.5" /> LOCKED
    </span>
  );
}

/** InstituteDetailPage → "Preview": the rail and sidebar exactly as one role sees them (spec §12.4). */
export function PreviewTab({ instituteId }: { instituteId: string }) {
  const catalogQ = useCapabilityCatalog();
  const rolesQ = useInstituteRoles(instituteId);
  const modulesQ = useInstituteModules(instituteId);
  const columns = useMemo(() => roleColumns(rolesQ.data), [rolesQ.data]);
  const [columnId, setColumnId] = useState("ADMIN");
  const [showHidden, setShowHidden] = useState(true);
  const [applyEntitlements, setApplyEntitlements] = useState(true);

  const column = columns.find((c) => `${c.kind}:${c.id}` === columnId) ?? columns[0];
  const settingsQ = useDisplaySettings(instituteId, column.roleKey);

  const nav = catalogQ.data?.nav ?? null;
  const catalog = catalogQ.data?.catalog ?? null;
  const gov = useMemo(() => buildGovernance(catalog), [catalog]);
  const modulesAvailable = !!modulesQ.data;
  const result = useMemo(() => {
    if (!nav || !settingsQ.data) return null;
    return resolvePreview(
      {
        nav,
        catalog,
        blob: settingsQ.data.data,
        roleKey: column.roleKey,
        resolved: applyEntitlements && modulesQ.data ? modulesQ.data.resolved : null,
      },
      gov
    );
  }, [nav, catalog, gov, settingsQ.data, column.roleKey, applyEntitlements, modulesQ.data]);

  const loading = catalogQ.isLoading || rolesQ.isLoading || settingsQ.isLoading;
  const error = catalogQ.error ?? settingsQ.error;
  if (loading || error) {
    return <QueryState isLoading={loading} error={error} what="the preview" onRetry={() => settingsQ.refetch()} />;
  }
  if (!nav) return <ApiUnavailable what="Nav manifest" />;

  return (
    <SectionErrorBoundary title="Preview">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div className="space-y-1">
            <CardTitle className="text-base">Preview as a role</CardTitle>
            <CardDescription>
              Computed from the nav manifest, this role's stored settings and the institute's modules — the same rules
              the admin app applies. Hover a reason chip for details.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <Select value={`${column.kind}:${column.id}`} onValueChange={setColumnId}>
              <SelectTrigger className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {columns.map((c) => (
                  <SelectItem key={`${c.kind}:${c.id}`} value={`${c.kind}:${c.id}`}>
                    {c.name}
                    {c.kind === "SYSTEM" ? " (uses Teacher settings)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <label className="flex items-center gap-2 text-sm">
              <Toggle checked={showHidden} onChange={setShowHidden} label="Show hidden" /> Show hidden
            </label>
            <label
              className="flex items-center gap-2 text-sm"
              title="On: what MANAGED mode shows (resolved modules). Off: everything entitled, as LEGACY does today."
            >
              <Toggle
                checked={applyEntitlements && modulesAvailable}
                disabled={!modulesAvailable}
                onChange={setApplyEntitlements}
                label="Apply modules"
              />{" "}
              Apply modules
            </label>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-0">
          {modulesQ.data?.mode === "LEGACY" && applyEntitlements && (
            <p className="flex items-start gap-2 rounded-md bg-muted/60 p-3 text-sm text-muted-foreground">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              This institute is LEGACY: today it sees every module. The preview shows what it will see once switched to
              MANAGED — turn off "Apply modules" for today's view.
            </p>
          )}
          {!modulesAvailable && (
            <p className="text-xs text-muted-foreground">
              {modulesQ.error && !isApiUnavailable(modulesQ.error)
                ? "Modules could not be loaded — previewing without them."
                : "Modules API not available yet — previewing without module entitlements."}
            </p>
          )}
          {column.kind === "SYSTEM" && (
            <p className="text-xs text-muted-foreground">
              {column.name} is a built-in staff role: the admin app gives it the Teacher settings.
            </p>
          )}
          {!settingsQ.data?.data && (
            <p className="text-xs text-muted-foreground">This role has no stored settings — role defaults apply.</p>
          )}

          {result && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium uppercase text-muted-foreground">Rail</span>
                {result.categories
                  .filter((c) => showHidden || c.in_rail)
                  .map((c) => (
                    <span
                      key={c.id}
                      title={c.hidden_reason === "EMPTY" ? "Not drawn: no visible tab" : c.hidden_reason ?? undefined}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-sm font-medium",
                        !c.in_rail && "border-dashed text-muted-foreground line-through opacity-60"
                      )}
                    >
                      {c.label}
                      {c.locked && <Lock className="h-3 w-3" />}
                      {c.is_default_landing && <Flag className="h-3 w-3 text-primary" aria-label="default landing" />}
                      {!c.in_rail && (
                        <span className="text-[10px] font-semibold uppercase no-underline">
                          {c.hidden_reason === "EMPTY" ? "empty" : "hidden"}
                        </span>
                      )}
                    </span>
                  ))}
                <span className="ml-auto text-xs text-muted-foreground">
                  {result.visible_tabs} tabs visible · {result.hidden_tabs} hidden
                </span>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {result.categories
                  .filter((c) => showHidden || c.in_rail)
                  .map((c) => {
                    const tabs = c.tabs.filter((t) => showHidden || !t.hidden);
                    return (
                      <div key={c.id} className={cn("rounded-md border", !c.in_rail && "opacity-70")}>
                        <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2 text-sm font-semibold">
                          {c.label}
                          {c.locked && <LockedChip />}
                          {c.hidden_reason && (
                            <Badge variant="outline" className="text-[10px]">
                              {c.hidden_reason === "EMPTY" ? "not drawn: empty" : "CATEGORY_HIDDEN"}
                            </Badge>
                          )}
                        </div>
                        {tabs.length === 0 ? (
                          <p className="px-3 py-4 text-xs text-muted-foreground">Nothing to show.</p>
                        ) : (
                          <ul className="space-y-0.5 p-2">
                            {tabs.map((t) => (
                              <li key={t.id}>
                                <PreviewLine row={t} />
                                {t.sub_tabs.length > 0 && (
                                  <ul className="ml-4 border-l pl-2">
                                    {t.sub_tabs
                                      .filter((s) => showHidden || !s.hidden)
                                      .map((s) => (
                                        <li key={s.id}>
                                          <PreviewLine row={s} small />
                                        </li>
                                      ))}
                                  </ul>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    );
                  })}
              </div>
            </>
          )}

          <p className="border-t pt-3 text-xs text-muted-foreground">
            Not modelled here: gates that depend on live institute or user data — in-app chat enabled, CRM AI
            intelligence availability, lead lookup, My Mentorship (mentors only), My HR (employees only) and the
            assessment-create sub-tabs (create permission). Those rows show as visible here but may be absent in the app.
          </p>
        </CardContent>
      </Card>
    </SectionErrorBoundary>
  );
}

function PreviewLine({ row, small }: { row: PreviewRow; small?: boolean }) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-1.5 rounded px-1.5 py-1",
        small ? "text-xs" : "text-sm font-medium",
        row.hidden && "text-muted-foreground"
      )}
      title={row.route ?? undefined}
    >
      <span className={cn(row.hidden && "line-through opacity-70")}>{row.label}</span>
      {row.custom && <ModuleChip label="custom" muted />}
      {row.locked && <LockedChip />}
      <ReasonChip row={row} />
    </div>
  );
}
