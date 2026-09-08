import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/axios";
import { API_PREFIXES } from "@/lib/constants";

/** One topic of the public 3-minute Tutezy lesson (ai-service tutor_demo_topic). */
export interface DemoTopic {
  key: string;
  title: string;
  emoji?: string | null;
  language: "en" | "hi";
  sort_order: number;
  is_active: boolean;
  updated_at?: string;
  /** Latest compiled plan for this topic, if any. */
  plan_status?: string | null;
  plan_error?: string | null;
  ready: boolean;
  source_chars: number;
  /** Only when fetched with_source. */
  source_text?: string;
}

export interface DemoConfig {
  enabled: boolean;
  institute_id: string;
  package_session_id: string;
  minutes: number;
  per_ip_per_day: number;
  daily_cap: number;
  teacher_name: string;
}

const KEY = ["super-admin", "demo-topics"] as const;

export function useDemoTopics(withSource = false) {
  return useQuery({
    queryKey: [...KEY, withSource],
    queryFn: async () => {
      const { data } = await api.get<{ topics: DemoTopic[]; config: DemoConfig }>(`${API_PREFIXES.AI}/demo-topics`, {
        params: { with_source: withSource },
      });
      return data;
    },
    refetchInterval: 30_000,
  });
}

export interface DemoTopicUpsert {
  title: string;
  source_text: string;
  emoji?: string | null;
  language?: "en" | "hi";
  sort_order?: number;
  is_active?: boolean;
  compile?: boolean;
}

export function useUpsertDemoTopic() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ key, ...body }: DemoTopicUpsert & { key: string }) => {
      const { data } = await api.put<{ key: string; compiling: boolean }>(
        `${API_PREFIXES.AI}/demo-topics/${encodeURIComponent(key)}`,
        body
      );
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useCompileDemoTopic() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (key: string) => {
      const { data } = await api.post<{ key: string; compiling: boolean }>(
        `${API_PREFIXES.AI}/demo-topics/${encodeURIComponent(key)}/compile`
      );
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteDemoTopic() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (key: string) => {
      await api.delete(`${API_PREFIXES.AI}/demo-topics/${encodeURIComponent(key)}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
