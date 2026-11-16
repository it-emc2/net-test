// Dokumentenstudio (ADR 026, phase 4; Angebotsversand slice 2): the documents made from the
// offer — download as DOCX / PDF / CSV, and a preview on the page. The rules are documents.ts.
import { Download, Eye, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { ApiFailure, call, postForFile } from "../../../shared/api/index.js";
import { handFile } from "../../../shared/lib/hand-file.js";
import { Button, cn } from "../../../shared/ui/index.js";
import { toast } from "../../../shared/ui/toaster.js";
import { checkStep, useOfferStore, useOfferType, usePrice } from "../../offer/index.js";
import { mailChanges, touchedOf, type Touched } from "./mail-rules.js";
import { ACTIONS, PREVIEWS, cardsOf, csvName, newOfferNumber, type ActionId, type Download as DownloadAction, type PreviewDoc, type PreviewKey } from "./documents.js";

type Offer = Record<string, unknown>;
const offerNow = () => (useOfferStore.getState().offer ?? {}) as Offer;
const messageOf = (err: unknown, fallback: string) => (err instanceof ApiFailure && err.message ? err.message : fallback);

/** A new offer number — in ONE change with the mail's subject and text, which name it. */
function stamp() {
  const st = useOfferStore.getState(), offer: Offer = { ...offerNow(), offerNumber: newOfferNumber() };
  const mail = mailChanges(offer, (st.scratch.mailTouched as Touched | undefined) ?? touchedOf(offerNow()), st.scratch.mailAntrag === true);
  st.setTop({ offerNumber: offer.offerNumber, ...(Object.keys(mail).length ? { mail: { ...((offer.mail ?? {}) as Offer), ...mail } } : {}) });
}

interface Shown { doc: PreviewDoc; status: string; url: string; filename: string; text: string | null; busy: boolean }

/** The preview: one document at a time; made again when the offer changes while it is open. */
function usePreview(ready: () => boolean) {
  const [shown, setShown] = useState<Shown | null>(null);
  const seq = useRef(0), url = useRef(""), open = useRef<PreviewKey | null>(null);
  const version = useOfferStore((s) => s.version);
  const drop = () => { if (url.current) { URL.revokeObjectURL(url.current); url.current = ""; } };
  const load = async (key: PreviewKey, keep = false) => {
    const doc = PREVIEWS.find((p) => p.key === key)!;
    if (!keep && !ready()) return;
    const mine = ++seq.current;
    open.current = key;
    setShown((was) => (keep && was?.doc.key === key ? { ...was, busy: true, status: `${doc.title} wird aktualisiert…` } : { doc, status: `${doc.title} wird erstellt…`, url: "", filename: "", text: null, busy: true }));
    try {
      const file = await postForFile(doc.path, offerNow(), { accept: doc.accept });
      if (mine !== seq.current) return; // a newer preview was asked for meanwhile
      if (doc.mode === "pdf" && !file.type.includes("application/pdf")) throw new ApiFailure("Die Vorschau ist kein PDF.", 200, "BAD_RESPONSE");
      const text = doc.mode === "text" ? (await file.blob.text()) || doc.empty || "" : null;
      drop();
      url.current = URL.createObjectURL(file.blob);
      setShown({ doc, status: keep ? `${doc.title} automatisch aktualisiert.` : `${doc.title} bereit.`, url: url.current, filename: file.filename || doc.fallback, text, busy: false });
    } catch (err) {
      if (mine !== seq.current) return;
      drop();
      const text = messageOf(err, "Vorschau konnte nicht erstellt werden.");
      setShown({ doc, status: text, url: "", filename: "", text: null, busy: false });
      if (!keep) toast.error("Vorschau konnte nicht erstellt werden", { description: text });
    }
  };
  const close = () => { seq.current++; open.current = null; drop(); setShown(null); };
  // the offer changed while a preview is open: make it again after a short pause, the old one stays meanwhile
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (!open.current) return;
    const key = open.current, timer = setTimeout(() => { if (open.current === key) void load(key, true); }, 700);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);
  useEffect(() => () => { seq.current++; drop(); }, []);
  return { shown, load, close };
}

const ICON = { docx: Download, pdf: Download, preview: Eye, new: Sparkles } as const;

