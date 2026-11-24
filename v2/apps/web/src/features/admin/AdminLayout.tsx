// The admin area (/admin/…): only for the role "admin". The client check only hides the pages; every
// /admin/api route checks the role on the server again (admin guard, ADR 015) — a forged role in
// the browser gets 403 answers, nothing else.
import { NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { useSession } from "../auth/index.js";
import { Alert, ButtonLink, Page, cn } from "../../shared/ui/index.js";
import { PAGES, SETTINGS_SECTIONS, isAdmin } from "./rules.js";
import { useSettingsDraft } from "./settings-store.js";
import { useAdminConfig } from "./queries.js";

const PILL = "inline-flex min-h-11 items-center gap-2 rounded-full border-2 px-4 text-[0.95rem] font-semibold no-underline transition-colors";
const pill = ({ isActive }: { isActive: boolean }) =>
  cn(PILL, isActive ? "border-primary bg-accent-weak text-foreground" : "border-border bg-card text-muted-foreground hover:text-foreground");

function Nav() {
  const changes = useSettingsDraft((s) => s.changes);
  const items = useAdminConfig().data ?? [];
  const pending = (section: string) => items.filter((i) => i.section === section && i.key in changes).length;
  return (
    <nav aria-label="Verwaltung" className="grid gap-3" data-testid="admin-nav">
      <PhonePicker pending={pending} />
      <div className="max-sm:hidden">
        <p className="m-0 mb-1.5 text-[0.8rem] font-bold uppercase tracking-wider text-muted-foreground">Einstellungen</p>
        <div className="flex flex-wrap gap-2">
          {SETTINGS_SECTIONS.map((s) => {
            const n = pending(s.id);
            return (
              <NavLink key={s.id} to={`einstellungen/${s.id}`} className={pill}>
                {s.label}
                {n ? <span className="rounded-full bg-primary px-2 text-[0.8rem] text-primary-foreground" aria-label={`${n} ungespeichert`}>{n}</span> : null}
              </NavLink>
            );
          })}
        </div>
      </div>
      <div className="max-sm:hidden">
        <p className="m-0 mb-1.5 text-[0.8rem] font-bold uppercase tracking-wider text-muted-foreground">Verwaltung und Protokolle</p>
        <div className="flex flex-wrap gap-2">
          {PAGES.map((p) => <NavLink key={p.path} to={p.path} className={pill}>{p.label}</NavLink>)}
        </div>
      </div>
    </nav>
  );
}

/** below 640 px one list to choose the page from instead of 15 buttons (they would fill the screen) */
function PhonePicker({ pending }: { pending: (section: string) => number }) {
  const nav = useNavigate();
  const { pathname } = useLocation();
  const here = pathname.replace(/^.*\/admin\/?/, "");
  return (
    <label htmlFor="admin-page" className="grid gap-1.5 sm:hidden">
      <span className="font-semibold">Bereich</span>
      <select id="admin-page" value={here} onChange={(e) => nav(e.target.value)} className="min-h-12 cursor-pointer rounded-lg border-2 border-input bg-card px-3.5 text-foreground">
        <optgroup label="Einstellungen">
          {SETTINGS_SECTIONS.map((s) => { const n = pending(s.id); return <option key={s.id} value={`einstellungen/${s.id}`}>{s.label}{n ? ` (${n} ungespeichert)` : ""}</option>; })}
        </optgroup>
        <optgroup label="Verwaltung und Protokolle">
          {PAGES.map((p) => <option key={p.path} value={p.path}>{p.label}</option>)}
        </optgroup>
      </select>
    </label>
  );
}

export function AdminLayout() {
  const { user } = useSession();
  if (!isAdmin(user)) {
    return (
      <Page title="Kein Zugriff">
        <Alert kind="error">Die Verwaltung ist nur für Administratoren.</Alert>
        <ButtonLink to="/">Zum Hauptmenü</ButtonLink>
      </Page>
    );
  }
  return (
    <main className="mx-auto grid max-w-5xl gap-5 px-4 pb-16 pt-6" data-testid="admin">
      <h1 className="m-0">Verwaltung</h1>
      <Nav />
      <Outlet />
    </main>
  );
}
