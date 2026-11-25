// „Versionen“: the saved versions of the open offer's draft and „Wiederherstellen“ — the rules.
// The screen is Versions.tsx; the actions are useVersions.ts.
//
// Today (v2 add-on over today's UI, v2/apps/server/src/modules/web/addons/deal-draft.js
// openVersions / restoreVersion; recorded in apps/web/test/fixtures/versionen.json,
// v2/scripts/capture-versionen.cjs):
//  - The button „Versionen“ sits beside the save state while an offer is open. It opens a centred
//    dialog „Gespeicherte Versionen – Auftrag <deal>“ (a draft without deal number: „… –
//    vorläufiger Entwurf (noch ohne Deal-Nummer)“) with the line „Jede Änderung wird automatisch
//    gespeichert. Mit „Wiederherstellen“ holen Sie einen früheren Stand zurück – nichts geht dabei
//    verloren.“ and „Schließen“. Opening asks GET …/draft/revisions and GET …/draft.
//  - The list: every saved version of the deal's draft (of the variant the server opened last —
//    today's UI never names a variant), newest first, one row each:
//    „Version <n> · <TT.MM.JJJJ, hh:mm> · <initials of who saved it> · <note>“ — without a note
//    „· Geändert: <changed parts>“ (German names for the known parts, the field name otherwise),
//    nothing when no part is known. The version the draft stands at ends with „ (aktuell)“ and has
//    no button; every other row has „Wiederherstellen“.
//  - No version yet: „Noch keine gespeicherte Version.“ The list cannot be loaded: „Keine
//    Verbindung – die Versionen auf dem Server sind gerade nicht erreichbar.“
//  - „Wiederherstellen“ asks nothing: POST …/draft/restore {revision, baseRevision: the revision
//    this device knows}. The server writes the old content as a NEW version (kind "restore", note
//    „Version <n> wiederhergestellt“); history is never rewritten, the stored offers and send
//    records are not touched. Then the draft is loaded again into the form, the dialog closes and
//    the save state says „Stand vom <date> geladen“.
//  - Unsaved input at that moment (typed less than 2.5 s before) is NOT saved first: the restored
//    state replaces it (recorded: „unsaved input, then restore at once“). It survives only in the
//    device history („Auf diesem Gerät (letzte Stände)“, today's IndexedDB copy).
//  - Refused (the draft moved on, 409) or failed: the dialog stays, the save state says
//    „Wiederherstellen hat nicht geklappt – bitte erneut versuchen.“; nothing changes.
//  - Changed elsewhere (a save was refused): above the list „Meinen Stand von diesem Gerät als neue
//    Version speichern“ (saves the open state on top of the newest version) and „Neuesten Stand
//    laden (Version <n>, <date>)“ (the newest version replaces the open state).
//  - A sent offer has no rule of its own here: restoring only writes the draft; a changed sent
//    offer is refused at the next send („Neue Version erstellen“, versand/version.ts, ADR 023).
//
// The React app (UX-CHANGES U-062): the same list, texts and server calls, in a panel of the
// header (also from the step drawer), named for the open variant (`?variant=`). Different on purpose:
//  - „Wiederherstellen“ asks first („Version <n> wiederherstellen?“), and unsaved input is saved
//    as its own version before the restore — nothing typed is lost;
//  - the device history is not listed (the React app keeps one device copy per offer, not a
//    history; it is uploaded by itself);
//  - messages are toasts / lines in the panel instead of the save-state pill;
//  - U-074: a version that would bring back an OLDER offer number that was already sent is refused
//    (server 409 RESTORE_SENT_NUMBER, the server's text says where the sent offer is); the refusal
//    has a button that opens that sent offer from the Hauptmenü (`/?offer=<number>`, the same path
//    as „Öffnen“ with the number).
import { TEMP_DRAFT_KEY_RE, type DealDraftRevision } from "@oc/api-contract";

/** German names of the parts of an offer (today's SECTION_DE); any other part keeps its field name */
export const SECTION_DE: Readonly<Record<string, string>> = {
  Kundendaten: "Kundendaten", Arbeitszeit: "Arbeitszeit", duschwanne: "Duschwanne", wandverkleidung: "Wandverkleidung",
  duschabtrennung: "Duschabtrennung", optional: "Optionales", rabatt: "Rabatt", bwt: "Badewannentür", hl: "Handlauf",
  bl: "Badelift", ah: "Alltagshilfe", Zusammenfassung: "Zusammenfassung", Arbeiten: "Arbeiten",
};

/** today's date and time: „24.11.2026, 16:40“ */
export const when = (d: string | Date | number): string =>
  new Date(d).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** who saved a version, as initials only (org rule): a.b@… → AB, ab@… → AB */
