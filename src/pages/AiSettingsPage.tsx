import { useMemo, useState, type ReactNode } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertCircle, Check, Loader2, RotateCcw } from "lucide-react";
import {
  useAiSettings,
  useResetAiSetting,
  useUpdateAiSetting,
  useUpdateUseCaseDefault,
  useUseCaseDefaults,
} from "@/services/ai-settings-api";
import type { AiSettingEntry, AiSettingsResponse, ModelOption, UseCaseDefault } from "@/types/ai-settings";
import { cn } from "@/lib/utils";

/** Sentinel for "no override" in a Select — Radix rejects an empty-string item value. */
const BLANK = "__blank__";

type Status = { kind: "saved" | "error"; text: string } | null;

function formatWhen(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

function SourceBadge({ entry }: { entry: AiSettingEntry }) {
  if (entry.source === "portal") {
    return (
      <Badge variant="secondary" title={entry.updated_by ? `by ${entry.updated_by}` : undefined}>
        Set here{entry.updated_at ? ` · ${formatWhen(entry.updated_at)}` : ""}
      </Badge>
    );
  }
  return <Badge variant="outline">Env default</Badge>;
}

function Toggle({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors disabled:opacity-50",
        checked ? "border-primary bg-primary" : "border-input bg-muted"
      )}
    >
      <span
        className={cn(
          "inline-block h-5 w-5 rounded-full bg-background shadow transition-transform",
          checked ? "translate-x-5" : "translate-x-0.5"
        )}
      />
    </button>
  );
}

