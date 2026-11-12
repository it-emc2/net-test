import type { ReactNode } from "react";
import { Notice, Page } from "../../shared/ui/index.js";
import { LoginPage } from "./LoginPage.js";
import { useSession } from "./session.js";

/** Shows the page only to a logged-in user; otherwise the login form in its place (the address stays). */
export function RequireLogin({ children }: { children: ReactNode }) {
  const { user, loading, error } = useSession();
  if (loading) return <Page title="Einen Moment …" />;
  if (error) return <Page title="Keine Verbindung"><Notice kind="error">{error.message}</Notice></Page>;
  return user ? <>{children}</> : <LoginPage />;
}
