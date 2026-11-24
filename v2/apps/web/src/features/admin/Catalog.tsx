// Products and services of the catalogue (today's pages "Admin · Produkte & Leistungen" and "Admin:
// Services" in the Developer menu — U-005: admins only). Today's form and checks, one item per save
// (POST …/bulk with one entry), search after the last key stroke (250 ms), "Bearbeiten" fills the
// form. New: a save asks first (prices change the calculation of every offer); the list shows the
// first 200 rows of a search (today: the whole database at once).
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Save } from "lucide-react";
import { useState } from "react";
import { ApiFailure, call } from "../../shared/api/index.js";
import { euro } from "../../shared/lib/format.js";
import { Alert, Button, Field, TabsList, TabsPanel, TextAreaField } from "../../shared/ui/index.js";
import { Confirm, Empty, TD, Table, useSettled } from "./parts.js";
import {
  EMPTY_PRODUCT, EMPTY_SERVICE, LIST_LIMIT, productBody, productForm, serviceBody, serviceForm, type ProductForm, type ServiceForm,
} from "./rules.js";

const failText = (e: unknown) => (e instanceof ApiFailure ? e.message : "Unbekannter Fehler");
type Row = Record<string, unknown>;
const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));

function useList(kind: "products" | "services", text: string) {
  const q = useSettled(text.trim(), 250);
  return useQuery({
    queryKey: ["admin", kind, q], retry: false, staleTime: 0,
    queryFn: ({ signal }) => (call(kind, { signal, ...(q ? { query: `q=${encodeURIComponent(q)}` } : {}) }) as unknown as Promise<Row[]>),
  });
}

function Shown({ total }: { total: number }) {
  return total > LIST_LIMIT ? <p className="m-0 text-[0.95rem] text-muted-foreground">{LIST_LIMIT} von {total} angezeigt – bitte die Suche eingrenzen.</p> : <p className="m-0 text-[0.95rem] text-muted-foreground">{total} geladen.</p>;
}

