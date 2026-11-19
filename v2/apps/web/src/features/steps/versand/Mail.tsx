// "Angebot per E-Mail senden" — the form (ADR 026, phase 4; Angebotsversand slice 4, part 1):
// deal number, recipient, CC, subject, text, the preview of the mail and the list of
// attachments. The rules are mail-rules.ts. Slice 4b, part 1: own files for the mail and the
// offer edited in Word (kept while the offer is open — files are not part of the offer).
// U-024 (owner-approved mock 2026-11-17): files are added in a drop zone right below the list
// (drag and drop, paste, "Datei auswählen"); the product-picture PDF is gone.
import { FileCheck, FilePen, X } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { Check, DropZone, Field, TextAreaField, cn } from "../../../shared/ui/index.js";
import { useOfferStore, usePrice } from "../../offer/index.js";
import { attachments, bonusKey, bonusNeuFor, ccDefault, countText, mailChanges, previewHtml, touchedOf, type MailField, type Touched } from "./mail-rules.js";
import { TEXT, addFiles, fileSize, isDocx } from "./send-rules.js";

type Offer = Record<string, unknown>;
const st = () => useOfferStore.getState();
const offerNow = () => (st().offer ?? {}) as Offer;
const mailNow = () => (offerNow().mail ?? {}) as Record<string, unknown>;

export function Mail() {
  const offer = (useOfferStore((s) => s.offer) ?? {}) as Offer;
  const remembered = useOfferStore((s) => s.scratch.mailTouched) as Touched | undefined;
  const applied = useOfferStore((s) => s.scratch.mailAntrag) === true;
  const ccByHand = useOfferStore((s) => s.scratch.mailCc) as string | undefined;
  const removed = (useOfferStore((s) => s.scratch.mailRemoved) as string[] | undefined) ?? [];
  const uploads = (useOfferStore((s) => s.scratch.mailUploads) as File[] | undefined) ?? [];
  const dealMissing = useOfferStore((s) => s.scratch.dealMissing) === true; // a send was refused for want of it
  // the Neukundenbonus is advertised only while the price grants it (main d0528418); no answer yet: as ticked
  const live = ((usePrice().data as { flags?: { bonus_neu?: unknown } } | null)?.flags?.bonus_neu);
  const at = useOfferStore((s) => s.scratch.mailBonusNeuAt) as { flag?: unknown; key?: string } | undefined;
  const bonusNeu = bonusNeuFor(live, at, bonusKey(offer, applied));
  useEffect(() => { if (st().scratch.mailBonusNeu !== bonusNeu) st().remember("mailBonusNeu", bonusNeu); }, [bonusNeu]); // a new number elsewhere writes the text too (number.ts)
  // an opened offer: what differs from what the offer would write by itself was changed by hand
  const touched = useMemo(() => remembered ?? touchedOf(offerNow(), bonusNeu), [remembered]); // eslint-disable-line react-hooks/exhaustive-deps -- decided once, on opening
  const mail = (offer.mail ?? {}) as Record<string, unknown>;
  useEffect(() => { if (!remembered) st().remember("mailTouched", touched); }, [remembered, touched]); // other parts of the step read it (a new offer number)

  // fields not changed by hand follow the offer; a text changed by hand keeps its list, bonus line and number
  useEffect(() => {
    const change = mailChanges(offer, touched, applied, bonusNeu);
    if (Object.keys(change).length) st().patch("mail" as never, change as never);
  }, [offer, touched, applied, bonusNeu]);

  const type = (field: MailField, value: string) => { st().remember("mailTouched", { ...touched, [field]: true }); st().patch("mail" as never, { [field]: value } as never); };
  const deal = String(offer.auftragId ?? mail.auftragId ?? "");
  const setDeal = (value: string) => { const v = value.trim(); st().setTop({ auftragId: v || undefined, mail: { ...mailNow(), auftragId: v } }); };
  const cc = touched.cc ? ccByHand ?? "" : ccDefault(offer);
  const body = String(mail.body ?? "");
  const files = attachments(offer, removed);
  const html = useMemo(() => previewHtml(body, offer), [body, offer]);

  return (
    <section className="grid gap-3" aria-labelledby="zf-mail-title" data-testid="zf-mail">
      <h3 id="zf-mail-title" className="m-0 text-[1.05rem] font-semibold">Angebot per E-Mail senden</h3>
      <Check id="zf-mail-antrag" checked={applied} onChange={(on) => st().remember("mailAntrag", on)}>Antrag bei Pflegekasse bereits gestellt (Hinweis zur Antragsstellung im Text weglassen)</Check>
      <Field label="Lead ID / Auftrag ID" id="zf-mail-deal" value={deal} inputMode="numeric" placeholder="z.B. 12345" aria-invalid={dealMissing && !deal ? true : undefined} onChange={(e) => setDeal(e.target.value)} />
      <Field label="Empfänger E-Mail" id="zf-mail-to" type="email" value={String(mail.to ?? "")} placeholder="customer@example.com" onChange={(e) => type("to", e.target.value.trim())} />
      <Field label="CC (z.B. Ansprechpartner)" id="zf-mail-cc" value={cc} placeholder="ansprechpartner@example.com" onChange={(e) => { st().remember("mailCc", e.target.value); st().remember("mailTouched", { ...touched, cc: true }); }} />
      <Field label="Betreff" id="zf-mail-subject" value={String(mail.subject ?? "")} placeholder="ANG-..." onChange={(e) => type("subject", e.target.value)} />
      <TextAreaField label="E-Mail-Text" id="zf-mail-body" rows={16} value={body} onChange={(v) => type("body", v)} />

      <div className="grid gap-1.5">
        <h4 className="m-0 font-semibold">Live-Vorschau</h4>
        <iframe title="E-Mail Vorschau" sandbox="" srcDoc={html} className="h-[420px] w-full rounded-lg border border-border bg-white" data-testid="zf-mail-preview" />
      </div>

      <div className="grid gap-2" data-testid="zf-mail-files">
        <p className="m-0 flex flex-wrap items-center gap-3"><strong>Anhänge</strong><span className="text-muted-foreground" data-part="count">{countText(files.length + uploads.length)}</span></p>
        <ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2">
          {files.map((f) => <FileRow key={f.id} name={f.name} meta={f.meta} fixed={f.fixed} onRemove={() => st().remember("mailRemoved", [...removed, f.id])} />)}
          {uploads.map((f, i) => <FileRow key={`u${i}`} name={f.name} meta={`Hinzugefügt · ${fileSize(f.size)}`} onRemove={() => st().remember("mailUploads", uploads.filter((_, j) => j !== i))} />)}
        </ul>
        <DropZone id="zf-mail-add" data-testid="zf-mail-drop" title="Dateien hier ablegen, einfügen (⌘V) oder auswählen" hint="Gehen als Anhang mit der E-Mail an den Kunden."
          onFiles={(added) => st().remember("mailUploads", addFiles((st().scratch.mailUploads as File[] | undefined) ?? [], added))} />
      </div>

      <EditedDocx />
    </section>
  );
}

