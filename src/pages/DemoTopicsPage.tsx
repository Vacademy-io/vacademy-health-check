import { useEffect, useState } from "react";
import { AlertCircle, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  useCompileDemoTopic,
  useDeleteDemoTopic,
  useDemoTopics,
  useUpsertDemoTopic,
  type DemoTopic,
} from "@/services/demo-topics-api";

const STATUS_STYLE: Record<string, string> = {
  READY: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  COMPILING: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  FAILED: "border-destructive/40 bg-destructive/10 text-destructive",
  STALE: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
};

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64);
}

function TopicEditor({ topic, onDone }: { topic: DemoTopic | null; onDone: () => void }) {
  const upsert = useUpsertDemoTopic();
  const [key, setKey] = useState(topic?.key ?? "");
  const [title, setTitle] = useState(topic?.title ?? "");
  const [emoji, setEmoji] = useState(topic?.emoji ?? "");
  const [language, setLanguage] = useState<"en" | "hi">(topic?.language ?? "en");
  const [sort, setSort] = useState(String(topic?.sort_order ?? 100));
  const [active, setActive] = useState(topic?.is_active ?? true);
  const [text, setText] = useState(topic?.source_text ?? "");
  const [compile, setCompile] = useState(true);
  useEffect(() => {
    if (!topic && title && !key) setKey(slug(title));
  }, [title, topic, key]);
  const save = () =>
    upsert.mutate(
      { key: key || slug(title), title, emoji: emoji || null, language, sort_order: Number(sort) || 100, is_active: active, source_text: text, compile },
      { onSuccess: onDone }
    );
  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="grid gap-3 md:grid-cols-4">
        <div className="space-y-1 md:col-span-2">
          <Label className="text-xs">Title (what the visitor picks)</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} className="h-9" placeholder="Understand Newton's second law" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Key</Label>
          <Input value={key} disabled={!!topic} onChange={(e) => setKey(slug(e.target.value))} className="h-9 font-mono text-xs" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Emoji</Label>
          <Input value={emoji} onChange={(e) => setEmoji(e.target.value)} className="h-9" placeholder="🚀" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Language</Label>
          <select value={language} onChange={(e) => setLanguage(e.target.value as "en" | "hi")} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
            <option value="en">English</option>
            <option value="hi">Hindi</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Order</Label>
          <Input value={sort} onChange={(e) => setSort(e.target.value)} className="h-9" inputMode="numeric" />
        </div>
        <label className="flex items-end gap-2 pb-2 text-sm">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Offered to visitors
        </label>
        <label className="flex items-end gap-2 pb-2 text-sm">
          <input type="checkbox" checked={compile} onChange={(e) => setCompile(e.target.checked)} /> Compile after saving
        </label>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">
          Lesson source (what the teacher will teach from — headings, explanations, a worked example, quick checks; 400–1500 words works best)
        </Label>
        <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={16} className="font-mono text-xs" />
        <p className="text-xs text-muted-foreground">{text.length.toLocaleString("en-IN")} characters</p>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" disabled={upsert.isPending || !title.trim() || text.trim().length < 50} onClick={save}>
          {upsert.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {topic ? "Save & recompile" : "Create topic"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>Cancel</Button>
        {upsert.isError && (
          <span className="text-xs text-destructive">
            {String((upsert.error as { response?: { data?: { detail?: string } } })?.response?.data?.detail || upsert.error)}
          </span>
        )}
      </div>
    </div>
  );
}

export default function DemoTopicsPage() {
  const { data, isLoading, isError, refetch } = useDemoTopics(true);
  const compile = useCompileDemoTopic();
  const del = useDeleteDemoTopic();
  const [editing, setEditing] = useState<string | "new" | null>(null);

  return (
    <div>
      <PageHeader
        title="Tutezy demo topics"
        description="The lessons an anonymous visitor can take at learner.vacademy.io/try. Each topic is an authored text that the normal tutor compiler turns into boards, checks and a recap. Limits and the kill switch live in AI Settings under Live AI Tutor (tutor.demo.*)."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="h-4 w-4" /> Refresh</Button>
            <Button size="sm" onClick={() => setEditing("new")}><Plus className="h-4 w-4" /> New topic</Button>
          </div>
        }
      />

      {isLoading && <Skeleton className="h-64 w-full" />}
      {isError && (
        <Card><CardContent className="flex items-center gap-2 py-6 text-sm text-destructive"><AlertCircle className="h-4 w-4" /> Could not load the topics.</CardContent></Card>
      )}

      {data && (
        <div className="space-y-6">
          <Card className={cn(!data.config.enabled && "border-amber-500/40")}>
            <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-1 py-3 text-sm">
              <span>Demo: <strong>{data.config.enabled ? "on" : "off"}</strong></span>
              <span>Length: <strong>{data.config.minutes} min</strong></span>
              <span>Per visitor: <strong>{data.config.per_ip_per_day}/day</strong></span>
              <span>Daily cap: <strong>{data.config.daily_cap}</strong></span>
              <span>Teacher: <strong>{data.config.teacher_name || "institute default"}</strong></span>
              <span className="text-muted-foreground">Institute {data.config.institute_id || "— not set"}</span>
            </CardContent>
          </Card>

          {editing === "new" && <TopicEditor topic={null} onDone={() => setEditing(null)} />}

          <Card>
            <CardHeader>
              <CardTitle>Topics ({data.topics.length})</CardTitle>
              <CardDescription>Visitors see the active topics whose plan is READY, in this order. Editing a topic recompiles it in the background (about a minute; images cost credits on the demo institute).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              {data.topics.map((t) =>
                editing === t.key ? (
                  <TopicEditor key={t.key} topic={t} onDone={() => setEditing(null)} />
                ) : (
                  <div key={t.key} className="flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3">
                    <span className="text-xl" aria-hidden="true">{t.emoji || "•"}</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{t.title} <span className="font-mono text-xs text-muted-foreground">{t.key}</span></p>
                      <p className="text-xs text-muted-foreground">
                        {t.language.toUpperCase()} · order {t.sort_order} · {t.source_chars.toLocaleString("en-IN")} chars · {t.is_active ? "offered" : "hidden"}
                        {t.plan_error ? ` · ${t.plan_error}` : ""}
                      </p>
                    </div>
                    <Badge variant="outline" className={STATUS_STYLE[t.plan_status || ""] || "text-muted-foreground"}>{t.plan_status || "not compiled"}</Badge>
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" onClick={() => setEditing(t.key)}>Edit</Button>
                      <Button size="sm" variant="ghost" disabled={compile.isPending} onClick={() => compile.mutate(t.key)} title="Recompile">
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" disabled={del.isPending} onClick={() => { if (confirm(`Delete "${t.title}"?`)) del.mutate(t.key); }} title="Delete">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )
              )}
              {data.topics.length === 0 && <p className="text-sm text-muted-foreground">No topics yet.</p>}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