function Products() {
  const qc = useQueryClient();
  const [f, setF] = useState<ProductForm>(EMPTY_PRODUCT);
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [ask, setAsk] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(false);
  const list = useList("products", text);
  const rows = list.data ?? [];
  const put = (p: Partial<ProductForm>) => setF((x) => ({ ...x, ...p }));
  const start = () => { const r = productBody(f); if ("error" in r) setMsg({ ok: false, text: r.error }); else { setMsg(null); setAsk(r.body); } };
  const save = async (body: Record<string, unknown>) => {
    setBusy(true);
    try {
      await call("productsBulk", { body: [body] });
      setMsg({ ok: true, text: `Produkt ${String(body.productId)} gespeichert.` });
      await qc.invalidateQueries({ queryKey: ["admin", "products"] });
    } catch (e) { setMsg({ ok: false, text: `Fehler beim Speichern: ${failText(e)}` }); }
    setBusy(false); setAsk(null);
  };
  const before = rows.find((r) => s(r.productId) === s(ask?.productId));
  return (
    <div className="grid gap-4">
      <form className="grid gap-3 rounded-xl border border-border bg-card p-4" onSubmit={(e) => { e.preventDefault(); start(); }} aria-labelledby="ap-title">
        <h3 id="ap-title" className="m-0">Neues Produkt / Produkt aktualisieren</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="ap_productId" label="Produkt-ID (z.B. V4FK600)" required value={f.productId} onChange={(e) => put({ productId: e.target.value })} />
          <Field id="ap_name" label="Bezeichnung" required value={f.name} onChange={(e) => put({ name: e.target.value })} />
          <Field id="ap_price" label="Preis (netto, EUR)" required inputMode="decimal" placeholder="z.B. 199,90" value={f.price} onChange={(e) => put({ price: e.target.value })} />
          <Field id="ap_width" label="Breite (cm, optional)" inputMode="decimal" value={f.widthCm} onChange={(e) => put({ widthCm: e.target.value })} />
          <Field id="ap_length" label="Länge (cm, optional)" inputMode="decimal" value={f.lengthCm} onChange={(e) => put({ lengthCm: e.target.value })} />
          <Field id="ap_height" label="Höhe (cm, optional)" inputMode="decimal" value={f.heightCm} onChange={(e) => put({ heightCm: e.target.value })} />
          <Field id="ap_source" label="Quelle / source (optional)" placeholder="z.B. hassmann, optional, seed" value={f.source} onChange={(e) => put({ source: e.target.value })} />
          <Field id="ap_manufacturer" label="Hersteller (optional)" placeholder="z.B. Hassmann, Vigour, EMC2/Intern" value={f.manufacturer} onChange={(e) => put({ manufacturer: e.target.value })}
            hint="Nur Artikel mit Hersteller „Hassmann“ (oder ohne Angabe) erscheinen im Hassmann-Warenkorb-CSV. Andere Hersteller werden ausgeschlossen." />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={busy}><Save aria-hidden />Speichern / Aktualisieren</Button>
          <Button variant="outline" onClick={() => { setF(EMPTY_PRODUCT); setMsg(null); }}>Zurücksetzen</Button>
        </div>
        {msg ? <Alert kind={msg.ok ? "info" : "error"}>{msg.text}</Alert> : null}
      </form>
      <Field id="ap_search" label="Suche (Produkt-ID oder Name)" type="search" placeholder="z.B. V4FK600 oder Kleber" value={text} onChange={(e) => setText(e.target.value)} />
      {list.error ? <Alert kind="error">{`Fehler beim Laden: ${failText(list.error)}`}</Alert> : list.data ? <Shown total={rows.length} /> : null}
      <Table label="Produkte" head={["Produkt-ID", "Name", "Preis", "B/L/H (cm)", "Quelle", "Hersteller", ""]}>
        {list.isPending ? <Empty cols={7}>Lade Daten …</Empty> : !rows.length ? <Empty cols={7}>Keine Produkte gefunden.</Empty> : rows.slice(0, LIST_LIMIT).map((p) => (
          <tr key={s(p.productId)}>
            <td className={TD}>{s(p.productId)}</td>
            <td className={TD}>{s(p.name)}</td>
            <td className={`${TD} whitespace-nowrap text-right`}>{euro(Number(p.price ?? 0))}</td>
            <td className={`${TD} text-center`}>{[p.widthCm, p.lengthCm, p.heightCm].filter((v) => v !== null && v !== undefined).join(" / ")}</td>
            <td className={TD}>{s(p.source)}</td>
            <td className={TD}>{s(p.manufacturer)}</td>
            <td className={TD}><Button variant="outline" aria-label={`${s(p.productId)} bearbeiten`} onClick={() => { setF(productForm(p)); setMsg({ ok: true, text: `Produkt ${s(p.productId)} im Formular geladen.` }); }}><Pencil aria-hidden />Bearbeiten</Button></td>
          </tr>
        ))}
      </Table>
      {ask ? (
        <Confirm title="Produkt speichern?" confirmLabel="Speichern" busy={busy} onConfirm={() => void save(ask)} onCancel={() => setAsk(null)}>
          <p className="m-0"><strong>{String(ask.productId)}</strong> – {String(ask.name)}</p>
          <p className="m-0">Preis: {before ? `${euro(Number(before.price ?? 0))} → ` : ""}{euro(Number(ask.price))}{before ? "" : " (neues Produkt)"}</p>
          <p className="m-0 text-muted-foreground">Änderungen wirken sich direkt auf die Kalkulation aus.</p>
        </Confirm>
      ) : null}
    </div>
  );
}

