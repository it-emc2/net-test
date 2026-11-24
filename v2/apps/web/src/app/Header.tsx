// The header (as in today's UI since U-008): logo and title on the left; on the right how
// saving stands (while an offer is open) and ONE user menu — name, colour theme, dark mode,
// automatic saving, reload, today's UI, log out.
// The menu is a native popover: the browser closes it on Escape or a tap outside, without any
// library in the start script.
import { LogOut, PanelsTopLeft, RotateCw } from "lucide-react";
import { lazy, Suspense } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { call } from "../shared/api/index.js";
import { Brand } from "./Brand.js";
import { useLogout, useSession } from "../features/auth/index.js";
// its own chunk: the save status needs the offer model, which the first page does not
const HeaderLeft = lazy(() => import("../features/offer/HeaderOffer.js").then((m) => ({ default: m.HeaderLeft })));
const SaveState = lazy(() => import("../features/offer/SaveState.js").then((m) => ({ default: m.SaveState })));
import { THEMES, usePrefs, type Mode } from "../shared/lib/prefs.js";
import { Switch } from "../shared/ui/index.js";
import { CLASSIC_HOME } from "../shared/lib/classic-ui.js";

/** Initials only — the full name is never shown (org rule). Prefers the e-mail's parts: m.muster → MM. */
export const initials = (email: string) => {
  const parts = email.split("@")[0]!.split(/[\s._-]+/).filter(Boolean);
  return (parts.length >= 2 ? parts[0]![0]! + parts[parts.length - 1]![0]! : (parts[0] ?? "?").slice(0, 2)).toUpperCase();
};

/** Reload with a fresh copy of the app: forget cached files and service workers first (as today's "App neu laden"). */
async function reloadApp() {
  try {
    if ("caches" in window) await Promise.all((await caches.keys()).map((n) => caches.delete(n)));
    if ("serviceWorker" in navigator) await Promise.all((await navigator.serviceWorker.getRegistrations()).map((r) => r.unregister()));
  } catch { /* reload anyway */ }
  window.location.reload();
}

const ROW = "flex min-h-12 items-center justify-between gap-4 rounded-lg px-2.5 py-1";
const ITEM = "flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-lg border-0 bg-transparent px-2.5 py-2 text-left font-medium text-foreground no-underline hover:bg-muted";
const SECTION = "m-0 px-2.5 pb-1 pt-3 text-[0.75rem] font-bold uppercase tracking-wider text-muted-foreground";

const SWATCH: Record<string, string> = {
  "": "conic-gradient(#2e7d32,#1565c0,#c2185b,#ef6c00,#2e7d32)", base: "#334155", wohnen: "#2e7d32", pflege: "#c2185b", gesundheit: "#1565c0", kfz: "#ef6c00",
};
const MODES: { value: Mode; label: string }[] = [{ value: "light", label: "Hell" }, { value: "dark", label: "Dunkel" }, { value: "system", label: "System" }];

function UserMenu() {
  const { user } = useSession();
  const logout = useLogout();
  const p = usePrefs();
  const version = useQuery({ queryKey: ["version"], queryFn: () => call("version"), staleTime: Infinity, retry: false });
  if (!user) return null;
  const ini = initials(user.email);
  return (
    <>
      <button
        type="button" popoverTarget="user-menu" aria-haspopup="true" aria-label={`Benutzermenü öffnen: ${ini}`}
        className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-full border-0 bg-primary text-[0.85rem] font-bold text-primary-foreground"
      >
        {ini}
      </button>
      <div
        id="user-menu" popover="auto" aria-label="Benutzermenü"
        className="fixed inset-auto right-3 top-16 m-0 w-[340px] max-w-[calc(100vw-24px)] rounded-2xl border border-border bg-card p-2 text-card-foreground shadow-xl"
      >
        <div className="flex items-center gap-3 px-2.5 pb-3 pt-2.5">
          <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-primary font-bold text-primary-foreground">{ini}</span>
          <div className="min-w-0">
            <p className="m-0 font-bold leading-tight">{ini}</p>
            <p className="m-0 break-all text-[0.85rem] text-muted-foreground">{user.email}</p>
          </div>
        </div>

        <p className={SECTION}>Darstellung</p>
        <div className="px-2.5 py-1">
          <p className="m-0 mb-1">Farbe</p>
          <div className="flex gap-2" role="group" aria-label="Farbe">
            {THEMES.map((t) => (
              <button
                key={t.value} type="button" aria-label={t.label} title={t.label} aria-pressed={p.theme === t.value} onClick={() => p.setTheme(t.value)}
                className={`size-11 cursor-pointer rounded-full border-2 border-card p-0 ${p.theme === t.value ? "ring-[3px] ring-foreground" : "ring-1 ring-border"}`}
                style={{ background: SWATCH[t.value] }}
              />
            ))}
          </div>
          <p className="m-0 mt-1 text-[0.75rem] text-muted-foreground">Bunt = je Angebotsart</p>
        </div>
        <div className="px-2.5 py-1">
          <p className="m-0 mb-1">Modus</p>
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1" role="group" aria-label="Modus">
            {MODES.map((m) => (
              <button
                key={m.value} type="button" aria-pressed={p.mode === m.value} onClick={() => p.setMode(m.value)}
                className={`min-h-11 cursor-pointer rounded-lg border-0 text-[0.95rem] ${p.mode === m.value ? "bg-card font-bold text-foreground shadow" : "bg-transparent text-muted-foreground"}`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <p className={SECTION}>Speichern</p>
        <label className={ROW} htmlFor="menu-autosave">
          <span>
            Automatisch speichern
            <span className="block text-[0.75rem] text-muted-foreground">Aus: „Speichern“ erscheint oben</span>
          </span>
          <Switch id="menu-autosave" label="Automatisch speichern" checked={p.autosave} onChange={p.setAutosave} />
        </label>

        <hr className="mx-1 my-2 border-0 border-t border-border" />
        <a className={ITEM} href={CLASSIC_HOME}><PanelsTopLeft aria-hidden className="size-5 text-muted-foreground" />Zur bisherigen Ansicht</a>
        <button type="button" className={ITEM} onClick={() => { void reloadApp(); }}><RotateCw aria-hidden className="size-5 text-muted-foreground" />App neu laden</button>
        <hr className="mx-1 my-2 border-0 border-t border-border" />
        <button type="button" className={`${ITEM} text-muted-foreground`} onClick={() => logout.mutate()}><LogOut aria-hidden className="size-5" />Abmelden</button>
        {version.data ? <p className="m-0 px-2.5 pb-1 pt-2 text-[0.75rem] text-muted-foreground">Version {version.data.buildId} · v2</p> : null}
      </div>
    </>
  );
}

export function Header() {
  return (
    // below 480 px (U-059): tighter gaps and no 12 rem minimum on the left, so the right side never overlaps; 480 px and up unchanged (U-056)
    <header className="sticky top-0 z-40 flex h-16 items-center justify-between gap-3 overflow-hidden border-b border-border bg-card/95 px-4 backdrop-blur max-[479px]:gap-2 max-[479px]:px-3">
      <div className="min-w-[12rem] flex-1 max-[479px]:min-w-0"><Suspense fallback={<Brand />}><HeaderLeft /></Suspense></div>
      <div className="flex min-w-0 shrink items-center gap-2">
        <Suspense fallback={null}><SaveState /></Suspense>
        <UserMenu />
      </div>
    </header>
  );
}
