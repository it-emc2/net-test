// "Angebot per Post senden" (ADR 026, phase 4; Angebotsversand slice 5): the postal address, what
// the letter holds, and the send with its questions — the release by password when there is no
// deal number, the main items, the binding question in live mode, an offer that was sent before.
// The rules are post-rules.ts; the dialogs after and around a send are shared with Senden.tsx.
import { CircleCheck, CircleX, Info, LoaderCircle, Mailbox, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ApiFailure, call, postForFile } from "../../../shared/api/index.js";
import { Button, DropZone, Field, cn } from "../../../shared/ui/index.js";
import { toast } from "../../../shared/ui/toaster.js";
import { sendVariantOf, useOfferStore, usePrice } from "../../offer/index.js";
import { FileRow } from "./Mail.js";
import { giveNumber } from "./number.js";
import {
  TEXT, addressOf, alreadySent, changedQuestion, filingFailed, ignored, invalid, isPdf, letter, liveQuestion, postalOf, priorQuestion, priorSend,
  sentText, statics, uploadSize, warning, withBalance, type Enclosed, type Posted, type Recipient,
} from "./post-rules.js";
import { MainItems, Modal, Question, SentDialog, follow, type Ask, type Sent } from "./Senden.js";
import { SignOnSite } from "./Unterschrift.js";
import { historyChanged } from "./Verlauf.js";
import { StopActions } from "./NeueVersion.js";
import { NOTHING, NeedsNewVersion, refusal, saveBeforeSend, setStop } from "./version.js";
import { TEXT as SIGN, canPostSigned, signedLetter, signedParts, signedSent, type SignedDoc } from "./sign-rules.js";
import { TEXT as SEND_TEXT, bitrixJobs, errorOf, materialCodes, missingMain, type MainItem } from "./send-rules.js";

type Offer = Record<string, any>;
type Kind = "info" | "success" | "error" | "warning";
interface Upload { id: string; file: File }
interface Live { recipient: Recipient; documents: string[]; offerNumber: string; resolve: (yes: boolean) => void }

const ADDRESS_KEYS = ["firstName", "lastName", "street", "zipCode", "city", "country"] as const;
const st = () => useOfferStore.getState();
const offerNow = () => (st().offer ?? {}) as Offer;
const uploadsNow = () => (st().scratch.postUploads as Upload[] | undefined) ?? [];
const removedNow = () => (st().scratch.mailRemoved as string[] | undefined) ?? [];
const say = (type: Kind, text: string) => st().remember("postStatus", { type, text });
const messageOf = (err: unknown) => (err instanceof Error && err.message ? err.message : String(err));
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const enclosedNow = (offer: Offer): Enclosed[] => [...statics(offer, removedNow()), ...uploadsNow().map((u) => ({ id: u.id, type: "upload" as const, filename: u.file.name, label: "Upload", size: u.file.size }))];
/** the offer keeps the address (as Kundendaten has it) and the list of the letter */
function keep() {
  const o = offerNow(), next = postalOf(o, addressOf(o), enclosedNow(o));
  if (!same(o.postal, next)) st().setTop({ postal: next });
}
/** a file as the request carries it */
async function base64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let text = "";
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
}
const dealOf = (o: Offer) => String(o.auftragId ?? (o.mail ?? {}).auftragId ?? "").trim();

/** before any letter: the address complete, and a deal number or the release by password. null: stopped (said in the status) */
async function addressAndDeal(release: () => Promise<{ confirmedBy: string } | null>) {
  keep();
  const first = offerNow(), recipient = addressOf(first);
  if (invalid(recipient).length) throw new Error(TEXT.addressIncomplete);
  const deal = dealOf(first);
  let released: { confirmedBy: string } | null = null;
  st().remember("postDealMissing", !deal);
  if (!deal) {
    say("warning", TEXT.noDeal);
    released = await release();
    if (!released) { document.getElementById("zf-post-deal")?.focus(); say("error", TEXT.noRelease); return null; }
    st().remember("postDealMissing", false);
  }
  return { first, recipient, deal, released };
}
const printerMode = () => call("postConfig").then((r) => String(r.mode || "").toLowerCase()).catch(() => ""); // unknown counts as live: better one question too many

