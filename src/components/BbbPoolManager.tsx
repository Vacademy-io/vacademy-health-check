import { useEffect, useState } from "react";
import { format, formatDistanceToNowStrict } from "date-fns";
import {
  Activity,
  CheckCircle2,
  Clock,
  Info,
  Loader2,
  Play,
  RefreshCw,
  Save,
  Server,
  Square,
  X,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useBbbPoolServers,
  useRunHealthCheck,
  useServersToStart,
  useTriggerPoolAction,
  useUpdateServersToStart,
  type BbbServerPoolDTO,
  type HealthCheckResult,
} from "@/services/bbb-api";

const SCHEDULE_ROWS: Array<{ day: string; start: string; healthCheck: string; stop: string }> = [
  { day: "Mon–Sat", start: "2:00 PM IST", healthCheck: "2:50 PM IST", stop: "11:55 PM IST" },
  { day: "Sunday", start: "9:30 AM IST", healthCheck: "9:45 AM IST", stop: "4:00 PM IST" },
];

// Per-status capability flags.
const CAN_START: Record<string, boolean> = {
  STOPPED: true,
  ERROR: true,
};
const CAN_STOP: Record<string, boolean> = {
  RUNNING: true,
  ERROR: true,
};

function statusVariant(status: string): { className: string; label: string } {
  const s = (status || "").toUpperCase();
  if (s === "RUNNING") return { className: "border-green-500 text-green-600 bg-green-50", label: status };
  if (s === "STARTING") return { className: "border-blue-500 text-blue-600 bg-blue-50", label: status };
  if (s === "STOPPING") return { className: "border-amber-500 text-amber-600 bg-amber-50", label: status };
  if (s === "STOPPED") return { className: "border-slate-400 text-slate-500 bg-slate-50", label: status };
  if (s === "ERROR") return { className: "border-red-500 text-red-600 bg-red-50", label: status };
  return { className: "border-slate-300 text-slate-500", label: status || "—" };
}

function healthVariant(health: string): { className: string; label: string } {
  const h = (health || "").toUpperCase();
  if (h === "HEALTHY") return { className: "border-green-500 text-green-600 bg-green-50", label: "Healthy" };
  if (h === "DEGRADED") return { className: "border-amber-500 text-amber-700 bg-amber-50", label: "Degraded" };
  if (h === "DOWN") return { className: "border-red-500 text-red-600 bg-red-50", label: "Down" };
  return { className: "border-slate-300 text-slate-500", label: health || "Unknown" };
}

interface DispatchBanner {
  action: "start" | "stop";
  target: string;
  count: number;
  at: Date;
}

