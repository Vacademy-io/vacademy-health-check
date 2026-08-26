import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useQueueSnapshot, type QueueBox } from "@/services/ai-queue-api";
import { useInstitutes } from "@/services/institutes-api";
import { DASH, ago, eta, num, phone, seconds, stamp } from "./format";

const LIMITS = [25, 50, 100, 200];

/** In flight against what the fleet is allowed to run at once. */
function FleetBar({ label, inFlight, capacity }: {
  label: string; inFlight: number | null | undefined; capacity: number | null | undefined;
}) {
  const cap = capacity ?? 0;
  const busy = inFlight ?? 0;
  const usedPct = cap > 0 ? Math.min(100, (busy / cap) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums text-muted-foreground">
          {num(inFlight)} of {num(capacity)} running
        </span>
      </div>
      <Progress value={usedPct} className={usedPct >= 100 ? "[&>div]:bg-amber-500" : ""} />
      <div className="text-xs text-muted-foreground">
        {cap === 0 ? "no capacity configured"
          : busy >= cap ? "full — new calls wait for a slot"
            : `${cap - busy} slot${cap - busy === 1 ? "" : "s"} free`}
      </div>
    </div>
  );
}

function BoxRow({ box }: { box: QueueBox }) {
  const unconfigured = box.baseUrl === "CONFIGURE_ME" || !box.baseUrl;
  const health = box.healthStatus ?? "UNKNOWN";
  const tone = health === "HEALTHY" ? "border-emerald-300 bg-emerald-50 text-emerald-700"
    : health === "UNHEALTHY" ? "border-red-300 bg-red-50 text-red-700"
      : "border-muted-foreground/30 text-muted-foreground";
  return (
    <TableRow>
      <TableCell className="font-mono text-xs">{box.slug ?? DASH}</TableCell>
      <TableCell>
        <span className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${tone}`}>{health}</span>
      </TableCell>
      <TableCell className="text-xs">{box.enabled ? "enabled" : "disabled"}</TableCell>
      <TableCell className="text-right">{num(box.activeCalls)}</TableCell>
      <TableCell className="text-right">{num(box.maxConcurrent)}</TableCell>
      <TableCell className="text-xs">
        {box.countsTowardCapacity ? "counts" : <span className="text-muted-foreground">excluded</span>}
      </TableCell>
      <TableCell className="max-w-[16rem] truncate text-xs">
        {unconfigured
          ? <span className="text-red-600">not configured</span>
          : <span className="text-muted-foreground" title={box.baseUrl ?? ""}>{box.baseUrl}</span>}
      </TableCell>
    </TableRow>
  );
}

export default function CallQueueTab() {
  const [limit, setLimit] = useState(50);
  const [instituteId, setInstituteId] = useState("");

  const snap = useQueueSnapshot(limit, instituteId || undefined);
  const institutes = useInstitutes(0, 200, "");
  const instituteOptions = useMemo(
    () => (institutes.data?.content ?? []) as Array<{ id: string; name?: string; institute_name?: string }>,
    [institutes.data]
  );

  const d = snap.data;
  const cap = d?.capacity;
  const lanes = d?.lanes ?? [];
  const waiting = d?.waiting ?? [];
  const boxes = cap?.boxes ?? [];
  const statuses = Object.entries(d?.totalsByStatus ?? {});

  return (
    <div className="space-y-4">
      {/* Controls */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-6">
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
          <div className="space-y-1">
            <Label className="text-xs">Show</Label>
            <select
              className="h-9 w-28 rounded-md border bg-background px-2 text-sm"
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
            >
              {LIMITS.map((l) => <option key={l} value={l}>{l} waiting</option>)}
            </select>
          </div>
          <Button variant="ghost" onClick={() => { setInstituteId(""); setLimit(50); }}>Reset</Button>
          <div className="ml-auto text-right text-xs text-muted-foreground">
            <div>Refreshes every 10 seconds{snap.isFetching ? " · updating…" : ""}</div>
            <div>Snapshot taken {ago(d?.generatedAt)}</div>
          </div>
        </CardContent>
      </Card>

      {instituteId && (
        <p className="text-xs text-muted-foreground">
          The institute filter narrows the waiting list only — capacity and lanes below stay fleet-wide.
        </p>
      )}

      {cap?.capacityEnabled === false && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          <span className="font-medium">Capacity limits are switched off.</span> Nothing is throttling
          the queue — calls go out as fast as the boxes take them, and the estimates below assume a
          ceiling that is not being applied.
        </div>
      )}

      {snap.isLoading ? (
        <div className="space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
      ) : (
        <>
          {/* What the fleet is doing right now */}
          <div className="grid gap-3 md:grid-cols-2">
            <Card>
              <CardContent className="space-y-4 pt-6">
                <FleetBar label="Vacademy AI" inFlight={cap?.vacademyAiInFlight} capacity={cap?.vacademyAiCapacity} />
                <FleetBar label="Aavtaar" inFlight={cap?.aavtaarInFlight} capacity={cap?.aavtaarCapacity} />
              </CardContent>
            </Card>
            <div className="grid grid-cols-2 gap-3">
              {[
                ["Queued", num(cap?.totalQueued)],
                ["Lanes with work", num(cap?.lanesWithWork)],
                ["Typical call", seconds(cap?.avgCallSeconds)],
                ["Per-lane limit", num(cap?.dynamicLaneCapacity)],
                ["Held for live calls", num(cap?.reservedInteractiveSlots)],
                ["Waiting listed", `${num(waiting.length)} of ${num(d?.waitingTotal)}`],
              ].map(([label, value]) => (
                <Card key={label}>
                  <CardHeader className="pb-1">
                    <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0 text-xl font-semibold">{value}</CardContent>
                </Card>
              ))}
            </div>
          </div>

          {statuses.length > 0 && (
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
              <span className="text-muted-foreground">In the pipe:</span>
              {statuses.map(([k, v]) => (
                <span key={k}><b>{num(v)}</b> <span className="text-muted-foreground">{k.toLowerCase()}</span></span>
              ))}
            </div>
          )}

          {/* Next out, and how long the wait is */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Waiting to dial</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Institute</TableHead>
                    <TableHead>Agent</TableHead>
                    <TableHead>Number</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ahead in lane</TableHead>
                    <TableHead className="text-right">Starts in</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {waiting.map((w, i) => (
                    <TableRow key={w.id}>
                      <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="max-w-[12rem] truncate">{w.instituteName ?? DASH}</TableCell>
                      <TableCell className="text-xs">{w.agentName ?? DASH}</TableCell>
                      <TableCell className="font-mono text-xs">{phone(w.phoneNumber)}</TableCell>
                      <TableCell className="text-xs">{w.source ?? DASH}</TableCell>
                      <TableCell className="text-xs">
                        {w.callStatus ?? w.status ?? DASH}
                        {w.live && (
                          <span className="ml-1 rounded border border-emerald-300 bg-emerald-50 px-1 py-0.5 text-[10px] text-emerald-700">
                            live
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">{num(w.aheadInLane)}</TableCell>
                      <TableCell className="text-right">{eta(w.etaMinutes)}</TableCell>
                    </TableRow>
                  ))}
                  {waiting.length === 0 && (
                    <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                      Nothing is waiting — every queued call has gone out.
                    </TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
              {(d?.waitingTotal ?? 0) > waiting.length && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Showing the first {waiting.length} of {num(d?.waitingTotal)}. Raise the limit to see further down.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Per institute */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Lanes</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Institute</TableHead>
                    <TableHead className="text-right">Queued</TableHead>
                    <TableHead className="text-right">In flight</TableHead>
                    <TableHead className="text-right">Limit</TableHead>
                    <TableHead className="text-right">Drains in</TableHead>
                    <TableHead>Oldest wait</TableHead>
                    <TableHead>State</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lanes.map((l, i) => (
                    <TableRow key={l.instituteId ?? l.instituteName ?? i}>
                      <TableCell className="max-w-[14rem] truncate">{l.instituteName ?? DASH}</TableCell>
                      <TableCell className="text-right">{num(l.queued)}</TableCell>
                      <TableCell className="text-right">{num(l.inFlight)}</TableCell>
                      <TableCell className="text-right" title={l.maxConcurrent == null ? "inherited from the fleet" : "set on this lane"}>
                        {num(l.effectiveMaxConcurrent)}
                        {l.maxConcurrent == null && <span className="ml-1 text-[10px] text-muted-foreground">auto</span>}
                      </TableCell>
                      <TableCell className="text-right">{eta(l.etaMinutes)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {l.oldestQueuedAt ? ago(l.oldestQueuedAt) : DASH}
                      </TableCell>
                      <TableCell>
                        {l.paused ? (
                          <span className="rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-700">
                            paused
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">running</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {lanes.length === 0 && (
                    <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                      No lane has work.
                    </TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* The boxes doing the dialling */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Boxes</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Slug</TableHead>
                    <TableHead>Health</TableHead>
                    <TableHead>State</TableHead>
                    <TableHead className="text-right">Active</TableHead>
                    <TableHead className="text-right">Max</TableHead>
                    <TableHead>Capacity</TableHead>
                    <TableHead>Address</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {boxes.map((b) => <BoxRow key={b.slug ?? "box"} box={b} />)}
                  {boxes.length === 0 && (
                    <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                      No box is registered.
                    </TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <p className="text-xs text-muted-foreground">
            Snapshot generated {stamp(d?.generatedAt)}.
          </p>
        </>
      )}
    </div>
  );
}