function Services() {
  const qc = useQueryClient();
  const [f, setF] = useState<ServiceForm>(EMPTY_SERVICE);
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [ask, setAsk] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(false);
  const list = useList("services", text);
  const rows = list.data ?? [];
  const put = (p: Partial<ServiceForm>) => setF((x) => ({ ...x, ...p }));
  const start = () => { const r = serviceBody(f); if ("error" in r) setMsg({ ok: false, text: r.error }); else { setMsg(null); setAsk(r.body); } };
  const save = async (body: Record<string, unknown>) => {
    setBusy(true);
    try {
      await call("servicesBulk", { body: [body] });
      setMsg({ ok: true, text: `Service ${String(body.serviceId)} gespeichert.` });
      await qc.invalidateQueries({ queryKey: ["admin", "services"] });
    } catch (e) { setMsg({ ok: false, text: `Fehler beim Speichern: ${failText(e)}` }); }
    setBusy(false); setAsk(null);
  };
  const before = rows.find((r) => s(r.serviceId) === s(ask?.serviceId));
  return (
    <div className="grid gap-4">
      <form className="grid gap-3 rounded-xl border border-border bg-card p-4" onSubmit={(e) => { e.preventDefault(); start(); }} aria-labelledby="as-title">
        <h3 id="as-title" className="m-0">Neuer Service / Service aktualisieren</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="as_serviceId" label="Service-ID" required value={f.serviceId} onChange={(e) => put({ serviceId: e.target.value })} />
          <Field id="as_name" label="Name" required value={f.name} onChange={(e) => put({ name: e.target.value })} />
          <Field id="as_internal_name" label="Interner Name" value={f.internal_name} onChange={(e) => put({ internal_name: e.target.value })} />
          <Field id="as_price" label="Preis (netto, EUR)" required inputMode="decimal" placeholder="z.B. 79,90" value={f.price} onChange={(e) => put({ price: e.target.value })} />
          <Field id="as_time" label="Zeit (Minuten)" required inputMode="numeric" value={f.time} onChange={(e) => put({ time: e.target.value })} />
          <Field id="as_source" label="Quelle / source (optional)" placeholder="z.B. emc2, optional, seed" value={f.source} onChange={(e) => put({ source: e.target.value })} />
        </div>
        <TextAreaField id="as_description" label="Beschreibung" value={f.description} onChange={(v) => put({ description: v })} rows={3} />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={busy}><Save aria-hidden />Speichern / Aktualisieren</Button>
          <Button variant="outline" onClick={() => { setF(EMPTY_SERVICE); setMsg(null); }}>Zurücksetzen</Button>
        </div>
        {msg ? <Alert kind={msg.ok ? "info" : "error"}>{msg.text}</Alert> : null}
      </form>
      <Field id="as_search" label="Filter (ID, Name, interner Name)" type="search" placeholder="Suchbegriff eingeben…" value={text} onChange={(e) => setText(e.target.value)} />
      {list.error ? <Alert kind="error">{`Fehler beim Laden: ${failText(list.error)}`}</Alert> : list.data ? <Shown total={rows.length} /> : null}
      <Table label="Leistungen" head={["Service-ID", "Name", "Interner Name", "Beschreibung", "Preis", "Zeit (Min)", "Quelle", ""]}>
        {list.isPending ? <Empty cols={8}>Lade Daten …</Empty> : !rows.length ? <Empty cols={8}>Keine Services gefunden.</Empty> : rows.slice(0, LIST_LIMIT).map((x) => {
          const desc = s(x.description);
          return (
            <tr key={s(x.serviceId)}>
              <td className={TD}>{s(x.serviceId)}</td>
              <td className={TD}>{s(x.name)}</td>
              <td className={TD}>{s(x.internal_name)}</td>
              <td className={TD} title={desc}>{desc.length > 80 ? desc.slice(0, 77) + "…" : desc}</td>
              <td className={`${TD} whitespace-nowrap text-right`}>{euro(Number(x.price ?? 0))}</td>
              <td className={`${TD} text-right`}>{s(x.time ?? 0)}</td>
              <td className={TD}>{s(x.source)}</td>
              <td className={TD}><Button variant="outline" aria-label={`${s(x.serviceId)} bearbeiten`} onClick={() => { setF(serviceForm(x)); setMsg({ ok: true, text: `Service ${s(x.serviceId)} im Formular geladen.` }); }}><Pencil aria-hidden />Bearbeiten</Button></td>
            </tr>
          );
        })}
      </Table>
      {ask ? (
        <Confirm title="Service speichern?" confirmLabel="Speichern" busy={busy} onConfirm={() => void save(ask)} onCancel={() => setAsk(null)}>
          <p className="m-0"><strong>{String(ask.serviceId)}</strong> – {String(ask.name)}</p>
          <p className="m-0">Preis: {before ? `${euro(Number(before.price ?? 0))} → ` : ""}{euro(Number(ask.price))} · Zeit: {before ? `${s(before.time)} → ` : ""}{String(ask.time)} Min{before ? "" : " (neuer Service)"}</p>
          <p className="m-0 text-muted-foreground">Änderungen wirken sich direkt auf die Kalkulation aus.</p>
        </Confirm>
      ) : null}
    </div>
  );
}

export function CatalogPage() {
  const [tab, setTab] = useState<"produkte" | "leistungen">("produkte");
  return (
    <section className="grid gap-4" data-testid="admin-catalog">
      <h2 className="m-0 text-[1.3rem]">Produkte &amp; Leistungen</h2>
      <p className="m-0 text-muted-foreground">Interne Verwaltung von Artikeln und Preisen. Änderungen wirken sich direkt auf die Kalkulation aus.</p>
      <TabsList label="Katalog" idPrefix="catalog" value={tab} onChange={setTab} tabs={[{ id: "produkte", label: "Produkte" }, { id: "leistungen", label: "Leistungen" }]} />
      <TabsPanel idPrefix="catalog" id="produkte" value={tab}><Products /></TabsPanel>
      <TabsPanel idPrefix="catalog" id="leistungen" value={tab}>{tab === "leistungen" ? <Services /> : null}</TabsPanel>
    </section>
  );
}
