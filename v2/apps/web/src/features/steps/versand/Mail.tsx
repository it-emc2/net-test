// "Angebot per E-Mail senden" — the form (ADR 026, phase 4; Angebotsversand slice 4, part 1):
// deal number, recipient, CC, subject, text, the preview of the mail and the list of
// attachments. The rules are mail-rules.ts. Sending itself (and own files, product pictures, an
// edited Word file) is still done in today's view.
import { X } from "lucide-react";
import { useEffect, useMemo } from "react";
import { Check, Field, TextAreaField, cn } from "../../../shared/ui/index.js";
import { useOfferStore } from "../../offer/index.js";
import { attachments, ccDefault, countText, mailChanges, previewHtml, touchedOf, type MailField, type Touched } from "./mail-rules.js";

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
  // an opened offer: what differs from what the offer would write by itself was changed by hand
  const touched = useMemo(() => remembered ?? touchedOf(offerNow()), [remembered]);
  const mail = (offer.mail ?? {}) as Record<string, unknown>;
  useEffect(() => { if (!remembered) st().remember("mailTouched", touched); }, [remembered, touched]); // other parts of the step read it (a new offer number)

  // fields not changed by hand follow the offer; a text changed by hand keeps its list, bonus line and number
  useEffect(() => {
    const change = mailChanges(offer, touched, applied);
    if (Object.keys(change).length) st().patch("mail" as never, change as never);
  }, [offer, touched, applied]);

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
      <Field label="Lead ID / Auftrag ID" id="zf-mail-deal" value={deal} inputMode="numeric" placeholder="z.B. 12345" onChange={(e) => setDeal(e.target.value)} />
      <Field label="Empfänger E-Mail" id="zf-mail-to" type="email" value={String(mail.to ?? "")} placeholder="customer@example.com" onChange={(e) => type("to", e.target.value.trim())} />
      <Field label="CC (z.B. Ansprechpartner)" id="zf-mail-cc" value={cc} placeholder="ansprechpartner@example.com" onChange={(e) => { st().remember("mailCc", e.target.value); st().remember("mailTouched", { ...touched, cc: true }); }} />
      <Field label="Betreff" id="zf-mail-subject" value={String(mail.subject ?? "")} placeholder="ANG-..." onChange={(e) => type("subject", e.target.value)} />
      <TextAreaField label="E-Mail-Text" id="zf-mail-body" rows={16} value={body} onChange={(v) => type("body", v)} />

      <div className="grid gap-1.5">
        <h4 className="m-0 font-semibold">Live-Vorschau</h4>
        <iframe title="E-Mail Vorschau" sandbox="" srcDoc={html} className="h-[420px] w-full rounded-lg border border-border bg-white" data-testid="zf-mail-preview" />
      </div>

      <div className="grid gap-2" data-testid="zf-mail-files">
        <p className="m-0 flex items-center gap-3"><strong>Anhänge</strong><span className="text-muted-foreground" data-part="count">{countText(files.length)}</span></p>
        <ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2">
          {files.map((f) => (
            <li key={f.id} data-testid="zf-mail-file" className="flex min-h-12 items-center gap-3 rounded-lg border border-border bg-card px-3 py-1.5">
              <span className="grid min-w-0 flex-1"><span className="truncate font-semibold" title={f.name} data-part="name">{f.name}</span><span className="text-[0.85rem] text-muted-foreground" data-part="meta">{f.meta}</span></span>
              {f.fixed
                ? <span data-part="fixed" className="rounded-full border border-border px-2.5 py-0.5 text-[0.85rem] text-muted-foreground">Pflicht</span>
                : <button type="button" title={`${f.name} entfernen`} aria-label={`${f.name} entfernen`} onClick={() => st().remember("mailRemoved", [...removed, f.id])} className={cn("grid size-12 shrink-0 cursor-pointer place-items-center rounded-lg border-2 border-input bg-card text-foreground")}><X aria-hidden className="size-5" /></button>}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
