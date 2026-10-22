/**
 * Checkliste — the last of the three Zusammenfassung blocks (docs/zf-plan.md).
 *
 * Modelled on the Montage-Checkliste in bau-formular: numbered groups,
 * required items marked with *, and items the app already knows are ticked
 * automatically and locked. Here those are the Angebotscheck (Task 1) and
 * "Angebot versendet" (Task 2); Skizze and Fotos are ticked by hand and
 * persisted on the payload.
 *
 * Required items that are still open turn red, and the sidebar dot of the
 * Checkliste step stays red until every one of them is done.
 */

import { formatVersand } from "./angebotsversand.js";

const AMPEL = { gruen: "🟢", gelb: "🟡", rot: "🔴" };
const AMPEL_TEXT = { gruen: "In Ordnung", gelb: "Bitte prüfen", rot: "Fehlt" };

/** The hand-ticked part. Keys mirror payload.zusammenfassung.checkliste. */
export const BOXES = {
  skizzeErstellt: "zfChk_skizze",
  fotosErstellt: "zfChk_fotos",
};

export const emptyCheckliste = () => ({
  skizzeErstellt: false,
  fotosErstellt: false,
});

export function formatCheckStatus(check) {
  const status = check?.status;
  return AMPEL[status]
    ? `${AMPEL[status]} ${AMPEL_TEXT[status]}`
    : "⚪️ Noch nicht geprüft";
}

/** The check counts as done unless it still reports something missing (rot).
 *  Yellow rows are hints, not gaps. */
export const checkDone = (check) =>
  !!check?.status && check.status !== "rot";

export const versendetDone = (versand) =>
  !!(versand?.art && versand?.versendetAm);

/** Every required row: auto ones are derived, the rest come from BOXES. */
export const REQUIRED = ["zfChk_check", "zfChk_versendet", ...Object.values(BOXES)];

export function formatVersendet(versand) {
  return versand?.art && versand?.versendetAm
    ? `Ja — ${formatVersand(versand).replace(/^✅\s*/, "")}`
    : "Nein";
}

/* ------------------------------------------------------------------- state */

/** Reads the hand-ticked boxes out of the DOM. */
export function readCheckliste(doc = document) {
  const out = emptyCheckliste();
  for (const [key, id] of Object.entries(BOXES)) {
    out[key] = !!doc.getElementById(id)?.checked;
  }
  return out;
}

/** Called by RestoreManager when a saved offer/draft is reopened. */
export function setCheckliste(checkliste, doc = document) {
  for (const [key, id] of Object.entries(BOXES)) {
    const el = doc.getElementById(id);
    if (el) el.checked = !!checkliste?.[key];
  }
  window.__zfCheckliste = { ...emptyCheckliste(), ...readCheckliste(doc) };
  paintCheckliste(doc);
}

/**
 * Ticks the auto rows, marks open required rows red and reports progress —
 * in the summary line and on the sidebar dot.
 */
export function paintCheckliste(doc = document) {
  const set = (id, checked) => {
    const el = doc.getElementById(id);
    if (el) el.checked = checked;
  };
  set("zfChk_check", checkDone(window.__angebotscheck));
  set("zfChk_versendet", versendetDone(window.__zfVersand));

  const status = doc.getElementById("zfChkCheckStatus");
  if (status) status.textContent = formatCheckStatus(window.__angebotscheck);
  const versendet = doc.getElementById("zfChkVersendet");
  if (versendet) versendet.textContent = formatVersendet(window.__zfVersand);

  let done = 0;
  for (const id of REQUIRED) {
    const el = doc.getElementById(id);
    const ok = !!el?.checked;
    if (ok) done += 1;
    el?.closest(".zf-chk-item")?.classList.toggle("is-missing", !ok);
  }
  const complete = done === REQUIRED.length;

  const summary = doc.getElementById("zfChkSummary");
  if (summary) {
    summary.textContent = complete
      ? "✅ Alle Pflichtpunkte erledigt."
      : `${done} von ${REQUIRED.length} Pflichtpunkten erledigt.`;
    summary.classList.toggle("is-open", !complete);
    summary.classList.toggle("is-done", complete);
  }
  // On <html>, not on the link: the sidebar is rebuilt on every navigation.
  doc.documentElement.toggleAttribute("data-zf-checkliste-open", !complete);
  return { done, total: REQUIRED.length, complete };
}

function paint() {
  // Own wizard step, and only bu has it in its flow — no offer-type check here.
  if (!document.getElementById("page-Checkliste")) return;
  window.__zfCheckliste = readCheckliste();
  paintCheckliste();
}

if (typeof document !== "undefined") {
  window.setZfCheckliste = setCheckliste;
  window.addEventListener("angebotscheck:updated", paint);
  window.addEventListener("versand:updated", paint);
  window.addEventListener("hashchange", paint);
  document.addEventListener("DOMContentLoaded", () => {
    paint();
    for (const id of Object.values(BOXES)) {
      document
        .getElementById(id)
        ?.addEventListener("change", paint);
    }
  });
}
