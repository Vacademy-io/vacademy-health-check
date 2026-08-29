/**
 * Persistence adapter for the app registry.
 *
 * The shared registry in community_service is the default. It has to be: an institute admin reads
 * their own app's status off these records (admin_core_service proxies
 * `/app-registry/by-institute` into Settings -> App Status), and a record sitting in one ops
 * person's localStorage is a record that institute will never see. Heavy data — the actual image
 * bytes — never lands here either way; assets go to media-service and only their `{fileId, url}`
 * is stored, so a record stays a few KB of JSON.
 *
 * `VITE_APP_REGISTRY_REMOTE=false` forces the old per-browser store, for working against a
 * backend that isn't up. Anything registered while forced local stays invisible to institutes
 * until it is pushed — see {@link pushLocalBacklog}.
 *
 * The five endpoints, all under `API_PREFIXES.APP_REGISTRY`:
 *
 *   GET    /apps            -> AppRecord[]
 *   GET    /apps/{id}       -> AppRecord
 *   PUT    /apps/{id}       -> AppRecord   (full upsert)
 *   DELETE /apps/{id}       -> 204
 *   POST   /apps/import     -> AppRecord[] (bulk replace)
 */

import api from "@/lib/axios";
import { API_PREFIXES } from "@/lib/constants";
import type { AppRecord, Platform } from "@/types/app-registry";

const STORAGE_KEY = "vacademy.app-registry.v1";

export const REMOTE_ENABLED = import.meta.env.VITE_APP_REGISTRY_REMOTE !== "false";

/** Where the data actually lives right now — surfaced in the UI so nobody is surprised by it. */
export const STORAGE_MODE: "remote" | "local" = REMOTE_ENABLED ? "remote" : "local";

function readLocal(): AppRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as AppRecord[]) : [];
  } catch {
    // A corrupt blob shouldn't brick the page — start clean rather than throwing on every render.
    return [];
  }
}

function writeLocal(apps: AppRecord[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(apps));
}

export async function listApps(): Promise<AppRecord[]> {
  if (REMOTE_ENABLED) {
    return (await api.get<AppRecord[]>(`${API_PREFIXES.APP_REGISTRY}/apps`)).data;
  }
  return readLocal();
}

export async function getApp(id: string): Promise<AppRecord | null> {
  if (REMOTE_ENABLED) {
    return (await api.get<AppRecord>(`${API_PREFIXES.APP_REGISTRY}/apps/${id}`)).data;
  }
  return readLocal().find((a) => a.id === id) ?? null;
}

export async function saveApp(app: AppRecord): Promise<AppRecord> {
  const next: AppRecord = { ...app, updatedAt: new Date().toISOString() };
  if (REMOTE_ENABLED) {
    return (await api.put<AppRecord>(`${API_PREFIXES.APP_REGISTRY}/apps/${app.id}`, next)).data;
  }
  const apps = readLocal();
  const idx = apps.findIndex((a) => a.id === app.id);
  if (idx >= 0) apps[idx] = next;
  else apps.push(next);
  writeLocal(apps);
  return next;
}

export async function deleteApp(id: string): Promise<void> {
  if (REMOTE_ENABLED) {
    await api.delete(`${API_PREFIXES.APP_REGISTRY}/apps/${id}`);
    return;
  }
  writeLocal(readLocal().filter((a) => a.id !== id));
}

/** Bulk replace — the receiving half of Export/Import, used to move the registry between machines. */
export async function replaceAll(apps: AppRecord[]): Promise<AppRecord[]> {
  if (REMOTE_ENABLED) {
    return (await api.post<AppRecord[]>(`${API_PREFIXES.APP_REGISTRY}/apps/import`, apps)).data;
  }
  writeLocal(apps);
  return apps;
}

/* ------------------------------------------------- browser-local leftovers */

/**
 * Apps still sitting in this browser's localStorage. Non-empty in remote mode means someone
 * registered apps before the shared registry existed (or while it was forced off) and no institute
 * can see any of them yet.
 */
export function readLocalBacklog(): AppRecord[] {
  return readLocal();
}

export interface BacklogPushResult {
  pushed: number;
  /** Names (or ids) of the records the server refused, so the operator knows what to chase. */
  failed: string[];
  /** Records the registry already holds. Left exactly as they are on the server — see below. */
  skipped: string[];
}

