// raum3d-page.js — the "3D-Ansicht" step of the BU offer. Loads the magicplan plan of
// the offer's deal when the page is first shown, takes tray size and wall decor from
// the offer, and keeps the user's edits (position, rotation, hidden objects) for the
// payload (payload.raum3d; display only, not priced).
import { createViewer } from "./raum3d.js";

const page = document.getElementById("page-Raum3D");
if (page) {
  let saved = null; // edits of the opened offer (restore) or the last state
  let loadedFor = null; // "deal|planId" the view currently shows

  const dealId = () => String(document.getElementById("auftragId")?.value || "").trim();

  // Tray size from the Duschwanne page ("100 x 70 x 3 cm", or the W/L inputs), in metres.
  function offerTray() {
    const raw = document.getElementById("traySize")?.value || "";
    const m = raw.match(/(\d{2,3}(?:[.,]\d)?)\s*[x×]\s*(\d{2,3}(?:[.,]\d)?)/i);
    let a = m ? [m[1], m[2]] : [document.querySelector('input[name="tray_w_cm"]')?.value, document.querySelector('input[name="tray_l_cm"]')?.value];
    a = a.map((v) => Number(String(v || "").replace(",", ".")));
    if (!(a[0] > 30 && a[1] > 30)) return null;
    const [W, D] = a[0] >= a[1] ? a : [a[1], a[0]]; // long side first
    return { W: W / 100, D: D / 100 };
  }

  // Wall decor of the Wandverkleidung page: winwall panel photo or the VIGOUR colour tile.
  function offerDecor() {
    if (!document.querySelector('[name="wvEnabled"]')?.checked && !document.getElementById("wvEnabled")?.checked) return null;
    try {
      if (typeof window.isWvWinwall === "function" ? window.isWvWinwall() : document.getElementById("wvSupplier")?.value === "ww") {
        const code = typeof window.wwSelectedDecor === "function" ? window.wwSelectedDecor().code : null;
        if (code) return `./assets/winwall/panel/${code}.jpg`;
      }
    } catch {}
    return document.querySelector('input[name="wvColor"]:checked')?.closest("label")?.querySelector("img")?.getAttribute("src") || null;
  }

  const viewer = createViewer(page, {
    products: () => ({ tray: offerTray(), claddingImage: offerDecor() }),
    onChange: (state) => { saved = state; },
  });

  async function show() {
    const deal = dealId();
    const info = page.querySelector('[data-r3="info"]');
    if (!/^\d{3,8}$/.test(deal)) {
      info.innerHTML = `<span class="warn">Keine Deal-ID im Angebot (Kundendaten → Auftrag ID). Ohne sie kann der magicplan-Plan nicht gefunden werden.</span>`;
      return;
    }
    viewer.resize();
    if (loadedFor && loadedFor.startsWith(deal + "|")) { viewer.refresh(); return; }
    const data = await viewer.load(deal, saved && saved.deal === deal ? saved : null);
    if (data?.plan) loadedFor = `${deal}|${data.plan.id}`;
  }

  // load / refresh whenever the page becomes visible
  new MutationObserver(() => { if (!page.hidden) show(); }).observe(page, { attributes: true, attributeFilter: ["hidden"] });

  window.__raum3dPage = {
    getState: () => viewer.getState() || saved,
    restore(state) { saved = state && typeof state === "object" ? state : null; loadedFor = null; },
    reset() { saved = null; loadedFor = null; },
    snapshot: (view) => viewer.snapshot(view),
  };
}
