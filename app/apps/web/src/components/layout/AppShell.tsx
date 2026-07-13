import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { Menu, X, PanelLeft } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { cn } from "@/lib/utils";

const COLLAPSE_KEY = "emc2.sidebarCollapsed";

/** Two-column app frame: collapsible sidebar (desktop) / swipeable drawer (mobile). */
export function AppShell() {
  const [open, setOpen] = useState(false); // mobile drawer
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  // Touch gestures: swipe right from the left edge to open the drawer;
  // swipe left anywhere to close it. Only meaningful on the mobile layout.
  useEffect(() => {
    let startX = 0;
    let startY = 0;
    let fromEdge = false;
    let tracking = false;

    const onStart = (e: TouchEvent) => {
      const isMobile = window.matchMedia("(max-width: 767px)").matches;
      if (!isMobile) return;
      const t = e.touches[0];
      startX = t.clientX;
      startY = t.clientY;
      fromEdge = startX <= 24;
      tracking = true;
    };
    const onEnd = (e: TouchEvent) => {
      if (!tracking) return;
      tracking = false;
      const t = e.changedTouches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      if (Math.abs(dx) < Math.abs(dy)) return; // mostly vertical → ignore
      if (fromEdge && dx > 60) setOpen(true);
      else if (dx < -60) setOpen(false);
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchend", onEnd);
    };
  }, []);

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      {/* Desktop sidebar — width animates between full and icon rail. */}
      <aside
        className={cn(
          "hidden md:block shrink-0 transition-[width] duration-200 ease-out",
          collapsed ? "w-16" : "w-64",
        )}
      >
        <Sidebar collapsed={collapsed} />
      </aside>

      {/* Mobile drawer */}
      <div
        className={cn(
          "fixed inset-0 z-40 md:hidden transition-opacity",
          open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} aria-hidden />
        <div
          className={cn(
            "absolute inset-y-0 left-0 w-64 transition-transform duration-200",
            open ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <Sidebar onNavigate={() => setOpen(false)} />
        </div>
      </div>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b bg-card/60 px-4 backdrop-blur md:px-6">
          {/* Mobile: open drawer. Desktop: collapse/expand rail. */}
          <button
            type="button"
            className="flex size-10 items-center justify-center rounded-md hover:bg-accent md:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Menü schließen" : "Menü öffnen"}
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
          <button
            type="button"
            className="hidden size-10 items-center justify-center rounded-md hover:bg-accent md:flex"
            onClick={() => setCollapsed((v) => !v)}
            aria-label={collapsed ? "Seitenleiste ausklappen" : "Seitenleiste einklappen"}
            title={collapsed ? "Ausklappen" : "Einklappen"}
          >
            <PanelLeft className="size-5" />
          </button>

          <div className="flex-1" />
          <ThemeSwitcher />
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="mx-auto w-full max-w-6xl animate-fade-in">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
