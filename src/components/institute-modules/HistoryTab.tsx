import { useMemo, useState } from "react";
import { Eye, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { ToastStack, useToasts } from "@/components/shared/Toast";
import { SectionErrorBoundary } from "@/components/shared/SectionErrorBoundary";
import { ActorName } from "@/components/shared/ActorName";
import { useDebounced } from "@/hooks/use-debounced";
import {
  useCapabilityCatalog,
  useRestoreSetting,
  useSettingsHistory,
  useSettingsHistoryEntry,
} from "@/services/institute-modules-api";
import { jsonDiff, parseJsonish, previewValue, type DiffEntry } from "@/lib/json-diff";
import type { SettingHistoryEntry } from "@/types/modules";
import { cn } from "@/lib/utils";
import { ModuleHistoryList } from "./ModuleHistory";
import { Drawer, QueryState, ReasonDialog } from "./shared";
import { when } from "./format";

const ROLE_KEYS = ["ADMIN_DISPLAY_SETTINGS", "TEACHER_DISPLAY_SETTINGS", "ROLE_DISPLAY_SETTINGS"];

/** InstituteDetailPage → "History": setting changes (tenant + platform) with restore, and module changes. */
export function HistoryTab({ instituteId }: { instituteId: string }) {
  const { toasts, push, dismiss } = useToasts();
  return (
    <div className="space-y-6">
      <SectionErrorBoundary title="Settings history">
        <SettingsHistorySection instituteId={instituteId} notify={(t) => push("success", t)} />
      </SectionErrorBoundary>
      <SectionErrorBoundary title="Module history">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Module changes</CardTitle>
            <CardDescription>Entitlement and mode changes made from this portal.</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <ModuleHistoryList instituteId={instituteId} />
          </CardContent>
        </Card>
      </SectionErrorBoundary>
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}

function SourceBadge({ source }: { source: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "border-transparent",
        source === "PLATFORM"
          ? "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200"
          : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
      )}
      title={source === "PLATFORM" ? "Changed from this portal" : "Changed by the institute"}
    >
      {source}
    </Badge>
  );
}

function SettingsHistorySection({ instituteId, notify }: { instituteId: string; notify: (text: string) => void }) {
  const [page, setPage] = useState(0);
  const [keyFilter, setKeyFilter] = useState("");
  const debouncedKey = useDebounced(keyFilter.trim(), 300);
  const [openId, setOpenId] = useState<string | null>(null);
  const { data, isLoading, error, refetch } = useSettingsHistory(instituteId, debouncedKey, page);
  const { data: cat } = useCapabilityCatalog();

  const knownKeys = useMemo(() => {
    const keys = new Set(ROLE_KEYS);
    for (const m of cat?.catalog?.modules ?? []) for (const f of m.features) f.setting_keys.forEach((k) => keys.add(k));
    return [...keys];
  }, [cat]);

  const columns: Column<SettingHistoryEntry & Record<string, unknown>>[] = [
    { key: "created_at", header: "When", render: (r) => when(r.created_at) },
    { key: "setting_key", header: "Setting", render: (r) => <span className="font-mono text-xs">{r.setting_key}</span> },
    { key: "source", header: "Source", render: (r) => <SourceBadge source={r.source} /> },
    { key: "actor_user_id", header: "By", render: (r) => <ActorName id={r.actor_user_id} empty="—" className="text-xs" /> },
    {
      key: "reason",
      header: "Reason",
      render: (r) => <span className="line-clamp-2 max-w-[260px] text-xs text-muted-foreground">{r.reason ?? "—"}</span>,
    },
    {
      key: "view",
      header: "",
      className: "text-right",
      render: (r) => (
        <Button size="sm" variant="ghost" onClick={() => setOpenId(r.id)}>
          <Eye className="mr-1 h-4 w-4" /> Diff
        </Button>
      ),
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Setting changes</CardTitle>
        <CardDescription>
          Every write of an institute setting — by the institute (TENANT) or from this portal (PLATFORM). Open a change
          to see old → new and restore the old value.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading || error ? (
          <QueryState isLoading={isLoading} error={error} what="settings history" onRetry={() => refetch()} />
        ) : (
          <DataTable
            data={(data?.content ?? []) as (SettingHistoryEntry & Record<string, unknown>)[]}
            columns={columns}
            page={page}
            totalPages={data?.total_pages ?? 0}
            totalItems={data?.total_elements}
            onPageChange={setPage}
            onRowClick={(r) => setOpenId(r.id)}
            toolbar={
              <>
                <Input
                  list="setting-history-keys"
                  className="w-72"
                  value={keyFilter}
                  onChange={(e) => {
                    setKeyFilter(e.target.value);
                    setPage(0);
                  }}
                  placeholder="Filter by setting key (all)"
                />
                <datalist id="setting-history-keys">
                  {knownKeys.map((k) => (
                    <option key={k} value={k} />
                  ))}
                </datalist>
              </>
            }
          />
        )}
      </CardContent>
      <SettingChangeDrawer
        instituteId={instituteId}
        historyId={openId}
        onClose={() => setOpenId(null)}
        onRestored={(text) => {
          setOpenId(null);
          notify(text);
        }}
      />
    </Card>
  );
}

