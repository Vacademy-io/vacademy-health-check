import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useApplyModulePreset, useCapabilityCatalog, useModulePresets } from "@/services/institute-modules-api";
import { errorMessage } from "@/lib/modules-catalog";
import type { ApplyPresetResult } from "@/types/modules";
import { ModuleChip, QueryState } from "./shared";
import { plural } from "./format";

/**
 * Apply a module preset to one or many institutes (POST …/module-presets/{key}/apply).
 * Listed modules switch on, every other non-core module off; feature rows and mode
 * are untouched. Partial failures are listed per institute before closing.
 */
export function ApplyPresetDialog({
  instituteIds,
  nameOf,
  onClose,
  onDone,
}: {
  instituteIds: string[];
  /** Display name for an institute id (bulk result list). */
  nameOf?: (id: string) => string;
  onClose: () => void;
  onDone: (result: ApplyPresetResult) => void;
}) {
  const presets = useModulePresets();
  const { data: cat } = useCapabilityCatalog();
  const apply = useApplyModulePreset();
  const [presetKey, setPresetKey] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ApplyPresetResult | null>(null);

  const preset = presets.data?.find((p) => p.key === presetKey) ?? null;
  const modules = cat?.catalog?.modules ?? [];
  const label = (key: string) => modules.find((m) => m.key === key)?.label ?? key;
  const turnedOff = modules.filter((m) => !m.core && preset && !preset.modules.includes(m.key));

  const submit = async () => {
    if (!preset || !reason.trim()) return;
    setError(null);
    try {
      const r = await apply.mutateAsync({ key: preset.key, instituteIds, reason: reason.trim() });
      if (r.failed.length > 0) setResult(r);
      else onDone(r);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const name = (id: string) => nameOf?.(id) ?? id;

  return (
    <Dialog open onOpenChange={(o) => !o && !apply.isPending && (result ? onDone(result) : onClose())}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Apply module preset</DialogTitle>
          <DialogDescription>
            {instituteIds.length === 1 ? "This institute" : plural(instituteIds.length, "institute")}: the preset's
            modules are switched on and every other non-core module off. Feature toggles and the LEGACY/MANAGED mode
            are not changed.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-3 text-sm">
            <p className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" /> Applied to {plural(result.applied.length, "institute")}.
            </p>
            <p className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-4 w-4" /> Failed for {plural(result.failed.length, "institute")}:
            </p>
            <ul className="max-h-60 space-y-1 overflow-y-auto rounded-md border p-2">
              {result.failed.map((f) => (
                <li key={f.institute_id} className="flex justify-between gap-3">
                  <span className="font-medium">{name(f.institute_id)}</span>
                  <span className="text-right text-muted-foreground">{f.error}</span>
                </li>
              ))}
            </ul>
            <DialogFooter>
              <Button onClick={() => onDone(result)}>Close</Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            {presets.isLoading || presets.error ? (
              <QueryState isLoading={presets.isLoading} error={presets.error} what="presets" onRetry={() => presets.refetch()} />
            ) : presets.data && presets.data.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No presets yet. <Link to="/module-presets" className="text-primary underline">Create one</Link>.
              </p>
            ) : (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>Preset</Label>
                  <Select value={presetKey} onValueChange={setPresetKey}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a preset" />
                    </SelectTrigger>
                    <SelectContent>
                      {presets.data?.map((p) => (
                        <SelectItem key={p.key} value={p.key}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {preset && (
                  <div className="space-y-2 rounded-md border p-3 text-sm">
                    {preset.description && <p className="text-muted-foreground">{preset.description}</p>}
                    <div className="flex flex-wrap gap-1">
                      <span className="mr-1 text-xs text-muted-foreground">On:</span>
                      {preset.modules.length === 0 && <span className="text-xs text-muted-foreground">core only</span>}
                      {preset.modules.map((k) => (
                        <ModuleChip key={k} label={label(k)} />
                      ))}
                    </div>
                    {turnedOff.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        <span className="mr-1 text-xs text-muted-foreground">Off:</span>
                        {turnedOff.map((m) => (
                          <ModuleChip key={m.key} label={m.label} muted />
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="preset-reason">Reason (required)</Label>
                  <Textarea
                    id="preset-reason"
                    rows={2}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="e.g. Signed CRM suite, onboarding call 13 Oct"
                  />
                </div>
              </div>
            )}
            {error && (
              <p className="flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" /> {error}
              </p>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={onClose} disabled={apply.isPending}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={!preset || !reason.trim() || apply.isPending}>
                {apply.isPending ? "Applying..." : `Apply to ${plural(instituteIds.length, "institute")}`}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
