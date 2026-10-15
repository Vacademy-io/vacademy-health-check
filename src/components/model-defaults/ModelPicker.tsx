import { useMemo, useState, type ReactNode } from "react";
import { Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { GEMINI_FALLBACK_ID, GLM_MODEL_ID, formatPrice, isChatModel, matchesModel } from "@/lib/model-defaults";
import { isImageModel, isImageUseCase } from "@/lib/image-use-cases";
import type { ModelOption, UseCaseEntry } from "@/types/model-defaults";
import { GatewayBadge, type ModelContext } from "./ModelLabel";

const NONE = "__none__";

function rank(m: ModelOption, platformDefault: string) {
  if (m.model_id === platformDefault || m.model_id === GLM_MODEL_ID) return 0;
  if (m.model_id === GEMINI_FALLBACK_ID) return 1;
  return 2;
}

/**
 * Searchable model list (Radix Select swallows typing, so this is a plain filter + listbox).
 * Chat models only unless `allCategories`; inactive models are hidden except the current value.
 * For an image-generation `useCase` it lists image models instead (and keeps the current value
 * visible even when it is not an image model, so a wrong pick can be seen and replaced).
 */
export function ModelPicker({
  value,
  onChange,
  ctx,
  allowNone = false,
  noneLabel = "None",
  allCategories = false,
  useCase,
  label,
}: {
  value: string | null;
  onChange: (next: string | null) => void;
  ctx: ModelContext;
  allowNone?: boolean;
  noneLabel?: string;
  allCategories?: boolean;
  /** The use case being edited; decides chat vs image models. Omitted = chat. */
  useCase?: Pick<UseCaseEntry, "use_case" | "kind"> | null;
  label: string;
}) {
  const [query, setQuery] = useState("");
  const imageMode = !allCategories && isImageUseCase(useCase);

  const options = useMemo(() => {
    const list = ctx.models
      .filter((m) =>
        imageMode
          ? (isImageModel(m) && m.is_active) || m.model_id === value
          : (allCategories || isChatModel(m)) && (m.is_active || m.model_id === value)
      )
      .filter((m) => matchesModel(m, query));
    return list.sort(
      (a, b) =>
        rank(a, ctx.platformDefault) - rank(b, ctx.platformDefault) ||
        a.provider.localeCompare(b.provider) ||
        a.name.localeCompare(b.name)
    );
  }, [ctx.models, ctx.platformDefault, allCategories, imageMode, value, query]);

  const valueKnown = !value || ctx.models.some((m) => m.model_id === value);

  const row = (key: string, selected: boolean, onPick: () => void, body: ReactNode) => (
    <button
      key={key}
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onPick}
      className={cn(
        "flex w-full items-start gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent",
        selected && "bg-primary/10"
      )}
    >
      <Check className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", selected ? "opacity-100" : "opacity-0")} />
      <div className="min-w-0 flex-1">{body}</div>
    </button>
  );

  return (
    <div className="space-y-1.5">
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={`Search ${allCategories ? "models" : imageMode ? "image models" : "chat models"} by name, id or provider`}
        aria-label={`Search models for ${label}`}
        className="h-9"
      />
      <div role="listbox" aria-label={label} className="max-h-56 overflow-y-auto rounded-md border p-1">
        {allowNone && !query && row(NONE, value === null, () => onChange(null), <span className="text-muted-foreground">{noneLabel}</span>)}
        {value && !valueKnown &&
          row(
            `unknown-${value}`,
            true,
            () => onChange(value),
            <>
              <span className="font-mono text-xs">{value}</span>
              <span className="ml-2 text-xs text-amber-700">not in registry</span>
            </>
          )}
        {options.map((m) => {
          const price = formatPrice(m);
          const tag =
            m.model_id === ctx.platformDefault ? "platform default" : m.model_id === GEMINI_FALLBACK_ID ? "approved fallback" : null;
          return row(
            m.model_id,
            m.model_id === value,
            () => onChange(m.model_id),
            <>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-medium">{m.name}</span>
                <GatewayBadge modelId={m.model_id} routes={ctx.routes} />
                {tag && <span className="text-[10px] font-semibold uppercase tracking-wide text-primary">{tag}</span>}
                {!m.is_active && <span className="text-[10px] text-amber-700">inactive</span>}
                {allCategories && !isChatModel(m) && <span className="text-[10px] text-muted-foreground">{m.category}</span>}
                {imageMode && !isImageModel(m) && (
                  <span className="text-[10px] text-amber-700">{m.category || "chat"} model, not an image model</span>
                )}
              </div>
              <div className="flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
                <span className="font-mono">{m.model_id}</span>
                {price && <span>{price}</span>}
              </div>
            </>
          );
        })}
        {options.length === 0 && <p className="px-2 py-3 text-sm text-muted-foreground">No model matches “{query}”.</p>}
      </div>
    </div>
  );
}