/** one file of a list: name, what it is, and "Pflicht" or a button that takes it out */
export function FileRow({ name, meta, fixed = false, onRemove }: { name: string; meta: string; fixed?: boolean; onRemove: () => void }) {
  return (
    <li data-testid="zf-mail-file" className="flex min-h-12 items-center gap-3 rounded-lg border border-border bg-card px-3 py-1.5">
      <span className="grid min-w-0 flex-1"><span className="truncate font-semibold" title={name} data-part="name">{name}</span><span className="text-[0.85rem] text-muted-foreground" data-part="meta">{meta}</span></span>
      {fixed
        ? <span data-part="fixed" className="rounded-full border border-border px-2.5 py-0.5 text-[0.85rem] text-muted-foreground">Pflicht</span>
        : <button type="button" title={`${name} entfernen`} aria-label={`${name} entfernen`} onClick={onRemove} className="grid size-12 shrink-0 cursor-pointer place-items-center rounded-lg border-2 border-input bg-card text-foreground"><X aria-hidden className="size-5" /></button>}
    </li>
  );
}

/** "Angebot in Word angepasst?" — a hand-edited DOCX goes out instead of the offer made by the app */
function EditedDocx() {
  const file = useOfferStore((s) => s.scratch.editedDocx) as File | null | undefined;
  const input = useRef<HTMLInputElement>(null);
  const take = (f: File | undefined) => {
    if (!f) return;
    if (!isDocx(f.name)) { st().remember("sendStatus", { type: "error", text: TEXT.notDocx }); return; }
    st().remember("editedDocx", f);
  };
  return (
    <div role="button" tabIndex={0} aria-label="Bearbeitete Angebots-DOCX auswählen" data-testid="zf-docx" data-file={file ? "true" : "false"}
      onClick={() => input.current?.click()} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.current?.click(); } }}
      onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); take(e.dataTransfer.files[0]); }}
      className={cn("flex min-h-16 cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed px-4 py-3", file ? "border-[#d97706] bg-[#fff7e6]" : "border-[#1e8449] bg-card")}>
      {file ? <FileCheck aria-hidden className="size-6 shrink-0 text-[#b45309]" /> : <FilePen aria-hidden className="size-6 shrink-0 text-[#1e8449]" />}
      <span className="grid min-w-0 flex-1">
        <strong className="truncate" data-part="title">{file ? file.name : "Angebot in Word angepasst?"}</strong>
        <span className="text-[0.9rem] text-muted-foreground" data-part="text">{file ? "Diese Datei wird statt des automatisch erzeugten Angebots versendet." : "Bearbeitete DOCX hier ablegen oder auswählen — sie wird statt des automatisch erzeugten Angebots als PDF versendet."}</span>
      </span>
      {file ? <button type="button" aria-label="Datei entfernen" onClick={(e) => { e.stopPropagation(); st().remember("editedDocx", null); }} className="grid size-12 shrink-0 cursor-pointer place-items-center rounded-lg border-2 border-input bg-card"><X aria-hidden className="size-5" /></button> : null}
      <input ref={input} type="file" accept=".docx" hidden data-testid="zf-docx-input" onClick={(e) => e.stopPropagation()} onChange={(e) => { take(e.target.files?.[0]); e.target.value = ""; }} />
    </div>
  );
}
