import { useMemo, useState } from "react";
import { Search, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { buildLibrary, createSearchIndex, stem, type LibraryVideo } from "@/lib/training-search";
import type { TrainingVideoDto } from "@/services/training-videos-api";
import { GROUP_LABELS } from "./training-quality";

/** The word as it appears in the video ("course"), not its search stem ("cours"). */
function surfaceWord(video: LibraryVideo, st: string): string {
  for (const text of [video.title, ...video.keywords, ...video.topics])
    for (const w of text.match(/[A-Za-z0-9]+/g) || []) if (stem(w) === st) return w.toLowerCase();
  return st;
}

const EXAMPLES = ["fees kaise le", "attendence", "zoom link kaha milega", "homework", "add students in bulk"];

/**
 * Runs the exact search the admin Training popup runs (same engine, active videos only), so a
 * super admin can check "if an admin types X, does the right video come first?" and fix keywords.
 */
export function TrainingSearchPreview({ rows }: { rows: TrainingVideoDto[] }) {
  const [query, setQuery] = useState("");
  const index = useMemo(() => createSearchIndex(buildLibrary(rows.filter((r) => r.active))), [rows]);
  const outcome = query.trim() ? index.search(query, { typing: true }) : null;

  const labels = outcome
    ? [...new Set(outcome.concepts.filter((c) => !c.weak).map((c) => GROUP_LABELS[c.groups.find((g) => !g.weak)?.id ?? ""] ?? c.display))]
    : [];

  return (
    <Card className="mb-4">
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold">Search preview</p>
            <p className="text-xs text-muted-foreground">
              Type what an institute admin would type — you see exactly what their Training popup shows.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {EXAMPLES.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => setQuery(e)}
                className="rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground hover:border-primary hover:text-primary"
              >
                {e}
              </button>
            ))}
          </div>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. class recording kaha milega" className="pl-9" />
        </div>

        {outcome ? (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              {outcome.corrections.length ? (
                <span>
                  Corrected to{" "}
                  <b className="text-foreground">{outcome.corrections.map(([, good]) => good).join(", ")}</b> ·
                </span>
              ) : null}
              {labels.length ? (
                <>
                  <Sparkles className="h-3.5 w-3.5 text-primary" /> Understood as
                  {labels.map((l) => (
                    <span key={l} className="rounded-full border bg-background px-2 py-0.5 font-medium text-foreground">
                      {l}
                    </span>
                  ))}
                </>
              ) : null}
              {outcome.unknown.length ? <span>· no video mentions “{outcome.unknown.join(", ")}”</span> : null}
            </div>
            {outcome.results.length ? (
              <ol className="divide-y rounded-md border">
                {outcome.results.slice(0, 5).map((r, i) => {
                  const top = outcome.results[0]!.score;
                  const p = r.video.placements[0]!;
                  return (
                    <li key={r.video.id} className="flex items-center gap-3 px-3 py-2">
                      <span
                        className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${i === 0 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
                      >
                        {i + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{r.video.title}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {p.root} → {p.section}
                          {p.step != null ? ` · step ${p.step}` : ""} · matched{" "}
                          {r.why
                            .slice(0, 3)
                            .map((w) => `“${surfaceWord(r.video, w.stem)}” in ${w.field}`)
                            .join(", ")}
                        </span>
                      </span>
                      <span className="hidden w-24 shrink-0 sm:block">
                        <span className="block h-1.5 overflow-hidden rounded-full bg-muted">
                          <span className="block h-full rounded-full bg-primary" style={{ width: `${(r.score / top) * 100}%` }} />
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                No video comes up for this. If one should, open it and add these words as <b>keywords</b>.
              </p>
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