/** the signed documents as a letter — the only way a customer without e-mail gets the signed copy */
async function sendSigned(io: { release: () => Promise<{ confirmedBy: string } | null>; live: (l: Omit<Live, "resolve">) => Promise<boolean> }) {
  const start = await addressAndDeal(io.release);
  if (!start) return;
  const { first, recipient, deal, released } = start, number = String(first.offerNumber || "").trim();
  if (!number) throw new Error(SIGN.noNumber);
  say("info", SIGN.loadingSigned);
  const signed = await call("signedDocuments", { params: { offerNumber: number } });
  const parts = signedParts(signed.documents as SignedDoc[]);
  if (!parts) throw new Error("Keine unterschriebenen Unterlagen gefunden.");
  if ((await printerMode()) !== "test" && !(await io.live({ recipient, documents: signed.documents.map((d) => d.filename), offerNumber: number }))) { say("info", TEXT.cancelled); return; }
  say("info", SIGN.sendingSigned);
  const sendId = crypto.randomUUID(), variantId = sendVariantOf(st(), deal);
  const body = JSON.stringify({ ...signedLetter({ deal, recipient, ...parts, release: released, offerNumber: number, sendId }), ...(variantId ? { variantId } : {}) });
  let res: Response;
  try { res = await fetch("/api/post/send", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body }); }
  catch { const followed = await follow(sendId, (t) => say("info", t)); if (!followed) throw new Error("Keine Verbindung zum Server."); res = followed; }
  const result = (await res.json().catch(() => ({}))) as Posted & Offer;
  if (!res.ok || result.ok === false) throw new Error(errorOf(result).message || `Postversand fehlgeschlagen (${res.status}).`);
  const done = signedSent(result);
  historyChanged();
  say(done.ok ? "success" : "error", done.text);
  if (done.warn) toast.warning("Bitrix-Ablage fehlgeschlagen", { description: done.warn });
}

