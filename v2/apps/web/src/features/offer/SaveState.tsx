// How saving stands. Its own small file: the header (start script) shows it, and must not pull
// the whole offer frame with it.
import { CircleAlert, CircleCheck, History, LoaderCircle } from "lucide-react";
import { usePrefs } from "../../shared/lib/prefs.js";
import { Button, cn } from "../../shared/ui/index.js";
import { flushDraft, useSaveStatus } from "./model/draft.js";
import { useOfferStore } from "./model/store.js";
import { CLASSIC_HOME } from "../../shared/lib/classic-ui.js";

const hhmm = (d: Date) => d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });

/** How saving stands, for the header: nothing on the Hauptmenü; with automatic saving switched
 *  off, the "Speichern" button. (The offer frame also shows a failed save as a toast.) */
export function SaveState() {
  const status = useSaveStatus();
  const open = useOfferStore((s) => s.offer !== null);
  const dirty = useOfferStore((s) => s.version !== s.savedVersion);
  const auto = usePrefs((p) => p.autosave);
  // short label in the pill, the full sentence as title / aria-label (the title of the offer in the header keeps its room)
  const [text, full] =
    !open ? ["Alles gespeichert", "Alles gespeichert"]
    : status.state === "conflict" ? ["Nicht gespeichert", "Nicht gespeichert – an anderer Stelle geändert"]
    : status.state === "failed" ? ["Nicht gespeichert", "Nicht gespeichert"]
    : status.state === "saving" ? ["Speichert …", "Speichert …"]
    : dirty ? (auto ? ["Speichert …", "Änderungen werden gleich gespeichert"] : ["Ungespeichert", "Nicht gespeicherte Änderungen"])
    : status.state === "saved" ? ["Gespeichert", `${auto ? "Automatisch gespeichert" : "Gespeichert"} · ${hhmm(status.at)}`] : ["Alles gespeichert", "Alles gespeichert"]; // nothing changed since opening
  const bad = open && (status.state === "conflict" || status.state === "failed");
  const Icon = bad ? CircleAlert : status.state === "saving" ? LoaderCircle : CircleCheck;
  return (
    <div className="flex min-w-0 shrink items-center gap-2">
      {text ? (
        <p title={full} aria-label={full} className={cn("m-0 flex min-h-11 min-w-0 shrink items-center gap-1.5 rounded-full border px-3 text-[0.9rem]", bad ? "border-destructive font-semibold text-destructive" : "border-border text-muted-foreground")}>
          <Icon aria-hidden className={cn("size-4 shrink-0", !bad && status.state !== "saving" && "text-green-600")} /><span role={bad ? "alert" : "status"} className="hidden truncate min-[900px]:inline">{text}</span>
        </p>
      ) : null}
      {!auto && dirty ? <Button variant="secondary" className="min-h-11 px-4" onClick={() => { void flushDraft(); }}>Speichern</Button> : null}
      {/* the list of saved versions is still in today's UI; below 480 px the user menu's „Zur bisherigen Ansicht“ (same address) stands in for it, so the avatar never covers it (U-059) */}
      {open ? <a href={CLASSIC_HOME} aria-label="Versionen" title="Versionen" className="flex min-h-11 min-w-11 shrink-0 max-[479px]:hidden items-center justify-center gap-1.5 rounded-full border border-border bg-card px-3 text-[0.9rem] text-foreground no-underline hover:bg-muted"><History aria-hidden className="size-4" /><span className="hidden min-[900px]:inline">Versionen</span></a> : null}
    </div>
  );
}
