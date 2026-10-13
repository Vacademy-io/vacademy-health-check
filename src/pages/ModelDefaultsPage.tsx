import { useMemo, useState } from "react";
import { AlertCircle, AlertTriangle, History, Pencil, ServerOff, Wand2 } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { SearchInput } from "@/components/shared/SearchInput";
import { SectionErrorBoundary } from "@/components/shared/SectionErrorBoundary";
import { ToastStack, useToasts } from "@/components/shared/Toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { GatewayBadge, ModelLabel, type ModelContext } from "@/components/model-defaults/ModelLabel";
import { UseCasesTable } from "@/components/model-defaults/UseCasesTable";
import { UseCaseEditDialog } from "@/components/model-defaults/UseCaseEditDialog";
import { BulkSetDialog } from "@/components/model-defaults/BulkSetDialog";
import { VideoStagesSection } from "@/components/model-defaults/VideoStagesSection";
import { OverridesPanel } from "@/components/model-defaults/OverridesPanel";
import { ModelChangeHistoryDrawer } from "@/components/model-defaults/ModelChangeHistoryDrawer";
import { useModelCatalog } from "@/services/model-defaults-api";
import { errorDetail } from "@/lib/eval-api-pricing";
import {
  COPY_CHECK_DEDUCTION,
  GEMINI_FALLBACK_ID,
  GLM_MODEL_ID,
  isNotFound,
  matchesUseCase,
  modelName,
  rowAnchorId,
} from "@/lib/model-defaults";
import type { UseCaseEntry } from "@/types/model-defaults";

