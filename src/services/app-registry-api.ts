/**
 * React Query surface over the app registry. Mirrors the conventions of the other `*-api` modules
 * so the module doesn't feel bolted on.
 *
 * Writes always upsert the whole `AppRecord`. The record is a few KB of JSON and edits touch
 * several nested collections at once (an asset changes both `assets` and the checklist state), so
 * PATCH-style granularity would cost more than it saves.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteApp,
  getApp,
  listApps,
  replaceAll,
  saveApp,
  uploadImage,
} from "@/services/app-registry-store";
import { providerFor } from "@/services/store-providers";
import { emptyApp, type AppRecord, type Platform } from "@/types/app-registry";

const KEY = ["app-registry"] as const;

export function useApps() {
  return useQuery({ queryKey: KEY, queryFn: listApps });
}

export function useApp(id: string | undefined) {
  return useQuery({
    queryKey: [...KEY, id],
    queryFn: () => getApp(id!),
    enabled: Boolean(id),
  });
}

export function useSaveApp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: saveApp,
    onSuccess: (app) => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.setQueryData([...KEY, app.id], app);
    },
  });
}

export function useDeleteApp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteApp,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useImportApps() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: replaceAll,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

/** Uploads a source image or a generated asset and hands back the descriptor to store on the record. */
export function useUploadImage() {
  return useMutation({
    mutationFn: ({ blob, filename }: { blob: Blob; filename: string }) => uploadImage(blob, filename),
  });
}

/** Pulls live status from a store provider, falling back to a "manual action required" answer. */
export function useRefreshStoreStatus() {
  return useMutation({
    mutationFn: async ({ platform, appId }: { platform: Platform; appId: string }) =>
      providerFor(platform).getAppStatus(appId),
  });
}

export function newApp(): AppRecord {
  const now = new Date().toISOString();
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `app-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return emptyApp(id, now);
}

export function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
