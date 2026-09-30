import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useCacheEntries, useCacheMisses, useCacheTrend, useCacheVariants, useFlushLog,
  useDeleteEntry, useFlushAgent,
  type CacheAgent, type CacheCommand,
} from "@/services/tts-cache-api";
import { DASH, MODE_TONE, STATUS_TONE, ago, bytes, num, pct, rupees, stamp } from "./format";

/** A bot-authored line and an LLM line answer to different admission rules. */
function KindChip({ isFixed }: { isFixed: boolean | null }) {
  if (isFixed == null) return <span className="text-muted-foreground">{DASH}</span>;
  return (
    <span className={`rounded border px-1.5 py-0.5 text-[10px] ${
      isFixed ? "border-blue-300 bg-blue-50 text-blue-700" : "border-muted-foreground/30 text-muted-foreground"
    }`}>
      {isFixed ? "authored" : "LLM"}
    </span>
  );
}

function Pager({ page, size, total, onPage }: {
  page: number; size: number; total: number; onPage: (p: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / size));
  return (
    <div className="mt-3 flex items-center justify-between text-xs">
      <span className="text-muted-foreground">{num(total)} sentences</span>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" disabled={page === 0} onClick={() => onPage(page - 1)}>
          Previous
        </Button>
        <Button size="sm" variant="outline" disabled={page + 1 >= pages} onClick={() => onPage(page + 1)}>
          Next
        </Button>
      </div>
    </div>
  );
}

/**
 * Deletion is a two-step: the dry run says what would go, and only then is the real
 * command offered. Both are queued on the bot, so the wording stays "queued" throughout.
 */