/**
 * Moves the browser-local backlog into the shared registry, one record at a time.
 *
 * Three things this deliberately does not do, each of which loses somebody's work:
 *
 * - It is not the bulk import endpoint. That one replaces the entire registry, so the second
 *   person to run this would wipe whatever the first just pushed.
 * - It does not push an id the registry already holds. PUT is a whole-document upsert, and two
 *   people who ever moved the registry between machines through Export/Import are both holding
 *   the same ids — so a blind push would quietly replace a colleague's current record with this
 *   browser's older copy of it. Those are reported instead, for a human to reconcile.
 * - It clears localStorage only after a sweep that left nothing behind. A skipped or failed
 *   record means this browser is still the only place holding whatever it knows.
 */
export async function pushLocalBacklog(): Promise<BacklogPushResult> {
  if (!REMOTE_ENABLED) {
    return { pushed: 0, failed: [], skipped: [] };
  }

  const backlog = readLocal();
  const failed: string[] = [];
  const skipped: string[] = [];
  let pushed = 0;

  for (const app of backlog) {
    const label = app.basics?.name?.trim() || app.id;
    try {
      if (await existsInSharedRegistry(app.id)) {
        skipped.push(label);
        continue;
      }
      await api.put<AppRecord>(`${API_PREFIXES.APP_REGISTRY}/apps/${app.id}`, app);
      pushed += 1;
    } catch {
      failed.push(label);
    }
  }

  if (failed.length === 0 && skipped.length === 0 && backlog.length > 0) {
    localStorage.removeItem(STORAGE_KEY);
  }
  return { pushed, failed, skipped };
}

/**
 * Whether the shared registry already has this id. Only a 404 counts as "no" — any other failure
 * rethrows, so a flaky call is reported as a failure rather than mistaken for an absent record and
 * answered by overwriting one.
 */
async function existsInSharedRegistry(id: string): Promise<boolean> {
  try {
    await api.get<AppRecord>(`${API_PREFIXES.APP_REGISTRY}/apps/${id}`);
    return true;
  } catch (error) {
    if ((error as { response?: { status?: number } })?.response?.status === 404) {
      return false;
    }
    throw error;
  }
}

/* --------------------------------------------------------------- media I/O */

export interface UploadedImage {
  fileId: string;
  url: string;
  width: number;
  height: number;
  bytes: number;
}

/**
 * Pushes an image to media-service and returns the durable descriptor stored on the record.
 * Public visibility — store assets are published artwork, and the URL has to survive being
 * pasted into Play Console or App Store Connect by someone who isn't logged into this dashboard.
 */
export async function uploadImage(blob: Blob, filename: string): Promise<UploadedImage> {
  const file = new File([blob], filename, { type: blob.type || "image/png" });
  const formData = new FormData();
  formData.append("file", file);

  const { data } = await api.post<{ id: string; url: string | null; width: number; height: number }>(
    `${API_PREFIXES.MEDIA}/files/upload`,
    formData,
    { params: { visibility: "PUBLIC" }, timeout: 300000 }
  );

  let url = data.url;
  if (!url) {
    const resolved = await api.get<{ url: string }>(`${API_PREFIXES.MEDIA}/files/${data.id}/url`, {
      params: { expiryDays: 3650 },
    });
    url = resolved.data.url;
  }

  return { fileId: data.id, url: url ?? "", width: data.width, height: data.height, bytes: blob.size };
}

/* ------------------------------------------------------- developer accounts */

/**
 * Non-secret metadata about a store integration.
 *
 * Note what is *not* here: no private keys, no client secrets, no service-account JSON, no
 * passwords, and absolutely no browser session cookies or tokens copied out of devtools (§20, §28).
 * Those live server-side, encrypted at rest, and are referenced from here only by their public
 * identifiers. Anything typed into this dashboard is readable by anyone with the page open.
 */
export interface IntegrationRecord {
  platform: Platform;
  accountName: string;
  /** Public identifier only — Issuer ID, Key ID, Team ID, Tenant ID, service-account email. */
  publicIdentifier: string;
  /** Name of the server-side secret this account maps to, e.g. an env var or vault path. */
  secretRef: string;
  /** ISO date the credential stops working — drives the expiry notifications (§24). */
  expiresAt: string;
  notes: string;
  updatedAt: string;
}

const INTEGRATIONS_KEY = "vacademy.app-registry.integrations.v1";

export function readIntegrations(): Partial<Record<Platform, IntegrationRecord>> {
  try {
    const raw = localStorage.getItem(INTEGRATIONS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function writeIntegration(record: IntegrationRecord) {
  const all = readIntegrations();
  all[record.platform] = { ...record, updatedAt: new Date().toISOString() };
  localStorage.setItem(INTEGRATIONS_KEY, JSON.stringify(all));
}
