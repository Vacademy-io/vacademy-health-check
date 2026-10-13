import { useState } from "react";
import { AlertCircle, Lock, Pencil, Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { ToastStack, useToasts } from "@/components/shared/Toast";
import { SectionErrorBoundary } from "@/components/shared/SectionErrorBoundary";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  useCapabilityCatalog,
  useDeleteModulePreset,
  useModulePresets,
  useSaveModulePreset,
} from "@/services/institute-modules-api";
import { errorMessage, isValidPresetKey } from "@/lib/modules-catalog";
import type { CatalogModule, ModulePreset } from "@/types/modules";
import { ModuleChip, QueryState } from "@/components/institute-modules/shared";
import { when } from "@/components/institute-modules/format";
import { cn } from "@/lib/utils";

/** Module presets: named sets of modules applied to institutes in one step (spec §12.3). */
export default function ModulePresetsPage() {
  const presets = useModulePresets();
  const catalogQ = useCapabilityCatalog();
  const [editing, setEditing] = useState<ModulePreset | "new" | null>(null);
  const [deleting, setDeleting] = useState<ModulePreset | null>(null);
  const { toasts, push, dismiss } = useToasts();
  const modules = catalogQ.data?.catalog?.modules ?? [];
  const label = (k: string) => modules.find((m) => m.key === k)?.label ?? k;

  const columns: Column<ModulePreset & Record<string, unknown>>[] = [
    {
      key: "name",
      header: "Preset",
      render: (r) => (
        <div>
          <div className="font-medium">{r.name}</div>
          <div className="font-mono text-[11px] text-muted-foreground">{r.key}</div>
        </div>
      ),
    },
    { key: "description", header: "Description", render: (r) => <span className="text-sm text-muted-foreground">{r.description ?? "—"}</span> },
    {
      key: "modules",
      header: "Modules on",
      render: (r) => (
        <div className="flex max-w-[360px] flex-wrap gap-1">
          {r.modules.length === 0 && <span className="text-xs text-muted-foreground">core only</span>}
          {r.modules.map((k) => (
            <ModuleChip key={k} label={label(k)} />
          ))}
        </div>
      ),
    },
    {
      key: "updated_at",
      header: "Updated",
      render: (r) => (
        <span className="text-xs text-muted-foreground">
          {when(r.updated_at)}
          {r.updated_by ? ` · ${r.updated_by}` : ""}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      className: "text-right",
      render: (r) => (
        <div className="flex justify-end gap-1">
          <Button size="sm" variant="ghost" onClick={() => setEditing(r)} title="Edit">
            <Pencil className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setDeleting(r)} title="Delete">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  const loading = presets.isLoading || catalogQ.isLoading;
  const error = presets.error ?? catalogQ.error;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Module presets"
        description="Named module sets. Applying one switches its modules on and every other non-core module off; features and mode are untouched."
        actions={
          <Button onClick={() => setEditing("new")} disabled={!!error || loading}>
            <Plus className="mr-2 h-4 w-4" /> New preset
          </Button>
        }
      />
      <SectionErrorBoundary title="Module presets">
        {loading || error ? (
          <QueryState isLoading={loading} error={error} what="presets" onRetry={() => presets.refetch()} />
        ) : (
          <DataTable
            data={(presets.data ?? []) as (ModulePreset & Record<string, unknown>)[]}
            columns={columns}
            page={0}
            totalPages={1}
            onPageChange={() => {}}
          />
        )}
      </SectionErrorBoundary>

      {editing && (
        <PresetDialog
          key={editing === "new" ? "new" : editing.key}
          preset={editing === "new" ? null : editing}
          existingKeys={(presets.data ?? []).map((p) => p.key)}
          modules={modules}
          onClose={() => setEditing(null)}
          onSaved={(name) => {
            setEditing(null);
            push("success", `Saved preset “${name}”.`);
          }}
        />
      )}
      {deleting && (
        <DeletePresetDialog
          preset={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            push("success", `Deleted preset “${deleting.name}”.`);
            setDeleting(null);
          }}
        />
      )}
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}

function PresetDialog({
  preset,
  existingKeys,
  modules,
  onClose,
  onSaved,
}: {
  preset: ModulePreset | null;
  existingKeys: string[];
  modules: CatalogModule[];
  onClose: () => void;
  onSaved: (name: string) => void;
}) {
  const save = useSaveModulePreset();
  const [key, setKey] = useState(preset?.key ?? "");
  const [name, setName] = useState(preset?.name ?? "");
  const [description, setDescription] = useState(preset?.description ?? "");
  const [selected, setSelected] = useState<Set<string>>(new Set(preset?.modules ?? []));
  const [error, setError] = useState<string | null>(null);

  const isNew = preset === null;
  const keyError = !isNew
    ? null
    : key && !isValidPresetKey(key)
      ? "Lowercase letters, digits and _ (start with a letter)"
      : existingKeys.includes(key)
        ? "A preset with this key exists"
        : null;
  const unknown = [...selected].filter((k) => !modules.some((m) => m.key === k));
  const canSave = !!key && !keyError && !!name.trim() && !save.isPending;

  const submit = async () => {
    setError(null);
    try {
      await save.mutateAsync({
        key,
        body: { name: name.trim(), description: description.trim(), modules: [...selected].filter((k) => !unknown.includes(k)) },
      });
      onSaved(name.trim());
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !save.isPending && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isNew ? "New preset" : `Edit “${preset.name}”`}</DialogTitle>
          <DialogDescription>
            Pick the modules this preset switches on. Core modules are always on and not listed.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="preset-key">Key</Label>
            <Input
              id="preset-key"
              className="font-mono"
              value={key}
              disabled={!isNew}
              onChange={(e) => setKey(e.target.value.trim())}
              placeholder="crm_suite"
            />
            {keyError && <p className="text-xs text-destructive">{keyError}</p>}
            {!isNew && <p className="text-xs text-muted-foreground">Keys are permanent.</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="preset-name">Name</Label>
            <Input id="preset-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="CRM suite" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="preset-desc">Description</Label>
            <Textarea id="preset-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Modules</Label>
            <ul className="divide-y rounded-md border">
              {modules.map((m) => (
                <li key={m.key}>
                  <label className={cn("flex items-center gap-3 px-3 py-2 text-sm", m.core ? "cursor-default opacity-60" : "cursor-pointer")}>
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={m.core || selected.has(m.key)}
                      disabled={m.core}
                      onChange={(e) =>
                        setSelected((s) => {
                          const n = new Set(s);
                          if (e.target.checked) n.add(m.key);
                          else n.delete(m.key);
                          return n;
                        })
                      }
                    />
                    <span className="font-medium">{m.label}</span>
                    <span className="font-mono text-[11px] text-muted-foreground">{m.key}</span>
                    {m.core && <Lock className="ml-auto h-3.5 w-3.5" />}
                  </label>
                </li>
              ))}
            </ul>
            {unknown.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Not in the catalogue any more (dropped on save): {unknown.join(", ")}
              </p>
            )}
          </div>
        </div>
        {error && (
          <p className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" /> {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!canSave}>
            {save.isPending ? "Saving..." : "Save preset"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeletePresetDialog({ preset, onClose, onDeleted }: { preset: ModulePreset; onClose: () => void; onDeleted: () => void }) {
  const del = useDeleteModulePreset();
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog open onOpenChange={(o) => !o && !del.isPending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete “{preset.name}”?</DialogTitle>
          <DialogDescription>
            Institutes it was applied to keep their modules; only the preset goes away.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <p className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" /> {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={del.isPending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={del.isPending}
            onClick={async () => {
              setError(null);
              try {
                await del.mutateAsync(preset.key);
                onDeleted();
              } catch (e) {
                setError(errorMessage(e));
              }
            }}
          >
            {del.isPending ? "Deleting..." : "Delete preset"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
