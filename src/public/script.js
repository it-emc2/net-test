
// call this whenever those panels become visible (no reload needed)
document.getElementById('nav-rabatt')?.addEventListener('click', refreshAllPanels);
document.getElementById('nav-debug') ?.addEventListener('click', refreshAllPanels);
// If you use hash-based navigation:
window.addEventListener('hashchange', () => {
  const id = location.hash.replace('#','');
  if (id === 'rabatt' || id === 'kosten') refreshAllPanels();
});
async function refetchAndRender() {
  const payload = buildPayload();
  const res = await fetch('/api/price', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  // Re-render Kosten-Details
  if (typeof renderFromData === 'function') renderFromData(data);
  // If you have a dedicated Rabatt renderer, call it here too:
  if (typeof renderRabattPanel === 'function') renderRabattPanel(data);
}

function wireDAQtyAutoFill() {
  const Pairs = [
    ['da-pendeltuer-preis','da-pendeltuer-qty'],
    ['da-gleittuer-preis', 'da-gleittuer-qty'],
    ['da-faltpendel-preis','da-faltpendel-qty'],
    ['da-walkin-preis',    'da-walkin-qty'],
  ];

  const parseMoney = (v) => {
    const s = String(v ?? '').trim();
    if (!s) return 0;
    const cleaned = s.replace(/\s+/g,'').replace(/\./g,'').replace(',', '.');
    const n = parseFloat(cleaned);
    return Number.isFinite(n) ? n : 0;
  };
  const clampQty = (v) => {
    const n = parseInt(String(v ?? '').trim(), 10);
    if (!Number.isFinite(n)) return '';
    return Math.max(1, n);
  };

  Pairs.forEach(([preisId, qtyId]) => {
    const p = document.getElementById(preisId);
    const q = document.getElementById(qtyId);
    if (!p || !q) return;

    p.addEventListener('input', () => {
      p.value = p.value.replace(/[^\d.,]/g, '');
      const val = parseMoney(p.value);
      if (val > 0) {
        if (!q.value) q.value = '1';
      } else {
        q.value = '';
      }
    });

    p.addEventListener('blur', () => {
      const val = parseMoney(p.value);
      if (val > 0) {
        p.value = val.toFixed(2).replace('.', ',');
        if (!q.value) q.value = '1';
      } else {
        p.value = '';
        q.value = '';
      }
    });

    q.addEventListener('input', () => {
      if (q.value === '') return;        // allow empty while editing
      q.value = String(clampQty(q.value));
    });

    q.addEventListener('blur', () => {
      const val = parseMoney(p.value);
      if (!(val > 0)) q.value = '';
    });
  });
}

// Refresh when a panel becomes visible (by hash or tab click)
function autoRefreshOnEnter() {
  // 1) Hash-based navigation (#rabatt, #kosten-details, #debug …)
  window.addEventListener('hashchange', () => {
    const h = (location.hash || '').toLowerCase();
    if (h.includes('rabatt') || h.includes('kosten') || h.includes('debug')) {
      refetchAndRender();
    }
  });

  // 2) If you have explicit nav links:
  document.querySelectorAll('a[href*="#rabatt"], [data-panel="rabatt"]').forEach(el => {
    el.addEventListener('click', () => setTimeout(refetchAndRender, 0));
  });
  document.querySelectorAll('a[href*="#kosten"], a[href*="#debug"], [data-panel="kosten-details"]').forEach(el => {
    el.addEventListener('click', () => setTimeout(refetchAndRender, 0));
  });

  // 3) Bonus checkbox itself should also re-render on change
  document.getElementById('rb-bonus-grab')?.addEventListener('change', () => {
    refetchAndRender();
  });
}

// Call once on startup (after DOM ready)
document.addEventListener('DOMContentLoaded', autoRefreshOnEnter);

// Recompute prices on the server and re-render both Debug + Rabatt UIs
async function recomputeAndRefresh() {
  try {
    const payload = collectFormPayload(); // <-- your existing form->payload function
    const res = await fetch('/api/price', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    // keep a global for debugging if you like
    window.__pricing = data;

    // Debug pane
    await renderFromData(data);

    // Rabatt pane (if you have a renderer; otherwise just update fields here)
    if (typeof renderRabattFromData === 'function') {
      renderRabattFromData(data);
    } else {
      // minimal fill if you don’t have a dedicated function
      const rbAfter = document.getElementById('rb-total-after');
      if (rbAfter) rbAfter.textContent = euroC(data.total || 0);
      const rbVat  = document.getElementById('rb-vat');
      if (rbVat) rbVat.textContent = euroC(data.vatOnNet || 0);
    }
  } catch (e) {
    console.warn('[recomputeAndRefresh] failed:', e);
  }
}

// Install listeners so entering the sections auto-refreshes latest data
function installAutoRefreshOnNav() {
  // Hash-based navigation support: e.g. #rabatt, #kosten-details
  window.addEventListener('hashchange', () => {
    const id = (location.hash || '').replace(/^#/, '');
    if (id === 'rabatt' || id === 'kosten') {
  setTimeout(() => window.updatePricing?.(), 0);
}

  });

  // If you have explicit nav buttons/tabs, hook them too
  const rabTab   = document.querySelector('[data-target="#rabatt"], #nav-rabatt, a[href="#rabatt"]');
  const kostTab  = document.querySelector('[data-target="#kosten"], #nav-kosten, a[href="#kosten"]');

  [ rabTab, kostTab ].forEach(el => {
  if (!el) return;
  el.addEventListener('click', () => setTimeout(() => window.updatePricing?.(), 0));
});
}

// call once on load
installAutoRefreshOnNav();


function wireDurationAutoFormat(id) {
  const el = document.getElementById(id);
  if (!el) return;

  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

  // Live formatting while typing
  el.addEventListener("input", () => {
    const digits = el.value.replace(/\D/g, ""); // keep only 0-9
    if (!digits) {
      el.value = "";
      return;
    }

    if (digits.length <= 2) {
      // 1--2 digits: show hours and add ":" placeholder
      el.value = digits + ":";
    } else {
      // 3+ digits: last two are minutes, rest are hours
      const minsRaw = digits.slice(-2);
      const hrsRaw = digits.slice(0, -2);
      const hrs = hrsRaw.replace(/^0+(?=\d)/, "") || "0"; // strip leading zeros
      const mins = String(clamp(parseInt(minsRaw, 10) || 0, 0, 59)).padStart(
        2,
        "0"
      );
      el.value = `${hrs}:${mins}`;
    }
  });

  // Normalize on blur (auto ":00", clamp minutes, etc.)
  el.addEventListener("blur", () => {
    const v = (el.value || "").trim();
    if (!v) return;

    // "7" -> "7:00"
    if (/^\d+$/.test(v)) {
      el.value = `${String(parseInt(v, 10) || 0)}:00`;
      return;
    }
    // "7:" -> "7:00"
    if (/^\d+:$/.test(v)) {
      el.value = v + "00";
      return;
    }
    // "7:5" -> "7:05", clamp mins
    const m = v.match(/^(\d+):(\d{1,2})$/);
    if (m) {
      const hrs = String(parseInt(m[1], 10) || 0);
      const mins = String(clamp(parseInt(m[2], 10) || 0, 0, 59)).padStart(
        2,
        "0"
      );
      el.value = `${hrs}:${mins}`;
    }
  });
}
function hhmmToHours(v) {
  if (v == null) return 0;
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2}):([0-5]\d)$/);
  if (!m) return 0;
  const h = Number(m[1]) || 0;
  const min = Number(m[2]) || 0;
  const dec = h + min / 60;
  return Math.round(dec * 100) / 100;
}

function hoursToHHMM(n) {
  const mins = Math.max(0, Math.round((Number(n) || 0) * 60));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

document.addEventListener("DOMContentLoaded", () => {
  wireDurationAutoFormat("laborHours");
  wireDurationAutoFormat("travelTime");
});

document.addEventListener("DOMContentLoaded", () => {
  const laborEl = document.getElementById("laborHours");
  const travelEl = document.getElementById("travelTime");
  const outEl = document.getElementById("totalHoursHHMM");

  function updateTotalHours() {
    const laborH = hhmmToHours(laborEl?.value || "0:00"); // Arbeitszeit
    const travelH1 = hhmmToHours(travelEl?.value || "0:00"); // Reisezeit (einfach)
    const totalNum = travelH1 * 2 + laborH;

    const totalHHMM = hoursToHHMM(totalNum);

    if (outEl) {
      outEl.innerHTML = `Gesamtzeit (Arbeit + Fahrt): <strong>${totalHHMM}</strong>`;
    }

    window.total_hours_numeric = Math.max(0, totalNum);
  }

  laborEl?.addEventListener("input", updateTotalHours);
  laborEl?.addEventListener("blur", updateTotalHours);
  travelEl?.addEventListener("input", updateTotalHours);
  travelEl?.addEventListener("blur", updateTotalHours);
  updateTotalHours();
});

// --- Offer number (ANG-YYYY-MM-DD-HH-mm-ss) + auto-stamp on export clicks ---
function genOfferNumber() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mmdd = `${p(d.getMonth() + 1)}${p(d.getDate())}`; // MMDD
  const hhmmss = `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`; // HHmmss
  return `ANG${yyyy}-${mmdd}-${hhmmss}`; // e.g. ANG2025-1008-092040
}

function stampOfferOnExport() {
  const offerInput =
    document.querySelector("#offerNumber") ||
    document.querySelector('input[name="offerNumber"]');
  if (!offerInput) return;

  const ids = [
    "makePdfFromTemplate",
    "downloadDocx",
    "downloadDocxAsPdf",
    "downloadMaterialOverview",
    "makePdf",
    "downloadPdf",
  ];

  const apply = () => {
    offerInput.value = genOfferNumber();
  };

  ids.forEach((id) => {
    const btn = document.getElementById(id);
    if (btn) btn.addEventListener("click", apply, { capture: true });
  });
}
document.addEventListener("DOMContentLoaded", stampOfferOnExport);
// --- end offer number snippet ---

const laborEl = document.getElementById("laborHours");
const laborHHMM = (laborEl?.value || "").trim();
const laborNumeric =
  typeof hhmmToHours === "function"
    ? Math.max(0, hhmmToHours())  //Math.ceil(laborHHMM * 100) / 100;
    : (() => {
        const m = laborHHMM.match(/^(\d+):([0-5]\d)$/);
        return m ? Number(m[1]) + Number(m[2]) / 60 : 0;
      })();

const root = document.documentElement;
const themeToggle = document.getElementById("themeToggle");
const themeLabel = document.getElementById("themeLabel");
function applyTheme(mode) {
  root.setAttribute("data-theme", mode === "dark" ? "dark" : "light");
  if (themeToggle) themeToggle.checked = mode === "dark";
  if (themeLabel) themeLabel.textContent = mode === "dark" ? "Dark" : "Light";
  localStorage.setItem("nt-theme", mode);
}
(function initTheme() {
  const saved = localStorage.getItem("nt-theme");
  if (saved) return applyTheme(saved);
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  applyTheme(prefersDark ? "dark" : "light");
})();
themeToggle?.addEventListener("change", () =>
  applyTheme(themeToggle.checked ? "dark" : "light")
);

/* ========== NAVIGATION ========== */
const steps = [
  "bereich",
  "duschwanne",
  "wandverkleidung",
  "duschabtrennung",
  "optional",
  "rabatt",
  "zusammenfassung",
  "kosten",
    "playground",
];
const pages = Object.fromEntries(
  steps.map((s) => [s, document.getElementById("page-" + s)])
);
const nav = document.getElementById("stepsNav");

function getCurrentStep() {
  const h = location.hash.replace("#", "");
  return steps.includes(h) ? h : steps[0];
}
function setStep(step) {
  steps.forEach((s, i) => {
    const link = nav?.querySelector(`[data-step="${s}"]`);
    link?.classList.toggle("active", s === step);
    link?.classList.toggle("done", steps.indexOf(step) > i);
    if (pages[s]) pages[s].hidden = s !== step;
  });
  location.hash = step;
  updateSummary();

  // ✅ Recompute whenever entering Rabatt or Kosten
  if (step === 'rabatt' || step === 'kosten') {
    // small defer to let layout/classes switch
    setTimeout(() => window.updatePricing?.(), 0);
  }
}

nav?.addEventListener("click", (e) => {
  const a = e.target.closest("a.step");
  if (!a) return;
  e.preventDefault();
  setStep(a.dataset.step);
});
setStep(getCurrentStep());
window.addEventListener("hashchange", () => setStep(getCurrentStep()));

/* ========== PAYLOAD / SUMMARY / STATUS ========== */
function formToObject(form) {
  return Object.fromEntries(new FormData(form).entries());
}

// collector for Wandverkleidung ---
function collectWandverkleidungMaterials(doc) {
  const page = document.getElementById("page-wandverkleidung");
  if (!page) return;

  const out = [];
  function pushIfSelected(cbSel, qtySel, friendlyName) {
    const cb = page.querySelector(cbSel);
    const qtyEl = page.querySelector(qtySel);
    if (!cb || !cb.checked) return;
    const qty = parseInt((qtyEl && qtyEl.value) || "0", 10);
    if (!qty) return;

    const productId = cb.getAttribute("data-product-id");
    out.push({ productId, name: friendlyName || cb.value, qty });
  }

  pushIfSelected("#wv997", "#wvQty997", "Wandverkleidung 3.0 Alu 997×2550");
  pushIfSelected("#wv1497", "#wvQty1497", "Wandverkleidung 3.0 Alu 1497×2550");

  if (!doc.materials) doc.materials = [];
  doc.materials.push(...out);
}
// --- Duschabtrennung Quick-Add (Hassmann) collector ---
// Mirrors wireDuschabtrennungQuickAdd(): only add when price > 0,
// default qty to 1 when price is given but qty is empty/0.
// Collects all rows from the 5 quick-add fieldsets and writes payload.duschabtrennung.quickAdd
function collectDuschabtrennungQuickAdd(doc) {
  const root = document.querySelector('section.da-quickadd');
  if (!root) return;

  // Canonical label per kind (used for every row — no DOM-derived labels)
  const KIND_TO_LABEL = {
    pendeltuer: 'Pendeltür Hassmann',
    gleittuer: 'Gleittür Hassmann',
    faltpendel: 'Falt-Pendeltür Hassmann',
    walkin: 'Walk-In Hassmann',
    sonder: 'Sonderduschabtrennung Hassmann',
  };

  const qa = [];

  root.querySelectorAll('fieldset.da-row').forEach(fs => {
    const kind = (fs.getAttribute('data-kind') || '').toLowerCase();
    const canonicalLabel = KIND_TO_LABEL[kind] || 'Duschabtrennung (Hassmann)';

    fs.querySelectorAll('.da-items .da-item').forEach(item => {
      const priceEl = item.querySelector('.da-price');
      const qtyEl   = item.querySelector('.da-qty');
      const idEl    = item.querySelector('.da-id');

      // 1) PRICE: keep raw input string (e.g., "1.099,00") – parsing happens in pricing.js
      const priceRaw = (priceEl?.value ?? '').trim();
      if (!priceRaw) return; // rule: only add a row if price is filled

      // 2) QTY: default to 1 if empty/invalid; min 1
      let qty = parseInt((qtyEl?.value ?? '').trim(), 10);
      if (!Number.isFinite(qty) || qty <= 0) qty = 1;

      // 3) Optional product id
      const productId = (idEl?.value ?? '').trim();

      qa.push({
        kind,                          // e.g. "pendeltuer"
        label: canonicalLabel,         // always set explicit label
        qty,
        price: priceRaw,               // <-- raw string, NOT cents, NOT parsed
        productId
      });
    });
  });

  doc.duschabtrennung = doc.duschabtrennung || {};
  doc.duschabtrennung.quickAdd = qa;
}





