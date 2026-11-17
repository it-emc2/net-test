// Sending (ADR 026, phase 4; Angebotsversand slice 4b, part 1): "An Kunden senden", the
// step-by-step messages, the question about main items
// that are not in the offer, the "already sent" question, and the dialog after sending with the
// move of the deal. The rules are send-rules.ts; what the mail says is Mail.tsx / mail-rules.ts.
// U-023 (owner 2026-11-17): "Nur in Bitrix ablegen", the files for Bitrix only, the plan photos
// and the product-picture PDF are gone; the send carries `includeProductImages: ""` as before
// that feature (the server route for a filing only stays — today's UI still uses it).
import { CircleCheck, CircleX, Info, LoaderCircle, Send, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router";
import { ApiFailure, call, postForFile } from "../../../shared/api/index.js";
import { Button, cn } from "../../../shared/ui/index.js";
import { toast } from "../../../shared/ui/toaster.js";
import { checkStep, flushDraft, useOfferStore, usePrice } from "../../offer/index.js";
import { giveNumber } from "./number.js";
import { SignOnSite } from "./Unterschrift.js";
import { historyChanged } from "./Verlauf.js";
import { ccDefault, excluded, touchedOf, type Touched } from "./mail-rules.js";
import {
  TEXT, atLocal, bitrixJobs, done, errorOf, filingFailed, materialCodes, missingMain, movePayload, sending, sentTitle, started,
  type MainItem, type SentResult,
} from "./send-rules.js";

type Offer = Record<string, any>;
type Kind = "info" | "success" | "error" | "warning";
type Status = { type: Kind; text: string } | { log: [Kind, string][] };
export interface Sent { dealId: string; result: SentResult; offerNumber: string; offer: Offer; /** another heading than the mail's (the letter) */ title?: string }
export interface Ask { title: string; message: string; yes: string; no: string; resolve: (yes: boolean) => void }

const st = () => useOfferStore.getState();
const offerNow = () => (st().offer ?? {}) as Offer;
const status = (s: Status | null) => st().remember("sendStatus", s);
const push = (type: Kind, text: string) => { const s = st().scratch.sendStatus as Status | null | undefined; status({ log: [...(s && "log" in s ? s.log : []), [type, text]] }); };
const messageOf = (err: unknown) => (err instanceof Error && err.message ? err.message : String(err));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const POLL_MS = { every: 3000, max: 6 * 60_000, notFound: 4 };

/** The send guard (ADR 023): if the connection drops, ask the server until the send is finished.
 *  null: the server never saw the request — nothing was sent. */
export async function follow(sendId: string, told0: (text: string) => void = (t) => push("info", t)): Promise<Response | null> {
  const t0 = Date.now();
  let missing = 0, told = false;
  while (Date.now() - t0 < POLL_MS.max) {
    await wait(POLL_MS.every);
    let r: Awaited<ReturnType<typeof call<"send">>>;
    try { r = await call("send", { params: { sendId } }); }
    catch (err) {
      if (err instanceof ApiFailure && err.status === 404) { if (++missing >= POLL_MS.notFound) return null; continue; }
      if (err instanceof ApiFailure && err.status === 401) return null;
      continue; // still no connection
    }
    const s = r.send?.status;
    if (s === "done") return new Response(JSON.stringify(r.result ?? { ok: true, sendId }), { status: 200 });
    if (s === "failed") return new Response(JSON.stringify({ error: "Send failed", detail: String((r.send as Offer).error ?? ""), sendId }), { status: 500 });
    if (!told) { told = true; told0(TEXT.stillRunning); }
  }
  return new Response(JSON.stringify({ error: TEXT.tooLong, sendId }), { status: 504 });
}
async function post(form: FormData): Promise<Response> {
  try { return await fetch("/api/email/send-offer", { method: "POST", body: form, credentials: "include" }); } // no time limit: the server finishes or fails on its own
  catch (err) {
    const res = await follow(String(form.get("sendId")));
    if (res) return res;
    throw new Error((err as Error)?.name === "TimeoutError" ? TEXT.timeout : "Keine Verbindung zum Server.");
  }
}

function useSend(ask: (a: Omit<Ask, "resolve">) => Promise<boolean>, askMain: (items: MainItem[]) => Promise<boolean>, onSent: (s: Sent) => void) {
  const { dealId: key = "", type: typeParam = "" } = useParams();
  const navigate = useNavigate();
  const price = usePrice();
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);

  return { busy, send: async () => {
    if (lock.current) return; // locked before the first wait: a second tap starts nothing
    lock.current = true; setBusy(true);
    try {
      const problem = checkStep("Kundendaten");
      if (problem) { toast.error("Angaben unvollständig", { description: problem.message, id: "step-check" }); navigate(`/deal/${key}/${typeParam}/${problem.goTo ?? "Kundendaten"}`); return; }
      const first = offerNow(), mail = (first.mail ?? {}) as Offer;
      const deal = String(first.auftragId ?? mail.auftragId ?? "").trim();
      if (!deal) { st().remember("dealMissing", true); status({ type: "error", text: TEXT.noDeal }); document.getElementById("zf-mail-deal")?.focus(); return; }
      const to = String(mail.to ?? "").trim();
      if (!to) { status({ type: "error", text: TEXT.noRecipient }); return; }
      const missing = missingMain(first, price.data as never);
      if (missing.length && !(await askMain(missing))) { status({ type: "info", text: TEXT.cancelled }); return; }
      // an offer that was never given a number gets it now — subject, text and PDF name the same one
      if (!String(offerNow().offerNumber || "").trim()) giveNumber();
      await flushDraft().catch(() => undefined);

      const offer = offerNow(), scratch = st().scratch, type = String(offer.activeOffer || "bu").toLowerCase();
      const number = String(offer.offerNumber || "");
      const payload = { ...offer, activeOffer: type, offerNumber: number };
      status({ log: [] });
      push("info", started);
      const edited = (scratch.editedDocx as File | null | undefined) ?? null;
      if (edited) push("info", `Geänderte DOCX wird verwendet: ${edited.name}`);
      // the documents for Bitrix first: none missing, or nothing goes out
      const docs: File[] = [];
      for (const job of bitrixJobs(type, number, !!edited)) {
        push("info", `Erzeuge ${job.label} …`);
        try {
          const file = await postForFile(job.path, payload);
          if (file.status !== 204) docs.push(new File([file.blob], file.filename || job.name, { type: file.type }));
        } catch (err) {
          if (job.optional) continue;
          throw new Error(`${job.label} konnte nicht erzeugt werden: ${messageOf(err)}`);
        }
      }
      push("info", sending(!!edited));

      const touched = (scratch.mailTouched as Touched | undefined) ?? touchedOf(offer);
      const cc = (touched.cc ? String(scratch.mailCc ?? "") : ccDefault(offer)).trim();
      const form = new FormData();
      form.append("to", to);
      form.append("internalNote", String(scratch.internalNote ?? ""));
      if (cc) form.append("cc", cc);
      const text = (offer.mail ?? {}) as Offer; // read again: a number given just now is in subject and text
      form.append("subject", String(text.subject || number || "Angebot").trim());
      form.append("body", String(text.body ?? ""));
      form.append("offerNumber", number);
      form.append("offerType", type);
      form.append("payload", JSON.stringify(payload));
      form.append("excludePreset", JSON.stringify(excluded(offer, (scratch.mailRemoved as string[] | undefined) ?? [])));
      form.append("excludeBitrixPresets", "");
      form.append("includeProductImages", ""); // no product-picture PDF (removed, U-023)
      form.append("dealId", deal);
      form.append("contactId", String((offer.Kundendaten ?? {}).bitrixContactId ?? "").trim());
      form.append("sendId", crypto.randomUUID());
      for (const f of (scratch.mailUploads as File[] | undefined) ?? []) form.append("attachments", f, f.name);
      for (const d of docs) form.append("bitrixDocs", d, d.name);
      if (edited) form.append("editedDocx", edited, edited.name);

      let res = await post(form);
      if (res.status === 409) {
        const conflict = (await res.json().catch(() => ({}))) as Offer, e = errorOf(conflict);
        if (e.code === "OFFER_CHANGED") throw new Error(TEXT.offerChanged);
        if (e.code !== "ALREADY_SENT") throw new Error(e.message || "Versand läuft bereits.");
        const again = await ask({ title: "Angebot noch einmal senden?", message: `Für diesen Deal wurde am ${atLocal(conflict.lastSentAt)} schon eine Angebots-E-Mail gesendet (${conflict.lastOfferNumber || "-"}).`, yes: "Ja, noch einmal senden", no: "Nein, nicht senden" });
        if (!again) { push("info", TEXT.notAgain); return; }
        form.set("forceResend", "1");
        res = await post(form);
      }
      if (!res.ok) { const e = errorOf(await res.json().catch(() => ({}))); throw new Error(e.message || `HTTP ${res.status}`); }
      const result = (await res.json().catch(() => ({}))) as SentResult;

      st().remember("internalNote", "");
      historyChanged();
      const filing = result.bitrixComment;
      if (filing?.ok === false) {
        const text = filingFailed(String(filing.error ?? "").trim());
        push("error", text);
        toast.warning("Bitrix-Ablage fehlgeschlagen", { description: text });
      } else push("success", done(result.attachmentNames ?? []));
      st().remember("editedDocx", null); // never applies to the next send by accident
      if (result.signingLink === "off-hand-edited") toast.info(TEXT.handEdited);
      st().patch("zusammenfassung" as never, { versand: { art: "mail", versendetAm: new Date().toISOString() } } as never);
      const sentOffer = offerNow();
      onSent({ dealId: deal, result, offerNumber: number, offer: { ...sentOffer, offerNumber: number } });
      void call("logDialogEvent", { params: { id: deal }, body: { event: "move_dialog_shown", offerNumber: number, offerType: type } }).catch(() => undefined);
      try { // the offer is kept under its number, as after a PDF
        await call("saveOffer", { body: { offerNumber: number, offerType: type, payload: { ...sentOffer, offerNumber: number }, pricing: price.data ?? null, savedAt: new Date().toISOString(), clientSaveId: crypto.randomUUID() } });
        toast.success("Gespeichert", { description: `Angebot ${number} wurde gespeichert.` });
      } catch { /* the send record on the server is the proof; the offer is saved with the next save */ }
    } catch (err) {
      push("error", `Senden fehlgeschlagen: ${messageOf(err)}`);
    } finally { lock.current = false; setBusy(false); }
  }, materialCodes: () => materialCodes(price.data) };
}

