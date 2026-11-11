/**
 * iOS build from the dashboard — talks to community_service's
 * `/app-registry/apps/{id}/ios-build` endpoints. The build itself runs on a GitHub-hosted macOS
 * runner (`ios-white-label-build.yml`), so the person pressing the button needs no Mac and no
 * GitHub account: the server dispatches with its own token and reads the result back from
 * GitHub, Firebase and App Store Connect.
 */
import api from "@/lib/axios";
import { API_PREFIXES } from "@/lib/constants";

export interface IosBuildRun {
  run: {
    id: number;
    title: string;
    status: string; // queued | in_progress | completed
    conclusion: string; // success | failure | cancelled | ""
    htmlUrl: string;
    createdAt: string;
    updatedAt: string;
  };
  steps?: { name: string; status: string; conclusion: string }[];
}

export interface IosBuildStatus {
  bundleId: string;
  appHost: string;
  displayName: string;
  targetName: string;
  logoUrl: string;
  currentVersion: string;
  workflowUrl: string;
  serverConfig: { github: boolean; firebase: boolean };
  firebase: { project: string; registered?: boolean; appId?: string; error?: string };
  appStoreConnect: {
    configured: boolean;
    appId?: string | null;
    consoleUrl?: string;
    nextBuildNumber?: number;
    builds?: { version: string; processingState: string; expired: boolean; uploadedDate: string }[];
    error?: string;
  };
  repo: {
    targetOnMain?: boolean;
    pr?: { number: number; htmlUrl: string; state: string; merged: boolean };
    error?: string;
  };
  runs: IosBuildRun[];
  runsError?: string;
}

export interface IosBuildStart {
  requestId: string;
  createsTarget: boolean;
  runId: number | null;
  runUrl: string | null;
}

const base = (appId: string) => `${API_PREFIXES.APP_REGISTRY}/apps/${encodeURIComponent(appId)}/ios-build`;

/** The server's own wording (VacademyException → `ex`), else the transport error. */
export function buildErrorMessage(error: unknown): string {
  const data = (error as { response?: { data?: { ex?: string; message?: string } } }).response?.data;
  return data?.ex ?? data?.message ?? (error instanceof Error ? error.message : "Something went wrong");
}

export async function getIosBuildStatus(appId: string): Promise<IosBuildStatus> {
  const { data } = await api.get<IosBuildStatus>(base(appId));
  return data;
}

export async function startIosBuild(appId: string, version: string, buildNumber: string): Promise<IosBuildStart> {
  const { data } = await api.post<IosBuildStart>(`${base(appId)}/start`, { version, buildNumber });
  return data;
}

export async function createFirebaseIosApp(
  appId: string
): Promise<{ created: boolean; pending: boolean; appId: string | null; project: string }> {
  const { data } = await api.post(`${base(appId)}/firebase`);
  return data;
}
