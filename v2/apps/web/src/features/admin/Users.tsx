// Users: today's list (name, e-mail, role, active, signature) and today's form "Benutzer hinzufügen /
// bearbeiten" — plus "Bearbeiten" per row (fills the form with the stored names, role and state, so a
// save no longer empties the names or demotes an admin, U-065). Every save asks first and names what
// changes (new user, new password, role, deactivation); a signature upload shows the picture first.
// Passwords are never shown or kept beyond the form; the list never holds a hash.
import { useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Upload } from "lucide-react";
import { useState, type ChangeEvent } from "react";
import { useSession } from "../auth/index.js";
import { ApiFailure, call } from "../../shared/api/index.js";
import { Alert, Button, Field, Switch } from "../../shared/ui/index.js";
import { Badge, Confirm, Empty, Select, TD, Table } from "./parts.js";
import { USERS_KEY, useAdminUsers } from "./queries.js";
import { EMPTY_USER, displayName, formOf, selfLockout, userBody, type AdminUser, type UserForm } from "./rules.js";

const failText = (e: unknown) => (e instanceof ApiFailure ? e.message : "Unbekannter Fehler");
const ROLES = [{ value: "user", label: "Benutzer" }, { value: "admin", label: "Admin" }] as const;
const roleText = (r: unknown) => (r === "admin" ? "Admin" : "Benutzer");

/** what the confirmation lists for this save */
export function saveSummary(f: UserForm, before: AdminUser | undefined): string[] {
  const out: string[] = [];
  if (!before) out.push(`Neuer Benutzer ${f.email.trim()} (${roleText(f.role)})`);
  else {
    const was = formOf(before);
    if (was.firstName !== f.firstName.trim() || was.lastName !== f.lastName.trim()) out.push(`Name: ${displayName(before)} → ${`${f.firstName.trim()} ${f.lastName.trim()}`.trim() || "–"}`);
    if (was.role !== f.role) out.push(`Rolle: ${roleText(was.role)} → ${roleText(f.role)}`);
    if (was.active !== f.active) out.push(f.active ? "Konto wird wieder aktiviert" : "Konto wird deaktiviert (keine Anmeldung mehr möglich)");
  }
  if (f.password) out.push(before ? "Passwort wird neu gesetzt" : "Passwort wird gesetzt");
  if (!out.length) out.push("Keine Änderung an Rolle, Status oder Passwort");
  return out;
}

