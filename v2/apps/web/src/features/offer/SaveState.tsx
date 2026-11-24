// How saving stands. Its own small file: the header (start script) shows it, and must not pull
// the whole offer frame with it.
import { CircleAlert, CircleCheck, History, LoaderCircle } from "lucide-react";
import { lazy, Suspense } from "react";
import { usePrefs } from "../../shared/lib/prefs.js";
import { Button, cn } from "../../shared/ui/index.js";
import { flushDraft, useSaveStatus } from "./model/draft.js";
import { useOfferStore } from "./model/store.js";
import { openVersionsPanel, useVersionsPanel } from "./model/versions-panel.js";

// the panel is loaded on first use (the header must stay light)
const VersionsPanel = lazy(() => import("./Versions.js"));

const hhmm = (d: Date) => d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });

/** How saving stands, for the header: nothing on the Hauptmenü; with automatic saving switched
 *  off, the "Speichern" button. (The offer frame also shows a failed save as a toast.) */
export function SaveState() {
  const status = useSaveStatus();
  const open = useOfferStore((s) => s.offer !== null);
  const dirty = useOfferStore((s) => s.version !== s.savedVersion);
  const auto = usePrefs((p) => p.autosave);
  const versions = useVersionsPanel((p) => p.open);
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
      {/* „Versionen“ (U-062); below 480 px it is in the step drawer only, so the avatar never covers it (U-059) */}
      {open ? <button type="button" onClick={openVersionsPanel} aria-haspopup="dialog" aria-expanded={versions} aria-label="Versionen" title="Versionen" data-testid="versions-button" className="flex min-h-11 min-w-11 shrink-0 max-[479px]:hidden cursor-pointer items-center justify-center gap-1.5 rounded-full border border-border bg-card px-3 text-[0.9rem] text-foreground hover:bg-muted"><History aria-hidden className="size-4" /><span className="hidden min-[900px]:inline">Versionen</span></button> : null}
      {open && versions ? <Suspense fallback={null}><VersionsPanel /></Suspense> : null}
    </div>
  );
}
