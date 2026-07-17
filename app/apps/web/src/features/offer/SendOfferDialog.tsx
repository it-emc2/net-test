import { useState } from "react";
import { Loader2, Check, Mail } from "lucide-react";
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
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Angebot per E-Mail senden</DialogTitle>
          <DialogDescription>
            Das Angebot-PDF und die Standard-Unterlagen werden automatisch angehängt.
          </DialogDescription>
        </DialogHeader>

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
              rows={7}
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <p className="text-xs text-muted-foreground">Die Signatur wird automatisch angehängt.</p>
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
