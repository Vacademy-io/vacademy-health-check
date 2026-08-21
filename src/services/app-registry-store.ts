/**
 * Persistence adapter for the app registry.
 *
 * There is no `app-registry` backend yet, so the default store is this browser's localStorage:
 * the module is fully usable from day one with nothing to deploy. Heavy data — the actual image
 * bytes — never lands here; assets go to media-service and only their `{fileId, url}` is stored,
 * so the registry stays a few KB of JSON and every teammate sees the same pixels.
 *
 * When the server side lands, set `VITE_APP_REGISTRY_REMOTE=true` and implement these five
 * endpoints under `API_PREFIXES.APP_REGISTRY`. Nothing else in the module changes:
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

export const REMOTE_ENABLED = import.meta.env.VITE_APP_REGISTRY_REMOTE === "true";

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
