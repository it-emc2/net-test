// Business settings, one section per page (today's cards). Changes collect across sections; "Speichern"
// shows them (old → new) and asks before sending them in one request; "Zurücksetzen" asks too.
import { useQueryClient } from "@tanstack/react-query";
import { Info, RotateCcw, Save } from "lucide-react";
import { useState } from "react";
import { Navigate, useParams } from "react-router";
import { ApiFailure, call } from "../../shared/api/index.js";
import { Alert, Button, Input, Label, Switch, cn } from "../../shared/ui/index.js";
import { Confirm } from "./parts.js";
import { CONFIG_KEY, useAdminConfig } from "./queries.js";
import { SETTINGS_SECTIONS, changeCount, changeLines, defaultHint, inputText, parseInput, saveLabel, type ConfigItem } from "./rules.js";
import { useSettingsDraft } from "./settings-store.js";

const failText = (e: unknown) => (e instanceof ApiFailure ? e.message : "Unbekannter Fehler");

function Card({ item, onReset }: { item: ConfigItem; onReset: (item: ConfigItem) => void }) {
  const { changes, texts, invalid, edit } = useSettingsDraft();
  const pending = item.key in changes;
  const shown = pending ? changes[item.key] : item.value;
  const id = `field-${item.key}`;
  const descId = item.description ? `${id}-desc` : undefined;
  let control;
  if (item.type === "boolean") {
    control = (
      <div className="flex min-h-12 items-center gap-3">
        <Switch id={id} label={item.label} checked={!!shown} onChange={(on) => edit(item.key, parseInput(item, on))} />
        <span>{shown ? "Aktiv" : "Inaktiv"}</span>
      </div>
    );
  } else if (item.type === "text-list" || item.type === "json") {
    control = (
      <textarea
        id={id} rows={item.type === "json" ? 4 : 6} spellCheck={false} aria-invalid={invalid[item.key] || undefined} aria-describedby={descId}
        placeholder={item.type === "text-list" ? "Eine Artikelnummer pro Zeile" : undefined}
        value={texts[item.key] ?? inputText(shown, item.type)}
        onChange={(e) => edit(item.key, parseInput(item, e.target.value), e.target.value)}
        className={cn("w-full rounded-lg border-2 bg-card px-3.5 py-2.5 font-mono text-[0.95rem] text-foreground", invalid[item.key] ? "border-destructive" : pending ? "border-primary" : "border-input")}
      />
    );
  } else {
    control = (
      <Input
        id={id} type="text" inputMode={item.type === "integer" ? "numeric" : "decimal"} aria-describedby={descId}
        value={texts[item.key] ?? inputText(shown, item.type)}
        onChange={(e) => edit(item.key, parseInput(item, e.target.value), e.target.value)}
        className={cn(pending && "border-primary")}
      />
    );
  }
  return (
    <section className={cn("grid gap-2 rounded-xl border-2 bg-card p-4", pending ? "border-primary" : "border-border")} data-testid={`card-${item.key}`} data-changed={pending ? "true" : "false"}>
      <div className="flex items-start justify-between gap-2">
        <Label htmlFor={id} className="text-[1.05rem]">{item.label}</Label>
        {item.unit ? <span className="rounded-full bg-muted px-2 py-0.5 text-[0.85rem] text-muted-foreground">{item.unit}</span> : null}
      </div>
      {control}
      {invalid[item.key] ? <p className="m-0 text-[0.95rem] text-destructive">Kein gültiges JSON – diese Änderung wird nicht gespeichert.</p> : null}
      {item.description ? <p id={descId} className="m-0 text-[0.95rem] text-muted-foreground">{item.description}</p> : null}
      {item.note ? <p className="m-0 flex gap-2 text-[0.95rem] text-muted-foreground"><Info aria-hidden className="mt-0.5 size-4 shrink-0" />{item.note}</p> : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[0.9rem] text-muted-foreground">{defaultHint(item)}</span>
        <Button variant="ghost" onClick={() => onReset(item)} aria-label={`${item.label} auf Standardwert zurücksetzen`}><RotateCcw aria-hidden />Zurücksetzen</Button>
      </div>
    </section>
  );
}

export function SettingsPage() {
  const { section = "" } = useParams();
  const qc = useQueryClient();
  const q = useAdminConfig();
  const { changes, clear, drop } = useSettingsDraft();
  const [ask, setAsk] = useState<null | { kind: "save" } | { kind: "reset"; item: ConfigItem }>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const sec = SETTINGS_SECTIONS.find((s) => s.id === section);
  if (!sec) return <Navigate to="../einstellungen/shared" replace />;
  const items = (q.data ?? []).filter((i) => i.section === section).sort((a, b) => a.order - b.order);
  const n = Object.keys(changes).length;

  const save = async () => {
    setBusy(true);
    try {
      await call("adminConfigSave", { body: changes });
      qc.setQueryData<ConfigItem[]>(CONFIG_KEY, (old) => old?.map((i) => (i.key in changes ? { ...i, value: changes[i.key] } : i)));
      clear();
      setStatus({ ok: true, text: "Gespeichert!" });
      void qc.invalidateQueries({ queryKey: ["public-config"] }); // offers opened later use the new values
    } catch (e) { setStatus({ ok: false, text: `Fehler: ${failText(e)}` }); }
    setBusy(false);
    setAsk(null);
  };
  const reset = async (item: ConfigItem) => {
    setBusy(true);
    try {
      const r = await call("adminConfigReset", { body: { key: item.key } });
      qc.setQueryData<ConfigItem[]>(CONFIG_KEY, (old) => old?.map((i) => (i.key === item.key ? { ...i, value: r.value } : i)));
      drop(item.key);
      setStatus({ ok: true, text: `"${item.label}" zurückgesetzt` });
      void qc.invalidateQueries({ queryKey: ["public-config"] });
    } catch (e) { setStatus({ ok: false, text: `Fehler: ${failText(e)}` }); }
    setBusy(false);
    setAsk(null);
  };

  return (
    <section className="grid gap-4" data-testid="admin-settings">
      <div className="sticky top-16 z-10 -mx-4 flex flex-wrap items-center gap-3 border-b border-border bg-background/95 px-4 py-2 backdrop-blur">
        <h2 className="m-0 flex-1 text-[1.3rem]">{sec.label}</h2>
        {n ? <span className="text-[0.95rem] font-semibold" data-testid="change-count">{changeCount(n)}</span> : null}
        <Button disabled={n === 0 || busy} onClick={() => { setStatus(null); setAsk({ kind: "save" }); }}><Save aria-hidden />{saveLabel(n)}</Button>
      </div>
      {status ? <Alert kind={status.ok ? "info" : "error"}>{status.text}</Alert> : null}
      {q.isPending ? <p className="text-muted-foreground">Lade Konfiguration …</p> : null}
      {q.error ? <Alert kind="error">{failText(q.error)}</Alert> : null}
      {q.data && !items.length ? <p className="text-muted-foreground">Keine Einstellungen in diesem Bereich.</p> : null}
      <div className="grid gap-3 md:grid-cols-2">
        {items.map((i) => <Card key={i.key} item={i} onReset={(item) => { setStatus(null); setAsk({ kind: "reset", item }); }} />)}
      </div>
      {ask?.kind === "save" ? (
        <Confirm title="Einstellungen speichern?" confirmLabel={saveLabel(n)} busy={busy} onConfirm={() => void save()} onCancel={() => setAsk(null)}>
          <p className="m-0">Die Änderungen gelten sofort für neue Berechnungen aller Angebote.</p>
          <ul className="m-0 grid gap-1 pl-5" data-testid="change-lines">
            {changeLines(q.data ?? [], changes).map((l) => <li key={l.key}><strong>{l.label}:</strong> {l.from} → {l.to}</li>)}
          </ul>
        </Confirm>
      ) : null}
      {ask?.kind === "reset" ? (
        <Confirm title="Auf Standardwert zurücksetzen?" confirmLabel="Zurücksetzen" destructive busy={busy} onConfirm={() => void reset(ask.item)} onCancel={() => setAsk(null)}>
          <p className="m-0"><strong>{ask.item.label}</strong> wird sofort auf den Standardwert gesetzt ({defaultHint(ask.item).replace("Standard: ", "")}).</p>
        </Confirm>
      ) : null}
    </section>
  );
}
