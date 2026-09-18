/**
 * Angebotsversand — records HOW and WHEN the offer went out.
 *
 * The sending itself already exists (the Mail/Post tabs further down the
 * Zusammenfassung page). This module only keeps the resulting state, shows it
 * as one line, and persists it on the payload so a reopened offer still knows
 * it was sent. Task 3 (Checkliste) reads it for "Angebot versendet? Ja/Nein".
 *
 * Fed by showSentDialog() in EmailManager.js, which both the mail and the post
 * send call on success.
 */

export const VERSAND_LABEL = { mail: "E-Mail", post: "Post" };

/** Empty state — never null, so callers don't have to guard. */
export const emptyVersand = () => ({ art: null, versendetAm: null });

export function formatVersand(versand) {
  const art = VERSAND_LABEL[versand?.art];
  if (!art || !versand?.versendetAm) return "Noch nicht versendet.";
  const at = new Date(versand.versendetAm);
  const when = Number.isNaN(at.getTime())
    ? ""
    : ` am ${at.toLocaleDateString("de-DE")} um ${at.toLocaleTimeString("de-DE", {
        hour: "2-digit",
        minute: "2-digit",
      })} Uhr`;
  return `✅ Versendet per ${art}${when}.`;
}

/* ------------------------------------------------------------------- state */

function state() {
  if (!window.__zfVersand) window.__zfVersand = emptyVersand();
  return window.__zfVersand;
}

function publish() {
  const versand = state();
  const line = document.getElementById("zfVersandStatus");
  if (line) line.textContent = formatVersand(versand);
  window.dispatchEvent(
    new CustomEvent("versand:updated", { detail: { ...versand } }),
  );
}

/** Called from showSentDialog() on a successful mail or post send. */
export function markVersendet(art, when = new Date()) {
  if (!VERSAND_LABEL[art]) return;
  window.__zfVersand = { art, versendetAm: new Date(when).toISOString() };
  publish();
}

/** Called by RestoreManager when a saved offer/draft is reopened. */
export function setVersand(versand) {
  window.__zfVersand = VERSAND_LABEL[versand?.art]
    ? { art: versand.art, versendetAm: versand.versendetAm || null }
    : emptyVersand();
  publish();
}

function paint() {
  const section = document.getElementById("zfVersand");
  if (!section) return;
  // This page is shared by every offer type (it carries Dokumentenstudio and
  // the Mail/Post tabs) — only the status line is bu-only for now.
  const isBu =
    String(window.getCurrentOfferType?.() || "").toLowerCase() === "bu";
  const card = document.getElementById("zfVersandStatus")?.closest(".bitrix-card");
  if (card) card.hidden = !isBu;
  publish();
}

if (typeof document !== "undefined") {
  window.markAngebotVersendet = markVersendet;
  window.setZfVersand = setVersand;
  window.addEventListener("hashchange", paint);
  document.addEventListener("DOMContentLoaded", paint);
}
