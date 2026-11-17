// Bestätigung des Vermieters (Foto / Datei) → the Bitrix deal, as today's UI does
// (test/vermieter-upload.test.tsx; v2/scripts/capture-vermieter-upload.cjs): the file goes as base64 in one
// POST /api/bitrix/deal/:id/upload/vermieter { filename, base64 } (today's route, no new outside call);
// needs a numeric Auftrag ID (the deal number of the address) and at most 15 MB; after a success
// "Genehmigung des Vermieters liegt vor?" is set to Ja. A file chip shows the state; its × only
// removes the chip (a file already in Bitrix24 stays there). UX-CHANGES U-033.
import { Camera, Check, FileUp, Loader2, TriangleAlert, X } from "lucide-react";
import { useRef, useState } from "react";
import { useParams } from "react-router";
import { Button, cn } from "../../../shared/ui/index.js";
import { useOfferStore } from "../../offer/index.js";

const MAX_BYTES = 15 * 1024 * 1024;
interface Item { id: number; name: string; size: number; state: "busy" | "ok" | "err"; text: string }
export const sizeText = (bytes: number): string => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

const toBase64 = (file: File) => new Promise<string>((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).split(",")[1] || "");
  r.onerror = () => reject(r.error);
  r.readAsDataURL(file);
});

export function VermieterUpload() {
  const { dealId = "" } = useParams();
  const [items, setItems] = useState<Item[]>([]);
  const [live, setLive] = useState("");
  const next = useRef(0), photo = useRef<HTMLInputElement>(null), pick = useRef<HTMLInputElement>(null);
  const patch = (id: number, change: Partial<Item>) => setItems((list) => list.map((i) => (i.id === id ? { ...i, ...change } : i)));
  const say = (title: string, hint: string) => setLive(`${title} ${hint}`);

  async function send(file: File) {
    if (!/^\d+$/.test(dealId)) return say("Auftrag ID fehlt", "Bitte zuerst eine Auftrag ID eintragen und erneut wählen.");
    if (file.size > MAX_BYTES) return say("Datei zu groß", "Maximal 15 MB. Bitte erneut wählen.");
    const id = ++next.current, name = file.name || "vermieter.jpg";
    setItems((list) => [...list, { id, name, size: file.size, state: "busy", text: "Wird hochgeladen …" }]);
    say("Wird hochgeladen …", name);
    try {
      const resp = await fetch(`/api/bitrix/deal/${dealId}/upload/vermieter`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ filename: name, base64: await toBase64(file) }) });
      const data = (await resp.json().catch(() => ({}))) as { error?: unknown; kept?: boolean };
      if (!resp.ok) throw new Error(String(data.error || resp.status));
      const hint = data.kept === false ? " (Hinweis: Feld enthält nur die neueste Datei, frühere siehe Timeline)" : "";
      patch(id, { state: "ok", text: `In Bitrix24 hochgeladen${hint}` });
      say("✓ In Bitrix24 hochgeladen", name + hint);
      useOfferStore.getState().patch("Kundendaten" as never, { vermieterGenehmigung: "Ja" } as never); // today: the confirmation means "liegt vor"
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      patch(id, { state: "err", text: `Upload fehlgeschlagen: ${msg}` });
      say("Upload fehlgeschlagen", `${msg} – tippen zum erneuten Versuch`);
    }
  }
  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) void send(file); };

  return (
    <div className="grid gap-2" data-testid="vermieter-upload">
      <div className="font-semibold">Bestätigung des Vermieters</div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => photo.current?.click()}><Camera aria-hidden />Foto aufnehmen</Button>
        <Button variant="outline" onClick={() => pick.current?.click()}><FileUp aria-hidden />Datei hochladen</Button>
        <input ref={photo} type="file" accept="image/*" capture="environment" hidden aria-label="Foto der Vermieter-Bestätigung" onChange={onChange} />
        <input ref={pick} type="file" accept="image/*,application/pdf,.pdf" hidden aria-label="Datei der Vermieter-Bestätigung" onChange={onChange} />
      </div>
      <p className="m-0 text-[0.9rem] text-muted-foreground">Bestätigung vom Vermieter für Umbauten – wird beim Auftrag in Bitrix24 abgelegt.</p>
      {items.length ? (
        <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
          {items.map((i) => (
            <li key={i.id} data-testid="vermieter-file" data-state={i.state} className={cn("flex min-h-11 items-center gap-2 rounded-lg border-2 px-3", i.state === "err" ? "border-destructive text-destructive" : "border-border")}>
              {i.state === "busy" ? <Loader2 aria-hidden className="size-4 animate-spin" /> : i.state === "ok" ? <Check aria-hidden className="size-4 text-primary" /> : <TriangleAlert aria-hidden className="size-4" />}
              <span className="max-w-[16rem] truncate" title={i.text}>{i.name}</span>
              <span className="text-muted-foreground tabular-nums">{sizeText(i.size)}</span>
              <button type="button" aria-label={`${i.name} aus der Liste entfernen`} title="Entfernt nur die Anzeige; eine hochgeladene Datei bleibt in Bitrix24" onClick={() => setItems((list) => list.filter((x) => x.id !== i.id))} className="grid size-11 cursor-pointer place-items-center rounded-lg border-0 bg-transparent text-foreground"><X aria-hidden className="size-4" /></button>
            </li>
          ))}
        </ul>
      ) : null}
      <span role="status" aria-live="polite" data-part="status" className="sr-only">{live}</span>
      {live && !items.length ? <p role="alert" data-part="error" className="m-0 font-semibold text-destructive">{live}</p> : null}
    </div>
  );
}