export default function BbbPoolManager() {
  const { data: servers, isLoading, refetch, isFetching } = useBbbPoolServers();
  const { data: serversToStart } = useServersToStart();
  const updateServersToStart = useUpdateServersToStart();
  const triggerAction = useTriggerPoolAction();
  const runHealthCheck = useRunHealthCheck();

  // ── Two independent counts ─────────────────────────────────────────────
  // 1) Scheduler config (persisted in admin-core)
  const [draftConfigCount, setDraftConfigCount] = useState<string>("");
  // 2) Manual start count (just for the next button click — not persisted).
  //    Defaults to the scheduler config when empty.
  const [manualCount, setManualCount] = useState<string>("");

  const configDirty =
    draftConfigCount !== "" && Number(draftConfigCount) !== serversToStart;

  const manualCountDisplay =
    manualCount !== "" ? manualCount : serversToStart != null ? String(serversToStart) : "";
  const manualCountNum = manualCount !== "" ? Math.max(0, Number(manualCount)) : serversToStart ?? 1;

  const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [dispatch, setDispatch] = useState<DispatchBanner | null>(null);
  const [bannerTick, setBannerTick] = useState(0);

  // Re-render dispatch banner every 15s to update "X min ago"
  useEffect(() => {
    if (!dispatch) return;
    const id = window.setInterval(() => setBannerTick((n) => n + 1), 15_000);
    return () => window.clearInterval(id);
  }, [dispatch]);

  const runningCount = (servers ?? []).filter((s) => s.status === "RUNNING").length;
  const enabledCount = (servers ?? []).filter((s) => s.enabled).length;

  const showToast = (type: "success" | "error", text: string) => {
    setToast({ type, text });
    window.setTimeout(() => setToast(null), 6000);
  };

  const errMsg = (e: unknown, fallback: string) =>
    e instanceof Error ? e.message : typeof e === "string" ? e : fallback;

  const recordDispatch = (b: DispatchBanner) => {
    setDispatch(b);
    setBannerTick((n) => n + 1);
  };

  // ── Pool-level actions ──────────────────────────────────────────────────
  const handleStartAll = async () => {
    const count = manualCountNum > 0 ? manualCountNum : 1;
    if (
      !window.confirm(
        `Trigger GitHub Action to START ${count} BBB server(s)? This provisions Hetzner instances and takes ~3–5 min.`
      )
    )
      return;
    try {
      const res = await triggerAction.mutateAsync({
        action: "start",
        serverSlug: "all",
        serverCount: count,
      });
      if (res.error) {
        showToast("error", res.error);
      } else {
        recordDispatch({ action: "start", target: "all", count, at: new Date() });
        showToast("success", res.message || "Workflow dispatched");
      }
    } catch (e: unknown) {
      showToast("error", errMsg(e, "Failed to dispatch workflow"));
    }
  };

  const handleStopAll = async () => {
    if (
      !window.confirm(
        "Trigger GitHub Action to STOP all running BBB servers? They will be snapshotted and deleted."
      )
    )
      return;
    try {
      const res = await triggerAction.mutateAsync({ action: "stop", serverSlug: "all" });
      if (res.error) {
        showToast("error", res.error);
      } else {
        recordDispatch({ action: "stop", target: "all", count: 0, at: new Date() });
        showToast("success", res.message || "Workflow dispatched");
      }
    } catch (e: unknown) {
      showToast("error", errMsg(e, "Failed to dispatch workflow"));
    }
  };

  // ── Per-server actions ─────────────────────────────────────────────────
  const handleStartOne = async (slug: string) => {
    if (!window.confirm(`Start BBB server "${slug}"? Triggers GitHub Action.`)) return;
    try {
      const res = await triggerAction.mutateAsync({
        action: "start",
        serverSlug: slug,
        serverCount: 1,
      });
      if (res.error) {
        showToast("error", res.error);
      } else {
        recordDispatch({ action: "start", target: slug, count: 1, at: new Date() });
        showToast("success", res.message || "Workflow dispatched");
      }
    } catch (e: unknown) {
      showToast("error", errMsg(e, "Failed to dispatch workflow"));
    }
  };

  const handleStopOne = async (slug: string) => {
    if (!window.confirm(`Stop BBB server "${slug}"? Triggers GitHub Action.`)) return;
    try {
      const res = await triggerAction.mutateAsync({ action: "stop", serverSlug: slug });
      if (res.error) {
        showToast("error", res.error);
      } else {
        recordDispatch({ action: "stop", target: slug, count: 0, at: new Date() });
        showToast("success", res.message || "Workflow dispatched");
      }
    } catch (e: unknown) {
      showToast("error", errMsg(e, "Failed to dispatch workflow"));
    }
  };

  const handleHealthCheck = async () => {
    try {
      const res = await runHealthCheck.mutateAsync({ notify: false });
      const counts = (res.results || []).reduce<Record<string, number>>((acc, r) => {
        acc[r.status] = (acc[r.status] || 0) + 1;
        return acc;
      }, {});
      const summary = Object.entries(counts)
        .map(([k, v]) => `${k}=${v}`)
        .join(" · ");
      const ok =
        (counts.HEALTHY ?? 0) > 0 && !(counts.DOWN ?? 0) && !(counts.DEGRADED ?? 0);
      showToast(
        ok ? "success" : "error",
        `Checked ${res.checked} server(s) [${res.source}] — ${summary || "no results"}`
      );
    } catch (e: unknown) {
      showToast("error", errMsg(e, "Health check failed"));
    }
  };

  const handleSaveConfig = async () => {
    const n = Number(draftConfigCount);
    if (!Number.isFinite(n) || n < 0) {
      showToast("error", "Enter a non-negative number");
      return;
    }
    try {
      await updateServersToStart.mutateAsync(n);
      setDraftConfigCount("");
      showToast("success", `Scheduler will now start ${n} server(s) on each run`);
    } catch (e: unknown) {
      showToast("error", errMsg(e, "Failed to update config"));
    }
  };

  const anyMutating =
    triggerAction.isPending || runHealthCheck.isPending || updateServersToStart.isPending;

  // Reference `bannerTick` so the linter knows it drives the rendered "ago" text.
  void bannerTick;
  const dispatchAge = dispatch
    ? formatDistanceToNowStrict(dispatch.at, { addSuffix: false })
    : "";

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Server className="h-5 w-5 text-emerald-600" />
          <h2 className="text-lg font-semibold">BBB Server Pool & Schedulers</h2>
          <span className="text-xs bg-emerald-50 text-emerald-700 rounded-full px-2 py-0.5 border border-emerald-200">
            {runningCount}/{enabledCount} running
          </span>
        </div>
        <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Sticky dispatch banner — explains why nothing has changed yet */}
      {dispatch && (
        <div className="mb-3 rounded-md border border-indigo-200 bg-indigo-50 text-indigo-900 p-2 text-xs flex items-start gap-2">
          <Info className="h-4 w-4 mt-0.5 shrink-0" />
          <div className="flex-1 leading-relaxed">
            <span className="font-semibold">
              {dispatch.action === "start" ? "Start" : "Stop"} workflow dispatched
            </span>{" "}
            for <span className="font-mono">{dispatch.target}</span>
            {dispatch.action === "start" && dispatch.count > 0 && (
              <> ({dispatch.count} server{dispatch.count > 1 ? "s" : ""})</>
            )}
            {" — "}
            {dispatchAge} ago. GitHub Actions takes ~3–5 min to finish; the pool
            table below will refresh on its own.
          </div>
          <button
            className="opacity-60 hover:opacity-100"
            onClick={() => setDispatch(null)}
            aria-label="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Transient toast */}
      {toast && (
        <div
          className={`mb-3 rounded-md border p-2 text-xs flex items-start gap-2 ${
            toast.type === "success"
              ? "bg-green-50 border-green-200 text-green-800"
              : "bg-red-50 border-red-200 text-red-800"
          }`}
        >
          {toast.type === "success" ? (
            <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
          ) : (
            <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
          )}
          <span className="leading-relaxed">{toast.text}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        {/* Schedule card */}
        <Card className="p-4 lg:col-span-2">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="h-4 w-4 text-indigo-500" />
            <h3 className="text-sm font-semibold">Scheduled jobs (Asia/Kolkata)</h3>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Day</TableHead>
                <TableHead className="text-xs">Start</TableHead>
                <TableHead className="text-xs">Health check</TableHead>
                <TableHead className="text-xs">Stop</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {SCHEDULE_ROWS.map((r) => (
                <TableRow key={r.day}>
                  <TableCell className="text-xs font-medium">{r.day}</TableCell>
                  <TableCell className="text-xs">{r.start}</TableCell>
                  <TableCell className="text-xs">{r.healthCheck}</TableCell>
                  <TableCell className="text-xs">{r.stop}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="mt-3 space-y-1">
            <p className="text-[11px] text-muted-foreground">
              Schedulers live in <span className="font-mono">community_service · BbbHealthCheckService</span>.
              The scheduled "Start" job uses the count saved under{" "}
              <span className="font-semibold">Scheduler default</span>.
            </p>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground">Scheduler default:</span>
              <Input
                type="number"
                min={0}
                step={1}
                className="h-7 w-20 text-xs"
                value={draftConfigCount !== "" ? draftConfigCount : serversToStart ?? ""}
                onChange={(e) => setDraftConfigCount(e.target.value)}
                placeholder={serversToStart != null ? String(serversToStart) : "1"}
              />
              <Button
                size="sm"
                variant={configDirty ? "default" : "outline"}
                className="h-7 text-xs"
                onClick={handleSaveConfig}
                disabled={!configDirty || updateServersToStart.isPending}
              >
                {updateServersToStart.isPending ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                ) : (
                  <Save className="mr-1 h-3 w-3" />
                )}
                Save
              </Button>
              <span className="text-[11px] text-muted-foreground">
                (currently {serversToStart ?? "—"} · used by scheduled runs only)
              </span>
            </div>
          </div>
        </Card>

        {/* Manual controls */}
        <Card className="p-4 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-blue-500" />
            <h3 className="text-sm font-semibold">Manual controls</h3>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">
              Start count (one-off)
            </label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                step={1}
                className="h-9 w-24"
                value={manualCountDisplay}
                onChange={(e) => setManualCount(e.target.value)}
                placeholder={serversToStart != null ? String(serversToStart) : "1"}
              />
              <span className="text-[11px] text-muted-foreground">
                doesn't change the scheduler default
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button
              size="sm"
              onClick={handleStartAll}
              disabled={anyMutating || manualCountNum <= 0}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {triggerAction.isPending ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Play className="mr-1 h-4 w-4" />
              )}
              Start {manualCountNum}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={handleStopAll}
              disabled={anyMutating || runningCount === 0}
            >
              {triggerAction.isPending ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Square className="mr-1 h-4 w-4" />
              )}
              Stop all
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleHealthCheck}
              disabled={anyMutating}
              className="col-span-2"
            >
              {runHealthCheck.isPending ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Activity className="mr-1 h-4 w-4" />
              )}
              Run pool health check (no WhatsApp)
            </Button>
          </div>
        </Card>
      </div>

      {/* Pool servers table */}
      <Card className="shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Slug</TableHead>
              <TableHead>Domain</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Health</TableHead>
              <TableHead>Meetings</TableHead>
              <TableHead>Last check</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-6 text-muted-foreground">
                  <Loader2 className="h-4 w-4 inline mr-2 animate-spin" />
                  Loading pool…
                </TableCell>
              </TableRow>
            )}
            {!isLoading && (servers?.length ?? 0) === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-6 text-muted-foreground text-sm">
                  No servers configured in <span className="font-mono">bbb_server_pool</span>.
                </TableCell>
              </TableRow>
            )}
            {(servers ?? []).map((srv: BbbServerPoolDTO) => {
              const st = statusVariant(srv.status);
              const hl = healthVariant(srv.healthStatus);
              const canStart = CAN_START[srv.status?.toUpperCase()] ?? false;
              const canStop = CAN_STOP[srv.status?.toUpperCase()] ?? false;
              const lastCheckMs = srv.lastHealthCheck
                ? typeof srv.lastHealthCheck === "number"
                  ? srv.lastHealthCheck
                  : Date.parse(srv.lastHealthCheck)
                : null;
              return (
                <TableRow key={srv.slug}>
                  <TableCell className="font-mono text-xs">
                    <div className="flex flex-col">
                      <span>{srv.slug}</span>
                      <span className="text-[10px] text-muted-foreground">
                        prio {srv.priority} · {srv.serverType}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs">{srv.domain}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={st.className}>
                      {st.label}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={hl.className}>
                      {hl.label}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs">
                    <span className={srv.activeMeetings >= srv.maxMeetings ? "text-red-600 font-bold" : ""}>
                      {srv.activeMeetings}
                    </span>
                    <span className="text-muted-foreground"> / {srv.maxMeetings}</span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {lastCheckMs ? format(new Date(lastCheckMs), "dd MMM HH:mm") : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        disabled={anyMutating || !canStart}
                        onClick={() => handleStartOne(srv.slug)}
                        title={!canStart ? `Cannot start when ${srv.status}` : undefined}
                      >
                        <Play className="h-3 w-3 mr-1" />
                        Start
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        disabled={anyMutating || !canStop}
                        onClick={() => handleStopOne(srv.slug)}
                        title={!canStop ? `Cannot stop when ${srv.status}` : undefined}
                      >
                        <Square className="h-3 w-3 mr-1" />
                        Stop
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      {/* Last health check details — small expandable list */}
      {runHealthCheck.data?.results && runHealthCheck.data.results.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Last manual health-check ({runHealthCheck.data.source})
          </p>
          <div className="space-y-1">
            {runHealthCheck.data.results.map((r: HealthCheckResult, i: number) => (
              <div
                key={(r.slug ?? r.hostname) + i}
                className="flex items-center gap-2 text-xs p-1.5 rounded border bg-slate-50"
              >
                <Badge
                  variant="outline"
                  className={healthVariant(r.status).className + " h-5 text-[10px]"}
                >
                  {r.status}
                </Badge>
                <span className="font-mono">{r.slug ?? r.hostname}</span>
                <span className="text-muted-foreground truncate">{r.details}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
