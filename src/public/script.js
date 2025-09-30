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
  return h + min / 60;
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
  return `AN${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(
    d.getHours()
  )}${p(d.getMinutes())}${p(d.getSeconds())}`;
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
    ? Math.max(0, hhmmToHours(laborHHMM))
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

function buildPayload() {
  const payload = {
    bereich: formToObject(document.getElementById("form-bereich")),
    duschwanne: {
      ...formToObject(document.getElementById("form-duschwanne")),
      computed: window.__DW_COMPUTED__ || {},
    },
    wandverkleidung: formToObject(
      document.getElementById("form-wandverkleidung")
    ),
    duschabtrennung: formToObject(
      document.getElementById("form-duschabtrennung")
    ),
    optional: formToObject(document.getElementById("form-optional")),
    rabatt: formToObject(document.getElementById("form-rabatt")),
  };

  collectWandverkleidungMaterials(payload);

  // Budget/Zuzahlung
  const elMax = document.querySelector('input[name="budgetMax"]');
  const elCopay = document.querySelector('input[name="budgetCopay"]');
  const elTwo = document.querySelector('input[name="twoPersons"]');
  const copayEl = document.getElementById("copayAmount");

  const wohDoneRadios = document.querySelectorAll(
    'input[name="wohnumfeldDone"]'
  );
  const wohAmountInput = document.getElementById("wohnumfeldAmount");
  function readWohnumfeld() {
    const isJa = Array.from(wohDoneRadios).some(
      (r) => r.checked && r.value === "Ja"
    );
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
  const pct = parseFloat(
    document.getElementById("rb-material-discount")?.value || "0"
  );
  payload.rabatt = {
    ...payload.rabatt,
    materialDiscountPct: isFinite(pct) ? pct / 100 : 0,
    bonus300: !!document.getElementById("rb-bonus-300")?.checked,
    bonusGrab: !!document.getElementById("rb-bonus-grab")?.checked,
  };

  payload.offerNumber = (
    document.getElementById("offerNumber")?.value || ""
  ).trim();
  payload.bereich.totalHoursHHMM =
    document
      .getElementById("totalHoursHHMM")
      ?.textContent?.match(/(\d+:\d{2})/)?.[1] || "";
  payload.bereich.totalHoursNumeric = Number(window.total_hours_numeric || 0);
  payload.bereich.laborHoursHHMM = laborHHMM;
  payload.bereich.laborHoursNumeric = laborNumeric;

  const woh = readWohnumfeld();
  const isKK =
    (payload.bereich?.payer ||
      document.querySelector('input[name="payer"]:checked')?.value) ===
    "Kassenkunde";
  payload.bereich.wohnumfeld = isKK ? woh : { done: false, amount: 0 };

  // --- Attach Duschwanne selection from DOM (if present) ---
{
  const pid  = document.getElementById('chosenTrayProductId')?.value?.trim();
  const size = document.getElementById('traySize')?.value?.trim();

  const dw = payload.duschwanne || (payload.duschwanne = {});
  if (pid)  dw.chosenTrayProductId = pid;
  if (size) dw.traySize = size;
}

// --- Ensure tray selection persists in payload even if suggestion UI isn't rendered
(function ensureTraySelection() {
  const dw = payload.duschwanne || (payload.duschwanne = {});
  const hasSize = !!(dw.traySize && String(dw.traySize).trim());
  const hasPid = !!(dw.chosenTrayProductId && String(dw.chosenTrayProductId).trim());
  if (hasSize && hasPid) return;
  try {
    const raw = localStorage.getItem("dw_tray_selection");
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (!hasSize && saved?.value)      dw.traySize = saved.value;
    if (!hasPid  && saved?.productId)  dw.chosenTrayProductId = saved.productId;
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
    if (!f.querySelector('input[name="floorSealing[]"]:checked') && !bad)
      bad = f.querySelector('input[name="floorSealing[]"]')?.closest("label");
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
window.addEventListener("hashchange", () => {
  if (location.hash === "#wandverkleidung") setupWandverkleidungPage();
});
document.addEventListener("DOMContentLoaded", () => {
  if (location.hash === "#wandverkleidung") setupWandverkleidungPage();
});

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
    setReq(copayAmount, on);
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

  async function ensureUnits() {
    if (!unitAdh) {
      const p = await getProduct("V4FK600");
      unitAdh = Number(p?.price || 0);
    }
    if (!unitSeal) {
      const p = await getProduct("TRBDSET7");
      unitSeal = Number(p?.price || 0);
    }
  }

  function updateFlooringPanelsPriceFromPricing() {
    if (!panelsPriceEl) return;
    const data = window.__pricing;
    if (!data || !data.materials || !Array.isArray(data.materials.lines)) {
      panelsPriceEl.textContent = "0";
      return;
    }
    const line = data.materials.lines.find(
      (l) => (l.productId || l.id) === "V5FB02"
    );
    panelsPriceEl.textContent = line ? euro(line.lineTotal || 0) : "0";
  }
  // expose globally so outside listeners can call safely
  window.updateFlooringPanelsPriceFromPricing =
    updateFlooringPanelsPriceFromPricing;

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
    const effM2 = m2 ? m2 * 1.15 : 0;
    const ratePerM2 = unitSeal ? unitSeal / 7 : 0;
    const totalS = effM2 * ratePerM2;

    if (liveSeal) {
      liveSeal.textContent = effM2
        ? `= ${effM2.toFixed(2)} m² (inkl. 15% Verschnitt)`
        : "";
    }
    if (sealingPriceEl) {
      sealingPriceEl.textContent = effM2 ? euro(totalS) : "0";
    }

    computed.sealing = {
      productId: "TRBDSET7",
      effM2: +effM2.toFixed(2),
      ratePerM2: +ratePerM2.toFixed(2),
      unitSet: unitSeal, // raw DB set price (7 m²)
      total: +totalS.toFixed(2),
    };

    // Panels price mirrors SERVER (pricing.js). Do not compute here.
    updateFlooringPanelsPriceFromPricing();
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

  function apply() {
    const on = !!toggle?.checked;
    show(panel, on);
    setReq(area, on);
    if (on) {
      // auto-check tiles when enabled
      f.querySelectorAll(
        'input[name="flooringProduct[]"],input[name="floorAdhesive[]"],input[name="floorSealing[]"]'
      ).forEach((i) => {
        i.checked = true;
        highlightTileForInput(i, true);
      });
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

  // initial tile highlight
  f.querySelectorAll('label.image-check > input[type="checkbox"]').forEach(
    (cb) => {
      cb.addEventListener("change", () =>
        highlightTileForInput(cb, cb.checked)
      );
      highlightTileForInput(cb, cb.checked);
    }
  );

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
    const s = String(v).trim().replace(/\./g, '').replace(',', '.');
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  };
  const makeLabel = (w, l, h) => (w && l && h ? `${w} x ${l} x ${h} cm` : '');

  // Keep a selected-state toggle class without relying on :has()
  const applySelectedStyles = () => {
    const cards = Array.from(out.querySelectorAll('.suggestion-card'));
    const checked = out.querySelector('input[name="traySuggestion"]:checked');
    cards.forEach(card => {
      const input = card.querySelector('input[name="traySuggestion"]');
      card.classList.toggle('is-selected', checked && input === checked);
    });
  };

  // Save to localStorage in the exact shape your ensureTraySelection() expects
  const persistSelection = (productId, label) => {
    try {
      localStorage.setItem('dw_tray_selection', JSON.stringify({ productId, value: label }));
    } catch {}
  };

  // When a suggestion is chosen, update hidden fields + localStorage
  const applySelection = (inputEl) => {
    if (!inputEl) return;
    const pid = inputEl.value || '';
    const w = Number(inputEl.dataset.w) || null;
    const l = Number(inputEl.dataset.l) || null;
    const h = Number(inputEl.dataset.h) || null;

    const label = makeLabel(w, l, h);
    if (hiddenId) hiddenId.value = pid;
    if (hiddenSize) hiddenSize.value = label;

    persistSelection(pid, label);
    applySelectedStyles();
  };

  // While typing, keep a provisional size label; a chosen suggestion will overwrite it
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

    const top = list.slice(0, 3);
    const radios = top.map((p, i) => {
      const id = `tray-suggest-${i}`;
      const dims = `${p.widthCm} × ${p.lengthCm} × ${p.heightCm} cm`;
      const price = (p.price != null) ? ` — ${Number(p.price).toFixed(2)} €` : '';
      const title = p.name || p.productId || 'Duschwanne';
      const value = p.productId || '';

      return `
        <label class="suggestion-card" for="${id}">
          <input type="radio"
                 id="${id}"
                 name="traySuggestion"
                 value="${value}"
                 data-w="${p.widthCm || ''}"
                 data-l="${p.lengthCm || ''}"
                 data-h="${p.heightCm || ''}"
                 ${i === 0 ? 'checked' : ''} />
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

    // initial apply (first is checked)
    const first = out.querySelector('input[name="traySuggestion"]:checked');
    if (first) applySelection(first);

    // change handler (one container listener)
    out.addEventListener('change', (e) => {
      if (e.target && e.target.name === 'traySuggestion') {
        applySelection(e.target);
      }
    }, { once: true });

    applySelectedStyles();
  }

  // ----- fetch logic (progressive) -----
  let inflight = null;
  let debounceT = null;

  async function fetchAndRender() {
    const b = elB ? parseNum(elB.value) : null;
    const l = elL ? parseNum(elL.value) : null;
    const h = elH ? parseNum(elH.value) : null;

    // If nothing typed, clear UI and try to restore persisted selection to hidden fields
    if (b === null && l === null && h === null) {
      out.innerHTML = '';
      try {
        const saved = JSON.parse(localStorage.getItem('dw_tray_selection') || 'null');
        if (saved?.productId) {
          if (hiddenId) hiddenId.value = saved.productId;
          if (hiddenSize) hiddenSize.value = saved.value || '';
        }
      } catch {}
      return;
    }

    const qs = new URLSearchParams();
    if (b !== null) qs.set('w', String(b));
    if (l !== null) qs.set('l', String(l));
    if (h !== null) qs.set('h', String(h));
    const url = `/api/trays/suggest?${qs.toString()}`;

    // cancel previous
    try { inflight?.abort?.(); } catch {}
    inflight = new AbortController();

    out.innerHTML = `<div class="meta">Suche… <code>${url}</code></div>`;

    try {
      const r = await fetch(url, { signal: inflight.signal, credentials: 'include' });
      const text = await r.text();
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
      out.innerHTML = `<div class="text-sm text-destructive">Netzwerkfehler</div><pre class="text-xs">${String(err)}</pre>`;
    }
  }

  const request = () => { clearTimeout(debounceT); debounceT = setTimeout(fetchAndRender, 160); };

  // Input listeners
  [elB, elL, elH].forEach(el => {
    if (!el) return;
    el.addEventListener('input', () => {
      updateTraySizeFromInputs();
      request();
    });
    el.addEventListener('change', request);
  });

  // Try to restore persisted selection immediately (hidden fields only)
  try {
    const saved = JSON.parse(localStorage.getItem('dw_tray_selection') || 'null');
    if (saved?.productId) {
      if (hiddenId) hiddenId.value = saved.productId;
      if (hiddenSize) hiddenSize.value = saved.value || '';
    }
  } catch {}

  // Kick off first search if there are prefilled values
  updateTraySizeFromInputs();
  request();

  // Expose debug (optional)
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
    return `
      <div style="display:grid; grid-template-columns: 1fr auto auto auto; gap:6px 10px; align-items:center;">
        <div style="font-size:12px;color:var(--muted)">Bezeichnung</div>
        <div style="font-size:12px;color:var(--muted);text-align:right">Menge</div>
        <div style="font-size:12px;color:var(--muted);text-align:right">Einzelpreis</div>
        <div style="font-size:12px;color:var(--muted);text-align:right">Gesamt</div>
        ${lines
          .map(
            (l) => `
          <div>${l.label ? l.label : l.name || l.productId || "-"}</div>
          <div style="text-align:right">${l.qty ?? 1}</div>
          <div style="text-align:right">${euroC(l.unitPrice ?? 0)}</div>
          <div style="text-align:right; font-weight:600">${euroC(
            l.lineTotal ?? 0
          )}</div>
        `
          )
          .join("")}
      </div>
    `;
  }

  function renderFromData(data) {
    if (!data) {
      container.innerHTML = '<div class="muted">Keine Daten</div>';
      return;
    }

    const optBody = listLines(
      (data.items || []).map((i) => ({
        productId: i.productId,
        name: i.productId,
        qty: i.qty,
        unitPrice: i.unitPrice,
        lineTotal: i.lineTotal,
      }))
    );
    const optCard = card(
      "Optional gewählte Produkte",
      optBody,
      `<div style="text-align:right"><b>Summe:</b> ${euroC(
        (data.items || []).reduce((a, x) => a + (x.lineTotal || 0), 0)
      )}</div>`
    );

    const matLines = (data.materials?.lines || []).map((l) => ({
      productId: l.productId || l.id,
      name: l.name,
      qty: l.qty,
      unitPrice: l.unitPrice,
      lineTotal: l.lineTotal,
      label: l.label,
    }));
    const matBody = listLines(matLines);
    const matCard = card(
      data.materials?.title || "Material",
      matBody,
      `<div style="text-align:right"><b>Summe Material:</b> ${euroC(
        data.materials?.sum || 0
      )}</div>`
    );

    const svcLines = (data.services?.lines || []).map((s) => ({
      productId: s.key,
      name: s.label,
      qty: 1,
      unitPrice: s.amount,
      lineTotal: s.amount,
    }));
    const svcBody = listLines(svcLines);
    const svcCard = card(
      data.services?.title || "Leistungen",
      svcBody,
      `<div style="text-align:right"><b>Summe Leistungen:</b> ${euroC(
        data.services?.sum || 0
      )}</div>`
    );

    const sums = `
      <div style="display:flex; flex-direction:column; gap:6px; align-items:flex-end;">
        <div>Produkte + Material: <b>${euroC(
          data.productsSubtotal || 0
        )}</b></div>
        <div>Leistungen: <b>${euroC(data.services?.sum || 0)}</b></div>
        <div>Aufschlag (${Math.round(
          (data.markupPct || 0) * 100
        )}%): <b>${euroC(data.markup || 0)}</b></div>
        <div style="font-size:1.05rem;">Zwischensumme: <b>${euroC(
          data.Nettobetrag || 0
        )}</b></div>
        <div style="font-size:1.2rem;">Gesamt: <b>${euroC(
          data.total || 0
        )}</b></div>
      </div>
    `;
    const totalsCard = card("Summen", sums);

    container.innerHTML = [matCard, optCard, svcCard, totalsCard].join("");
  }

  async function openKosten() {
    container.innerHTML = '<div class="muted">Berechne …</div>';
    if (window.__pricing) {
      renderFromData(window.__pricing);
    } else {
      await window.updatePricing?.();
      renderFromData(window.__pricing);
    }
  }

  window.addEventListener("hashchange", () => {
    if (getCurrentStep() === "kosten") openKosten();
  });
  if (getCurrentStep() === "kosten") openKosten();

  window.addEventListener("pricing:updated", (ev) => {
    if (getCurrentStep() === "kosten") {
      renderFromData(ev.detail || window.__pricing);
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
    const vat = Number(data?.vatOnNet ?? net * 0.19);
    const total = Number(data?.total ?? net + vat);
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
      outBonusTotal.textContent = fmt(anyBonus ? totalAfterBonus : 0);
  } catch (err) {
    console.error("[rabatt] setPricingData failed:", err);
  }
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
(function initOptionalMenus() {
  const map = {
    cat_SHOWER: "menu_SHOWER",
    cat_GRAB: "menu_GRAB",
    cat_FOLD: "menu_FOLD",
    cat_BASIN: "menu_BASIN",
    cat_BASIN_TAP: "menu_BASIN_TAP",
    cat_THERMO: "menu_THERMO",
    cat_SEAT: "menu_SEAT",
    // If you later add more main categories, list them here
  };

  const showPanel = (id, on) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.hidden = !on;
    el.setAttribute("aria-hidden", String(!on));
  };

  // Toggle menus based on main category checkboxes
  Object.entries(map).forEach(([catId, menuId]) => {
    const cat = document.getElementById(catId);
    if (!cat) return;
    const apply = () => showPanel(menuId, !!cat.checked);
    cat.addEventListener("change", apply);
    // initial state (in case of persisted checks)
    apply();
  });

  // Helper to wire each tile checkbox to its quantity wrapper
  function wireTileQty(tileCheckboxId, qtyWrapId) {
    const cb = document.getElementById(tileCheckboxId);
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
    apply();
  }

  // SHOWER
  wireTileQty("opt_V22WS1R", "qty_V22WS1R_wrap");
  wireTileQty("opt_TEMPDSU250", "qty_TEMPDSU250_wrap");
  wireTileQty("opt_V22BG903R", "qty_V22BG903R_wrap");
  wireTileQty("opt_DEDS2503E", "qty_DEDS2503E_wrap");

  // THERMO
  wireTileQty("opt_CLTB", "qty_CLTB_wrap");
  wireTileQty("opt_DEPTB", "qty_DEPTB_wrap");
  wireTileQty("opt_CLB", "qty_CLB_wrap");

  // GRAB
  wireTileQty("opt_CLPESG40", "qty_CLPESG40_wrap");
  wireTileQty("opt_CLPESG60", "qty_CLPESG60_wrap");
  wireTileQty("opt_CLPESG80", "qty_CLPESG80_wrap");

  // FOLD
  wireTileQty("opt_DEPSKG60", "qty_DEPSKG60_wrap");
  wireTileQty("opt_DEPSKG85", "qty_DEPSKG85_wrap");

  // SEAT
  wireTileQty("opt_DEPKS", "qty_DEPKS_wrap");

  // BASIN_TAP
  wireTileQty("opt_CL_BASIN", "qty_CL_BASIN_wrap");
  wireTileQty("opt_DEPOH", "qty_DEPOH_wrap");

  // BASIN (and its required accessories within the basin menu)
  wireTileQty("opt_CL60", "qty_CL60_wrap");

  // When Waschtisch (opt_CL60) is checked, show the “Erforderliches Zubehör” block and wire its tiles
  (function wireBasinRequired() {
    const wt = document.getElementById("opt_CL60");
    const reqWrap = document.getElementById("basinRequiredWrap");
    if (!wt || !reqWrap) return;

    const apply = () => {
      const on = !!wt.checked;
      reqWrap.hidden = !on;
      reqWrap.setAttribute("aria-hidden", String(!on));
      if (!on) {
        // Reset accessory qty wrappers
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
      }
    };
    wt.addEventListener("change", apply);
    apply();

    // Required accessory tiles inside basinRequiredWrap
    wireTileQty("opt_WTBF", "qty_WTBF_wrap");
    wireTileQty("opt_RSL", "qty_RSL_wrap");
    // Optional accessory (EV) within basin required box is optional; show qty when checked
    wireTileQty("opt_EV", "qty_EV_wrap");
  })();

  // Independent “Zubehör zum Waschtisch” section (menu_BASIN_ACC)
  wireTileQty("opt_WTBF__loose", "qty_WTBF__loose_wrap");
  wireTileQty("opt_RSL__loose", "qty_RSL__loose_wrap");
  wireTileQty("opt_EV__loose", "qty_EV__loose_wrap");
})();
document.addEventListener('DOMContentLoaded', () => {
  initSmartTraySearch();
  initTraySizeAutoLabel();
});

