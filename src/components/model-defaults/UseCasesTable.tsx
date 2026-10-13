import { Fragment, useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, History, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { COPY_CHECK_DEDUCTION, formatWhen, groupUseCases, rowAnchorId } from "@/lib/model-defaults";
import type { UseCaseEntry } from "@/types/model-defaults";
import { ModelLabel, type ModelContext } from "./ModelLabel";

/** Features grouped by `group`: default / fallback, flags, last change, inline edit + history. */
export function UseCasesTable({
  useCases,
  ctx,
  onEdit,
  onHistory,
}: {
  useCases: UseCaseEntry[];
  ctx: ModelContext;
  onEdit: (entry: UseCaseEntry) => void;
  onHistory: (entry: UseCaseEntry) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const groups = useMemo(() => groupUseCases(useCases), [useCases]);
  const toggle = (uc: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(uc)) next.delete(uc);
      else next.add(uc);
      return next;
    });

  if (useCases.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">No feature matches.</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th className="w-[34%] py-2 pr-3 font-medium">Feature</th>
            <th className="w-[20%] px-2 py-2 font-medium">Default</th>
            <th className="w-[18%] px-2 py-2 font-medium">Fallback</th>
            <th className="w-[20%] px-2 py-2 font-medium">Last change</th>
            <th className="w-[8%] py-2 pl-2" />
          </tr>
        </thead>
        <tbody>
          {groups.map(([group, list]) => (
            <Fragment key={group}>
              <tr className="bg-muted/40">
                <td colSpan={5} className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {group} <span className="font-normal normal-case">({list.length})</span>
                </td>
              </tr>
              {list.map((u) => {
                const open = expanded.has(u.use_case);
                const marks = u.use_case === COPY_CHECK_DEDUCTION;
                const offDefault = u.row && u.row.default_model_id !== ctx.platformDefault;
                return (
                  <Fragment key={u.use_case}>
                    <tr
                      id={rowAnchorId(u.use_case)}
                      className={cn("scroll-mt-20 border-b align-top", marks && "bg-amber-50/60 dark:bg-amber-950/20")}
                    >
                      <td className="py-3 pr-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-medium">{u.label || u.use_case}</span>
                          {u.kind === "vision" && (
                            <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                              vision
                            </Badge>
                          )}
                          {u.row === null && (
                            <Badge
                              variant="outline"
                              className="border-amber-500/50 px-1.5 py-0 text-[10px] text-amber-700"
                              title="No ai_model_defaults row — the code falls back to the platform default"
                            >
                              missing row
                            </Badge>
                          )}
                          {u.held_reason && (
                            <Badge variant="secondary" className="px-1.5 py-0 text-[10px]" title={u.held_reason}>
                              held
                            </Badge>
                          )}
                          {offDefault && (
                            <Badge variant="outline" className="px-1.5 py-0 text-[10px] text-muted-foreground">
                              not on platform default
                            </Badge>
                          )}
                        </div>
                        <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                          {u.use_case} · {u.service}
                        </p>
                        {u.description && <p className="mt-1 text-xs text-muted-foreground">{u.description}</p>}
                        {u.held_reason && <p className="mt-1 text-xs text-muted-foreground">Held: {u.held_reason}</p>}
                        {marks && (
                          <p className="mt-1 flex items-start gap-1 text-xs font-medium text-amber-800 dark:text-amber-300">
                            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                            Re-checks deductions on evaluated copies — switching this model changes student marks.
                          </p>
                        )}
                        {u.consumers.length > 0 && (
                          <button
                            type="button"
                            onClick={() => toggle(u.use_case)}
                            className="mt-1 inline-flex items-center gap-0.5 text-xs text-primary hover:underline"
                            aria-expanded={open}
                          >
                            {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                            Where it's used ({u.consumers.length})
                          </button>
                        )}
                      </td>
                      <td className="px-2 py-3">
                        {u.row ? (
                          <ModelLabel modelId={u.row.default_model_id} ctx={ctx} />
                        ) : (
                          <div>
                            <ModelLabel modelId={ctx.platformDefault} ctx={ctx} />
                            <p className="text-[11px] text-amber-700">code fallback (no row)</p>
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-3">
                        <ModelLabel modelId={u.row?.fallback_model_id} ctx={ctx} empty="none" />
                        {u.row?.free_tier_model_id && (
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            free tier: <span className="font-mono">{u.row.free_tier_model_id}</span>
                          </p>
                        )}
                      </td>
                      <td className="px-2 py-3 text-xs">
                        {u.last_change ? (
                          <div className="space-y-0.5">
                            <p>{formatWhen(u.last_change.created_at)}</p>
                            <p className="text-muted-foreground">by {u.last_change.actor ?? "unknown"}</p>
                            {u.last_change.reason && (
                              <p className="line-clamp-2 text-muted-foreground" title={u.last_change.reason}>
                                “{u.last_change.reason}”
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">{u.row?.updated_at ? `updated ${formatWhen(u.row.updated_at)}` : "—"}</span>
                        )}
                      </td>
                      <td className="py-3 pl-2">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant={marks ? "default" : "outline"} onClick={() => onEdit(u)} aria-label={`Edit ${u.label}`}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => onHistory(u)} aria-label={`History of ${u.label}`}>
                            <History className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                    {open && (
                      <tr className="border-b bg-muted/20">
                        <td colSpan={5} className="px-3 py-2">
                          <ul className="space-y-0.5 font-mono text-[11px] text-muted-foreground">
                            {u.consumers.map((c) => (
                              <li key={c}>{c}</li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