/** a dialog over the page: Esc and a tap beside it mean "no" */
export function Modal({ id, labelledBy, onCancel, children }: { id: string; labelledBy: string; onCancel: () => void; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { box.current?.querySelector<HTMLElement>("input, button")?.focus(); }, []);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3" data-testid={`${id}-backdrop`} onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div ref={box} role="dialog" aria-modal="true" aria-labelledby={labelledBy} data-testid={id} onKeyDown={(e) => { if (e.key === "Escape") onCancel(); }}
        className="grid max-h-[92dvh] w-full max-w-xl gap-4 overflow-y-auto rounded-xl bg-card p-5 text-card-foreground shadow-xl">{children}</div>
    </div>
  );
}

export function MainItems({ items, onDone }: { items: MainItem[]; onDone: (send: boolean, page?: string) => void }) {
  const [ok, setOk] = useState<Record<string, boolean>>({});
  const all = items.every((i) => ok[i.key]);
  return (
    <Modal id="zf-main" labelledBy="zf-main-title" onCancel={() => onDone(false)}>
      <h3 id="zf-main-title" className="m-0 text-lg font-semibold">Bitte vor dem Versand bestätigen</h3>
      <p className="m-0 text-muted-foreground">Diese Punkte sind im Angebot nicht enthalten. Bitte jeden einzeln bestätigen.</p>
      <div className="grid gap-2">
        {items.map((i) => (
          <div key={i.key} data-testid="zf-main-row" data-key={i.key} className="flex items-center gap-3 rounded-lg border border-border p-2">
            <label className="flex min-h-12 flex-1 cursor-pointer items-center gap-3">
              <input type="checkbox" className="size-6 shrink-0 accent-primary" checked={!!ok[i.key]} onChange={(e) => setOk({ ...ok, [i.key]: e.target.checked })} />
              <span>{i.question} Ist das korrekt?</span>
            </label>
            <Button variant="outline" data-page={i.page} onClick={() => onDone(false, i.page)}>Zur Seite</Button>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={() => onDone(false)}>Zurück</Button>
        <Button disabled={!all} onClick={() => onDone(true)}>Bestätigt – senden</Button>
      </div>
    </Modal>
  );
}

export function Question({ q }: { q: Ask }) {
  return (
    <Modal id="zf-ask" labelledBy="zf-ask-title" onCancel={() => q.resolve(false)}>
      <h3 id="zf-ask-title" className="m-0 text-lg font-semibold">{q.title}</h3>
      <p className="m-0" data-part="message">{q.message}</p>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={() => q.resolve(false)}>{q.no}</Button>
        <Button onClick={() => q.resolve(true)}>{q.yes}</Button>
      </div>
    </Modal>
  );
}

/** after sending: what went out, the move of the deal, and the repeated filing if Bitrix failed */
export function SentDialog({ s, codes, onClose }: { s: Sent; codes: string; onClose: () => void }) {
  const [moved, setMoved] = useState(false), [moving, setMoving] = useState(false), [line, setLine] = useState<{ ok: boolean; text: string; then?: string } | null>(null);
  const [retry, setRetry] = useState<"idle" | "busy" | "done" | "failed">("idle");
  const type = String(s.offer.activeOffer || "").toLowerCase();
  // "shown" is logged by the send itself (before the offer is saved, as today); here only "closed without moving"
  const close = () => {
    if (s.dealId && !moved) void call("logDialogEvent", { params: { id: s.dealId }, body: { event: "move_dialog_dismissed", offerNumber: s.offerNumber, offerType: type } }).catch(() => undefined);
    onClose();
  };
  const move = async () => {
    setMoving(true); setLine({ ok: true, text: "Verschiebe Deal…" });
    try {
      await call("moveSent", { params: { id: s.dealId }, body: movePayload(s.offer, s.result, s.offerNumber, codes) });
      setMoved(true); setLine({ ok: true, text: "Deal wurde auf „ANG verschickt\" verschoben." });
    } catch (err) {
      setLine({ ok: false, text: `Deal konnte nicht verschoben werden: ${messageOf(err)}`, then: "Das Angebot wurde trotzdem versendet – bitte NICHT erneut senden." });
    } finally { setMoving(false); }
  };
  const filingFailed = s.result.bitrixComment?.ok === false && !!s.result.sendId;
  const refile = async () => {
    setRetry("busy");
    try { await call("retryBitrix", { params: { sendId: s.result.sendId! }, body: {} }); setRetry("done"); historyChanged(); }
    catch { setRetry("failed"); }
  };
  const names = s.result.attachmentNames ?? [];
  return (
    <Modal id="zf-sent" labelledBy="zf-sent-title" onCancel={close}>
      <h3 id="zf-sent-title" className="m-0 flex items-center gap-2 text-lg font-semibold"><CircleCheck aria-hidden className="size-6 text-[#1e8449]" />{s.title ?? sentTitle}</h3>
      <p className="m-0 text-muted-foreground" data-part="text">Anhänge: {names.length ? names.join(", ") : "-"}</p>
      {line ? <p role="status" data-part="body" className={cn("m-0 font-semibold", line.ok ? "text-[#1e8449]" : "text-destructive")}>{line.text}{line.then ? <><br />{line.then}</> : null}</p> : null}
      {filingFailed ? (
        <div className="grid gap-2 rounded-lg border border-[#f0c36d] bg-[#fff7e6] p-3" data-part="refile">
          <p className="m-0">{retry === "done" ? "Die Unterlagen sind jetzt in Bitrix abgelegt." : retry === "failed" ? "Die Ablage in Bitrix hat wieder nicht geklappt. Bitte versuchen Sie es später noch einmal."
            : "Die Unterlagen wurden nicht in Bitrix abgelegt. Die Ablage kann wiederholt werden — es wird nichts erneut versendet."}</p>
          {retry !== "done" ? <div><Button variant="outline" disabled={retry === "busy"} onClick={() => void refile()}>{retry === "busy" ? "Wird abgelegt …" : "Ablage wiederholen"}</Button></div> : null}
        </div>
      ) : null}
      <div className="flex flex-wrap justify-end gap-2">
        {s.dealId && !moved ? <Button disabled={moving} onClick={() => void move()}>Deal auf „ANG verschickt" verschieben</Button> : null}
        <Button variant="outline" onClick={close}>Schließen</Button>
      </div>
    </Modal>
  );
}

const ICONS = { info: Info, success: CircleCheck, error: CircleX, warning: TriangleAlert } as const;
const TONE = { info: "text-foreground", success: "text-[#1e8449]", error: "text-destructive", warning: "text-[#b45309]" } as const;

export function Senden() {
  const edited = useOfferStore((s) => s.scratch.editedDocx) as File | null | undefined;
  const shown = useOfferStore((s) => s.scratch.sendStatus) as Status | null | undefined;
  const [question, setQuestion] = useState<Ask | null>(null);
  const [main, setMain] = useState<{ items: MainItem[]; resolve: (yes: boolean) => void } | null>(null);
  const [sent, setSent] = useState<Sent | null>(null);
  const navigate = useNavigate();
  const { dealId: key = "", type: typeParam = "" } = useParams();
  const ask = (a: Omit<Ask, "resolve">) => new Promise<boolean>((resolve) => setQuestion({ ...a, resolve: (yes) => { setQuestion(null); resolve(yes); } }));
  const askMain = (items: MainItem[]) => new Promise<boolean>((resolve) => setMain({ items, resolve }));
  const { busy, send, materialCodes: codes } = useSend(ask, askMain, setSent);

  return (
    <section className="grid gap-3 border-t border-border pt-4" aria-labelledby="zf-send-title" data-testid="zf-send">
      <h3 id="zf-send-title" className="sr-only">Senden</h3>
      {/* the send and the signing on site side by side; the sign status goes below both */}
      <div className="flex flex-wrap items-start gap-2">
        <Button data-action="send" size="lg" disabled={busy} className={cn(edited && "bg-[#b45309]")} onClick={() => void send()}>
          {busy ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : <Send aria-hidden className="size-4" />}<span data-part="label">{busy ? "Wird gesendet …" : edited ? "Geänderte DOCX senden" : "An Kunden senden"}</span>
        </Button>
        <SignOnSite via="mail" />
      </div>
      <p className="m-0 text-muted-foreground" data-part="sign-hint">Der Link zur Online-Unterschrift geht mit der E-Mail automatisch mit.</p>
      {edited ? <p className="m-0 font-semibold text-[#b45309]" data-testid="zf-docx-note">PDF wird aus Ihrer bearbeiteten Datei erzeugt</p> : null}

      {shown ? (
        <div role="status" aria-live="polite" data-testid="zf-send-status" className="grid gap-1 rounded-lg border border-border bg-card px-3 py-2">
          {("log" in shown ? shown.log : [[shown.type, shown.text] as [Kind, string]]).map(([k, text], i) => { const Icon = ICONS[k]; return (
            <p key={i} className={cn("m-0 flex items-start gap-2", TONE[k])} data-type={k}><Icon aria-hidden className="mt-0.5 size-4 shrink-0" /><span data-part="text">{text}</span></p>
          ); })}
        </div>
      ) : null}

      {main ? <MainItems items={main.items} onDone={(yes, page) => { const r = main.resolve; setMain(null); r(yes); if (page) navigate(`/deal/${key}/${typeParam}/${page}`); }} /> : null}
      {question ? <Question q={question} /> : null}
      {sent ? <SentDialog s={sent} codes={codes()} onClose={() => setSent(null)} /> : null}
    </section>
  );
}