function buildPayload() {
  const payload = {
    bereich: formToObject(document.getElementById("form-bereich")),
    duschwanne: {
      ...formToObject(document.getElementById("form-duschwanne")),
      computed: window.__DW_COMPUTED__ || {},
    },
    wandverkleidung: formToObject(document.getElementById("form-wandverkleidung")),
    duschabtrennung: formToObject(document.getElementById("form-duschabtrennung")),
    optional: formToObject(document.getElementById("form-optional")),
    rabatt: formToObject(document.getElementById("form-rabatt")),
  };

  collectWandverkleidungMaterials(payload);
   // ✅ NEW: collect quick-add shower screens
  collectDuschabtrennungQuickAdd(payload);

  // ---- NEW: reliably collect ALL Duschwanne work tasks (checkbox array) ----
  try {
    const formDW = document.getElementById("form-duschwanne");
    // wherever you build payload.duschwanne = {...}

    if (formDW) {
      const fdDW = new FormData(formDW);
      const dwTasks = fdDW.getAll("duschwanne[workTasks][]"); // ✅ all checked values
      const dw = (payload.duschwanne ||= {});

      if (dwTasks.length) {
        const eb = document.getElementById('ebenerdigeToggle')?.checked;
if (!payload.duschwanne) payload.duschwanne = {};
payload.duschwanne.ebenerdigNote = eb ? 'true' : '';
        dw.workTasks = dwTasks; // canonical key the server normalizer reads
      } else {
        // Fallback: if serializer stored a single string under a weird key, normalize to array
        const weird = dw["duschwanne[workTasks][]"];
        if (typeof weird === "string" && weird.trim()) {
          dw.workTasks = [weird.trim()];
        }
      }
      // Clean any stray literal key so it doesn't confuse server logs
      if ("duschwanne[workTasks][]" in payload.duschwanne) {
        delete payload.duschwanne["duschwanne[workTasks][]"];
      }
    }
  } catch (e) {
    console.warn("[buildPayload] workTasks normalization failed:", e);
  }
  // -------------------------------------------------------------------------

  // Budget/Zuzahlung
  const elMax = document.querySelector('input[name="budgetMax"]');
  const elCopay = document.querySelector('input[name="budgetCopay"]');
  const elTwo = document.querySelector('input[name="twoPersons"]');
  const copayEl = document.getElementById("copayAmount");

  const wohDoneRadios = document.querySelectorAll('input[name="wohnumfeldDone"]');
  const wohAmountInput = document.getElementById("wohnumfeldAmount");
  function readWohnumfeld() {
    const isJa = Array.from(wohDoneRadios).some((r) => r.checked && r.value === "Ja");
    let amount = 0;
    if (isJa && wohAmountInput) {
      const raw = (wohAmountInput.value || "").toString().replace(",", ".");
      const parsed = parseFloat(raw);
      amount = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    }
    return { done: isJa, amount };
  }

  function parseEuroToNumber(v) {
    const s = String(v ?? "")
      .trim()
      .replace(/[^\d.,-]/g, "")
      .replace(/\./g, "")
      .replace(",", ".");
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : 0;
  }

  let selected = "";
  if (elMax?.checked) selected = elMax.value;
  else if (elCopay?.checked) selected = elCopay.value;
  else if (elTwo?.checked) selected = elTwo.value;

  const canonical = selected
    ? selected.toUpperCase().replace(/_/g, " ").replace(/\s+/g, " ").trim()
    : "";

  payload.bereich = payload.bereich || {};
  payload.bereich.budgetOptionsPanel = canonical || selected || "";
  payload.bereich.copayAmount = copayEl ? parseEuroToNumber(copayEl.value) : 0;

  // Rabatt fields for server
  const pct = parseFloat(document.getElementById("rb-material-discount")?.value || "0");
  payload.rabatt = {
    ...payload.rabatt,
    materialDiscountPct: isFinite(pct) ? pct / 100 : 0,
    bonus300: !!document.getElementById("rb-bonus-300")?.checked,
    bonusGrab: !!document.getElementById("rb-bonus-grab")?.checked,
  };

  payload.offerNumber = (document.getElementById("offerNumber")?.value || "").trim();
  payload.bereich.totalHoursHHMM =
    document.getElementById("totalHoursHHMM")?.textContent?.match(/(\d+:\d{2})/)?.[1] || "";
  payload.bereich.totalHoursNumeric = Number(window.total_hours_numeric || 0);
  payload.bereich.laborHoursHHMM = laborHHMM;
  payload.bereich.laborHoursNumeric = laborNumeric;

  const woh = readWohnumfeld();
  const isKK =
    (payload.bereich?.payer ||
      document.querySelector('input[name="payer"]:checked')?.value) === "Kassenkunde";
  payload.bereich.wohnumfeld = isKK ? woh : { done: false, amount: 0 };

  // --- Attach Duschwanne selection from DOM (if present) ---
  {
    const pid = document.getElementById("chosenTrayProductId")?.value?.trim();
    const size = document.getElementById("traySize")?.value?.trim();

    const dw = payload.duschwanne || (payload.duschwanne = {});
    if (pid) dw.chosenTrayProductId = pid;
    if (size) dw.traySize = size;
  }

  // --- Ensure tray selection persists ONLY if the user actually touched the Duschwanne step
  (function ensureTraySelection() {
    const dw = payload.duschwanne || (payload.duschwanne = {});
    const hasSize = !!(dw.traySize && String(dw.traySize).trim());
    const hasPid = !!(dw.chosenTrayProductId && String(dw.chosenTrayProductId).trim());
    if (hasSize && hasPid) return;

    const chosenNow = document.getElementById("chosenTrayProductId")?.value?.trim();
    const touched = !!(chosenNow || sessionStorage.getItem("dw_tray_touched") === "1");
    if (!touched) return;

    try {
      const raw = localStorage.getItem("dw_tray_selection");
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (!hasSize && saved?.value) dw.traySize = saved.value;
      if (!hasPid && saved?.productId) dw.chosenTrayProductId = saved.productId;
    } catch {}
  })();

  return payload;
}


window.buildPayload = buildPayload;

function updateSummary() {
  if (getCurrentStep() !== "zusammenfassung") return;
  const el = document.getElementById("summaryText");
  const payload = buildPayload();
  el.textContent = "Vorschau: " + JSON.stringify(payload);
}

const statusEl = document.getElementById("status");
function show(obj, ok = true) {
  if (!statusEl) return;
  statusEl.className = "status " + (ok ? "ok" : "err");
  statusEl.textContent =
    typeof obj === "string" ? obj : JSON.stringify(obj, null, 2);
}

// ========== PDF PROGRESS FUNCTIONS ==========
function showPDFProgress(message, type = "info") {
  if (!statusEl) return;
  const timestamp = new Date().toLocaleTimeString();
  const emoji =
    {
      info: "🔄",
      success: "✅",
      error: "❌",
      warning: "⚠️",
    }[type] || "🔄";
  statusEl.className = "status " + (type === "error" ? "err" : "ok");
  statusEl.textContent = `${emoji} [${timestamp}] ${message}`;
}

function updatePDFTimer(seconds) {
  if (!statusEl) return;
  const emoji = seconds > 0 ? "⏱️" : "🔄";
  const text =
    seconds > 0
      ? `${emoji} PDF wird generiert... noch ca. ${seconds}s`
      : `${emoji} PDF fast fertig...`;
  statusEl.textContent = text;
}

// Enhanced PDF download with progress
async function downloadPDFWithProgress(endpoint, payload, filename) {
  showPDFProgress("PDF-Generation gestartet...", "info");
  let timeLeft = 30;
  updatePDFTimer(timeLeft);
  const timerInterval = setInterval(() => {
    timeLeft--;
    updatePDFTimer(timeLeft);
  }, 1000);

  try {
    showPDFProgress("DOCX-Vorlage wird verarbeitet...", "info");
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      clearInterval(timerInterval);
      const errorData = await response
        .json()
        .catch(() => ({ error: `HTTP ${response.status}` }));
      showPDFProgress(
        `Fehler: ${errorData.error || "Unbekannter Fehler"}`,
        "error"
      );
      if (errorData.detail)
        setTimeout(
          () => showPDFProgress(`Details: ${errorData.detail}`, "error"),
          1000
        );
      return;
    }

    showPDFProgress("PDF wird konvertiert (LibreOffice)...", "info");
    const blob = await response.blob();

    clearInterval(timerInterval);
    showPDFProgress("PDF erfolgreich erstellt!", "success");

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setTimeout(() => {
      showPDFProgress("PDF-Download abgeschlossen!", "success");
    }, 500);
  } catch (error) {
    clearInterval(timerInterval);
    showPDFProgress(`Netzwerkfehler: ${error.message}`, "error");
    console.error("PDF generation failed:", error);
  }
}

function collectAllFormData() {
  return buildPayload();
}

/* ========== HELPERS ========== */
function flashInvalid(el) {
  if (!el) return;
  el.style.borderColor = "var(--danger)";
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  setTimeout(() => (el.style.borderColor = ""), 1200);
}
function euro(n) {
  return new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(n || 0));
}
function highlightTileForInput(input, on) {
  input?.closest("label.image-check")?.classList.toggle("is-checked", !!on);
}

/* ========== VALIDATION ========== */
function validateBereich() {
  const form = document.getElementById("form-bereich");
  if (!form) return true;
  const d = document.getElementById("date");
  if (d && !d.value) d.valueAsDate = new Date();
  if (!form.checkValidity()) return false;

  const req = ["date", "firstName", "lastName", "customerNumber"];
  let bad = req
    .map((id) => document.getElementById(id))
    .find((el) => !el?.value);
  if (!bad) {
    const radios = ["salutation", "hasContactPerson", "customerType", "payer"];
    for (const n of radios) {
      if (!form.querySelector(`input[name="${n}"]:checked`)) {
        bad = form.querySelector(`input[name="${n}"]`)?.closest("label");
        break;
      }
    }
  }
  if (bad) {
    flashInvalid(bad.tagName === "INPUT" ? bad : bad.querySelector("input"));
    return false;
  }
  return true;
}
function validateDuschwanne() {
  const f = document.getElementById("form-duschwanne");
  if (!f) return true;
  let bad = f.querySelector('input[name="traySize"]:checked')
    ? null
    : f.querySelector('input[name="traySize"]')?.closest("label");
  const add = f.querySelector("#addFlooring");
  if (add?.checked) {
    const area = f.querySelector("#floorArea");
    if (!area?.value && !bad) bad = area;
    if (!f.querySelector('input[name="flooringProduct[]"]:checked') && !bad)
      bad = f
        .querySelector('input[name="flooringProduct[]"]')
        ?.closest("label");
    if (!f.querySelector('input[name="floorAdhesive[]"]:checked') && !bad)
      bad = f.querySelector('input[name="floorAdhesive[]"]')?.closest("label");
    
  }
  if (bad) {
    flashInvalid(bad.tagName === "INPUT" ? bad : bad.querySelector("input"));
    alert('Bitte füllen Sie alle Pflichtfelder in „Duschwanne" aus.');
    return false;
  }
  return true;
}
function validateWandverkleidung() {
  const f = document.getElementById("form-wandverkleidung");
  if (!f) return true;
  if (!f.querySelector('input[name="wvKind"]:checked')) {
    const t = f.querySelector('input[name="wvKind"]')?.closest("label");
    flashInvalid(t?.querySelector("input") || t);
    alert("Bitte wählen Sie die Art der Wandverkleidung.");
    return false;
  }
  return true;
}
function validateOptional() {
  return true;
}

function validateRabatt() {
  const f = document.getElementById("form-rabatt");
  if (!f) return true;
  return f.reportValidity();
}

function validateDuschabtrennung() {
  const f = document.getElementById("form-duschabtrennung");
  if (!f) return true;
  return f.reportValidity();
}

/* Focus helper for Bereich conditional errors (defined in initBereichErrorHints) */
function focusFirstBereichConditionalError() {
  if (typeof window.__bereichFocusFirstError__ === "function") {
    return window.__bereichFocusFirstError__();
  }
  return false;
}

function requireBereichValid() {
  const form = document.getElementById("form-bereich");
  if (!form.reportValidity()) {
    focusFirstBereichConditionalError();
    return false;
  }
  const ok = validateBereich();
  if (!ok) focusFirstBereichConditionalError();
  return ok;
}

/* ========== NAV BUTTONS ========== */
document.body.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-nav]");
  if (!btn) return;
  const dir = btn.getAttribute("data-nav");
  const step = getCurrentStep();
  const idx = steps.indexOf(step);
  if (dir === "prev") return setStep(steps[Math.max(0, idx - 1)]);
  if (dir === "next") {
    const ok =
      step === "bereich"
        ? requireBereichValid()
        : step === "duschwanne"
        ? validateDuschwanne()
        : step === "wandverkleidung"
        ? validateWandverkleidung()
        : step === "duschabtrennung"
        ? validateDuschabtrennung()
        : step === "optional"
        ? validateOptional()
        : step === "rabatt"
        ? validateRabatt()
        : true;
    if (!ok) return;
    setStep(steps[Math.min(steps.length - 1, idx + 1)]);
  }
});

/* ========== WANDVERKLEIDUNG PAGE WIRING (auto color, qty=1, etc.) ========== */
function updateKostenDetails() {
  window.updatePricing?.();
} // safe, no direct rendering

function setupWandverkleidungPage() {
  const page = document.getElementById("page-wandverkleidung");
  if (!page || page.dataset._wired === "true") return;
  page.dataset._wired = "true";

  const defaultColor = page.querySelector(
    'input[type="radio"][name="wvColor"][value="Marmor weiß"]'
  );
  const anyColorChecked = page.querySelector(
    'input[type="radio"][name="wvColor"]:checked'
  );
  if (defaultColor && !anyColorChecked) defaultColor.checked = true;

  const pairs = [
    { cb: "#wv997", wrap: "#wvQty997Wrap", qty: "#wvQty997" },
    { cb: "#wv1497", wrap: "#wvQty1497Wrap", qty: "#wvQty1497" },
  ];

  function showWrap(wrapEl, show) {
    if (!wrapEl) return;
    wrapEl.hidden = !show;
    wrapEl.setAttribute("aria-hidden", show ? "false" : "true");
  }

  pairs.forEach(({ cb, wrap, qty }) => {
    const cbEl = page.querySelector(cb);
    const wrapEl = page.querySelector(wrap);
    const qtyEl = page.querySelector(qty);
    if (!cbEl || !wrapEl || !qtyEl) return;

    if (cbEl.checked) {
      showWrap(wrapEl, true);
      if (!parseInt(qtyEl.value || "0", 10)) qtyEl.value = "1";
    }

    cbEl.addEventListener("change", () => {
      if (cbEl.checked) {
        showWrap(wrapEl, true);
        if (!parseInt(qtyEl.value || "0", 10)) qtyEl.value = "1";
      } else {
        showWrap(wrapEl, false);
        qtyEl.value = "0";
      }
      if (typeof updateKostenDetails === "function") updateKostenDetails();
    });

    qtyEl.addEventListener("input", () => {
      if (typeof updateKostenDetails === "function") updateKostenDetails();
    });
  });
}
function initWVConnectorsUI() {
  const qtyVEl   = document.getElementById('wvV3VQty');       // user-entered connectors
  const outEl    = document.getElementById('wvV3VRuleText');  // hint line
  const cb997    = document.getElementById('wv997');
  const cb1497   = document.getElementById('wv1497');
  const q997El   = document.getElementById('wvQty997');
  const q1497El  = document.getElementById('wvQty1497');
  const corners  = document.getElementById('wvCornersCB');

  if (!qtyVEl || !outEl) return;

  const n = (v) => {
    const x = parseInt(String(v ?? '0').replace(/[^\d-]/g, ''), 10);
    return Number.isFinite(x) && x > 0 ? x : 0;
  };

  function recommendedVCount() {
    const use997  = !!cb997?.checked;
    const use1497 = !!cb1497?.checked;
    const q997    = use997  ? n(q997El?.value)   : 0;
    const q1497   = use1497 ? n(q1497El?.value)  : 0;

    const totalPanels = q997 + q1497;
    let rec = Math.max(0, totalPanels - 1);    // joints between panels in a run
    if (corners?.checked) rec -= 1;            // add vertical profiles for corners
    return rec;
  }

  function render() {
    const rec = recommendedVCount();
    const cur = n(qtyVEl.value);
    outEl.textContent = rec > 0
      ? `- Verbindungsprofil(e) empfohlen: ${rec} Stk • aktuell: ${cur} Stk`
      : (cur > 0 ? `- Verbindungsprofil(e): ${cur} Stk` : '');
  }

  // Wire listeners (any change should refresh the hint)
  ['input','change','blur'].forEach(ev => {
    qtyVEl.addEventListener(ev, render);
    q997El?.addEventListener(ev, render);
    q1497El?.addEventListener(ev, render);
  });
  cb997?.addEventListener('change', render);
  cb1497?.addEventListener('change', render);
  corners?.addEventListener('change', render);

  // First paint
  render();
}

// init when the WV page is visible
window.addEventListener('hashchange', () => {
  if (typeof getCurrentStep === 'function' && getCurrentStep() === 'wandverkleidung') {
    initWVConnectorsUI();
  }
});
document.addEventListener('DOMContentLoaded', () => {
  if (typeof getCurrentStep === 'function' && getCurrentStep() === 'wandverkleidung') {
    initWVConnectorsUI();
  }
});


