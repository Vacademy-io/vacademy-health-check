import { useState } from "react";
import { ExternalLink, FileText, Loader2, RefreshCw, Rocket, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/apps/StatusBadge";
import { compareVersions } from "@/lib/version-compare";
import { CONSOLE_URLS, providerFor } from "@/services/store-providers";
import {
  PLATFORM_LABELS,
  activePlatforms,
  type AppRecord,
  type OtaStatus,
  type Platform,
} from "@/types/app-registry";

interface OtaRow {
  app: AppRecord;
  platform: Platform;
  liveVersion: string;
  liveBuild: string;
  latestVersion: string;
  latestBuild: string;
  ota: OtaStatus;
  updateAvailable: boolean;
  buildLogUrl: string;
  storeUrl: string;
}

function buildRows(apps: AppRecord[]): OtaRow[] {
  const rows: OtaRow[] = [];
  for (const app of apps) {
    for (const platform of activePlatforms(app)) {
      const config = app.platforms[platform];
      const versions = app.versions
        .filter((v) => v.platform === platform)
        .sort((a, b) => compareVersions(b.version, a.version) || b.createdAt.localeCompare(a.createdAt));
      const latest = versions[0];
      const liveVersion = config.currentVersion;
      const latestVersion = latest?.version ?? "";

      rows.push({
        app,
        platform,
        liveVersion,
        liveBuild: config.currentBuild,
        latestVersion,
        latestBuild: latest?.build ?? "",
        ota: latest?.otaStatus ?? "NONE",
        // "Newer build exists than the one the store is serving" — the thing worth chasing.
        updateAvailable: Boolean(latestVersion && liveVersion && compareVersions(latestVersion, liveVersion) > 0),
        buildLogUrl: latest?.buildLogUrl ?? "",
        storeUrl: config.storeUrl,
      });
    }
  }
  return rows;
}

const OTA_VARIANT: Record<OtaStatus, "success" | "warning" | "secondary" | "destructive"> = {
  AVAILABLE: "success",
  PENDING: "warning",
  NONE: "secondary",
  FAILED: "destructive",
};

/**
 * OTA / Build Check (§12).
 *
 * Version and build numbers come from what's recorded here; live store status comes from the
 * provider layer — which says "manual action required" rather than pretending, whenever the
 * official API can't answer or the server-side integration isn't deployed.
 */
export function OtaBuildCheck({
  apps,
  onChange,
  notify,
}: {
  apps: AppRecord[];
  onChange: (next: AppRecord) => void;
  notify: (tone: "success" | "error" | "info", text: string) => void;
}) {
  const rows = buildRows(apps);
  const [busy, setBusy] = useState<string | null>(null);

  async function refresh(row: OtaRow) {
    const key = `${row.app.id}:${row.platform}`;
    setBusy(key);
    const result = await providerFor(row.platform).getAppStatus(row.app.id);
    setBusy(null);

    if (!result.ok || !result.data) {
      notify(result.manual ? "info" : "error", `${PLATFORM_LABELS[row.platform]} — ${result.message}`);
      return;
    }

    const data = result.data;
    onChange({
      ...row.app,
      platforms: {
        ...row.app.platforms,
        [row.platform]: {
          ...row.app.platforms[row.platform],
          status: data.status,
          currentVersion: data.version || row.app.platforms[row.platform].currentVersion,
          currentBuild: data.build || row.app.platforms[row.platform].currentBuild,
          releasedAt: data.releasedAt || row.app.platforms[row.platform].releasedAt,
          storeUrl: data.storeUrl || row.app.platforms[row.platform].storeUrl,
          lastSyncedAt: new Date().toISOString(),
        },
      },
    });
    notify("success", `${PLATFORM_LABELS[row.platform]} status synced from the store.`);
  }

  function checkUpdate(row: OtaRow) {
    if (!row.latestVersion) {
      notify("info", `No versions recorded for ${PLATFORM_LABELS[row.platform]} yet — add one on the Versions tab.`);
      return;
    }
    if (!row.liveVersion) {
      notify("info", `No live version recorded for ${PLATFORM_LABELS[row.platform]}. Refresh status or set it by hand.`);
      return;
    }
    notify(
      row.updateAvailable ? "success" : "info",
      row.updateAvailable
        ? `${row.latestVersion} (build ${row.latestBuild || "—"}) is newer than the ${row.liveVersion} the store is serving.`
        : `${PLATFORM_LABELS[row.platform]} is up to date at ${row.liveVersion}.`
    );
  }

  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          No platforms enabled yet. Register an app and pick its stores to see build and OTA status here.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">OTA / Build Check</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {apps.length > 1 && <TableHead>App</TableHead>}
                <TableHead>Platform</TableHead>
                <TableHead className="text-right">Live Version</TableHead>
                <TableHead className="text-right">Latest Build</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>OTA</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const key = `${row.app.id}:${row.platform}`;
                return (
                  <TableRow key={key}>
                    {apps.length > 1 && <TableCell className="font-medium">{row.app.basics.name}</TableCell>}
                    <TableCell>{PLATFORM_LABELS[row.platform]}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.liveVersion || "—"}
                      {row.updateAvailable && (
                        <span className="ml-2 text-xs font-medium text-blue-600">→ {row.latestVersion}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{row.latestBuild || "—"}</TableCell>
                    <TableCell>
                      <StatusBadge status={row.app.platforms[row.platform].status} />
                    </TableCell>
                    <TableCell>
                      <Badge variant={OTA_VARIANT[row.ota]} className="text-[10px]">
                        {row.ota === "NONE" ? "—" : row.ota.toLowerCase()}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => checkUpdate(row)}>
                          <Search className="mr-1 h-3.5 w-3.5" />
                          Check Update
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          disabled={busy === key}
                          onClick={() => refresh(row)}
                        >
                          {busy === key ? (
                            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <RefreshCw className="mr-1 h-3.5 w-3.5" />
                          )}
                          Refresh Status
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" asChild>
                          <a href={row.storeUrl || CONSOLE_URLS[row.platform]} target="_blank" rel="noreferrer">
                            <ExternalLink className="mr-1 h-3.5 w-3.5" />
                            View Release
                          </a>
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className={cn("h-7 px-2 text-xs", !row.buildLogUrl && "pointer-events-none opacity-40")}
                          asChild
                        >
                          <a href={row.buildLogUrl || "#"} target="_blank" rel="noreferrer">
                            <FileText className="mr-1 h-3.5 w-3.5" />
                            Build Logs
                          </a>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <p className="flex items-start gap-2 border-t p-4 text-xs leading-relaxed text-muted-foreground">
          <Rocket className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>
            "Check Update" compares the newest build you've recorded against the version the store is serving.
            "Refresh Status" asks the store's official API through our backend — where that integration isn't live
            yet, it tells you to check the console instead of guessing.
          </span>
        </p>
      </CardContent>
    </Card>
  );
}