function SettingChangeDrawer({
  instituteId,
  historyId,
  onClose,
  onRestored,
}: {
  instituteId: string;
  historyId: string | null;
  onClose: () => void;
  onRestored: (text: string) => void;
}) {
  const { data, isLoading, error } = useSettingsHistoryEntry(instituteId, historyId);
  const restore = useRestoreSetting(instituteId);
  const [raw, setRaw] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const diff = useMemo(
    () => (data ? jsonDiff(parseJsonish(data.old_value), parseJsonish(data.new_value)) : []),
    [data]
  );

  return (
    <Drawer
      open={historyId !== null}
      onOpenChange={(o) => !o && onClose()}
      wide
      title="Setting change"
      description={
        data ? (
          <>
            {data.setting_key} · {when(data.created_at)} · by <ActorName id={data.actor_user_id} />
          </>
        ) : undefined
      }
    >
      {isLoading && <Skeleton className="h-40 w-full" />}
      {error != null && <QueryState isLoading={false} error={error} what="this change" />}
      {data && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <SourceBadge source={data.source} />
            <span className="text-sm text-muted-foreground">{diff.length} difference{diff.length === 1 ? "" : "s"}</span>
            <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setRaw((v) => !v)}>
              {raw ? "Show diff" : "Show raw JSON"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setConfirming(true)}>
              <RotateCcw className="mr-2 h-4 w-4" /> Restore old value
            </Button>
          </div>
          {data.reason && <p className="text-sm text-muted-foreground">“{data.reason}”</p>}
          {data.old_value == null && (
            <p className="text-xs text-muted-foreground">
              This change created the setting: restoring removes it again (the app falls back to its defaults).
            </p>
          )}
          {raw ? (
            <div className="grid gap-3 md:grid-cols-2">
              <RawBlock title="Old" value={data.old_value} />
              <RawBlock title="New" value={data.new_value} />
            </div>
          ) : diff.length === 0 ? (
            <p className="text-sm text-muted-foreground">No differences.</p>
          ) : (
            <DiffList entries={diff} />
          )}
        </div>
      )}
      {confirming && data && (
        <ReasonDialog
          title="Restore the old value?"
          destructive
          confirmLabel="Restore"
          pendingLabel="Restoring..."
          description={
            data.old_value == null
              ? `${data.setting_key} did not exist before this change: restoring removes it, replacing whatever it holds now. Recorded as a PLATFORM change.`
              : `Writes the value ${data.setting_key} had before this change back to the institute, replacing whatever it holds now. Recorded as a PLATFORM change.`
          }
          onClose={() => setConfirming(false)}
          onConfirm={async (reason) => {
            const r = await restore.mutateAsync({ historyId: data.id, reason });
            setConfirming(false);
            onRestored(
              r.changed
                ? `Restored ${data.setting_key}.`
                : `${data.setting_key} already had that value — nothing changed.`
            );
          }}
        />
      )}
    </Drawer>
  );
}

const KIND_STYLE: Record<DiffEntry["kind"], string> = {
  added: "text-emerald-700 dark:text-emerald-300",
  removed: "text-red-700 dark:text-red-300",
  changed: "text-amber-700 dark:text-amber-300",
};

function DiffList({ entries }: { entries: DiffEntry[] }) {
  return (
    <ul className="divide-y rounded-md border font-mono text-xs">
      {entries.map((e) => (
        <li key={`${e.kind}-${e.path}`} className="space-y-0.5 px-3 py-2">
          <div className="flex items-center gap-2">
            <span className={cn("w-16 shrink-0 font-sans text-[10px] font-semibold uppercase", KIND_STYLE[e.kind])}>{e.kind}</span>
            <span className="break-all">{e.path}</span>
          </div>
          {e.kind !== "added" && <div className="break-all pl-[72px] text-red-700 dark:text-red-300">− {previewValue(e.before, 400)}</div>}
          {e.kind !== "removed" && <div className="break-all pl-[72px] text-emerald-700 dark:text-emerald-300">+ {previewValue(e.after, 400)}</div>}
        </li>
      ))}
    </ul>
  );
}

function RawBlock({ title, value }: { title: string; value: string | null }) {
  const pretty = useMemo(() => {
    if (value == null) return "(none)";
    const parsed = parseJsonish(value);
    return typeof parsed === "string" ? parsed : JSON.stringify(parsed, null, 2);
  }, [value]);
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{title}</p>
      <pre className="max-h-[60vh] overflow-auto rounded-md border bg-muted/40 p-2 text-[11px]">{pretty}</pre>
    </div>
  );
}
