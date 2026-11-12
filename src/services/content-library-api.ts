import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/axios";
import { API_PREFIXES } from "@/lib/constants";
import type { InstituteLibraryAccess, LibraryTree } from "@/types/content-library";

const enc = encodeURIComponent;
const httpStatus = (err: unknown) => (err as { response?: { status?: number } } | null)?.response?.status;
/** 404 until the assessment-service build with these endpoints is deployed; 403 for non-staff. Neither is worth a retry. */
const retry = (count: number, err: unknown) => ![403, 404].includes(httpStatus(err) ?? 0) && count < 2;

export const contentLibraryKeys = {
  tree: ["super-admin", "content-library", "tree"] as const,
  institute: (id: string) => ["super-admin", "content-library", "institute", id] as const,
};

export function useContentLibraryTree() {
  return useQuery({
    queryKey: contentLibraryKeys.tree,
    queryFn: async () => (await api.get<LibraryTree>(`${API_PREFIXES.CONTENT_LIBRARY}/tree`)).data,
    staleTime: 60_000,
    retry,
  });
}

export function useInstituteLibraryAccess(instituteId: string) {
  return useQuery({
    queryKey: contentLibraryKeys.institute(instituteId),
    queryFn: async () =>
      (await api.get<InstituteLibraryAccess>(`${API_PREFIXES.CONTENT_LIBRARY}/institutes/${enc(instituteId)}`)).data,
    enabled: !!instituteId,
    retry,
  });
}

/** Shows (on = true) or hides one course or topic, with everything below it. */
export function useSetLibraryAccess(instituteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ nodeId, on }: { nodeId: string; on: boolean }) => {
      const path = `${API_PREFIXES.CONTENT_LIBRARY}/institutes/${enc(instituteId)}/${on ? "show" : "hide"}`;
      await api.post(path, { node_id: nodeId });
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: contentLibraryKeys.institute(instituteId) });
      // Hidden counts on the tree change too.
      qc.invalidateQueries({ queryKey: contentLibraryKeys.tree });
    },
  });
}

export { httpStatus as contentLibraryHttpStatus };
