import { ChevronDown, ChevronRight, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Toggle } from "@/components/shared/Toggle";
import { dateInputToIso, isExpired, isoToDateInput, type EntitlementState } from "@/lib/modules-catalog";
import type { CatalogModule, ResolvedEntitlements } from "@/types/modules";
import { cn } from "@/lib/utils";
import { day } from "./format";

export function ModuleCard({
  module,
  stateOf,
  isChanged,
  resolved,
  expanded,
  onToggleExpand,
  onChange,
}: {
  module: CatalogModule;
  stateOf: (key: string) => EntitlementState;
  isChanged: (key: string) => boolean;
  resolved: ResolvedEntitlements;
  expanded: boolean;
  onToggleExpand: () => void;
  onChange: (key: string, patch: Partial<EntitlementState>) => void;
}) {
  const s = stateOf(module.key);
  const on = module.core || s.enabled;
  const expired = !module.core && s.enabled && isExpired(s.expires_at);
  const resolvedOn = module.core || resolved.modules[module.key] === true;
  const featuresOn = module.features.filter((f) => module.core || (on && stateOf(f.key).enabled)).length;

  return (
    <Card className={cn(!on && "bg-muted/30")}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={onToggleExpand}
            className="mt-0.5 rounded p-0.5 text-muted-foreground hover:bg-accent"
            aria-label={expanded ? "Collapse features" : "Expand features"}
            aria-expanded={expanded}
          >
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{module.label}</span>
              <span className="font-mono text-[11px] text-muted-foreground">{module.key}</span>
              {module.core && (
                <Badge variant="secondary" className="gap-1">
                  <Lock className="h-3 w-3" /> Always on
                </Badge>
              )}
              {module.rail && <Badge variant="outline">{module.rail}</Badge>}
              {isChanged(module.key) && <Badge variant="warning">unsaved</Badge>}
              {expired && <Badge variant="destructive">expired</Badge>}
              {!expired && s.expires_at && on && <Badge variant="outline">until {day(s.expires_at)}</Badge>}
              {!module.core && resolvedOn !== on && !isChanged(module.key) && (
                <Badge variant="outline" title="What MANAGED mode applies right now">
                  resolved: {resolvedOn ? "on" : "off"}
                </Badge>
              )}
            </div>
            {module.description && <p className="mt-0.5 text-sm text-muted-foreground">{module.description}</p>}
            <p className="mt-0.5 text-xs text-muted-foreground">
              {featuresOn}/{module.features.length} features on
            </p>
          </div>
          {!module.core && (
            <Toggle checked={s.enabled} onChange={(v) => onChange(module.key, { enabled: v })} label={`${module.label} module`} />
          )}
        </div>

        {expanded && (
          <div className="mt-4 space-y-3 border-t pt-3 pl-7">
            {!module.core && (
              <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground" htmlFor={`exp-${module.key}`}>
                    Expires (optional)
                  </label>
                  <Input
                    id={`exp-${module.key}`}
                    type="date"
                    className="h-8"
                    value={isoToDateInput(s.expires_at)}
                    onChange={(e) => onChange(module.key, { expires_at: dateInputToIso(e.target.value) })}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground" htmlFor={`note-${module.key}`}>
                    Note
                  </label>
                  <Input
                    id={`note-${module.key}`}
                    className="h-8"
                    value={s.note ?? ""}
                    placeholder="e.g. trial until contract signed"
                    onChange={(e) => onChange(module.key, { note: e.target.value })}
                  />
                </div>
              </div>
            )}

            {module.features.length === 0 && <p className="text-sm text-muted-foreground">No features listed.</p>}
            <ul className="divide-y rounded-md border">
              {module.features.map((f) => {
                const fs = stateOf(f.key);
                const fExpired = fs.enabled && isExpired(fs.expires_at);
                return (
                  <li key={f.key} className={cn("flex flex-wrap items-center gap-3 px-3 py-2", !on && "opacity-50")}>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="font-medium">{f.label}</span>
                        <span className="font-mono text-[11px] text-muted-foreground">{f.key}</span>
                        {isChanged(f.key) && <Badge variant="warning">unsaved</Badge>}
                        {fExpired && <Badge variant="destructive">expired</Badge>}
                        {!f.default_on && <Badge variant="outline">off by default</Badge>}
                      </div>
                      {f.description && <p className="text-xs text-muted-foreground">{f.description}</p>}
                      {(f.governs.nav.length > 0 || f.setting_keys.length > 0) && (
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {f.governs.nav.length > 0 && <>Sidebar: {f.governs.nav.join(", ")}</>}
                          {f.governs.nav.length > 0 && f.setting_keys.length > 0 && " · "}
                          {f.setting_keys.length > 0 && <>Settings: {f.setting_keys.join(", ")}</>}
                        </p>
                      )}
                    </div>
                    {!module.core && (
                      <>
                        <Input
                          type="date"
                          aria-label={`${f.label} expiry`}
                          title="Feature expiry (optional)"
                          className="h-8 w-[150px]"
                          disabled={!on}
                          value={isoToDateInput(fs.expires_at)}
                          onChange={(e) => onChange(f.key, { expires_at: dateInputToIso(e.target.value) })}
                        />
                        <Toggle
                          checked={on && fs.enabled}
                          disabled={!on}
                          onChange={(v) => onChange(f.key, { enabled: v })}
                          label={`${f.label} feature`}
                        />
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