async function send(io: { ask: (a: Omit<Ask, "resolve">) => Promise<boolean>; askMain: (items: MainItem[]) => Promise<boolean>; release: () => Promise<{ confirmedBy: string } | null>; live: (l: Omit<Live, "resolve">) => Promise<boolean>; onSent: (s: Sent) => void; price: Offer | null }) {
  const start = await addressAndDeal(io.release);
  if (!start) return;
  const { first, recipient, deal, released } = start;
  const main = missingMain(first, io.price as never);
  if (main.length && !(await io.askMain(main))) { say("info", TEXT.cancelled); return; }
  if (!String(offerNow().offerNumber || "").trim()) await giveNumber();
  // the deal's draft must hold what goes out: a refused or failed save stops the letter (audit F7)
  const unsaved = await saveBeforeSend(NOTHING.post);
  if (unsaved) { say("error", unsaved.text); setStop("post", unsaved.stop); return; }

  const offer = offerNow(), type = String(offer.activeOffer || "bu").toLowerCase(), number = String(offer.offerNumber || "");
  const payload = { ...offer, activeOffer: type, offerNumber: number }, pdfName = `${number}.pdf`, enclosed = enclosedNow(offer);
  const mode = await printerMode();
  if (mode !== "test" && !(await io.live({ recipient, documents: [pdfName, ...enclosed.map((e) => e.filename)], offerNumber: number }))) { say("info", TEXT.cancelled); return; }

  // an offer that reached the customer before goes out as the exact document sent then
  const prior = priorSend(await call("offerSends", { params: { offerNumber: number } }).then((r) => r.sends as Offer[] | null | undefined).catch(() => null));
  if (prior && !(await io.ask(priorQuestion(number, prior)))) { say("info", TEXT.cancelled); return; }

  say("info", TEXT.makingPdf);
  let pdf: Blob;
  try { pdf = (await postForFile("/docx-template/pdf", payload)).blob; }
  catch (err) { throw new Error(err instanceof ApiFailure && err.status > 0 ? `PDF-Generierung fehlgeschlagen (${err.status}).` : messageOf(err)); }
  const attachments: Offer[] = [];
  for (const e of enclosed) {
    if (e.type === "static") attachments.push({ type: "static", id: e.id, filename: e.filename });
    else { const u = uploadsNow().find((x) => x.id === e.id); if (u) attachments.push({ type: "upload", filename: e.filename, base64: await base64(u.file) }); }
  }
  // the same documents the mail files in Bitrix — best effort: one that cannot be made is named in the comment
  const docWarnings: string[] = [], bitrixDocs: { filename: string; base64: string }[] = [];
  for (const job of bitrixJobs(type, number, false)) {
    say("info", `Erzeuge ${job.label} …`);
    try {
      const file = await postForFile(job.path, payload);
      if (file.status !== 204) bitrixDocs.push({ filename: file.filename || job.name, base64: await base64(file.blob) });
    } catch (err) { if (!job.optional) docWarnings.push(`${job.label} konnte nicht erzeugt werden: ${messageOf(err)}`); }
  }

  say("info", TEXT.sending);
  const sendId = crypto.randomUUID();
  const body: Offer = letter({ deal, recipient, document: { filename: pdfName, base64: await base64(pdf) }, attachments, bitrixDocs, docWarnings, internalNote: String(st().scratch.internalNote ?? ""), release: released, offerNumber: number, sendId, payload });
  const variantId = sendVariantOf(st(), deal); // the variant this letter is a send of (ADR 027 A)
  if (variantId) body.variantId = variantId;
  const post = async (): Promise<Response> => {
    try { return await fetch("/api/post/send", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); }
    catch { const res = await follow(sendId, (t) => say("info", t)); if (res) return res; throw new Error("Keine Verbindung zum Server."); }
  };
  let res = await post();
  if (res.status === 409) {
    const conflict = (await res.json().catch(() => ({}))) as Offer, e = errorOf(conflict);
    if (e.code === "ALREADY_SENT") {
      if (!(await io.ask(alreadySent(conflict)))) { say("info", TEXT.notAgain); return; }
      body.forceResend = true;
    } else if (e.code === "OFFER_CHANGED") {
      if (!(await io.ask(changedQuestion(conflict)))) throw new NeedsNewVersion(SEND_TEXT.offerChanged);
      body.useSentOriginal = true; delete body.payload;
    } else throw refusal(e.code, SEND_TEXT.offerChanged) ?? new Error(e.message || `Postversand fehlgeschlagen (${res.status}).`);
    res = await post();
  }
  const result = (await res.json().catch(() => ({}))) as Posted & Offer;
  // also the second answer may refuse: no stored original to post (server, audit F3), or sent hand-edited (F4)
  if (!res.ok || result.ok === false) throw refusal(errorOf(result).code, SEND_TEXT.offerChanged) ?? new Error(errorOf(result).message || `Postversand fehlgeschlagen (${res.status}).`);

  const text = sentText(result);
  historyChanged();
  if (result.bitrix?.ok === false) {
    const warn = filingFailed(String(result.bitrix.error ?? "").trim());
    say("error", `${text} – ${warn}`);
    toast.warning("Bitrix-Ablage fehlgeschlagen", { description: warn });
  } else say("success", text);
  st().remember("postSent", true); // one tap, at most one letter
  st().remember("internalNote", "");
  const sentOffer = { ...offerNow(), offerNumber: number };
  try { // the offer is kept under its number, as after a PDF
    await call("saveOffer", { body: { client: "react", offerNumber: number, offerType: type, payload: sentOffer, pricing: io.price ?? null, savedAt: new Date().toISOString(), clientSaveId: crypto.randomUUID() } });
    toast.success("Gespeichert", { description: `Angebot ${number} wurde gespeichert.` });
  } catch { /* the send record on the server is the proof; the offer is saved with the next save */ }
  st().patch("zusammenfassung" as never, { versand: { art: "post", versendetAm: new Date().toISOString() } } as never); // after the save, as today
  io.onSent({ dealId: deal, offerNumber: number, offer: sentOffer, title: TEXT.sentTitle,
    result: { attachmentNames: [...(result.attachmentNames ?? []), ...bitrixDocs.map((d) => d.filename)], bitrixComment: result.bitrix ?? null, offerTotal: Number(io.price?.total) || 0, selfPayAmount: Number(io.price?.selfPayAmount) || 0, ...(result.sendId ? { sendId: result.sendId } : {}) } });
  if (deal) void call("logDialogEvent", { params: { id: deal }, body: { event: "move_dialog_shown", offerNumber: number, offerType: type } }).catch(() => undefined);
}

