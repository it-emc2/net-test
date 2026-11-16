// How saving stands. Its own small file: the header (start script) shows it, and must not pull
// the whole offer frame with it.
import { CircleAlert, CircleCheck, History, LoaderCircle } from "lucide-react";
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
  const text = !open ? "Alles gespeichert" : // nothing open: nothing waiting
    status.state === "conflict" ? "Nicht gespeichert – an anderer Stelle geändert"
    : status.state === "failed" ? "Nicht gespeichert"
    : status.state === "saving" ? "Speichert …"
    : dirty ? (auto ? "Änderungen werden gleich gespeichert" : "Nicht gespeicherte Änderungen")
    : status.state === "saved" ? `${auto ? "Automatisch gespeichert" : "Gespeichert"} · ${hhmm(status.at)}` : "";
  const bad = open && (status.state === "conflict" || status.state === "failed");
  const Icon = bad ? CircleAlert : status.state === "saving" ? LoaderCircle : CircleCheck;
  return (
    <div className="flex min-w-0 items-center gap-2">
      {text ? (
        <p className={cn("m-0 flex min-h-11 min-w-0 items-center gap-1.5 rounded-full border px-3 text-[0.9rem]", bad ? "border-destructive font-semibold text-destructive" : "border-border text-muted-foreground")}>
          <Icon aria-hidden className={cn("size-4 shrink-0", !bad && status.state !== "saving" && "text-green-600")} /><span role={bad ? "alert" : "status"} className="truncate">{text}</span>
        </p>
      ) : null}
      {!auto && dirty ? <Button variant="secondary" className="min-h-11 px-4" onClick={() => { void flushDraft(); }}>Speichern</Button> : null}
      {/* the list of saved versions is still in today's UI */}
      {open ? <a href="/" className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-[0.9rem] text-foreground no-underline hover:bg-muted"><History aria-hidden className="size-4" />Versionen</a> : null}
    </div>
  );
}
