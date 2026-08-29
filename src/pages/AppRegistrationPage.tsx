import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  AppWindow,
  BellRing,
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  HardDriveDownload,
  Hourglass,
  Info,
  Loader2,
  Package,
  Plus,
  Upload,
  UploadCloud,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/shared/PageHeader";
import { SearchInput } from "@/components/shared/SearchInput";
import { ToastStack, useToasts } from "@/components/shared/Toast";
import { AssetStudio } from "@/components/apps/AssetStudio";
import { IntegrationsPanel } from "@/components/apps/IntegrationsPanel";
import { OtaBuildCheck } from "@/components/apps/OtaBuildCheck";
import { RegisterAppWizard } from "@/components/apps/RegisterAppWizard";
import { PLATFORM_ICONS, StatusBadge, StatusDot } from "@/components/apps/StatusBadge";
import { appProgress, overallStatus, platformProgress } from "@/lib/app-checklist";
import { computeAlerts, type AlertLevel } from "@/lib/app-notifications";
import { PROVIDER_CAPABILITIES, assetSpecsFor } from "@/lib/platform-requirements";
import { cn } from "@/lib/utils";
import { useApps, useImportApps, useSaveApp } from "@/services/app-registry-api";
import { STORAGE_MODE, pushLocalBacklog, readLocalBacklog } from "@/services/app-registry-store";
import { CONSOLE_URLS } from "@/services/store-providers";
import {
  PLATFORMS,
  PLATFORM_LABELS,
  STORE_LABELS,
  activePlatforms,
  type AppRecord,
  type Platform,
} from "@/types/app-registry";

const DESKTOP: Platform[] = ["WINDOWS", "MACOS"];

/**
 * App Registration & Store Management (§1, §21).
 *
 * One page for every white-label app across Google Play, the App Store, the Microsoft Store and
 * the Mac App Store: what's registered, what's missing, what's in review, and what needs a human
 * in a store console today.
 */
