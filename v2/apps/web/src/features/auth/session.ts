// Who is logged in. One cached request; a 401 means "not logged in", not an error.
import type { PublicUser } from "@oc/api-contract";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiFailure, call } from "../../shared/api/index.js";

const KEY = ["session"] as const;

export function useSession() {
  const q = useQuery({
    queryKey: KEY,
    queryFn: async ({ signal }): Promise<PublicUser | null> => {
      try { return (await call("me", { signal })).user; }
      catch (err) { if (err instanceof ApiFailure && err.status === 401) return null; throw err; }
    },
    staleTime: 5 * 60_000,
    retry: false,
  });
  return { user: q.data ?? null, loading: q.isPending, error: q.error };
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { email: string; password: string }) => call("login", { body }),
    onSuccess: (data) => qc.setQueryData(KEY, data.user),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: () => call("logout"), onSuccess: () => qc.setQueryData(KEY, null) });
}
