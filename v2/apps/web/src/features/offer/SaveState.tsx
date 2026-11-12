// How saving stands. Its own small file: the header (start script) shows it, and must not pull
// the whole offer frame with it.
import { usePrefs } from "../../shared/lib/prefs.js";
import { Button, cn } from "../../shared/ui/index.js";
import { flushDraft, useSaveStatus } from "./model/draft.js";
import { useOfferStore } from "./model/store.js";

const hhmm = (d: Date) => d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });

/** How saving stands, for the header: nothing on the Hauptmenü; with automatic saving switched
 *  off, the "Speichern" button. (The offer frame also shows a failed save as a toast.) */
export function SaveState() {
  const status = useSaveStatus();
  const open = useOfferStore((s) => s.offer !== null);
  const dirty = useOfferStore((s) => s.version !== s.savedVersion);
  const auto = usePrefs((p) => p.autosave);
  if (!open) return null;
  const text =
    status.state === "conflict" ? "Nicht gespeichert – an anderer Stelle geändert"
    : status.state === "failed" ? "Nicht gespeichert"
    : status.state === "saving" ? "Speichert …"
    : dirty ? (auto ? "Änderungen werden gleich gespeichert" : "Nicht gespeicherte Änderungen")
    : status.state === "saved" ? `${auto ? "Automatisch gespeichert" : "Gespeichert"} · ${hhmm(status.at)}` : "";
  const bad = status.state === "conflict" || status.state === "failed";
  return (
    <div className="flex min-w-0 items-center gap-2">
      <p role={bad ? "alert" : "status"} className={cn("m-0 truncate text-[0.9rem]", bad ? "font-semibold text-destructive" : "text-muted-foreground")}>{text}</p>
      {!auto && dirty ? <Button variant="secondary" className="min-h-10 px-4" onClick={() => { void flushDraft(); }}>Speichern</Button> : null}
    </div>
  );
}