export default function ModelDefaultsPage() {
  const catalog = useModelCatalog();
  const { toasts, push, dismiss } = useToasts();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<UseCaseEntry | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [history, setHistory] = useState<{ useCase: string | null; title?: string } | null>(null);

  const ctx = useMemo<ModelContext | null>(() => {
    if (!catalog.data) return null;
    const { models, routes, platform_default_model } = catalog.data;
    return {
      models,
      byId: new Map(models.map((m) => [m.model_id, m])),
      routes,
      platformDefault: platform_default_model || GLM_MODEL_ID,
    };
  }, [catalog.data]);

  const useCases = useMemo(() => catalog.data?.use_cases ?? [], [catalog.data]);
  const filtered = useMemo(() => useCases.filter((u) => matchesUseCase(u, query)), [useCases, query]);
  const copyCheck = useCases.find((u) => u.use_case === COPY_CHECK_DEDUCTION);

  const stats = useMemo(() => {
    const platform = ctx?.platformDefault ?? GLM_MODEL_ID;
    return {
      total: useCases.length,
      onDefault: useCases.filter((u) => (u.row ? u.row.default_model_id === platform : true)).length,
      missing: useCases.filter((u) => u.row === null).length,
      held: useCases.filter((u) => u.held_reason).length,
    };
  }, [useCases, ctx]);

  const jumpTo = (useCase: string) => {
    setQuery("");
    // Wait a frame so a cleared filter has re-rendered the row.
    requestAnimationFrame(() =>
      document.getElementById(rowAnchorId(useCase))?.scrollIntoView({ behavior: "smooth", block: "center" })
    );
  };

  return (
    <div>
      <PageHeader
        title="Model defaults"
        description="Which model every AI feature uses by default, and the video pipeline's per-stage models. Changes apply to new requests — no deploy. The voice-bot phone-call LLM is not managed here."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setHistory({ useCase: null })} disabled={!catalog.isSuccess}>
              <History className="mr-1 h-4 w-4" /> Change history
            </Button>
            <Button variant="outline" size="sm" onClick={() => catalog.refetch()}>
              Refresh
            </Button>
          </>
        }
      />

      {catalog.isLoading && (
        <div className="space-y-4">
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      )}

      {catalog.isError &&
        (isNotFound(catalog.error) ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
              <ServerOff className="h-10 w-10 text-muted-foreground/60" />
              <h3 className="text-lg font-medium">Backend not deployed yet</h3>
              <p className="max-w-lg text-sm text-muted-foreground">
                ai-service doesn't serve <span className="font-mono">/super-admin/v1/models/catalog</span> yet (404).
                This page will work once that release is live. Until then every feature keeps its current model.
              </p>
              <Button size="sm" variant="outline" className="mt-2" onClick={() => catalog.refetch()}>
                Check again
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 py-6 text-sm">
              <span className="flex items-center gap-2 text-destructive">
                <AlertCircle className="h-4 w-4" /> Could not load the model catalog: {errorDetail(catalog.error, "request failed")}
              </span>
              <Button size="sm" variant="outline" onClick={() => catalog.refetch()}>
                Retry
              </Button>
            </CardContent>
          </Card>
        ))}

      {catalog.data && ctx && (
        <div className="space-y-6">
          <SectionErrorBoundary title="Platform default">
            <Card>
              <CardHeader className="flex flex-col gap-4 space-y-0 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-2">
                  <CardDescription className="text-xs font-semibold uppercase tracking-wide">Platform default model</CardDescription>
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle className="text-xl">{modelName(ctx.platformDefault, ctx.byId)}</CardTitle>
                    <GatewayBadge modelId={ctx.platformDefault} routes={ctx.routes} />
                    <span className="font-mono text-xs text-muted-foreground">{ctx.platformDefault}</span>
                  </div>
                  <p className="max-w-2xl text-sm text-muted-foreground">
                    Every AI feature defaults to this model, with {modelName(GEMINI_FALLBACK_ID, ctx.byId)} as the one
                    non-GLM fallback. A feature without a row here falls back to it in code. Institutes or users that
                    explicitly pick a model keep their pick (billed at cost + 50%).
                  </p>
                  <p className="text-sm">
                    <span className="font-medium">{stats.onDefault}</span>
                    <span className="text-muted-foreground"> of {stats.total} features on it</span>
                    {stats.missing > 0 && (
                      <span className="text-amber-700"> · {stats.missing} missing row{stats.missing === 1 ? "" : "s"}</span>
                    )}
                    {stats.held > 0 && <span className="text-muted-foreground"> · {stats.held} held</span>}
                  </p>
                </div>
                <Button onClick={() => setBulkOpen(true)} className="shrink-0">
                  <Wand2 className="mr-1.5 h-4 w-4" />
                  Set every feature to {modelName(ctx.platformDefault, ctx.byId)}
                </Button>
              </CardHeader>
              {copyCheck && (
                <CardContent className="pt-0">
                  <div className="flex flex-col gap-3 rounded-md border border-amber-500/40 bg-amber-50 p-3 dark:bg-amber-950/30 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-2 text-sm">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                      <div>
                        <p className="font-medium">
                          {copyCheck.label || "Copy-check deduction re-check"} affects student marks
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
                          <ModelLabel modelId={copyCheck.row?.default_model_id ?? ctx.platformDefault} ctx={ctx} />
                          {copyCheck.row?.fallback_model_id && (
                            <span className="text-xs text-muted-foreground">
                              fallback {modelName(copyCheck.row.fallback_model_id, ctx.byId)}
                            </span>
                          )}
                          {copyCheck.held_reason && <span className="text-xs text-muted-foreground">held: {copyCheck.held_reason}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button size="sm" variant="outline" onClick={() => jumpTo(COPY_CHECK_DEDUCTION)}>
                        Show in table
                      </Button>
                      <Button size="sm" onClick={() => setEditing(copyCheck)}>
                        <Pencil className="mr-1 h-3.5 w-3.5" /> Switch model
                      </Button>
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>
          </SectionErrorBoundary>

          <SectionErrorBoundary title="Features">
            <Card>
              <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1.5">
                  <CardTitle>Features</CardTitle>
                  <CardDescription>
                    Default and fallback model per feature (ai_model_defaults). The fallback is tried when the default
                    errors. Held features are skipped by bulk changes. Every change needs a reason.
                  </CardDescription>
                </div>
                <div className="w-full sm:w-72">
                  <SearchInput value={query} onChange={setQuery} placeholder="Search features or models" debounceMs={150} />
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <UseCasesTable
                  useCases={filtered}
                  ctx={ctx}
                  onEdit={setEditing}
                  onHistory={(u) => setHistory({ useCase: u.use_case, title: u.label || u.use_case })}
                />
              </CardContent>
            </Card>
          </SectionErrorBoundary>

          <SectionErrorBoundary title="Video pipeline stages">
            <VideoStagesSection ctx={ctx} onNotify={(text) => push("success", text)} />
          </SectionErrorBoundary>

          <SectionErrorBoundary title="Overrides">
            <OverridesPanel ctx={ctx} />
          </SectionErrorBoundary>

          <UseCaseEditDialog
            entry={editing}
            ctx={ctx}
            open={editing !== null}
            onOpenChange={(open) => !open && setEditing(null)}
            onDone={(text) => push("success", text)}
          />
          <BulkSetDialog
            modelId={ctx.platformDefault}
            ctx={ctx}
            useCases={useCases}
            open={bulkOpen}
            onOpenChange={setBulkOpen}
            onDone={(text) => push("success", text)}
          />
        </div>
      )}

      <ModelChangeHistoryDrawer
        useCase={history?.useCase ?? null}
        title={history?.title}
        open={history !== null}
        onOpenChange={(open) => !open && setHistory(null)}
      />
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
