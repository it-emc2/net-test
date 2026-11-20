// "Neue Version erstellen" and the stops before a send (audit 2026-11-17, F4–F7; UX-CHANGES U-025).
//
// A sent offer is immutable (ADR 023, decision C): its number, the stored offer and the send
// record stay as they went out. To change it the user makes a NEW VERSION — what today's UI does
// with "Neue Version erstellen" (script.js startNewOfferVersion, SentOfferBar.js; the server
// hands today's draft a fresh number):
//  - the open offer gets a new number (registered, number.ts); subject and text of the mail follow
//  - it is the signed-in user's document now: contact person and date are set anew (as today)
//  - it counts as not sent: `zusammenfassung.versand` is emptied, the messages of the last send,
//    the lock of the letter button and a chosen edited Word file are dropped
//  - the draft of the deal is saved at once
//  - nothing is written to the sent offer or its send record; the Versandverlauf is per deal and
//    keeps showing them
// A number is "sent" when a send under it reached the customer (mail, post, signing — filing in
// Bitrix alone does not count) or the offer itself says so (`zusammenfassung.versand`).
// A download never renumbers a sent number (F5): renumbering it is this action only.
import { newOfferPatch } from "@oc/domain";
import { todayIso } from "../../../shared/lib/format.js";
import { toast } from "../../../shared/ui/toaster.js";
import { flushDraft, useOfferStore, type SaveStatus } from "../../offer/index.js";
import { isSent } from "../checkliste/rules.js";
import { giveNumber } from "./number.js";
import type { People } from "./people.js";
import { chooseContact } from "./rules.js";

type Fields = Record<string, unknown>;
const obj = (v: unknown): Fields => (v && typeof v === "object" && !Array.isArray(v) ? (v as Fields) : {});
const str = (v: unknown) => String(v ?? "").trim();
const st = () => useOfferStore.getState();

/** the last send under this number that reached the customer */
export const sentSend = (sends: readonly Fields[] | null | undefined, number: string): Fields | null =>
  (number ? (sends ?? []).find((s) => str(s.offerNumber) === number && s.status === "done" && s.channel !== "bitrix") ?? null : null);
/** does this number count as sent? `sends`: the deal's sends, undefined while they are not known */
export const isSentNumber = (offer: Fields, sends: readonly Fields[] | null | undefined): boolean =>
  !!str(offer.offerNumber) && (isSent(obj(offer.zusammenfassung).versand) || !!sentSend(sends, str(offer.offerNumber)));
/** May a download give the offer a new number (today's behaviour)? Not a sent one — and not one
 *  whose sends are not known (better the same number twice than a sent offer unlocked). */
export const mayRenumber = (offer: Fields, sends: readonly Fields[] | null | undefined): boolean =>
  !str(offer.offerNumber) || (sends != null && !isSentNumber(offer, sends));
/** the last mail under this number carried a hand-edited Word file (the send keeps that file) */
export const sentHandEdited = (sends: readonly Fields[] | null | undefined, number: string): boolean => {
  const s = sentSend(sends, number);
  return !!s && s.channel === "email" && (Array.isArray(s.files) ? s.files : []).some((f) => obj(f).role === "editedDocx");
};

export const TEXT = {
  action: "Neue Version erstellen",
  busy: "Wird erstellt …",
  sentHint: "Ein versendetes Angebot bleibt unverändert. Für Änderungen erstellen Sie eine neue Version – sie bekommt eine neue Angebotsnummer.",
  handEditedSent: "Dieses Angebot wurde mit einer von Hand bearbeiteten Word-Datei versendet. Es kann nicht aus den Formulardaten unterschrieben oder erneut versendet werden – der Kunde hätte sonst zwei verschiedene Angebote. Bitte erstellen Sie eine neue Version („Neue Version erstellen“).",
  changedPdf: "Dieses Angebot wurde bereits versendet und seither geändert. Unter der versendeten Nummer wird kein neues PDF erstellt. Bitte erstellen Sie eine neue Version („Neue Version erstellen“).",
  reload: "Neueren Stand laden",
  reloading: "Wird geladen …",
  reloaded: "Der neuere Stand ist geladen. Bitte prüfen Sie das Angebot, bevor Sie es versenden.",
  reloadFailed: "Der neuere Stand konnte nicht geladen werden. Bitte prüfen Sie die Verbindung und versuchen Sie es erneut.",
} as const;
export const created = (number: string, was: string): string => (was ? `${number} – das versendete Angebot ${was} bleibt unverändert gespeichert.` : number);
export const notSavedYet = "Die neue Version ist auf diesem Gerät erstellt, konnte aber noch nicht im Deal gespeichert werden.";

