import { useMemo, useState } from "react";
import {
  Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useCacheAgents, useCacheSummary, type CacheAgent } from "@/services/tts-cache-api";
import { useInstitutes } from "@/services/institutes-api";
import CacheAgentDialog from "./CacheAgentDialog";
import { DASH, MODE_TONE, ago, bytes, num, pct, rupees, seconds } from "./format";

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export default function CacheAnalyticsTab() {
  const [instituteId, setInstituteId] = useState("");
  const [from, setFrom] = useState(daysAgo(7));
  const [to, setTo] = useState("");
  const [openAgent, setOpenAgent] = useState<CacheAgent | null>(null);

  const agents = useCacheAgents(instituteId || undefined);
  const summary = useCacheSummary({ instituteId: instituteId || undefined, from, to: to || undefined });
  const institutes = useInstitutes(0, 200, "");

  const instituteOptions = useMemo(
    () => (institutes.data?.content ?? []) as Array<{ id: string; name?: string; institute_name?: string }>,
    [institutes.data]
  );

  const s = summary.data;
  const rows = agents.data ?? [];
  /** The mirror is only as fresh as the newest agent report. */
  const freshest = rows.reduce<string | null>(
    (best, a) => (a.reported_at && (!best || a.reported_at > best) ? a.reported_at : best), null
  );
  const series = s?.series ?? [];

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-6">
          <div className="space-y-1">
            <Label className="text-xs">From</Label>
            <Input type="date" className="w-40" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">To</Label>
            <Input type="date" className="w-40" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Institute</Label>
            <select
              className="h-9 w-56 rounded-md border bg-background px-2 text-sm"
              value={instituteId}
              onChange={(e) => setInstituteId(e.target.value)}
            >
              <option value="">All institutes</option>
              {instituteOptions.map((i) => (
                <option key={i.id} value={i.id}>{i.name ?? i.institute_name ?? i.id}</option>
              ))}
            </select>
          </div>
          <Button variant="ghost" onClick={() => { setInstituteId(""); setFrom(daysAgo(7)); setTo(""); }}>
            Reset
          </Button>
          <span className="ml-auto text-xs text-muted-foreground">
            Agent figures mirror the bot's ledger, pushed every couple of minutes
            {freshest ? ` · newest report ${ago(freshest)}` : ""}
          </span>
        </CardContent>
      </Card>

      {/* Totals over the filtered window — these come from the calls themselves, not the mirror */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {[
          ["Calls measured", s ? `${num(s.measured_calls)} of ${num((s.measured_calls ?? 0) + (s.unmeasured_calls ?? 0))}` : DASH],
          ["Hit rate", pct(s?.hit_rate)],
          ["Hits / misses", s ? `${num(s.hits)} / ${num(s.misses)}` : DASH],
          ["Chars saved", num(s?.chars_saved)],
          ["Speech saved", seconds(s?.secs_saved)],
          ["Saved", rupees(s?.inr_saved)],
        ].map(([label, value]) => (
          <Card key={label}>
            <CardHeader className="pb-1">
              <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 text-xl font-semibold">{value}</CardContent>
          </Card>
        ))}
      </div>

      {s && (s.unmeasured_calls ?? 0) > 0 && (
        <p className="text-xs text-muted-foreground">
          {num(s.unmeasured_calls)} calls in this window ran with no cache measurement at all — coverage,
          not performance. An agent whose mode is OFF never reports.
        </p>
      )}

      {/* Monitoring */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Hit rate by day</CardTitle>
        </CardHeader>
        <CardContent>
          {summary.isLoading ? (
            <Skeleton className="h-56 w-full" />
          ) : series.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={240}>
                <ComposedChart data={series}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 11 }} unit="%" />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                  <Bar yAxisId="right" dataKey="hits" name="Hits" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
                  <Line yAxisId="left" type="monotone" dataKey="hit_rate" name="Hit rate %"
                    stroke="hsl(var(--chart-1))" strokeWidth={2} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
              <p className="mt-2 text-xs text-muted-foreground">
                Days when nothing measured the cache are left out rather than drawn at zero — a day nobody
                had it switched on is not a day it performed badly.
              </p>
            </>
          ) : (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No measured calls in this window.
            </p>
          )}
        </CardContent>
      </Card>

      {/* The agents */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Agents</CardTitle>
        </CardHeader>
        <CardContent>
          {agents.isLoading ? (
            <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agent</TableHead>
                  <TableHead>Institute</TableHead>
                  <TableHead>Engine / voice</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead className="text-right">Cached</TableHead>
                  <TableHead className="text-right">Never hit</TableHead>
                  <TableHead className="text-right">Not rendered</TableHead>
                  <TableHead className="text-right">On disk</TableHead>
                  <TableHead className="text-right">Hit rate</TableHead>
                  <TableHead className="text-right">Chars saved</TableHead>
                  <TableHead className="text-right">Saved</TableHead>
                  <TableHead>Last hit</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((a) => (
                  <TableRow key={a.agent_id}>
                    <TableCell className="max-w-[10rem] truncate">
                      <div>{a.agent_name ?? DASH}</div>
                      <div className="font-mono text-[10px] text-muted-foreground" title={a.agent_id}>
                        {a.agent_id.slice(0, 8)}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[10rem] truncate text-xs">{a.institute_name ?? DASH}</TableCell>
                    <TableCell className="text-xs">
                      <div>{a.engine ?? DASH}</div>
                      <div className="text-muted-foreground">{a.voice ?? DASH}</div>
                    </TableCell>
                    <TableCell>
                      <span className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${
                        MODE_TONE[a.speech_cache_mode ?? ""] ?? MODE_TONE.OFF
                      }`}>
                        {a.speech_cache_mode ?? DASH}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">{num(a.entries)}</TableCell>
                    <TableCell className={`text-right ${(a.never_hit_entries ?? 0) > 0 ? "text-amber-600" : ""}`}>
                      {num(a.never_hit_entries)}
                    </TableCell>
                    <TableCell className="text-right">{num(a.unrendered_entries)}</TableCell>
                    <TableCell className="text-right text-xs">{bytes(a.bytes)}</TableCell>
                    <TableCell className="text-right" title={`${num(a.hits)} hits of ${num(a.sightings)} sightings`}>
                      {pct(a.hit_rate)}
                    </TableCell>
                    <TableCell className="text-right">{num(a.chars_saved)}</TableCell>
                    <TableCell className="text-right">{rupees(a.inr_saved)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{ago(a.last_hit_at)}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => setOpenAgent(a)}>Sentences</Button>
                    </TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && (
                  <TableRow><TableCell colSpan={13} className="py-10 text-center text-muted-foreground">
                    No agent has reported a cache yet. These figures come from the bot's own ledger, which
                    only the newer bot build pushes — the totals above read the calls directly and work today.
                  </TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <CacheAgentDialog agent={openAgent} onClose={() => setOpenAgent(null)} />
    </div>
  );
}
