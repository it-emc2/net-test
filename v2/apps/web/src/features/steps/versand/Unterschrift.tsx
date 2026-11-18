// "Vor Ort unterschreiben (iPad)" (ADR 026, phase 4; Angebotsversand slice 6) — the same button
// on both tabs. The rules are sign-rules.ts; the questions are the dialogs of Senden.tsx.
import { LoaderCircle, PenLine } from "lucide-react";
import { useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { ApiFailure, call } from "../../../shared/api/index.js";
import { Button, cn } from "../../../shared/ui/index.js";
import { toast } from "../../../shared/ui/toaster.js";
import { checkStep, useOfferStore, usePrice } from "../../offer/index.js";
import { giveNumber } from "./number.js";
import { MainItems, Question, type Ask } from "./Senden.js";
import { errorOf, missingMain, type MainItem } from "./send-rules.js";
import { historyChanged, useSends } from "./Verlauf.js";
import { StopActions } from "./NeueVersion.js";
import { NOTHING, NeedsNewVersion, TEXT as VERSION, refusal, saveBeforeSend, sentHandEdited, setStop } from "./version.js";
import { TEXT, ready, request, signedBefore, type Signing } from "./sign-rules.js";

type Offer = Record<string, any>;
interface Status { type: "info" | "success" | "error"; text: string; link?: string }
const st = () => useOfferStore.getState();
const offerNow = () => (st().offer ?? {}) as Offer;
const messageOf = (err: unknown) => (err instanceof Error && err.message ? err.message : String(err));

export function SignOnSite({ via }: { via: "mail" | "post" }) {
  const key = `signStatus-${via}`;
  const status = useOfferStore((s) => s.scratch[key]) as Status | null | undefined;
  const price = usePrice();
  const navigate = useNavigate();
  const { dealId: dealKey = "", type: typeParam = "" } = useParams();
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [question, setQuestion] = useState<Ask | null>(null);
  const [main, setMain] = useState<{ items: MainItem[]; resolve: (yes: boolean) => void } | null>(null);
  const say = (s: Status) => st().remember(key, s);
  const place = `sign-${via}` as const;
  const sends = useSends().sends.data;

  const start = async () => {
    if (lock.current) return;
    lock.current = true;
    setStop(place, null);
    try {
      const problem = checkStep("Kundendaten");
      if (problem) { toast.error("Angaben unvollständig", { description: problem.message, id: "step-check" }); navigate(`/deal/${dealKey}/${typeParam}/${problem.goTo ?? "Kundendaten"}`); return; }
      // The last mail of this offer carried a hand-edited Word file: the signing view would show the
      // standard rendering — not what the customer has. Stopped before anything is saved (audit F4;
      // the server refuses the same with HAND_EDITED_SENT).
      const sentNumber = String(offerNow().offerNumber || "").trim();
      if (sentNumber && (st().scratch.handEditedNumber === sentNumber || sentHandEdited(sends, sentNumber))) throw new NeedsNewVersion(VERSION.handEditedSent);
      // asked before the save: the save stores the offer as final, so "no" must come before anything is written
      const missing = missingMain(offerNow(), price.data as never);
      if (missing.length && !(await new Promise<boolean>((resolve) => setMain({ items: missing, resolve })))) { say({ type: "info", text: TEXT.cancelled }); return; }
      if (!sentNumber) await giveNumber();
      // the deal's draft must hold what is signed: a refused or failed save stops here (audit F7)
      const unsaved = await saveBeforeSend(NOTHING.sign);
      if (unsaved) { say({ type: "error", text: unsaved.text }); setStop(place, unsaved.stop); return; }
      const offer = offerNow(), type = String(offer.activeOffer || "bu").toLowerCase(), number = String(offer.offerNumber || "");
      const payload = { ...offer, activeOffer: type, offerNumber: number };
      // the signing view has no way back to an offer that was not stored
      try {
        await call("saveOffer", { body: { client: "react", offerNumber: number, offerType: type, payload, pricing: price.data ?? null, savedAt: new Date().toISOString(), clientSaveId: crypto.randomUUID() } });
        toast.success("Gespeichert", { description: `Angebot ${number} wurde gespeichert.` });
      } catch (err) {
        // an offer that was sent and changed since is refused here already: say what to do, not "could not be saved"
        const refused = err instanceof ApiFailure ? refusal(err.code, TEXT.offerChanged) : null;
        if (refused) throw refused;
        toast.error("Speichern fehlgeschlagen", { description: messageOf(err) }); say({ type: "error", text: TEXT.notSaved }); return;
      }

      setBusy(true);
      say({ type: "info", text: TEXT.opening });
      const deal = String(offer.auftragId ?? (offer.mail ?? {}).auftragId ?? "").trim(), sendId = crypto.randomUUID();
      const ask = async (force: boolean) => {
        const res = await fetch("/api/signing", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request(payload, number, type, deal, via, force, sendId)) });
        return { res, body: (await res.json().catch(() => ({}))) as Offer };
      };
      let { res, body } = await ask(false);
      if (res.status === 409 && body.needsConfirm) {
        const again = await new Promise<boolean>((resolve) => setQuestion({ ...signedBefore(body.warning), resolve: (yes) => { setQuestion(null); resolve(yes); } }));
        if (!again) { say({ type: "info", text: TEXT.cancelled }); return; }
        ({ res, body } = await ask(true));
      }
      if (!res.ok) { const e = errorOf(body); throw refusal(e.code, TEXT.offerChanged) ?? new Error(e.message || `Fehler (${res.status})`); }
      historyChanged();
      const signing = body as Signing, opened = window.open(String(signing.link), "_blank");
      // a tablet that blocks new windows still gets there: the link stays under the message
      say({ type: "success", text: ready(signing), ...(opened ? {} : { link: String(signing.link) }) });
    } catch (err) { say({ type: "error", text: messageOf(err) || TEXT.failed }); if (err instanceof NeedsNewVersion) setStop(place, "new-version"); }
    finally { lock.current = false; setBusy(false); }
  };

  return (
    // "contents": the button sits beside the send button of its tab, the status goes below both
    <div className="contents" data-testid={`zf-sign-${via}`}>
      <div>
        <Button variant="outline" size="lg" data-action="sign" disabled={busy} onClick={() => void start()}>
          {busy ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : <PenLine aria-hidden className="size-4" />}<span data-part="label">Vor Ort unterschreiben (iPad)</span>
        </Button>
      </div>
      {status ? (
        <p role="status" aria-live="polite" data-part="status" data-type={status.type} className={cn("m-0 w-full basis-full rounded-lg border border-border bg-card px-3 py-2", status.type === "error" ? "text-destructive" : status.type === "success" ? "text-[#1e8449]" : "text-foreground")}>
          <span data-part="text">{status.text}</span>
          {status.link ? <a href={status.link} target="_blank" rel="noreferrer" data-part="link" className="ml-2 inline-flex min-h-12 items-center font-semibold text-primary underline">Unterschriften-Ansicht öffnen</a> : null}
        </p>
      ) : null}
      <div className="w-full basis-full empty:hidden"><StopActions place={place} /></div>
      {main ? <MainItems items={main.items} onDone={(yes, page) => { const r = main.resolve; setMain(null); r(yes); if (page) navigate(`/deal/${dealKey}/${typeParam}/${page}`); }} /> : null}
      {question ? <Question q={question} /> : null}
    </div>
  );
}
