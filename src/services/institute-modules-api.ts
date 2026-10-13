import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/axios";
import { API_PREFIXES } from "@/lib/constants";
import {
  isApiUnavailable,
  normalizeApplyResult,
  normalizeCatalogResponse,
  normalizeDisplaySettings,
  normalizeInstituteModules,
  normalizeModuleHistoryEntry,
  normalizeOverview,
  normalizePage,
  normalizePresets,
  normalizeRoles,
  normalizeSettingHistoryDetail,
  normalizeSettingHistoryEntry,
} from "@/lib/modules-catalog";
import type {
  RoleDisplaySettings,
  SaveDisplaySettingsRequest,
  SaveModulePresetRequest,
  UpdateInstituteModulesRequest,
} from "@/types/modules";

// Institute Modules & Configuration (spec §12). The backend may not be
// deployed yet: a 404 is a normal "not available" state, so queries do not
// retry it (callers check isApiUnavailable(error)).

const enc = encodeURIComponent;
const inst = (id: string) => `${API_PREFIXES.ADMIN_CORE}/institutes/${enc(id)}`;

const retry = (count: number, err: unknown) => !isApiUnavailable(err) && count < 2;

export const modulesKeys = {
  catalog: ["super-admin", "capabilities", "catalog"] as const,
  institute: (id: string) => ["super-admin", "institute-modules", id] as const,
  history: (id: string) => ["super-admin", "institute-modules", id, "history"] as const,
  overview: ["super-admin", "modules-overview"] as const,
  presets: ["super-admin", "module-presets"] as const,
  roles: (id: string) => ["super-admin", "institute-roles", id] as const,
  displaySettings: (id: string) => ["super-admin", "display-settings", id] as const,
  settingsHistory: (id: string) => ["super-admin", "settings-history", id] as const,
};

/** `{catalog, nav}` — the only source of module, feature and sidebar definitions. */
export function useCapabilityCatalog() {
  return useQuery({
    queryKey: modulesKeys.catalog,
    queryFn: async () => {
      const { data } = await api.get<unknown>(`${API_PREFIXES.CAPABILITIES}/catalog`);
      return normalizeCatalogResponse(data);
    },
    staleTime: 10 * 60_000,
    retry,
  });
}

export function useInstituteModules(instituteId: string) {
  return useQuery({
    queryKey: modulesKeys.institute(instituteId),
    queryFn: async () => {
      const { data } = await api.get<unknown>(`${inst(instituteId)}/modules`);
      return normalizeInstituteModules(data, instituteId);
    },
    enabled: !!instituteId,
    retry,
  });
}

export function useUpdateInstituteModules(instituteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: UpdateInstituteModulesRequest) => {
      const { data } = await api.put<unknown>(`${inst(instituteId)}/modules`, body);
      return normalizeInstituteModules(data, instituteId);
    },
    onSuccess: (data) => {
      qc.setQueryData(modulesKeys.institute(instituteId), data);
      qc.invalidateQueries({ queryKey: modulesKeys.history(instituteId) });
      qc.invalidateQueries({ queryKey: modulesKeys.overview });
    },
  });
}

export function useModuleHistory(instituteId: string, page: number, size = 20, enabled = true) {
  return useQuery({
    queryKey: [...modulesKeys.history(instituteId), { page, size }],
    queryFn: async () => {
      const { data } = await api.get<unknown>(`${inst(instituteId)}/modules/history`, { params: { page, size } });
      return normalizePage(data, normalizeModuleHistoryEntry);
    },
    enabled: enabled && !!instituteId,
    retry,
  });
}

/** Mode + enabled modules for a page of institutes (institutes list "Modules" column). */
export function useModulesOverview(instituteIds: string[]) {
  const ids = [...instituteIds].sort();
  return useQuery({
    queryKey: [...modulesKeys.overview, ids],
    queryFn: async () => {
      const { data } = await api.get<unknown>(`${API_PREFIXES.ADMIN_CORE}/modules/overview`, {
        params: { institute_ids: ids.join(",") },
      });
      return normalizeOverview(data);
    },
    enabled: ids.length > 0,
    staleTime: 60_000,
    retry,
  });
}

export function useModulePresets(enabled = true) {
  return useQuery({
    queryKey: modulesKeys.presets,
    queryFn: async () => {
      const { data } = await api.get<unknown>(`${API_PREFIXES.ADMIN_CORE}/module-presets`);
      return normalizePresets(data);
    },
    enabled,
    retry,
  });
}

export function useSaveModulePreset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ key, body }: { key: string; body: SaveModulePresetRequest }) => {
      await api.put(`${API_PREFIXES.ADMIN_CORE}/module-presets/${enc(key)}`, body);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: modulesKeys.presets }),
  });
}