/** without a deal number the letter is not filed in Bitrix: released by the user's own password, for this one send */
function Release({ onDone }: { onDone: (r: { confirmedBy: string } | null) => void }) {
  const [password, setPassword] = useState(""), [note, setNote] = useState<{ error: boolean; text: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const confirm = async () => {
    if (!password) { input.current?.focus(); return; }
    setNote({ error: false, text: "Prüfe Passwort …" });
    try { const r = await call("confirmPassword", { body: { password } }); onDone({ confirmedBy: String(r.email || "") }); }
    catch (err) { setNote({ error: true, text: messageOf(err) || "Passwort falsch" }); setPassword(""); input.current?.focus(); }
  };
  return (
    <Modal id="zf-post-release" labelledBy="zf-post-release-title" onCancel={() => onDone(null)}>
      <h3 id="zf-post-release-title" className="m-0 text-lg font-semibold">Ohne Auftrag/Deal-ID senden?</h3>
      <p className="m-0" data-part="text">Ohne Auftrag-ID wird dieser Brief <strong>nicht in Bitrix dokumentiert</strong> — weder Kommentar noch Angebot, Kalkulation oder Anlagen. Zum Freigeben bitte das eigene Passwort eingeben.</p>
      <input ref={input} type="password" aria-label="Passwort" autoComplete="current-password" placeholder="Passwort" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void confirm(); }}
        className="min-h-12 w-full rounded-lg border-2 border-input bg-card px-3 text-base" />
      {note ? <p role="status" data-part="note" className={cn("m-0", note.error ? "font-semibold text-destructive" : "text-muted-foreground")}>{note.text}</p> : null}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={() => onDone(null)}>Abbrechen</Button>
        <Button onClick={() => void confirm()}>Freigeben und senden</Button>
      </div>
    </Modal>
  );
}

