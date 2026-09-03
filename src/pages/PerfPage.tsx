import { useState } from "react";
import { AlertTriangle, CloudOff, Wifi } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  formatBound,
  percentileBound,
  useInstitutePerf,
  usePerfTimeline,
  useSlowRoutes,
  type InstitutePerfRow,
} from "@/services/perf-api";

/**
 * "Is it us, or is it their internet?" — per institute, from real user sessions.
 *
 * Every number here is a bucket BOUND ("≤ 250ms"), never an interpolated percentile.
 * The underlying store is a histogram, and inventing a precise-looking figure from it
 * would be a lie on the one page whose entire job is deciding who to blame.
 */

/** Above this, our own processing is the problem. Matches the admin portal's pill. */
const SERVER_SLOW_MS = 1500;
/** Above this, the user's connection is the problem. */
const NETWORK_SLOW_MS = 700;
/** Below this many samples, say nothing rather than guess. */
const MIN_SAMPLES = 20;

type Verdict = "healthy" | "server-slow" | "network-slow" | "insufficient";

function verdictFor(row: InstitutePerfRow): Verdict {
  const total = row.server.samples + row.network.samples;
  if (total < MIN_SAMPLES) return "insufficient";

  const serverP95 = percentileBound(row.server, 0.95);
  const networkP95 = percentileBound(row.network, 0.95);

  const serverBad = serverP95 !== null && serverP95 > SERVER_SLOW_MS;
  const networkBad = networkP95 !== null && networkP95 > NETWORK_SLOW_MS;

  // Ours first when both look bad — the same rule the user-facing pill follows.
  // Reporting "their connection" during our own degradation is the failure mode
  // that matters, because it sends support down the wrong path.
  if (serverBad) return "server-slow";
  if (networkBad) return "network-slow";
  return "healthy";
}

const VERDICT_LABEL: Record<Verdict, string> = {
  healthy: "Healthy",
  "server-slow": "We are slow",
  "network-slow": "Their connection",
  insufficient: "Not enough data",
};

const VERDICT_CLASS: Record<Verdict, string> = {
  healthy: "bg-emerald-100 text-emerald-800",
  "server-slow": "bg-red-100 text-red-800",
  "network-slow": "bg-amber-100 text-amber-800",
  insufficient: "bg-muted text-muted-foreground",
};

const RANGES = [
  { value: "1", label: "Last hour" },
  { value: "6", label: "Last 6 hours" },
  { value: "24", label: "Last 24 hours" },
  { value: "168", label: "Last 7 days" },
];

export default function PerfPage() {
  const [hours, setHours] = useState("24");
  const h = Number(hours);

  const institutes = useInstitutePerf(h);
  const timeline = usePerfTimeline(h);
  const routes = useSlowRoutes(h);

  const rows = institutes.data ?? [];
  const anyError = institutes.error || timeline.error || routes.error;

  const worst = rows.filter((r) => verdictFor(r) === "server-slow").length;
  const struggling = rows.filter((r) => verdictFor(r) === "network-slow").length;
  const totalSamples = rows.reduce((s, r) => s + r.server.samples + r.network.samples, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          title="Experienced Performance"
          description="What admin users actually felt, split into our server time and their network — read from the prod DB standby"
        />
        <div className="flex items-center gap-2 pt-1">
          <Label className="text-sm text-muted-foreground">Window</Label>
          <Select value={hours} onValueChange={setHours}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RANGES.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {anyError ? (
        <Card>
          <CardContent className="flex items-start gap-3 py-6 text-sm">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div>
              <p className="font-medium">Could not read performance data.</p>
              <p className="text-muted-foreground">
                This is an error, not an absence of problems — do not read it as
                &ldquo;everything is fine&rdquo;. If perf_rum_minute has not been created yet
                (migration V468), that is the likely cause.
              </p>
              <p className="mt-1 font-mono text-xs text-muted-foreground">
                {String((anyError as Error).message ?? anyError)}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <CloudOff className="h-4 w-4" /> Institutes we are slow for
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{worst}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Wifi className="h-4 w-4" /> Institutes on a slow connection
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{struggling}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Samples in window
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {totalSamples.toLocaleString()}
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              from ~10% of sessions
            </span>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">By institute</CardTitle>
        </CardHeader>
        <CardContent>
          {institutes.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <EmptyState
              title="No samples yet"
              description="Sampled admin sessions report once a minute. If this stays empty after a deploy, check that the admin dashboard is sending to /v1/perf/rum."
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Institute</TableHead>
                    <TableHead>Verdict</TableHead>
                    <TableHead className="text-right">Our server p95</TableHead>
                    <TableHead className="text-right">Their network p95</TableHead>
                    <TableHead className="text-right">Samples</TableHead>
                    <TableHead className="text-right">Unannotated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const verdict = verdictFor(row);
                    return (
                      <TableRow key={row.instituteId ?? "(none)"}>
                        <TableCell className="font-medium">{row.instituteName}</TableCell>
                        <TableCell>
                          <Badge className={VERDICT_CLASS[verdict]} variant="secondary">
                            {VERDICT_LABEL[verdict]}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {formatBound(percentileBound(row.server, 0.95))}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {formatBound(percentileBound(row.network, 0.95))}
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {(row.server.samples + row.network.samples).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right text-sm text-muted-foreground">
                          {row.unannotated.toLocaleString()}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Slowest routes (our time only)</CardTitle>
        </CardHeader>
        <CardContent>
          {routes.isLoading ? (
            <Skeleton className="h-32" />
          ) : (routes.data ?? []).length === 0 ? (
            <EmptyState title="No route data yet" description="Nothing recorded in this window." />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Route</TableHead>
                    <TableHead className="text-right">p50</TableHead>
                    <TableHead className="text-right">p95</TableHead>
                    <TableHead className="text-right">Samples</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(routes.data ?? []).map((r) => (
                    <TableRow key={r.routeKey}>
                      <TableCell className="font-mono text-xs">{r.routeKey}</TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {formatBound(r.p50)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {formatBound(r.p95)}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {r.samples.toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Over time</CardTitle>
        </CardHeader>
        <CardContent>
          {timeline.isLoading ? (
            <Skeleton className="h-24" />
          ) : (timeline.data ?? []).length === 0 ? (
            <EmptyState title="No timeline yet" description="Nothing recorded in this window." />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead className="text-right">Our server p95</TableHead>
                    <TableHead className="text-right">Their network p95</TableHead>
                    <TableHead className="text-right">Samples</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(timeline.data ?? []).slice(-40).reverse().map((p) => (
                    <TableRow key={p.t}>
                      <TableCell className="font-mono text-xs">
                        {new Date(p.t).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {formatBound(p.serverP95)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {formatBound(p.networkP95)}
                      </TableCell>
                      <TableCell className="text-right text-sm">{p.samples}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
