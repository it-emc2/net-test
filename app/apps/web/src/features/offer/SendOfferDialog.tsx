import { useEffect, useState } from "react";
import { Loader2, Check, Mail } from "lucide-react";
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

function greetingFor(k: OfferPayload["Kundendaten"]): string {
  const l = (k.lastName || "").trim();
  if (k.salutation === "Frau") return `Sehr geehrte Frau ${l}`.trim();
  if (k.salutation === "Herr") return `Sehr geehrter Herr ${l}`.trim();
  if (k.salutation === "Familie") return `Sehr geehrte Familie ${l}`.trim();
  return "Sehr geehrte Damen und Herren";
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
  const [body, setBody] = useState(
    `${greetingFor(k)},\n\nvielen Dank für Ihr Interesse. Im Anhang finden Sie Ihr persönliches Angebot.\n\nFür Rückfragen stehen wir Ihnen gerne zur Verfügung.`,
  );
  const [state, setState] = useState<{ status: "idle" | "sending" | "sent" | "error"; msg?: string }>({ status: "idle" });

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

  async function send() {
    if (!to.trim()) {
      setState({ status: "error", msg: "Empfänger fehlt" });
      return;
    }
    setState({ status: "sending" });
    try {
      const r = await documentsApi.send(payload, { to: to.trim(), subject, body });
      setState({ status: "sent", msg: r.attachmentNames.join(", ") });
      setTimeout(() => onOpenChange(false), 1200);
    } catch (e) {
      setState({ status: "error", msg: e instanceof Error ? e.message : "Senden fehlgeschlagen" });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Angebot per E-Mail senden</DialogTitle>
          <DialogDescription>
            Das Angebot-PDF und die Standard-Unterlagen werden automatisch angehängt. Vorschau rechts.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-2">
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
              <Check className="size-4" /> Gesendet
            </span>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={state.status === "sending"}>
            Abbrechen
          </Button>
          <Button onClick={send} disabled={state.status === "sending" || state.status === "sent"}>
            {state.status === "sending" ? <Loader2 className="animate-spin" /> : <Mail />} Senden
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