// ---- what stops a send, with what the user can do about it ----
/** "new-version": the offer was sent and may not go out changed; "conflict": the draft was changed elsewhere */
export type Stop = "new-version" | "conflict";
export type Place = "mail" | "post" | "sign-mail" | "sign-post" | "docs";
const PLACES: readonly Place[] = ["mail", "post", "sign-mail", "sign-post", "docs"];
export const stopKey = (place: Place) => `stop-${place}`;
export const setStop = (place: Place, stop: Stop | null) => st().remember(stopKey(place), stop);
/** an error that is answered with "Neue Version erstellen" */
export class NeedsNewVersion extends Error {}
/** the server's refusals of a sent offer: null for any other code */
export function refusal(code: string, changed: string): NeedsNewVersion | null {
  if (code === "OFFER_CHANGED") return new NeedsNewVersion(changed);
  if (code === "HAND_EDITED_SENT") return new NeedsNewVersion(TEXT.handEditedSent);
  return null;
}

/** Before mail, letter and signing (F7): the draft of the deal must hold what goes out. A save
 *  that was refused or failed stops the send — else this device's state goes to the customer
 *  while the deal keeps another one. null: saved (or nothing to save). */
export function saveProblem(s: SaveStatus, nothing: string): { text: string; stop: Stop | null } | null {
  if (s.state === "conflict") return { stop: "conflict", text: `${nothing} Dieses Angebot wurde inzwischen an anderer Stelle geändert (zum Beispiel auf einem anderen Gerät) – Ihr Stand hier konnte nicht gespeichert werden. Laden Sie den neueren Stand und prüfen Sie ihn. Ihre Änderungen von diesem Gerät seit dem letzten Speichern gehen dabei verloren.` };
  if (s.state === "failed") return { stop: null, text: `${nothing} Das Angebot konnte nicht gespeichert werden${s.message ? ` (${s.message})` : ""}. Bitte prüfen Sie die Verbindung und versuchen Sie es erneut.` };
  return null;
}
export const NOTHING = { mail: "Es wurde nichts gesendet.", post: "Es wurde kein Brief gesendet.", sign: "Die Unterschrift wurde nicht gestartet." } as const;
export async function saveBeforeSend(nothing: string) { return saveProblem(await flushDraft(), nothing); }

/** The open offer becomes a new version. Resolves with its number. */
export async function newVersion(people: People | null | undefined): Promise<string> {
  const before = (st().offer ?? {}) as Fields, was = str(before.offerNumber);
  const users = people?.users ?? [], mine = users.some((u) => u.email === people?.me) ? people!.me! : users[0]?.email;
  // the same reset as a new variant on the server (@oc/domain newOfferPatch, ADR 027 A)
  st().patchAll(newOfferPatch(todayIso(), mine ? chooseContact(users, mine) : {}) as never);
  const number = await giveNumber();
  for (const key of ["sendStatus", "postStatus", "signStatus-mail", "signStatus-post", "editedDocx", "handEditedNumber", ...PLACES.map(stopKey)]) st().remember(key, null);
  st().remember("postSent", false);
  st().remember("sendsStamp", Date.now()); // the history is asked again: its lines now name the old number
  const saved = await flushDraft();
  if (saved.state === "conflict" || saved.state === "failed") toast.warning("Neue Version erstellt", { description: `${created(number, was)} ${notSavedYet}` });
  else toast.success("Neue Version erstellt", { description: created(number, was) });
  return number;
}
