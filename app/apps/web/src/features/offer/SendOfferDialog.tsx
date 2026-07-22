import { useEffect, useState } from "react";
import { Loader2, Check, Mail, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { documentsApi } from "./documents";
import type { OfferPayload } from "./payload";

function greetFrag(salutation: string, lastName: string): string {
  const l = (lastName || "").trim();
  if (salutation === "Frau") return `sehr geehrte Frau ${l}`.trim();
  if (salutation === "Herr") return `sehr geehrter Herr ${l}`.trim();
  if (salutation === "Familie") return `sehr geehrte Familie ${l}`.trim();
  return "sehr geehrte Damen und Herren";
}

// Greeting line, incl. two-person handling. Same last name + Frau/Herr →
// "Sehr geehrte Frau und Herr <Nachname>"; otherwise greet each in full.
// Kept in sync with the server-side Angebot greeting (logic/angebotData.ts).
function greetingFor(k: OfferPayload["Kundendaten"]): string {
  const l = (k.lastName || "").trim();
  const p = k.partner;
  if (p && (p.firstName || p.lastName)) {
    const l2 = (p.lastName || "").trim();
    const sameLast = !!l && l.toLowerCase() === l2.toLowerCase();
    const mixed =
      (k.salutation === "Frau" && p.salutation === "Herr") ||
      (k.salutation === "Herr" && p.salutation === "Frau");
    if (sameLast && mixed) return `Sehr geehrte Frau und Herr ${l}`;
    const two = `${greetFrag(k.salutation, l)}, ${greetFrag(p.salutation, l2)}`;
    return two.charAt(0).toUpperCase() + two.slice(1);
  }
  if (k.salutation === "Frau") return `Sehr geehrte Frau ${l}`.trim();
  if (k.salutation === "Herr") return `Sehr geehrter Herr ${l}`.trim();
  if (k.salutation === "Familie") return `Sehr geehrte Familie ${l}`.trim();
  return "Sehr geehrte Damen und Herren";
}

// Default offer email, payer-conditional (ported from the v3 EmailManager).
// The attachment list differs: Selbstzahler get Angebot + Flyer; Kassenkunde
// also get Abtretungserklärung + Vollmacht (they claim the Pflegekassen-Zuschuss).
// ponytail: the v3 online-signing paragraph ({{SIGN_LINK}}) is omitted — the
// new app has no signing flow yet; add it back once that exists.
function defaultBody(k: OfferPayload["Kundendaten"], offerNumber: string): string {
  const nr = offerNumber || "ANG-2025-_____";
  const isSelbstzahler = k.payer === "Selbstzahler";
  const attachmentList = isSelbstzahler
    ? `1. Ihr Angebot ${nr}\n2. Unseren aktuellen Flyer "Barrierefreies Wohnen"`
    : `1. Ihr Angebot ${nr}\n2. Abtretungserklärung zur Abrechnung mit der Krankenkasse\n3. Vollmacht zur Beantragung des Zuschusses nach §40 Abs. 3, 4, 5 SGB XI\n4. Unseren aktuellen Flyer "Barrierefreies Wohnen"`;

  const closing = isSelbstzahler
    ? `Bei Rückfragen stehe ich Ihnen gerne zur Verfügung.`
    : `Sobald uns Ihre Unterlagen vorliegen, übernehmen wir für Sie sämtliche weiteren Schritte und stellen den Antrag auf Zuschuss direkt bei Ihrer Pflegekasse – selbstverständlich kostenfrei. Dank unserer langjährigen Erfahrung und etablierten Zusammenarbeit mit allen Pflege- und Krankenkassen profitieren Sie von einer reibungslosen und professionellen Abwicklung.\n\nBei Rückfragen stehe ich Ihnen gerne zur Verfügung.`;

  return `${greetingFor(k)},

vielen Dank für Ihr Interesse an unseren Dienstleistungen. Mit emc2 entscheiden Sie sich für einen zuverlässigen Partner, der Ihnen höchste Qualität und volle Sicherheit bietet:

• Anerkannter Dienstleister nach SGB – von allen Pflegekassen geprüft und anerkannt.
• Nur Markenqualität vom Fachhändler – langlebige Produkte, auf die Sie sich verlassen können.
• 5 Jahre Gewährleistung – unsere Sicherheit für Ihre Investition.
• Professionelle Antragsstellung – auf Wunsch übernehmen wir die Antragsstellung bei der Pflegekasse für Sie.
• Exklusiver Neukundenbonus – profitieren Sie von unserem besonderen Willkommensvorteil.
• Gratis Haltegriff – für mehr Komfort und Sicherheit in Ihrem Alltag.

Unser Ziel ist es, Ihr Leben leichter, sicherer und komfortabler zu machen.

Im Anhang erhalten Sie wie gewünscht die folgenden Unterlagen:

${attachmentList}

Bitte füllen Sie die Dokumente aus und senden Sie uns diese unterschrieben zurück – gerne bequem per E-Mail an service@e-m-c-2.de.

${closing}`;
}

export function SendOfferDialog({
  payload,
  open,
  onOpenChange,
}: {
  payload: OfferPayload;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const k = payload.Kundendaten;
  const [to, setTo] = useState(k.email || "");
  const [subject, setSubject] = useState(`Ihr Angebot${payload.offerNumber ? ` ${payload.offerNumber}` : ""}`);
  const [body, setBody] = useState(() => defaultBody(k, payload.offerNumber || ""));
  const [state, setState] = useState<{ status: "idle" | "sending" | "sent" | "error"; msg?: string; busyMode?: "email" | "bitrix" }>({ status: "idle" });

  // The dialog stays mounted for the page's lifetime, so the fields above only
  // pick up their initial values once (at page load, before Kundendaten is
  // filled in). Re-sync them from the live payload each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setTo(k.email || "");
    setSubject(`Ihr Angebot${payload.offerNumber ? ` ${payload.offerNumber}` : ""}`);
    setBody(defaultBody(k, payload.offerNumber || ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Preview pane can show either the email or the generated offer PDF.
  const [previewMode, setPreviewMode] = useState<"email" | "offer">("email");

  // Live email preview — re-render the branded HTML as the body is edited
  // (debounced so we don't hit the server on every keystroke).
  const [preview, setPreview] = useState("");
  useEffect(() => {
    if (!open || previewMode !== "email") return;
    let cancelled = false;
    const t = setTimeout(() => {
      documentsApi
        .emailPreview(body)
        .then((html) => !cancelled && setPreview(html))
        .catch(() => !cancelled && setPreview(""));
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [body, open, previewMode]);

  // Offer-PDF preview — rendered on demand (the true paged document with logo
  // + footer). Fetched when the Angebot tab is first shown; object URL revoked
  // on cleanup. Re-fetches each time the dialog opens (payload may have changed).
  const [offerUrl, setOfferUrl] = useState("");
  const [offerErr, setOfferErr] = useState(false);
  useEffect(() => {
    if (!open || previewMode !== "offer" || offerUrl) return;
    let url = "";
    let cancelled = false;
    setOfferErr(false);
    documentsApi
      .offerPdfBlob(payload)
      .then((blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setOfferUrl(url);
      })
      .catch(() => !cancelled && setOfferErr(true));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [open, previewMode, offerUrl, payload]);

  // Drop the cached offer preview whenever the dialog closes so a re-open
  // reflects the latest payload.
  useEffect(() => {
    if (!open) {
      setOfferUrl("");
      setPreviewMode("email");
    }
  }, [open]);

  async function send(mode: "email" | "bitrix" = "email") {
    if (mode === "email" && !to.trim()) {
      setState({ status: "error", msg: "Empfänger fehlt" });
      return;
    }
    setState({ status: "sending", busyMode: mode });
    try {
      const r = await documentsApi.send(payload, { to: to.trim(), subject, body }, mode);
      // Bitrix issues in email mode are non-fatal but must be surfaced.
      const warn = r.bitrixErrors?.length ? ` — Bitrix-Hinweis: ${r.bitrixErrors.join("; ")}` : "";
      const done = mode === "bitrix" ? "An Bitrix übermittelt" : "Gesendet";
      setState({ status: "sent", msg: `${done}: ${r.attachmentNames.join(", ")}${warn}` });
      setTimeout(() => onOpenChange(false), warn ? 3000 : 1200);
    } catch (e) {
      setState({ status: "error", msg: e instanceof Error ? e.message : "Senden fehlgeschlagen" });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-4xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Angebot per E-Mail senden</DialogTitle>
          <DialogDescription>
            Das Angebot-PDF und die Standard-Unterlagen werden automatisch angehängt.
          </DialogDescription>
        </DialogHeader>

        {/* Stacks on portrait iPad (&lt;lg); two columns on wider/landscape. */}
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Editor */}
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="send-to">Empfänger</Label>
              <Input id="send-to" type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="kunde@example.de" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="send-subject">Betreff</Label>
              <Input id="send-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="send-body">Nachricht</Label>
              <textarea
                id="send-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={12}
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              <p className="text-xs text-muted-foreground">Signatur & rechtlicher Hinweis werden automatisch ergänzt.</p>
            </div>
          </div>

          {/* Live preview — email or generated offer PDF */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Vorschau</Label>
              <div className="inline-flex rounded-md border p-0.5 text-xs">
                {(["email", "offer"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setPreviewMode(m)}
                    className={cn(
                      "rounded px-2.5 py-1 font-medium transition-colors",
                      previewMode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent",
                    )}
                  >
                    {m === "email" ? "E-Mail" : "Angebot"}
                  </button>
                ))}
              </div>
            </div>
            <div className="rounded-md border bg-white">
              {previewMode === "email" ? (
                <>
                  <div className="border-b bg-muted/40 px-3 py-2 text-xs">
                    <div className="truncate"><span className="text-muted-foreground">An:</span> {to || "—"}</div>
                    <div className="truncate"><span className="text-muted-foreground">Betreff:</span> {subject || "—"}</div>
                  </div>
                  <iframe title="E-Mail-Vorschau" srcDoc={preview} className="h-[22rem] w-full" sandbox="" />
                </>
              ) : offerErr ? (
                <div className="flex h-[22rem] items-center justify-center px-4 text-center text-sm text-destructive">
                  Angebots-Vorschau fehlgeschlagen.
                </div>
              ) : offerUrl ? (
                <iframe title="Angebots-Vorschau" src={offerUrl} className="h-[22rem] w-full" />
              ) : (
                <div className="flex h-[22rem] items-center justify-center text-sm text-muted-foreground">
                  <Loader2 className="mr-2 size-4 animate-spin" /> Angebot wird gerendert …
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          {state.status === "error" && <span className="mr-auto self-center text-sm text-destructive">{state.msg}</span>}
          {state.status === "sent" && (
            <span className="mr-auto flex items-center gap-1 self-center text-sm text-emerald-600">
              <Check className="size-4 shrink-0" /> {state.msg || "Gesendet"}
            </span>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={state.status === "sending"}>
            Abbrechen
          </Button>
          <Button
            variant="secondary"
            onClick={() => send("bitrix")}
            disabled={state.status === "sending" || state.status === "sent"}
            title="Nur an Bitrix übermitteln (kein E-Mail-Versand) und Deal auf „ANG schr. BB & Handwerk“ verschieben"
          >
            {state.status === "sending" && state.busyMode === "bitrix" ? <Loader2 className="animate-spin" /> : <Send />} An Bitrix senden
          </Button>
          <Button onClick={() => send("email")} disabled={state.status === "sending" || state.status === "sent"}>
            {state.status === "sending" && state.busyMode === "email" ? <Loader2 className="animate-spin" /> : <Mail />} Senden
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