export function initials(email: string | null | undefined): string {
  const local = String(email ?? "").split("@")[0] ?? "";
  const parts = local.split(/[._-]+/).filter(Boolean);
  return parts.length >= 2 ? (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase() : local.slice(0, 2).toUpperCase();
}

/** „Version 3 · 24.11.2026, 16:40 · CA · Geändert: Arbeitszeit, Kundendaten“ (+ „ (aktuell)“) */
export function rowLabel(r: Pick<DealDraftRevision, "revision" | "at" | "by" | "note" | "sections">, current: number | null): string {
  const changed = (r.sections ?? []).map((s) => SECTION_DE[s] ?? s).join(", ");
  return `Version ${r.revision} · ${when(r.at)} · ${initials(r.by)}${r.note ? ` · ${r.note}` : changed ? ` · Geändert: ${changed}` : ""}${r.revision === current ? " (aktuell)" : ""}`;
}

/** every version but the one the draft stands at can be restored */
export const canRestore = (r: Pick<DealDraftRevision, "revision">, current: number | null): boolean => r.revision !== current;

export const heading = (dealId: string): string =>
  `Gespeicherte Versionen – ${TEMP_DRAFT_KEY_RE.test(dealId) ? "vorläufiger Entwurf (noch ohne Deal-Nummer)" : `Auftrag ${dealId}`}`;

export const TEXT = {
  button: "Versionen",
  label: "Gespeicherte Versionen",
  lead: "Jede Änderung wird automatisch gespeichert. Mit „Wiederherstellen“ holen Sie einen früheren Stand zurück – nichts geht dabei verloren.",
  loading: "Lädt …",
  none: "Noch keine gespeicherte Version.",
  offline: "Keine Verbindung – die Versionen auf dem Server sind gerade nicht erreichbar.",
  restore: "Wiederherstellen",
  restoring: "Wird wiederhergestellt …",
  close: "Schließen",
  cancel: "Abbrechen",
  keepMine: "Meinen Stand von diesem Gerät als neue Version speichern",
  loadNewest: (revision: number, at: string | Date) => `Neuesten Stand laden (Version ${revision}, ${when(at)})`,
  askTitle: (revision: number) => `Version ${revision} wiederherstellen?`,
  askText: (r: Pick<DealDraftRevision, "revision" | "at" | "by">) =>
    `Das Angebot bekommt wieder den Stand von Version ${r.revision} (${when(r.at)}, ${initials(r.by)}). Daraus wird eine neue Version – alle bisherigen Versionen bleiben erhalten.`,
  askUnsaved: "Ihre noch nicht gespeicherten Änderungen werden vorher als eigene Version gespeichert.",
  askSent: (number: string) => `Das versendete Angebot ${number} bleibt unverändert gespeichert. Ändert sich das Angebot, braucht es vor dem nächsten Versand eine neue Version.`,
  restored: (revision: number) => `Version ${revision} wiederhergestellt`,
  restoredAt: (at: string | Date) => `Stand vom ${when(at)} geladen`,
  failed: "Wiederherstellen hat nicht geklappt – bitte erneut versuchen.",
  notSaved: (why: string) => `Es wurde nichts wiederhergestellt, weil Ihr jetziger Stand nicht gespeichert werden konnte. ${why}`.trim(),
  conflict: "Dieses Angebot wurde inzwischen an anderer Stelle geändert. Wählen Sie unten, welcher Stand gelten soll.",
  loadFailed: "Der wiederhergestellte Stand konnte nicht geladen werden. Bitte laden Sie die Seite neu.",
  keptMine: "Ihr Stand ist als neue Version gespeichert.",
  loadedNewest: "Der neueste Stand ist geladen.",
  // U-074 (the server sends the same text; this one only when an answer carries none)
  sentRefused: (nr: string) => `Diese Version kann nicht wiederhergestellt werden: Sie trägt die Angebotsnummer ${nr}, und dieses Angebot wurde bereits versendet. Das versendete Angebot bleibt unverändert gespeichert. Sie öffnen es im Hauptmenü unter „Öffnen“ mit der Nummer ${nr} – dort wird es als versendet angezeigt, und „Neue Version“ erstellt eine änderbare Kopie.`,
  openSent: (nr: string) => `Angebot ${nr} öffnen`,
  back: "Zurück",
} as const;

/** the Hauptmenü address that opens a stored offer by its number (as „Öffnen“ with an ANG number) */
export const offerOpenPath = (nr: string): string => `/?offer=${encodeURIComponent(nr)}`;

/** the offer number when the offer itself is marked as sent (`zusammenfassung.versand`), else "" — for the line in the question only */
export function sentNumberOf(offer: unknown): string {
  const o = (offer && typeof offer === "object" ? offer : {}) as Record<string, unknown>;
  const zf = (o.zusammenfassung && typeof o.zusammenfassung === "object" ? o.zusammenfassung : {}) as Record<string, unknown>;
  const v = (zf.versand && typeof zf.versand === "object" ? zf.versand : {}) as Record<string, unknown>;
  const number = String(o.offerNumber ?? "").trim();
  return number && v.art && v.versendetAm ? number : "";
}
