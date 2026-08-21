/**
 * Derived alerts (§24).
 *
 * Nothing here polls or pushes — the alerts are computed from the records themselves, so the
 * moment a status changes or a credential date passes, the dashboard says so. That keeps the
 * "what needs me today" list honest even before any store API integration exists.
 */

import { platformProgress } from "@/lib/app-checklist";
import { compareVersions } from "@/lib/version-compare";
import { readIntegrations } from "@/services/app-registry-store";
import { PLATFORM_LABELS, activePlatforms, type AppRecord, type Platform } from "@/types/app-registry";

export type AlertLevel = "critical" | "warning" | "info";

export interface AppAlert {
  id: string;
  level: AlertLevel;
  appId: string | null;
  appName: string;
  platform: Platform | null;
  title: string;
  detail: string;
}

const DAY = 24 * 60 * 60 * 1000;

function daysSince(iso: string): number | null {
  if (!iso) return null;
  const time = new Date(iso).getTime();
  return Number.isFinite(time) ? Math.floor((Date.now() - time) / DAY) : null;
}

export function computeAlerts(apps: AppRecord[]): AppAlert[] {
  const alerts: AppAlert[] = [];

  for (const app of apps) {
    if (app.archived) continue;
    const name = app.basics.name || app.basics.displayName || "Untitled app";

    for (const platform of activePlatforms(app)) {
      const config = app.platforms[platform];
      const label = PLATFORM_LABELS[platform];

      if (config.status === "REJECTED") {
        const rejection = app.versions
          .filter((v) => v.platform === platform && v.rejectionReason)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
        alerts.push({
          id: `${app.id}-${platform}-rejected`,
          level: "critical",
          appId: app.id,
          appName: name,
          platform,
          title: `${label} submission rejected`,
          detail: rejection?.rejectionReason || "Open the version to record the guideline the store cited.",
        });
      }

      if (config.status === "SUSPENDED" || config.status === "REMOVED") {
        alerts.push({
          id: `${app.id}-${platform}-${config.status}`,
          level: "critical",
          appId: app.id,
          appName: name,
          platform,
          title: `${label} listing ${config.status.toLowerCase()}`,
          detail: "The app is no longer downloadable. This needs an answer to the store today.",
        });
      }

      if (config.status === "FAILED") {
        alerts.push({
          id: `${app.id}-${platform}-failed`,
          level: "critical",
          appId: app.id,
          appName: name,
          platform,
          title: `${label} build failed`,
          detail: "Upload or processing failed. Check the build logs on the Versions tab.",
        });
      }

      if (config.status === "APPROVED") {
        alerts.push({
          id: `${app.id}-${platform}-approved`,
          level: "info",
          appId: app.id,
          appName: name,
          platform,
          title: `${label} approved`,
          detail: "Review passed — release it when you're ready.",
        });
      }

      if (config.status === "BUILD_PROCESSING") {
        alerts.push({
          id: `${app.id}-${platform}-processing`,
          level: "info",
          appId: app.id,
          appName: name,
          platform,
          title: `${label} build processing`,
          detail: "The store is still processing the binary.",
        });
      }

      // A review that's been sitting far past the usual turnaround is worth chasing.
      const submission = app.submissions
        .filter((s) => s.platform === platform && !s.decidedAt)
        .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))[0];
      const waiting = submission ? daysSince(submission.submittedAt) : null;
      if (config.status === "IN_REVIEW" && waiting != null && waiting > 7) {
        alerts.push({
          id: `${app.id}-${platform}-slow-review`,
          level: "warning",
          appId: app.id,
          appName: name,
          platform,
          title: `${label} in review for ${waiting} days`,
          detail: "Well past the usual turnaround. Consider contacting the store's review team.",
        });
      }

      const latest = app.versions
        .filter((v) => v.platform === platform)
        .sort((a, b) => compareVersions(b.version, a.version) || b.createdAt.localeCompare(a.createdAt))[0];
      if (latest?.version && config.currentVersion && compareVersions(latest.version, config.currentVersion) > 0) {
        alerts.push({
          id: `${app.id}-${platform}-update`,
          level: "warning",
          appId: app.id,
          appName: name,
          platform,
          title: `${label} update available`,
          detail: `Build ${latest.version} is ready but the store is still serving ${config.currentVersion}.`,
        });
      }

      if (latest?.otaStatus === "FAILED") {
        alerts.push({
          id: `${app.id}-${platform}-ota-failed`,
          level: "warning",
          appId: app.id,
          appName: name,
          platform,
          title: `${label} OTA update failed`,
          detail: `Version ${latest.version || "—"} never reached devices.`,
        });
      }

      // Nearly-ready listings are the cheapest wins on the board — surface them.
      const progress = platformProgress(app, platform);
      if (config.status !== "LIVE" && progress.percent >= 90 && progress.blocking.length > 0) {
        alerts.push({
          id: `${app.id}-${platform}-nearly`,
          level: "info",
          appId: app.id,
          appName: name,
          platform,
          title: `${label} is ${progress.percent}% ready`,
          detail: `Only ${progress.blocking.length} item${progress.blocking.length === 1 ? "" : "s"} left: ${progress.blocking
            .slice(0, 3)
            .map((b) => b.label)
            .join(", ")}.`,
        });
      }
    }
  }

  // Credential expiry is app-independent but breaks every status check at once.
  const integrations = readIntegrations();
  for (const record of Object.values(integrations)) {
    if (!record?.expiresAt) continue;
    const remaining = Math.floor((new Date(record.expiresAt).getTime() - Date.now()) / DAY);
    if (remaining <= 30) {
      alerts.push({
        id: `integration-${record.platform}-expiry`,
        level: remaining <= 0 ? "critical" : "warning",
        appId: null,
        appName: "Integrations",
        platform: record.platform,
        title:
          remaining <= 0
            ? `${PLATFORM_LABELS[record.platform]} API credential expired`
            : `${PLATFORM_LABELS[record.platform]} API credential expires in ${remaining} days`,
        detail: `${record.accountName || "Account"} — rotate the key referenced by ${record.secretRef || "the server secret"}.`,
      });
    }
  }

  const rank: Record<AlertLevel, number> = { critical: 0, warning: 1, info: 2 };
  return alerts.sort((a, b) => rank[a.level] - rank[b.level]);
}