/** live mode has no safety net: the printer prints and franks at once — asked once, with who gets what */
function LiveQuestion({ q }: { q: Live }) {
  const view = liveQuestion(q.recipient, q.documents, q.offerNumber);
  const [line, setLine] = useState(view.offer);
  useEffect(() => { let on = true; void call("postBalance").then((b) => { if (on) setLine(withBalance(view.offer, b)); }).catch(() => undefined); return () => { on = false; }; }, [view.offer]); // nice to have, never blocks
  return (
    <Modal id="zf-post-live" labelledBy="zf-post-live-title" onCancel={() => q.resolve(false)}>
      <h3 id="zf-post-live-title" className="m-0 text-lg font-semibold">Brief verbindlich versenden?</h3>
      <p className="m-0" data-part="text">Der Brief wird sofort gedruckt, frankiert und an die Deutsche Post übergeben. Eine Stornierung ist nur innerhalb von 15 Minuten möglich.</p>
      <p className="m-0" data-part="text"><strong>Empfänger</strong>{view.recipient.map((l) => <span key={l} className="block">{l}</span>)}</p>
      <p className="m-0" data-part="text"><strong>{view.heading.split(" (")[0]}</strong> ({view.heading.split(" (")[1]}{view.documents.map((d, i) => <span key={i} className="block break-all">{d}</span>)}</p>
      <p className="m-0" data-part="text">{line}</p>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={() => q.resolve(false)}>Abbrechen</Button>
        <Button onClick={() => q.resolve(true)}>Verbindlich senden</Button>
      </div>
    </Modal>
  );
}

const ICONS = { info: Info, success: CircleCheck, error: CircleX, warning: TriangleAlert } as const;
const TONE = { info: "text-foreground", success: "text-[#1e8449]", error: "text-destructive", warning: "text-[#b45309]" } as const;

export function Post() {
  const offer = (useOfferStore((s) => s.offer) ?? {}) as Offer;
  const uploads = (useOfferStore((s) => s.scratch.postUploads) as Upload[] | undefined) ?? [];
  const removed = (useOfferStore((s) => s.scratch.mailRemoved) as string[] | undefined) ?? [];
  const status = useOfferStore((s) => s.scratch.postStatus) as { type: Kind; text: string } | null | undefined;
  const sentOnce = useOfferStore((s) => s.scratch.postSent) === true;
  const dealMissing = useOfferStore((s) => s.scratch.postDealMissing) === true;
  const price = usePrice();
  const navigate = useNavigate();
  const { dealId: key = "", type: typeParam = "" } = useParams();
  const [busy, setBusy] = useState(false), [busySigned, setBusySigned] = useState(false); // each letter locks its own button, as today
  const lock = useRef(false);
  const [question, setQuestion] = useState<Ask | null>(null);
  const [main, setMain] = useState<{ items: MainItem[]; resolve: (yes: boolean) => void } | null>(null);
  const [release, setRelease] = useState<{ resolve: (r: { confirmedBy: string } | null) => void } | null>(null);
  const [live, setLive] = useState<Live | null>(null);
  const [sent, setSent] = useState<Sent | null>(null);

  const recipient = addressOf(offer), deal = dealOf(offer), fixed = statics(offer, removed);
  const stored = `${ADDRESS_KEYS.map((f) => recipient[f]).join("\u0001")}|${deal}|${fixed.map((f) => f.id).join(",")}|${uploads.map((u) => u.id).join(",")}`;
  useEffect(() => { keep(); }, [stored]); // the offer keeps what the letter is made of
  const setDeal = (value: string) => { const v = value.trim(), o = offerNow(); st().setTop({ auftragId: v || undefined, mail: { ...(o.mail ?? {}), auftragId: v }, postal: { ...(o.postal ?? {}), auftragId: v } }); };
  const add = (files: File[]) => {
    const pdfs = files.filter((f) => { const ok = isPdf(f); if (!ok) say("warning", ignored(f.name)); return ok; });
    if (pdfs.length) st().remember("postUploads", [...uploadsNow(), ...pdfs.map((file) => ({ id: `upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, file }))]);
  };
  const tap = async () => {
    if (lock.current || sentOnce) return;
    lock.current = true; setBusy(true);
    setStop("post", null);
    try {
      await send({
        price: (price.data ?? null) as Offer | null, onSent: setSent,
        ask: (a) => new Promise<boolean>((resolve) => setQuestion({ ...a, resolve: (yes) => { setQuestion(null); resolve(yes); } })),
        askMain: (items) => new Promise<boolean>((resolve) => setMain({ items, resolve })),
        release: () => new Promise((resolve) => setRelease({ resolve: (r) => { setRelease(null); resolve(r); } })),
        live: (l) => new Promise<boolean>((resolve) => setLive({ ...l, resolve: (yes) => { setLive(null); resolve(yes); } })),
      });
    } catch (err) { say("error", messageOf(err) || "Postversand fehlgeschlagen."); if (err instanceof NeedsNewVersion) setStop("post", "new-version"); }
    finally { lock.current = false; setBusy(false); }
  };
  const tapSigned = async () => {
    if (lock.current) return;
    lock.current = true; setBusySigned(true);
    try {
      await sendSigned({
        release: () => new Promise((resolve) => setRelease({ resolve: (r) => { setRelease(null); resolve(r); } })),
        live: (l) => new Promise<boolean>((resolve) => setLive({ ...l, resolve: (yes) => { setLive(null); resolve(yes); } })),
      });
    } catch (err) { say("error", messageOf(err) || "Postversand fehlgeschlagen."); }
    finally { lock.current = false; setBusySigned(false); }
  };
  // offered once a signature started from this tab is complete — asked each time the tab is opened
  const onTab = useOfferStore((s) => s.scratch.sendTab) === "post", number = String(offer.offerNumber || "").trim();
  const [signedReady, setSignedReady] = useState(false);
  useEffect(() => {
    setSignedReady(false);
    if (!onTab || !number) return;
    let on = true;
    void call("signingStatus", { params: { offerNumber: number } }).then((list) => { if (on) setSignedReady(canPostSigned(list)); }).catch(() => undefined);
    return () => { on = false; };
  }, [onTab, number]);
  const warn = warning(recipient);

  return (
    <section className="grid gap-3" aria-labelledby="zf-post-title" data-testid="zf-post">
      <h3 id="zf-post-title" className="m-0 text-[1.05rem] font-semibold">Angebot per Post senden</h3>
      {warn ? <p role="alert" data-testid="zf-post-warning" className="m-0 rounded-lg border border-[#f0c36d] bg-[#fff7e6] px-3 py-3 text-[#7a4b00]"><strong>Unvollständige Postadresse.</strong> {warn} Ohne vollständige Anschrift kann der Brief nicht zugestellt werden.</p> : null}
      <Field label="Lead ID / Auftrag ID" id="zf-post-deal" value={deal} inputMode="numeric" placeholder="z.B. 12345" aria-invalid={dealMissing && !deal ? true : undefined} onChange={(e) => setDeal(e.target.value)} />
      <div className="grid gap-1 rounded-lg border border-border bg-card px-3 py-3" data-testid="zf-post-address">
        <p className="m-0 flex flex-wrap items-center gap-3"><strong>Anschrift (aus Kundendaten)</strong>
          <Link to={`/deal/${key}/${typeParam}/Kundendaten`} className="ml-auto inline-flex min-h-12 items-center font-semibold text-primary underline">In Kundendaten ändern</Link></p>
        <p className="m-0"><span data-field="firstName">{recipient.firstName}</span> <span data-field="lastName">{recipient.lastName}</span></p>
        <p className="m-0" data-field="street">{recipient.street}</p>
        <p className="m-0"><span data-field="zipCode">{recipient.zipCode}</span> <span data-field="city">{recipient.city}</span></p>
        <p className="m-0" data-field="country">{recipient.country}</p>
        <p className="m-0 text-[0.9rem] text-muted-foreground">Die Druckerei liest die Anschrift aus dem Angebot — sie steht dort so, wie sie in den Kundendaten eingetragen ist.</p>
      </div>

      <div className="grid gap-2" data-testid="zf-post-files">
        <p className="m-0"><strong data-part="title">Im Postversand enthalten</strong></p>
        <ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2">
          <FileRow name={`${String(offer.offerNumber || "") || "Angebot"}.pdf`} meta="Angebots-PDF" fixed onRemove={() => undefined} />
          {fixed.map((f) => <FileRow key={f.id} name={f.filename} meta={f.label} onRemove={() => st().patch("docSelection" as never, { [f.id]: false } as never)} />)}
          {uploads.map((u) => <FileRow key={u.id} name={u.file.name} meta={`Upload · ${uploadSize(u.file.size)}`} onRemove={() => st().remember("postUploads", uploadsNow().filter((x) => x.id !== u.id))} />)}
        </ul>
        {/* U-024: own PDFs are added in a drop zone below the list (only PDFs, as before) */}
        <DropZone id="zf-post-add" data-testid="zf-post-drop" accept="application/pdf,.pdf" title="PDF hier ablegen, einfügen (⌘V) oder auswählen" onFiles={add} />
        <p className="m-0 text-[0.95rem] text-muted-foreground" data-part="hint">{TEXT.hint}</p>
      </div>

      <div className="flex flex-wrap items-start gap-2">
        <Button data-action="post" size="lg" disabled={busy || sentOnce} onClick={() => void tap()}>
          {busy ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : <Mailbox aria-hidden className="size-4" />}<span data-part="label">Per Post senden</span>
        </Button>
        <SignOnSite via="post" />
      </div>
      {status ? (() => { const Icon = ICONS[status.type]; return (
        <p role="status" aria-live="polite" data-testid="zf-post-status" data-type={status.type} className={cn("m-0 flex items-start gap-2 rounded-lg border border-border bg-card px-3 py-2", TONE[status.type])}><Icon aria-hidden className="mt-0.5 size-4 shrink-0" /><span data-part="text">{status.text}</span></p>
      ); })() : null}
      <StopActions place="post" />

      {signedReady ? (
        <div><Button variant="outline" data-action="post-signed" disabled={busySigned} onClick={() => void tapSigned()}><Mailbox aria-hidden className="size-4" /><span data-part="label">Unterschriebene Unterlagen per Post senden</span></Button></div>
      ) : null}

      {release ? <Release onDone={release.resolve} /> : null}
      {main ? <MainItems items={main.items} onDone={(yes, page) => { const r = main.resolve; setMain(null); r(yes); if (page) navigate(`/deal/${key}/${typeParam}/${page}`); }} /> : null}
      {live ? <LiveQuestion q={live} /> : null}
      {question ? <Question q={question} /> : null}
      {sent ? <SentDialog s={sent} codes={materialCodes(price.data)} onClose={() => setSent(null)} /> : null}
    </section>
  );
}
