import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCapabilityCatalog, useModuleHistory } from "@/services/institute-modules-api";
import { buildGovernance, describeHistoryValue } from "@/lib/modules-catalog";
import { Drawer, QueryState } from "./shared";
import { when } from "./format";

/** Paged module/feature/mode change log for one institute (newest first). */
export function ModuleHistoryList({ instituteId, enabled = true }: { instituteId: string; enabled?: boolean }) {
  const [page, setPage] = useState(0);
  const { data, isLoading, error, refetch } = useModuleHistory(instituteId, page, 20, enabled);
  const { data: cat } = useCapabilityCatalog();
  const gov = buildGovernance(cat?.catalog ?? null);

  const labelOf = (key: string) => {
    if (key === "_mode") return "Mode";
    const m = gov.moduleByKey.get(key);
    if (m) return `${m.label} (module)`;
    const f = gov.featureByKey.get(key);
    if (f) return `${gov.moduleByKey.get(gov.moduleOfFeature.get(key) ?? "")?.label ?? "?"} › ${f.label}`;
    return key;
  };

  const state = <QueryState isLoading={isLoading} error={error} what="module history" onRetry={() => refetch()} />;
  if (isLoading || error) return state;
  if (!data || data.content.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">No module changes recorded yet.</p>;
  }

  return (
    <div className="space-y-3">
      <ol className="space-y-2">
        {data.content.map((e) => (
          <li key={e.id || `${e.key}-${e.created_at}`} className="rounded-md border p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{labelOf(e.key)}</span>
              {e.key !== "_mode" && <span className="font-mono text-[11px] text-muted-foreground">{e.key}</span>}
              <span className="ml-auto text-xs text-muted-foreground">{when(e.created_at)}</span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="outline">{describeHistoryValue(e.old_value)}</Badge>
              <span className="text-muted-foreground">→</span>
              <Badge variant="secondary">{describeHistoryValue(e.new_value)}</Badge>
            </div>
            {e.note && <p className="mt-1 text-xs">Note: {e.note}</p>}
            {e.reason && <p className="mt-1 text-muted-foreground">“{e.reason}”</p>}
            <p className="mt-1 text-xs text-muted-foreground">by {e.actor_user_id ?? "unknown"}</p>
          </li>
        ))}
      </ol>
      {data.total_pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Page {page + 1} of {data.total_pages}
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= data.total_pages - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function ModuleHistoryDrawer({
  instituteId,
  open,
  onOpenChange,
}: {
  instituteId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title="Module history"
      description="Every module, feature and mode change for this institute, with the reason given."
    >
      {open && <ModuleHistoryList instituteId={instituteId} />}
    </Drawer>
  );
}
