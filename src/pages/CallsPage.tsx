import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useCalls, useCallSummary, useCallRateCard, type CallRow, type CallFilters }
  from "@/services/calls-api";
import CallDiagnosticsPanel from "@/components/calls/CallDiagnosticsPanel";
import { useInstitutes } from "@/services/institutes-api";

const rupees = (n: number | null | undefined) =>
  n == null ? "—" : `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const mmss = (s: number | null | undefined) =>
  s == null ? "—" : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
/** Some numbers arrive wrapped in bidi marks, which break copy-paste and alignment. */
const phone = (p: string | null | undefined) =>
  p == null ? "—"
    : Array.from(p)
      .filter((ch) => {
        const c = ch.codePointAt(0) ?? 0;
        return !(c === 0x200e || c === 0x200f || (c >= 0x202a && c <= 0x202e) || (c >= 0x2066 && c <= 0x2069));
      })
      .join("")
      .trim();

function HealthChip({ health }: { health: string | null }) {
  if (!health) return <span className="text-muted-foreground">—</span>;
  const tone =
    health === "RED" ? "bg-red-100 text-red-700"
      : health === "AMBER" ? "bg-amber-100 text-amber-700"
        : "bg-emerald-100 text-emerald-700";
  return <span className={`rounded px-2 py-0.5 text-xs font-medium ${tone}`}>{health}</span>;
}

/** ISO day string N days ago — the filter default. */
function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export default function CallsPage() {
  const [filters, setFilters] = useState<CallFilters>({ from: daysAgo(7) });
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<CallRow | null>(null);

  const calls = useCalls(filters, page);
  const summary = useCallSummary(filters);
  const rateCard = useCallRateCard();
  const institutes = useInstitutes(0, 200, "");

  const instituteOptions = useMemo(
    () => (institutes.data?.content ?? []) as Array<{ id: string; name?: string; institute_name?: string }>,
    [institutes.data]
  );

  const set = (patch: Partial<CallFilters>) => {
    setPage(0);
    setFilters((f) => ({ ...f, ...patch }));
  };

  const s = summary.data;

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Calls</h1>
          <p className="text-sm text-muted-foreground">
            Every AI call, with what it cost and what it earned.
          </p>
        </div>
        {s?.cost_is_modelled && (
          <Badge variant="outline" className="text-amber-700 border-amber-300">
            cost modelled · billing reconstructed
          </Badge>
        )}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-6">
          <div className="space-y-1">
            <Label className="text-xs">From</Label>
            <Input type="date" value={filters.from ?? ""} className="w-40"
              onChange={(e) => set({ from: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">To</Label>
            <Input type="date" value={filters.to ?? ""} className="w-40"
              onChange={(e) => set({ to: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Institute</Label>
            <select
              className="h-9 w-56 rounded-md border bg-background px-2 text-sm"
              value={filters.instituteId ?? ""}
              onChange={(e) => set({ instituteId: e.target.value })}
            >
              <option value="">All institutes</option>
              {instituteOptions.map((i) => (
                <option key={i.id} value={i.id}>{i.name ?? i.institute_name ?? i.id}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Health</Label>
            <select
              className="h-9 w-32 rounded-md border bg-background px-2 text-sm"
              value={filters.health ?? ""}
              onChange={(e) => set({ health: e.target.value })}
            >
              <option value="">Any</option>
              <option value="RED">RED</option>
              <option value="AMBER">AMBER</option>
              <option value="GREEN">GREEN</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Disposition</Label>
            <Input className="w-48" placeholder="e.g. Quiz_Link_Sent"
              value={filters.disposition ?? ""}
              onChange={(e) => set({ disposition: e.target.value })} />
          </div>
          <Button variant="ghost" onClick={() => { setPage(0); setFilters({ from: daysAgo(7) }); }}>
            Reset
          </Button>
        </CardContent>
      </Card>

      {/* Totals for whatever is filtered */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        {[
          ["Calls", s ? s.calls.toLocaleString("en-IN") : "—"],
          ["Minutes", s ? Math.round(s.minutes).toLocaleString("en-IN") : "—"],
          ["Cost", rupees(s?.cost_inr)],
          ["Billed", rupees(s?.billed_inr)],
          ["Margin", s ? `${rupees(s.margin_inr)}${s.margin_pct != null ? ` (${s.margin_pct}%)` : ""}` : "—"],
          ["Red / Amber", s ? `${s.red} / ${s.amber}` : "—"],
        ].map(([label, value]) => (
          <Card key={label as string}>
            <CardHeader className="pb-1"><CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle></CardHeader>
            <CardContent className="pt-0 text-xl font-semibold">{value}</CardContent>
          </Card>
        ))}
      </div>

      {/* Where the money goes */}
      {s?.cost_breakdown && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Cost breakdown</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-6 text-sm">
            {Object.entries(s.cost_breakdown).map(([k, v]) => (
              <div key={k}>
                <div className="text-xs uppercase text-muted-foreground">{k}</div>
                <div className="font-medium">
                  {rupees(v)}
                  {s.cost_inr > 0 && (
                    <span className="ml-1 text-xs text-muted-foreground">
                      {Math.round((v / s.cost_inr) * 100)}%
                    </span>
                  )}
                </div>
              </div>
            ))}
            {rateCard.data && (
              <div className="ml-auto text-xs text-muted-foreground">
                rates ₹/min:{" "}
                {Object.entries(rateCard.data)
                  .map(([k, v]) => `${k} ${v}`)
                  .join(" · ")}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* The calls */}
      <Card>
        <CardContent className="pt-6">
          {calls.isLoading ? (
            <div className="space-y-2">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Institute</TableHead>
                  <TableHead>Who</TableHead>
                  <TableHead>Agent / voice</TableHead>
                  <TableHead>Dur</TableHead>
                  <TableHead>Disposition</TableHead>
                  <TableHead>Health</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">Billed</TableHead>
                  <TableHead className="text-right">Margin</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {calls.data?.content.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="whitespace-nowrap text-xs">
                      {c.call_start ? new Date(c.call_start).toLocaleString("en-IN") : "—"}
                    </TableCell>
                    <TableCell className="max-w-[10rem] truncate">
                      <div>{c.institute_name ?? "—"}</div>
                      <div className="font-mono text-[10px] text-muted-foreground" title={c.id}>
                        {c.id.slice(0, 8)}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[9rem] truncate text-xs">
                      <div>{c.customer_name ?? "—"}</div>
                      <div className="font-mono text-[10px] text-muted-foreground">
                        {c.direction === "INBOUND" ? "in" : "out"} · {phone(c.phone_number)}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">
                      <div>{c.agent_name ?? "—"}</div>
                      <div className="text-muted-foreground">
                        {c.tts_model ?? "—"} · {c.voice ?? "—"}
                      </div>
                    </TableCell>
                    <TableCell>{mmss(c.duration_seconds)}</TableCell>
                    <TableCell className="max-w-[10rem] truncate text-xs">{c.disposition ?? "—"}</TableCell>
                    <TableCell>
                      <HealthChip health={c.health} />
                      {c.faults && c.faults.length > 0 && (
                        <div className="mt-0.5 font-mono text-[10px] text-muted-foreground"
                          title={c.faults.join(", ")}>
                          {c.faults[0]}{c.faults.length > 1 ? ` +${c.faults.length - 1}` : ""}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right">{rupees(c.cost_inr)}</TableCell>
                    <TableCell className="text-right">{rupees(c.billed_inr)}</TableCell>
                    <TableCell className={`text-right ${(c.margin_inr ?? 0) < 0 ? "text-red-600" : ""}`}>
                      {rupees(c.margin_inr)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => setOpen(c)}>Health</Button>
                    </TableCell>
                  </TableRow>
                ))}
                {calls.data?.content.length === 0 && (
                  <TableRow><TableCell colSpan={11} className="py-8 text-center text-muted-foreground">
                    No calls match these filters.
                  </TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          )}

          <div className="mt-4 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {calls.data ? `${calls.data.total_elements.toLocaleString("en-IN")} calls` : ""}
            </span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}>Previous</Button>
              <Button size="sm" variant="outline"
                disabled={!calls.data || page + 1 >= calls.data.total_pages}
                onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Health + recording for one call */}
      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader><DialogTitle>Call health</DialogTitle></DialogHeader>
          {open && (
            <div className="space-y-4 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <HealthChip health={open.health} />
                <span className="text-muted-foreground">
                  {open.institute_name} · {open.agent_name} · {open.tts_model} · {mmss(open.duration_seconds)}
                </span>
              </div>
              <div className="text-muted-foreground">
                {open.direction === "INBOUND" ? "Inbound from" : "Outbound to"}{" "}
                <b className="text-foreground">{open.customer_name ?? "unknown caller"}</b>{" "}
                <span className="font-mono">{phone(open.phone_number)}</span>
                {open.disposition ? <> · ended as <b className="text-foreground">{open.disposition}</b></> : null}
                {open.call_start ? ` · ${new Date(open.call_start).toLocaleString("en-IN")}` : ""}
              </div>
              <div className="flex flex-wrap gap-4 rounded-md border bg-muted/40 p-2 font-mono text-xs">
                <span title="click to copy" className="cursor-pointer"
                  onClick={() => navigator.clipboard?.writeText(open.id)}>
                  call <b>{open.id}</b>
                </span>
                {open.provider_call_id && (
                  <span title="click to copy" className="cursor-pointer"
                    onClick={() => navigator.clipboard?.writeText(open.provider_call_id!)}>
                    provider <b>{open.provider_call_id}</b>
                  </span>
                )}
                {open.correlation_id && (
                  <span title="click to copy" className="cursor-pointer"
                    onClick={() => navigator.clipboard?.writeText(open.correlation_id!)}>
                    corr <b>{open.correlation_id}</b>
                  </span>
                )}
              </div>

              {open.has_recording && open.recording_url ? (
                <audio controls src={open.recording_url} className="w-full" />
              ) : (
                <p className="text-muted-foreground">No recording stored for this call.</p>
              )}

              <div className="rounded-md border p-3">
                <div className="mb-2 text-xs font-medium uppercase text-muted-foreground">
                  Cost — modelled from the rate card, not metered
                </div>
                <div className="flex flex-wrap gap-5">
                  {Object.entries(open.cost_breakdown ?? {}).map(([k, v]) => (
                    <div key={k}>
                      <div className="text-xs uppercase text-muted-foreground">{k}</div>
                      <div className="font-medium">{rupees(v)}</div>
                    </div>
                  ))}
                  <div className="ml-auto">
                    <div className="text-xs uppercase text-muted-foreground">margin</div>
                    <div className="font-medium">
                      {rupees(open.margin_inr)}
                      {open.margin_pct != null && (
                        <span className="ml-1 text-xs text-muted-foreground">{open.margin_pct}%</span>
                      )}
                    </div>
                  </div>
                </div>
                {(open.tts_cache_hits != null || open.tts_cache_misses != null) && (
                  <div className="mt-3 border-t pt-2 text-xs text-muted-foreground">
                    TTS cache: {open.tts_cache_hits ?? 0} hit
                    {(open.tts_cache_hits ?? 0) === 1 ? "" : "s"} / {open.tts_cache_misses ?? 0} miss
                    {(open.tts_cache_misses ?? 0) === 1 ? "" : "es"}
                    {open.tts_cache_chars_saved ? ` · ${open.tts_cache_chars_saved} chars not re-synthesised` : ""}
                    {open.tts_cache_saved_inr ? ` · saved ${rupees(open.tts_cache_saved_inr)}` : ""}
                  </div>
                )}
              </div>

              <CallDiagnosticsPanel raw={open.diagnostics} />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