window.addEventListener("hashchange", () => {
  if (location.hash === "#wandverkleidung") setupWandverkleidungPage();
});
document.addEventListener("DOMContentLoaded", () => {
  if (location.hash === "#wandverkleidung") setupWandverkleidungPage();
});

// === Duschabtrennung QuickAdd Repeater (multi-row per kind) ===
(function initDARepeater() {
  const section = document.querySelector('section.da-quickadd');
  if (!section) return;

  const TPL = document.getElementById('da-item-template');
  const KINDS = [
    { kind: 'pendeltuer',   label: 'Pendeltür Hassmann' },
    { kind: 'gleittuer',    label: 'Gleittür Hassmann' },
    { kind: 'faltpendel',   label: 'Falt-Pendeltür Hassmann' },
    { kind: 'walkin',       label: 'Walk-In Hassmann' },
  ];

  const LS_KEY = 'daQuickAddRows:v1';

const parseMoney = (v) => {
  let s = String(v ?? '').trim();
  if (!s) return 0;
  s = s.replace(/\s+/g, '').replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
};

const saveState = () => {
  const state = {};
  for (const fs of section.querySelectorAll('fieldset.da-row[data-kind]')) {
    const kind = fs.dataset.kind;
    const rows = [];
    fs.querySelectorAll('.da-item').forEach(item => {
      const price = parseMoney(item.querySelector('.da-price')?.value);
      const qtyEl = item.querySelector('.da-qty');
      const idEl  = item.querySelector('.da-id');
      const qty   = Math.max(1, parseInt((qtyEl?.value || '').trim(), 10) || 0);
      const pid   = (idEl?.value || '').trim();
      rows.push({ price, qty, productId: pid });
    });
    state[kind] = rows;
  }
  try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch {}
};

  const restoreState = () => {
  let data = null;
  try { data = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch {}
  if (!data || typeof data !== 'object') return;

  // we'll re-save a migrated copy per kind
  const migrated = {};

  for (const fs of section.querySelectorAll('fieldset.da-row[data-kind]')) {
    const kind = fs.dataset.kind;
    const wrap = fs.querySelector('.da-items');
    if (!wrap) continue;

    const rows = Array.isArray(data[kind]) ? data[kind] : [];
    // --- normalize legacy rows (string prices, cents→euros, pid→productId)
 const normalizeRow = (r) => {
      if (!r || typeof r !== 'object') return { price: 0, qty: 0, productId: '' };
      let price = r.price;

      if (typeof price === 'string') {
        const s = price.trim().replace(/\s+/g, '').replace(/\./g, '').replace(',', '.');
        const n = parseFloat(s);
        price = Number.isFinite(n) ? n : 0;
      }
      if (typeof price === 'number' && Number.isFinite(price) && price > 999 && Number.isInteger(price)) {
        // legacy cents → euros
        price = price / 100;
      }
      price = Number.isFinite(price) && price > 0 ? Math.round(price * 100) / 100 : 0;

      const qty = Math.max(price > 0 ? 1 : 0, parseInt(r.qty, 10) || 0);
      const productId = (r.productId || r.pid || '').trim();
      return { price, qty, productId };
    };

// normalize all rows (and later save back to LS so we "migrate" once)
const normRows = rows.map(normalizeRow);
migrated[kind] = normRows;
   // --- render: keep first row, rebuild others
    const first = wrap.querySelector('.da-item');
    if (!first) continue;
    wrap.querySelectorAll('.da-item:not(:first-child)').forEach(n => n.remove());

    const fill = (item, row) => {
      const priceEl = item.querySelector('.da-price');
      const qtyEl   = item.querySelector('.da-qty');
      const idEl    = item.querySelector('.da-id');

      // ensure two decimals for UI
      const priceStr = row?.price ? row.price.toFixed(2).replace('.', ',') : '';

      if (priceEl) priceEl.value = priceStr;
      if (qtyEl)   qtyEl.value   = row?.price ? String(Math.max(1, row.qty || 1)) : '';
      if (idEl)    idEl.value    = row?.productId || '';
    };

    if (normRows.length > 0) {
      fill(first, normRows[0]);
      for (let i = 1; i < normRows.length; i++) {
        const item = addRow(kind, fs, false); // addRow already exists in this IIFE
        if (item) fill(item, normRows[i]);
      }
    } else {
      const priceEl = first.querySelector('.da-price');
      const qtyEl   = first.querySelector('.da-qty');
      const idEl    = first.querySelector('.da-id');
      if (priceEl) priceEl.value = '';
      if (qtyEl)   qtyEl.value   = '';
      if (idEl)    idEl.value    = '';
    }
  }

  // write back migrated (once) so old “×100” never returns
  try { localStorage.setItem(LS_KEY, JSON.stringify(migrated)); } catch {}
};

  function addRow(kind, fs, focusPrice = true) {
    const wrap = fs.querySelector('.da-items');
    if (!wrap || !TPL?.content) return null;

    // rule: only add if the last existing row has a filled price
    const last = wrap.querySelector('.da-item:last-child');
    if (last) {
      const lastPrice = parseMoney(last.querySelector('.da-price')?.value);
      if (lastPrice <= 0) return null; // do nothing
    }

    const node = TPL.content.firstElementChild.cloneNode(true);
    wrap.appendChild(node);
    wireRow(node);
    if (focusPrice) node.querySelector('.da-price')?.focus();
    saveState();
    return node;
  }

  function removeRow(btn) {
    const item = btn.closest('.da-item');
    const fs   = btn.closest('fieldset.da-row[data-kind]');
    if (!item || !fs) return;

    const wrap = fs.querySelector('.da-items');
    // keep at least one row visible per kind
    if (wrap && wrap.querySelectorAll('.da-item').length <= 1) {
      // clear instead of remove
      item.querySelector('.da-price').value = '';
      item.querySelector('.da-qty').value   = '';
      item.querySelector('.da-id').value    = '';
    } else {
      item.remove();
    }
    saveState();
  }

  function wireRow(item) {
    const priceEl = item.querySelector('.da-price');
    const qtyEl   = item.querySelector('.da-qty');

    // During typing: keep only digits, comma, dot
    priceEl?.addEventListener('input', () => {
      priceEl.value = priceEl.value.replace(/[^\d.,]/g, '');
    });

    // On blur: normalize; if valid price and qty empty -> qty = 1; if price empty -> clear qty
    priceEl?.addEventListener('blur', () => {
      let s = (priceEl.value || '').trim();
      if (!s) {
        priceEl.value = '';
        if (qtyEl) qtyEl.value = '';
        saveState();
        return;
      }
      s = s.replace(/\s+/g, '').replace(/\./g, '').replace(',', '.');
      const n = parseFloat(s);
      if (!Number.isFinite(n) || n <= 0) {
        priceEl.value = '';
        if (qtyEl) qtyEl.value = '';
        saveState();
        return;
      }
      const parts = n.toFixed(2).split('.');
      parts[0] = parts[0].replace(/^0+(?=\d)/, ''); // strip leading zeros
      priceEl.value = parts.join(',');
      if (qtyEl && !qtyEl.value) qtyEl.value = '1';
      saveState();
    });

    // Qty: keep min=1 if non-empty; allow empty if price cleared
    qtyEl?.addEventListener('input', () => {
      const v = qtyEl.value.trim();
      if (!v) { saveState(); return; }
      const n = Math.max(1, parseInt(v, 10) || 1);
      if (String(n) !== v) qtyEl.value = String(n);
      saveState();
    });
  }

  // Wire existing first rows + add buttons + trash
  section.querySelectorAll('fieldset.da-row[data-kind]').forEach(fs => {
    const addBtn = fs.querySelector('.da-add');
    const wrap   = fs.querySelector('.da-items');
    // wire existing row
    wrap?.querySelectorAll('.da-item').forEach(wireRow);

    // “+” add a row (but only if last row has price)
    addBtn?.addEventListener('click', () => addRow(fs.dataset.kind, fs, true));

    // trash via event delegation
    fs.addEventListener('click', (e) => {
      const btn = e.target.closest('.da-remove');
      if (btn) removeRow(btn);
    });
  });

  // Restore from localStorage once
  restoreState();

  // Re-save on navigation away (optional)
  window.addEventListener('beforeunload', saveState);
})();

/* ========== BEREICH UI (contact, aufschlag/pflegegrad, etc.) ========== */
(function initContactPersonToggle() {
  const form = document.getElementById("form-bereich");
  const section = document.getElementById("contactPersonSection");
  const req = ["cp_name", "cp_street", "cp_city", "cp_postalCode"].map((id) =>
    document.getElementById(id)
  );
  function setReq(el, on) {
    if (!el) return;
    on
      ? el.setAttribute("required", "required")
      : el.removeAttribute("required");
  }
  function show(on) {
    section.hidden = !on;
    section.setAttribute("aria-hidden", on ? "false" : "true");
    req.forEach((r) => setReq(r, on));
    if (!on) req.forEach((r) => r && (r.value = ""));
  }
  function isYes() {
    const c = form?.querySelector('input[name="hasContactPerson"]:checked');
    return c && c.value === "Ja";
  }
  show(isYes());
  form?.addEventListener("change", (e) => {
    if (e.target?.name === "hasContactPerson") show(e.target.value === "Ja");
  });
})();
(function initAufschlag() {
  const payerRadios = Array.from(
    document.querySelectorAll('input[name="payer"]')
  );
  const aufschlagRadios = Array.from(
    document.querySelectorAll('input[name="aufschlag"]')
  );

  const r35 = document.querySelector('input[name="aufschlag"][value="35%"]');
  const r40 = document.querySelector('input[name="aufschlag"][value="40%"]');
  const r45 = document.querySelector('input[name="aufschlag"][value="45%"]');
  const r50 = document.querySelector('input[name="aufschlag"][value="50%"]');

  function setDisabled(el, disabled) {
    if (!el) return;
    el.disabled = disabled;
    const pill = el.closest("label.radio-pill");
    if (pill) {
      pill.style.opacity = disabled ? "0.6" : "";
      pill.style.pointerEvents = disabled ? "none" : "";
      pill.setAttribute("aria-disabled", disabled ? "true" : "false");
    }
  }

  function anySelected() {
    return aufschlagRadios.some((r) => r.checked);
  }
  function currentSelection() {
    return (
      document.querySelector('input[name="aufschlag"]:checked')?.value || ""
    );
  }

  function apply() {
    const payer = document.querySelector('input[name="payer"]:checked')?.value;

    if (payer === "Selbstzahler") {
      if (r35 && !r35.checked) r35.checked = true;
      setDisabled(r35, false);
      setDisabled(r40, true);
      setDisabled(r45, true);
      setDisabled(r50, true);
    } else if (payer === "Kassenkunde") {
      [r35, r40, r45, r50].forEach((r) => setDisabled(r, false));
      const sel = currentSelection();
      if (!anySelected() && r50) r50.checked = true;
      else if (sel === "35%") {
        if (r50) r50.checked = true;
      }
    } else {
      [r35, r40, r45, r50].forEach((r) => setDisabled(r, false));
    }
  }

  payerRadios.forEach((r) => r.addEventListener("change", apply));
  apply();
})();

(function initPflegegrad() {
  const form = document.getElementById("form-bereich");
  const pgLevelRow = document.getElementById("pflegegradLevelRow");
  const pgRadios = Array.from(
    pgLevelRow?.querySelectorAll('input[name="pflegegrad"]') || []
  );
  const budgetPanel = document.getElementById("budgetOptionsPanel");
  const copayCheckbox = document.getElementById("budgetCopay");
  const copayField = document.getElementById("copayField");
  const copayAmount = document.getElementById("copayAmount");
  const wePanel = document.getElementById("wohnumfeldPanel");
  const weDoneGroup = document.getElementById("wohnumfeldDoneGroup");
  const weAmountRow = document.getElementById("wohnumfeldAmountRow");
  const weAmount = document.getElementById("wohnumfeldAmount");
  const weAppGroup = document.getElementById("wohnumfeldApplicationGroup");

  function show(el, on) {
    if (el) {
      el.hidden = !on;
      el.setAttribute("aria-hidden", on ? "false" : "true");
    }
  }
  function setReq(els, on) {
    (Array.isArray(els) ? els : [els]).forEach((el) =>
      el
        ? on
          ? el.setAttribute("required", "required")
          : el.removeAttribute("required")
        : null
    );
  }
  function clearRadios(radios) {
    radios.forEach((r) => (r.checked = false));
  }
  function isKK() {
    const p = form?.querySelector('input[name="payer"]:checked');
    return p && p.value === "Kassenkunde";
  }
  function hasPG() {
    const r = form?.querySelector('input[name="hasPflegegrad"]:checked');
    return r && r.value === "Ja";
  }
  function pgVal() {
    const r = form?.querySelector('input[name="pflegegrad"]:checked');
    return r ? parseInt(r.value, 10) : NaN;
  }

  function applyCopay() {
  const on = !!(
    copayCheckbox &&
    copayCheckbox.checked &&
    !copayCheckbox.closest("[hidden]")
  );
  show(copayField, on);
  // Make it optional: never mark as required
  if (!on && copayAmount) copayAmount.value = "";
}

 function apply(){
  const kk = isKK(); 
  const has = hasPG(); 
  const val = pgVal(); 
  // before: const valid2 = Number.isInteger(val) && val>=2;
  const valid1 = Number.isInteger(val) && val>=1; // allow from Pflegegrad 1
    show(pgLevelRow, has);
    setReq(pgRadios, has);
    if (!has) clearRadios(pgRadios);
    const showBudget = kk && has && valid1;
    show(budgetPanel, showBudget);
    if (!showBudget && copayCheckbox) {
      copayCheckbox.checked = false;
      applyCopay();
    }
    show(wePanel, kk);
    const weDoneRadios = Array.from(
      weDoneGroup?.querySelectorAll('input[name="wohnumfeldDone"]') || []
    );
    const weAppRadios = Array.from(
      weAppGroup?.querySelectorAll('input[name="wohnumfeldApplication"]') || []
    );
    setReq(weDoneRadios, kk);
    setReq(weAppRadios, kk);
    if (!kk) {
      weDoneRadios.forEach((r) => (r.checked = false));
      weAppRadios.forEach((r) => (r.checked = false));
      show(weAmountRow, false);
      setReq(weAmount, false);
      if (weAmount) weAmount.value = "";
    } else {
      const doneYes = form?.querySelector(
        'input[name="wohnumfeldDone"][value="Ja"]:checked'
      );
      const showAmt = !!doneYes;
      show(weAmountRow, showAmt);
      setReq(weAmount, showAmt);
      if (!showAmt && weAmount) weAmount.value = "";
    }
  }
  apply();
  applyCopay();
  form?.addEventListener("change", (e) => {
    const t = e.target;
    if (!t) return;
    if (
      ["payer", "hasPflegegrad", "pflegegrad", "wohnumfeldDone"].includes(
        t.name
      )
    )
      apply();
    if (t.id === "budgetCopay") applyCopay();
  });
})();

// Live round-trip preview (Bereich → Entfernung)
(function initRoundTripPreview() {
  const kmInput = document.getElementById('distanceKm');
  const out = document.getElementById('roundTripPreview');
  if (!kmInput || !out) return;

  const paint = (v) => {
    const n = Math.max(0, Number(v) || 0);
    out.textContent = `= ${Math.round(n * 2)} km (Hin- & Rückfahrt)`;
  };

  // 1) immediate feedback while typing
  kmInput.addEventListener('input', () => paint(kmInput.value));
  kmInput.addEventListener('change', () => paint(kmInput.value));
  paint(kmInput.value); // initial

  // 2) keep in sync when server recomputes pricing
  window.addEventListener('pricing:updated', (ev) => {
    const km = ev.detail?.roundTripKm ?? window.__pricing?.roundTripKm;
    if (typeof km === 'number' && isFinite(km)) {
      out.textContent = `= ${Math.round(km)} km (Hin- & Rückfahrt)`;
    }
  });
})();

/* ========== ACCESSIBLE ERROR HINTS FOR BEREICH CONDITIONALS ========== */
(function initBereichErrorHints() {
  const form = document.getElementById("form-bereich");
  if (!form) return;

  function ensureHint(afterEl, id) {
    if (!afterEl) return null;
    let hint = document.getElementById(id);
    if (!hint) {
      hint = document.createElement("div");
      hint.id = id;
      hint.role = "alert";
      hint.style.color = "var(--danger)";
      hint.style.marginTop = "6px";
      hint.style.fontSize = "0.9rem";
      hint.style.display = "none";
      afterEl.appendChild(hint);
    }
    return hint;
  }
  function showHint(hint, msg) {
    if (!hint) return;
    hint.textContent = msg || "";
    hint.style.display = msg ? "block" : "none";
  }

  const pgLevelRow = document.getElementById("pflegegradLevelRow");
  const wePanel = document.getElementById("wohnumfeldPanel");
  const weDoneGroup = document.getElementById("wohnumfeldDoneGroup");
  const weAppGroup = document.getElementById("wohnumfeldApplicationGroup");
  const weAmountRow = document.getElementById("wohnumfeldAmountRow");

  const hintPG = ensureHint(pgLevelRow, "hint_pg_level");
  const hintWE = ensureHint(weDoneGroup, "hint_we_done");
  const hintApp = ensureHint(weAppGroup, "hint_we_app");
  const hintAmt = ensureHint(weAmountRow, "hint_we_amount");

  const isKK = () =>
    form.querySelector('input[name="payer"]:checked')?.value === "Kassenkunde";
  const hasPG = () =>
    form.querySelector('input[name="hasPflegegrad"]:checked')?.value === "Ja";
  const pgSelected = () =>
    !!form.querySelector('input[name="pflegegrad"]:checked');
  const weDoneSelected = () =>
    !!form.querySelector('input[name="wohnumfeldDone"]:checked');
  const weAppSelected = () =>
    !!form.querySelector('input[name="wohnumfeldApplication"]:checked');
  const weDoneYes = () =>
    !!form.querySelector('input[name="wohnumfeldDone"][value="Ja"]:checked');
  const amtVal = () => {
    const el = document.getElementById("wohnumfeldAmount");
    if (!el || el.closest("[hidden]")) return "";
    return el.value?.trim() || "";
  };

  function validateHints() {
    if (!pgLevelRow?.hidden && hasPG() && !pgSelected()) {
      showHint(hintPG, "Bitte wählen Sie einen Pflegegrad.");
    } else {
      showHint(hintPG, "");
    }

    if (!wePanel?.hidden && isKK()) {
      if (!weDoneSelected()) {
        showHint(hintWE, "Bitte wählen Sie Ja oder Nein.");
      } else {
        showHint(hintWE, "");
      }
    } else {
      showHint(hintWE, "");
    }

    if (!wePanel?.hidden && isKK()) {
      if (!weAppSelected()) {
        showHint(hintApp, "Bitte wählen Sie, wer den Antrag stellt.");
      } else {
        showHint(hintApp, "");
      }
    } else {
      showHint(hintApp, "");
    }

    if (!weAmountRow?.hidden && isKK() && weDoneYes()) {
      const v = amtVal();
      if (!v) {
        showHint(hintAmt, "Bitte geben Sie den Betrag an.");
      } else {
        showHint(hintAmt, "");
      }
    } else {
      showHint(hintAmt, "");
    }
  }

  validateHints();
  form.addEventListener("change", validateHints);
  form.addEventListener("input", validateHints);

  window.__bereichFocusFirstError__ = function () {
    if (!pgLevelRow?.hidden && hasPG() && !pgSelected()) {
      pgLevelRow.scrollIntoView({ behavior: "smooth", block: "center" });
      const first = pgLevelRow.querySelector('input[type="radio"]');
      first?.focus();
      return true;
    }
    if (isKK() && !weDoneSelected()) {
      weDoneGroup?.scrollIntoView({ behavior: "smooth", block: "center" });
      const first = weDoneGroup?.querySelector('input[type="radio"]');
      first?.focus();
      return true;
    }
    if (isKK() && weDoneYes() && !amtVal()) {
      const amt = document.getElementById("wohnumfeldAmount");
      amt?.scrollIntoView({ behavior: "smooth", block: "center" });
      amt?.focus();
      return true;
    }
    if (isKK() && !weAppSelected()) {
      weAppGroup?.scrollIntoView({ behavior: "smooth", block: "center" });
      const first = weAppGroup?.querySelector('input[type="radio"]');
      first?.focus();
      return true;
    }
    return false;
  };
})();

/* ========== DUSCHWANNE DEFAULTS ========== */
(function initDuschwanneDefaults() {
  const f = document.getElementById("form-duschwanne");
  if (!f) return;
  const deps = ["abdichtSet", "drainSet", "stelzlager", "#smallMaterial"];
  f.querySelectorAll('input[name="traySize"]').forEach((r) => {
    r.addEventListener("change", () => {
      deps.forEach((sel) => {
        const i = sel.startsWith("#")
          ? f.querySelector(sel)
          : f.querySelector(`input[name="${sel}"]`);
        if (i) {
          i.checked = true;
          highlightTileForInput(i, true);
        }
      });
    });
  });
})();

/* ========== PRICE FETCH (single endpoint) ========== */
const productCache = new Map();
async function getProduct(id) {
  if (!id) return null;
  if (productCache.has(id)) return productCache.get(id);
  try {
    const res = await fetch(`/api/products/${encodeURIComponent(id)}`);
    if (!res.ok) throw new Error(res.status);
    const p = await res.json();
    productCache.set(id, p);
    return p;
  } catch (e) {
    console.warn("Product fetch failed for", id, e);
    productCache.set(id, null);
    return null;
  }
}

/* ========== FLOORING: LIVE PREVIEW + DB PRICES (adhesive/sealing) ==========
   NOTE: panels price now mirrors SERVER pricing; no client re-calculation. */
(function initFlooringSection() {
  const f = document.getElementById("form-duschwanne");
  if (!f) return;
  const toggle = document.getElementById("addFlooring");
  const panel = document.getElementById("flooringPanel");
  const area = document.getElementById("floorArea");

  const tileAdh = document.getElementById("tile_V4FK600");
  const tileSeal = document.getElementById("tile_TRBDSET7");

  const adhesivePriceEl = document.getElementById("floorAdhesivePrice");
  const sealingPriceEl = document.getElementById("floorSealingPrice");
  const panelsPriceEl = document.getElementById("flooringPanelsPrice");
  // ⬇️ NEW little fields we’ll fill
  const panelsQtyEl   = document.getElementById("floorPanelsQty");
  const panelsUnitEl  = document.getElementById("floorPanelsUnit");
   //const individPriceEl = document.getElementById("floorIndividPrice");

  const liveAdh = document.getElementById("adhesiveLivePreview");
  const liveSeal = document.getElementById("sealingLivePreview");

  function show(el, on) {
    if (el) {
      el.hidden = !on;
      el.setAttribute("aria-hidden", on ? "false" : "true");
    }
  }
  function setReq(el, on) {
    if (!el) return;
    on
      ? el.setAttribute("required", "required")
      : el.removeAttribute("required");
  }
  function parseArea() {
    const v = (area?.value || "").replace(",", ".");
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }
  const packsForAdhesive = (m2) => Math.ceil(m2 / 0.6 - 1e-12);
  const setsForSealing = (m2) => (m2 > 0 ? 1 : 0);

  const computed = {
    areaM2: 0,
    adhesive: { productId: "V4FK600", packs: 0, unit: 0, total: 0 },
    sealing: { productId: "TRBDSET7", sets: 0, unit: 0, total: 0 },
  };
  window.__DW_COMPUTED__ = computed;

  let unitAdh = 0,
    unitSeal = 0;
    let unitPanel = 0;

  async function ensureUnits() {
    if (!unitAdh) {
      const p = await getProduct("V4FK600");
      unitAdh = Number(p?.price || 0);
    }
    if (!unitSeal) {
      const p = await getProduct("TRBDSET7");
      unitSeal = Number(p?.price || 0);
    }
     if (!unitPanel) { // NEW: fetch V5FB02 once
      const p = await getProduct("V5FB02");
      unitPanel = Number(p?.price || 0);
    }
  }
  const euro = (n) =>
    (Number(n) || 0).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // function updateIndividPrice() {
    // if (!individPriceEl) return;
    // const m2 = parseArea();                // user-entered m² (no +15% here)
   //  const total = (unitPanel || 0) * m2;   // as requested: unit DB price × surface
   //  individPriceEl.textContent = euro(total);
  // }
// Mirrors SERVER truth for panels (quantity, unit, total) — set it ONLY here
  function updateFlooringPanelsPriceFromPricing() {
    if (!window.__pricing || !Array.isArray(window.__pricing?.materials?.lines)) {
      if (panelsPriceEl) panelsPriceEl.textContent = "0";
      if (panelsQtyEl)   panelsQtyEl.textContent   = "0";
      if (panelsUnitEl)  panelsUnitEl.textContent  = "0";
      return;
    }
    const line = window.__pricing.materials.lines.find(l => (l.productId || l.id) === "V5FB02" && !String(l.label || '').includes('individ.')); 
    // ^ pick the *panels* line; ignore the "individ." line we’ll add on the server

    if (!line) {
      if (panelsPriceEl) panelsPriceEl.textContent = "0";
      if (panelsQtyEl)   panelsQtyEl.textContent   = "0";
      if (panelsUnitEl)  panelsUnitEl.textContent  = "0";
      return;
    }
    if (panelsQtyEl)   panelsQtyEl.textContent   = String(line.qty ?? 0);
    if (panelsUnitEl)  panelsUnitEl.textContent  = euro(line.unitPrice ?? 0);
    if (panelsPriceEl) panelsPriceEl.textContent = euro(line.lineTotal ?? 0);
  }
  window.updateFlooringPanelsPriceFromPricing = updateFlooringPanelsPriceFromPricing;

  function updateUI() {
    const m2 = parseArea();
    computed.areaM2 = m2;

    // Adhesive
    const packs = m2 ? packsForAdhesive(m2) : 0;
    const totalA = packs * unitAdh;
    if (liveAdh)
      liveAdh.textContent = packs
        ? `= ${packs} Pkg bei ${area.value.trim()} m²`
        : "";
    if (adhesivePriceEl)
      adhesivePriceEl.textContent = packs ? euro(totalA) : "0";
    computed.adhesive = {
      productId: "V4FK600",
      packs,
      unit: unitAdh,
      total: +totalA.toFixed(2),
    };

    // Sealing
    // Sealing (proportional per m² with +15% waste, priced from TRBDSET7 / 7)
 const sealingSelected = !!f.querySelector('input[name="floorSealing[]"]:checked');

if (sealingSelected && m2 > 0) {
  const effM2 = m2 * 1.15;                 // +15% Verschnitt
  const ratePerM2 = unitSeal ? unitSeal / 7 : 0;
  const totalS = effM2 * ratePerM2;

  if (liveSeal) {
    liveSeal.textContent = `= ${effM2.toFixed(2)} m² (inkl. 15% Verschnitt)`;
  }
  if (sealingPriceEl) {
    sealingPriceEl.textContent = euro(totalS);
  }

  computed.sealing = {
    productId: "TRBDSET7",
    effM2: +effM2.toFixed(2),
    ratePerM2: +ratePerM2.toFixed(2),
    unitSet: unitSeal, // 7 m² Setpreis
    total: +totalS.toFixed(2),
  };
} else {
  if (liveSeal) liveSeal.textContent = "";
  if (sealingPriceEl) sealingPriceEl.textContent = "0";
  computed.sealing = {
    productId: "TRBDSET7",
    effM2: 0,
    ratePerM2: 0,
    unitSet: unitSeal || 0,
    total: 0,
  };
}


    // Panels price mirrors SERVER (pricing.js). Do not compute here.
    updateFlooringPanelsPriceFromPricing();
    // individ. price (unitPanel × entered m²)
   // updateIndividPrice();
  }

  // ---- persistence for area field
  const AREA_KEY = "dw_floor_area";
  try {
    if (area && !String(area.value || "").trim()) {
      const saved = localStorage.getItem(AREA_KEY);
      if (saved) area.value = saved;
    }
  } catch {}

  async function init() {
    await ensureUnits();
    updateUI();
  }
// Recompute sealing price whenever the sealing tile is toggled
f.querySelectorAll('input[name="floorSealing[]"]').forEach(cb => {
  cb.addEventListener('change', () => {
    ensureUnits().then(updateUI);   // refresh "= … m²" hint + price
    window.updatePricing?.();       // keep server totals in sync
  });
});
  function apply() {
    const on = !!toggle?.checked;
    show(panel, on);
    setReq(area, on);
    if (on) {
      // auto-check tiles when enabled
// Auto-check panels + adhesive ONLY if user hasn't chosen yet
const anyProd = f.querySelector('input[name="flooringProduct[]"]:checked');
if (!anyProd) {
  f.querySelectorAll('input[name="flooringProduct[]"]').forEach((i) => {
    i.checked = true;
    highlightTileForInput(i, true);
  });
}
const anyAdh = f.querySelector('input[name="floorAdhesive[]"]:checked');
if (!anyAdh) {
  f.querySelectorAll('input[name="floorAdhesive[]"]').forEach((i) => {
    i.checked = true;
    highlightTileForInput(i, true);
  });
}
// DO NOT touch floorSealing[] here — user controls it




      init();
    } else {
      if (area) area.value = "";
      try {
        localStorage.removeItem(AREA_KEY);
      } catch {}
      f.querySelectorAll(
        'input[name="flooringProduct[]"],input[name="floorAdhesive[]"],input[name="floorSealing[]"]'
      ).forEach((i) => {
        i.checked = false;
        highlightTileForInput(i, false);
      });
      if (liveAdh) liveAdh.textContent = "";
      if (liveSeal) liveSeal.textContent = "";
      if (adhesivePriceEl) adhesivePriceEl.textContent = "0";
      if (sealingPriceEl) sealingPriceEl.textContent = "0";
      if (panelsPriceEl) panelsPriceEl.textContent = "0";
      unitAdh = unitSeal = 0;
      computed.areaM2 = 0;
      computed.adhesive = { productId: "V4FK600", packs: 0, unit: 0, total: 0 };
      computed.sealing = { productId: "TRBDSET7", sets: 0, unit: 0, total: 0 };
    }
    // Keep totals in sync with server
    window.updatePricing?.();
  }

  toggle?.addEventListener("change", apply);

  area?.addEventListener("input", () => {
    try {
      localStorage.setItem(AREA_KEY, area.value);
    } catch {}
    ensureUnits().then(updateUI);
    window.updatePricing?.();
  });
 // run once so a pre-checked toggle shows its panel
  (async () => { await ensureUnits(); updateUI(); })();
  // initial tile highlight
  f.querySelectorAll('label.image-check > input[type="checkbox"]').forEach(
    (cb) => {
      cb.addEventListener("change", () =>
        highlightTileForInput(cb, cb.checked)
      );
      highlightTileForInput(cb, cb.checked);
    }
  );

  // --- Optional: persist TRINNITY Bodenabdichtung selection ---
  const SEAL_KEY = 'dw_floor_sealing';
  f.querySelectorAll('input[name="floorSealing[]"]').forEach(cb => {
    cb.addEventListener('change', () => {
      const any = !!f.querySelector('input[name="floorSealing[]"]:checked');
      try { localStorage.setItem(SEAL_KEY, any ? '1' : '0'); } catch {}
    });
  });
  try {
    const saved = localStorage.getItem(SEAL_KEY);
    if (saved === '1') {
      f.querySelectorAll('input[name="floorSealing[]"]').forEach(i => {
        i.checked = true;
        highlightTileForInput(i, true);
      });
    }
  } catch {}
  // --- end optional persistence ---

  // run once so a pre-checked toggle shows its panel
  apply();

  // When coming back to Duschwanne, re-apply and refresh from server pricing
  window.addEventListener("hashchange", () => {
    if (
      typeof getCurrentStep === "function" &&
      getCurrentStep() === "duschwanne"
    ) {
      apply();
      if (toggle?.checked) ensureUnits().then(updateUI);
      if (window.__pricing) updateFlooringPanelsPriceFromPricing();
      else window.updatePricing?.();
    }
  });

  // Update panel price when pricing is refreshed
 window.addEventListener("pricing:updated", () => {
  updateFlooringPanelsPriceFromPricing();
});
})();



/* ========== SMART TRAY SEARCH (equal-or-bigger filter, persist/deselect) ========== */
function initSmartTraySearch() {
  // ----- DOM -----
  const elB = document.querySelector('input[name="tray_w_cm"]'); // Breite
  const elL = document.querySelector('input[name="tray_l_cm"]'); // Länge
  const elH = document.querySelector('input[name="tray_h_cm"]'); // Höhe
  const out = document.getElementById('tray-suggestions');
  const hiddenId = document.getElementById('chosenTrayProductId');
  const hiddenSize = document.getElementById('traySize');

  if (!out || (!elB && !elL && !elH)) {
    console.warn('initSmartTraySearch: missing inputs or #tray-suggestions');
    return;
  }

  // ----- helpers -----
  
  const parseNum = (v) => {
  if (v == null) return null;
  const raw = String(v).trim();
  if (raw === '') return null;                     // <-- key line
  const s = raw.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return n > 0 ? n : null;                         // ignore 0 or negatives
};
  const makeLabel = (w, l, h) => (w && l && h ? `${w} x ${l} x ${h} cm` : '');

  const applySelectedStyles = () => {
    const cards = Array.from(out.querySelectorAll('.suggestion-card'));
    const checked = out.querySelector('input[name="traySuggestion"]:checked');
    cards.forEach(card => {
      const input = card.querySelector('input[name="traySuggestion"]');
      card.classList.toggle('is-selected', checked && input === checked);
    });
  };

  const persistSelection = (productId, label) => {
    try {
      localStorage.setItem('dw_tray_selection', JSON.stringify({ productId, value: label }));
    } catch {}
  };

  const applySelection = (inputEl) => {
    if (!inputEl) return;
    try { sessionStorage.setItem('dw_tray_touched', '1'); } catch {}
    const pid = inputEl.value || '';
    const w = Number(inputEl.dataset.w) || null;
    const l = Number(inputEl.dataset.l) || null;
    const h = Number(inputEl.dataset.h) || null;

    const label = makeLabel(w, l, h);
    if (hiddenId)   hiddenId.value = pid;
    if (hiddenSize) hiddenSize.value = label;

    persistSelection(pid, label);
    applySelectedStyles();
  };

  const updateTraySizeFromInputs = () => {
    if (!hiddenSize) return;
    const b = elB?.value?.trim();
    const l = elL?.value?.trim();
    const h = elH?.value?.trim();
    hiddenSize.value = (b && l && h) ? `${b} x ${l} x ${h} cm` : '';
  };

  // ----- render -----
  function renderSuggestions(list) {
    if (!Array.isArray(list) || list.length === 0) {
      out.innerHTML = `<div class="meta">Keine passenden Vorschläge gefunden.</div>`;
      applySelectedStyles();
      return;
    }

    // Only restore a saved PID if the user actually chose in THIS session
    const allowAutoCheck = sessionStorage.getItem('dw_tray_touched') === '1';
    let savedPid = null;
    try {
      const saved = JSON.parse(localStorage.getItem('dw_tray_selection') || 'null');
      savedPid = saved?.productId || null;
    } catch {}

    const top = list.slice(0, 3);
    const savedIndex = (allowAutoCheck && savedPid)
      ? top.findIndex(p => p.productId === savedPid)
      : -1;

    const radios = top.map((p, i) => {
      const id = `tray-suggest-${i}`;
      const dims = `${p.widthCm} × ${p.lengthCm} × ${p.heightCm} cm`;
      const price = (p.price != null) ? ` — ${Number(p.price).toFixed(2)} €` : '';
      const title = p.name || p.productId || 'Duschwanne';
      const value = p.productId || '';
      const checkedAttr = (i === savedIndex) ? 'checked' : '';

      return `
        <label class="suggestion-card" for="${id}">
          <input type="radio"
                 id="${id}"
                 name="traySuggestion"
                 value="${value}"
                 data-w="${p.widthCm || ''}"
                 data-l="${p.lengthCm || ''}"
                 data-h="${p.heightCm || ''}"
                 ${checkedAttr} />
          <div class="info">
            <div class="title">${title}</div>
            <div class="meta">${dims}${price}</div>
          </div>
        </label>
      `;
    }).join('');

    out.innerHTML = `
      <div class="suggestion-heading">Vorschläge</div>
      <div class="suggestion-list">${radios}</div>
    `;

    if (savedIndex >= 0) {
      const restored = out.querySelectorAll('input[name="traySuggestion"]')[savedIndex];
      applySelection(restored);
    }

    // (Re)bind change once per render (fine if multiple; idempotent behavior)
    out.addEventListener('change', (e) => {
      if (e.target && e.target.name === 'traySuggestion') {
        applySelection(e.target);
      }
    });

    applySelectedStyles();
  }

  // ----- fetch logic (progressive) with abort + anti-stale guard -----
  let inflight = null;
  let reqSeq = 0; // monotonically increasing sequence to ignore late responses
  let debounceT = null;

  async function fetchAndRender() {
    const b = elB ? parseNum(elB.value) : null;
    const l = elL ? parseNum(elL.value) : null;
    const h = elH ? parseNum(elH.value) : null;

    // If nothing typed → clear everything and ensure no stale results repaint
    if (b === null && l === null && h === null) {
      out.innerHTML = '';
      if (hiddenId)   hiddenId.value = '';
      if (hiddenSize) hiddenSize.value = '';
      try { sessionStorage.removeItem('dw_tray_touched'); } catch {}
      // Cancel any in-flight request and bump sequence so its response is ignored
      try { inflight?.abort?.(); } catch {}
      reqSeq++;
      return;
    }

    const qs = new URLSearchParams();
    if (b !== null) qs.set('w', String(b));
    if (l !== null) qs.set('l', String(l));
    if (h !== null) qs.set('h', String(h));
    const url = `/api/trays/suggest?${qs.toString()}`;

    try { inflight?.abort?.(); } catch {}
    inflight = new AbortController();
    const mySeq = ++reqSeq;

    out.innerHTML = `<div class="meta">Suche… <code>${url}</code></div>`;

    try {
      const r = await fetch(url, { signal: inflight.signal, credentials: 'include' });
      const text = await r.text();
      if (mySeq !== reqSeq) return; // stale response, ignore
      if (!r.ok) {
        out.innerHTML = `<div class="text-sm text-destructive">Fehler ${r.status}</div><pre class="text-xs">${text}</pre>`;
        return;
      }
      const data = JSON.parse(text);
      const list = Array.isArray(data?.results) ? data.results : [];
      renderSuggestions(list);
    } catch (err) {
      if (err.name === 'AbortError') return;
      console.error('Smart tray search failed:', err);
      if (mySeq !== reqSeq) return; // ignore stale error
      out.innerHTML = `<div class="text-sm text-destructive">Netzwerkfehler</div><pre class="text-xs">${String(err)}</pre>`;
    }
  }

  const request = () => { clearTimeout(debounceT); debounceT = setTimeout(fetchAndRender, 160); };

  [elB, elL, elH].forEach(el => {
    if (!el) return;
    el.addEventListener('input', () => {
      // Do NOT set dw_tray_touched here. Only on actual suggestion pick.
      if (hiddenId) hiddenId.value = '';
      updateTraySizeFromInputs();
      request();
    });
    el.addEventListener('change', () => {
      if (hiddenId) hiddenId.value = '';
      request();
    });
  });

  // Initial kick (will early-return with empty inputs)
  updateTraySizeFromInputs();
  request();

  window.__smartTray = { fetchAndRender };
}




function initTraySizeAutoLabel() {
  const traySizeEl = document.getElementById('traySize');
  const wEl = document.querySelector('input[name="tray_w_cm"]');
  const lEl = document.querySelector('input[name="tray_l_cm"]');
  const hEl = document.querySelector('input[name="tray_h_cm"]');

  if (!traySizeEl || (!wEl && !lEl && !hEl)) return;

  const updateTraySizeFromInputs = () => {
    const b = wEl?.value?.trim();
    const l = lEl?.value?.trim();
    const h = hEl?.value?.trim();
    traySizeEl.value = (b && l && h) ? `${b} x ${l} x ${h} cm` : '';
  };

  // keep it updated while typing
  [wEl, lEl, hEl].forEach(el => el && el.addEventListener('input', updateTraySizeFromInputs));

  // set initial value if fields are prefilled
  updateTraySizeFromInputs();

  // expose in case you want to call it from elsewhere
  window.updateTraySizeFromInputs = updateTraySizeFromInputs;
}

function attachDuschwanneToPayload(payload) {
  const pid  = document.getElementById('chosenTrayProductId')?.value || null;
  const size = document.getElementById('traySize')?.value || '';

  // pricing.js expects these nested under payload.duschwanne.*
  payload.duschwanne = payload.duschwanne || {};
  payload.duschwanne.chosenTrayProductId = pid;
  payload.duschwanne.traySize = size;

  return payload;
}

/* ========== GLOBAL PRICING SERVICE (fetch -> cache -> event) ========== */
(() => {
  async function fetchPrice(payload) {
    const r = await fetch("/api/price", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  }

  window.__pricing = null;

  window.updatePricing = async function updatePricing(payload) {
    const pl =
      payload ??
      (typeof window.buildPayload === "function"
        ? window.buildPayload()
        : null);
    if (!pl) {
      console.warn("[pricing] No payload available");
      return null;
    }

    const data = await fetchPrice(pl);
    window.__pricing = data;

    // Update Rabatt panel immediately
    window.setPricingData?.(data);

    // Notify listeners (Kosten, flooring panels span, etc.)
    window.dispatchEvent(new CustomEvent("pricing:updated", { detail: data }));
    return data;
  };

  // Compute once on load so Rabatt has values and spans have data
  document.addEventListener("DOMContentLoaded", () => {
    window
      .updatePricing?.()
      .catch((err) => console.warn("[pricing] initial update failed:", err));
  });

  // If user jumps straight to Rabatt and no pricing yet
  window.addEventListener("hashchange", () => {
    if (
      typeof window.getCurrentStep === "function" &&
      window.getCurrentStep() === "rabatt" &&
      !window.__pricing
    ) {
      window.updatePricing?.();
    }
  });
})();

// Recompute when payer/aufschlag changes (keeps Rabatt in sync)
document
  .querySelectorAll('input[name="payer"], input[name="aufschlag"]')
  .forEach((el) =>
    el.addEventListener("change", () => window.updatePricing?.())
  );

/* ========== Kosten Duschabtrennung========== */


/* ========== KOSTEN-DETAILS (render from __pricing only) ========== */
(function initKostenDetails() {
  const container = document.getElementById("costsSummary");
  if (!container) return;

  function euroC(n) {
    return new Intl.NumberFormat("de-DE", {
      style: "currency",
      currency: "EUR",
    }).format(Number(n || 0));
  }

  function card(title, bodyHTML, footerHTML = "") {
    return `
      <div class="card" style="padding:12px;">
        <div style="font-weight:700; margin-bottom:8px;">${title}</div>
        <div>${bodyHTML}</div>
        ${
          footerHTML
            ? `<div style="border-top:1px solid var(--border); margin-top:8px; padding-top:8px;">${footerHTML}</div>`
            : ""
        }
      </div>
    `;
  }

function listLines(lines) {
  if (!Array.isArray(lines) || !lines.length)
    return '<div class="muted">Keine Positionen</div>';

  const header = `
    <div style="font-size:12px;color:var(--muted)">Bezeichnung</div>
    <div style="font-size:12px;color:var(--muted);text-align:right">Menge</div>
    <div style="font-size:12px;color:var(--muted);text-align:right">Einzelpreis</div>
    <div style="font-size:12px;color:var(--muted);text-align:right">Gesamt</div>
  `;

  const rows = lines.map(l => {
    if (l.__subtitle) {
      return `<div style="grid-column:1 / -1; font-weight:700; margin:8px 0 2px;">${l.label}</div>`;
    }
    return `
      <div>${l.label ? l.label : l.name || l.productId || "-"}</div>
      <div style="text-align:right">${l.qty ?? 1}</div>
      <div style="text-align:right">${euroC(l.unitPrice ?? 0)}</div>
      <div style="text-align:right; font-weight:600">${euroC(l.lineTotal ?? 0)}</div>
    `;
  }).join('');

  return `
    <div style="display:grid; grid-template-columns: 1fr auto auto auto; gap:6px 10px; align-items:center;">
      ${header}
      ${rows}
    </div>
  `;
}


  // --- NEW: resolve DB names for optional items (by productId)
  async function withResolvedOptionalNames(items) {
    if (!Array.isArray(items) || !items.length) return [];
    const result = await Promise.all(
      items.map(async (i) => {
        const pid = i.productId || i.id || "";
        let name = i.name || ""; // server might already send a name (keep if present)
        if (!name && pid) {
          try {
            const p = await getProduct(pid);          // <- uses your existing cache + /api/products/:id
            if (p?.name) name = p.name;
          } catch {}
        }
        // Fallbacks: keep label if present, else pid
        if (!name) name = i.label || pid || "-";
        return { ...i, name };
      })
    );
    return result;
  }

  // Make this async so we can await name lookups for optional items
async function renderFromData(data) {
  if (!data) {
    container.innerHTML = '<div class="muted">Keine Daten</div>';
    return;
  }

  // --- Optional (Debug): use optionalDisplayUI if present, else fallback to items
  const optLines = (data.optionalDisplayUI && Array.isArray(data.optionalDisplayUI.lines))
    ? data.optionalDisplayUI.lines
    : ((data.items || []).map(i => ({
        productId: i.productId,
        name: i.productId,
        qty: i.qty,
        unitPrice: i.unitPrice,
        lineTotal: i.lineTotal,
      })));
  const optBody = listLines(optLines);
  // const optSum = (data.optionalDisplayUI && typeof data.optionalDisplayUI.sum === 'number')
  const optSum = data.optionalDisplayUI?.sum ?? 0;
   //  ? data.optionalDisplayUI.sum
   //  : (optLines.reduce((a, x) => a + (x.lineTotal || 0), 0));
  const optCard = card(
    "Optional gewählte Produkte",
    optBody,
    `<div style="text-align:right"><b>Summe:</b> ${euroC(optSum)}</div>`
  );

  // --- Material (Debug): show only non-optional UI lines
  const matLines = (data.materialsDisplayUI && Array.isArray(data.materialsDisplayUI.lines))
    ? data.materialsDisplayUI.lines
    : ((data.materials && Array.isArray(data.materials.lines)) ? data.materials.lines : []);
  const matBody = listLines(matLines.map(l => ({
    productId: l.productId || l.id,
    name: l.name,
    qty: l.qty,
    unitPrice: l.unitPrice,
    lineTotal: l.lineTotal,
    label: l.label,
  })));
  const mat = (data.materialsDisplayUI?.lines || data.materials?.lines || []);
  const matSum = data.materialsDisplayUI?.sum ?? data.materials?.sum ?? 0;

// Optional (Debug): ONLY optional
const opt = (data.optionalDisplayUI?.lines || []);

  //const matSum = (data.materialsDisplayUI && typeof data.materialsDisplayUI.sum === 'number')
  //  ? data.materialsDisplayUI.sum
  //  : (data.materials?.sum || 0);
  const matCard = card(
    (data.materials && data.materials.title) || "Material für Badumbau",
    matBody,
    `<div style="text-align:right"><b>Summe Material:</b> ${euroC(matSum)}</div>`
  );

  // --- Leistungen (Debug): use servicesDisplayUI if present
// --- Leistungen split into two groups with a tiny whitelist
const svcSource = (data.servicesDisplayUI?.lines || data.services?.lines || []);

const primarySvc = [];
const includedSvc = [];

for (const s of svcSource) {
  if (!s) continue;
  const label = String(s.label || '').trim();
  const plain = label.replace(/^\s*-\s*/, '');

  const goesIncluded =
    /fahrzeugbereitstellung/i.test(plain) ||
    /bereitstellung.*werkzeug/i.test(plain) ||
    /beräumung der baustelle/i.test(plain) ||
    /kilometerpauschale/i.test(plain) ||
     /facharbeiter/i.test(plain);  

     const laborRate = Number(data?.services?.laborRate || 0);

// when building the Facharbeiter row:
const isFacharbeiter = (s.key === 'facharbeiter') || /facharbeiter/i.test(s.label || '');
  const row = {
    productId: s.key || s.productId,
    label: label || s.name || s.productId || '-',
    qty: 1,
    unitPrice: isFacharbeiter && laborRate ? laborRate : (s.amount ?? 0),
    lineTotal: s.amount,
  };

  (goesIncluded ? includedSvc : primarySvc).push(row);
}

const svcBodyPrimary  = listLines(primarySvc);
const svcBodyIncluded = listLines(includedSvc);

const svcCard = `
  ${card((data.services?.title || 'Auszuführende Arbeiten'), svcBodyPrimary)}
  <div style="height:8px"></div>
  ${card('Enthält je Einheit', svcBodyIncluded, `<div style="text-align:right"><b>Summe Leistungen:</b> ${euroC(data.services?.sum || 0)}</div>`)}
`;



  // --- Totals (unchanged)
  const sums = `
    <div style="display:flex; flex-direction:column; gap:6px; align-items:flex-end;">
      <div>Produkte + Material: <b>${euroC(data.productsSubtotal || 0)}</b></div>
      <div>Leistungen: <b>${euroC(data.services?.sum || 0)}</b></div>
      <div>Aufschlag (${Math.round((data.markupPct || 0) * 100)}%): <b>${euroC(data.markup || 0)}</b></div>
      <div style="font-size:1.05rem;">Zwischensumme (Netto): <b>${euroC(data.netAfterRabatt_and_Bonus || 0)}</b></div>
      <div style="font-size:1.2rem;">Gesamt: <b>${euroC(data.total || 0)}</b></div>
    </div>
  `;
  const totalsCard = card("Summen", sums);

  // --- Show/hide "Haltegriff gratis" checkbox based on CLPESG40 presence
 (function () {
  const bonusGrab = document.getElementById('rb-bonus-grab');
  if (!bonusGrab) return;

  // authoritative source from server:
  const cl40 = Number(data?.grabCounts?.cl40 || 0);
  const shouldShow = cl40 > 0;

  const row = bonusGrab.closest('.form-row') || bonusGrab.closest('label') || bonusGrab.parentElement;
  if (shouldShow) {
    if (row) row.style.display = '';
    bonusGrab.disabled = false;
  } else {
    if (row) row.style.display = 'none';
    if (bonusGrab.checked) {
      bonusGrab.checked = false;
      bonusGrab.dispatchEvent(new Event('change', { bubbles: true }));
    }
    bonusGrab.disabled = true;
  }
})();


  container.innerHTML = [matCard, optCard, svcCard, totalsCard].join("");
}


function refreshAllPanels() {
  const payload = collectAllFormData();
  fetch('/api/price', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  .then(r => r.json())
  .then(data => {
    lastComputed = data;
    // Rabatt
    if (typeof renderRabatt === 'function') {
      renderRabatt(data);
    } else if (typeof window.setPricingData === 'function') {
      window.setPricingData(data);
    }
    // Kosten-Details
    if (typeof renderFromData === 'function') {
      renderFromData(data);
    }
  })
  .catch(console.error);
}


  async function openKosten() {
    container.innerHTML = '<div class="muted">Berechne …</div>';
    if (window.__pricing) {
      await renderFromData(window.__pricing); // await async renderer
    } else {
      await window.updatePricing?.();
      await renderFromData(window.__pricing);
    }
  }

  window.addEventListener("hashchange", () => {
    if (getCurrentStep() === "kosten") openKosten();
  });
  if (getCurrentStep() === "kosten") openKosten();

  window.addEventListener("pricing:updated", async (ev) => {
    if (getCurrentStep() === "kosten") {
      await renderFromData(ev.detail || window.__pricing);
    }
  });
})();

// === Pricing Playground ===
(function initPricingPlayground() {
  const page = document.getElementById('page-playground');
  if (!page) return;

  // Elements
  const selScenario = document.getElementById('pg-scenario');
  const payerRadios = Array.from(document.querySelectorAll('input[name="pg-payer"]'));
  const aufRadios   = Array.from(document.querySelectorAll('input[name="pg-auf"]'));
  const hasPgCB     = document.getElementById('pg-has-pg');
  const pgLvlWrap   = document.getElementById('pg-pg-lvl');
  const pgLvlRadios = Array.from(document.querySelectorAll('input[name="pg-lvl"]'));
  const budgetMax   = document.getElementById('pg-budget-max');
  const budgetCopay = document.getElementById('pg-budget-copay');
  const copayAmount = document.getElementById('pg-copay-amount');
  const twoPersons  = document.getElementById('pg-two-persons');
  const weDoneCB    = document.getElementById('pg-wohnumfeld-done');
  const weAmount    = document.getElementById('pg-wohnumfeld-amount');

  const discRange   = document.getElementById('pg-material-discount');
  const discVal     = document.getElementById('pg-material-discount-val');
  const bonus300    = document.getElementById('pg-bonus-300');
  const bonusGrab   = document.getElementById('pg-bonus-grab');

  const inputPid    = document.getElementById('pg-product-id');
  const inputQty    = document.getElementById('pg-product-qty');
  const btnAddProd  = document.getElementById('pg-add-product');
  const listProds   = document.getElementById('pg-products-list');
  const datalist    = document.getElementById('pg-products-datalist');

  const btnRun      = document.getElementById('pg-run');
  const btnApply    = document.getElementById('pg-apply');
  const btnClear    = document.getElementById('pg-clear');
  const btnOpenRab  = document.getElementById('pg-open-rabatt');
  const btnOpenKos  = document.getElementById('pg-open-kosten');

  const outPayload  = document.getElementById('pg-payload');
  const outResp     = document.getElementById('pg-response');
  const outDiff     = document.getElementById('pg-diff');

  let pgProducts = []; // [{productId, qty}]
  let lastResponse = null;

  function euro(n) { return (Number(n)||0).toLocaleString('de-DE', {minimumFractionDigits:2, maximumFractionDigits:2}); }

  function show(el, on) {
    if (!el) return;
    el.hidden = !on;
    el.setAttribute('aria-hidden', String(!on));
  }

  // Load SLA datalist for convenience
  async function loadSLA() {
    try {
      const r = await fetch('/api/products/sla');
      if (!r.ok) return;
      const arr = await r.json();
      datalist.innerHTML = arr.map(p => `<option value="${p.productId}">${(p.name||'').replace(/"/g,'&quot;')}</option>`).join('');
    } catch {}
  }
  loadSLA();

  function renderProdList() {
    if (!pgProducts.length) {
      listProds.textContent = 'Noch keine Produkte hinzugefügt.';
      return;
    }
    const rows = pgProducts.map((p, i) => {
      return `<div style="display:flex; align-items:center; gap:8px; border-bottom:1px dashed var(--border); padding:4px 0;">
        <code>${p.productId}</code>
        <span class="muted">×</span>
        <input type="number" min="1" step="1" value="${p.qty}" data-i="${i}" class="pg-qty" style="max-width:80px;">
        <button type="button" data-i="${i}" class="pg-del secondary">Entfernen</button>
      </div>`;
    }).join('');
    listProds.innerHTML = rows || '—';
  }

  listProds.addEventListener('input', e => {
    const n = e.target.closest('.pg-qty');
    if (!n) return;
    const i = Number(n.dataset.i);
    const v = Math.max(1, Number(n.value)||1);
    if (pgProducts[i]) { pgProducts[i].qty = v; }
  });
  listProds.addEventListener('click', e => {
    const b = e.target.closest('.pg-del');
    if (!b) return;
    const i = Number(b.dataset.i);
    if (pgProducts[i]) pgProducts.splice(i,1);
    renderProdList();
  });

  btnAddProd.addEventListener('click', () => {
    const pid = (inputPid.value||'').trim();
    const qty = Math.max(1, Number(inputQty.value)||1);
    if (!pid) return;
    const found = pgProducts.find(p => p.productId === pid);
    if (found) found.qty += qty;
    else pgProducts.push({ productId: pid, qty });
    renderProdList();
    inputPid.value = '';
    inputQty.value = '1';
  });

  // Scenarios populate knobs
  selScenario.addEventListener('change', () => {
    const v = selScenario.value;
    // reset first
    payerRadios.forEach(r => r.checked = false);
    aufRadios.forEach(r => r.checked = false);
    hasPgCB.checked = false; show(pgLvlWrap, false);
    pgLvlRadios.forEach(r => r.checked = false);
    budgetMax.checked = budgetCopay.checked = twoPersons.checked = false;
    copayAmount.value = '';
    weDoneCB.checked = false; weAmount.value = '';
    discRange.value = '0'; discVal.textContent = '0.0%';
    bonus300.checked = false;
    bonusGrab.checked = false;

    if (v === 'KK_MAX4180') {
      checkRadio(payerRadios, 'Kassenkunde');
      checkRadio(aufRadios, '50%');
      hasPgCB.checked = true; show(pgLvlWrap, true); checkRadio(pgLvlRadios, '2');
      budgetMax.checked = true;
    } else if (v === 'KK_MIT_ZUZAHLUNG') {
      checkRadio(payerRadios, 'Kassenkunde');
      checkRadio(aufRadios, '50%');
      hasPgCB.checked = true; show(pgLvlWrap, true); checkRadio(pgLvlRadios, '2');
      budgetCopay.checked = true; copayAmount.value = '500';
    } else if (v === 'KK_2P_8360') {
      checkRadio(payerRadios, 'Kassenkunde');
      checkRadio(aufRadios, '50%');
      hasPgCB.checked = true; show(pgLvlWrap, true); checkRadio(pgLvlRadios, '2');
      twoPersons.checked = true;
    } else if (v === 'SZ_35') {
      checkRadio(payerRadios, 'Selbstzahler');
      checkRadio(aufRadios, '35%');
      hasPgCB.checked = false; show(pgLvlWrap, false);
    }
  });

  function checkRadio(radios, value) {
    const r = radios.find(x => x.value === value);
    if (r) r.checked = true;
  }

  hasPgCB.addEventListener('change', () => show(pgLvlWrap, hasPgCB.checked));
  discRange.addEventListener('input', () => {
    const v = parseFloat(discRange.value||'0')||0;
    discVal.textContent = v.toLocaleString('de-DE', {minimumFractionDigits:1, maximumFractionDigits:1}) + '%';
  });

  function makePlaygroundPayload() {
    // Start with current form payload
    const payload = buildPayload();

    // Apply playground overrides into payload.bereich / payload.rabatt
    payload.bereich = payload.bereich || {};

    // payer
    const payer = (payerRadios.find(r=>r.checked)?.value) || '';
    if (payer) payload.bereich.payer = payer;

    // aufschlag
    const auf = (aufRadios.find(r=>r.checked)?.value) || '';
    if (auf) payload.bereich.aufschlag = auf;

    // pflegegrad / budget
    const hasPG = hasPgCB.checked;
    if (hasPG) {
      payload.bereich.hasPflegegrad = 'Ja';
      const lvl = pgLvlRadios.find(r=>r.checked)?.value || '2';
      payload.bereich.pflegegrad = lvl;
    } else {
      payload.bereich.hasPflegegrad = 'Nein';
      payload.bereich.pflegegrad = '';
    }

    // budget options (canonical combined field used by server)
    let budget = '';
    if (twoPersons.checked) budget = 'Zwei Personen mit Pflegegrad';
    else if (budgetMax.checked) budget = '4180 maximal';
    else if (budgetCopay.checked) budget = '4180 mit Zuzahlung';
    payload.bereich.budgetOptionsPanel = budget;

    payload.bereich.copayAmount = Number(copayAmount.value || 0) || 0;

    // wohnumfeld
    payload.bereich.wohnumfeld = {
      done: !!weDoneCB.checked,
      amount: Number(weAmount.value || 0) || 0
    };

    // rabatt + bonus
    payload.rabatt = payload.rabatt || {};
    const pct = parseFloat(discRange.value || '0') || 0;
    payload.rabatt.materialDiscountPct = pct/100;
    payload.rabatt.bonus300 = !!bonus300.checked;
    payload.rabatt.bonusGrab = !!bonusGrab.checked;

    // inject products into optional as quantity keys (so collectSelections picks them up)
    // We’ll map productId -> qty into optional fields: opt_<PID> + qty_<PID>
    payload.optional = payload.optional || {};
    // wipe any previous ad-hoc test markers
    Object.keys(payload.optional).forEach(k => { if (k.startsWith('opt_adhoc_') || k.startsWith('qty_adhoc_')) delete payload.optional[k]; });

    pgProducts.forEach((p, i) => {
      // use an adhoc alias to avoid collisions with UI IDs
      const alias = `adhoc_${p.productId}`;
      payload.optional[`opt_${alias}`] = 'on';
      payload.optional[`qty_${alias}`] = String(p.qty);
      // tell collectSelections how to map alias -> productId (augment alias map)
      // we can’t modify server code, so we piggy-back by adding a hint field:
      // Server collectSelections ignores it, but we’ll replicate translating on client before POSTing.
    });

    // Translate adhoc_* → real product IDs before sending to server: we mimic the server’s collectSelections by building items array
    // Simpler: attach a materials list the server already consumes (computeMaterials uses only payload fields) — but we keep to optionals flow.
    // We’ll add a client-only array for server to ignore; just for payload preview.

    return payload;
  }

  async function runPricing(payload) {
    const r = await fetch('/api/price', {
      method:'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(payload),
    });
    const data = await r.json();
    return data;
  }

  function diffObjects(prev, curr, path = '') {
    const out = [];
    if (!prev && curr) return [`+ ${path||'/'} = ${JSON.stringify(curr)}`];
    if (prev && !curr) return [`- ${path||'/'} was ${JSON.stringify(prev)}`];

    if (typeof prev !== 'object' || typeof curr !== 'object' || prev === null || curr === null) {
      if (JSON.stringify(prev) !== JSON.stringify(curr)) out.push(`~ ${path||'/'}: ${JSON.stringify(prev)} → ${JSON.stringify(curr)}`);
      return out;
    }
    const keys = new Set([...Object.keys(prev||{}), ...Object.keys(curr||{})]);
    for (const k of keys) {
      const p = prev ? prev[k] : undefined;
      const c = curr ? curr[k] : undefined;
      const subPath = path ? `${path}.${k}` : k;
      out.push(...diffObjects(p, c, subPath));
    }
    return out;
  }

  btnRun.addEventListener('click', async () => {
    const payload = makePlaygroundPayload();
    outPayload.textContent = JSON.stringify(payload, null, 2);

    const data = await runPricing(payload);
    outResp.textContent = JSON.stringify(data, null, 2);

    const diff = diffObjects(lastResponse, data);
    outDiff.textContent = diff.length ? diff.join('\n') : '— keine Änderung —';
    lastResponse = data;

    // Update Rabatt pane immediately
    window.setPricingData?.(data);
    window.__pricing = data;
    window.dispatchEvent(new CustomEvent('pricing:updated', { detail: data }));
  });

  btnApply.addEventListener('click', () => {
    const payload = makePlaygroundPayload();
    // Project selected knobs back into the real forms
    // payer
    if (payload.bereich?.payer) {
      const r = document.querySelector(`input[name="payer"][value="${payload.bereich.payer}"]`);
      if (r) { r.checked = true; r.dispatchEvent(new Event('change', { bubbles:true })); }
    }
    // aufschlag
    if (payload.bereich?.aufschlag) {
      const r = document.querySelector(`input[name="aufschlag"][value="${payload.bereich.aufschlag}"]`);
      if (r) { r.checked = true; r.dispatchEvent(new Event('change', { bubbles:true })); }
    }
    // pflegegrad (just show/hide panels; exact mapping to Bereich panel already handled by initPflegegrad)
    if (payload.bereich?.hasPflegegrad === 'Ja') {
      const yes = document.querySelector('input[name="hasPflegegrad"][value="Ja"]');
      yes && (yes.checked = true, yes.dispatchEvent(new Event('change', { bubbles:true })));
      const lvl = payload.bereich?.pflegegrad || '';
      if (lvl) {
        const rl = document.querySelector(`input[name="pflegegrad"][value="${lvl}"]`);
        rl && (rl.checked = true, rl.dispatchEvent(new Event('change', { bubbles:true })));
      }
    } else {
      const no = document.querySelector('input[name="hasPflegegrad"][value="Nein"]');
      no && (no.checked = true, no.dispatchEvent(new Event('change', { bubbles:true })));
    }

    // budget options panel
    const b = String(payload.bereich?.budgetOptionsPanel||'').toUpperCase();
    const elMax  = document.querySelector('input[name="budgetMax"]');
    const elCop  = document.querySelector('input[name="budgetCopay"]');
    const elTwo  = document.querySelector('input[name="twoPersons"]');
    const copay  = document.getElementById('copayAmount');
    if (elMax) elMax.checked = /4180.*MAX/.test(b);
    if (elCop) elCop.checked = /4180.*ZUZ/.test(b);
    if (elTwo) elTwo.checked = /ZWEI.*PERSONEN|8360/.test(b);
    if (copay) copay.value = String(payload.bereich?.copayAmount||0);

    // woh num feld
    const weY = document.querySelector('input[name="wohnumfeldDone"][value="Ja"]');
    const weN = document.querySelector('input[name="wohnumfeldDone"][value="Nein"]');
    if (payload.bereich?.wohnumfeld?.done) {
      weY && (weY.checked = true, weY.dispatchEvent(new Event('change', {bubbles:true})));
      const amt = document.getElementById('wohnumfeldAmount');
      if (amt) amt.value = String(payload.bereich?.wohnumfeld?.amount||0);
    } else {
      weN && (weN.checked = true, weN.dispatchEvent(new Event('change', {bubbles:true})));
    }

    // rabatt fields
    const slider = document.getElementById('rb-material-discount');
    if (slider) {
      slider.value = String((payload.rabatt?.materialDiscountPct||0)*100);
      slider.dispatchEvent(new Event('input', { bubbles:true }));
      slider.dispatchEvent(new Event('change', { bubbles:true }));
    }
    const b300 = document.getElementById('rb-bonus-300');
    if (b300) { b300.checked = !!payload.rabatt?.bonus300; b300.dispatchEvent(new Event('change',{bubbles:true})); }
    const bgr  = document.getElementById('rb-bonus-grab');
    if (bgr)  { bgr.checked = !!payload.rabatt?.bonusGrab; bgr.dispatchEvent(new Event('change',{bubbles:true})); }

    window.updatePricing?.();
    alert('Playground-Parameter in das Angebot übernommen.');
  });

  btnClear.addEventListener('click', () => {
    selScenario.value = '';
    payerRadios.forEach(r => r.checked = false);
    aufRadios.forEach(r => r.checked = false);
    hasPgCB.checked = false; show(pgLvlWrap, false);
    pgLvlRadios.forEach(r => r.checked = false);
    budgetMax.checked = budgetCopay.checked = twoPersons.checked = false;
    copayAmount.value = '';
    weDoneCB.checked = false; weAmount.value = '';
    discRange.value = '0'; discVal.textContent = '0.0%';
    bonus300.checked = false; bonusGrab.checked = false;
    pgProducts = []; renderProdList();
    outPayload.textContent = outResp.textContent = outDiff.textContent = '';
  });

  btnOpenRab.addEventListener('click', async () => {
    const payload = makePlaygroundPayload();
    const data = await runPricing(payload);
    window.__pricing = data;
    window.setPricingData?.(data);
    window.dispatchEvent(new CustomEvent('pricing:updated', { detail: data }));
    location.hash = 'rabatt';
  });

  btnOpenKos.addEventListener('click', async () => {
    const payload = makePlaygroundPayload();
    const data = await runPricing(payload);
    window.__pricing = data;
    // trigger Kosten re-render
    window.dispatchEvent(new CustomEvent('pricing:updated', { detail: data }));
    location.hash = 'kosten';
  });

  // Auto-run when entering page
  window.addEventListener('hashchange', () => {
    if (typeof getCurrentStep === 'function' && getCurrentStep() === 'playground') {
      // no-op; keep state
    }
  });
})();

/* ========== PDF/DOCX + API BUTTONS ========== */

async function requestPdfAndDownload(payload, filename = "Anfrage.pdf") {
  const resp = await fetch("/pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    throw new Error(`PDF Fehler (${resp.status}): ${txt}`);
  }
  const blob = await resp.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

document.getElementById("makePdf")?.addEventListener("click", async () => {
  if (!requireBereichValid()) {
    location.hash = "bereich";
    return;
  }
  try {
    const payload = buildPayload();
    await downloadPDFWithProgress("/pdf", payload, "Anfrage.pdf");
    document.getElementById("pdfActions")?.style.setProperty("display", "flex");
  } catch (e) {
    showPDFProgress(`PDF-Erstellung fehlgeschlagen: ${e.message}`, "error");
  }
});

document.getElementById("downloadPdf")?.addEventListener("click", async () => {
  try {
    const payload = buildPayload();
    await downloadPDFWithProgress("/pdf", payload, "Anfrage.pdf");
  } catch (e) {
    showPDFProgress(`PDF-Erstellung fehlgeschlagen: ${e.message}`, "error");
  }
});

document
  .getElementById("makePdfFromTemplate")
  ?.addEventListener("click", async () => {
    if (!requireBereichValid()) {
      location.hash = "bereich";
      return;
    }
    try {
      const payload = buildPayload();
      await downloadPDFWithProgress(
        "/pdf-template",
        payload,
        "Angebot_aus_Vorlage.pdf"
      );
      document
        .getElementById("pdfActions")
        ?.style.setProperty("display", "flex");
    } catch (e) {
      showPDFProgress(`PDF-Erstellung fehlgeschlagen: ${e.message}`, "error");
    }
  });

async function downloadDocx(url, body, filename) {
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    throw new Error(`Download failed: ${resp.status} ${txt}`);
  }
  const blob = await resp.blob();
  const urlObj = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = urlObj;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(urlObj);
}

document.getElementById("downloadDocx")?.addEventListener("click", async () => {
  if (!requireBereichValid()) {
    location.hash = "bereich";
    return;
  }
  try {
    const resp = await fetch("/docx-template", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildPayload()),
    });
    if (!resp.ok) throw new Error(await resp.text());
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Angebot_${Date.now()}.docx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (e) {
    show({ error: String(e) }, false);
  }
});

document.getElementById("sendForm")?.addEventListener("click", async () => {
  if (!requireBereichValid()) {
    location.hash = "bereich";
    return;
  }
  try {
    const r = await fetch("/api/price", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildPayload()),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || r.status);
    show({ pricePreview: data }, true);
  } catch (e) {
    show({ error: String(e) }, false);
  }
});

document.getElementById("sendJson")?.addEventListener("click", async () => {
  if (!requireBereichValid()) {
    location.hash = "bereich";
    return;
  }
  try {
    const r = await fetch("/api/submissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildPayload()),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || r.status);
    show({ message: "Submission gespeichert", ...data }, true);
  } catch (e) {
    show({ error: String(e) }, false);
  }
});

// Material-Übersicht DOCX
document
  .getElementById("downloadMaterialOverview")
  ?.addEventListener("click", async () => {
    if (!requireBereichValid()) {
      location.hash = "bereich";
      return;
    }
    try {
      const payload = buildPayload();
      
      await downloadDocx(
        "/docx-template/material-overview",
        payload,
        `Materialuebersicht_${Date.now()}.docx`
      );
    } catch (e) {
      console.error(e);
      show({ error: String(e) }, false);
      alert("Materialübersicht konnte nicht erstellt werden.");
    }
  });

// Angebot als PDF aus DOCX-Vorlage
document
  .getElementById("downloadDocxAsPdf")
  ?.addEventListener("click", async () => {
    if (!requireBereichValid()) {
      location.hash = "bereich";
      return;
    }
    try {
      const payload = buildPayload();
      await downloadPDFWithProgress(
        "/docx-template/pdf",
        payload,
        `Angebot_${Date.now()}.pdf`
      );
    } catch (e) {
      console.error(e);
      showPDFProgress(`PDF-Erstellung fehlgeschlagen: ${e.message}`, "error");
    }
  });

/* ========== RABATT SECTION (UI bound to server data) ========== */
const elDiscount = document.getElementById("rb-material-discount");
const elDiscountVal = document.getElementById("rb-material-discount-val");
const rowRabatt = document.getElementById("rb-rabatt-row");
const rowTotalAfter = document.getElementById("rb-total-after-row");
const outRabatt = document.getElementById("rb-rabatt");
const outTotalAfter = document.getElementById("rb-total-after");
const rowBonusTotal = document.getElementById("rb-bonus-total-row");
const outBonusTotal = document.getElementById("rb-bonus-total");

const euroFmt = (n) =>
  (Number(n) || 0)
    .toLocaleString("de-DE", { style: "currency", currency: "EUR" })
    .replace(/\u00A0/g, " ");
const setRowVisible = (row, on) => {
  if (row) {
    row.style.display = on ? "contents" : "none";
    row.hidden = !on;
    row.setAttribute("aria-hidden", String(!on));
  }
};

// debounce helper so we don't spam /api/price while sliding
const debounce = (fn, ms = 200) => {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
};
const refreshPricing = debounce(() => window.updatePricing?.(), 200);

elDiscount?.addEventListener("input", () => {
  const v = parseFloat(elDiscount.value || "0") || 0;
  if (elDiscountVal)
    elDiscountVal.textContent =
      v.toLocaleString("de-DE", {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }) + "%";
  refreshPricing();
});

// Bonuses recompute totals
document
  .getElementById("rb-bonus-300")
  ?.addEventListener("change", () => window.updatePricing?.());
document
  .getElementById("rb-bonus-grab")
  ?.addEventListener("change", () => window.updatePricing?.());

// Fill labels from server
window.setPricingData = function setPricingData(data) {
  try {
    const byId = (id) => document.getElementById(id);
    const fmt = (n) =>
      (Number(n) || 0)
        .toLocaleString("de-DE", { style: "currency", currency: "EUR" })
        .replace(/\u00A0/g, " ");

    const mat = Number(data?.productsSubtotal ?? 0);
    const arbe = Number(data?.services?.sum ?? 0);
    const net = Number(data?.Nettobetrag ?? 0);
    const vat = Number(data?.baseVat ?? 0);
    const total = Number(data?.base_total ?? 0);
    const auf = Number(data?.markup ?? 0);

    byId("rb-material")?.replaceChildren(document.createTextNode(fmt(mat)));
    byId("rb-arbeit")?.replaceChildren(document.createTextNode(fmt(arbe)));
    byId("rb-net")?.replaceChildren(document.createTextNode(fmt(net)));
    byId("rb-vat")?.replaceChildren(document.createTextNode(fmt(vat)));
    byId("rb-total")?.replaceChildren(document.createTextNode(fmt(total)));
    byId("rb-auf-value")?.replaceChildren(document.createTextNode(fmt(auf)));

    const payerRaw =
      data?.services?.payer ??
      data?.payer ??
      document.querySelector('input[name="payer"]:checked')?.value ??
      "";
    const key = String(payerRaw).trim().toLowerCase();
    const norm =
      key === "sz" || key === "selbstzahler"
        ? "selbstzahler"
        : key === "kk" || key === "kassenkunde"
        ? "kassenkunde"
        : "";
    const h2 = document.querySelector("#page-rabatt h2");
    if (h2) {
      h2.textContent =
        norm === "selbstzahler"
          ? "Rabatt für Selbstzahler"
          : norm === "kassenkunde"
          ? "Rabatt für Kassenkunde"
          : "Rabatt";
    }

    // Aufschlag label
    let mp = data?.markupPct;
    if (!Number.isFinite(mp)) {
      const raw =
        document.querySelector('input[name="aufschlag"]:checked')?.value || "";
      const m = String(raw).match(/[\d.]+/);
      mp = m
        ? raw.includes("%")
          ? parseFloat(m[0]) / 100
          : parseFloat(m[0])
        : 0;
    }
    const pctInt = Math.round(mp <= 1 ? mp * 100 : mp);
    byId("rb-auf-label")?.replaceChildren(
      document.createTextNode(`Aufschlag ${pctInt}%`)
    );

    // Show/hide 300€ bonus based on threshold (after rab.)
    (function gateBonus300() {
      const afterRab = Number(data?.totalAfterRabatt || 0);
      const cb300 = byId("rb-bonus-300");
      const wrap =
        document.getElementById("rb-bonus-300-row") ||
        cb300?.closest("label.radio-pill") ||
        cb300?.parentElement ||
        null;
      const shouldShow = afterRab > 3000;
      if (wrap) {
        wrap.style.display = shouldShow ? "" : "none";
        wrap.hidden = !shouldShow;
        wrap.setAttribute("aria-hidden", String(!shouldShow));
      }
      if (!shouldShow && cb300?.checked) {
        cb300.checked = false;
        cb300.dispatchEvent(new Event("change", { bubbles: true }));
      }
    })();

    let sliderPct = parseFloat(elDiscount?.value || "0");
    if (!Number.isFinite(sliderPct))
      sliderPct = Number(data?.materialDiscountPct || 0) * 100;
    if (elDiscountVal)
      elDiscountVal.textContent =
        sliderPct.toLocaleString("de-DE", {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        }) + "%";
    if (elDiscount && Number.isFinite(sliderPct))
      elDiscount.value = String(sliderPct);

    const cb300 = byId("rb-bonus-300");
    const cbGrab = byId("rb-bonus-grab");
    const hasRabatt = sliderPct > 0;
    const anyBonus = !!(
      cb300?.checked ||
      cbGrab?.checked ||
      Number(data?.bonusGross || 0) > 0
    );

    const showRow = (row, on) => {
      if (!row) return;
      row.hidden = !on;
      row.setAttribute("aria-hidden", String(!on));
      row.style.display = on ? "contents" : "none";
    };
    showRow(rowRabatt, hasRabatt);
    showRow(rowTotalAfter, hasRabatt);
    showRow(rowBonusTotal, anyBonus);

    const rabattAmt = Number(data?.rabattAmount || 0);
    const afterRab = Number(data?.totalAfterRabatt || 0);
    if (outRabatt) outRabatt.textContent = fmt(hasRabatt ? rabattAmt : 0);
    if (outTotalAfter)
      outTotalAfter.textContent = fmt(hasRabatt ? afterRab : 0);

    const totalAfterBonus = Number(data?.totalAfterBonus || 0);
    if (outBonusTotal)
      outBonusTotal.textContent = fmt(anyBonus ? data.total : 0);
  } catch (err) {
    console.error("[rabatt] setPricingData failed:", err);
  }
  (() => {
  const row = document.getElementById('rb-bonus-grab-row')
           || document.getElementById('rb-bonus-grab')?.closest('label.radio-pill')
           || document.getElementById('rb-bonus-grab')?.parentElement;
  const cb  = document.getElementById('rb-bonus-grab');

  const cl40 = Number(data?.grabCounts?.cl40 || 0);
  const allow = cl40 > 0;

  if (row) {
    row.style.display = allow ? '' : 'none';
    row.hidden = !allow;
    row.setAttribute('aria-hidden', String(!allow));
  }
  if (!allow && cb && cb.checked) {
    cb.checked = false;
    cb.dispatchEvent(new Event('change', { bubbles: true }));
  }
})();

};

// Show discount slider only for: KK + Aufschlag 50%
(function initMaterialDiscountVisibility() {
  const sec =
    document.getElementById("rb-material-discount-section") ||
    elDiscount?.closest(".field") ||
    elDiscount?.closest(".row") ||
    elDiscount?.parentElement;

  if (!sec || !elDiscount) return;

  const isKK = () => {
    const v = (
      document.querySelector('input[name="payer"]:checked')?.value || ""
    )
      .trim()
      .toLowerCase();
    return v === "kassenkunde" || v === "kk";
  };
  const isAufschlag50 = () => {
    const raw = (
      document.querySelector('input[name="aufschlag"]:checked')?.value || ""
    ).trim();
    return /(^|\s)50\s*%?$/.test(raw);
  };
  function show(el, on) {
    el.hidden = !on;
    el.setAttribute("aria-hidden", String(!on));
    if (el.style) el.style.display = on ? "" : "none";
  }
  function apply() {
    const allow = isKK() && isAufschlag50();
    show(sec, allow);
    if (!allow) {
      const cur = parseFloat(elDiscount.value || "0") || 0;
      if (cur !== 0) {
        elDiscount.value = "0";
        if (elDiscountVal) elDiscountVal.textContent = "0.0%";
        window.updatePricing?.();
      }
    }
  }
  apply();
  document
    .querySelectorAll('input[name="payer"]')
    .forEach((r) => r.addEventListener("change", apply));
  document
    .querySelectorAll('input[name="aufschlag"]')
    .forEach((r) => r.addEventListener("change", apply));
  window.addEventListener("hashchange", () => {
    if (typeof getCurrentStep === "function" && getCurrentStep() === "rabatt")
      apply();
  });
})();

/* ========== OPTIONAL MENUS (show/hide + qty fields) ========== */
// ---- BASIN auto-accessories + quantity controller (minimal, reuses existing IDs) ----


function initBasinAutoAccessories() {
  const reqWrap = document.getElementById('basinRequiredWrap');
  if (!reqWrap) return;

  // Main product
  const cl60 = document.getElementById('opt_CL60');
  const qCL  = document.getElementById('qty_CL60');

  // Required accessories
  const wtbf  = document.getElementById('opt_WTBF');
  const qWT   = document.getElementById('qty_WTBF');
  const rsl   = document.getElementById('opt_RSL');
  const qRSL  = document.getElementById('qty_RSL');
  const ev    = document.getElementById('opt_EV');
  const qEV   = document.getElementById('qty_EV');
  const evLbl = document.querySelector('label[for="qty_EV"]');

  if (!cl60 || !qCL || !wtbf || !qWT || !rsl || !qRSL || !ev || !qEV || !evLbl) return;

  // ---------- helpers ----------
  const num = (v, d=0) => {
    const s = String(v ?? '').trim().replace(/\./g, '').replace(',', '.');
    const n = Number(s);
    return Number.isFinite(n) ? n : d;
  };
  const dispatch = (el) => {
    el.dispatchEvent(new Event('input',  { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const show = (el, v=true) => {
    if (!el) return;
    el.hidden = !v;
    el.setAttribute('aria-hidden', String(!v));
  };
  const updateEvPairsLabel = () => {
    const base = evLbl.dataset.baseLabel || evLbl.textContent.replace(/\s*\(.*\)\s*$/,'');
    evLbl.dataset.baseLabel = base;
    const qty = num(qEV.value, 0);
    const pairs = qty / 2;
    evLbl.textContent = `${base} (${Number.isInteger(pairs) ? pairs : pairs.toFixed(1)} paare)`;
  };

  // ---------- persistence ----------
  const KEY = 'basin_required_state';
  const loadState = () => {
    try { return JSON.parse(localStorage.getItem(KEY) || 'null') || {}; }
    catch { return {}; }
  };
  const saveState = () => {
    const s = {
      cl60: { checked: !!cl60.checked, qty: num(qCL.value, 0) },
      wtbf: { checked: !!wtbf.checked, qty: num(qWT.value, 0) },
      rsl:  { checked: !!rsl.checked,  qty: num(qRSL.value, 0) },
      ev:   { checked: !!ev.checked,   qty: num(qEV.value, 0)  },
    };
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {}
  };
  const applyState = (s) => {
    if (s.cl60) {
      cl60.checked = !!s.cl60.checked; dispatch(cl60);
      if (Number.isFinite(s.cl60.qty)) { qCL.value = String(s.cl60.qty); dispatch(qCL); }
    }
    if (s.wtbf) { wtbf.checked = !!s.wtbf.checked; dispatch(wtbf);
      if (Number.isFinite(s.wtbf.qty)) { qWT.value = String(s.wtbf.qty); dispatch(qWT); } }
    if (s.rsl)  { rsl.checked  = !!s.rsl.checked;  dispatch(rsl);
      if (Number.isFinite(s.rsl.qty))  { qRSL.value = String(s.rsl.qty);  dispatch(qRSL); } }
    if (s.ev)   { ev.checked   = !!s.ev.checked;   dispatch(ev);
      if (Number.isFinite(s.ev.qty))   { qEV.value = String(s.ev.qty);   dispatch(qEV);  } }
    updateEvPairsLabel();
  };

  // ---------- rule (apply ONLY on user CL60 change) ----------
  const applyRuleFromCL = () => {
    if (!cl60.checked) return;
    let q = num(qCL.value, 1);
    if (q < 1) { q = 1; qCL.value = '1'; dispatch(qCL); }

    // Overwrite accessory quantities when CL60 qty changes (user action)
    if (wtbf.checked) { qWT.value  = String(q);     dispatch(qWT);  }
    if (rsl.checked)  { qRSL.value = String(q);     dispatch(qRSL); }
    if (ev.checked)   { qEV.value  = String(q * 2); dispatch(qEV);  }
    updateEvPairsLabel();
    saveState();
  };

  // ---------- wire events ----------
  // When CL60 is turned ON by the user: show required section, select accessories and set base values once
 cl60.addEventListener('change', (e) => {
  if (cl60.checked) {
    show(reqWrap, true);

    // Ensure required accessories are selected (quantities will be set by the rule)
    if (!wtbf.checked) { wtbf.checked = true; dispatch(wtbf); }
    if (!rsl.checked)  { rsl.checked  = true; dispatch(rsl);  }
    if (!ev.checked)   { ev.checked   = true; dispatch(ev);   }

    // Set CL60 to 1 if empty/invalid
    if (!num(qCL.value)) { qCL.value = '1'; dispatch(qCL); }

    // ⬇️ Apply the rule NOW so we land on 1 / 1 / 2 immediately
    applyRuleFromCL();

    saveState();
  } else {
    saveState();
  }
});


  // RULE TRIGGER: only when user changes CL60 quantity
  qCL.addEventListener('input',  applyRuleFromCL);
  qCL.addEventListener('change', applyRuleFromCL);

  // Any manual edits by the user should persist
  [qWT, qRSL, qEV].forEach(el => {
    el.addEventListener('input',  () => { updateEvPairsLabel(); saveState(); });
    el.addEventListener('change', () => { updateEvPairsLabel(); saveState(); });
  });
  [wtbf, rsl, ev].forEach(cb => cb.addEventListener('change', saveState));

  // ---------- initial restore (NO rule application here) ----------
  const state = loadState();
  const hasSaved = Object.keys(state).length > 0;
  if (hasSaved) {
    // Restore exactly what the user had last time; don't run the rule.
    applyState(state);
    show(reqWrap, !!cl60.checked); // keep required block visible if CL60 was selected
  } else {
    // First-time defaults if CL60 already checked (e.g. server-side prefill)
    if (cl60.checked) {
      show(reqWrap, true);
      // Select accessories & set base values, but still no rule until user changes qCL
      if (!wtbf.checked) { wtbf.checked = true; dispatch(wtbf); }
      if (!rsl.checked)  { rsl.checked  = true; dispatch(rsl);  }
      if (!ev.checked)   { ev.checked   = true; dispatch(ev);   }
      if (!num(qCL.value)) { qCL.value = '1'; dispatch(qCL); }
      // set initial visible EV pairs label
      updateEvPairsLabel();
      saveState();
    }
  }
}

function initOptionalMenus() {
  // Map main category checkboxes -> their panels
  const map = {
    cat_SHOWER:     "menu_SHOWER",
    cat_GRAB:       "menu_GRAB",
    cat_FOLD:       "menu_FOLD",
    cat_BASIN:      "menu_BASIN",
    cat_BASIN_TAP:  "menu_BASIN_TAP",
    cat_THERMO:     "menu_THERMO",
    cat_SEAT:       "menu_SEAT",
    // Add more categories here if needed
  };

  // ---- helpers ----
  function showPanel(id, on) {
    const el = document.getElementById(id);
    if (!el) return;
    el.hidden = !on;
    el.setAttribute("aria-hidden", String(!on));
  }

  // Reset ONLY the given panel (no global side effects, no event dispatch),
  // so re-selecting tiles later will naturally re-show qty wrappers via wireTileQty.
  function resetPanel(menuId) {
    const panel = document.getElementById(menuId);
    if (!panel) return;

    // Uncheck all toggles inside this panel (no events)
    panel.querySelectorAll('input[type="checkbox"], input[type="radio"]').forEach(i => {
      i.checked = false;
    });

    // Zero all numbers, remove required, and hide their *local* wrappers
    panel.querySelectorAll('input[type="number"]').forEach(n => {
      n.value = '0';
      n.removeAttribute('required');
      const wrap = n.closest('[id$="_wrap"]');
      if (wrap) {
        wrap.hidden = true;
        wrap.setAttribute('aria-hidden', 'true');
      }
    });

    // Basin-only: collapse "Erforderliches Zubehör" within this panel and clear saved state
    const reqWrap = panel.querySelector('#basinRequiredWrap');
    if (reqWrap) {
      reqWrap.hidden = true;
      reqWrap.setAttribute('aria-hidden', 'true');
    }
    try { localStorage.removeItem('basin_required_state'); } catch {}

    // Keep totals in sync
    window.updatePricing?.();
  }

  // Wire a tile checkbox to its qty-wrapper (show on check, hide & zero on uncheck)
  function wireTileQty(tileCheckboxId, qtyWrapId) {
    const cb   = document.getElementById(tileCheckboxId);
    const wrap = document.getElementById(qtyWrapId);
    if (!cb || !wrap) return;

    const qty = wrap.querySelector('input[type="number"]');
    const apply = () => {
      const on = !!cb.checked;
      wrap.hidden = !on;
      wrap.setAttribute("aria-hidden", String(!on));
      if (on) {
        if (!qty.value || parseInt(qty.value, 10) <= 0) qty.value = "1";
        qty.setAttribute("required", "required");
      } else {
        qty.removeAttribute("required");
        qty.value = "0";
      }
    };
    cb.addEventListener("change", apply);
    // initial
    apply();
  }

  // ---- category toggles: show/hide, and reset the panel ONLY when turning OFF ----
  Object.entries(map).forEach(([catId, menuId]) => {
    const cat = document.getElementById(catId);
    if (!cat) return;

    function apply() {
      const on = !!cat.checked;
      if (!on) resetPanel(menuId);   // clear the content when category is deselected
      showPanel(menuId, on);
    }

    cat.addEventListener("change", apply);
    // initial state (in case some categories are pre-checked)
    apply();
  });

  // ---- SHOWER ----
  wireTileQty("opt_V22WS1R",    "qty_V22WS1R_wrap");
  wireTileQty("opt_TEMPDSU250", "qty_TEMPDSU250_wrap");
  wireTileQty("opt_V22BG903R",  "qty_V22BG903R_wrap");
  wireTileQty("opt_DEDS2503E",  "qty_DEDS2503E_wrap");

  // ---- THERMO ----
  wireTileQty("opt_CLTB",  "qty_CLTB_wrap");
  wireTileQty("opt_DEPTB", "qty_DEPTB_wrap");
  wireTileQty("opt_CLB",   "qty_CLB_wrap");

  // ---- GRAB ----
  wireTileQty("opt_CLPESG40", "qty_CLPESG40_wrap");
  wireTileQty("opt_CLPESG60", "qty_CLPESG60_wrap");
  wireTileQty("opt_CLPESG80", "qty_CLPESG80_wrap");

  // ---- FOLD ----
  wireTileQty("opt_DEPSKG60", "qty_DEPSKG60_wrap");
  wireTileQty("opt_DEPSKG85", "qty_DEPSKG85_wrap");

  // ---- SEAT ----
  wireTileQty("opt_DEPKS", "qty_DEPKS_wrap");

  // ---- BASIN TAP ----
  wireTileQty("opt_CL_BASIN", "qty_CL_BASIN_wrap");
  wireTileQty("opt_DEPOH",    "qty_DEPOH_wrap");

  // ---- BASIN (main CL60 tile) ----
  wireTileQty("opt_CL60", "qty_CL60_wrap");

  // Show/hide "Erforderliches Zubehör" when CL60 is toggled (no cross-panel effects)
  (function wireBasinRequired() {
    const wt      = document.getElementById("opt_CL60");
    const reqWrap = document.getElementById("basinRequiredWrap");
    if (!wt || !reqWrap) return;

    const apply = () => {
      const on = !!wt.checked;
      reqWrap.hidden = !on;
      reqWrap.setAttribute("aria-hidden", String(!on));
      if (!on) {
        // reset only the required accessory tiles/qty inside this box
        ["qty_WTBF_wrap", "qty_RSL_wrap", "qty_EV_wrap"].forEach((id) => {
          const wrap = document.getElementById(id);
          const input = wrap?.querySelector('input[type="number"]');
          if (wrap && input) {
            wrap.hidden = true;
            wrap.setAttribute("aria-hidden", "true");
            input.value = "0";
            input.removeAttribute("required");
          }
        });
        ["opt_WTBF", "opt_RSL", "opt_EV"].forEach((id) => {
          const cb = document.getElementById(id);
          if (cb) cb.checked = false;
        });
        try { localStorage.removeItem('basin_required_state'); } catch {}
        window.updatePricing?.();
      }
    };

    wt.addEventListener("change", apply);
    apply();

    // Accessory tiles inside required block
    wireTileQty("opt_WTBF", "qty_WTBF_wrap");
    wireTileQty("opt_RSL",  "qty_RSL_wrap");
    wireTileQty("opt_EV",   "qty_EV_wrap");
  })();

  // ---- Independent “Zubehör zum Waschtisch” (loose accessories) ----
  wireTileQty("opt_WTBF__loose", "qty_WTBF__loose_wrap");
  wireTileQty("opt_RSL__loose",  "qty_RSL__loose_wrap");
  wireTileQty("opt_EV__loose",   "qty_EV__loose_wrap");

  // Keep your existing rule engine for CL60 & accessories (1 / 1 / 2 and persistence)
  if (typeof initBasinAutoAccessories === "function") {
    initBasinAutoAccessories();
  }
}



function initLivePricingSync() {
  // WATCH EVERYTHING (best: your main form; fallback: document.body)
  const watchRoot =
    document.getElementById('form-konfigurator') || // <- put your main form's id here if you have one
    document.querySelector('form') ||
    document.body;

  let t = null;
  const debounce = (fn, ms=250) => { clearTimeout(t); t = setTimeout(fn, ms); };

  async function repriceNow() {
    const payload = buildPayload();            // reuse your builder
    const r = await fetch('/api/price', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      credentials: 'include', body: JSON.stringify(payload),
    });
    const result = await r.json();

    if (typeof renderKostenDetails === 'function') renderKostenDetails(result, payload);
    else if (typeof renderCostsDebug === 'function') renderCostsDebug(result, payload);

    document.dispatchEvent(new CustomEvent('price:updated', { detail: { result, payload } }));
    window.lastPrice = result;
  }

  // Single delegated listener covers ALL inputs/checkboxes/selects in the app
  const handler = () => debounce(repriceNow, 180);
  watchRoot.addEventListener('input', handler, true);
  watchRoot.addEventListener('change', handler, true);

  // Also watch hidden fields that we set programmatically
  ['chosenTrayProductId','traySize'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.addEventListener('input', handler); el.addEventListener('change', handler); }
  });

  // Initial run
  repriceNow();
}

document.addEventListener('DOMContentLoaded', () => {

   // If you have explicit nav buttons/tabs:
  const btnRabatt = document.getElementById('nav-rabatt');
  const btnDebug  = document.getElementById('nav-debug');
  if (btnRabatt) btnRabatt.addEventListener('click', refreshAllPanels);
  if (btnDebug)  btnDebug .addEventListener('click', refreshAllPanels);

  initSmartTraySearch();
  initTraySizeAutoLabel();
  initOptionalMenus && initOptionalMenus(); 
  initBasinAutoAccessories && initBasinAutoAccessories();
  wireDAQtyAutoFill(); 
  initLivePricingSync(); //  
  window.addEventListener('hashchange', () => {
  const id = location.hash.replace('#','');
  if (id === 'rabatt' || id === 'kosten') refreshAllPanels();
});

});


      //<!-- Sidebar + wizard nav sync -->

(function () {
        const sidebar = document.getElementById("sidebar");
        const backdrop = document.getElementById("sidebarBackdrop");
        const openBtn = document.getElementById("openSidebar");
        const closeBtn = document.getElementById("closeSidebar");

        const toggleSidebar = (open) => {
          if (!sidebar) return;
          sidebar.classList.toggle("open", open);
          backdrop?.classList.toggle("visible", open);
          if (open) {
            document.body.style.overflow = "hidden";
          } else {
            document.body.style.overflow = "";
          }
        };

        openBtn?.addEventListener("click", () => toggleSidebar(true));
        closeBtn?.addEventListener("click", () => toggleSidebar(false));
        backdrop?.addEventListener("click", () => toggleSidebar(false));

        sidebar?.addEventListener("click", (event) => {
          const link = event.target.closest("a.side-link");
          if (link) toggleSidebar(false);
        });
      })();

      document.addEventListener("DOMContentLoaded", () => {
        const navLinks = Array.from(
          document.querySelectorAll(".side-link[data-step]")
        );
        const pages = Array.from(document.querySelectorAll(".card.page"));

        if (!navLinks.length || !pages.length) return;

        const stepOrder = navLinks.map((link) => link.dataset.step);

        const validStep = (candidate) =>
          stepOrder.includes(candidate) ? candidate : stepOrder[0];

        const showStep = (stepId) => {
          const current = validStep(stepId);
          const currentIndex = stepOrder.indexOf(current);

          navLinks.forEach((link, index) => {
            const stateStep = link.dataset.step;
            link.classList.toggle("active", stateStep === current);
            if (index < currentIndex) {
              link.classList.add("done");
            } else {
              link.classList.remove("done");
            }
          });

          pages.forEach((section) => {
            section.hidden = section.id !== `page-${current}`;
          });

          window.scrollTo({ top: 0, behavior: "instant" });
        };

        const syncWithHash = () => {
          const hash = window.location.hash.replace("#", "");
          showStep(hash || stepOrder[0]);
        };

        navLinks.forEach((link) => {
          link.addEventListener("click", (event) => {
            event.preventDefault();
            const targetStep = validStep(link.dataset.step);
            if (window.location.hash !== `#${targetStep}`) {
              window.location.hash = targetStep;
            } else {
              showStep(targetStep);
            }
          });
        });

        document.addEventListener("click", (event) => {
          const button = event.target.closest("[data-nav]");
          if (!button) return;

          const currentStep = validStep(
            window.location.hash.replace("#", "") || stepOrder[0]
          );
          const currentIndex = stepOrder.indexOf(currentStep);

          if (button.dataset.nav === "next" && currentIndex < stepOrder.length - 1) {
            window.location.hash = stepOrder[currentIndex + 1];
          }

          if (button.dataset.nav === "prev" && currentIndex > 0) {
            window.location.hash = stepOrder[currentIndex - 1];
          }
        });

        window.addEventListener("hashchange", syncWithHash);
        syncWithHash();
      });