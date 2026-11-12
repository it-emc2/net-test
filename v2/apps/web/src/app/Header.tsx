// The header (as in today's UI since U-008): logo and title on the left; on the right how
// saving stands (while an offer is open) and ONE user menu — name, colour theme, dark mode,
// automatic saving, reload, today's UI, log out.
// The menu is a native popover: the browser closes it on Escape or a tap outside, without any
// library in the start script.
import { ChevronDown, LogOut, PanelsTopLeft, RotateCw } from "lucide-react";
import { Link } from "react-router";
import { useLogout, useSession } from "../features/auth/index.js";
// imported directly (not through the feature's index) so the start script gets only this small file
import { SaveState } from "../features/offer/SaveState.js";
import { THEMES, usePrefs } from "../shared/lib/prefs.js";
import { Switch } from "../shared/ui/index.js";

const initials = (name: string) => name.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("") || "?";

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

function UserMenu() {
  const { user } = useSession();
  const logout = useLogout();
  const p = usePrefs();
  if (!user) return null;
  const name = user.name || [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;
  return (
    <>
      <button
        type="button" popoverTarget="user-menu" aria-haspopup="true" aria-label={`Benutzermenü öffnen: ${name}`}
        className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-full border border-border bg-card py-1 pl-1 pr-3 text-foreground hover:bg-muted"
      >
        <span aria-hidden className="grid size-9 place-items-center rounded-full bg-primary text-[0.8rem] font-bold text-primary-foreground">{initials(name)}</span>
        <span className="hidden max-w-48 truncate sm:inline">{name}</span>
        <ChevronDown aria-hidden className="size-4 opacity-60" />
      </button>
      <div
        id="user-menu" popover="auto" aria-label="Benutzermenü"
        className="fixed inset-auto right-3 top-16 m-0 w-[340px] max-w-[calc(100vw-24px)] rounded-2xl border border-border bg-card p-2 text-card-foreground shadow-xl"
      >
        <div className="flex items-center gap-3 px-2.5 pb-3 pt-2.5">
          <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-primary font-bold text-primary-foreground">{initials(name)}</span>
          <div className="min-w-0">
            <p className="m-0 font-bold leading-tight">{name}</p>
            {name !== user.email ? <p className="m-0 break-all text-[0.85rem] text-muted-foreground">{user.email}</p> : null}
          </div>
        </div>

        <p className={SECTION}>Darstellung</p>
        <label className={ROW} htmlFor="menu-theme">
          <span>Farbthema</span>
          <select id="menu-theme" value={p.theme} onChange={(e) => p.setTheme(e.target.value)} className="min-h-10 cursor-pointer rounded-lg border border-input bg-card px-3 text-[0.9rem] text-foreground">
            {THEMES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </label>
        <label className={ROW} htmlFor="menu-dark">
          <span>Dunkler Modus</span>
          <Switch id="menu-dark" label="Dunkler Modus" checked={p.dark} onChange={p.setDark} />
        </label>

        <p className={SECTION}>Speichern</p>
        <label className={ROW} htmlFor="menu-autosave">
          <span>
            Automatisch speichern
            <span className="block text-[0.75rem] text-muted-foreground">Aus: Sie speichern selbst mit „Speichern“ oben.</span>
          </span>
          <Switch id="menu-autosave" label="Automatisch speichern" checked={p.autosave} onChange={p.setAutosave} />
        </label>

        <hr className="mx-1 my-2 border-0 border-t border-border" />
        <a className={ITEM} href="/"><PanelsTopLeft aria-hidden className="size-5 text-muted-foreground" />Zur bisherigen Ansicht</a>
        <button type="button" className={ITEM} onClick={() => { void reloadApp(); }}><RotateCw aria-hidden className="size-5 text-muted-foreground" />App neu laden</button>
        <button type="button" className={`${ITEM} text-destructive`} onClick={() => logout.mutate()}><LogOut aria-hidden className="size-5" />Abmelden</button>
      </div>
    </>
  );
}

export function Header() {
  return (
    <header className="sticky top-0 z-40 flex min-h-14 items-center justify-between gap-3 border-b border-border bg-card/95 px-4 py-2 backdrop-blur">
      <Link to="/" className="flex min-w-0 items-center gap-3 text-foreground no-underline">
        <img src="/assets/logo.png" alt="EmC2" className="h-8 w-auto" />
        <span className="truncate text-lg font-bold">Angebotskonfigurator</span>
      </Link>
      <div className="flex min-w-0 items-center gap-3">
        <SaveState />
        <UserMenu />
      </div>
    </header>
  );
}
