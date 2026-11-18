// "Neue Version erstellen" (audit F6, UX-CHANGES U-025) — the one explicit way to change a sent
// offer — and what is offered where a send was stopped. The rules are version.ts.
import { CopyPlus, RefreshCw } from "lucide-react";
import { useState } from "react";
import { Button } from "../../../shared/ui/index.js";
import { toast } from "../../../shared/ui/toaster.js";
import { reloadDraft, useOfferStore } from "../../offer/index.js";
import { usePeople } from "./people.js";
import { TEXT, newVersion, setStop, stopKey, type Place, type Stop } from "./version.js";

export function NewVersionButton({ place }: { place: string }) {
  const people = usePeople();
  const [busy, setBusy] = useState(false);
  const tap = async () => {
    if (busy) return;
    setBusy(true);
    try { await newVersion(people.data); }
    catch (err) { toast.error("Neue Version fehlgeschlagen", { description: err instanceof Error ? err.message : String(err) }); }
    finally { setBusy(false); }
  };
  return (
    <Button variant="outline" data-action="new-version" data-place={place} disabled={busy} onClick={() => void tap()}>
      <CopyPlus aria-hidden className="size-4" /><span data-part="label">{busy ? TEXT.busy : TEXT.action}</span>
    </Button>
  );
}

/** the newer draft of the deal replaces what is open (a save was refused: changed elsewhere) */
function ReloadButton({ place }: { place: Place }) {
  const [busy, setBusy] = useState(false);
  const tap = async () => {
    if (busy) return;
    setBusy(true);
    const ok = await reloadDraft(); // the scratch of the page goes with the old state; the shell's standing notice ("Seite neu laden") is answered
    setBusy(false);
    if (ok) { toast.dismiss("save"); toast.success(TEXT.reloaded); } else { toast.error(TEXT.reloadFailed); setStop(place, "conflict"); }
  };
  return (
    <Button variant="outline" data-action="reload-draft" data-place={place} disabled={busy} onClick={() => void tap()}>
      <RefreshCw aria-hidden className="size-4" /><span data-part="label">{busy ? TEXT.reloading : TEXT.reload}</span>
    </Button>
  );
}

/** under a message that stopped a send: what the user can do now */
export function StopActions({ place }: { place: Place }) {
  const stop = useOfferStore((s) => s.scratch[stopKey(place)]) as Stop | null | undefined;
  if (!stop) return null;
  return <div data-testid={`zf-stop-${place}`} data-stop={stop}>{stop === "conflict" ? <ReloadButton place={place} /> : <NewVersionButton place={place} />}</div>;
}