export function useDeleteModulePreset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (key: string) => {
      await api.delete(`${API_PREFIXES.ADMIN_CORE}/module-presets/${enc(key)}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: modulesKeys.presets }),
  });
}

/** Listed modules on, every other non-core module off; feature rows and mode untouched. */
export function useApplyModulePreset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ key, instituteIds, reason }: { key: string; instituteIds: string[]; reason: string }) => {
      const { data } = await api.post<unknown>(`${API_PREFIXES.ADMIN_CORE}/module-presets/${enc(key)}/apply`, {
        institute_ids: instituteIds,
        reason,
      });
      return normalizeApplyResult(data, instituteIds);
    },
    onSuccess: (_r, vars) => {
      qc.invalidateQueries({ queryKey: modulesKeys.overview });
      for (const id of vars.instituteIds) {
        qc.invalidateQueries({ queryKey: modulesKeys.institute(id) });
      }
    },
  });
}

/** auth_service: Admin, Teacher, built-in staff roles and custom roles of one institute. */
export function useInstituteRoles(instituteId: string) {
  return useQuery({
    queryKey: modulesKeys.roles(instituteId),
    queryFn: async () => {
      const { data } = await api.get<unknown>(`${API_PREFIXES.AUTH}/institutes/${enc(instituteId)}/roles`);
      return normalizeRoles(data);
    },
    enabled: !!instituteId,
    retry,
  });
}

async function fetchDisplaySettings(instituteId: string, roleKey: string): Promise<RoleDisplaySettings> {
  const { data } = await api.get<unknown>(`${inst(instituteId)}/display-settings`, { params: { role_key: roleKey } });
  return normalizeDisplaySettings(data, roleKey);
}

export function useDisplaySettings(instituteId: string, roleKey: string | null) {
  return useQuery({
    queryKey: [...modulesKeys.displaySettings(instituteId), roleKey],
    queryFn: () => fetchDisplaySettings(instituteId, roleKey!),
    enabled: !!instituteId && !!roleKey,
    retry,
  });
}

/** One query per role key (matrix columns). */
export function useDisplaySettingsMany(instituteId: string, roleKeys: string[]) {
  return useQueries({
    queries: roleKeys.map((roleKey) => ({
      queryKey: [...modulesKeys.displaySettings(instituteId), roleKey],
      queryFn: () => fetchDisplaySettings(instituteId, roleKey),
      enabled: !!instituteId,
      retry,
    })),
  });
}

/** PUT with expected_version; a 409 VERSION_CONFLICT means the tenant saved in between. */
export function useSaveDisplaySettings(instituteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ roleKey, body }: { roleKey: string; body: SaveDisplaySettingsRequest }) => {
      const { data } = await api.put<unknown>(`${inst(instituteId)}/display-settings`, body, {
        params: { role_key: roleKey },
      });
      return normalizeDisplaySettings(data, roleKey);
    },
    onSuccess: (data, vars) => {
      qc.setQueryData([...modulesKeys.displaySettings(instituteId), vars.roleKey], data);
      qc.invalidateQueries({ queryKey: modulesKeys.settingsHistory(instituteId) });
    },
  });
}

export function useSettingsHistory(instituteId: string, settingKey: string, page: number, size = 20) {
  return useQuery({
    queryKey: [...modulesKeys.settingsHistory(instituteId), { settingKey, page, size }],
    queryFn: async () => {
      const { data } = await api.get<unknown>(`${inst(instituteId)}/settings/history`, {
        params: { setting_key: settingKey || undefined, page, size },
      });
      return normalizePage(data, normalizeSettingHistoryEntry);
    },
    enabled: !!instituteId,
    retry,
  });
}

export function useSettingsHistoryEntry(instituteId: string, historyId: string | null) {
  return useQuery({
    queryKey: [...modulesKeys.settingsHistory(instituteId), "entry", historyId],
    queryFn: async () => {
      const { data } = await api.get<unknown>(`${inst(instituteId)}/settings/history/${enc(historyId!)}`);
      return normalizeSettingHistoryDetail(data);
    },
    enabled: !!instituteId && !!historyId,
    retry,
  });
}

/** Restores the entry's old_value (writes a new PLATFORM history row). */
export function useRestoreSetting(instituteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ historyId, reason }: { historyId: string; reason: string }) => {
      await api.post(`${inst(instituteId)}/settings/history/${enc(historyId)}/restore`, { reason });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: modulesKeys.settingsHistory(instituteId) });
      qc.invalidateQueries({ queryKey: modulesKeys.displaySettings(instituteId) });
    },
  });
}
