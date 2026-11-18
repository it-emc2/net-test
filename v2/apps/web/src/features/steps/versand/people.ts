// The people who may sign an offer, and who is signed in — asked once for the page (the contact
// person on top, and "Neue Version erstellen", which makes the offer the signed-in user's).
import { useQuery } from "@tanstack/react-query";
import { call } from "../../../shared/api/index.js";
import type { User } from "./rules.js";

export interface People { users: User[]; me: string | null }
export const PEOPLE_KEY = ["users-and-me"] as const;
export const usePeople = () => useQuery<People>({ queryKey: PEOPLE_KEY, staleTime: 10 * 60_000, retry: false,
  queryFn: async ({ signal }) => { const [users, me] = await Promise.all([call("users", { signal }) as unknown as Promise<User[]>, call("me", { signal }).then((r) => r.user?.email ?? null).catch(() => null)]); return { users, me }; } });
