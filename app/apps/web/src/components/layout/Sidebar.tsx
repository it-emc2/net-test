import { NavLink } from "react-router-dom";
import { LogOut } from "lucide-react";
import { useAuth } from "@/features/auth/AuthContext";
import { NAV_ITEMS } from "./nav";
import { cn } from "@/lib/utils";

/** Persistent navigation rail — the app's signature surface. */
export function Sidebar({
  collapsed = false,
  onNavigate,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const { user, isAdmin, logout } = useAuth();
  const items = NAV_ITEMS.filter((i) => !i.adminOnly || isAdmin);

  const initials =
    [user?.firstName?.[0], user?.lastName?.[0]].filter(Boolean).join("") ||
    user?.email?.[0]?.toUpperCase() ||
    "?";

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-sidebar text-sidebar-foreground border-r">
      {/* Brand */}
      <div
        className={cn(
          "flex h-16 shrink-0 items-center border-b",
          collapsed ? "justify-center px-0" : "gap-3 px-4",
        )}
      >
        {collapsed ? (
          <img src="/favicon.svg" alt="emc²" className="size-9 rounded-lg" />
        ) : (
          <>
            <span className="h-8 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
            {/* White badge keeps the navy logo legible on the dark sidebar too. */}
            <div className="rounded-lg bg-white px-2.5 py-1.5 shadow-sm ring-1 ring-black/5">
              <img
                src="/assets/logo.png"
                alt="emc² – Dienstleister fürs Leben"
                className="h-8 w-auto"
              />
            </div>
          </>
        )}
      </div>

      {/* Nav */}
      <nav className={cn("flex-1 space-y-1 py-4", collapsed ? "px-2" : "px-3")}>
        {items.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            onClick={onNavigate}
            title={collapsed ? label : undefined}
            className={({ isActive }) =>
              cn(
                "group flex items-center rounded-md text-sm font-medium transition-colors",
                collapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )
            }
          >
            {({ isActive }) => (
              <>
                {!collapsed && (
                  <span
                    className={cn(
                      "h-4 w-0.5 rounded-full transition-colors",
                      isActive ? "bg-primary" : "bg-transparent",
                    )}
                    aria-hidden
                  />
                )}
                <Icon className="size-4 shrink-0" />
                {!collapsed && <span>{label}</span>}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* User + logout */}
      <div className={cn("shrink-0 border-t p-3", collapsed && "flex flex-col items-center gap-2")}>
        {collapsed ? (
          <>
            <div
              className="flex size-9 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary"
              title={user?.name || user?.email || undefined}
            >
              {initials}
            </div>
            <button
              type="button"
              onClick={() => logout()}
              aria-label="Abmelden"
              title="Abmelden"
              className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <LogOut className="size-4" />
            </button>
          </>
        ) : (
          <div className="flex items-center gap-3 rounded-md px-2 py-2">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{user?.name || user?.email}</p>
              <p className="truncate text-xs text-muted-foreground">
                {isAdmin ? "Administrator" : "Benutzer"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => logout()}
              aria-label="Abmelden"
              title="Abmelden"
              className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
