// The admin area's server data: one cache entry per list, refreshed after each change.
import { useQuery } from "@tanstack/react-query";
import { call } from "../../shared/api/index.js";
import type { AdminUser, ConfigItem } from "./rules.js";

export const CONFIG_KEY = ["admin", "config"] as const;
export const USERS_KEY = ["admin", "users"] as const;

export function useAdminConfig() {
  return useQuery({ queryKey: CONFIG_KEY, queryFn: ({ signal }) => call("adminConfig", { signal }) as unknown as Promise<ConfigItem[]>, staleTime: 30_000, retry: false });
}
export function useAdminUsers() {
  return useQuery({ queryKey: USERS_KEY, queryFn: ({ signal }) => call("adminUsers", { signal }) as Promise<AdminUser[]>, staleTime: 0, retry: false });
}