export default function AppRegistrationPage() {
  const navigate = useNavigate();
  const query = useApps();
  const save = useSaveApp();
  const importApps = useImportApps();
  const { toasts, push, dismiss } = useToasts();

  const [wizardOpen, setWizardOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [studioAppId, setStudioAppId] = useState<string>("");
  // Apps a previous session left in this browser. Read once: it only ever shrinks, and it shrinks
  // through the button below.
  const [backlog, setBacklog] = useState<AppRecord[]>(() =>
    STORAGE_MODE === "remote" ? readLocalBacklog() : []
  );
  const [pushingBacklog, setPushingBacklog] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  const apps = useMemo(() => (query.data ?? []).filter((a) => !a.archived), [query.data]);
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return apps;
    return apps.filter((app) =>
      [app.basics.name, app.basics.client, app.basics.packageName, app.basics.displayName]
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }, [apps, search]);

  const stats = useMemo(() => summarise(apps), [apps]);
  const alerts = useMemo(() => computeAlerts(apps), [apps]);

  const studioApp = apps.find((a) => a.id === studioAppId) ?? apps[0];

  function createApp(app: AppRecord) {
    save.mutate(app, {
      onSuccess: (created) => {
        setWizardOpen(false);
        push("success", `${created.basics.name} registered.`);
        navigate(`/apps/${created.id}`);
      },
      onError: () => push("error", "Could not create the app."),
    });
  }

  async function pushBacklog() {
    setPushingBacklog(true);
    try {
      const { pushed, failed, skipped } = await pushLocalBacklog();
      if (failed.length === 0 && skipped.length === 0) {
        setBacklog([]);
        push("success", `Moved ${pushed} app${pushed === 1 ? "" : "s"} into the shared registry.`);
      } else {
        // Nothing was cleared, so the banner stays and names what is still stuck here.
        setBacklog(readLocalBacklog());
        if (skipped.length > 0) {
          push(
            "info",
            `Moved ${pushed}. Already in the shared registry and left untouched: ${skipped.join(", ")}. ` +
              `Compare before replacing anything — the shared copy may be newer than this browser's.`
          );
        }
        if (failed.length > 0) {
          push("error", `Still only in this browser: ${failed.join(", ")}.`);
        }
      }
      query.refetch();
    } finally {
      setPushingBacklog(false);
    }
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(apps, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `vacademy-app-registry-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    push("success", `Exported ${apps.length} apps.`);
  }

  async function importJson(file: File | undefined) {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (!Array.isArray(parsed)) throw new Error("not an array");
      // Import replaces the WHOLE registry. Against localStorage that only ever cost this browser,
      // so the button never needed a guard. Against the shared registry the same click deletes
      // every app the team has — including the archived ones, which Export deliberately leaves out
      // of the very file being imported, so an export/import round trip destroys them.
      if (
        STORAGE_MODE === "remote" &&
        !window.confirm(
          `Replace the ENTIRE shared registry with this file?\n\n` +
            `All ${apps.length} app${apps.length === 1 ? "" : "s"} currently listed — plus any archived ones, ` +
            `which Export does not include — will be deleted and replaced by the ${parsed.length} in this file.\n\n` +
            `This affects everyone, not just this browser, and cannot be undone.`
        )
      ) {
        if (importRef.current) importRef.current.value = "";
        return;
      }
      importApps.mutate(parsed as AppRecord[], {
        onSuccess: () => push("success", `Imported ${parsed.length} apps.`),
        onError: () => push("error", "Import failed."),
      });
    } catch {
      push("error", "That file isn't a registry export.");
    }
    if (importRef.current) importRef.current.value = "";
  }

  return (
    <div>
      <PageHeader
        title="App Registration"
        description="Every white-label app across Google Play, the App Store, the Microsoft Store and the Mac App Store."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={importRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(event) => importJson(event.target.files?.[0])}
            />
            <Button size="sm" variant="outline" onClick={() => importRef.current?.click()}>
              <Upload className="mr-1 h-4 w-4" />
              Import
            </Button>
            <Button size="sm" variant="outline" disabled={apps.length === 0} onClick={exportJson}>
              <Download className="mr-1 h-4 w-4" />
              Export
            </Button>
            <Button size="sm" onClick={() => setWizardOpen(true)}>
              <Plus className="mr-1 h-4 w-4" />
              Register New App
            </Button>
          </div>
        }
      />

      {STORAGE_MODE === "local" && (
        <p className="mb-4 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs leading-relaxed text-muted-foreground">
          <HardDriveDownload className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>
            <strong className="text-foreground">The shared registry is switched off here</strong> (
            <code className="rounded bg-background px-1">VITE_APP_REGISTRY_REMOTE=false</code>), so app records stay in
            this browser. Nobody else sees them, and neither does the institute's own dashboard — Settings &rarr; App
            Status reads the shared registry. Artwork is unaffected; it already lives in media-service.
          </span>
        </p>
      )}

      {STORAGE_MODE === "remote" && backlog.length > 0 && (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
          <p className="flex items-start gap-2 leading-relaxed text-muted-foreground">
            <HardDriveDownload className="mt-px h-3.5 w-3.5 shrink-0" />
            <span>
              <strong className="text-foreground">
                {backlog.length} app{backlog.length === 1 ? "" : "s"} still only exist in this browser
              </strong>{" "}
              — registered before the shared registry. No teammate and no institute can see them until they move
              across. Nothing is deleted here: records are copied one by one and only cleared once every one lands.
            </span>
          </p>
          <Button size="sm" variant="outline" disabled={pushingBacklog} onClick={pushBacklog}>
            {pushingBacklog ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <UploadCloud className="mr-1 h-3.5 w-3.5" />
            )}
            Push to shared registry
          </Button>
        </div>
      )}

      {query.isError && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs">
          <p className="flex items-start gap-2 leading-relaxed text-muted-foreground">
            <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0 text-destructive" />
            <span>
              <strong className="text-foreground">The shared registry didn't answer.</strong> Everything below is empty
              because the request failed, not because nothing is registered. Don't re-register anything from here until
              this loads — the records are still there.
            </span>
          </p>
          <Button size="sm" variant="outline" onClick={() => query.refetch()}>
            Retry
          </Button>
        </div>
      )}

      <div className="mb-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <Stat label="Total Apps" value={stats.total} icon={AppWindow} />
        <Stat label="Live" value={stats.live} icon={CheckCircle2} tone="good" />
        <Stat label="In Review" value={stats.inReview} icon={Hourglass} tone="warn" />
        <Stat label="Rejected" value={stats.rejected} icon={XCircle} tone="bad" />
        <Stat label="Build Processing" value={stats.processing} icon={Clock} tone="warn" />
        <Stat label="Updates Available" value={stats.updates} icon={Package} tone="info" />
      </div>

      {alerts.length > 0 && <AlertsCard alerts={alerts} onOpen={(id) => navigate(`/apps/${id}`)} />}

      <Tabs defaultValue="overview" className="mt-4">
        <div className="overflow-x-auto">
          <TabsList className="mb-4 w-max">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="assets">Images & App Assets</TabsTrigger>
            <TabsTrigger value="status">App Status</TabsTrigger>
            <TabsTrigger value="ota">OTA / Build Check</TabsTrigger>
            <TabsTrigger value="desktop">Windows & macOS</TabsTrigger>
            <TabsTrigger value="integrations">Integrations</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="space-y-4">
          <div className="max-w-sm">
            <SearchInput value={search} onChange={setSearch} placeholder="Search apps, clients, bundle ids…" />
          </div>

          {query.isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : filtered.length === 0 ? (
            <Card>
              <CardContent className="py-16 text-center">
                <AppWindow className="mx-auto h-10 w-10 text-muted-foreground/40" />
                <p className="mt-3 text-sm font-medium">{apps.length === 0 ? "No apps registered yet" : "No matches"}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {apps.length === 0
                    ? "Register the first white-label app and the dashboard builds its checklists, asset slots and store questions automatically."
                    : "Try a different search."}
                </p>
                {apps.length === 0 && (
                  <Button className="mt-4" size="sm" onClick={() => setWizardOpen(true)}>
                    <Plus className="mr-1 h-4 w-4" />
                    Register New App
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>App</TableHead>
                        {PLATFORMS.map((platform) => (
                          <TableHead key={platform} className="text-center">
                            {PLATFORM_LABELS[platform]}
                          </TableHead>
                        ))}
                        <TableHead>Overall Status</TableHead>
                        <TableHead className="w-40">Registration</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((app) => {
                        const progress = appProgress(app);
                        return (
                          <TableRow
                            key={app.id}
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => navigate(`/apps/${app.id}`)}
                          >
                            <TableCell>
                              <p className="font-medium">{app.basics.name || "Untitled"}</p>
                              <p className="text-xs text-muted-foreground">
                                {app.basics.client || app.basics.packageName || "—"}
                              </p>
                            </TableCell>
                            {PLATFORMS.map((platform) => (
                              <TableCell key={platform} className="text-center">
                                {app.platforms[platform].enabled ? (
                                  <StatusDot status={app.platforms[platform].status} />
                                ) : (
                                  <span className="text-xs text-muted-foreground/40">—</span>
                                )}
                              </TableCell>
                            ))}
                            <TableCell>
                              <StatusBadge status={overallStatus(app)} />
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Progress value={progress.percent} className="h-1.5 flex-1" />
                                <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">
                                  {progress.percent}%
                                </span>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="assets" className="space-y-4">
          {apps.length === 0 ? (
            <NoApps onRegister={() => setWizardOpen(true)} />
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-muted-foreground">Working on</span>
                <Select value={studioApp?.id ?? ""} onValueChange={setStudioAppId}>
                  <SelectTrigger className="w-64">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {apps.map((app) => (
                      <SelectItem key={app.id} value={app.id}>
                        {app.basics.name || "Untitled"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {studioApp && (
                <AssetStudio
                  app={studioApp}
                  onChange={(next) => save.mutate(next)}
                  notify={push}
                />
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="status" className="space-y-4">
          {apps.length === 0 ? (
            <NoApps onRegister={() => setWizardOpen(true)} />
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {apps.map((app) => (
                <AppStatusCard key={app.id} app={app} onOpen={() => navigate(`/apps/${app.id}`)} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="ota">
          {apps.length === 0 ? (
            <NoApps onRegister={() => setWizardOpen(true)} />
          ) : (
            <OtaBuildCheck apps={apps} onChange={(next) => save.mutate(next)} notify={push} />
          )}
        </TabsContent>

        <TabsContent value="desktop" className="space-y-4">
          <DesktopPanel apps={apps} onOpen={(id) => navigate(`/apps/${id}`)} />
        </TabsContent>

        <TabsContent value="integrations">
          <IntegrationsPanel notify={push} />
        </TabsContent>
      </Tabs>

      <RegisterAppWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        onCreate={createApp}
        saving={save.isPending}
      />
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}

/* ------------------------------------------------------------------- pieces */

function summarise(apps: AppRecord[]) {
  let live = 0;
  let inReview = 0;
  let rejected = 0;
  let processing = 0;
  let updates = 0;

  for (const app of apps) {
    const overall = overallStatus(app);
    if (overall === "LIVE") live++;
    if (overall === "IN_REVIEW" || overall === "SUBMITTED") inReview++;
    if (overall === "REJECTED") rejected++;
    if (overall === "BUILD_PROCESSING") processing++;
    if (activePlatforms(app).some((p) => app.platforms[p].status === "UPDATE_AVAILABLE")) updates++;
  }

  return { total: apps.length, live, inReview, rejected, processing, updates };
}

const STAT_TONES = {
  neutral: "bg-primary/10 text-primary",
  good: "bg-green-500/10 text-green-600",
  warn: "bg-amber-500/10 text-amber-600",
  bad: "bg-red-500/10 text-red-600",
  info: "bg-blue-500/10 text-blue-600",
} as const;

function Stat({
  label,
  value,
  icon: Icon,
  tone = "neutral",
}: {
  label: string;
  value: number;
  icon: typeof AppWindow;
  tone?: keyof typeof STAT_TONES;
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-4">
        <div>
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold tabular-nums">{value}</p>
        </div>
        <span className={cn("rounded-full p-2.5", STAT_TONES[tone])}>
          <Icon className="h-4 w-4" />
        </span>
      </CardContent>
    </Card>
  );
}

const ALERT_STYLES: Record<AlertLevel, { icon: typeof Info; className: string }> = {
  critical: { icon: XCircle, className: "text-destructive" },
  warning: { icon: AlertTriangle, className: "text-amber-600" },
  info: { icon: Info, className: "text-blue-600" },
};

function AlertsCard({
  alerts,
  onOpen,
}: {
  alerts: ReturnType<typeof computeAlerts>;
  onOpen: (appId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? alerts : alerts.slice(0, 4);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm">
            <BellRing className="h-4 w-4" />
            Needs attention
            <Badge variant="secondary">{alerts.length}</Badge>
          </CardTitle>
          {alerts.length > 4 && (
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setExpanded((v) => !v)}>
              {expanded ? "Show less" : `Show all ${alerts.length}`}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <ul className="divide-y">
          {shown.map((alert) => {
            const style = ALERT_STYLES[alert.level];
            const Icon = style.icon;
            return (
              <li key={alert.id}>
                <button
                  type="button"
                  disabled={!alert.appId}
                  onClick={() => alert.appId && onOpen(alert.appId)}
                  className="flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors enabled:hover:bg-accent/50"
                >
                  <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", style.className)} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">
                      {alert.appName} — {alert.title}
                    </span>
                    <span className="block text-xs leading-relaxed text-muted-foreground">{alert.detail}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

function AppStatusCard({ app, onOpen }: { app: AppRecord; onOpen: () => void }) {
  const enabled = activePlatforms(app);
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">{app.basics.name || "Untitled"}</CardTitle>
          <StatusBadge status={overallStatus(app)} />
        </div>
        <p className="text-xs text-muted-foreground">{app.basics.client || app.basics.packageName}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {PLATFORMS.map((platform) => {
          const config = app.platforms[platform];
          const Icon = PLATFORM_ICONS[platform];
          return (
            <div key={platform} className="flex flex-wrap items-center gap-2 border-b pb-2 last:border-0 last:pb-0">
              <Icon className={cn("h-4 w-4", !config.enabled && "opacity-30")} />
              <span className={cn("w-16 text-sm", !config.enabled && "text-muted-foreground/50")}>
                {PLATFORM_LABELS[platform]}
              </span>
              <StatusBadge status={config.enabled ? config.status : "NOT_REGISTERED"} />
              {config.enabled && (
                <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                  {config.currentVersion || "—"}
                  {config.currentBuild && ` · build ${config.currentBuild}`}
                  {config.releasedAt && ` · ${config.releasedAt}`}
                </span>
              )}
            </div>
          );
        })}
        <div className="flex items-center justify-between pt-1">
          <span className="text-xs text-muted-foreground">
            {enabled.length} platform{enabled.length === 1 ? "" : "s"} · {appProgress(app).percent}% registered
          </span>
          <Button size="sm" variant="outline" onClick={onOpen}>
            Open
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/** Windows & macOS (§5, §6) — the two platforms that behave least like the others. */
function DesktopPanel({ apps, onOpen }: { apps: AppRecord[]; onOpen: (id: string) => void }) {
  const rows = apps.flatMap((app) =>
    DESKTOP.filter((platform) => app.platforms[platform].enabled).map((platform) => ({ app, platform }))
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        {DESKTOP.map((platform) => {
          const meta = PROVIDER_CAPABILITIES[platform];
          const Icon = PLATFORM_ICONS[platform];
          return (
            <Card key={platform}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Icon className="h-4 w-4" />
                  {STORE_LABELS[platform]}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-xs leading-relaxed text-muted-foreground">
                <p>{meta.notes}</p>
                <p>
                  <span className="font-medium text-foreground">Auth:</span> {meta.auth}
                </p>
                <p>
                  <span className="font-medium text-foreground">Required assets:</span>{" "}
                  {assetSpecsFor(platform)
                    .filter((s) => s.required)
                    .map((s) => `${s.label} (${s.width}×${s.height})`)
                    .join(", ")}
                </p>
                <Button size="sm" variant="outline" asChild>
                  <a href={CONSOLE_URLS[platform]} target="_blank" rel="noreferrer">
                    <ExternalLink className="mr-1 h-3.5 w-3.5" />
                    Open console
                  </a>
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No app has Windows or macOS enabled yet. Turn one on from the app's own dashboard and its desktop
            configuration, checklist and asset slots appear here.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Desktop apps</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>App</TableHead>
                    <TableHead>Platform</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Version</TableHead>
                    <TableHead className="text-right">Assets</TableHead>
                    <TableHead className="w-32">Registration</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map(({ app, platform }) => {
                    const config = app.platforms[platform];
                    const required = assetSpecsFor(platform).filter((s) => s.required);
                    const have = required.filter((s) =>
                      app.assets.some((a) => a.platform === platform && a.specId === s.id)
                    ).length;
                    const progress = platformProgress(app, platform);
                    return (
                      <TableRow key={`${app.id}-${platform}`}>
                        <TableCell className="font-medium">{app.basics.name}</TableCell>
                        <TableCell>{PLATFORM_LABELS[platform]}</TableCell>
                        <TableCell>
                          <StatusBadge status={config.status} />
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{config.currentVersion || "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {have}/{required.length}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Progress value={progress.percent} className="h-1.5 flex-1" />
                            <span className="w-8 text-right text-xs tabular-nums text-muted-foreground">
                              {progress.percent}%
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="ghost" onClick={() => onOpen(app.id)}>
                            Open
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function NoApps({ onRegister }: { onRegister: () => void }) {
  return (
    <Card>
      <CardContent className="py-16 text-center">
        <AppWindow className="mx-auto h-10 w-10 text-muted-foreground/40" />
        <p className="mt-3 text-sm font-medium">No apps registered yet</p>
        <Button className="mt-4" size="sm" onClick={onRegister}>
          <Plus className="mr-1 h-4 w-4" />
          Register New App
        </Button>
      </CardContent>
    </Card>
  );
}
