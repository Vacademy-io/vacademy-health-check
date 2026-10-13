import { useQuery } from "@tanstack/react-query";
import api from "@/lib/axios";

/**
 * user id → full name for actor ids (who changed a module, a setting, a preset).
 *
 * Uses auth-service POST /v1/user-details/get-basic-details: authenticated (not permitAll), takes
 * a JSON array of ids and returns only {id, name, face_file_id} — the same endpoint the admin
 * dashboard uses for announcement recipients. It resolves ANY user, which matters here: platform
 * staff acting from this portal are usually not members of the institute, so the institute's own
 * user list would miss them. The public /v1/users/by-ids (permitAll) is deliberately not used.
 *
 * Every <ActorName> asks for one id; requests made in the same tick are coalesced into one POST.
 */
const BASIC_DETAILS_URL = "/auth-service/v1/user-details/get-basic-details";
const CHUNK = 200;
const BATCH_WINDOW_MS = 15;

interface BasicDetails {
  id?: string | null;
  name?: string | null;
}

type Waiter = { resolve: (name: string | null) => void; reject: (err: unknown) => void };

const waiting = new Map<string, Waiter[]>();
let timer: ReturnType<typeof setTimeout> | null = null;

async function flush() {
  timer = null;
  const batch = new Map(waiting);
  waiting.clear();
  const ids = [...batch.keys()];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    try {
      const { data } = await api.post<BasicDetails[]>(BASIC_DETAILS_URL, chunk);
      const names = new Map<string, string>();
      for (const u of Array.isArray(data) ? data : []) {
        const name = typeof u?.name === "string" ? u.name.trim() : "";
        if (u?.id && name) names.set(u.id, name);
      }
      // Unknown or deleted users are simply absent from the response → null (falls back to the short id).
      for (const id of chunk) batch.get(id)?.forEach((w) => w.resolve(names.get(id) ?? null));
    } catch (err) {
      for (const id of chunk) batch.get(id)?.forEach((w) => w.reject(err));
    }
  }
}

function loadUserName(id: string): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const list = waiting.get(id);
    if (list) list.push({ resolve, reject });
    else waiting.set(id, [{ resolve, reject }]);
    if (!timer) timer = setTimeout(flush, BATCH_WINDOW_MS);
  });
}

export function useUserName(id: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: ["user-name", id],
    queryFn: () => loadUserName(id as string),
    enabled: enabled && !!id,
    staleTime: 30 * 60_000,
    gcTime: 60 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
}
