import { formatDistanceToNow, format } from "date-fns";
import {
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  Activity,
  RefreshCw,
  Wrench,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { usePublicIncidents } from "@/services/status-api";
import type {
  DateLike,
  IncidentDTO,
  IncidentSeverity,
  IncidentStatus,
} from "@/types/api";

const SEVERITY_META: Record<
  IncidentSeverity,
  { label: string; className: string }
> = {
  MINOR: { label: "Minor", className: "bg-yellow-100 text-yellow-800 border-yellow-300" },
  MAJOR: { label: "Major", className: "bg-orange-100 text-orange-800 border-orange-300" },
  CRITICAL: { label: "Critical", className: "bg-red-100 text-red-800 border-red-300" },
  MAINTENANCE: { label: "Maintenance", className: "bg-blue-100 text-blue-800 border-blue-300" },
};

const STATUS_META: Record<
  IncidentStatus,
  { label: string; className: string }
> = {
  INVESTIGATING: { label: "Investigating", className: "bg-red-50 text-red-700 border-red-200" },
  IDENTIFIED: { label: "Identified", className: "bg-orange-50 text-orange-700 border-orange-200" },
  MONITORING: { label: "Monitoring", className: "bg-blue-50 text-blue-700 border-blue-200" },
  RESOLVED: { label: "Resolved", className: "bg-green-50 text-green-700 border-green-200" },
};

function toDate(v: DateLike | null | undefined): Date | null {
  if (v === null || v === undefined) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function deriveOverallStatus(active: IncidentDTO[]) {
  if (active.length === 0)
    return {
      label: "All Systems Operational",
      icon: CheckCircle2,
      className: "bg-green-50 border-green-200 text-green-800",
    };
  if (active.every((i) => i.severity === "MAINTENANCE"))
    return {
      label: "Scheduled Maintenance",
      icon: Wrench,
      className: "bg-blue-50 border-blue-200 text-blue-800",
    };
  if (active.some((i) => i.severity === "CRITICAL"))
    return {
      label: "Major Outage",
      icon: AlertCircle,
      className: "bg-red-50 border-red-200 text-red-800",
    };
  if (active.some((i) => i.severity === "MAJOR"))
    return {
      label: "Partial Outage",
      icon: AlertTriangle,
      className: "bg-orange-50 border-orange-200 text-orange-800",
    };
  return {
    label: "Degraded Performance",
    icon: Activity,
    className: "bg-yellow-50 border-yellow-200 text-yellow-800",
  };
}

function IncidentCard({ incident }: { incident: IncidentDTO }) {
  const sev = SEVERITY_META[incident.severity];
  const stat = STATUS_META[incident.status];
  const startedAt = toDate(incident.startedAt);
  // Backend stores updates newest-first; [0] is the latest.
  const updates = incident.updates ?? [];
  const latestMessage = updates[0]?.message ?? null;

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <Badge variant="outline" className={sev.className}>{sev.label}</Badge>
              <Badge variant="outline" className={stat.className}>{stat.label}</Badge>
              {incident.affectedComponents?.map((svc) => (
                <Badge key={svc} variant="secondary" className="text-xs">{svc}</Badge>
              ))}
            </div>
            <h3 className="text-lg font-semibold tracking-tight">{incident.title}</h3>
            {latestMessage && (
              <p className="mt-1 text-sm text-muted-foreground">{latestMessage}</p>
            )}
          </div>
          {startedAt && (
            <div className="text-right text-xs text-muted-foreground shrink-0">
              <div>{format(startedAt, "MMM d, HH:mm")}</div>
              <div>{formatDistanceToNow(startedAt, { addSuffix: true })}</div>
            </div>
          )}
        </div>

        {updates.length > 0 && (
          <div className="mt-4 space-y-3 border-l-2 border-muted pl-4">
            {updates.map((u) => {
              const uStatus = u.status ? STATUS_META[u.status] : null;
              const uDate = toDate(u.createdAt);
              return (
                <div key={u.id} className="text-sm">
                  <div className="flex items-center gap-2 mb-0.5">
                    {uStatus && (
                      <Badge variant="outline" className={`${uStatus.className} text-[10px]`}>
                        {uStatus.label}
                      </Badge>
                    )}
                    {uDate && (
                      <span className="text-xs text-muted-foreground">
                        {format(uDate, "MMM d, HH:mm")}
                      </span>
                    )}
                  </div>
                  <p className="text-sm">{u.message}</p>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function StatusPage() {
  const { data, isLoading, isError, refetch, isFetching } = usePublicIncidents();
  const incidents = data ?? [];
  const active = incidents.filter((i) => i.status !== "RESOLVED");
  const resolved = incidents
    .filter((i) => i.status === "RESOLVED")
    .sort((a, b) => {
      const aT = toDate(a.resolvedAt ?? a.updatedAt)?.getTime() ?? 0;
      const bT = toDate(b.resolvedAt ?? b.updatedAt)?.getTime() ?? 0;
      return bT - aT;
    })
    .slice(0, 20);

  const overall = deriveOverallStatus(active);
  const OverallIcon = overall.icon;

  return (
    <div className="min-h-screen bg-slate-50/60">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-3">
            <Activity className="h-6 w-6 text-primary" />
            <div>
              <div className="text-lg font-semibold tracking-tight">Vacademy Status</div>
              <div className="text-xs text-muted-foreground">Platform health & incident reports</div>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            aria-label="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-8 px-6 py-8">
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <div className={`flex items-center gap-4 rounded-lg border p-5 ${overall.className}`}>
            <OverallIcon className="h-8 w-8 shrink-0" />
            <div>
              <div className="text-xl font-semibold">{overall.label}</div>
              <div className="text-sm opacity-80">
                {active.length === 0
                  ? "There are no incidents currently being reported."
                  : `${active.length} active incident${active.length === 1 ? "" : "s"}`}
              </div>
            </div>
          </div>
        )}

        {isError && (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              Couldn't load status updates. Please try again in a moment.
            </CardContent>
          </Card>
        )}

        {!isLoading && active.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Active Incidents
            </h2>
            <div className="space-y-3">
              {active.map((i) => (
                <IncidentCard key={i.id} incident={i} />
              ))}
            </div>
          </section>
        )}

        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Past Incidents
          </h2>
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : resolved.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-sm text-muted-foreground">
                No past incidents reported.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {resolved.map((i) => (
                <IncidentCard key={i.id} incident={i} />
              ))}
            </div>
          )}
        </section>

        <footer className="pt-8 text-center text-xs text-muted-foreground">
          Subscribe to updates by checking back here — refreshes every minute.
        </footer>
      </main>
    </div>
  );
}