function FlushPanel({ preview, queued, onConfirm, onCancel, busy }: {
  preview: CacheCommand | null;
  queued: CacheCommand | null;
  onConfirm: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  if (queued) {
    return (
      <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
        <div className="font-medium">Queued — not done yet.</div>
        <p className="mt-1 text-xs">
          The bot picks this up on its next cycle, up to about two minutes away. Command{" "}
          <span className="font-mono">{queued.command_id.slice(0, 8)}</span> — watch the flush log for
          what it actually removed.
        </p>
        <Button size="sm" variant="outline" className="mt-2" onClick={onCancel}>Dismiss</Button>
      </div>
    );
  }
  if (!preview) return null;
  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
      <div className="font-medium">
        {preview.result ?? "Dry run returned no detail."}
      </div>
      <p className="mt-1 text-xs">
        Nothing has been deleted. Audio shared with another agent is kept — flushing this agent never
        removes what another one is still serving.
      </p>
      <div className="mt-2 flex gap-2">
        <Button size="sm" variant="destructive" disabled={busy} onClick={onConfirm}>
          {busy ? "Queueing…" : "Delete for real"}
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

export default function CacheAgentDialog({ agent, onClose }: {
  agent: CacheAgent | null;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [entryPage, setEntryPage] = useState(0);
  const [missPage, setMissPage] = useState(0);
  /** The weekly review reads the last 7 days; "all time" is the ledger's whole backlog. */
  const [missDays, setMissDays] = useState<number | undefined>(7);
  const [preview, setPreview] = useState<CacheCommand | null>(null);
  const [queued, setQueued] = useState<CacheCommand | null>(null);
  /** What the pending confirmation would delete: the whole agent, or one sentence. */
  const [target, setTarget] = useState<{ kind: "agent" } | { kind: "entry"; cacheKey: string } | null>(null);

  const id = agent?.agent_id ?? null;
  const entries = useCacheEntries(id, q, entryPage);
  const misses = useCacheMisses(id, missPage, 50, missDays);
  const trend = useCacheTrend(id, 14);
  const variants = useCacheVariants(id, 7);
  const log = useFlushLog(id ?? undefined);
  const delEntry = useDeleteEntry();
  const flushAgent = useFlushAgent();
  const busy = delEntry.isPending || flushAgent.isPending;

  const reset = () => { setPreview(null); setQueued(null); setTarget(null); };

  const run = async (t: NonNullable<typeof target>, dryRun: boolean) => {
    const cmd = t.kind === "agent"
      ? await flushAgent.mutateAsync({ agentId: id!, dryRun })
      : await delEntry.mutateAsync({ cacheKey: t.cacheKey, dryRun });
    if (dryRun) { setTarget(t); setPreview(cmd); setQueued(null); }
    else { setQueued(cmd); setPreview(null); }
  };

  return (
    <Dialog open={!!agent} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent className="max-h-[88vh] max-w-5xl overflow-y-auto">
        <DialogHeader><DialogTitle>{agent?.agent_name ?? "Agent"} — speech cache</DialogTitle></DialogHeader>
        {agent && (
          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded border px-2 py-0.5 text-xs font-medium ${
                MODE_TONE[agent.speech_cache_mode ?? ""] ?? MODE_TONE.OFF
              }`}>
                {agent.speech_cache_mode ?? "mode unknown"}
              </span>
              <span className="text-muted-foreground">
                {agent.institute_name} · {agent.engine ?? DASH} · {agent.voice ?? DASH}
              </span>
              <span className="ml-auto text-xs text-muted-foreground">
                reported {ago(agent.reported_at)}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 rounded-md border p-3 sm:grid-cols-4">
              {[
                ["cached", num(agent.entries)],
                ["never hit", num(agent.never_hit_entries)],
                ["not rendered", num(agent.unrendered_entries)],
                ["on disk", bytes(agent.bytes)],
                ["hits / sightings", `${num(agent.hits)} / ${num(agent.sightings)}`],
                ["hit rate", pct(agent.hit_rate)],
                ["chars saved", num(agent.chars_saved)],
                ["saved", rupees(agent.inr_saved)],
              ].map(([k, v]) => (
                <div key={k}>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{k}</div>
                  <div className="font-medium">{v}</div>
                </div>
              ))}
            </div>

            <FlushPanel
              preview={preview}
              queued={queued}
              busy={busy}
              onCancel={reset}
              onConfirm={() => target && run(target, false)}
            />

            <Tabs defaultValue="trend">
              <TabsList>
                <TabsTrigger value="trend">Trend</TabsTrigger>
                <TabsTrigger value="cached">Cached ({num(agent.entries)})</TabsTrigger>
                <TabsTrigger value="missing">Not cached ({num(agent.unrendered_entries)})</TabsTrigger>
                <TabsTrigger value="variants">Variants ({variants.data?.length ?? 0})</TabsTrigger>
                <TabsTrigger value="log">Flush log</TabsTrigger>
              </TabsList>

              {/* ---- is it paying, day by day (a prompt edit shows as a dip) ---- */}
              <TabsContent value="trend" className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  From what each call measured, last 14 days (IST). <b>Char share</b> is the part of
                  the spoken audio served from cache — the money share. A dip right after a prompt
                  edit means the new lines are still being learned; saving the agent re-warms them.
                </p>
                {trend.isLoading ? (
                  <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Day</TableHead>
                        <TableHead className="text-right">Calls</TableHead>
                        <TableHead>Char share</TableHead>
                        <TableHead className="text-right">Sentence hit rate</TableHead>
                        <TableHead className="text-right">Saved</TableHead>
                        <TableHead className="text-right">Saved / call</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {trend.data?.map((d) => (
                        <TableRow key={d.day}>
                          <TableCell className="font-mono text-xs">{d.day}</TableCell>
                          <TableCell className="text-right">{num(d.calls)}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className="h-2 w-28 overflow-hidden rounded bg-muted">
                                <div className="h-full bg-emerald-500"
                                     style={{ width: `${Math.min(100, Math.max(0, d.char_share ?? 0))}%` }} />
                              </div>
                              <span className="text-xs">{pct(d.char_share)}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">{pct(d.hit_rate)}</TableCell>
                          <TableCell className="text-right">{rupees(d.inr_saved)}</TableCell>
                          <TableCell className="text-right">{rupees(d.inr_saved_per_call)}</TableCell>
                        </TableRow>
                      ))}
                      {trend.data?.length === 0 && (
                        <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                          No calls with measurements in the last 14 days.
                        </TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                )}
              </TabsContent>

              {/* ---- one line, several cache entries ---- */}
              <TabsContent value="variants" className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Lines said in several near-identical forms (a comma, "सर/मैम/जी") in the last 7 days.
                  Each form is cached separately, so pin ONE wording in the prompt. Small money
                  (~3% of speech on Shreya) — a clean-up list.
                </p>
                {variants.isLoading ? (
                  <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
                ) : variants.data?.length === 0 ? (
                  <p className="py-6 text-center text-muted-foreground">No split lines this week.</p>
                ) : (
                  variants.data?.map((g) => (
                    <div key={g.canonical} className="rounded-md border p-3">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="font-medium">{g.canonical}</span>
                        <span className="ml-auto text-xs text-muted-foreground">
                          {num(g.split_sightings)} of {num(g.total_sightings)} said in another form
                          {g.inr_lost != null ? ` · ${rupees(g.inr_lost)} not reused` : ""}
                        </span>
                      </div>
                      <ul className="mt-2 space-y-1">
                        {g.variants.map((v) => (
                          <li key={v.cache_key} className="flex items-baseline gap-2 text-xs">
                            <span className="w-10 shrink-0 text-right text-muted-foreground">{num(v.sightings)}×</span>
                            <span className="min-w-0 flex-1 truncate" title={v.sentence ?? ""}>{v.sentence}</span>
                            <span className="shrink-0 text-muted-foreground">{v.rendered ? "cached" : "not cached"}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))
                )}
              </TabsContent>

              {/* ---- what this agent has audio for ---- */}
              <TabsContent value="cached" className="space-y-3">
                <div className="flex items-center gap-2">
                  <Input
                    className="w-72"
                    placeholder="Search the sentence…"
                    value={q}
                    onChange={(e) => { setEntryPage(0); setQ(e.target.value); }}
                  />
                  <span className="text-xs text-muted-foreground">
                    Sorted by hits, then length — most valuable first.
                  </span>
                </div>

                {entries.isLoading ? (
                  <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
                ) : (
                  <>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Sentence</TableHead>
                          <TableHead>Kind</TableHead>
                          <TableHead className="text-right">Chars</TableHead>
                          <TableHead className="text-right">Hits</TableHead>
                          <TableHead className="text-right">Seen</TableHead>
                          <TableHead className="text-right">Size</TableHead>
                          <TableHead>Last hit</TableHead>
                          <TableHead />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {entries.data?.content.map((e) => (
                          <TableRow key={e.cache_key}>
                            <TableCell className="max-w-[26rem]">
                              <div className="truncate" title={e.sentence ?? ""}>{e.sentence ?? DASH}</div>
                              <div className="font-mono text-[10px] text-muted-foreground">
                                {e.cache_key.slice(0, 12)}
                              </div>
                            </TableCell>
                            <TableCell><KindChip isFixed={e.is_fixed} /></TableCell>
                            <TableCell className="text-right">{num(e.chars)}</TableCell>
                            <TableCell className={`text-right ${e.hits === 0 ? "text-amber-600" : ""}`}>
                              {num(e.hits)}
                            </TableCell>
                            <TableCell className="text-right">{num(e.sightings)}</TableCell>
                            <TableCell className="text-right text-xs">{bytes(e.bytes)}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{ago(e.last_hit_at)}</TableCell>
                            <TableCell className="text-right">
                              <Button
                                size="sm" variant="outline" disabled={busy}
                                onClick={() => run({ kind: "entry", cacheKey: e.cache_key }, true)}
                              >
                                Delete
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                        {entries.data?.content.length === 0 && (
                          <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                            {q ? "No cached sentence matches that." : "This agent has no cached audio yet."}
                          </TableCell></TableRow>
                        )}
                      </TableBody>
                    </Table>
                    <Pager
                      page={entries.data?.page ?? 0}
                      size={entries.data?.page_size ?? 50}
                      total={entries.data?.total_elements ?? 0}
                      onPage={setEntryPage}
                    />
                  </>
                )}
                <p className="text-xs text-muted-foreground">
                  Listening back lands when the audio route ships — the field is populated, the endpoint isn't built.
                </p>
              </TabsContent>

              {/* ---- what it is re-synthesising every time ---- */}
              <TabsContent value="missing" className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs text-muted-foreground">
                    Sorted by what it is costing you — sightings against length — rather than by count.
                  </p>
                  <div className="ml-auto flex gap-1">
                    <Button size="sm" variant={missDays === 7 ? "default" : "outline"}
                            onClick={() => { setMissDays(7); setMissPage(0); }}>Last 7 days</Button>
                    <Button size="sm" variant={missDays === undefined ? "default" : "outline"}
                            onClick={() => { setMissDays(undefined); setMissPage(0); }}>All time</Button>
                  </div>
                </div>
                {misses.isLoading ? (
                  <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
                ) : (
                  <>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Sentence</TableHead>
                          <TableHead>Kind</TableHead>
                          <TableHead className="text-right">Chars</TableHead>
                          <TableHead className="text-right">Seen</TableHead>
                          <TableHead>Why it isn't cached</TableHead>
                          <TableHead className="text-right">Wasted</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {misses.data?.content.map((m) => (
                          <TableRow key={m.cache_key}>
                            <TableCell className="max-w-[22rem]">
                              <div className="truncate" title={m.sentence ?? ""}>{m.sentence ?? DASH}</div>
                            </TableCell>
                            <TableCell><KindChip isFixed={m.is_fixed} /></TableCell>
                            <TableCell className="text-right">{num(m.chars)}</TableCell>
                            <TableCell className="text-right">{num(m.sightings)}</TableCell>
                            <TableCell className="max-w-[24rem] text-xs text-muted-foreground">
                              {m.reason ?? DASH}
                            </TableCell>
                            <TableCell className="text-right">{rupees(m.inr_wasted)}</TableCell>
                          </TableRow>
                        ))}
                        {misses.data?.content.length === 0 && (
                          <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                            Nothing is being re-synthesised for this agent.
                          </TableCell></TableRow>
                        )}
                      </TableBody>
                    </Table>
                    <Pager
                      page={misses.data?.page ?? 0}
                      size={misses.data?.page_size ?? 50}
                      total={misses.data?.total_elements ?? 0}
                      onPage={setMissPage}
                    />
                  </>
                )}
              </TabsContent>

              {/* ---- what has been queued, and what it did ---- */}
              <TabsContent value="log" className="space-y-3">
                {log.data?.length === 0 && (
                  <p className="py-6 text-center text-muted-foreground">Nothing has been flushed for this agent.</p>
                )}
                {log.data?.map((c) => (
                  <div key={c.command_id} className="rounded-md border p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded border px-2 py-0.5 text-[11px] font-medium ${
                        STATUS_TONE[c.status] ?? "border-muted-foreground/30 text-muted-foreground"
                      }`}>
                        {c.status}
                      </span>
                      <span className="font-mono text-xs">{c.kind}</span>
                      {c.dry_run && (
                        <span className="rounded border border-muted-foreground/30 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          rehearsal
                        </span>
                      )}
                      <span className="ml-auto text-xs text-muted-foreground">{stamp(c.created_at)}</span>
                    </div>
                    <div className="mt-1 text-sm">{c.result ?? "Waiting on the bot to report back."}</div>
                    {(c.entries_removed != null || c.bytes_removed != null) && (
                      <div className="mt-1 text-xs text-muted-foreground">
                        {num(c.entries_removed)} entries · {bytes(c.bytes_removed)} freed
                        {c.finished_at ? ` · finished ${ago(c.finished_at)}` : ""}
                      </div>
                    )}
                  </div>
                ))}
              </TabsContent>
            </Tabs>

            <div className="flex items-center justify-between border-t pt-3">
              <p className="text-xs text-muted-foreground">
                Flushing drops everything this agent contributed. Shared audio stays.
              </p>
              <Button
                variant="destructive" size="sm" disabled={busy}
                onClick={() => run({ kind: "agent" }, true)}
              >
                Flush this agent
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