export function Dokumente() {
  const { dealId = "", type: typeParam = "" } = useParams();
  const type = useOfferType();
  const navigate = useNavigate();
  const price = usePrice();
  const [busy, setBusy] = useState<ActionId | null>(null);

  /** as "Weiter" on Kundendaten: complete entries and a valid markup, else say what is missing and go there */
  const ready = (): boolean => {
    const problem = checkStep("Kundendaten");
    if (!problem) return true;
    toast.error("Angaben unvollständig", { description: problem.message, id: "step-check" });
    navigate(`/deal/${dealId}/${typeParam}/${problem.goTo ?? "Kundendaten"}`);
    return false;
  };
  const preview = usePreview(ready);

  const download = async (id: ActionId, a: DownloadAction) => {
    if (a.stamp) stamp(); // also when the entries turn out incomplete (as today)
    if (!ready()) return;
    setBusy(id);
    try {
      const offer = offerNow(), number = String(offer.offerNumber || "") || newOfferNumber();
      const file = await postForFile(a.path, offer);
      if (a.save) { // a PDF went out: the offer is kept under its number
        try {
          await call("saveOffer", { body: { offerNumber: number, offerType: type, payload: offer, pricing: price.data ?? null, savedAt: new Date().toISOString(), clientSaveId: crypto.randomUUID() } });
          toast.success("Gespeichert", { description: `Angebot ${number} wurde gespeichert.` });
        } catch (err) { toast.error("Speichern fehlgeschlagen", { description: messageOf(err, `Angebot ${number} konnte nicht gespeichert werden.`) }); }
      }
      handFile(file.blob, a.csv ? csvName(number) : file.filename || a.fallback);
    } catch (err) {
      toast.error(a.failed, { description: messageOf(err, "Bitte erneut versuchen.") });
    } finally { setBusy(null); }
  };
  const press = (id: ActionId) => { const a = ACTIONS[id]; if (a.kind === "preview") void preview.load(a.key); else void download(id, a); };

  const p = preview.shown;
  return (
    <>
      <section className="grid gap-3" aria-labelledby="zf-studio-title" data-testid="zf-studio">
        <h3 id="zf-studio-title" className="m-0 text-[1.05rem] font-semibold">Dokumentenstudio</h3>
        <p className="m-0 text-muted-foreground">Erstellen, prüfen und vergleichen Sie alle Ausgabedokumente an einem Ort.</p>
        <div className="grid gap-3 md:grid-cols-2">
          {cardsOf(type).map((c) => (
            <article key={c.title} className="grid content-start gap-2 rounded-xl border border-border bg-card p-4" data-testid="zf-doc-card">
              <p className="m-0 flex items-center justify-between gap-2 text-[0.85rem]"><span data-part="badge" className="rounded-full bg-accent-weak px-2.5 py-0.5 font-semibold">{c.badge}</span><span data-part="format" className="text-muted-foreground">{c.format}</span></p>
              <h4 className="m-0 text-[1.05rem] font-semibold">{c.title}</h4>
              <p className="m-0 text-[0.95rem] text-muted-foreground" data-part="text">{c.text}</p>
              <div className="flex flex-wrap gap-2">
                {c.buttons.map((b) => { const Icon = ICON[b.look]; return (
                  <Button key={b.id} data-action={b.id} variant={b.look === "pdf" ? "default" : "outline"} disabled={busy !== null || (b.look === "preview" && !!p?.busy)} aria-label={`${c.title}: ${b.label}`} onClick={() => press(b.id)}>
                    <Icon aria-hidden className="size-4" /><span data-part="label">{busy === b.id ? "Wird erstellt …" : b.label}</span>
                  </Button>
                ); })}
              </div>
            </article>
          ))}
        </div>
      </section>

      {p ? (
        <section className="grid gap-3 rounded-xl border border-border bg-card p-4" aria-labelledby="zf-preview-title" data-testid="zf-preview">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="grid gap-0.5">
              <h3 id="zf-preview-title" className="m-0 text-[1.05rem] font-semibold">{p.doc.title}</h3>
              <p className="m-0 text-muted-foreground" role="status" data-part="status">{p.status}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <a href={p.url || undefined} target="_blank" rel="noopener noreferrer" aria-disabled={p.url ? "false" : "true"} data-part="open" className={cn("inline-flex min-h-12 items-center rounded-lg border-2 border-primary px-4 font-semibold text-primary no-underline", !p.url && "pointer-events-none opacity-50")}>Im neuen Tab öffnen</a>
              <a href={p.url || undefined} download={p.filename} aria-disabled={p.url ? "false" : "true"} data-part="download" className={cn("inline-flex min-h-12 items-center rounded-lg border-2 border-primary px-4 font-semibold text-primary no-underline", !p.url && "pointer-events-none opacity-50")}>Herunterladen</a>
              <Button variant="outline" onClick={preview.close}><X aria-hidden className="size-4" />Schließen</Button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Dokumentvorschau wechseln">
            {PREVIEWS.map((d) => <button key={d.key} type="button" role="tab" aria-selected={p.doc.key === d.key} data-preview={d.key} onClick={() => { void preview.load(d.key); }}
              className={cn("min-h-12 cursor-pointer rounded-lg border-2 px-4 font-semibold", p.doc.key === d.key ? "border-primary bg-accent-weak" : "border-input bg-card")}>{d.tab}</button>)}
          </div>
          {p.doc.mode === "pdf"
            ? <iframe title="Dokumentenvorschau" src={p.url || "about:blank"} className="h-[70vh] w-full rounded-lg border border-border bg-white" data-part="pdf" />
            : <pre className="m-0 max-h-[70vh] overflow-auto rounded-lg border border-border bg-muted p-3 text-[0.9rem]" data-part="text">{p.text ?? ""}</pre>}
        </section>
      ) : null}
    </>
  );
}