export function UsersPage() {
  const qc = useQueryClient();
  const me = useSession().user?.email ?? "";
  const q = useAdminUsers();
  const [form, setForm] = useState<UserForm>(EMPTY_USER);
  const [editing, setEditing] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [ask, setAsk] = useState<null | { kind: "save"; body: Record<string, unknown>; lines: string[] } | { kind: "signature"; user: AdminUser; dataUrl: string }>(null);
  const [busy, setBusy] = useState(false);
  const users = q.data ?? [];
  const stored = users.find((u) => u.email.toLowerCase() === form.email.trim().toLowerCase());
  const put = (patch: Partial<UserForm>) => setForm((f) => ({ ...f, ...patch }));

  const startSave = () => {
    setMsg(null);
    const r = userBody(form);
    if ("error" in r) return setMsg({ ok: false, text: r.error });
    const lock = selfLockout(form, me);
    if (lock) return setMsg({ ok: false, text: lock });
    setAsk({ kind: "save", body: r.body, lines: saveSummary(form, stored) });
  };
  const save = async (body: Record<string, unknown>) => {
    setBusy(true);
    try {
      await call("adminUserSave", { body });
      setForm(EMPTY_USER); setEditing(false);
      setMsg({ ok: true, text: `Benutzer ${String(body.email)} gespeichert.` });
      await qc.invalidateQueries({ queryKey: USERS_KEY });
    } catch (e) { setMsg({ ok: false, text: failText(e) }); }
    setBusy(false); setAsk(null);
  };
  const pick = (user: AdminUser) => (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setAsk({ kind: "signature", user, dataUrl: String(reader.result) });
    reader.readAsDataURL(file);
  };
  const upload = async (user: AdminUser, dataUrl: string) => {
    setBusy(true);
    try {
      await call("adminUserSignature", { params: { email: user.email }, body: { dataUrl } });
      setMsg({ ok: true, text: `Unterschrift für ${user.email} gespeichert.` });
      await qc.invalidateQueries({ queryKey: USERS_KEY });
    } catch (e) { setMsg({ ok: false, text: `Upload fehlgeschlagen: ${failText(e)}` }); }
    setBusy(false); setAsk(null);
  };

  return (
    <section className="grid gap-4" data-testid="admin-users">
      <h2 className="m-0 text-[1.3rem]">Benutzer</h2>
      <form className="grid gap-3 rounded-xl border border-border bg-card p-4" onSubmit={(e) => { e.preventDefault(); startSave(); }} aria-labelledby="user-form-title">
        <h3 id="user-form-title" className="m-0">{editing ? `Benutzer bearbeiten: ${form.email}` : "Benutzer hinzufügen / bearbeiten"}</h3>
        <div className="grid items-start gap-3 sm:grid-cols-2">
          <Field id="u-first" label="Vorname" value={form.firstName} onChange={(e) => put({ firstName: e.target.value })} autoComplete="off" />
          <Field id="u-last" label="Nachname" value={form.lastName} onChange={(e) => put({ lastName: e.target.value })} autoComplete="off" />
          <Field id="u-email" label="E-Mail" type="email" value={form.email} readOnly={editing} onChange={(e) => put({ email: e.target.value })} autoComplete="off"
            hint={editing ? "Die E-Mail ist der Schlüssel des Kontos. Für eine andere E-Mail einen neuen Benutzer anlegen." : undefined} />
          <Field id="u-pass" label="Passwort (neu/ändern)" type="password" value={form.password} onChange={(e) => put({ password: e.target.value })} autoComplete="new-password"
            hint={editing ? "Leer lassen, um das bisherige Passwort zu behalten." : "Für einen neuen Benutzer erforderlich."} />
          <Select id="u-role" label="Rolle" value={form.role} onChange={(v) => put({ role: v === "admin" ? "admin" : "user" })} options={ROLES} />
          <label htmlFor="u-active" className="flex min-h-12 items-center gap-3 self-end">
            <Switch id="u-active" label="Konto aktiv" checked={form.active} onChange={(on) => put({ active: on })} />
            <span>{form.active ? "Konto aktiv" : "Konto deaktiviert"}</span>
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={busy}><Plus aria-hidden />Speichern</Button>
          {editing || form.email || form.firstName || form.lastName || form.password ? (
            <Button variant="outline" onClick={() => { setForm(EMPTY_USER); setEditing(false); setMsg(null); }}>Formular leeren</Button>
          ) : null}
        </div>
        {msg ? <Alert kind={msg.ok ? "info" : "error"}>{msg.text}</Alert> : null}
      </form>

      {q.error ? <Alert kind="error">{failText(q.error)}</Alert> : null}
      <Table label="Benutzer" head={["Name", "E-Mail", "Rolle", "Aktiv", "Unterschrift", ""]}>
        {q.isPending ? <Empty cols={6}>Lade …</Empty> : !users.length ? <Empty cols={6}>Keine Benutzer.</Empty> : users.map((u) => (
          <tr key={u.email} data-testid={`user-${u.email}`}>
            <td className={TD}><strong>{displayName(u)}</strong></td>
            <td className={`${TD} break-all`}>{u.email}</td>
            <td className={TD}><Badge tone={u.role === "admin" ? "warn" : "neutral"}>{roleText(u.role)}</Badge></td>
            <td className={TD}>{u.active !== false ? "Ja" : "Nein"}</td>
            <td className={TD}>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={u.hasSignature ? "ok" : "neutral"}>{u.hasSignature ? "vorhanden" : "keine"}</Badge>
                <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border-2 border-input px-3 font-semibold hover:bg-muted">
                  <Upload aria-hidden className="size-5" />Hochladen
                  <input type="file" accept="image/png,image/jpeg" className="sr-only" aria-label={`Unterschrift für ${u.email} hochladen`} onChange={pick(u)} />
                </label>
              </div>
            </td>
            <td className={TD}>
              <Button variant="outline" aria-label={`${u.email} bearbeiten`} onClick={() => { setForm(formOf(u)); setEditing(true); setMsg(null); }}><Pencil aria-hidden />Bearbeiten</Button>
            </td>
          </tr>
        ))}
      </Table>

      {ask?.kind === "save" ? (
        <Confirm title="Benutzer speichern?" confirmLabel="Speichern" destructive={ask.lines.some((l) => /Rolle|deaktiviert|Passwort wird neu/.test(l))} busy={busy} onConfirm={() => void save(ask.body)} onCancel={() => setAsk(null)}>
          <p className="m-0 break-all"><strong>{String(ask.body.email)}</strong></p>
          <ul className="m-0 grid gap-1 pl-5" data-testid="user-change-lines">{ask.lines.map((l) => <li key={l}>{l}</li>)}</ul>
        </Confirm>
      ) : null}
      {ask?.kind === "signature" ? (
        <Confirm title="Unterschrift hochladen?" confirmLabel="Hochladen" busy={busy} onConfirm={() => void upload(ask.user, ask.dataUrl)} onCancel={() => setAsk(null)}>
          <p className="m-0 break-all">Für <strong>{ask.user.email}</strong>{ask.user.hasSignature ? " – die bisherige Unterschrift wird ersetzt." : "."}</p>
          <img src={ask.dataUrl} alt="Neue Unterschrift" className="max-h-40 rounded border border-border bg-white object-contain p-2" />
        </Confirm>
      ) : null}
    </section>
  );
}
