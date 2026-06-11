import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import api from "@/lib/axios";
import { API_PREFIXES } from "@/lib/constants";
import type { FileItemDTO, SuperAdminPageResponse, UploadedFileDTO } from "@/types/api";

export interface FileSearchParams {
  page: number;
  size: number;
  search?: string;
  fileType?: string;
  source?: string;
  sourceId?: string;
  startDate?: string;
  endDate?: string;
  sortBy?: string;
  sortDirection?: "ASC" | "DESC";
}

export function useFilesSearch(params: FileSearchParams) {
  return useQuery({
    queryKey: ["super-admin", "files", params],
    queryFn: async () => {
      const { data } = await api.get<SuperAdminPageResponse<FileItemDTO>>(
        `${API_PREFIXES.MEDIA}/files`,
        {
          params: {
            page: params.page,
            size: params.size,
            search: params.search || undefined,
            fileType: params.fileType || undefined,
            source: params.source || undefined,
            sourceId: params.sourceId || undefined,
            startDate: params.startDate || undefined,
            endDate: params.endDate || undefined,
            sortBy: params.sortBy || undefined,
            sortDirection: params.sortDirection || undefined,
          },
        }
      );
      return data;
    },
    placeholderData: keepPreviousData,
  });
}

export async function fetchFileUrl(fileId: string, expiryDays = 7): Promise<string> {
  const { data } = await api.get<{ url: string }>(
    `${API_PREFIXES.MEDIA}/files/${fileId}/url`,
    { params: { expiryDays } }
  );
  return data.url;
}

export function useUploadFile() {
  return useMutation({
    mutationFn: async ({
      file,
      visibility,
      onProgress,
    }: {
      file: File;
      visibility: "PUBLIC" | "PRIVATE";
      onProgress?: (percent: number) => void;
    }) => {
      const formData = new FormData();
      formData.append("file", file);
      const { data } = await api.post<UploadedFileDTO>(
        `${API_PREFIXES.MEDIA}/files/upload`,
        formData,
        {
          params: { visibility },
          timeout: 300000,
          onUploadProgress: (e) => {
            if (e.total && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
          },
        }
      );
      return data;
    },
  });
}

export function useDeleteFile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (fileId: string) => {
      await api.delete(`${API_PREFIXES.MEDIA}/files/${fileId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin", "files"] });
    },
  });
}