function SettingRow({
  entry,
  catalog,
}: {
  entry: AiSettingEntry;
  catalog: AiSettingsResponse["catalog"];
}) {
  const update = useUpdateAiSetting();
  const reset = useResetAiSetting();
  const [status, setStatus] = useState<Status>(null);
  const [draft, setDraft] = useState<string>(typeof entry.value === "string" ? entry.value : "");

  const busy = update.isPending || reset.isPending;

  const commit = (value: string | boolean | null) => {
    setStatus(null);
    update.mutate(
      { key: entry.key, value },
      {
        onSuccess: () => setStatus({ kind: "saved", text: "Saved — live within ~30s" }),
        onError: (err) => {
          const detail =
            (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
            (err as Error).message;
          setStatus({ kind: "error", text: detail || "Failed to save" });
        },
      }
    );
  };

  const doReset = () => {
    setStatus(null);
    reset.mutate(entry.key, {
      onSuccess: (fresh) => {
        setDraft(typeof fresh.value === "string" ? fresh.value : "");
        setStatus({ kind: "saved", text: "Reset to environment default" });
      },
      onError: () => setStatus({ kind: "error", text: "Failed to reset" }),
    });
  };

  // Which slice of the registry this setting may pick from.
  const models = useMemo(
    () => (entry.catalog === "image" ? (catalog.image_models ?? []) : catalog.llm_models),
    [entry.catalog, catalog.image_models, catalog.llm_models]
  );
  // Group models by provider so a long registry stays scannable.
  const modelGroups = useMemo(() => {
    const groups = new Map<string, typeof models>();
    for (const m of models) {
      const list = groups.get(m.provider) ?? [];
      list.push(m);
      groups.set(m.provider, list);
    }
    return Array.from(groups.entries());
  }, [models]);

  let control: ReactNode;
  const strValue = typeof entry.value === "string" ? entry.value : "";

  if (entry.type === "bool") {
    control = (
      <Toggle checked={Boolean(entry.value)} disabled={busy} onChange={(next) => commit(next)} />
    );
  } else if (entry.type === "model") {
    const known = models.some((m) => m.model_id === strValue);
    control = (
      <Select
        value={strValue ? strValue : BLANK}
        disabled={busy}
        onValueChange={(v) => commit(v === BLANK ? null : v)}
      >
        <SelectTrigger className="w-full sm:w-[420px]">
          <SelectValue placeholder="Choose a model" />
        </SelectTrigger>
        <SelectContent className="max-h-80">
          {entry.nullable && <SelectItem value={BLANK}>{entry.blank_label ?? "Same as chatbot model"}</SelectItem>}
          {/* The current value may be an env default that isn't in the registry — keep it selectable. */}
          {strValue && !known && (
            <SelectItem value={strValue}>
              <span className="font-mono text-xs">{strValue}</span>
              <span className="ml-2 text-xs text-muted-foreground">(not in registry)</span>
            </SelectItem>
          )}
          {modelGroups.map(([provider, models]) => (
            <div key={provider}>
              <div className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {provider}
              </div>
              {models.map((m) => (
                <SelectItem key={m.model_id} value={m.model_id}>
                  <span>{m.name}</span>
                  <span className="ml-2 font-mono text-xs text-muted-foreground">{m.model_id}</span>
                  {m.is_free && <span className="ml-2 text-xs text-emerald-600">free</span>}
                </SelectItem>
              ))}
            </div>
          ))}
        </SelectContent>
      </Select>
    );
  } else if (entry.type === "enum") {
    const isTts = entry.key === "chatbot.voice.tts_provider" || entry.key === "tutor.voice.provider";
    control = (
      <Select value={strValue} disabled={busy} onValueChange={(v) => commit(v)}>
        <SelectTrigger className="w-full sm:w-[420px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {entry.options.map((opt) => {
            const meta = isTts ? catalog.tts_providers.find((p) => p.id === opt) : undefined;
            return (
              <SelectItem key={opt} value={opt}>
                <span>{meta?.label ?? opt}</span>
                {meta && !meta.available && (
                  <span className="ml-2 text-xs text-amber-600">credentials missing</span>
                )}
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    );
  } else {
    control = (
      <div className="flex w-full items-center gap-2 sm:w-[420px]">
        <Input
          value={draft}
          disabled={busy}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit(draft.trim());
          }}
          placeholder="blank = default for the call's language"
        />
        <Button size="sm" onClick={() => commit(draft.trim())} disabled={busy || draft === strValue}>
          Save
        </Button>
      </div>
    );
  }

  const ttsMeta =
    entry.key === "chatbot.voice.tts_provider" || entry.key === "tutor.voice.provider"
      ? catalog.tts_providers.find((p) => p.id === strValue)
      : undefined;

  return (
    <div className="flex flex-col gap-3 border-b py-4 last:border-b-0 sm:flex-row sm:items-start sm:justify-between">
      <div className="max-w-xl">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{entry.label}</span>
          <SourceBadge entry={entry} />
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{entry.description}</p>
        {ttsMeta && (
          <p className="mt-1 text-xs text-muted-foreground">
            {ttsMeta.note} Example voice: <span className="font-mono">{ttsMeta.default_voice_example}</span>
          </p>
        )}
        <p className="mt-1 font-mono text-[11px] text-muted-foreground/70">{entry.key}</p>
        {entry.effective !== undefined && String(entry.effective ?? "") !== String(entry.value ?? "") && (
          <p className="mt-1 inline-flex items-center gap-1 text-xs text-amber-700">
            <AlertCircle className="h-3 w-3" />
            ai-service is currently using <span className="font-mono">{String(entry.effective ?? "—")}</span>
            {" "}— saved value not in effect yet
          </p>
        )}
      </div>
      <div className="flex flex-col items-start gap-2 sm:items-end">
        <div className="flex items-center gap-2">
          {busy && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          {control}
        </div>
        <div className="flex items-center gap-3 text-xs">
          {status && (
            <span
              className={cn(
                "inline-flex items-center gap-1",
                status.kind === "saved" ? "text-emerald-600" : "text-destructive"
              )}
            >
              {status.kind === "saved" ? <Check className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
              {status.text}
            </span>
          )}
          {entry.source === "portal" && (
            <button
              type="button"
              onClick={doReset}
              disabled={busy}
              className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              <RotateCcw className="h-3 w-3" />
              Reset to default
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Which registry category a pipeline use case draws its models from. */
function categoryForUseCase(useCase: string): string {
  if (useCase === "image" || useCase.endsWith("_figure")) return "image";
  if (useCase.startsWith("video")) return "video";
  if (useCase === "embedding") return "embedding";
  if (useCase === "tts") return "tts";
  return "llm";
}

function UseCaseDefaultRow({ row, allModels }: { row: UseCaseDefault; allModels: ModelOption[] }) {
  const update = useUpdateUseCaseDefault();
  const [status, setStatus] = useState<Status>(null);
  const category = categoryForUseCase(row.use_case);
  const options = useMemo(
    () =>
      allModels.filter((m) =>
        category === "llm"
          ? !["image", "video", "embedding", "tts"].includes(m.category)
          : m.category === category
      ),
    [allModels, category]
  );
  const commit = (field: "default_model_id" | "fallback_model_id", value: string | null) => {
    setStatus(null);
    update.mutate(
      { useCase: row.use_case, [field]: value },
      {
        onSuccess: () => setStatus({ kind: "saved", text: "Saved" }),
        onError: (err) => {
          const detail =
            (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
            (err as Error).message;
          setStatus({ kind: "error", text: detail || "Failed to save" });
        },
      }
    );
  };
  const pick = (field: "default_model_id" | "fallback_model_id", value: string | null, allowBlank: boolean) => {
    const known = value && options.some((m) => m.model_id === value);
    return (
      <Select
        value={value ? value : BLANK}
        disabled={update.isPending}
        onValueChange={(v) => commit(field, v === BLANK ? null : v)}
      >
        <SelectTrigger className="w-full sm:w-[300px]">
          <SelectValue placeholder="Choose a model" />
        </SelectTrigger>
        <SelectContent className="max-h-80">
          {allowBlank && <SelectItem value={BLANK}>None</SelectItem>}
          {value && !known && (
            <SelectItem value={value}>
              <span className="font-mono text-xs">{value}</span>
              <span className="ml-2 text-xs text-muted-foreground">(not in registry)</span>
            </SelectItem>
          )}
          {options.map((m) => (
            <SelectItem key={m.model_id} value={m.model_id}>
              <span>{m.name}</span>
              <span className="ml-2 font-mono text-xs text-muted-foreground">{m.model_id}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  };
  return (
    <div className="flex flex-col gap-3 border-b py-4 last:border-b-0 sm:flex-row sm:items-start sm:justify-between">
      <div className="max-w-md">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm font-medium">{row.use_case}</span>
          <Badge variant="outline">{category}</Badge>
        </div>
        {row.description && <p className="mt-1 text-sm text-muted-foreground">{row.description}</p>}
        {status && (
          <p
            className={cn(
              "mt-1 inline-flex items-center gap-1 text-xs",
              status.kind === "saved" ? "text-emerald-600" : "text-destructive"
            )}
          >
            {status.kind === "saved" ? <Check className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
            {status.text}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Default
          {pick("default_model_id", row.default_model_id, false)}
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Fallback
          {pick("fallback_model_id", row.fallback_model_id, true)}
        </label>
      </div>
    </div>
  );
}

export default function AiSettingsPage() {
  const { data, isLoading, isError, refetch } = useAiSettings();
  const defaults = useUseCaseDefaults();

  const groups = useMemo(() => {
    if (!data) return [];
    const order = ["chatbot", "tutor", "images", "voice", "rollout"];
    const byGroup = new Map<string, { label: string; items: AiSettingEntry[] }>();
    for (const s of data.settings) {
      const g = byGroup.get(s.group) ?? { label: s.group_label, items: [] };
      g.items.push(s);
      byGroup.set(s.group, g);
    }
    return Array.from(byGroup.entries()).sort(
      ([a], [b]) => (order.indexOf(a) === -1 ? 99 : order.indexOf(a)) - (order.indexOf(b) === -1 ? 99 : order.indexOf(b))
    );
  }, [data]);

  return (
    <div>
      <PageHeader
        title="AI Settings"
        description="Platform-wide model choices for the learner chatbot, the Live AI Tutor, image generation and the voice call, plus the per-use-case defaults of the course pipeline. Changes reach every ai-service replica within about 30 seconds — no deploy."
        actions={
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Refresh
          </Button>
        }
      />

      {isLoading && (
        <div className="space-y-4">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      )}

      {isError && (
        <Card>
          <CardContent className="flex items-center gap-2 py-6 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            Could not load settings. If ai-service was deployed before the V493 migration ran, the
            table doesn't exist yet — the service keeps serving env defaults in the meantime.
          </CardContent>
        </Card>
      )}

      {data?.cache && (
        <Card className={cn("mb-6", data.cache.load_failed ? "border-destructive/50" : "border-emerald-500/30")}>
          <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 text-sm">
            {data.cache.load_failed ? (
              <>
                <span className="inline-flex items-center gap-1 font-medium text-destructive">
                  <AlertCircle className="h-4 w-4" /> ai-service could not read these settings
                </span>
                <span className="text-muted-foreground">
                  It is serving environment defaults. Last error: <span className="font-mono">{data.cache.last_error ?? "unknown"}</span>
                </span>
              </>
            ) : (
              <>
                <span className="inline-flex items-center gap-1 font-medium text-emerald-700">
                  <Check className="h-4 w-4" /> ai-service is reading these settings
                </span>
                <span className="text-muted-foreground">
                  {data.cache.override_keys.length} override{data.cache.override_keys.length === 1 ? "" : "s"} active
                  {data.cache.age_seconds !== null && ` · refreshed ${Math.round(data.cache.age_seconds)}s ago (every ${data.cache.ttl_seconds}s)`}
                </span>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {data && (
        <div className="space-y-6">
          {groups.map(([key, group]) => (
            <Card key={key}>
              <CardHeader>
                <CardTitle>{group.label}</CardTitle>
                {key === "chatbot" && (
                  <CardDescription>
                    Models come from the ai_models registry ({data.catalog.llm_models.length} active). An
                    institute that brings its own API key and default model still overrides these.
                  </CardDescription>
                )}
                {key === "voice" && (
                  <CardDescription>
                    Applies to new calls. A failing engine falls back to Sarvam for that line rather
                    than going silent.
                  </CardDescription>
                )}
                {key === "tutor" && (
                  <CardDescription>
                    Compile = turning a slide into a teaching plan (per slide, at course creation or
                    "Prepare for teaching"). Live = every learner turn during a lesson. Institutes and
                    courses can override the models from their Tutor Mode settings.
                  </CardDescription>
                )}
                {key === "images" && (
                  <CardDescription>
                    Image models come from the registry ({data.catalog.image_models?.length ?? 0} active).
                    Dedicated image models (Qwen, Seedream, FLUX) take 30–70 s per picture; Gemini
                    image models a few seconds. Applies to new generations only.
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent className="pt-0">
                {group.items.map((entry) => (
                  <SettingRow key={entry.key} entry={entry} catalog={data.catalog} />
                ))}
              </CardContent>
            </Card>
          ))}

          <Card>
            <CardHeader>
              <CardTitle>Course pipeline defaults</CardTitle>
              <CardDescription>
                The default and fallback model for each use case in the models registry
                (ai_model_defaults): course outline and content, questions, evaluation, knowledge
                base, video, embeddings. The fallback is tried when the default errors. Root admin
                only; applies to new requests at once.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              {defaults.isLoading && <Skeleton className="h-24 w-full" />}
              {defaults.isError && (
                <p className="flex items-center gap-2 py-4 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4" /> Could not load the use-case defaults.
                </p>
              )}
              {defaults.data?.defaults
                .slice()
                .sort((a, b) => a.use_case.localeCompare(b.use_case))
                .map((row) => (
                  <UseCaseDefaultRow key={row.use_case} row={row} allModels={data.catalog.all_models ?? []} />
                ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
