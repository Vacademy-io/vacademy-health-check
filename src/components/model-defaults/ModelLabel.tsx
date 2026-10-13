import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { gatewayFor, modelName } from "@/lib/model-defaults";
import type { ModelOption } from "@/types/model-defaults";

/** Everything a model label needs from the catalog. */
export interface ModelContext {
  models: ModelOption[];
  byId: Map<string, ModelOption>;
  routes: Record<string, string>;
  platformDefault: string;
}

export function GatewayBadge({ modelId, routes, className }: { modelId: string | null | undefined; routes: Record<string, string>; className?: string }) {
  const gw = gatewayFor(modelId, routes);
  if (!gw) return null;
  return (
    <Badge
      variant="outline"
      className={cn(
        "px-1.5 py-0 text-[10px] font-medium",
        gw.key === "isoquant"
          ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-400"
          : gw.key === "openrouter"
            ? "border-sky-500/40 text-sky-700 dark:text-sky-400"
            : "text-muted-foreground",
        className
      )}
      title={routes[modelId ?? ""] ? `llm.model_routes → ${gw.key}` : "Not in llm.model_routes — served via OpenRouter"}
    >
      {gw.label}
    </Badge>
  );
}

/** Model name + id (+ gateway); "—" for none. */
export function ModelLabel({
  modelId,
  ctx,
  showGateway = true,
  empty = "—",
}: {
  modelId: string | null | undefined;
  ctx: ModelContext;
  showGateway?: boolean;
  empty?: string;
}) {
  if (!modelId) return <span className="text-sm text-muted-foreground">{empty}</span>;
  const known = ctx.byId.get(modelId);
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-sm font-medium">{modelName(modelId, ctx.byId)}</span>
        {showGateway && <GatewayBadge modelId={modelId} routes={ctx.routes} />}
        {!known && (
          <Badge variant="outline" className="px-1.5 py-0 text-[10px] text-amber-700" title="Not in the ai_models registry">
            not in registry
          </Badge>
        )}
        {known && !known.is_active && (
          <Badge variant="outline" className="px-1.5 py-0 text-[10px] text-amber-700">
            inactive
          </Badge>
        )}
      </div>
      <p className="truncate font-mono text-[11px] text-muted-foreground" title={modelId}>
        {modelId}
      </p>
    </div>
  );
}
