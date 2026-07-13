// Session state for the whole app. On mount it asks the API who we are
// (GET /api/auth/me via the session cookie); login/logout update in place.
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { LoginResponse, MeResponse, PublicUser } from "@emc2/shared";
import { api, ApiRequestError } from "@/lib/api";

interface AuthState {
  user: PublicUser | null;
  loading: boolean;
  isAdmin: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api
      .get<MeResponse>("/api/auth/me")
      .then((res) => {
        if (!cancelled) setUser(res.user);
      })
      .catch((err) => {
        // 401 simply means "not logged in" — anything else is unexpected.
        if (!(err instanceof ApiRequestError) || err.status !== 401) {
          // eslint-disable-next-line no-console
          console.error("Auth check failed:", err);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function login(email: string, password: string): Promise<void> {
    const res = await api.post<LoginResponse>("/api/auth/login", { email, password });
    setUser(res.user);
  }

  async function logout(): Promise<void> {
    try {
      await api.post("/api/auth/logout");
    } finally {
      setUser(null);
    }
  }

  const value: AuthState = {
    user,
    loading,
    isAdmin: user?.role === "admin",
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
