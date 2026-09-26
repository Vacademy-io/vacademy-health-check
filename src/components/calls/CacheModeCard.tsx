import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  useAgentModes, useSetAgentMode, type SpeechCacheMode,
} from "@/services/tts-cache-api";
import { DASH, MODE_TONE, ago } from "./format";

const OPTIONS: Array<{ value: SpeechCacheMode; label: string; hint: string }> = [
  { value: "OFF", label: "Off", hint: "Every sentence synthesised live." },
  { value: "FIXED", label: "Fixed lines", hint: "Opening, nudges and other bot-authored lines from cache. The stable default." },
  { value: "FULL", label: "Full (beta)", hint: "Also the LLM's sentences that repeat across calls. Cheapest; newest." },
];

const FULL_WARNING =
  "Switch this agent to FULL speech caching?\n\n" +
  "Sentences the LLM repeats across calls will play from cache, mixed with live ones in the " +
  "same reply. It is the newest tier — listen to a test call before leaving it on for a batch.\n\n" +
  "Takes effect on the agent's next call.";

/**
 * The speech-cache tier per agent. Until this existed the only way to change it
 * was SQL on the primary. The bot reads the tier when a call starts, so a change
 * applies from the next call — no deploy, no restart.
 */
export default function CacheModeCard({ instituteId }: { instituteId?: string }) {
  const modes = useAgentModes(instituteId);
  const setMode = useSetAgentMode();
  const [error, setError] = useState<string | null>(null);
  const rows = modes.data ?? [];

  const change = (agentId: string, name: string | null, current: string, next: SpeechCacheMode) => {
    if (next === current) return;
    if (next === "FULL" && !window.confirm(FULL_WARNING)) return;
    setError(null);
    setMode.mutate(
      { agentId, mode: next },
      { onError: (e: unknown) => setError(`${name ?? agentId}: ${(e as Error)?.message ?? "could not save"}`) }
    );
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Caching level</CardTitle>
        <p className="text-xs text-muted-foreground">
          Per agent. Applies from the agent's next call.{" "}
          {OPTIONS.map((o) => `${o.label}: ${o.hint}`).join(" ")}
        </p>
      </CardHeader>
      <CardContent>
        {error && <p className="mb-2 text-xs text-destructive">{error}</p>}
        {modes.isLoading ? (
          <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agent</TableHead>
                <TableHead>Institute</TableHead>
                <TableHead>Voice engine</TableHead>
                <TableHead>Caching level</TableHead>
                <TableHead>Changed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((a) => {
                const current = (a.speech_cache_mode ?? "OFF").toUpperCase();
                const saving = setMode.isPending && setMode.variables?.agentId === a.agent_id;
                return (
                  <TableRow key={a.agent_id}>
                    <TableCell className="max-w-[12rem] truncate">
                      <div>{a.agent_name ?? DASH}</div>
                      <div className="font-mono text-[10px] text-muted-foreground" title={a.agent_id}>
                        {a.agent_id.slice(0, 8)}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[12rem] truncate text-xs">{a.institute_name ?? DASH}</TableCell>
                    <TableCell className="text-xs">
                      <div>{a.tts_model ?? DASH}</div>
                      <div className="text-muted-foreground">{a.voice ?? DASH}</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <select
                          aria-label={`Caching level for ${a.agent_name ?? a.agent_id}`}
                          className="h-8 rounded-md border bg-background px-2 text-sm"
                          value={current}
                          disabled={saving}
                          onChange={(e) => change(a.agent_id, a.agent_name, current, e.target.value as SpeechCacheMode)}
                        >
                          {OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                        <span className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${
                          MODE_TONE[current] ?? MODE_TONE.OFF
                        }`}>
                          {saving ? "saving…" : current}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{ago(a.updated_at)}</TableCell>
                  </TableRow>
                );
              })}
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  No AI agents{instituteId ? " for this institute" : ""}.
                </TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
