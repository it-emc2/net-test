/**
 * Checkliste — the last of the three Zusammenfassung blocks (docs/zf-plan.md).
 *
 * Two of its rows are derived and read-only: the Angebotscheck status (Task 1)
 * and "Angebot versendet?" (Task 2). The remaining two are ticked by hand and
 * persisted on the payload.
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
}

function paintDerived() {
  const check = document.getElementById("zfChkCheckStatus");
  if (check) check.textContent = formatCheckStatus(window.__angebotscheck);
  const versendet = document.getElementById("zfChkVersendet");
  if (versendet) versendet.textContent = formatVersendet(window.__zfVersand);
}

function paint() {
  // Own wizard step, and only bu has it in its flow — no offer-type check here.
  if (!document.getElementById("page-Checkliste")) return;
  window.__zfCheckliste = readCheckliste();
  paintDerived();
}

if (typeof document !== "undefined") {
  window.setZfCheckliste = setCheckliste;
  window.addEventListener("angebotscheck:updated", paintDerived);
  window.addEventListener("versand:updated", paintDerived);
  window.addEventListener("hashchange", paint);
  document.addEventListener("DOMContentLoaded", () => {
    paint();
    for (const id of Object.values(BOXES)) {
      document
        .getElementById(id)
        ?.addEventListener("change", () => {
          window.__zfCheckliste = readCheckliste();
        });
    }
  });
}
