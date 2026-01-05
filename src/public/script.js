// =================================================================
// #region 1. CONFIGURATION & STATE MANAGEMENT
// =================================================================
// --- Offer Catalog (single source of truth) ---
const OFFERS = {
  bu: {
    name: "BU · Badumbau",
    pages: [
      "Kundendaten",
      "Arbeitszeit",
      "Duschwanne",
      "Wandverkleidung",
      "Duschabtrennung",
      "Optional",
      "Rabatt",
      "Kosten",
      "Zusammenfassung",
      "admin",
      "services",
    ],
  },
  bwt: {
    name: "BWT · Badewannentür",
    pages: [
      "Kundendaten",
      "Arbeitszeit",
      "bwt",
      "Rabatt",
      "Kosten",
      "Zusammenfassung",
    ],
  },
  hl: {
    name: "HL · Handlauf",
    pages: ["Kundendaten", "Arbeitszeit", "hl", "Kosten", "Zusammenfassung"],
  },
  ah: {
    name: "AH · Alltagshilfe",
    pages: ["Kundendaten", "Arbeitszeit", "ah", "Kosten", "Zusammenfassung"],
  },
  hms: {
    name: "HMS · Hausmeisterservice",
    pages: ["Kundendaten", "Arbeitszeit", "hms", "Kosten", "Zusammenfassung"],
  },
  wd: {
    name: "WD · Winterdienst",
    pages: ["Kundendaten", "Arbeitszeit", "wd", "Kosten", "Zusammenfassung"],
  },
};

// === Central state for current offer + step (small helper) ===
const STATE_KEY = "konfigurator_state_v1";

function saveWizardState(offerType, step) {
  try {
    sessionStorage.setItem(
      STATE_KEY,
      JSON.stringify({ offerType: offerType || null, step: step || null }),
    );
  } catch {}
}

function loadWizardState() {
  try {
    const raw = sessionStorage.getItem(STATE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || typeof s !== "object") return null;
    return { offerType: s.offerType || null, step: s.step || null };
  } catch {
    return null;
  }
}

function clearWizardState() {
  try {
    sessionStorage.removeItem(STATE_KEY);
  } catch {}
}

// helper to get allowed pages for an offer type from OFFERS config
// helper to get allowed pages for an offer type from OFFERS config
function getPagesForOfferType(offerType) {
  const cfg = OFFERS && OFFERS[offerType];
  if (!cfg || !Array.isArray(cfg.pages)) return [];
  return cfg.pages.map((p) => (typeof p === "string" ? p : p.id));
}

const HOME_HASH = "#home";
let originalSetStep = null;
let originalGetCurrentStep = null;
let isApplyingState = false;

// Normalize a step so it is always valid for a given offer type
function normalizeStepForOffer(step, offerType) {
  const pages = getPagesForOfferType(offerType);
  if (!pages.length) return null;
  if (step && pages.includes(step)) return step;
  return pages[0];
}

// Apply a full wizard state (offerType + step) to the UI and persist it.
// This always:
//   - keeps currentOfferKey in sync
//   - redraws the sidebar via updateSidebarForOffer()
//   - navigates using the original setStep implementation
function applyWizardState(state) {
  if (!state || !state.offerType) return;

  const pages = getPagesForOfferType(state.offerType);
  if (!pages.length) return;

  const normalizedStep = normalizeStepForOffer(state.step, state.offerType);
  state.step = normalizedStep;

  // Persist to sessionStorage
  saveWizardState(state.offerType, normalizedStep);

  // Keep existing logic working
  currentOfferKey = state.offerType;
  if (typeof updateSidebarForOffer === "function") {
    updateSidebarForOffer();
  }

  if (!originalSetStep) return;

  isApplyingState = true;
  try {
    if (normalizedStep) {
      originalSetStep(normalizedStep);
    } else {
      originalSetStep("home");
    }
  } finally {
    isApplyingState = false;
  }
}

// Wrapper that is used everywhere instead of the raw setStep.
// It NEVER changes the offer type, only the step inside the current offer.
function setStepWithState(step) {
  // Explicit "back to start"
  if (step === "home") {
    goHomeWithoutOffer();
    return;
  }

  const state = loadWizardState() || {};

  // If we don't yet know an offer type, behave like the old logic
  if (!state.offerType) {
    if (originalSetStep) {
      originalSetStep(step);
    }
    return;
  }

  const pages = getPagesForOfferType(state.offerType);
  if (!pages.length) {
    if (originalSetStep) {
      originalSetStep(step);
    }
    return;
  }

  const validStep = normalizeStepForOffer(step, state.offerType);
  const nextState = {
    offerType: state.offerType,
    step: validStep,
  };

  applyWizardState(nextState);
}

// Wrapper for getCurrentStep that prefers the stored state,
// but falls back to the original hash-based behavior if there is none.
function getCurrentStepFromState() {
  const state = loadWizardState();
  if (state && state.step) return state.step;
  if (originalGetCurrentStep) {
    return originalGetCurrentStep();
  }
  return "home";
}

// Completely reset wizard state and go to the home screen.
// This is used when the user types "/#home" or "/" or explicitly navigates home.
function goHomeWithoutOffer() {
  if (window.__loadingOffer) {
    console.log("[goHomeWithoutOffer] suppressed during offer load");
    return;
  }
  clearWizardState();
  currentOfferKey = null;

  if (typeof updateSidebarForOffer === "function") {
    updateSidebarForOffer();
  }

  if (originalSetStep) {
    originalSetStep("home");
  }

  // Normalize the URL to "#home"
  if (location.hash !== HOME_HASH) {
    try {
      history.replaceState(null, "", HOME_HASH);
    } catch {
      location.hash = "home";
    }
  }
}

// Initial load: restore from sessionStorage + URL hash.
// - If URL is "/" or "/#home" → real home, no active offer.
// - If there is saved offerType + step → restore that wizard.
// - Any other weird hash without a saved offer → normalize to home.
function handleBoot() {
  if (window.__loadingOffer) {
    console.log("[handleBoot] skipped during offer load");
    return;
  }
  if (window.__loadingOffer) {
    return;
  }

  const state = loadWizardState();
  const hash = (location.hash || "").replace("#", "");
  const hasOffer = !!(state && state.offerType);
  const manualAllowed = ["", "home"];

  if (manualAllowed.includes(hash)) {
    // Always interpret bare "/" or "/#home" as a clean home screen
    goHomeWithoutOffer();
    return;
  }

  if (hasOffer) {
    const pages = getPagesForOfferType(state.offerType);
    let step = state.step;

    // If hash is a valid step for this offer, respect it (reload deep-link)
    if (hash && pages.includes(hash)) {
      step = hash;
    }

    applyWizardState({
      offerType: state.offerType,
      step,
    });
    return;
  }

  // No saved offer type and a non-home hash → normalize back to home
  goHomeWithoutOffer();
}

// Hash change: only allow home ("/#home") or valid pages for the current offer.
// Everything else is normalized back to the stored state or home.
function handleHashChange() {
  if (isApplyingState) {
    // This event was triggered by applyWizardState -> ignore
    return;
  }

  // ⬇️ NEW: do not fight programmatic navigation while an Angebot is loading
  if (window.__loadingOffer) {
    console.log("[handleHashChange] ignoring hashchange during offer load");
    return;
  }

  const state = loadWizardState();
  const hash = (location.hash || "").replace("#", "");
  const hasOffer = !!(state && state.offerType);
  const manualAllowed = ["", "home"];

  // Typing "/#home" or clearing the hash -> always go to a fresh home
  if (manualAllowed.includes(hash)) {
    goHomeWithoutOffer();
    return;
  }

  // Any non-home hash without an active offer is invalid.
  if (!hasOffer) {
    goHomeWithoutOffer();
    return;
  }

  const pages = getPagesForOfferType(state.offerType);
  if (!pages.length) {
    goHomeWithoutOffer();
    return;
  }

  // If hash is not one of the allowed pages for the current offer, revert to stored step
  if (!pages.includes(hash)) {
    applyWizardState(state);
    return;
  }

  // Valid step for the active offer => treat as navigation
  applyWizardState({
    offerType: state.offerType,
    step: hash,
  });
}
// #endregion

// =================================================================
// #region 2. GLOBAL UTILITIES (Formatting, Toasts, HTML)
// =================================================================
// --- GLOBAL: tolerant EUR money parser used across the Hassmann page ---
// Accepts "1.099,50", "1099.50", "€ 1 099,50", "12,2", "12.2" -> Number in euros
window.parseMoneyEuro = function (v) {
  let s = String(v ?? "").trim();
  if (!s) return 0;
  s = s.replace(/[^\d,.,,-]/g, "").replace(/\s+/g, ""); // keep digits , .
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) {
    // assume European: dots are thousands, comma is decimal
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (hasComma) {
    // single comma → decimal
    s = s.replace(",", ".");
  } else {
    // only dot → decimal (do not strip)
  }
  const n = parseFloat(s);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
};

// Global HTML escape helper (used by multiple modules)
function escapeHtml(str) {
  if (str == null) return "";
  const div = document.createElement("div");
  div.textContent = String(str);
  return div.innerHTML;
}
window.escapeHtml = escapeHtml;

// the toast helper
function ntToast(
  type,
  title,
  message,
  { duration = 3600, withBackdrop = true } = {},
) {
  const host = document.getElementById("nt-toaster");
  const backdrop = document.getElementById("nt-toast-backdrop");

  // Fallback if container missing
  if (!host) return alert([title, message].filter(Boolean).join("\n"));

  // Ensure strings
  const safeTitle = String(title ?? "");
  const safeMsg = String(message ?? "");

  const el = document.createElement("div");
  el.className = `nt-toast ${type || "info"}`;
  el.innerHTML = `
    <div class="nt-title">${safeTitle}</div>
    <button class="nt-close" aria-label="Schließen">×</button>
    ${safeMsg ? `<div class="nt-msg">${safeMsg}</div>` : ""}
  `;
  host.appendChild(el);

  // Backdrop
  if (withBackdrop && backdrop) {
    backdrop.hidden = false;
    requestAnimationFrame(() => {
      backdrop.style.opacity = "1";
      backdrop.style.pointerEvents = "auto";
    });
  }

  // enter animation
  requestAnimationFrame(() => el.classList.add("show"));

  const close = () => {
    el.classList.remove("show");
    setTimeout(() => el.remove(), 180);
    if (withBackdrop && backdrop) {
      backdrop.style.opacity = "0";
      backdrop.style.pointerEvents = "none";
      setTimeout(() => {
        backdrop.hidden = true;
      }, 180);
    }
  };

  el.querySelector(".nt-close")?.addEventListener("click", close);
  if (duration > 0) setTimeout(close, duration);
}

const toast = {
  success: (t, m, opts) => ntToast("success", t, m, opts),
  error: (t, m, opts) => ntToast("error", t, m, opts),
  info: (t, m, opts) => ntToast("info", t, m, opts),
  warn: (t, m, opts) => ntToast("warn", t, m, opts),
};

// top-level (once)
window.__restoring = false;
window.__RESTORING__ = false;

// #endregion

// =================================================================
// #region 3. UI HELPERS & TOGGLES
// =================================================================
// ----  HELPERS ----
// show sections with data-offer="..." only for the current offer
function updateOfferSpecificSections() {
  var offer = "";

  // Prefer the global helper you already expose
  if (typeof window.getCurrentOfferType === "function") {
    offer = window.getCurrentOfferType() || "";
  } else if (typeof loadWizardState === "function") {
    // Fallback: read from stored wizard state
    var state = loadWizardState();
    offer = state && state.offerType ? state.offerType : "";
  }

  offer = String(offer || "")
    .trim()
    .toLowerCase();

  document.querySelectorAll("[data-offer]").forEach(function (el) {
    var attr = (el.getAttribute("data-offer") || "").trim();
    if (!attr) return; // nothing to filter

    // support comma-separated list like "bu,bwt"
    var offers = attr
      .split(",")
      .map(function (s) {
        return s.trim().toLowerCase();
      })
      .filter(Boolean);

    var visible = offers.indexOf(offer) !== -1;
    el.style.display = visible ? "" : "none";
  });
}
function showToast(message, type = "info") {
  // If you have a proper toaster utility, call it here.
  // For now, simple fallback:
  if (window.showNiceToast) {
    window.showNiceToast(message, type);
  } else {
    console.log(`[${type}] ${message}`);
  }
}
// #endregion

// =================================================================
// #region 4. RESTORE LOGIC (Helpers for restoring form state)
// =================================================================
// ---- RESTORE HELPERS ----
function restoreBwtExtras(bwt) {
  const fs = document.getElementById("bwt-extras");
  if (!fs) return;

  const wrap = fs.querySelector(".da-items");
  if (!wrap) return;

  let rows = Array.from(wrap.querySelectorAll(".da-item"));
  if (!rows.length) return;

  const tplRow = rows[0];
  const items = Array.isArray(bwt?.quickAdd) ? bwt.quickAdd : [];

  // *** Handle empty items - just clear to one empty row ***
  if (items.length === 0) {
    // Remove all but first
    while (rows.length > 1) {
      const last = rows.pop();
      if (last) last.remove();
    }
    // Clear first row
    const first = rows[0];
    if (first) {
      const nameEl = first.querySelector(".da-name");
      const idEl = first.querySelector(".da-id");
      const qtyEl = first.querySelector(".da-qty");
      const priceEl = first.querySelector(".da-price");
      if (nameEl) nameEl.value = "";
      if (idEl) idEl.value = "";
      if (qtyEl) qtyEl.value = "";
      if (priceEl) priceEl.value = "";
    }
    return;
  }

  // shrink rows if there are more DOM rows than items
  while (rows.length > items.length && rows.length > 1) {
    const last = rows.pop();
    if (last) last.remove();
  }

  // grow rows if there are more items than DOM rows
  while (rows.length < items.length) {
    const clone = tplRow.cloneNode(true);
    wrap.appendChild(clone);
    rows.push(clone);
  }

  // fill each row
  rows.forEach((row, index) => {
    const data = items[index] || {};
    const nameEl = row.querySelector(".da-name");
    const idEl = row.querySelector(".da-id");
    const qtyEl = row.querySelector(".da-qty");
    const priceEl = row.querySelector(".da-price");

    const label = data.label ?? "";
    const pid = data.productId ?? "";
    const qty = data.qty ?? "";
    let price = data.price ?? "";

    if (typeof price === "number") {
      price = String(price).replace(".", ",");
    } else if (price !== "") {
      price = String(price);
    } else {
      price = "";
    }

    if (nameEl) nameEl.value = label;
    if (idEl) idEl.value = pid;
    if (qtyEl) qtyEl.value = qty !== "" ? String(qty) : "";
    if (priceEl) priceEl.value = price;
  });
}

function findInputByProductId(pid) {
  const host = document.getElementById("page-Wandverkleidung") || document;
  const lab = host.querySelector(`[data-product-id="${pid}"]`);
  return (
    lab?.querySelector('input[type="checkbox"],input[type="radio"]') || null
  );
}
function setByProductId(pid, on) {
  const input = findInputByProductId(pid);
  if (!input) return false;
  input.checked = !!on;
  if (typeof highlightTileForInput === "function") {
    highlightTileForInput(input, !!on);
  }
  if (!window.__RESTORING__) {
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }
  return true;
}
function enforceBudgetOptionsGroup() {
  const form = document.getElementById("form-Kundendaten");
  if (!form) return;

  const elMax = form.querySelector('input[name="budgetMax"]');
  const elTwo = form.querySelector('input[name="twoPersons"]');
  const elPremium = form.querySelector('input[name="premium"]');
  const elCopay = form.querySelector('input[name="budgetCopay"]');

  const mains = [elMax, elTwo, elPremium].filter(Boolean);

  // 1) Max one of [budgetMax, twoPersons, premium] checked
  const checkedMains = mains.filter((cb) => cb && cb.checked);
  if (checkedMains.length > 1) {
    // keep the first that is checked, uncheck the others
    const keep = checkedMains[0];
    mains.forEach((cb) => {
      if (cb && cb !== keep) cb.checked = false;
    });
  }

  // 2) budgetCopay only allowed if any of the 3 is checked
  const anyMain = mains.some((cb) => cb && cb.checked);

  if (elCopay) {
    elCopay.disabled = !anyMain;
    if (!anyMain && elCopay.checked) {
      elCopay.checked = false;
      // fire change so existing logic (applyCopay, pricing, widget) stays in sync
      if (typeof safeDispatch === "function") {
        safeDispatch(elCopay, "change");
      } else {
        elCopay.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
  }
}

function restoreBudgetPanel(Kundendaten) {
  if (!Kundendaten) return;
  const txt = String(Kundendaten.budgetOptionsPanel || "").toUpperCase();

  const elMax = document.querySelector('input[name="budgetMax"]');
  const elCop = document.querySelector('input[name="budgetCopay"]');
  const elTwo = document.querySelector('input[name="twoPersons"]');
  const elPremium = document.querySelector('input[name="premium"]');
  const copay = document.getElementById("copayAmount");

  // 1) Determine which main option should be checked
  let mainKey = null;

  // Prefer explicit flags from Kundendaten (from formToObject)
  if (
    Object.prototype.hasOwnProperty.call(Kundendaten, "premium") &&
    Kundendaten.premium
  ) {
    mainKey = "premium";
  } else if (
    Object.prototype.hasOwnProperty.call(Kundendaten, "twoPersons") &&
    Kundendaten.twoPersons
  ) {
    mainKey = "twoPersons";
  } else if (
    Object.prototype.hasOwnProperty.call(Kundendaten, "budgetMax") &&
    Kundendaten.budgetMax
  ) {
    mainKey = "budgetMax";
  } else {
    // Fallback to canonical text (for older payloads)
    if (/PREMIUM/.test(txt)) mainKey = "premium";
    else if (/(ZWEI|2 PERSONEN|8360)/.test(txt)) mainKey = "twoPersons";
    else if (/4180.*MAX/.test(txt)) mainKey = "budgetMax";
  }

  if (elMax) elMax.checked = mainKey === "budgetMax";
  if (elTwo) elTwo.checked = mainKey === "twoPersons";
  if (elPremium) elPremium.checked = mainKey === "premium";

  // 2) budgetCopay: just checked or not, based on stored payload
  if (elCop) {
    if (Object.prototype.hasOwnProperty.call(Kundendaten, "budgetCopay")) {
      // any truthy value (e.g. "4180 mit Zuzahlung") → checked
      elCop.checked = !!Kundendaten.budgetCopay;
    } else {
      // fallback for older payloads that only had budgetOptionsPanel
      elCop.checked = /4180.*(ZUZ|COPAY)/.test(txt);
    }
  }

  // 3) Copay amount
  if (copay) copay.value = (Kundendaten.copayAmount ?? "") + "";

  // 4) Enforce group rules after restoring from payload
  enforceBudgetOptionsGroup();

  // 5) Fire change on copay so applyCopay() and widgets sync with restored state
  if (elCop) {
    elCop.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

function safeDispatch(el, type) {
  if (!el) return;
  if (window.__RESTORING__) return; // <-- guard
  el.dispatchEvent(new Event(type, { bubbles: true }));
}

function setRadio(name, value) {
  if (value == null) return;
  const r = document.querySelector(
    `input[type="radio"][name="${name}"][value="${value}"]`,
  );
  if (r) {
    r.checked = true;
    safeDispatch(r, "change");
  }
}

function setCheckboxByName(name, on) {
  const el = document.querySelector(`input[type="checkbox"][name="${name}"]`);
  if (!el) return;
  el.checked = !!on;
  safeDispatch(el, "change");
}
function setCheckboxById(id, on) {
  const el = document.getElementById(id);
  if (!el) return;
  el.checked = !!on;
  safeDispatch(el, "change");
}

function setInputByNameOrId(key, val) {
  if (val == null) return;
  const el =
    document.querySelector(`[name="${key}"]`) || document.getElementById(key);
  if (!el) return;
  el.value = String(val);
  if (!window.__RESTORING__) {
    // <-- quiet during restore
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }
}
function setHiddenById(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  el.value = value == null ? "" : String(value);
  // no events on purpose
}
function ensureTrinitySealingSelectedFromPayload(dw) {
  // must have an array with a value including TRBDSET7
  const chosen = Array.isArray(dw?.floorSealing) ? dw.floorSealing : [];
  const hasTRBD = chosen.some((s) => String(s || "").includes("TRBDSET7"));
  if (!hasTRBD) return;

  const toggle = document.getElementById("addFlooring");
  const tile = document.getElementById("tile_TRBDSET7");
  const input = tile?.querySelector(
    'input[type="checkbox"][name="floorSealing[]"]',
  );

  const selectNow = () => {
    if (!input) return;

    // 1) make sure the section is open
    if (toggle && !toggle.checked) {
      toggle.checked = true;
      toggle.dispatchEvent(new Event("change", { bubbles: true }));
    }

    // 2) actually tick the TRBDSET7 tile
    if (!input.checked) {
      input.checked = true;
      // keep the picture tile UI in sync
      if (typeof highlightTileForInput === "function") {
        highlightTileForInput(input, true);
      }
      // persist “on” so future loads keep it checked
      try {
        localStorage.setItem("dw_floor_sealing", "1");
      } catch {}
      // notify any listeners that rely on change
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }
  };

  // Run it on the next tick, then once more after the flooring apply() likely ran
  queueMicrotask(selectNow);
  setTimeout(selectNow, 0);
}

function restoreTrinnityFloorSealing(dw) {
  if (!dw) return;

  const chosen = Array.isArray(dw.floorSealing) ? dw.floorSealing : [];
  const hasTRBD = chosen.some((s) => String(s || "").includes("TRBDSET7"));
  if (!hasTRBD) return;

  const form = document.getElementById("form-duschwanne");
  const toggle = document.getElementById("addFlooring");
  const tile = document.getElementById("tile_TRBDSET7");
  const input = tile?.querySelector(
    'input[type="checkbox"][name="floorSealing[]"]',
  );

  // 1) open the panel if needed
  if (toggle && !toggle.checked) {
    toggle.checked = true;
    toggle.dispatchEvent(new Event("change", { bubbles: true }));
  }

  // 2) tick the tile’s checkbox
  if (input && !input.checked) {
    input.checked = true;
    // keep the picture tile UI in sync
    if (typeof highlightTileForInput === "function")
      highlightTileForInput(input, true);
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  // 3) make sure pricing/UI reflect it immediately
  if (typeof window.updatePricing === "function") window.updatePricing();
}

function restoreFlooringSelections(dw) {
  if (!dw) return;
  const f = document.getElementById("form-duschwanne");
  if (!f) return;

  // Normalize a stored entry like "TRINNITY Bodenabdichtung TRBDSET7" → "TRBDSET7"
  const extractPid = (s) => {
    const m = String(s || "").match(/([A-Z0-9]{5,})\s*$/);
    return m ? m[1] : "";
  };

  // Tick a checkbox by either exact value or by productId found at end
  const checkByValueOrPid = (name, raw) => {
    const val = String(raw || "");
    const pid = extractPid(val);

    let input = f.querySelector(
      `input[name="${name}"][value="${CSS?.escape ? CSS.escape(val) : val}"]`,
    );
    if (!input && pid) {
      input = f.querySelector(
        `input[name="${name}"][value="${CSS?.escape ? CSS.escape(pid) : pid}"]`,
      );
    }
    if (!input && val) {
      // Last resort: match by label text
      const candidates = f.querySelectorAll(`input[name="${name}"]`);
      for (const i of candidates) {
        const lbl = i.closest("label");
        const text = (lbl?.textContent || "").trim();
        if (text.includes(val) || (pid && text.includes(pid))) {
          input = i;
          break;
        }
      }
    }

    if (input) {
      input.checked = true;
      // keep tile UI in sync
      if (typeof highlightTileForInput === "function") {
        highlightTileForInput(input, true);
      }
      input.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }
    return false;
  };

  const arr = {
    "flooringProduct[]": Array.isArray(dw.flooringProduct)
      ? dw.flooringProduct
      : [],
    "floorAdhesive[]": Array.isArray(dw.floorAdhesive) ? dw.floorAdhesive : [],
    "floorSealing[]": Array.isArray(dw.floorSealing) ? dw.floorSealing : [],
  };

  const anyFlooringChosen = Object.values(arr).some((a) => a && a.length);

  // Ensure the panel is open if something was chosen in the DB
  if (anyFlooringChosen) {
    const toggle = document.getElementById("addFlooring");
    if (toggle && !toggle.checked) {
      toggle.checked = true;
      toggle.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }

  // Apply each saved selection (this will re-check TRINNITY/TRBDSET7 too)
  Object.entries(arr).forEach(([name, list]) => {
    list.forEach((val) => checkByValueOrPid(name, val));
  });

  // Keep totals consistent
  if (typeof window.updatePricing === "function") {
    window.updatePricing();
  }
}

function setByNameOrId(nameOrId, value) {
  if (value === undefined || value === null) return;
  const el =
    document.querySelector(`[name="${nameOrId}"]`) ||
    document.getElementById(nameOrId);
  if (!el) return;

  const t = (el.type || "").toLowerCase();
  if (t === "checkbox") {
    el.checked = !!value;
    safeDispatch(el, "change");
    return;
  }
  if (t === "radio") {
    const r = document.querySelector(
      `[name="${nameOrId}"][value="${String(value)}"]`,
    );
    if (r) {
      r.checked = true;
      safeDispatch(r, "change");
    }
    return;
  }
  el.value = String(value);
  if (!window.__RESTORING__) {
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

function setSelect(nameOrId, value) {
  if (value === undefined || value === null) return;
  const el =
    document.querySelector(`[name="${nameOrId}"]`) ||
    document.getElementById(nameOrId);
  if (!el) return;
  el.value = String(value);
  safeDispatch(el, "change");
}

function restorePflegegradAndWohnumfeld(b) {
  if (!b) return;

  // hasPflegegrad + level
  if (b.hasPflegegrad) setRadio("hasPflegegrad", b.hasPflegegrad);
  if (b.pflegegrad != null && b.pflegegrad !== "") {
    setRadio("pflegegrad", String(b.pflegegrad));
  }

  // Wohnumfeld object is the source of truth
  const we = b.wohnumfeld || {};
  const done = !!we.done || b.wohnumfeldDone === "Ja";
  setRadio("wohnumfeldDone", done ? "Ja" : "Nein");

  if (we.application) {
    // e.g. 'Kunde', 'Sanitaer', 'Angehörige' – whatever your values are
    setRadio("wohnumfeldApplication", String(we.application));
  }

  const amount = we.amount ?? b.wohnumfeldAmount ?? 0;
  setInputByNameOrId("wohnumfeldAmount", amount);
}

function setNumber(nameOrId, value) {
  if (value === undefined || value === null) return;
  const el =
    document.querySelector(`[name="${nameOrId}"]`) ||
    document.getElementById(nameOrId);
  if (!el) return;
  el.value = String(value); // keep "0"
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

function setCheckbox(nameOrId, on) {
  const el =
    document.querySelector(`[name="${nameOrId}"]`) ||
    document.getElementById(nameOrId);
  if (!el) return;
  el.checked = !!on;
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

// #endregion

// =================================================================
// #region 5. AUTO-CALCULATION & FORMATTING WIRING & black white theme
// =================================================================
async function refetchAndRender() {
  const payload = buildPayload();
  const res = await fetch("/api/price", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  // Re-render Kosten-Details
  if (typeof renderFromData === "function") renderFromData(data);
  // If you have a dedicated Rabatt renderer, call it here too:
  if (typeof renderRabattPanel === "function") renderRabattPanel(data);
}

function wireDAQtyAutoFill() {
  const Pairs = [
    ["da-pendeltuer-preis", "da-pendeltuer-qty"],
    ["da-gleittuer-preis", "da-gleittuer-qty"],
    ["da-faltpendel-preis", "da-faltpendel-qty"],
    ["da-walkin-preis", "da-walkin-qty"],
  ];

  const clampQty = (v) => {
    const n = parseInt(String(v ?? "").trim(), 10);
    if (!Number.isFinite(n)) return "";
    return Math.max(1, n);
  };

  Pairs.forEach(([preisId, qtyId]) => {
    const p = document.getElementById(preisId);
    const q = document.getElementById(qtyId);
    if (!p || !q) return;

    p.addEventListener("input", () => {
      p.value = p.value.replace(/[^\d.,]/g, "");
      const val = window.parseMoneyEuro(p.value);
      if (val > 0) {
        if (!q.value) q.value = "1";
      } else {
        q.value = "";
      }
    });

    p.addEventListener("blur", () => {
      const val = window.parseMoneyEuro(p.value);
      if (val > 0) {
        p.value = val.toFixed(2).replace(".", ",");
        if (!q.value) q.value = "1";
      } else {
        p.value = "";
        q.value = "";
      }
    });

    q.addEventListener("input", () => {
      if (q.value === "") return; // allow empty while editing
      q.value = String(clampQty(q.value));
    });

    q.addEventListener("blur", () => {
      const val = window.parseMoneyEuro(p.value);
      if (!(val > 0)) q.value = "";
    });
  });
}

// Refresh when a panel becomes visible (by hash or tab click)
function autoRefreshOnEnter() {
  // 1) Hash-based navigation (#rabatt, #kosten-details, #debug …)
  window.addEventListener("hashchange", () => {
    const h = (location.hash || "").toLowerCase();
    if (h.includes("rabatt") || h.includes("kosten") || h.includes("debug")) {
      refetchAndRender();
    }
  });

  // 2) If you have explicit nav links:
  document
    .querySelectorAll('a[href*="#rabatt"], [data-panel="rabatt"]')
    .forEach((el) => {
      el.addEventListener("click", () => setTimeout(refetchAndRender, 0));
    });
  document
    .querySelectorAll(
      'a[href*="#kosten"], a[href*="#debug"], [data-panel="kosten-details"]',
    )
    .forEach((el) => {
      el.addEventListener("click", () => setTimeout(refetchAndRender, 0));
    });

  // 3) Bonus checkbox itself should also re-render on change
  document.getElementById("rb-bonus-grab")?.addEventListener("change", () => {
    refetchAndRender();
  });
}

// Call once on startup (after DOM ready)
document.addEventListener("DOMContentLoaded", autoRefreshOnEnter);

// Recompute prices on the server and re-render both Debug + Rabatt UIs
async function recomputeAndRefresh() {
  try {
    const payload = collectFormPayload(); // <-- your existing form->payload function
    const res = await fetch("/api/price", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    // keep a global for debugging if you like
    window.__pricing = data;

    // Debug pane
    await renderFromData(data);

    // Rabatt pane (if you have a renderer; otherwise just update fields here)
    if (typeof renderRabattFromData === "function") {
      renderRabattFromData(data);
    } else {
      // minimal fill if you don’t have a dedicated function
      const rbAfter = document.getElementById("rb-total-after");
      if (rbAfter) rbAfter.textContent = euroC(data.total || 0);
      const rbVat = document.getElementById("rb-vat");
      if (rbVat) rbVat.textContent = euroC(data.vatOnNet || 0);
    }
  } catch (e) {
    console.warn("[recomputeAndRefresh] failed:", e);
  }
}

// Install listeners so entering the sections auto-refreshes latest data
function installAutoRefreshOnNav() {
  // Hash-based navigation support: e.g. #rabatt, #kosten-details
  window.addEventListener("hashchange", () => {
    const id = (location.hash || "").replace(/^#/, "");
    if (id === "rabatt" || id === "kosten") {
      setTimeout(() => window.updatePricing?.(), 0);
    }
  });

  // If you have explicit nav buttons/tabs, hook them too
  const rabTab = document.querySelector(
    '[data-target="#rabatt"], #nav-rabatt, a[href="#rabatt"]',
  );
  const kostTab = document.querySelector(
    '[data-target="#kosten"], #nav-kosten, a[href="#kosten"]',
  );

  [rabTab, kostTab].forEach((el) => {
    if (!el) return;
    el.addEventListener("click", () =>
      setTimeout(() => window.updatePricing?.(), 0),
    );
  });
}

// call once on load
installAutoRefreshOnNav();

function wireDurationAutoFormat(target) {
  const el =
    typeof target === "string" ? document.getElementById(target) : target;
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
        "0",
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
        "0",
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

(function initBwtSteelAutoNote() {
  const form = document.getElementById("form-bwt");
  if (!form) return;

  const matRadios = form.querySelectorAll('input[name="bwtMaterial"]');
  const steelCheckbox = document.getElementById("bwtSteelNoteEnabled");

  if (!matRadios.length || !steelCheckbox) return;

  function apply() {
    const selected = form.querySelector('input[name="bwtMaterial"]:checked');
    const val = (selected?.value || "").toLowerCase();
    const isSteel = val.includes("stahl") && val.includes("email"); // matches "Stahl emailliert"

    if (isSteel) {
      // auto-check if not already; but do NOT auto-uncheck if user manually ticks it
      if (!steelCheckbox.checked) {
        steelCheckbox.checked = true;
        steelCheckbox.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
  }

  matRadios.forEach((r) => r.addEventListener("change", apply));

  // initial, in case a material was already restored/selected
  apply();
})();

(function initColorThemes() {
  const THEME_KEY = "emc2.theme";
  const MODE_KEY = "emc2.mode";

  const root = document.documentElement;
  const themeSelect = document.getElementById("themeSelect");
  const modeToggle = document.getElementById("modeToggle");
  const themeLabel = document.getElementById("themeLabel");

  const offerDefaults = {
    bu: "wohnen",
    bwt: "gesundheit",
    ah: "pflege",
    hl: "pflege",
    kfz: "kfz",
  };

  function setTheme(theme, { save = true } = {}) {
    if (!theme) return;
    root.dataset.theme = theme;

    if (themeSelect) themeSelect.value = theme;

    if (save) {
      try {
        localStorage.setItem(THEME_KEY, theme);
      } catch {}
    }
  }

  function setMode(mode, { save = true } = {}) {
    if (!mode) return;
    root.dataset.mode = mode;

    if (modeToggle) modeToggle.checked = mode === "dark";
    if (themeLabel) themeLabel.textContent = mode === "dark" ? "Dark" : "Light";

    if (save) {
      try {
        localStorage.setItem(MODE_KEY, mode);
      } catch {}
    }
  }

  function detectOfferType() {
    // adapt if you have a better source for active offer
    if (window.currentOfferType) return window.currentOfferType;
    const el = document.querySelector("[data-offer-type-current]");
    return el?.getAttribute("data-offer-type-current") || "bu";
  }

  function initFromDefaults() {
    let theme = null;
    let mode = null;

    try {
      theme = localStorage.getItem(THEME_KEY);
      mode = localStorage.getItem(MODE_KEY);
    } catch {}

    if (!theme) {
      const offer = String(detectOfferType() || "").toLowerCase();
      theme = offerDefaults[offer] || "base";
    }

    if (!mode) mode = "light";

    setTheme(theme, { save: false });
    setMode(mode, { save: false });
  }

  if (themeSelect) {
    themeSelect.addEventListener("change", (e) => {
      setTheme(e.target.value);
    });
  }

  if (modeToggle) {
    modeToggle.addEventListener("change", (e) => {
      setMode(e.target.checked ? "dark" : "light");
    });
  }

  initFromDefaults();
})();

document.addEventListener("DOMContentLoaded", () => {
  wireDurationAutoFormat("laborHours");
  wireDurationAutoFormat("travelTime");
});

// Replace your current DOMContentLoaded block that defines updateTotalHours with this:
document.addEventListener("DOMContentLoaded", () => {
  const laborEl = document.getElementById("laborHours"); // Arbeitszeit (HH:MM)
  const travelEl = document.getElementById("travelTime"); // Reisezeit (one-way, HH:MM)
  const outEl = document.getElementById("totalHoursHHMM");

  function updateTotalHours() {
    // Parse inputs (HH:MM -> decimal hours)
    const arbeitsH = hhmmToHours(laborEl?.value || "0:00");
    const reiseOneH = hhmmToHours(travelEl?.value || "0:00");

    // Daily cap after travel (10h/day total − 2× one-way travel)
    const capPerDayH = 9.75 - 2 * reiseOneH;

    let days = 0;
    let totalH = 0;
    let infeasible = false;

    if (arbeitsH <= 0) {
      // No work => no days, no time
      days = 0;
      totalH = 0;
    } else if (capPerDayH > 0) {
      // How many days needed to fit all work under daily cap
      days = Math.ceil(arbeitsH / capPerDayH);
      // Total time across all days = pure work + per-day travel
      totalH = arbeitsH + days * (2 * reiseOneH);
    } else {
      // No time left for work once travel is counted
      infeasible = true;
      days = 0;
      totalH = 0;
    }

    // Render line: total HH:MM + number of days (+ warning if infeasible)
    if (outEl) {
      const totalHHMM = hoursToHHMM(totalH);
      const daysHTML = ` • Arbeitstage: <strong>${days}</strong>`;
      const warnHTML = infeasible
        ? ` <span style="color:var(--danger)">&nbsp;⚠️ Reisezeit zu lang für 09:45 h/Tag – bitte Zeiten prüfen.</span>`
        : "";
      outEl.innerHTML = `Gesamtzeit (Arbeit + Fahrt): <strong>${totalHHMM}</strong>${daysHTML}${warnHTML}`;
    }

    // Expose numeric mirrors (useful for payload/pricing)
    // - total_hours_numeric: total time (work + all travel across days)
    // - reise_hours_numeric: total travel time across all days
    // - arbeit_hours_numeric: pure work time
    const totalTravelH = days * (2 * reiseOneH);
    window.total_hours_numeric = Math.max(0, totalH);
    window.reise_hours_numeric = Math.max(0, totalTravelH);
    window.arbeit_hours_numeric = Math.max(0, arbeitsH);
  }
  // --- wiring specifically for Arbeitszeit page ---
  function wireArbeitszeitInputs() {
    const page = document.getElementById("page-Arbeitszeit");
    if (!page) return;

    const laborEl = page.querySelector("#laborHours");
    const travelEl = page.querySelector("#travelTime");

    if (!laborEl || !travelEl) return;

    // avoid duplicates
    laborEl.removeEventListener("input", updateTotalHours);
    laborEl.removeEventListener("blur", updateTotalHours);
    travelEl.removeEventListener("input", updateTotalHours);
    travelEl.removeEventListener("blur", updateTotalHours);

    laborEl.addEventListener("input", updateTotalHours);
    laborEl.addEventListener("blur", updateTotalHours);
    travelEl.addEventListener("input", updateTotalHours);
    travelEl.addEventListener("blur", updateTotalHours);

    // initial render
    updateTotalHours();
  }

  // make them accessible from other scripts
  window.updateTotalHours = updateTotalHours;
  window.wireArbeitszeitInputs = wireArbeitszeitInputs;

  // try once after DOM is ready (if page is already in DOM)
  document.addEventListener("DOMContentLoaded", wireArbeitszeitInputs);
  // Live updates
  laborEl?.addEventListener("input", updateTotalHours);
  laborEl?.addEventListener("blur", updateTotalHours);
  travelEl?.addEventListener("input", updateTotalHours);
  travelEl?.addEventListener("blur", updateTotalHours);

  // Initial paint
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
    "downloadLatexPdf",
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
//const laborNumeric = typeof hhmmToHours === "function"? Math.max(0, hhmmToHours())  //Math.ceil(laborHHMM * 100) / 100;: (() => {const m = laborHHMM.match(/^(\d+):([0-5]\d)$/);return m ? Number(m[1]) + Number(m[2]) / 60 : 0;})();

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
  applyTheme(themeToggle.checked ? "dark" : "light"),
);

// #endregion

// =================================================================
// #region 6. NAVIGATION & SIDEBAR LOGIC
// =================================================================
/* ========== NAVIGATION ========== */
// Build the global "steps" list from OFFERS so OFFERS is the only source of truth
const ALL_PAGES = Array.from(
  new Set(Object.values(OFFERS).flatMap((offer) => offer.pages)),
);

// "steps" is just the union of all pages across all offers plus "home"
const steps = ["home", ...ALL_PAGES, "admin", "services"];

const pages = Object.fromEntries(
  steps.map((s) => [s, document.getElementById("page-" + s)]),
);
const nav = document.getElementById("stepsNav");
const sideMenu = document.getElementById("sideMenu");

// Currently active offer key (e.g. "bu", "bwt"), or null when no flow is active
let currentOfferKey = null;

// ============================================================
// UPDATED resetAllForms() - Complete localStorage + DOM cleanup
// ============================================================
function resetAllForms() {
  const formIds = [
    "form-Kundendaten",
    "form-Arbeitszeit",
    "form-duschwanne",
    "form-wandverkleidung",
    "form-duschabtrennung",
    "form-optional",
    "form-rabatt",
    "form-bwt",
    "form-hl",
    "form-admin",
    "form-as",
    "form-ah",
    "form-hms",
    "form-wd",
  ];

  // 1) Reset all forms back to their HTML defaults
  formIds.forEach((id) => {
    const form = document.getElementById(id);
    if (form && typeof form.reset === "function") {
      form.reset();
    }
  });

  // 2) Clear ALL localStorage keys used by repeaters/persisted UI state
  const localStorageKeysToClear = [
    // Duschwanne
    "dwExtraTasks:v1",
    "dw_tray_selection",
    "dw_floor_area",
    "dw_floor_sealing",

    // Duschabtrennung (Hassmann)
    "daQuickAddRows:v1",

    // Optional
    "optQuickAddRows:v1",
    "basin_required_state",

    // BWT
    "bwtExtraTasks:v1",

    // WV (if any future persistence)
    "wv_state",
  ];

  localStorageKeysToClear.forEach((key) => {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      console.warn("[resetAllForms] failed to clear localStorage key:", key, e);
    }
  });

  // 3) Clear sessionStorage keys
  const sessionStorageKeysToClear = ["dw_tray_touched"];

  sessionStorageKeysToClear.forEach((key) => {
    try {
      sessionStorage.removeItem(key);
    } catch (e) {}
  });

  // 4) Explicitly reset all repeater DOMs (form.reset() doesn't remove dynamic rows)
  resetAllRepeaterDOMs();

  // 5) Re-apply selection/quantity logic for ALL toggles
  try {
    window.__restoring = true;
    window.__RESTORING__ = true;
  } catch (e) {}

  const toggles = document.querySelectorAll(
    'input[type="checkbox"], input[type="radio"]',
  );
  toggles.forEach((el) => {
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });

  try {
    window.__restoring = false;
    window.__RESTORING__ = false;
  } catch (e) {}

  // 6) One clean pricing refresh after reset
  window.updatePricing?.();

  // 7) Reset the summary widget
  if (typeof updateSummaryWidgetName === "function") {
    updateSummaryWidgetName();
  }
  if (typeof updateSummaryWidgetSelfPay === "function") {
    updateSummaryWidgetSelfPay(null);
  }
  if (typeof updateSummaryWidgetTotal === "function") {
    updateSummaryWidgetTotal(null);
  }
  if (typeof updateSummaryWidgetSubsidyVisibility === "function") {
    updateSummaryWidgetSubsidyVisibility();
  }
}

// ============================================================
// NEW HELPER: Reset all repeater DOMs to clean state
// ============================================================
function resetAllRepeaterDOMs() {
  // --- DW Extra Tasks ---
  if (typeof window.restoreDWExtraTasksFromPayload === "function") {
    window.restoreDWExtraTasksFromPayload({ extraTasks: [] });
  } else {
    // Fallback: manually clear
    const dwExtraWrap = document.querySelector("#dw-extra-tasks .da-items");
    if (dwExtraWrap) {
      const rows = dwExtraWrap.querySelectorAll(".da-item");
      rows.forEach((row, idx) => {
        if (idx > 0) {
          row.remove();
        } else {
          const input = row.querySelector(".dw-extra");
          if (input) input.value = "";
        }
      });
    }
  }

  // --- BWT Extra Arbeitszeit ---
  if (typeof window.restoreBwtExtraArbeitszeitFromPayload === "function") {
    window.restoreBwtExtraArbeitszeitFromPayload({ extraTasks: [] });
  } else {
    // Fallback: manually clear
    const bwtAzWrap = document.querySelector(
      "#bwtAzExtraFieldset .bwt-az-items",
    );
    if (bwtAzWrap) {
      const rows = bwtAzWrap.querySelectorAll(".bwt-az-item");
      rows.forEach((row, idx) => {
        if (idx > 0) {
          row.remove();
        } else {
          const durEl = row.querySelector(".bwt-az-duration");
          const taskEl = row.querySelector(".bwt-az-task");
          if (durEl) durEl.value = "";
          if (taskEl) taskEl.value = "";
        }
      });
    }
  }

  // --- Hassmann Quick-Add (Duschabtrennung) ---
  document
    .querySelectorAll("section.da-quickadd fieldset.da-row[data-kind]")
    .forEach((fs) => {
      const wrap = fs.querySelector(".da-items");
      if (!wrap) return;

      const rows = Array.from(wrap.querySelectorAll(".da-item"));
      rows.forEach((row, idx) => {
        if (idx > 0) {
          row.remove();
        } else {
          // Clear the first row's inputs
          const priceEl = row.querySelector(".da-price");
          const qtyEl = row.querySelector(".da-qty");
          const idEl = row.querySelector(".da-id");
          const nameEl = row.querySelector(".da-name");
          if (priceEl) priceEl.value = "";
          if (qtyEl) qtyEl.value = "";
          if (idEl) idEl.value = "";
          if (nameEl) nameEl.value = "";
        }
      });
    });

  // --- BWT Extras (Freier Posten) ---
  const bwtExtrasFs = document.getElementById("bwt-extras");
  if (bwtExtrasFs) {
    const wrap = bwtExtrasFs.querySelector(".da-items");
    if (wrap) {
      const rows = Array.from(wrap.querySelectorAll(".da-item"));
      rows.forEach((row, idx) => {
        if (idx > 0) {
          row.remove();
        } else {
          const nameEl = row.querySelector(".da-name");
          const idEl = row.querySelector(".da-id");
          const qtyEl = row.querySelector(".da-qty");
          const priceEl = row.querySelector(".da-price");
          if (nameEl) nameEl.value = "";
          if (idEl) idEl.value = "";
          if (qtyEl) qtyEl.value = "";
          if (priceEl) priceEl.value = "";
        }
      });
    }
  }

  // --- Optional Sonderprodukte ---
  const optSonderPanel =
    document.getElementById("optSonderPanel") ||
    document.getElementById("opt-sonder");
  if (optSonderPanel) {
    const rowsContainer =
      optSonderPanel.querySelector(".da-items") || optSonderPanel;
    const rows = Array.from(rowsContainer.querySelectorAll(".da-item"));
    rows.forEach((row, idx) => {
      if (idx > 0) {
        row.remove();
      } else {
        const nameEl = row.querySelector(".opt-name");
        const idEl = row.querySelector(".opt-id");
        const qtyEl = row.querySelector(".opt-qty");
        const priceEl = row.querySelector(".opt-price");
        if (nameEl) nameEl.value = "";
        if (idEl) idEl.value = "";
        if (qtyEl) qtyEl.value = "";
        if (priceEl) priceEl.value = "";
      }
    });
  }

  // --- Basin Accessories ---
  // Reset checkbox + qty states (the localStorage is already cleared)
  ["opt_WTBF", "opt_RSL", "opt_EV"].forEach((id) => {
    const cb = document.getElementById(id);
    if (cb) cb.checked = false;
  });
  ["qty_WTBF", "qty_RSL", "qty_EV"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "0";
  });

  // --- Tray Search Suggestions ---
  const traySuggestions = document.getElementById("tray-suggestions");
  if (traySuggestions) {
    traySuggestions.innerHTML = "";
  }
  const chosenTrayPid = document.getElementById("chosenTrayProductId");
  if (chosenTrayPid) chosenTrayPid.value = "";
  const traySize = document.getElementById("traySize");
  if (traySize) traySize.value = "";

  // --- Floor Area ---
  const floorArea = document.getElementById("floorArea");
  if (floorArea) floorArea.value = "";
}

// Effective list of steps used for prev/next navigation
function getFlowSteps() {
  if (currentOfferKey && OFFERS[currentOfferKey]) {
    return OFFERS[currentOfferKey].pages;
  }
  return steps;
}

// Show only the pages for the active offer in the sidebar
// Refresh sidebar based on current state (offerType + step)
function updateSidebarForOffer() {
  if (!sideMenu) return;

  // Read current state (what we already use for routing)
  const state = loadWizardState();
  const activeOffer = state && state.offerType;
  const activeStep = state && state.step;

  // Show/hide sections that are specific to an offer (data-offer="...")
  if (typeof updateOfferSpecificSections === "function") {
    updateOfferSpecificSections();
  }

  // Clear existing sidebar items
  sideMenu.innerHTML = "";

  // Helper to create a <a class="side-link"> with the same structure as before
  function makeLink(stepId, label) {
    const a = document.createElement("a");
    a.className = "side-link";
    a.href = `#${stepId}`;
    a.dataset.step = stepId;

    const dot = document.createElement("div");
    dot.className = "dot";

    const span = document.createElement("span");
    span.textContent = label;

    a.appendChild(dot);
    a.appendChild(span);

    return a;
  }

  // --- Always render "Auswahl der Leistung" as first item ---
  const homeNav = nav?.querySelector(
    'a.step[data-step="Auswahl der Leistung"]',
  );
  const homeLabel = homeNav
    ? homeNav.textContent.trim()
    : "Auswahl der Leistung";
  sideMenu.appendChild(makeLink("home", homeLabel));

  // If no offer is selected, we stop here → only Auswahl der Leistung is shown.
  if (!activeOffer) {
    return;
  }

  // --- Render only the pages that belong to the active offer ---
  // --- Render only the pages that belong to the active offer ---
  const pages = getPagesForOfferType(activeOffer);

  const normalPages = pages.filter(
    (pageId) =>
      pageId !== "home" && pageId !== "admin" && pageId !== "services",
  );

  const specialLabels = {
    bwt: "BWT",
    hl: "HL",
  };

  normalPages.forEach((pageId) => {
    const navLink = nav?.querySelector(`a.step[data-step="${pageId}"]`);
    let label = navLink ? navLink.textContent.trim() : pageId;

    if (specialLabels[pageId]) {
      label = specialLabels[pageId];
    }

    sideMenu.appendChild(makeLink(pageId, label));
  });

  const adminPages = pages.filter(
    (pageId) => pageId === "admin" || pageId === "services",
  );
  if (adminPages.length) {
    const group = document.createElement("div");
    group.className = "accordion-group";

    const header = document.createElement("button");
    header.type = "button";
    header.className = "accordion-header";
    header.setAttribute("aria-expanded", "false");

    const titleSpan = document.createElement("span");
    titleSpan.textContent = "Developer";

    const chevron = document.createElement("span");
    chevron.className = "accordion-chevron";
    chevron.textContent = "›";

    header.appendChild(titleSpan);
    header.appendChild(chevron);

    const body = document.createElement("div");
    body.className = "accordion-body";

    adminPages.forEach((pageId) => {
      const navLink = nav?.querySelector(`a.step[data-step="${pageId}"]`);
      const label = navLink ? navLink.textContent.trim() : pageId;
      body.appendChild(makeLink(pageId, label));
    });

    header.addEventListener("click", () => {
      const isOpen = body.classList.toggle("open");
      header.setAttribute("aria-expanded", isOpen ? "true" : "false");
    });

    if (adminPages.includes(activeStep)) {
      body.classList.add("open");
      header.setAttribute("aria-expanded", "true");
    }

    group.appendChild(header);
    group.appendChild(body);
    sideMenu.appendChild(group);
  }

  // NOTE:
  // We do NOT set "active" / "done" classes here.
  // originalSetStep (called via applyWizardState / setStepWithState)
  // will take care of toggling .active / .done on both nav and sidebar,
  // exactly as before.
}
// Start a flow for a given offer and jump to its first page
function startOfferFlow(offerKey) {
  if (!OFFERS[offerKey]) return;

  // Fresh start for this offer: clear all forms back to their HTML defaults
  resetAllForms();

  const pages = getPagesForOfferType(offerKey);
  if (!pages.length) return;

  const first = pages[0] || null;

  applyWizardState({
    offerType: offerKey,
    step: first,
  });
}
function getCurrentStep() {
  const h = location.hash.replace("#", "");
  return steps.includes(h) ? h : steps[0];
}
function setStep(step) {
  console.log("[setStep] called with", step);
  console.trace("[setStep] stack");

  const flowSteps = getFlowSteps(); // pages for the current offer (or all steps if none)
  const progressIndex = flowSteps.indexOf(step);
  function isDoneInFlow(s) {
    if (step === "home") return false;
    if (s === "home") {
      return progressIndex >= 0;
    }
    const idx = flowSteps.indexOf(s);
    return progressIndex >= 0 && idx >= 0 && idx < progressIndex;
  }

  // --- rest of your existing setStep stays exactly as it is ---
  // 1) Show/hide pages
  steps.forEach((s) => {
    if (pages[s]) {
      pages[s].hidden = s !== step;
    }
  });

  // 2) Top navigation
  steps.forEach((s) => {
    const link = nav?.querySelector(`[data-step="${s}"]`);
    if (!link) return;

    const isActive = s === step;
    const isDone = isDoneInFlow(s);

    link.classList.toggle("active", isActive);
    link.classList.toggle("done", isDone);
  });

  // 3) Left sidebar
  const sideLinks = sideMenu?.querySelectorAll(".side-link");
  sideLinks?.forEach((sideLink) => {
    const s = sideLink.dataset.step;
    const isActive = s === step;
    const isDone = isDoneInFlow(s);

    sideLink.classList.toggle("active", isActive);
    sideLink.classList.toggle("done", isDone);
  });

  // 4) URL + summary + pricing refresh
  location.hash = step;
  updateSummary();

  if (step === "rabatt" || step === "kosten") {
    setTimeout(() => window.updatePricing?.(), 0);
    setTimeout(() => window.refreshAllPanels?.(), 0);
  }
}

// --- CENTRAL WIZARD STATE WIRING (offer type + step) ---
// Capture the original navigation functions so we can delegate to them
originalSetStep = setStep;
originalGetCurrentStep = getCurrentStep;

// Replace them with the state-aware wrappers
setStep = window.setStep = setStepWithState;
getCurrentStep = window.getCurrentStep = getCurrentStepFromState;

// Small helper so other code can ask which offer is active
window.getCurrentOfferType = function () {
  const s = loadWizardState();
  return s ? s.offerType : null;
};

nav?.addEventListener("click", (e) => {
  const a = e.target.closest("a.step");
  if (!a) return;
  e.preventDefault();
  setStep(a.dataset.step);
});
// Initial boot: restore offer type + step + sidebar
handleBoot();

// React to manual URL changes / back-forward strictly
window.addEventListener("hashchange", handleHashChange);
// #endregion
// =================================================================
// #region 7. PAYLOAD COLLECTION (Reading the forms)
// =================================================================

/* ========== PAYLOAD / SUMMARY / STATUS ========== */
function formToObject(form) {
  const fd = new FormData(form);
  const obj = {};

  for (const [key, value] of fd.entries()) {
    if (key in obj) {
      // convert to array on second occurrence
      if (!Array.isArray(obj[key])) obj[key] = [obj[key]];
      obj[key].push(value);
    } else {
      obj[key] = value;
    }
  }

  // Optional: normalize keys ending with [] to always be arrays
  for (const k of Object.keys(obj)) {
    if (k.endsWith("[]") && !Array.isArray(obj[k])) obj[k] = [obj[k]];
  }

  return obj;
}


// collector for Wandverkleidung ---
function collectWandverkleidungMaterials(doc) {
  const page = document.getElementById("page-Wandverkleidung");
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

// collector for BWT (Badewannentür) – door + Haltegriffe
function collectBwtMaterials(doc) {
  const page = document.getElementById("page-bwt");
  if (!page) return;

  const out = [];

  // Tür-Typen helper
  function pushDoor(cbId, qtyId, fallbackName) {
    const cb = page.querySelector(cbId);
    const qtyEl = page.querySelector(qtyId);
    if (!cb || !qtyEl || !cb.checked) return;

    const qty = parseInt(qtyEl.value || "0", 10);
    if (!qty) return;

    const productId = cb.getAttribute("data-product-id") || "";
    out.push({
      productId: productId || null,
      name: cb.value || fallbackName,
      qty,
    });
  }

  // All BWT door variants
  pushDoor("#bwtDoorStd", "#bwtDoorStdQty", "Universal / Standard Tür");
  pushDoor("#bwtDoorBudget", "#bwtDoorBudgetQty", "Budget Tür - Verona");
  pushDoor(
    "#bwtDoorIndWienGlas",
    "#bwtDoorIndWienGlasQty",
    "Individual Tür - Wien Glas",
  );
  pushDoor("#bwtDoorVariodoor", "#bwtDoorVariodoorQty", "Variodoor");
  pushDoor("#bwtDoorIndWien", "#bwtDoorIndWienQty", "Individual Tür - Wien");

  // Haltegriffe helper
  function pushHg(cbSel, qtySel, productId, friendlyName) {
    const cb = page.querySelector(cbSel);
    const qtyEl = page.querySelector(qtySel);
    if (!cb || !cb.checked) return;
    const qty = parseInt((qtyEl && qtyEl.value) || "0", 10);
    if (!qty) return;

    out.push({
      productId,
      name: friendlyName,
      qty,
    });
  }

  // Map to the same productIds you use in pricing.js
  pushHg(
    "#bwtAidsHaltegriff40",
    "#bwtAidsHaltegriff40Qty",
    "CLPESG40",
    "Haltegriff 40 cm",
  );
  pushHg(
    "#bwtAidsHaltegriff60",
    "#bwtAidsHaltegriff60Qty",
    "CLPESG60",
    "Haltegriff 60 cm",
  );
  pushHg(
    "#bwtAidsHaltegriff80",
    "#bwtAidsHaltegriff80Qty",
    "CLPESG80",
    "Haltegriff 80 cm",
  );

  if (!out.length) return;

  if (!doc.materials) doc.materials = [];
  doc.materials.push(...out);
}
// --- Duschabtrennung Quick-Add (Hassmann) collector ---
// Mirrors wireDuschabtrennungQuickAdd(): only add when price > 0,
// default qty to 1 when price is given but qty is empty/0.
// Collects all rows from the 5 quick-add fieldsets and writes payload.duschabtrennung.quickAdd
function collectDuschabtrennungQuickAdd(doc) {
  const root = document.querySelector("section.da-quickadd");
  if (!root) return;

  // Canonical label per kind (used for every row — no DOM-derived labels)
  const KIND_TO_LABEL = {
    pendeltuer: "Pendeltür Hassmann",
    gleittuer: "Gleittür Hassmann",
    faltpendel: "Falt-Pendeltür Hassmann",
    walkin: "Walk-In Hassmann",
    sonder: "Sonderduschabtrennung Hassmann",
  };

  const qa = [];

  root.querySelectorAll("fieldset.da-row").forEach((fs) => {
    const kind = fs.dataset.kind || "";
    const isCustom = kind === "custom";
    const canonicalLabel = KIND_TO_LABEL[kind] || "Duschabtrennung (Hassmann)";
    fs.querySelectorAll(".da-item").forEach((item) => {
      const priceEl = item.querySelector(".da-price");
      const qtyEl = item.querySelector(".da-qty");
      const idEl = item.querySelector(".da-id");
      const nameEl = item.querySelector(".da-name"); // only in Freier Posten
      const priceRaw = (priceEl?.value ?? "").trim();
      const priceNum = window.parseMoneyEuro(priceRaw);
      const qty = Math.max(0, parseInt((qtyEl?.value ?? "").trim(), 10) || 0);
      if (isCustom) {
        const name = (nameEl?.value ?? "").trim();
        if (!name) return; // require label
        if (priceNum <= 0) return; // require price
        const productId = (idEl?.value ?? "").trim();
        qa.push({
          kind,
          label: name, // exact custom label
          qty: Math.max(1, qty || 1), // default to 1 if blank
          price: priceRaw, // keep raw string; parsed later
          productId,
        });
      } else {
        if (priceNum <= 0) return; // only priced rows
        if (qty <= 0) return;
        const productId = (idEl?.value ?? "").trim();
        const label =
          canonicalLabel || productId || "Duschabtrennung (Hassmann)";
        qa.push({
          kind,
          label,
          qty,
          price: priceRaw,
          productId,
        });
      }
    });
  });

  doc.duschabtrennung = doc.duschabtrennung || {};
  doc.duschabtrennung.quickAdd = qa;
}

// helper: collect "Freier Posten / Sonderprodukte" rows from a container
function collectCustomRows(root) {
  if (!root) return [];
  return [
    ...root.querySelectorAll('fieldset.da-row[data-kind="custom"] .da-item'),
  ]
    .map((item) => {
      const name = item.querySelector(".da-name")?.value?.trim() || "";
      const price = item.querySelector(".da-price")?.value || "";
      const qty = item.querySelector(".da-qty")?.value || "";
      const id = item.querySelector(".da-id")?.value?.trim() || "";

      // normalize numeric price (accepts "1.234,56" or "1234.56")
      const priceNum = (() => {
        const raw = String(price).trim();
        if (!raw) return 0;
        const norm = raw.replace(/\./g, "").replace(",", "."); // de → en
        const n = Number(norm);
        return Number.isFinite(n) ? n : 0;
      })();

      const qtyNum = Math.max(0, parseInt(qty, 10) || 0);

      return {
        kind: "custom",
        name,
        id,
        price: priceNum,
        qty: qtyNum,
        total: +(priceNum * qtyNum).toFixed(2),
      };
    })
    .filter((x) => x.name && x.price > 0 && x.qty > 0);
}

function readWVConsumablesStrict() {
  const form = document.getElementById("form-wandverkleidung");
  if (!form) return [];

  // If we have checkbox tiles, use ONLY those (true source of truth)
  const boxInputs = form.querySelectorAll(
    'input[type="checkbox"][name="wvSealing[]"],' +
      'input[type="checkbox"][name="flechenkleber[]"],' +
      'input[type="checkbox"][name="wvEndProfile[]"],' +
      'input[type="checkbox"][name="wvSilikon[]"]',
  );

  const picked = [];
  if (boxInputs.length) {
    boxInputs.forEach((i) => {
      if (i.checked) picked.push(String(i.value));
    });
    return Array.from(new Set(picked));
  }

  // Fallback (no boxes present): accept singles from <select>s,
  // but only when the control is visible & enabled.
  ["wvSealing", "flechenkleber", "wvEndProfile", "wvSilikon"].forEach(
    (name) => {
      const el = form.querySelector(`[name="${name}"]`);
      if (el && !el.disabled && !el.closest("[hidden]") && el.value) {
        picked.push(String(el.value));
      }
    },
  );

  return Array.from(new Set(picked));
}

// Remove or empty sections that do not belong to the currently active offer
function filterPayloadByOffer(payload) {
  if (!currentOfferKey || !OFFERS[currentOfferKey]) {
    return payload;
  }

  const pagesForOffer = OFFERS[currentOfferKey].pages || [];
  const allowedPages = new Set(pagesForOffer);

  // Map: page-id in OFFERS.pages → key name in payload object
  // left: page name in OFFERS.*.pages
  // right: actual key name in buildPayload()
  const pageToKey = {
    Kundendaten: "Kundendaten",
    Arbeitszeit: "Arbeitszeit",
    Duschwanne: "duschwanne",
    Wandverkleidung: "wandverkleidung",
    Duschabtrennung: "duschabtrennung",
    Optional: "optional",
    Rabatt: "rabatt",
    bwt: "bwt",
    hl: "hl",
    ah: "ah",
        hms: "hms",
            wd: "wd",
    admin: "admin",
    services: "services",
  };

  Object.entries(pageToKey).forEach(([page, key]) => {
    if (
      !allowedPages.has(page) &&
      Object.prototype.hasOwnProperty.call(payload, key)
    ) {
      // For non-selected pages, make their contribution empty
      payload[key] = {};
      // Or: delete payload[key];
    }
  });

  return payload;
}

function collectBwtExtras(payload) {
  const formBwt = document.getElementById("form-bwt");
  if (!formBwt) return;

  const fs = document.getElementById("bwt-extras");
  if (!fs) return;

  const wrap = fs.querySelector(".da-items");
  if (!wrap) return;

  const rows = [];
  wrap.querySelectorAll(".da-item").forEach((item) => {
    const nameEl = item.querySelector(".da-name");
    const idEl = item.querySelector(".da-id");
    const qtyEl = item.querySelector(".da-qty");
    const priceEl = item.querySelector(".da-price");

    const label = (nameEl?.value || "").trim();
    const productId = (idEl?.value || "").trim();
    const qty = Number(qtyEl?.value || 0) || 0;
    const priceRaw = (priceEl?.value || "").trim();

    // Completely empty row → ignore
    if (!label && !productId && !priceRaw && qty <= 0) return;

    // Use the global tolerant parser (handles "799,00", "799,00 €", etc.)
    const price = window.parseMoneyEuro(priceRaw);

    rows.push({
      kind: "bwt-extra",
      label,
      productId,
      qty,
      price,
    });
  });

  const bwt = payload.bwt || (payload.bwt = {});

  if (rows.length) {
    bwt.quickAdd = rows;
  } else {
    delete bwt.quickAdd;
  }
}

function buildPayload() {
  const payload = {
    Kundendaten: formToObject(document.getElementById("form-Kundendaten")),
    duschwanne: {
      ...formToObject(document.getElementById("form-duschwanne")),
      computed: window.__DW_COMPUTED__ || {},
    },
    wandverkleidung: formToObject(
      document.getElementById("form-wandverkleidung"),
    ),
    duschabtrennung: formToObject(
      document.getElementById("form-duschabtrennung"),
    ),
    optional: formToObject(document.getElementById("form-optional")),
    rabatt: formToObject(document.getElementById("form-rabatt")),
    bwt: formToObject(document.getElementById("form-bwt")),
    hl: formToObject(document.getElementById("form-hl")),
    ah: formToObject(document.getElementById("form-ah")),
        hms: formToObject(document.getElementById("form-hms")),

            wd: formToObject(document.getElementById("form-wd")),

  };

  collectWandverkleidungMaterials(payload);
  //  collect quick-add shower screens
  collectDuschabtrennungQuickAdd(payload);
  //  collect BWT door + Haltegriffe as materials
  collectBwtMaterials(payload);
  //  collect BWT freie Posten (quick add)
  collectBwtExtras(payload);

  // --- OPTIONAL: ensure REHA checkboxes are represented as opt_* keys ---
try {
  const formOpt = document.getElementById("form-optional");
  if (formOpt) {
    const optObj = payload.optional || (payload.optional = {});
    const fdOpt = new FormData(formOpt);

    // 1) ensure optReha[] is an array (all selected values)
    const rehaVals = fdOpt.getAll("optReha[]").map(v => String(v));
    if (rehaVals.length) optObj["optReha[]"] = rehaVals;

    // 2) ensure checked REHA boxes also appear as opt_<ID> keys
    // (because pricing.collectSelections() only reads keys starting with opt_)
    const rehaChecked = Array.from(
      formOpt.querySelectorAll('input[type="checkbox"][name="optReha[]"]:checked')
    );

    for (const cb of rehaChecked) {
      const pid = String(cb.id || "").startsWith("opt_") ? cb.id.slice(4) : "";
      if (!pid) continue;

      // create the canonical key expected by collectSelections
      optObj[`opt_${pid}`] = true;

      // if you have qty input, ensure it's included (usually already is)
      const qtyEl = document.getElementById(`qty_${pid}`);
      if (qtyEl && qtyEl.value !== "") {
        optObj[`qty_${pid}`] = qtyEl.value;
      }
    }
  }
} catch (e) {
  console.warn("[buildPayload] optional REHA normalization failed:", e);
}

  // ---- NEW: reliably collect ALL Duschwanne work tasks (checkbox array) ----
  try {
    const formDW = document.getElementById("form-duschwanne");

    if (formDW) {
      const fdDW = new FormData(formDW);
      const dwTasks = fdDW.getAll("duschwanne[workTasks][]"); // ✅ all checked values
      const dw = (payload.duschwanne ||= {});

      if (dwTasks.length) {
        dw.workTasks = dwTasks;
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

  // ---- DUSCHWANNE: ensure multi-select arrays are captured ----
  // ---- DUSCHWANNE: ensure multi-select arrays are captured ----
  try {
    const formDW = document.getElementById("form-duschwanne");
    if (formDW) {
      const fdDW = new FormData(formDW);
      const getAllVals = (name) => fdDW.getAll(name).map((v) => String(v));

      // Existing
      const flooringProduct = getAllVals("flooringProduct[]");
      const floorAdhesive = getAllVals("floorAdhesive[]");
      const floorSealing = getAllVals("floorSealing[]");

      // ✅ FIX: Query DOM directly for ALL extra task inputs
      let extraTasks = [];

      // First try FormData (for inputs with correct name attribute)
      extraTasks = [
        ...getAllVals("duschwanne[extraTasks][]"),
        ...getAllVals("extraTasks[]"),
      ]
        .map((s) => s.trim())
        .filter(Boolean);

      // If FormData didn't find any, query the DOM directly
      if (extraTasks.length === 0) {
        const extraTaskInputs = document.querySelectorAll(
          "#dw-extra-tasks .da-items .dw-extra",
        );
        extraTaskInputs.forEach((input) => {
          const val = (input.value || "").trim();
          if (val) {
            extraTasks.push(val);
          }
        });
      }

      console.log("[buildPayload] extraTasks collected:", extraTasks); // Debug

      payload.duschwanne = payload.duschwanne || {};
      if (flooringProduct.length)
        payload.duschwanne.flooringProduct = flooringProduct;
      if (floorAdhesive.length)
        payload.duschwanne.floorAdhesive = floorAdhesive;
      if (floorSealing.length) payload.duschwanne.floorSealing = floorSealing;
      if (extraTasks.length)
        payload.duschwanne.extraTasks = Array.from(new Set(extraTasks));

      // Normalize toggle to boolean
      payload.duschwanne.addFlooring =
        !!document.getElementById("addFlooring")?.checked;
    }
  } catch (e) {
    console.warn("[buildPayload] flooring arrays capture failed:", e);
  }

  // WV consumables – ONLY what's actually selected in the UI
  try {
    const values = readWVConsumablesStrict();
    payload.wandverkleidung = payload.wandverkleidung || {};
    payload.wandverkleidung.consumables = values;
  } catch (e) {
    console.warn("[buildPayload] WV consumables capture failed:", e);
  }
  //  per-panel color config for WV (997 / 1497) ---
  try {
    const formWV = document.getElementById("form-wandverkleidung");
    if (formWV) {
      const fdWV = new FormData(formWV);

      const globalColor = (fdWV.get("wvColor") || "").toString().trim();

      const color997 = (fdWV.get("wvColor_997") || "").toString().trim();

      const color1497 = (fdWV.get("wvColor_1497") || "").toString().trim();

      const enabled997 = !!document.getElementById("wv997")?.checked;
      const enabled1497 = !!document.getElementById("wv1497")?.checked;

      const qty997 =
        Number(document.getElementById("wvQty997")?.value || 0) || 0;
      const qty1497 =
        Number(document.getElementById("wvQty1497")?.value || 0) || 0;

      payload.wandverkleidung = payload.wandverkleidung || {};

      // Clean, canonical structure used later in pricing / DOCX
      payload.wandverkleidung.panelConfigs = {
        "997x2550": {
          enabled: enabled997,
          qty: qty997,
          color: color997 || globalColor || "",
        },
        "1497x2550": {
          enabled: enabled1497,
          qty: qty1497,
          color: color1497 || globalColor || "",
        },
      };
    }
  } catch (e) {
    console.warn("[buildPayload] WV panel color config failed:", e);
  }
  // -------------------------------------------------------------------------
  // Budget/Zuzahlung
  const elMax = document.querySelector('input[name="budgetMax"]');
  const elCopay = document.querySelector('input[name="budgetCopay"]');
  const elTwo = document.querySelector('input[name="twoPersons"]');
  const elPremium = document.querySelector('input[name="premium"]');
  const copayEl = document.getElementById("copayAmount");

  const wohDoneRadios = document.querySelectorAll(
    'input[name="wohnumfeldDone"]',
  );
  const wohAmountInput = document.getElementById("wohnumfeldAmount");

  function readWohnumfeld() {
    const isJa = Array.from(wohDoneRadios).some(
      (r) => r.checked && r.value === "Ja",
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

  // --- OPTIONAL: Sonderprodukte (Freier Posten unter Optional) ---
  collectOptionalQuickAdd(payload);

  // Canonical main budget option (Max / 2 Personen / Premium),
  // independent from whether copay is used.
  let selectedMain = "";
  if (elMax?.checked) selectedMain = elMax.value;
  else if (elTwo?.checked) selectedMain = elTwo.value;
  else if (elPremium?.checked) selectedMain = elPremium.value;

  const canonicalMain = selectedMain
    ? selectedMain.toUpperCase().replace(/_/g, " ").replace(/\s+/g, " ").trim()
    : "";

  payload.Kundendaten = payload.Kundendaten || {};
  payload.Kundendaten.budgetOptionsPanel = canonicalMain || selectedMain || "";
  payload.Kundendaten.copayAmount = copayEl
    ? parseEuroToNumber(copayEl.value)
    : 0;

  // Rabatt fields for server
  const pct = parseFloat(
    document.getElementById("rb-material-discount")?.value || "0",
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

  // -------------------------------------------------------------------------
  // NEW: Arbeitszeit / travel payload block (moved out of Kundendaten)
  // -------------------------------------------------------------------------
  (function buildArbeitszeitBlock() {
    // Read formatted total from the Arbeitszeit page output element
    const totalHHMM =
      document
        .getElementById("totalHoursHHMM")
        ?.textContent?.match(/(\d+:\d{2})/)?.[1] || "";

    // Read raw HH:MM inputs (Arbeitszeit & one-way Reisezeit)
    const laborHHMM = (document.getElementById("laborHours")?.value || "")
      .toString()
      .trim();
    const travelHHMM = (document.getElementById("travelTime")?.value || "")
      .toString()
      .trim();

    // Safely compute numeric hours (fallback if window.* mirrors are not yet populated)
    const _L =
      typeof hhmmToHours === "function" ? hhmmToHours(laborHHMM || "0:00") : 0;
    const _T1 =
      typeof hhmmToHours === "function" ? hhmmToHours(travelHHMM || "0:00") : 0;

    const F_total = _L + 2 * _T1;

    // Use the global mirrors if they exist (set by updateTotalHours), otherwise fallback
    const totalNumeric = Number(window.total_hours_numeric ?? F_total ?? 0);
    const travelNumeric = Number(window.reise_hours_numeric ?? 2 * _T1 ?? 0);
    const laborNumeric = Number(window.arbeit_hours_numeric ?? _L ?? 0);

    // Optional: distance in km field (if you have it on the Arbeitszeit page)
    const distanceKm = (document.getElementById("distanceKm")?.value || "")
      .toString()
      .trim();

    const arbeitsBlock = {
      totalHoursHHMM: totalHHMM,
      totalHoursNumeric: totalNumeric,
      ReiseHoursNumeric: travelNumeric,
      ArbeitHoursNumeric: laborNumeric,
      laborHoursHHMM: laborHHMM,
      travelTimeHHMM: travelHHMM,
      distanceKm,
    };

    // Extra Arbeitszeit (BWT) – always recompute from DOM if fieldset exists
    (function computeExtraArbeitszeit() {
      const fs = document.getElementById("bwtAzExtraFieldset");
      console.log("[ExtraAZ] computeExtraArbeitszeit, fs exists?", !!fs);

      if (!fs || typeof hhmmToHours !== "function") {
        console.log("[ExtraAZ] bail: missing fieldset or hhmmToHours");
        delete arbeitsBlock.extraTasks;
        delete arbeitsBlock.extraHoursTotal;
        return;
      }

      const items = fs.querySelectorAll(".bwt-az-item");
      const extraTasks = [];
      let extraHoursTotal = 0;

      items.forEach(function (item, i) {
        const durEl = item.querySelector(".bwt-az-duration");
        const taskEl = item.querySelector(".bwt-az-task");

        const durRaw = ((durEl && durEl.value) || "").trim();
        const task = ((taskEl && taskEl.value) || "").trim();

        console.log("[ExtraAZ] row", i, { durRaw, task });

        if (!durRaw && !task) return;

        const hours = hhmmToHours(durRaw || "0:00") || 0;

        console.log("[ExtraAZ] row", i, "hours=", hours);

        extraTasks.push({
          durationHHMM: durRaw,
          durationHours: hours,
          task,
        });

        if (hours > 0) {
          extraHoursTotal += hours;
        }
      });

      console.log("[ExtraAZ] total hours:", extraHoursTotal);

      if (extraTasks.length) {
        arbeitsBlock.extraTasks = extraTasks;
        arbeitsBlock.extraHoursTotal = Math.round(extraHoursTotal * 100) / 100;
        console.log(
          "[ExtraAZ] saved extraHoursTotal=",
          arbeitsBlock.extraHoursTotal,
        );
      } else {
        delete arbeitsBlock.extraTasks;
        delete arbeitsBlock.extraHoursTotal;
        console.log("[ExtraAZ] no valid rows, clearing extra fields");
      }
    })();

    payload.Arbeitszeit = arbeitsBlock;

    // If your backend still expects some of this under Kundendaten, you can mirror it:
    // payload.Kundendaten.totalHoursHHMM     = totalHHMM;
    // payload.Kundendaten.totalHoursNumeric  = totalNumeric;
    // payload.Kundendaten.ReiseHoursNumeric  = travelNumeric;
    // payload.Kundendaten.ArbeitHoursNumeric = laborNumeric;
    // payload.Kundendaten.laborHoursHHMM     = laborHHMM;
  })();

  // -------------------------------------------------------------------------

  const woh = readWohnumfeld();
  const isKK =
    (payload.Kundendaten?.payer ||
      document.querySelector('input[name="payer"]:checked')?.value) ===
    "Kassenkunde";
  payload.Kundendaten.wohnumfeld = isKK ? woh : { done: false, amount: 0 };

  // --- Attach Duschwanne selection from DOM (if present) ---
  {
    const eb = !!document.getElementById("ebenerdigeToggle")?.checked;
    const pid = document.getElementById("chosenTrayProductId")?.value?.trim();
    const size = document.getElementById("traySize")?.value?.trim();

    const dw = payload.duschwanne || (payload.duschwanne = {});
    dw.ebenerdigeMontage = eb;
    if (pid) dw.chosenTrayProductId = pid;
    if (size) dw.traySize = size;
  }

  // --- Ensure tray selection persists ONLY if the user actually touched the Duschwanne step
  (function ensureTraySelection() {
    const dw = payload.duschwanne || (payload.duschwanne = {});
    const hasSize = !!(dw.traySize && String(dw.traySize).trim());
    const hasPid = !!(
      dw.chosenTrayProductId && String(dw.chosenTrayProductId).trim()
    );
    if (hasSize && hasPid) return;

    const chosenNow = document
      .getElementById("chosenTrayProductId")
      ?.value?.trim();
    const touched =
      !!chosenNow || sessionStorage.getItem("dw_tray_touched") === "1";
    if (!touched) return;

    try {
      const raw = localStorage.getItem("dw_tray_selection");
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (!hasSize && saved?.value) dw.traySize = saved.value;
      if (!hasPid && saved?.productId) dw.chosenTrayProductId = saved.productId;
    } catch {}
  })();

  // ---- BWT: ensure multi-select arrays are captured ----
  try {
    const formBwt = document.getElementById("form-bwt");
    if (formBwt) {
      const fdBwt = new FormData(formBwt);
      const bwt = payload.bwt || (payload.bwt = {});

      // bwt[bwtinfoTasks][] → bwt.bwtinfoTasks (array)
      const infoTasks = fdBwt
        .getAll("bwt[bwtinfoTasks][]")
        .map((v) => String(v));
      if (infoTasks.length) {
        bwt.bwtinfoTasks = infoTasks;
      } else {
        const weird = bwt["bwt[bwtinfoTasks][]"];
        if (typeof weird === "string" && weird.trim()) {
          bwt.bwtinfoTasks = [weird.trim()];
        }
      }
      if ("bwt[bwtinfoTasks][]" in bwt) {
        delete bwt["bwt[bwtinfoTasks][]"];
      }

      // bwtAids[] → bwt.bwtAids (array of "Haltegriff40"/"Haltegriff60"/"Haltegriff80")
      const aids = fdBwt.getAll("bwtAids[]").map((v) => String(v));
      if (aids.length) {
        bwt.bwtAids = aids;
      } else {
        const weirdAids = bwt["bwtAids[]"];
        if (typeof weirdAids === "string" && weirdAids.trim()) {
          bwt.bwtAids = [weirdAids.trim()];
        }
      }
      if ("bwtAids[]" in bwt) {
        delete bwt["bwtAids[]"];
      }
    }
  } catch (e) {
    console.warn("[buildPayload] BWT arrays capture failed:", e);
  }
  // end bwt payload block

  // Remember which offer was active when building this payload
  payload.activeOffer = currentOfferKey || null;

  // Remove/empty sections that are not part of the active offer's pages
  return filterPayloadByOffer(payload);
}

window.buildPayload = buildPayload;

window.buildPayload = buildPayload;
function stripEmptySectionsForPreview(payload) {
  const copy = {};

  for (const [key, value] of Object.entries(payload || {})) {
    // If it's a plain object and completely empty → skip it in preview
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value).length === 0
    ) {
      continue;
    }
    copy[key] = value;
  }

  return copy;
}

function updateSummary() {
  if (getCurrentStep() !== "zusammenfassung") return;
  const el = document.getElementById("summaryText");
  const payload = buildPayload();

  // ✅ Only for UI: hide completely empty sections (like BU-only pages in BWT/HL)
  const preview = stripEmptySectionsForPreview(payload);

  el.textContent = "Vorschau: " + JSON.stringify(preview);
}

const statusEl = document.getElementById("status");
function show(obj, ok = true) {
  if (!statusEl) return;
  statusEl.className = "status " + (ok ? "ok" : "err");
  statusEl.textContent =
    typeof obj === "string" ? obj : JSON.stringify(obj, null, 2);
}
// #endregion
// =================================================================
// #region 8. PDF & EXPORT HANDLERS
// =================================================================
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
async function downloadPDFWithProgress(endpoint, payload) {
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
        "error",
      );
      if (errorData.detail)
        setTimeout(
          () => showPDFProgress(`Details: ${errorData.detail}`, "error"),
          1000,
        );
      return;
    }

    // --- NEW: read filename from header ---
    const cd = response.headers.get("content-disposition") || "";
    let serverFilename = "Angebot.pdf";
    const match = cd.match(/filename="?(.*?)"?$/i);
    if (match && match[1]) {
      serverFilename = match[1];
    }
    console.log("[downloadPDF] serverFilename:", serverFilename);

    showPDFProgress("PDF wird konvertiert (LibreOffice)...", "info");
    const blob = await response.blob();

    clearInterval(timerInterval);
    showPDFProgress("PDF erfolgreich erstellt!", "success");

    // Save snapshot now that the export succeeded
    await saveFinalOfferSnapshot();

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = serverFilename; // uses backend name
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


// ===============================
// PDF Preview (Embedded PDF.js) - CSP safe
// ===============================
(function initPdfPreview() {
  const btn = document.getElementById("previewPdfBtn");
  const container = document.getElementById("pdfPreviewContainer");
  const iframe = document.getElementById("pdfPreviewFrame");

  if (!btn || !container || !iframe) return;

  // Minimal embedded viewer HTML (NO inline scripts!)
  const PDF_VIEWER_SRCDOC = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>PDF Preview</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;height:100vh;display:flex;flex-direction:column;background:#525659;overflow:hidden}
    #toolbar{background:#323639;color:#fff;padding:10px 14px;display:flex;align-items:center;justify-content:space-between;gap:12px}
    #toolbar button{background:#4a5056;color:#fff;border:0;padding:7px 12px;border-radius:6px;cursor:pointer}
    #toolbar button:disabled{opacity:.5;cursor:not-allowed}
    #viewport-container{flex:1;overflow:auto;padding:14px}
    #viewport{max-width:1200px;margin:0 auto;display:flex;flex-direction:column;gap:14px;align-items:center}
    .page-container{background:#fff;box-shadow:0 2px 10px rgba(0,0,0,.35)}
    canvas{display:block;max-width:100%;height:auto}
    #loading{position:fixed;inset:0;display:none;place-items:center;background:rgba(0,0,0,.25)}
    #loading.active{display:grid}
    #loading .box{background:#fff;padding:14px 18px;border-radius:10px}
    #error{position:fixed;top:12px;left:50%;transform:translateX(-50%);display:none;background:#dc3545;color:#fff;padding:10px 14px;border-radius:8px;max-width:min(90vw,680px)}
    #error.active{display:block}
    #page-info,#zoom-level{white-space:nowrap}
  </style>
</head>
<body>
  <div id="toolbar" role="toolbar">
    <div style="display:flex;align-items:center;gap:10px;">
      <button id="prev-page">◀</button>
      <span id="page-info">Page <span id="current-page">-</span> of <span id="total-pages">-</span></span>
      <button id="next-page">▶</button>
    </div>
    <div style="display:flex;align-items:center;gap:8px;">
      <button id="zoom-out">−</button>
      <span id="zoom-level">100%</span>
      <button id="zoom-in">+</button>
      <button id="zoom-fit">Fit</button>
    </div>
  </div>

  <div id="error"></div>
  <div id="loading"><div class="box">Loading PDF…</div></div>

  <div id="viewport-container">
    <div id="viewport"></div>
  </div>

  <script type="module" src="/pdfjs/viewer.mjs"><\\/script>
</body>
</html>`;

  function ensureViewerLoaded() {
    // reload every time if you want a clean viewer each click:
    // iframe.srcdoc = PDF_VIEWER_SRCDOC;

    // or keep it once:
    if (!iframe.srcdoc) iframe.srcdoc = PDF_VIEWER_SRCDOC;
  }

  function waitForViewerReady(timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
      let done = false;

      const t = setTimeout(() => {
        if (!done) reject(new Error("PDF viewer not ready (timeout)."));
      }, timeoutMs);

      function onMsg(ev) {
        if (ev?.source !== iframe.contentWindow) return; // ensure it’s from the iframe
        if (ev?.data?.type === "VIEWER_READY") {
          done = true;
          clearTimeout(t);
          window.removeEventListener("message", onMsg);
          resolve();
        }
      }
      window.addEventListener("message", onMsg);
    });
  }

  async function fetchPdfBlobForPreview() {
    if (typeof window.buildPayload !== "function") {
      throw new Error("buildPayload() is missing.");
    }

    const payload = window.buildPayload();

    const res = await fetch("/api/docx/pdf-preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`Preview PDF failed (${res.status}): ${txt}`);
    }
    return await res.blob();
  }

  btn.addEventListener("click", async () => {
    try {
      btn.disabled = true;
      btn.textContent = "Generating preview…";
      container.style.display = "block";

      ensureViewerLoaded();

      // Wait until the iframe exists and has loaded the module
      await waitForViewerReady(5000);

      const pdfBlob = await fetchPdfBlobForPreview();
      const buf = await pdfBlob.arrayBuffer();

      // Transfer the ArrayBuffer (zero-copy)
      iframe.contentWindow.postMessage(
        { type: "LOAD_PDF_ARRAYBUFFER", buffer: buf },
        window.location.origin,
        [buf]
      );
    } catch (e) {
      console.error("[pdf-preview] failed:", e);
      alert("PDF preview failed:\n" + (e?.message || String(e)));
      container.style.display = "none";
    } finally {
      btn.disabled = false;
      btn.textContent = "PDF Preview";
    }
  });
})();
// #endregion

window.addEventListener("message", (ev) => {
  console.log("[parent] message", {
    origin: ev.origin,
    data: ev.data,
    fromIframe: ev.source === document.getElementById("pdfPreviewFrame")?.contentWindow,
  });
});

document.getElementById("pdfPreviewFrame")?.addEventListener("load", () => {
  console.log("[parent] iframe load fired");
});

// === FIX: area <-> color coupling (self-contained) ===
function syncColorWithAreaDW() {
  const form = document.getElementById("form-duschwanne");
  if (!form) return;

  const areaEl = form.querySelector("#floorArea");
  const raw = (areaEl?.value || "").replace(",", ".");
  const hasArea = Number.isFinite(+raw) && +raw > 0;

  const colors = Array.from(
    form.querySelectorAll('input[name="flooringProduct[]"]'),
  );
  if (!colors.length) return;

  // ensure exclusivity helper
  const uncheckAll = () =>
    colors.forEach((i) => {
      i.checked = false;
      highlightTileForInput(i, false);
    });

  const anyChecked = form.querySelector(
    'input[name="flooringProduct[]"]:checked',
  );

  if (!hasArea) {
    // area empty/0 -> NO color selected
    uncheckAll();
  } else if (!anyChecked) {
    // area > 0 -> ensure exactly ONE is selected (default: Lava-Beige if present)
    const def =
      form.querySelector(
        'input[name="flooringProduct[]"][data-color="Lava-Beige"]',
      ) || colors[0];
    if (def) {
      def.checked = true;
      // make sure we keep exclusivity visually
      colors.forEach((i) => highlightTileForInput(i, i === def));
    }
  } else {
    // area > 0 and one is already checked -> enforce exclusivity (in case multiple were ticked)
    const first = anyChecked;
    colors.forEach((i) => {
      if (i !== first && i.checked) {
        i.checked = false;
        highlightTileForInput(i, false);
      }
    });
    highlightTileForInput(first, true);
  }

  // keep server totals in sync
  window.updatePricing?.();
}
function collectAllFormData() {
  return buildPayload();
}
// =================================================================
// #region 9. HELPERS
// =================================================================
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
/* ========== HELPERS  for the floating widget ========== */
function updateSummaryWidgetName() {
  const firstEl = document.getElementById("firstName");
  const lastEl = document.getElementById("lastName");
  const outEl = document.getElementById("swNameValue");
  if (!outEl) return;

  const first = (firstEl?.value || "").trim();
  const last = (lastEl?.value || "").trim();
  const name = [first, last].filter(Boolean).join(" ");

  outEl.textContent = name || "–";
}
function updateSummaryWidgetSelfPay(selfPayAmount) {
  const outEl = document.getElementById("swSelfPayValue");
  if (!outEl) return;

  const n = Number(selfPayAmount || 0);
  if (!Number.isFinite(n) || n <= 0) {
    outEl.textContent = "–";
    return;
  }

  // Prefer your existing euroC formatter if present
  if (typeof euroC === "function") {
    outEl.innerHTML = euroC(n);
  } else {
    const formatted = n.toFixed(2).replace(".", ",") + " €";
    outEl.textContent = formatted;
  }
}
function updateSummaryWidgetTotal(totalAmount) {
  const outEl = document.getElementById("swTotalValue");
  if (!outEl) return;

  const n = Number(totalAmount || 0);
  if (!Number.isFinite(n) || n <= 0) {
    outEl.textContent = "–";
    return;
  }

  if (typeof euroC === "function") {
    outEl.innerHTML = euroC(n);
  } else {
    const formatted = n.toFixed(2).replace(".", ",") + " €";
    outEl.textContent = formatted;
  }
}
function updateSummaryWidgetSubsidyVisibility() {
  const row = document.getElementById("swSelfPayRow");
  if (!row) return;

  const budgetMaxChecked = !!document.querySelector(
    'input[name="budgetMax"]:checked',
  );
  const twoPersonsChecked = !!document.querySelector(
    'input[name="twoPersons"]:checked',
  );

  const show = budgetMaxChecked || twoPersonsChecked;
  row.style.display = show ? "" : "none";
}

/* ========== End HELPERS  for the floating widget ========== */
// #endregion

function updateCustomerNumberVisibility() {
  const row = document.getElementById("customerNumberRow");
  if (!row) return;

  const selected = document.querySelector('input[name="customerType"]:checked');
  const type = selected ? selected.value : "";

  const show = type === "Bestandskunde";

  // show/hide row
  row.style.display = show ? "" : "none";

  // if we hide it, clear the value so it doesn't get saved by accident
  if (!show) {
    const input = document.getElementById("customerNumber");
    if (input) input.value = "";
  }
}
// =================================================================
// #region 9. VALIDATION
// =================================================================
/* ========== VALIDATION ========== */
function validateBereich() {
  const form = document.getElementById("form-Kundendaten");
  if (!form) return true;
  const d = document.getElementById("date");
  if (d && !d.value) d.valueAsDate = new Date();
  if (!form.checkValidity()) return false;

  const req = ["date", "firstName", "lastName"];
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
/* Focus helper for Kundendaten conditional errors (defined in initBereichErrorHints) */
function focusFirstBereichConditionalError() {
  if (typeof window.__bereichFocusFirstError__ === "function") {
    return window.__bereichFocusFirstError__();
  }
  return false;
}
function requireBereichValid() {
  const form = document.getElementById("form-Kundendaten");
  if (!form.reportValidity()) {
    focusFirstBereichConditionalError();
    return false;
  }
  const ok = validateBereich();
  if (!ok) focusFirstBereichConditionalError();
  return ok;
}
function validateArbeitszeit() {
  const f = document.getElementById("form-Arbeitszeit");
  if (!f) return true;
  return f.reportValidity(); // nutzt HTML5 required etc.
}
// #endregion

// Map home tiles (data-step on .tile-btn) to OFFERS keys
const TILE_TO_OFFER = {
  "BU-Badumbau": "bu",
  "BWT-Badewannentür": "bwt",
  "HL-Handlauf": "hl",
  "AH-Alltagshilfe": "ah",
   "HMS-Hausmeister-Service": "hms",
   "WD-Winterdienst": "wd",
};

// Auswahl der Leistung tiles → start the corresponding offer flow
document.addEventListener("click", (event) => {
  const tile = event.target.closest(".tile-btn");
  if (!tile) return;

  const tileId = tile.getAttribute("data-step");
  const offerKey = TILE_TO_OFFER[tileId];
  if (!offerKey) return; // no mapping yet -> do nothing, default href can still work if you want

  event.preventDefault();
  startOfferFlow(offerKey);
});

/* ========== NAV BUTTONS ========== */
document.body.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-nav]");
  if (!btn) return;

  const dir = btn.getAttribute("data-nav");
  const step = getCurrentStep();
  const flow = getFlowSteps();
  const idx = flow.indexOf(step);

  // If the current step is not part of the flow (should not happen in normal use), do nothing
  if (idx === -1) return;

  if (dir === "prev") {
    const prevIdx = Math.max(0, idx - 1);
    return setStep(flow[prevIdx]);
  }

  if (dir === "next") {
    const ok =
      step === "Kundendaten"
        ? requireBereichValid()
        : step === "Arbeitszeit"
          ? validateArbeitszeit()
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

    const nextIdx = Math.min(flow.length - 1, idx + 1);
    setStep(flow[nextIdx]);
  }
});

// =================================================================
// #region 10. PAGE SPECIFIC LOGIC (Wandverkleidung, Duschwanne, etc)
// =================================================================

/* ========== WANDVERKLEIDUNG PAGE WIRING (auto color, qty=1, etc.) ========== */
function updateKostenDetails() {
  window.updatePricing?.();
} // safe, no direct rendering

function setupWandverkleidungPage() {
  const page = document.getElementById("page-Wandverkleidung");
  if (!page || page.dataset._wired === "true") return;
  page.dataset._wired = "true";
  const defaultColor = page.querySelector(
    'input[type="radio"][name="wvColor"][value="Marmor weiß"]',
  );
  const anyColorChecked = page.querySelector(
    'input[type="radio"][name="wvColor"]:checked',
  );
  // only force default if NO color has been restored
  if (defaultColor && !anyColorChecked && !page.dataset.wvColorRestored) {
    defaultColor.checked = true;
  }

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
    recomputeWVFlachenQty();

    cbEl.addEventListener("change", () => {
      if (cbEl.checked) {
        showWrap(wrapEl, true);
        if (!parseInt(qtyEl.value || "0", 10)) qtyEl.value = "1";
      } else {
        showWrap(wrapEl, false);
        qtyEl.value = "0";
      }
      recomputeWVFlachenQty();
      if (typeof updateKostenDetails === "function") updateKostenDetails();
    });

    qtyEl.addEventListener("input", () => {
      recomputeWVFlachenQty(); // <-- added
      if (typeof updateKostenDetails === "function") updateKostenDetails();
    });
    qtyEl.addEventListener("change", () => {
      recomputeWVFlachenQty(); // <-- added
    });
    recomputeWVFlachenQty(); // <-- initial paint based on current panel Mengen
  });
}
// === WV PANELS → FLÄCHENKLEBER (one-way) ==============================
function recomputeWVFlachenQty() {
  const n = (id) =>
    parseInt(document.getElementById(id)?.value || "0", 10) || 0;
  const out = document.getElementById("wvFlachenQty");
  if (!out) return;

  const v = 2 * n("wvQty997") + 2 * n("wvQty1497");
  // Write only if changed (prevents noisy loops)
  if ((parseInt(out.value || "0", 10) || 0) !== v) {
    out.value = String(v);
    // notify any listeners (pricing, UI mirrors, etc.)
    out.dispatchEvent(new Event("input", { bubbles: true }));
    out.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

function initWVConnectorsUI() {
  const qtyVEl = document.getElementById("wvV3VQty"); // user-entered connectors
  const outEl = document.getElementById("wvV3VRuleText"); // hint line
  const cb997 = document.getElementById("wv997");
  const cb1497 = document.getElementById("wv1497");
  const q997El = document.getElementById("wvQty997");
  const q1497El = document.getElementById("wvQty1497");
  const corners = document.getElementById("wvCornersCount");

  if (!qtyVEl || !outEl) return;

  const n = (v) => {
    const x = parseInt(String(v ?? "0").replace(/[^\d-]/g, ""), 10);
    return Number.isFinite(x) && x > 0 ? x : 0;
  };

  function recommendedVCount() {
    const use997 = !!cb997?.checked;
    const use1497 = !!cb1497?.checked;
    const q997 = use997 ? n(q997El?.value) : 0;
    const q1497 = use1497 ? n(q1497El?.value) : 0;

    const totalPanels = q997 + q1497;
    let rec = Math.max(0, totalPanels - 1); // joints between panels in a run
    const ecken = Math.max(0, n(corners?.value));
    rec = Math.max(0, rec - ecken); // add vertical profiles for corners
    return rec;
  }

  function render() {
    const rec = recommendedVCount();
    const cur = n(qtyVEl.value);
    if (rec > 0) {
      outEl.classList.remove("warn");
      outEl.textContent = `- Verbindungsprofil(e) empfohlen: ${rec} Stk • aktuell: ${cur} Stk`;
    } else {
      outEl.classList.add("warn");
      outEl.textContent =
        "⚠️ Keine Verbindungsprofile empfohlen. Bitte Paneelanzahl und „Ecke(n) vorhanden“ prüfen.";
    }
  }

  // Wire listeners (any change should refresh the hint)
  ["input", "change", "blur"].forEach((ev) => {
    qtyVEl.addEventListener(ev, render);
    q997El?.addEventListener(ev, render);
    q1497El?.addEventListener(ev, render);
    corners?.addEventListener(ev, render);
  });
  cb997?.addEventListener("change", render);
  cb1497?.addEventListener("change", render);

  // First paint
  render();
}

// init when the WV page is visible
window.addEventListener("hashchange", () => {
  if (
    typeof getCurrentStep === "function" &&
    getCurrentStep() === "Wandverkleidung"
  ) {
    initWVConnectorsUI();
  }
});
document.addEventListener("DOMContentLoaded", () => {
  if (
    typeof getCurrentStep === "function" &&
    getCurrentStep() === "Wandverkleidung"
  ) {
    initWVConnectorsUI();
  }
});

window.addEventListener("hashchange", () => {
  if (location.hash === "#Wandverkleidung") setupWandverkleidungPage();
});
document.addEventListener("DOMContentLoaded", () => {
  if (location.hash === "#Wandverkleidung") setupWandverkleidungPage();
});

// === Duschabtrennung QuickAdd Repeater (multi-row per kind) ===
(function initDARepeater() {
  const section = document.querySelector("section.da-quickadd");
  if (!section) return;

  const TPL = document.getElementById("da-item-template");

  // Pick the correct <template> for a fieldset (Freier Posten has its own)
  function getTemplateFor(fs) {
    const tplId = fs && fs.getAttribute("data-template");
    const t = tplId ? document.getElementById(tplId) : TPL;
    return t && t.content ? t : TPL;
  }

  const KINDS = [
    { kind: "pendeltuer", label: "Pendeltür Hassmann" },
    { kind: "gleittuer", label: "Gleittür Hassmann" },
    { kind: "faltpendel", label: "Falt-Pendeltür Hassmann" },
    { kind: "walkin", label: "Walk-In Hassmann" },
  ];

  const LS_KEY = "daQuickAddRows:v1";

  const saveState = () => {
    const state = {};
    for (const fs of document.querySelectorAll("fieldset.da-row[data-kind]")) {
      const kind = fs.dataset.kind;
      const rows = [];
      fs.querySelectorAll(".da-item").forEach((item) => {
        const price = window.parseMoneyEuro(
          item.querySelector(".da-price")?.value,
        );
        const qtyEl = item.querySelector(".da-qty");
        const idEl = item.querySelector(".da-id");
        const nameEl = item.querySelector(".da-name");
        const qty = Math.max(1, parseInt((qtyEl?.value || "").trim(), 10) || 0);
        const pid = (idEl?.value || "").trim();
        const name = (nameEl?.value || "").trim();
        rows.push({ price, qty, productId: pid, name });
      });
      state[kind] = rows;
    }
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(state));
    } catch {}
  };

  // Expose saveState globally for restore functions
  window.__daQuickAddSaveState = saveState;

  const restoreState = () => {
    let data = null;
    try {
      data = JSON.parse(localStorage.getItem(LS_KEY) || "null");
    } catch {}
    if (!data || typeof data !== "object") return;

    const migrated = {};

    for (const fs of document.querySelectorAll("fieldset.da-row[data-kind]")) {
      const kind = fs.dataset.kind;
      const wrap = fs.querySelector(".da-items");
      if (!wrap) continue;

      const rows = Array.isArray(data[kind]) ? data[kind] : [];

      const normalizeRow = (r) => {
        if (!r || typeof r !== "object")
          return { price: 0, qty: 0, productId: "", name: "" };
        let price = r.price;

        if (typeof price === "string") {
          const s = price
            .trim()
            .replace(/\s+/g, "")
            .replace(/\./g, "")
            .replace(",", ".");
          const n = parseFloat(s);
          price = Number.isFinite(n) ? n : 0;
        }
        if (
          typeof price === "number" &&
          Number.isFinite(price) &&
          price > 999 &&
          Number.isInteger(price)
        ) {
          price = price / 100;
        }
        price =
          Number.isFinite(price) && price > 0
            ? Math.round(price * 100) / 100
            : 0;

        const qty = Math.max(price > 0 ? 1 : 0, parseInt(r.qty, 10) || 0);
        const productId = (r.productId || r.pid || "").trim();
        const name = (r.name || r.label || "").trim();
        return { price, qty, productId, name };
      };

      const normRows = rows.map(normalizeRow);
      migrated[kind] = normRows;

      const first = wrap.querySelector(".da-item");
      if (!first) continue;
      wrap
        .querySelectorAll(".da-item:not(:first-child)")
        .forEach((n) => n.remove());

      const fill = (item, row) => {
        const priceEl = item.querySelector(".da-price");
        const qtyEl = item.querySelector(".da-qty");
        const idEl = item.querySelector(".da-id");
        const nameEl = item.querySelector(".da-name");

        const priceStr = row?.price
          ? row.price.toFixed(2).replace(".", ",")
          : "";

        if (priceEl) priceEl.value = priceStr;
        if (qtyEl)
          qtyEl.value = row?.price ? String(Math.max(1, row.qty || 1)) : "";
        if (idEl) idEl.value = row?.productId || "";
        if (nameEl) nameEl.value = row?.name || "";
      };

      if (normRows.length > 0) {
        fill(first, normRows[0]);
        for (let i = 1; i < normRows.length; i++) {
          const item = addRow(kind, fs, false);
          if (item) fill(item, normRows[i]);
        }
      } else {
        const priceEl = first.querySelector(".da-price");
        const qtyEl = first.querySelector(".da-qty");
        const idEl = first.querySelector(".da-id");
        const nameEl = first.querySelector(".da-name");
        if (priceEl) priceEl.value = "";
        if (qtyEl) qtyEl.value = "";
        if (idEl) idEl.value = "";
        if (nameEl) nameEl.value = "";
      }
    }

    try {
      localStorage.setItem(LS_KEY, JSON.stringify(migrated));
    } catch {}
  };

  function addRow(kind, fs, focusPrice = true) {
    const wrap = fs.querySelector(".da-items");
    if (!wrap) return null;
    const tpl = getTemplateFor(fs);
    if (!tpl?.content) return null;

    const last = wrap.querySelector(".da-item:last-child");
    if (last) {
      const lastPrice = window.parseMoneyEuro(
        last.querySelector(".da-price")?.value,
      );
      const lastId = (last.querySelector(".da-id")?.value || "").trim();

      if (kind === "custom") {
        const lastName = (last.querySelector(".da-name")?.value || "").trim();
        if (!lastName) {
          last.querySelector(".da-name")?.focus();
          return null;
        }
        if (lastPrice <= 0) {
          last.querySelector(".da-price")?.focus();
          return null;
        }
        if (!lastId) {
          last.querySelector(".da-id")?.focus();
          return null;
        }
      } else {
        if (lastPrice <= 0) {
          last.querySelector(".da-price")?.focus();
          return null;
        }
        if (!lastId) {
          last.querySelector(".da-id")?.focus();
          return null;
        }
      }
    }

    const node = tpl.content.firstElementChild.cloneNode(true);
    wrap.appendChild(node);
    wireRow(node);
    if (focusPrice) node.querySelector(".da-price")?.focus();
    saveState();
    return node;
  }

  // Expose addRow globally for restore functions
  window.addRow = addRow;

  function removeRow(btn) {
    var item = btn.closest(".da-item");
    var fs = btn.closest("fieldset.da-row[data-kind]");
    if (!item || !fs) return;

    var wrap = fs.querySelector(".da-items");
    var onlyOne = wrap && wrap.querySelectorAll(".da-item").length <= 1;

    if (onlyOne) {
      var priceEl = item.querySelector(".da-price");
      var qtyEl = item.querySelector(".da-qty");
      var idEl = item.querySelector(".da-id");
      if (priceEl) priceEl.value = "";
      if (qtyEl) qtyEl.value = "";
      if (idEl) idEl.value = "";

      var kind = fs.getAttribute("data-kind") || "";
      if (kind === "custom" || kind === "bwt-extra") {
        var nameEl = item.querySelector(".da-name");
        if (nameEl) nameEl.value = "";
      }
    } else {
      if (item.parentNode) item.parentNode.removeChild(item);
    }

    saveState();
  }

  function wireRow(item) {
    const priceEl = item.querySelector(".da-price");
    const qtyEl = item.querySelector(".da-qty");
    const nameEl = item.querySelector(".da-name");
    const idEl = item.querySelector(".da-id");

    priceEl?.addEventListener("input", () => {
      priceEl.value = priceEl.value.replace(/[^\d.,]/g, "");
    });

    priceEl?.addEventListener("blur", () => {
      const n = window.parseMoneyEuro(priceEl.value);
      if (!Number.isFinite(n) || n <= 0) {
        priceEl.value = "";
        if (qtyEl) qtyEl.value = "";
        saveState();
        return;
      }
      const parts = n.toFixed(2).split(".");
      parts[0] = parts[0]
        .replace(/^0+(?=\d)/, "")
        .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
      priceEl.value = parts.join(",") + " €";
      if (qtyEl && !qtyEl.value) qtyEl.value = "1";
      saveState();
    });

    qtyEl?.addEventListener("input", () => {
      const v = qtyEl.value.trim();
      if (!v) {
        saveState();
        return;
      }
      const n = Math.max(1, parseInt(v, 10) || 1);
      if (String(n) !== v) qtyEl.value = String(n);
      saveState();
    });

    nameEl?.addEventListener("input", () => {
      saveState();
    });

    idEl?.addEventListener("input", () => {
      saveState();
    });
  }

  // Wire existing first rows + add buttons + trash
  document.querySelectorAll("fieldset.da-row[data-kind]").forEach((fs) => {
    const addBtn = fs.querySelector(".da-add");
    const wrap = fs.querySelector(".da-items");

    wrap?.querySelectorAll(".da-item").forEach(wireRow);

    addBtn?.addEventListener("click", () => addRow(fs.dataset.kind, fs, true));

    fs.addEventListener("click", (e) => {
      const btn = e.target.closest(".da-remove");
      if (btn) removeRow(btn);
    });
  });

  // Restore from localStorage once
  restoreState();

  // Re-save on navigation away
  window.addEventListener("beforeunload", saveState);
})();

// ===== DUSCHWANNE: free-text extra tasks (repeater) =====
(function initDWExtraTasks() {
  const fs = document.getElementById("dw-extra-tasks");
  if (!fs) return;

  const wrap = fs.querySelector(".da-items");
  const addBtn = fs.querySelector(".da-add");
  const LS_KEY = "dwExtraTasks:v1";

  function makeItem(value = "") {
    const item = document.createElement("div");
    item.className = "da-item";
    item.setAttribute("data-kind", "extra");
    item.innerHTML = `
      <div class="da-grid">
        <label class="da-label" style="grid-column: 1 / -1;">
          Aufgabe
          <input class="dw-extra" type="text" name="duschwanne[extraTasks][]" value="${escapeHtml(value)}" />
        </label>
      </div>
      <button type="button" class="da-remove" aria-label="Diese Zeile entfernen">🗑</button>
    `;
    wireItem(item);
    return item;
  }

  function wireItem(item) {
    const input = item.querySelector(".dw-extra");
    const removeBtn = item.querySelector(".da-remove");

    input?.addEventListener("input", saveState);
    removeBtn?.addEventListener("click", () => {
      const all = wrap.querySelectorAll(".da-item");
      if (all.length <= 1) {
        input.value = "";
      } else {
        item.remove();
      }
      saveState();
      window.updatePricing?.();
    });
  }

  function saveState() {
    const vals = Array.from(wrap.querySelectorAll(".dw-extra"))
      .map((i) => String(i.value || "").trim())
      .filter(Boolean);
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(vals));
    } catch {}
  }

  function restoreFromLocalStorage() {
    let vals = null;
    try {
      vals = JSON.parse(localStorage.getItem(LS_KEY) || "null");
    } catch {}
    if (!Array.isArray(vals) || !vals.length) return false;

    // Clear existing and rebuild
    wrap.innerHTML = "";
    vals.forEach((v) => wrap.appendChild(makeItem(v)));
    return true;
  }

  function ensureOneRow() {
    if (!wrap.querySelector(".da-item")) {
      wrap.appendChild(makeItem(""));
    } else {
      wrap.querySelectorAll(".da-item").forEach(wireItem);
    }
  }

  addBtn?.addEventListener("click", () => {
    wrap.appendChild(makeItem(""));
    saveState();
  });

  // Expose payload-based restore for global restore pipeline
  window.restoreDWExtraTasksFromPayload = function (dw) {
    // Handle null/undefined dw or missing extraTasks - clear to one empty row
    if (!dw || !Array.isArray(dw.extraTasks)) {
      wrap.innerHTML = "";
      wrap.appendChild(makeItem(""));
      saveState();
      return;
    }

    // Reset to exactly what's in payload
    wrap.innerHTML = "";
    if (dw.extraTasks.length === 0) {
      wrap.appendChild(makeItem(""));
    } else {
      dw.extraTasks.forEach((t) => wrap.appendChild(makeItem(String(t || ""))));
    }
    saveState();
  };

  ensureOneRow();
  restoreFromLocalStorage();
})();

/* ========== Kundendaten UI (contact, aufschlag/pflegegrad, etc.) ========== */
(function initContactPersonToggle() {
  const form = document.getElementById("form-Kundendaten");
  const section = document.getElementById("contactPersonSection");
  const req = ["cp_name", "cp_street", "cp_city", "cp_postalCode"].map((id) =>
    document.getElementById(id),
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
    document.querySelectorAll('input[name="payer"]'),
  );
  const aufschlagRadios = Array.from(
    document.querySelectorAll('input[name="aufschlag"]'),
  );

  const r35 = document.querySelector('input[name="aufschlag"][value="35%"]');
  const r40 = document.querySelector('input[name="aufschlag"][value="40%"]');
  const r45 = document.querySelector('input[name="aufschlag"][value="45%"]');
  const r50 = document.querySelector('input[name="aufschlag"][value="50%"]');
  const r60 = document.querySelector('input[name="aufschlag"][value="60%"]');

  const labelEl = document.getElementById("aufschlagLabel");
  const bodyEl = document.getElementById("aufschlagBody");
  const toggleBt = document.getElementById("toggleAufschlag");

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

  // Show/hide label + radios, and toggle button text
  function setAufschlagVisible(visible) {
    if (labelEl) labelEl.style.display = visible ? "" : "none";
    if (bodyEl) bodyEl.style.display = visible ? "" : "none";
    if (toggleBt) {
      toggleBt.textContent = visible ? "Ausblenden" : "Anzeigen";
      toggleBt.setAttribute("aria-expanded", visible ? "true" : "false");
    }
  }

  function toggleAufschlag() {
    const currentlyVisible = !bodyEl || bodyEl.style.display !== "none";
    setAufschlagVisible(!currentlyVisible);
  }

  // Original Aufschlag rules per payer
  function applyAufschlagRules() {
    const payer = document.querySelector('input[name="payer"]:checked')?.value;

    // For now: all these payers allow all percentages
    [r35, r40, r45, r50, r60].forEach((r) => setDisabled(r, false));

    // Only set a default if *nothing* is selected yet
    // (e.g. brand new offer). Do NOT override an existing selection.
    if (
      !anySelected() &&
      (payer === "Kassenkunde" || payer === "Selbstzahler")
    ) {
      if (r50) r50.checked = true; // keep your current default at 50%
    }
  }

  // Events
  payerRadios.forEach((r) => r.addEventListener("change", applyAufschlagRules));
  if (toggleBt) toggleBt.addEventListener("click", toggleAufschlag);

  // Initial state: visible with rules applied
  setAufschlagVisible(true);
  applyAufschlagRules();
})();

(function initPflegegrad() {
  const form = document.getElementById("form-Kundendaten");
  const pgLevelRow = document.getElementById("pflegegradLevelRow");
  const pgRadios = Array.from(
    pgLevelRow?.querySelectorAll('input[name="pflegegrad"]') || [],
  );
  const budgetPanel = document.getElementById("budgetOptionsPanel");
  const copayCheckbox = document.getElementById("budgetCopay");
  const copayField = document.getElementById("copayField");
  const copayAmount = document.getElementById("copayAmount");
  const budgetMaxCheckbox = form?.querySelector('input[name="budgetMax"]');
  const twoPersonsCheckbox = form?.querySelector('input[name="twoPersons"]');
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
        : null,
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

  function apply() {
    const kk = isKK();
    const has = hasPG();
    const val = pgVal();
    // before: const valid2 = Number.isInteger(val) && val>=2;
    const valid1 = Number.isInteger(val) && val >= 1; // allow from Pflegegrad 1
    show(pgLevelRow, has);
    setReq(pgRadios, has);
    if (!has) clearRadios(pgRadios);
    const showBudget = kk && has && valid1;
    show(budgetPanel, showBudget);

    if (!showBudget) {
      // 1) always clear the copay checkbox + field
      if (copayCheckbox) {
        copayCheckbox.checked = false;
        applyCopay();
      }

      // 2) NEW: also clear "4.180€ maximal" and "2 Personen"
      if (budgetMaxCheckbox) budgetMaxCheckbox.checked = false;
      if (twoPersonsCheckbox) twoPersonsCheckbox.checked = false;

      // 3) If you use the little Eigenanteil widget, update its visibility too
      if (typeof updateSummaryWidgetSubsidyVisibility === "function") {
        updateSummaryWidgetSubsidyVisibility();
      }
    }

    show(wePanel, kk);
    const weDoneRadios = Array.from(
      weDoneGroup?.querySelectorAll('input[name="wohnumfeldDone"]') || [],
    );
    const weAppRadios = Array.from(
      weAppGroup?.querySelectorAll('input[name="wohnumfeldApplication"]') || [],
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
        'input[name="wohnumfeldDone"][value="Ja"]:checked',
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
        t.name,
      )
    )
      apply();
    if (t.id === "budgetCopay") applyCopay();
  });
})();
// Enforce mutual exclusion for Pflegebudget options + Copay dependency
(function initBudgetOptionsGroupBehavior() {
  const form = document.getElementById("form-Kundendaten");
  if (!form) return;

  const elMax = form.querySelector('input[name="budgetMax"]');
  const elTwo = form.querySelector('input[name="twoPersons"]');
  const elPremium = form.querySelector('input[name="premium"]');
  const elCopay = form.querySelector('input[name="budgetCopay"]');

  const mains = [elMax, elTwo, elPremium].filter(Boolean);
  if (!mains.length) return;

  function syncGroup() {
    // reuse central helper if available
    if (typeof enforceBudgetOptionsGroup === "function") {
      enforceBudgetOptionsGroup();
      return;
    }

    // fallback (should not really run if helper exists)
    const anyMain = mains.some((cb) => cb && cb.checked);
    if (elCopay) {
      elCopay.disabled = !anyMain;
      if (!anyMain && elCopay.checked) {
        elCopay.checked = false;
        if (typeof safeDispatch === "function") {
          safeDispatch(elCopay, "change");
        } else {
          elCopay.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }
    }
  }

  function onMainChange(ev) {
    const t = ev.target;
    if (!t || !t.checked) {
      syncGroup();
      return;
    }
    // Only one of the 3 "main" checkboxes at a time
    mains.forEach((cb) => {
      if (cb && cb !== t) cb.checked = false;
    });
    syncGroup();
  }

  mains.forEach((cb) => cb && cb.addEventListener("change", onMainChange));

  if (elCopay) {
    elCopay.addEventListener("change", () => {
      // If copay toggled on while no main is selected, undo it immediately
      const anyMain = mains.some((cb) => cb && cb.checked);
      if (!anyMain && elCopay.checked) {
        elCopay.checked = false;
      }
      syncGroup();
    });
  }

  // Initial sync on load
  syncGroup();
})();

// Live round-trip preview (Kundendaten → Entfernung)
(function initRoundTripPreview() {
  const kmInput = document.getElementById("distanceKm");
  const out = document.getElementById("roundTripPreview");
  if (!kmInput || !out) return;

  const paint = (v) => {
    const n = Math.max(0, Number(v) || 0);
    out.textContent = `= ${Math.round(n * 2)} km (Hin- & Rückfahrt)`;
  };

  // 1) immediate feedback while typing
  kmInput.addEventListener("input", () => paint(kmInput.value));
  kmInput.addEventListener("change", () => paint(kmInput.value));
  paint(kmInput.value); // initial

  // 2) keep in sync when server recomputes pricing
  window.addEventListener("pricing:updated", (ev) => {
    const km = ev.detail?.roundTripKm ?? window.__pricing?.roundTripKm;
    if (typeof km === "number" && isFinite(km)) {
      out.textContent = `= ${Math.round(km)} km (Hin- & Rückfahrt)`;
    }
  });
})();

/* ========== ACCESSIBLE ERROR HINTS FOR Kundendaten CONDITIONALS ========== */
(function initBereichErrorHints() {
  const form = document.getElementById("form-Kundendaten");
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

// ------- Customer helpers -------

// map form fields you already have
function getCustomerFormData() {
  return {
    customerNumber: document.getElementById("customerNumber")?.value || "",
    firstName: document.getElementById("firstName")?.value || "",
    lastName: document.getElementById("lastName")?.value || "",
    company: document.getElementById("company")?.value || "",
    email: document.getElementById("email")?.value || "",
    phone: document.getElementById("phone")?.value || "",
    street: document.getElementById("street")?.value || "",
    city: document.getElementById("city")?.value || "",
    postalCode: document.getElementById("postalCode")?.value || "",
    state: document.getElementById("state")?.value || "",
    country: document.getElementById("country")?.value || "",
  };
}

function fillCustomerForm(data) {
  const set = (id, value) => {
    const el = document.getElementById(id);
    if (el && value != null) el.value = value;
  };

  set("customerNumber", data.customerNumber);
  set("firstName", data.firstName);
  set("lastName", data.lastName);
  set("company", data.company);
  set("email", data.email);
  set("phone", data.phone);
  set("street", data.street);
  set("city", data.city);
  set("postalCode", data.postalCode);
  set("state", data.state);
  set("country", data.country);
}

// simple toast or alert helper
function showCustomerMessage(msg, type = "info") {
  console.log(type.toUpperCase(), msg);
  // optionally integrate with your existing toast system
}

// ------- Wiring -------

const saveCustomerBtn = document.getElementById("saveCustomerBtn");
const customerSearchInput = document.getElementById("customerSearch");
const customerSearchResults = document.getElementById("customerSearchResults");

if (saveCustomerBtn) {
  saveCustomerBtn.addEventListener("click", async () => {
    const data = getCustomerFormData();

    try {
      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Fehler beim Speichern");
      }

      const saved = await res.json();
      fillCustomerForm(saved); // make sure any generated customerNumber is shown
      showCustomerMessage("Kunde gespeichert", "success");
    } catch (e) {
      showCustomerMessage(
        e.message || "Fehler beim Speichern des Kunden",
        "error",
      );
    }
  });
}

let customerSearchTimeout;

if (customerSearchInput && customerSearchResults) {
  customerSearchInput.addEventListener("input", () => {
    const q = customerSearchInput.value.trim();

    clearTimeout(customerSearchTimeout);

    if (!q) {
      customerSearchResults.classList.remove("visible");
      customerSearchResults.innerHTML = "";
      return;
    }

    customerSearchTimeout = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/customers/search?q=${encodeURIComponent(q)}`,
        );
        if (!res.ok) throw new Error("Suche fehlgeschlagen");

        const results = await res.json();
        renderCustomerSearchResults(results);
      } catch (e) {
        console.error(e);
      }
    }, 250); // small debounce
  });

  // hide results on outside click
  document.addEventListener("click", (e) => {
    if (
      !customerSearchResults.contains(e.target) &&
      e.target !== customerSearchInput
    ) {
      customerSearchResults.classList.remove("visible");
    }
  });
}

function renderCustomerSearchResults(list) {
  customerSearchResults.innerHTML = "";

  if (!list.length) {
    const empty = document.createElement("div");
    empty.className = "customer-result-item";
    empty.textContent = "Kein Kunde gefunden";
    customerSearchResults.appendChild(empty);
    customerSearchResults.classList.add("visible");
    return;
  }

  list.forEach((c) => {
    const item = document.createElement("div");
    item.className = "customer-result-item";

    const main = document.createElement("div");
    main.className = "customer-result-main";
    main.textContent =
      [c.company, c.firstName, c.lastName].filter(Boolean).join(" • ") ||
      c.email ||
      c.customerNumber;

    const meta = document.createElement("div");
    meta.className = "customer-result-meta";
    meta.textContent = [c.customerNumber, c.city].filter(Boolean).join(" • ");

    item.appendChild(main);
    item.appendChild(meta);

    item.addEventListener("click", () => {
      customerSearchResults.classList.remove("visible");
      customerSearchResults.innerHTML = "";
      customerSearchInput.value = "";

      fillCustomerForm(c);
      showCustomerMessage("Kunde übernommen", "info");
    });

    customerSearchResults.appendChild(item);
  });

  customerSearchResults.classList.add("visible");
}

/* ========== DUSCHWANNE DEFAULTS ========== */
(function initDuschwanneDefaults() {
  const f = document.getElementById("form-duschwanne");
  if (!f) return;
  const deps = ["abdichtSet", "drainSet", "stelzlager", "#smallMaterial"];
  f.querySelectorAll('input[name="traySize"]').forEach((r) => {
    r.addEventListener("change", () => {
      if (window.__RESTORING__) return;
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

  const tileAdh = document.getElementById("tile_R_4260602");
  const tileSeal = document.getElementById("tile_TRBDSET7");

  const adhesivePriceEl = document.getElementById("floorAdhesivePrice");
  const sealingPriceEl = document.getElementById("floorSealingPrice");
  const panelsPriceEl = document.getElementById("flooringPanelsPrice");
  // ⬇️ NEW little fields we’ll fill
  const panelsQtyEl = document.getElementById("floorPanelsQty");
  const panelsUnitEl = document.getElementById("floorPanelsUnit");
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
    adhesive: { productId: "R_4260602", packs: 0, unit: 0, total: 0 },
    sealing: { productId: "TRBDSET7", sets: 0, unit: 0, total: 0 },
  };
  window.__DW_COMPUTED__ = computed;

  let unitAdh = 0,
    unitSeal = 0;
  let unitPanel = 0;

  async function ensureUnits() {
    if (!unitAdh) {
      const p = await getProduct("R_4260602");
      unitAdh = Number(p?.price || 0);
    }
    if (!unitSeal) {
      const p = await getProduct("TRBDSET7");
      unitSeal = Number(p?.price || 0);
    }
    if (!unitPanel) {
      // NEW: fetch V5FB02 once
      const p = await getProduct("V5FB02");
      unitPanel = Number(p?.price || 0);
    }
  }
  const euro = (n) =>
    (Number(n) || 0).toLocaleString("de-DE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  // function updateIndividPrice() {
  // if (!individPriceEl) return;
  // const m2 = parseArea();                // user-entered m² (no +15% here)
  //  const total = (unitPanel || 0) * m2;   // as requested: unit DB price × surface
  //  individPriceEl.textContent = euro(total);
  // }
  // Mirrors SERVER truth for panels (quantity, unit, total) — set it ONLY here
  function updateFlooringPanelsPriceFromPricing() {
    if (
      !window.__pricing ||
      !Array.isArray(window.__pricing?.materials?.lines)
    ) {
      if (panelsPriceEl) panelsPriceEl.textContent = "0";
      if (panelsQtyEl) panelsQtyEl.textContent = "0";
      if (panelsUnitEl) panelsUnitEl.textContent = "0";
      return;
    }
    const line = window.__pricing.materials.lines.find(
      (l) =>
        (l.productId || l.id) === "V5FB02" &&
        !String(l.label || "").includes("individ."),
    );
    // ^ pick the *panels* line; ignore the "individ." line we’ll add on the server

    if (!line) {
      if (panelsPriceEl) panelsPriceEl.textContent = "0";
      if (panelsQtyEl) panelsQtyEl.textContent = "0";
      if (panelsUnitEl) panelsUnitEl.textContent = "0";
      return;
    }
    if (panelsQtyEl) panelsQtyEl.textContent = String(line.qty ?? 0);
    if (panelsUnitEl) panelsUnitEl.textContent = euro(line.unitPrice ?? 0);
    if (panelsPriceEl) panelsPriceEl.textContent = euro(line.lineTotal ?? 0);
  }
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
      productId: "R_4260602",
      packs,
      unit: unitAdh,
      total: +totalA.toFixed(2),
    };

    // Sealing
    // Sealing (proportional per m² with +15% waste, priced from TRBDSET7 / 7)
    const sealingSelected = !!f.querySelector(
      'input[name="floorSealing[]"]:checked',
    );

    if (sealingSelected && m2 > 0) {
      const effM2 = m2 * 1.15; // +15% Verschnitt
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
  f.querySelectorAll('input[name="floorSealing[]"]').forEach((cb) => {
    cb.addEventListener("change", () => {
      ensureUnits().then(updateUI); // refresh "= … m²" hint + price
      window.updatePricing?.(); // keep server totals in sync
    });
  });
  function apply() {
    const on = !!toggle?.checked;
    show(panel, on);
    setReq(area, on);

    if (on) {
      // Adhesive: if none picked, pick the default SINGLE adhesive
      const anyAdh = f.querySelector('input[name="floorAdhesive[]"]:checked');
      if (!anyAdh) {
        const defAdh =
          f.querySelector('#tile_R_4260602 input[name="floorAdhesive[]"]') ||
          f.querySelector('input[name="floorAdhesive[]"]');
        if (defAdh) {
          defAdh.checked = true;
          highlightTileForInput(defAdh, true);
        }
      }

      // Keep color selection consistent with area (>0 => ensure ONE color; 0 => none)
      ensureUnits().then(() => {
        updateUI();
        syncColorWithAreaDW();
      });

      init(); // keep
    } else {
      if (area) area.value = "";
      try {
        localStorage.removeItem(AREA_KEY);
      } catch {}

      f.querySelectorAll(
        'input[name="flooringProduct[]"],input[name="floorAdhesive[]"],input[name="floorSealing[]"]',
      ).forEach((i) => {
        i.checked = false;
        highlightTileForInput(i, false);
      });

      if (liveAdh) adhesivePriceEl.textContent = "0";
      if (liveSeal) sealingPriceEl.textContent = "0";
      if (panelsPriceEl) panelsPriceEl.textContent = "0";

      unitAdh = unitSeal = 0;
      computed.areaM2 = 0;
      computed.adhesive = { productId: "R_4260602", packs: 0, unit: 0, total: 0 };
      computed.sealing = { productId: "TRBDSET7", sets: 0, unit: 0, total: 0 };
    }

    // Keep totals in sync with server
    window.updatePricing?.();
  }

  const floorColors = Array.from(
    f.querySelectorAll('input[name="flooringProduct[]"]'),
  );
  floorColors.forEach((cb) => {
    cb.addEventListener("change", () => {
      if (cb.checked) {
        floorColors.forEach((other) => {
          if (other !== cb) {
            other.checked = false;
            highlightTileForInput(other, false);
          }
        });
        highlightTileForInput(cb, true);
      }
      ensureUnits().then(() => {
        updateUI();
        syncColorWithAreaDW();
      });
    });
  });

  toggle?.addEventListener("change", apply);

  area?.addEventListener("input", () => {
    try {
      localStorage.setItem(AREA_KEY, area.value);
    } catch {}
    ensureUnits().then(() => {
      updateUI();
      syncColorWithAreaDW();
    });
    window.updatePricing?.();
  });

  // run once so a pre-checked toggle shows its panel
  (async () => {
    await ensureUnits();
    updateUI();
  })();

  // initial tile highlight
  f.querySelectorAll('label.image-check > input[type="checkbox"]').forEach(
    (cb) => {
      cb.addEventListener("change", () =>
        highlightTileForInput(cb, cb.checked),
      );
      highlightTileForInput(cb, cb.checked);
    },
  );

  // --- Optional: persist TRINNITY Bodenabdichtung selection ---
  const SEAL_KEY = "dw_floor_sealing";
  f.querySelectorAll('input[name="floorSealing[]"]').forEach((cb) => {
    cb.addEventListener("change", () => {
      const any = !!f.querySelector('input[name="floorSealing[]"]:checked');
      try {
        localStorage.setItem(SEAL_KEY, any ? "1" : "0");
      } catch {}
    });
  });
  try {
    const saved = localStorage.getItem(SEAL_KEY);
    if (saved === "1") {
      f.querySelectorAll('input[name="floorSealing[]"]').forEach((i) => {
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
  const out = document.getElementById("tray-suggestions");
  const hiddenId = document.getElementById("chosenTrayProductId");
  const hiddenSize = document.getElementById("traySize");

  if (!out || (!elB && !elL && !elH)) {
    console.warn("initSmartTraySearch: missing inputs or #tray-suggestions");
    return;
  }

  // ----- helpers -----

  const parseNum = (v) => {
    if (v == null) return null;
    const raw = String(v).trim();
    if (raw === "") return null; // <-- key line
    const s = raw.replace(/\./g, "").replace(",", ".");
    const n = Number(s);
    if (!Number.isFinite(n)) return null;
    return n > 0 ? n : null; // ignore 0 or negatives
  };
  const makeLabel = (w, l, h) => (w && l && h ? `${w} x ${l} x ${h} cm` : "");

  const applySelectedStyles = () => {
    const cards = Array.from(out.querySelectorAll(".suggestion-card"));
    const checked = out.querySelector('input[name="traySuggestion"]:checked');
    cards.forEach((card) => {
      const input = card.querySelector('input[name="traySuggestion"]');
      card.classList.toggle("is-selected", checked && input === checked);
    });
  };

  const persistSelection = (productId, label) => {
    try {
      localStorage.setItem(
        "dw_tray_selection",
        JSON.stringify({ productId, value: label }),
      );
    } catch {}
  };

  const applySelection = (inputEl) => {
    if (!inputEl) return;
    try {
      sessionStorage.setItem("dw_tray_touched", "1");
    } catch {}
    const pid = inputEl.value || "";
    const w = Number(inputEl.dataset.w) || null;
    const l = Number(inputEl.dataset.l) || null;
    const h = Number(inputEl.dataset.h) || null;

    const label = makeLabel(w, l, h);
    if (hiddenId) hiddenId.value = pid;
    if (hiddenSize) hiddenSize.value = label;

    persistSelection(pid, label);
    applySelectedStyles();
  };

  const updateTraySizeFromInputs = () => {
    if (!hiddenSize) return;
    const b = elB?.value?.trim();
    const l = elL?.value?.trim();
    const h = elH?.value?.trim();
    hiddenSize.value = b && l && h ? `${b} x ${l} x ${h} cm` : "";
  };

  // ----- render -----
  function renderSuggestions(list) {
    if (!Array.isArray(list) || list.length === 0) {
      out.innerHTML = `<div class="meta">Keine passenden Vorschläge gefunden.</div>`;
      applySelectedStyles();
      return;
    }

    // Only restore a saved PID if the user actually chose in THIS session
    const allowAutoCheck = sessionStorage.getItem("dw_tray_touched") === "1";
    let savedPid = null;
    try {
      const saved = JSON.parse(
        localStorage.getItem("dw_tray_selection") || "null",
      );
      savedPid = saved?.productId || null;
    } catch {}

    const top = list.slice(0, 3);
    const savedIndex =
      allowAutoCheck && savedPid
        ? top.findIndex((p) => p.productId === savedPid)
        : -1;

    const radios = top
      .map((p, i) => {
        const id = `tray-suggest-${i}`;
        const dims = `${p.widthCm} × ${p.lengthCm} × ${p.heightCm} cm`;
        const price =
          p.price != null ? ` — ${Number(p.price).toFixed(2)} €` : "";
        const title = p.name || p.productId || "Duschwanne";
        const value = p.productId || "";
        const checkedAttr = i === savedIndex ? "checked" : "";

        return `
        <label class="suggestion-card" for="${id}">
          <input type="radio"
                 id="${id}"
                 name="traySuggestion"
                 value="${value}"
                 data-w="${p.widthCm || ""}"
                 data-l="${p.lengthCm || ""}"
                 data-h="${p.heightCm || ""}"
                 ${checkedAttr} />
          <div class="info">
            <div class="title">${title}</div>
            <div class="meta">${dims}${price}</div>
          </div>
        </label>
      `;
      })
      .join("");

    out.innerHTML = `
      <div class="suggestion-heading">Vorschläge</div>
      <div class="suggestion-list">${radios}</div>
    `;

    if (savedIndex >= 0) {
      const restored = out.querySelectorAll('input[name="traySuggestion"]')[
        savedIndex
      ];
      applySelection(restored);
    }

    // (Re)bind change once per render (fine if multiple; idempotent behavior)
    out.addEventListener("change", (e) => {
      if (e.target && e.target.name === "traySuggestion") {
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
      out.innerHTML = "";
      if (hiddenId) hiddenId.value = "";
      if (hiddenSize) hiddenSize.value = "";
      try {
        sessionStorage.removeItem("dw_tray_touched");
      } catch {}
      // Cancel any in-flight request and bump sequence so its response is ignored
      try {
        inflight?.abort?.();
      } catch {}
      reqSeq++;
      return;
    }

    const qs = new URLSearchParams();
    if (b !== null) qs.set("w", String(b));
    if (l !== null) qs.set("l", String(l));
    if (h !== null) qs.set("h", String(h));
    const url = `/api/trays/suggest?${qs.toString()}`;

    try {
      inflight?.abort?.();
    } catch {}
    inflight = new AbortController();
    const mySeq = ++reqSeq;

    out.innerHTML = `<div class="meta">Suche… <code>${url}</code></div>`;

    try {
      const r = await fetch(url, {
        signal: inflight.signal,
        credentials: "include",
      });
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
      if (err.name === "AbortError") return;
      console.error("Smart tray search failed:", err);
      if (mySeq !== reqSeq) return; // ignore stale error
      out.innerHTML = `<div class="text-sm text-destructive">Netzwerkfehler</div><pre class="text-xs">${String(err)}</pre>`;
    }
  }

  const request = () => {
    clearTimeout(debounceT);
    debounceT = setTimeout(fetchAndRender, 160);
  };

  [elB, elL, elH].forEach((el) => {
    if (!el) return;
    el.addEventListener("input", () => {
      // Do NOT set dw_tray_touched here. Only on actual suggestion pick.
      if (hiddenId) hiddenId.value = "";
      updateTraySizeFromInputs();
      request();
    });
    el.addEventListener("change", () => {
      if (hiddenId) hiddenId.value = "";
      request();
    });
  });

  // Initial kick (will early-return with empty inputs)
  updateTraySizeFromInputs();
  request();

  window.__smartTray = { fetchAndRender };
}
function initTraySizeAutoLabel() {
  const traySizeEl = document.getElementById("traySize");
  const wEl = document.querySelector('input[name="tray_w_cm"]');
  const lEl = document.querySelector('input[name="tray_l_cm"]');
  const hEl = document.querySelector('input[name="tray_h_cm"]');

  if (!traySizeEl || (!wEl && !lEl && !hEl)) return;

  const updateTraySizeFromInputs = () => {
    const b = wEl?.value?.trim();
    const l = lEl?.value?.trim();
    const h = hEl?.value?.trim();
    traySizeEl.value = b && l && h ? `${b} x ${l} x ${h} cm` : "";
  };

  // keep it updated while typing
  [wEl, lEl, hEl].forEach(
    (el) => el && el.addEventListener("input", updateTraySizeFromInputs),
  );

  // set initial value if fields are prefilled
  updateTraySizeFromInputs();

  // expose in case you want to call it from elsewhere
  window.updateTraySizeFromInputs = updateTraySizeFromInputs;
}
function attachDuschwanneToPayload(payload) {
  const pid = document.getElementById("chosenTrayProductId")?.value || null;
  const size = document.getElementById("traySize")?.value || "";

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

    // 🔹 Keep Gesamt + Eigenanteil in sync on every pricing update
    if (typeof updateSummaryWidgetTotal === "function") {
      updateSummaryWidgetTotal(data.total);
    }
    if (typeof updateSummaryWidgetSelfPay === "function") {
      updateSummaryWidgetSelfPay(data.selfPayAmount);
    }

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
    el.addEventListener("change", () => window.updatePricing?.()),
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
  // UI-only: if a Duschabtrennung (Hassmann) quick-add has a user ID,
  // show it in the Kosten-Details label. Do NOT affect server, DOCX, or PDF.
  // UI-only: append [ID] to Kosten-Details labels.
  // - Already handled: “... Hassmann ...” lines (e.g., Pendeltür Hassmann).
  // - NEW: also handle both “Freier Posten” variants (Hassmann + Optional/Sonderprodukte),
  //        whose labels typically look like "- 1 Stk <text>" without the word "Hassmann".
  function decorateDALabel(line) {
    const pid = String(line.productId || line.id || "").trim();
    const base = line.label ? line.label : line.name || pid || "-";

    // If no ID, nothing to decorate
    if (!pid) return base;

    // Avoid double-appending when label already includes the same [ID]
    if (base.includes(`[${pid}]`)) return base;

    // 1) Original rule: show ID for Hassmann quick-add (kept as-is)
    if (!/^HASS_/i.test(pid) && /Hassmann/i.test(base)) {
      return `${base} [${pid}]`;
    }

    // 2) NEW rule: “Freier Posten” rows (both Hassmann and Optional) often look like "- 1 Stk …"
    //    Add [ID] for any line that looks like a free-text item (qty label form), even if it doesn’t say "Hassmann".
    //    This safely covers Freier Posten without affecting unrelated lines.
    const looksLikeQtyLabel = /^\s*-\s*\d+\s*Stk\b/i.test(base);
    if (looksLikeQtyLabel) {
      return `${base} [${pid}]`;
    }

    // Otherwise leave untouched
    return base;
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

    const rows = lines
      .map((l) => {
        if (l.__subtitle) {
          return `<div style="grid-column:1 / -1; font-weight:700; margin:8px 0 2px;">${l.label}</div>`;
        }
        return `
      <div>${decorateDALabel(l)}</div>
      <div style="text-align:right">${l.qty ?? 1}</div>
      <div style="text-align:right">${euroC(l.unitPrice ?? 0)}</div>
      <div style="text-align:right; font-weight:600">${euroC(l.lineTotal ?? 0)}</div>
    `;
      })
      .join("");

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
            const p = await getProduct(pid); // <- uses your existing cache + /api/products/:id
            if (p?.name) name = p.name;
          } catch {}
        }
        // Fallbacks: keep label if present, else pid
        if (!name) name = i.label || pid || "-";
        return { ...i, name };
      }),
    );
    return result;
  }
  // Build "Enthält je Einheit" lines for BWT only
  function buildBwtIncludedLines(data) {
    const out = [];
    // If server already computed BWT "Enthält je Einheit" rows, use them directly
    const bwtSrc = Array.isArray(data?.bwtIncludedDisplayUI)
      ? data.bwtIncludedDisplayUI
      : null;

    if (bwtSrc && bwtSrc.length) {
      return bwtSrc.map((row) => ({
        productId: row.productId || row.key || null,
        label: String(row.label || "-"),
        qty: Number(row.qty || 0) || 0,
        unitPrice: Number(row.unitPrice ?? 0),
        lineTotal: Number(row.lineTotal ?? 0),
      }));
    }

    // 1) Kilometerpauschale from services (already has correct amount)
    const svcSrc =
      data.servicesDisplayUI?.lines || data.services?.lines || [] || [];
    const kmRow = svcSrc.find((s) =>
      /kilometerpauschale/i.test(String(s.label || s.name || "")),
    );

    if (kmRow && typeof kmRow.amount === "number" && kmRow.amount > 0) {
      out.push({
        productId: kmRow.key || kmRow.productId || "kilometer",
        label: String(kmRow.label || kmRow.name || "-"),
        qty: 1, // per unit
        unitPrice: Number(kmRow.amount || 0),
        lineTotal: Number(kmRow.amount || 0),
      });
    }

    // 2) Materials: Tür + Lieferkosten + Kleinmaterial
    //    → take them from the *resolved* material list (with prices)
    const matSrc =
      Array.isArray(data.materialsDisplayDocx?.lines) &&
      data.materialsDisplayDocx.lines.length
        ? data.materialsDisplayDocx.lines
        : data.materials?.lines || [];

    const findMat = (id) =>
      matSrc.find((l) => String(l.productId || l.id || "").trim() === id);

    const doorLine = findMat("1226"); // Universal / Standard Tür
    const lieferLine = findMat("140322"); // Lieferkosten Badewannentür
    const kleinLine = findMat("KM02"); // Kleinmaterial

    const makeRowFromLine = (line, shortLabel, forceId) => {
      if (!line) return null;
      const qtyNum = Number(line.qty || 0) || 0;
      if (!Number.isFinite(qtyNum) || qtyNum <= 0) return null;

      const qtyStr = qtyNum.toFixed(2).replace(/\.00$/, "");

      return {
        productId: forceId || line.productId || line.id || null,
        label: `- ${qtyStr} Stk ${shortLabel}`,
        qty: qtyNum, // numeric, for the "Menge" column
        unitPrice: Number(line.unitPrice || 0), // comes from pricing.js / DB
        lineTotal: Number(line.lineTotal || 0), // = qty * unitPrice
      };
    };

    const rLiefer = makeRowFromLine(
      lieferLine,
      "Lieferkosten Badewannentür",
      "140322",
    );
    if (rLiefer) out.push(rLiefer);

    const rDoor = makeRowFromLine(doorLine, "Universal / Standard Tür", "1226");
    if (rDoor) out.push(rDoor);

    const rKlein = makeRowFromLine(kleinLine, "Kleinmaterial", "KM02");
    if (rKlein) out.push(rKlein);

    return out;
  }

  // Make this async so we can await name lookups for optional items
  window.renderFromData = async function renderFromData(data) {
    if (!data) {
      container.innerHTML = '<div class="muted">Keine Daten</div>';
      // also clear widget if there is no data
      if (typeof updateSummaryWidgetSelfPay === "function") {
        updateSummaryWidgetSelfPay(null);
      }
      return;
    }
    // 🔹 Update the top-right Eigenanteil widget
    if (typeof updateSummaryWidgetSelfPay === "function") {
      // data is the computed pricing result from /api/price -> contains selfPayAmount
      updateSummaryWidgetSelfPay(data.selfPayAmount);
    }

    // --- Optional (Debug): use optionalDisplayUI if present, else fallback to items
    const optLines =
      data.optionalDisplayUI && Array.isArray(data.optionalDisplayUI.lines)
        ? data.optionalDisplayUI.lines
        : (data.items || []).map((i) => ({
            productId: i.productId,
            name: i.productId,
            qty: i.qty,
            unitPrice: i.unitPrice,
            lineTotal: i.lineTotal,
          }));
    const optBody = listLines(optLines);
    // const optSum = (data.optionalDisplayUI && typeof data.optionalDisplayUI.sum === 'number')
    const optSum = data.optionalDisplayUI?.sum ?? 0;
    //  ? data.optionalDisplayUI.sum
    //  : (optLines.reduce((a, x) => a + (x.lineTotal || 0), 0));
    const optCard = card(
      "Additional gewählte Produkte",
      optBody,
      `<div style="text-align:right"><b>Summe:</b> ${euroC(optSum)}</div>`,
    );

    // --- Material (Debug): show only non-optional UI lines
    const matLines =
      data.materialsDisplayUI && Array.isArray(data.materialsDisplayUI.lines)
        ? data.materialsDisplayUI.lines
        : data.materials && Array.isArray(data.materials.lines)
          ? data.materials.lines
          : [];
    const matBody = listLines(
      matLines.map((l) => ({
        productId: l.productId || l.id,
        name: l.name,
        qty: l.qty,
        unitPrice: l.unitPrice,
        lineTotal: l.lineTotal,
        label: l.label,
      })),
    );
    const mat = data.materialsDisplayUI?.lines || data.materials?.lines || [];
    const matSum = data.materialsDisplayUI?.sum ?? data.materials?.sum ?? 0;

    // Optional (Debug): ONLY optional
    const opt = data.optionalDisplayUI?.lines || [];

    //const matSum = (data.materialsDisplayUI && typeof data.materialsDisplayUI.sum === 'number')
    //  ? data.materialsDisplayUI.sum
    //  : (data.materials?.sum || 0);
    const matCard = card(
      (data.materials && data.materials.title) || "Material für Badumbau",
      matBody,
      `<div style="text-align:right"><b>Summe Material:</b> ${euroC(matSum)}</div>`,
    );

    // --- Leistungen (Debug): use servicesDisplayUI if present
    // --- Leistungen split into two groups with a tiny whitelist
    const svcSource =
      data.servicesDisplayUI?.lines || data.services?.lines || [];

    const primarySvc = [];
    let includedSvc = [];

    for (const s of svcSource) {
      if (!s) continue;
      const label = String(s.label || "").trim();
      const plain = label.replace(/^\s*-\s*/, "");

      const goesIncluded =
        /fahrzeugbereitstellung/i.test(plain) ||
        /bereitstellung.*werkzeug/i.test(plain) ||
        /beräumung der baustelle/i.test(plain) ||
        /kilometerpauschale/i.test(plain) ||
        /facharbeiter/i.test(plain);

      const laborRate = Number(data?.services?.laborRate || 0);

      // when building the Facharbeiter row:
      const isFacharbeiter =
        s.key === "facharbeiter" || /facharbeiter/i.test(s.label || "");
      const row = {
        productId: s.key || s.productId,
        label: label || s.name || s.productId || "-",
        qty: 1,
        unitPrice: isFacharbeiter && laborRate ? laborRate : (s.amount ?? 0),
        lineTotal: s.amount,
      };

      (goesIncluded ? includedSvc : primarySvc).push(row);
    }
    // --- Für BWT: "Enthält je Einheit" komplett neu aufbauen ---
    let isBwtOffer = false;
    try {
      let currentOffer = null;

      if (typeof getCurrentOfferType === "function") {
        currentOffer = getCurrentOfferType();
      } else if (typeof loadWizardState === "function") {
        const st = loadWizardState();
        currentOffer = st && st.offerType;
      }

      if (currentOffer === "bwt") {
        isBwtOffer = true;
        includedSvc = buildBwtIncludedLines(data);
      }
    } catch (e) {
      console.warn("[kosten-debug] BWT Enthält-je-Einheit override failed:", e);
    }

    const svcBodyPrimary = listLines(primarySvc);
    const svcBodyIncluded = listLines(includedSvc);

    // Summe für "Enthält je Einheit":
    //  - BWT: Summe der 4 BWT-Zeilen (bwt_km, 140322, bwt_tuer, bwt_km02)
    //  - sonst: wie bisher data.services.sum
    const includedSvcSum = (includedSvc || []).reduce(
      (acc, row) => acc + (Number(row.lineTotal) || 0),
      0,
    );
    const sumLeistungenEnth = isBwtOffer
      ? includedSvcSum
      : data.services?.sum || 0;

    const svcCard = `
  ${card(data.services?.title || "Auszuführende Arbeiten", svcBodyPrimary)}
  <div style="height:8px"></div>
  ${card("Enthält je Einheit", svcBodyIncluded, `<div style="text-align:right"><b>Summe Leistungen:</b> ${euroC(sumLeistungenEnth)}</div>`)}
`;

    // <div>Produkte + Material: <b>${euroC(data.productsSubtotal || 0)}</b></div>
    // --- Totals (unchanged)
    const sums = `
    <div style="display:flex; flex-direction:column; gap:6px; align-items:flex-end;">
      <div>Produkte + Material: <b>${euroC(data.material_afterRabatt_and_aufschlag || 0)}</b></div>
      <div>Leistungen: <b>${euroC(data.services?.sum || 0)}</b></div>
      <div>Aufschlag (${Math.round((data.markupPct || 0) * 100)}%): <b>${euroC(data.markup || 0)}</b></div>
      <div style="font-size:1.05rem;">Zwischensumme (Netto): <b>${euroC(data.netAfterRabatt_and_Bonus || 0)}</b></div>
      <div style="font-size:1.2rem;">Gesamt: <b>${euroC(data.total || 0)}</b></div>
    </div>
  `;
    const totalsCard = card("Summen", sums);

    // --- Show/hide "Haltegriff gratis" checkbox based on CLPESG40 presence
    (function () {
      const bonusGrab = document.getElementById("rb-bonus-grab");
      if (!bonusGrab) return;

      // authoritative source from server:
      const cl40 = Number(data?.grabCounts?.cl40 || 0);
      const shouldShow = cl40 > 0;

      const row =
        bonusGrab.closest(".form-row") ||
        bonusGrab.closest("label") ||
        bonusGrab.parentElement;
      if (shouldShow) {
        if (row) row.style.display = "";
        bonusGrab.disabled = false;
      } else {
        if (row) row.style.display = "none";
        if (bonusGrab.checked) {
          bonusGrab.checked = false;
          bonusGrab.dispatchEvent(new Event("change", { bubbles: true }));
        }
        bonusGrab.disabled = true;
      }
    })();

    container.innerHTML = [matCard, optCard, svcCard, totalsCard].join("");
  };

  window.refreshAllPanels = async function refreshAllPanels() {
    try {
      const payload = collectAllFormData();
      const r = await fetch("/api/price", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await r.json();

      window.lastComputed = data;

      // Rabatt
      if (typeof renderRabatt === "function") {
        renderRabatt(data);
      } else if (typeof window.setPricingData === "function") {
        window.setPricingData(data);
      }

      // Kosten-Details (renderFromData is async)
      if (typeof renderFromData === "function") {
        await renderFromData(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // call this whenever those panels become visible (no reload needed)
  document
    .getElementById("nav-rabatt")
    ?.addEventListener("click", refreshAllPanels);
  document
    .getElementById("nav-debug")
    ?.addEventListener("click", refreshAllPanels);
  // If you use hash-based navigation:
  window.addEventListener("hashchange", () => {
    const id = location.hash.replace("#", "");
    if (id === "rabatt" || id === "kosten") refreshAllPanels();
  });

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
    if (getCurrentStep() === "Kosten") openKosten();
  });
  if (getCurrentStep() === "Kosten") openKosten();

  window.addEventListener("pricing:updated", async (ev) => {
    if (getCurrentStep() === "Kosten") {
      await renderFromData(ev.detail || window.__pricing);
    }
  });
})();

// === Pricing Playground ===
(function initPricingPlayground() {
  const page = document.getElementById("page-playground");
  if (!page) return;

  // Elements
  const selScenario = document.getElementById("pg-scenario");
  const payerRadios = Array.from(
    document.querySelectorAll('input[name="pg-payer"]'),
  );
  const aufRadios = Array.from(
    document.querySelectorAll('input[name="pg-auf"]'),
  );
  const hasPgCB = document.getElementById("pg-has-pg");
  const pgLvlWrap = document.getElementById("pg-pg-lvl");
  const pgLvlRadios = Array.from(
    document.querySelectorAll('input[name="pg-lvl"]'),
  );
  const budgetMax = document.getElementById("pg-budget-max");
  const budgetCopay = document.getElementById("pg-budget-copay");
  const copayAmount = document.getElementById("pg-copay-amount");
  const twoPersons = document.getElementById("pg-two-persons");
  const weDoneCB = document.getElementById("pg-wohnumfeld-done");
  const weAmount = document.getElementById("pg-wohnumfeld-amount");

  const discRange = document.getElementById("pg-material-discount");
  const discVal = document.getElementById("pg-material-discount-val");
  const bonus300 = document.getElementById("pg-bonus-300");
  const bonusGrab = document.getElementById("pg-bonus-grab");

  const inputPid = document.getElementById("pg-product-id");
  const inputQty = document.getElementById("pg-product-qty");
  const btnAddProd = document.getElementById("pg-add-product");
  const listProds = document.getElementById("pg-products-list");
  const datalist = document.getElementById("pg-products-datalist");

  const btnRun = document.getElementById("pg-run");
  const btnApply = document.getElementById("pg-apply");
  const btnClear = document.getElementById("pg-clear");
  const btnOpenRab = document.getElementById("pg-open-rabatt");
  const btnOpenKos = document.getElementById("pg-open-kosten");

  const outPayload = document.getElementById("pg-payload");
  const outResp = document.getElementById("pg-response");
  const outDiff = document.getElementById("pg-diff");

  let pgProducts = []; // [{productId, qty}]
  let lastResponse = null;

  function euro(n) {
    return (Number(n) || 0).toLocaleString("de-DE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  function show(el, on) {
    if (!el) return;
    el.hidden = !on;
    el.setAttribute("aria-hidden", String(!on));
  }

  // Load SLA datalist for convenience
  async function loadSLA() {
    try {
      const r = await fetch("/api/products/sla");
      if (!r.ok) return;
      const arr = await r.json();
      datalist.innerHTML = arr
        .map(
          (p) =>
            `<option value="${p.productId}">${(p.name || "").replace(/"/g, "&quot;")}</option>`,
        )
        .join("");
    } catch {}
  }
  loadSLA();

  function renderProdList() {
    if (!pgProducts.length) {
      listProds.textContent = "Noch keine Produkte hinzugefügt.";
      return;
    }
    const rows = pgProducts
      .map((p, i) => {
        return `<div style="display:flex; align-items:center; gap:8px; border-bottom:1px dashed var(--border); padding:4px 0;">
        <code>${p.productId}</code>
        <span class="muted">×</span>
        <input type="number" min="1" step="1" value="${p.qty}" data-i="${i}" class="pg-qty" style="max-width:80px;">
        <button type="button" data-i="${i}" class="pg-del secondary">Entfernen</button>
      </div>`;
      })
      .join("");
    listProds.innerHTML = rows || "—";
  }

  listProds.addEventListener("input", (e) => {
    const n = e.target.closest(".pg-qty");
    if (!n) return;
    const i = Number(n.dataset.i);
    const v = Math.max(1, Number(n.value) || 1);
    if (pgProducts[i]) {
      pgProducts[i].qty = v;
    }
  });
  listProds.addEventListener("click", (e) => {
    const b = e.target.closest(".pg-del");
    if (!b) return;
    const i = Number(b.dataset.i);
    if (pgProducts[i]) pgProducts.splice(i, 1);
    renderProdList();
  });

  btnAddProd.addEventListener("click", () => {
    const pid = (inputPid.value || "").trim();
    const qty = Math.max(1, Number(inputQty.value) || 1);
    if (!pid) return;
    const found = pgProducts.find((p) => p.productId === pid);
    if (found) found.qty += qty;
    else pgProducts.push({ productId: pid, qty });
    renderProdList();
    inputPid.value = "";
    inputQty.value = "1";
  });

  // Scenarios populate knobs
  selScenario.addEventListener("change", () => {
    const v = selScenario.value;
    // reset first
    payerRadios.forEach((r) => (r.checked = false));
    aufRadios.forEach((r) => (r.checked = false));
    hasPgCB.checked = false;
    show(pgLvlWrap, false);
    pgLvlRadios.forEach((r) => (r.checked = false));
    budgetMax.checked = budgetCopay.checked = twoPersons.checked = false;
    copayAmount.value = "";
    weDoneCB.checked = false;
    weAmount.value = "";
    discRange.value = "0";
    discVal.textContent = "0.0%";
    bonus300.checked = false;
    bonusGrab.checked = false;

    if (v === "KK_MAX4180") {
      checkRadio(payerRadios, "Kassenkunde");
      checkRadio(aufRadios, "50%");
      hasPgCB.checked = true;
      show(pgLvlWrap, true);
      checkRadio(pgLvlRadios, "2");
      budgetMax.checked = true;
    } else if (v === "KK_MIT_ZUZAHLUNG") {
      checkRadio(payerRadios, "Kassenkunde");
      checkRadio(aufRadios, "50%");
      hasPgCB.checked = true;
      show(pgLvlWrap, true);
      checkRadio(pgLvlRadios, "2");
      budgetCopay.checked = true;
      copayAmount.value = "500";
    } else if (v === "KK_2P_8360") {
      checkRadio(payerRadios, "Kassenkunde");
      checkRadio(aufRadios, "50%");
      hasPgCB.checked = true;
      show(pgLvlWrap, true);
      checkRadio(pgLvlRadios, "2");
      twoPersons.checked = true;
    } else if (v === "SZ_35") {
      checkRadio(payerRadios, "Selbstzahler");
      checkRadio(aufRadios, "35%");
      hasPgCB.checked = false;
      show(pgLvlWrap, false);
    }
  });

  function checkRadio(radios, value) {
    const r = radios.find((x) => x.value === value);
    if (r) r.checked = true;
  }

  hasPgCB.addEventListener("change", () => show(pgLvlWrap, hasPgCB.checked));
  discRange.addEventListener("input", () => {
    const v = parseFloat(discRange.value || "0") || 0;
    discVal.textContent =
      v.toLocaleString("de-DE", {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }) + "%";
  });

  function makePlaygroundPayload() {
    // Start with current form payload
    const payload = buildPayload();

    // Apply playground overrides into payload.Kundendaten / payload.rabatt
    payload.Kundendaten = payload.Kundendaten || {};

    // payer
    const payer = payerRadios.find((r) => r.checked)?.value || "";
    if (payer) payload.Kundendaten.payer = payer;

    // aufschlag
    const auf = aufRadios.find((r) => r.checked)?.value || "";
    if (auf) payload.Kundendaten.aufschlag = auf;

    // pflegegrad / budget
    const hasPG = hasPgCB.checked;
    if (hasPG) {
      payload.Kundendaten.hasPflegegrad = "Ja";
      const lvl = pgLvlRadios.find((r) => r.checked)?.value || "2";
      payload.Kundendaten.pflegegrad = lvl;
    } else {
      payload.Kundendaten.hasPflegegrad = "Nein";
      payload.Kundendaten.pflegegrad = "";
    }

    // budget options (canonical combined field used by server)
    let budget = "";
    if (twoPersons.checked) budget = "Zwei Personen mit Pflegegrad";
    else if (budgetMax.checked) budget = "4180 maximal";
    else if (budgetCopay.checked) budget = "4180 mit Zuzahlung";
    payload.Kundendaten.budgetOptionsPanel = budget;

    payload.Kundendaten.copayAmount = Number(copayAmount.value || 0) || 0;

    // wohnumfeld
    payload.Kundendaten.wohnumfeld = {
      done: !!weDoneCB.checked,
      amount: Number(weAmount.value || 0) || 0,
    };

    // rabatt + bonus
    payload.rabatt = payload.rabatt || {};
    const pct = parseFloat(discRange.value || "0") || 0;
    payload.rabatt.materialDiscountPct = pct / 100;
    payload.rabatt.bonus300 = !!bonus300.checked;
    payload.rabatt.bonusGrab = !!bonusGrab.checked;

    // inject products into optional as quantity keys (so collectSelections picks them up)
    // We’ll map productId -> qty into optional fields: opt_<PID> + qty_<PID>
    payload.optional = payload.optional || {};
    // wipe any previous ad-hoc test markers
    Object.keys(payload.optional).forEach((k) => {
      if (k.startsWith("opt_adhoc_") || k.startsWith("qty_adhoc_"))
        delete payload.optional[k];
    });

    pgProducts.forEach((p, i) => {
      // use an adhoc alias to avoid collisions with UI IDs
      const alias = `adhoc_${p.productId}`;
      payload.optional[`opt_${alias}`] = "on";
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
    const r = await fetch("/api/price", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await r.json();
    return data;
  }

  function diffObjects(prev, curr, path = "") {
    const out = [];
    if (!prev && curr) return [`+ ${path || "/"} = ${JSON.stringify(curr)}`];
    if (prev && !curr) return [`- ${path || "/"} was ${JSON.stringify(prev)}`];

    if (
      typeof prev !== "object" ||
      typeof curr !== "object" ||
      prev === null ||
      curr === null
    ) {
      if (JSON.stringify(prev) !== JSON.stringify(curr))
        out.push(
          `~ ${path || "/"}: ${JSON.stringify(prev)} → ${JSON.stringify(curr)}`,
        );
      return out;
    }
    const keys = new Set([
      ...Object.keys(prev || {}),
      ...Object.keys(curr || {}),
    ]);
    for (const k of keys) {
      const p = prev ? prev[k] : undefined;
      const c = curr ? curr[k] : undefined;
      const subPath = path ? `${path}.${k}` : k;
      out.push(...diffObjects(p, c, subPath));
    }
    return out;
  }

  btnRun.addEventListener("click", async () => {
    const payload = makePlaygroundPayload();
    outPayload.textContent = JSON.stringify(payload, null, 2);

    const data = await runPricing(payload);
    outResp.textContent = JSON.stringify(data, null, 2);

    const diff = diffObjects(lastResponse, data);
    outDiff.textContent = diff.length ? diff.join("\n") : "— keine Änderung —";
    lastResponse = data;

    // Update Rabatt pane immediately
    window.setPricingData?.(data);
    window.__pricing = data;
    window.dispatchEvent(new CustomEvent("pricing:updated", { detail: data }));
  });

  btnApply.addEventListener("click", () => {
    const payload = makePlaygroundPayload();
    // Project selected knobs back into the real forms
    // payer
    if (payload.Kundendaten?.payer) {
      const r = document.querySelector(
        `input[name="payer"][value="${payload.Kundendaten.payer}"]`,
      );
      if (r) {
        r.checked = true;
        r.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
    // aufschlag
    if (payload.Kundendaten?.aufschlag) {
      const r = document.querySelector(
        `input[name="aufschlag"][value="${payload.Kundendaten.aufschlag}"]`,
      );
      if (r) {
        r.checked = true;
        r.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
    // pflegegrad (just show/hide panels; exact mapping to Kundendaten panel already handled by initPflegegrad)
    if (payload.Kundendaten?.hasPflegegrad === "Ja") {
      const yes = document.querySelector(
        'input[name="hasPflegegrad"][value="Ja"]',
      );
      yes &&
        ((yes.checked = true),
        yes.dispatchEvent(new Event("change", { bubbles: true })));
      const lvl = payload.Kundendaten?.pflegegrad || "";
      if (lvl) {
        const rl = document.querySelector(
          `input[name="pflegegrad"][value="${lvl}"]`,
        );
        rl &&
          ((rl.checked = true),
          rl.dispatchEvent(new Event("change", { bubbles: true })));
      }
    } else {
      const no = document.querySelector(
        'input[name="hasPflegegrad"][value="Nein"]',
      );
      no &&
        ((no.checked = true),
        no.dispatchEvent(new Event("change", { bubbles: true })));
    }

    // budget options panel
    const b = String(
      payload.Kundendaten?.budgetOptionsPanel || "",
    ).toUpperCase();
    const elMax = document.querySelector('input[name="budgetMax"]');
    const elCop = document.querySelector('input[name="budgetCopay"]');
    const elTwo = document.querySelector('input[name="twoPersons"]');
    const copay = document.getElementById("copayAmount");
    if (elMax) elMax.checked = /4180.*MAX/.test(b);
    if (elCop) elCop.checked = /4180.*ZUZ/.test(b);
    if (elTwo) elTwo.checked = /ZWEI.*PERSONEN|8360/.test(b);
    if (copay) copay.value = String(payload.Kundendaten?.copayAmount || 0);

    // woh num feld
    const weY = document.querySelector(
      'input[name="wohnumfeldDone"][value="Ja"]',
    );
    const weN = document.querySelector(
      'input[name="wohnumfeldDone"][value="Nein"]',
    );
    if (payload.Kundendaten?.wohnumfeld?.done) {
      weY &&
        ((weY.checked = true),
        weY.dispatchEvent(new Event("change", { bubbles: true })));
      const amt = document.getElementById("wohnumfeldAmount");
      if (amt) amt.value = String(payload.Kundendaten?.wohnumfeld?.amount || 0);
    } else {
      weN &&
        ((weN.checked = true),
        weN.dispatchEvent(new Event("change", { bubbles: true })));
    }

    // rabatt fields
    const slider = document.getElementById("rb-material-discount");
    if (slider) {
      slider.value = String((payload.rabatt?.materialDiscountPct || 0) * 100);
      slider.dispatchEvent(new Event("input", { bubbles: true }));
      slider.dispatchEvent(new Event("change", { bubbles: true }));
    }
    const b300 = document.getElementById("rb-bonus-300");
    if (b300) {
      b300.checked = !!payload.rabatt?.bonus300;
      b300.dispatchEvent(new Event("change", { bubbles: true }));
    }
    const bgr = document.getElementById("rb-bonus-grab");
    if (bgr) {
      bgr.checked = !!payload.rabatt?.bonusGrab;
      bgr.dispatchEvent(new Event("change", { bubbles: true }));
    }

    window.updatePricing?.();
    alert("Playground-Parameter in das Angebot übernommen.");
  });

  btnClear.addEventListener("click", () => {
    selScenario.value = "";
    payerRadios.forEach((r) => (r.checked = false));
    aufRadios.forEach((r) => (r.checked = false));
    hasPgCB.checked = false;
    show(pgLvlWrap, false);
    pgLvlRadios.forEach((r) => (r.checked = false));
    budgetMax.checked = budgetCopay.checked = twoPersons.checked = false;
    copayAmount.value = "";
    weDoneCB.checked = false;
    weAmount.value = "";
    discRange.value = "0";
    discVal.textContent = "0.0%";
    bonus300.checked = false;
    bonusGrab.checked = false;
    pgProducts = [];
    renderProdList();
    outPayload.textContent = outResp.textContent = outDiff.textContent = "";
  });

  btnOpenRab.addEventListener("click", async () => {
    const payload = makePlaygroundPayload();
    const data = await runPricing(payload);
    window.__pricing = data;
    window.setPricingData?.(data);
    window.dispatchEvent(new CustomEvent("pricing:updated", { detail: data }));
    location.hash = "rabatt";
  });

  btnOpenKos.addEventListener("click", async () => {
    const payload = makePlaygroundPayload();
    const data = await runPricing(payload);
    window.__pricing = data;
    // trigger Kosten re-render
    window.dispatchEvent(new CustomEvent("pricing:updated", { detail: data }));
    location.hash = "kosten";
  });

  // Auto-run when entering page
  window.addEventListener("hashchange", () => {
    if (
      typeof getCurrentStep === "function" &&
      getCurrentStep() === "playground"
    ) {
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
  //a.download = filename;
  a.download = serverFilename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
function restoreTraySelection(dw) {
  if (!dw) return;
  // keep suggestion radio if you actually store it explicitly
  if (dw.traySuggestion) setRadio("traySuggestion", dw.traySuggestion);

  // hidden fields ONLY — do NOT address [name="traySize"] radios here
  setHiddenById("chosenTrayProductId", dw.chosenTrayProductId);
  setHiddenById("traySize", dw.traySize);
}

/* ========== save current Draft ========== */
async function saveCurrentDraft() {
  try {
    if (typeof window.buildPayload !== "function") {
      alert("Konfigurator-Payload kann nicht gebaut werden.");
      return;
    }

    const offerType =
      (typeof window.getCurrentOfferType === "function" &&
        window.getCurrentOfferType()) ||
      "bu";

    const name = prompt("Bitte geben Sie einen Namen für den Entwurf ein:");
    if (!name) return;

    const trimmedName = name.trim();
    if (!trimmedName) return;

    const payload = window.buildPayload();
    if (!payload) {
      alert("Keine Daten zum Speichern gefunden.");
      return;
    }

    const res = await fetch("/api/drafts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: trimmedName,
        offerType,
        payload,
      }),
    });

    if (res.status === 409) {
      const body = await res.json().catch(() => ({}));
      alert(body.error || "Ein Entwurf mit diesem Namen existiert bereits.");
      return;
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      console.error("saveCurrentDraft failed:", body);
      alert(body.error || "Fehler beim Speichern des Entwurfs.");
      return;
    }

    const data = await res.json();
    console.log("Draft saved:", data);
    showToast("Entwurf gespeichert.", "success");
  } catch (e) {
    console.error("saveCurrentDraft error:", e);
    alert("Fehler beim Speichern des Entwurfs.");
  }
}

/* ========== Enbd save current Draft ========== */
/* ========== Live search + load functions ========== */
function renderDraftSearchResults(list) {
  const container = document.getElementById("draftSearchResults");
  if (!container) return;

  container.innerHTML = "";
  if (!Array.isArray(list) || list.length === 0) {
    container.style.display = "none";
    return;
  }

  const frag = document.createDocumentFragment();
  list.forEach((d) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "draft-result-row";
    btn.dataset.id = d._id || d.id;
    btn.style.display = "block";
    btn.style.width = "100%";
    btn.style.textAlign = "left";
    btn.style.padding = "4px 10px";
    btn.style.border = "none";
    btn.style.background = "transparent";
    btn.style.cursor = "pointer";
    // ensure readable text color (works in dark/light themes via CSS vars)
    btn.style.color = "var(--text)";
    btn.onmouseenter = () => (btn.style.background = "#eef2ff");
    btn.onmouseleave = () => (btn.style.background = "transparent");

    const updated = d.updatedAt
      ? new Date(d.updatedAt).toLocaleString("de-DE")
      : "";

    btn.innerHTML = `<strong style="color:var(--accent-strong);">${d.name}</strong>${
      updated
        ? ` <span style="font-size:0.8em; color:#6b7280;">(${updated})</span>`
        : ""
    }`;

    frag.appendChild(btn);
  });

  container.appendChild(frag);
  container.style.display = "block";
}

async function searchDraftsForCurrentOfferType(query) {
  const offerType =
    (typeof window.getCurrentOfferType === "function" &&
      window.getCurrentOfferType()) ||
    "bu";

  const params = new URLSearchParams();
  params.set("offerType", offerType);
  if (query) params.set("q", query);

  const res = await fetch(`/api/drafts/search?${params.toString()}`, {
    method: "GET",
  });
  if (!res.ok) {
    console.warn("search drafts failed:", await res.text());
    renderDraftSearchResults([]);
    return;
  }
  const data = await res.json();
  renderDraftSearchResults(data);
}

async function loadDraftById(id) {
  try {
    const res = await fetch(`/api/drafts/${encodeURIComponent(id)}`, {
      method: "GET",
    });
    if (!res.ok) {
      alert("Entwurf konnte nicht geladen werden.");
      return;
    }
    const doc = await res.json();

    // If we have a central restore helper, use it with the full document.
    // restoreConfiguratorFromOffer already knows how to handle doc.offer or doc.payload.
    if (typeof window.restoreConfiguratorFromOffer === "function") {
      window.restoreConfiguratorFromOffer(doc);
    } else if (typeof window.restoreConfiguratorFromSnapshot === "function") {
      const payload = doc.payload || doc;
      window.restoreConfiguratorFromSnapshot({ payload });
    } else {
      // fallback: just reset and rebuild forms manually if needed
      console.warn(
        "No restore function found. Please wire restoreConfiguratorFromOffer or restoreConfiguratorFromSnapshot.",
      );

      alert("Wiederherstellen ist noch nicht implementiert.");
      return;
    }

    // after restore, recompute pricing → widget + panels up to date
    if (typeof window.updatePricing === "function") {
      window.updatePricing();
    }

    showToast(`Entwurf "${doc.name}" geladen.`, "info");
  } catch (e) {
    console.error("loadDraftById error:", e);
    alert("Fehler beim Laden des Entwurfs.");
  }
}

/* ========== End Live search + load functions ========== */

function restoreWorkTasks(dw) {
  if (!dw) return;

  let tasks = [];
  if (Array.isArray(dw.workTasks)) {
    tasks = dw.workTasks.map(String);
  } else {
    if (dw.remove_tub) tasks.push("remove_tub");
    if (dw.remove_enclosure) tasks.push("remove_enclosure");
  }

  // Look for all common patterns
  const groupSelectors = [
    'input[type="checkbox"][name="workTasks[]"]',
    'input[type="checkbox"][name="dw_workTasks[]"]',
    'input[type="checkbox"][name="duschwanne_workTasks[]"]',
    'input[type="checkbox"][name="duschwanne[workTasks][]"]',
  ];

  for (const sel of groupSelectors) {
    const boxes = Array.from(document.querySelectorAll(sel));
    if (!boxes.length) continue;

    boxes.forEach((cb) => {
      const on = tasks.includes(String(cb.value));
      cb.checked = on;
      cb.dispatchEvent(new Event("change", { bubbles: true }));
    });
    break; // stop after the group we found
  }
}

function restoreWV(wv) {
  if (!wv) return;
  const prev = window.__RESTORING__;
  window.__RESTORING__ = true;
  // --- 2a) WV consumables: clear the 4 “defaulty” items first
  const WV_DEFAULT_PIDS = ["TRWDSET5", "R_4260602", "V3A", "V4RPKIT"];
  WV_DEFAULT_PIDS.forEach((pid) => setByProductId(pid, false));

  // Kind is a radio
  if (wv.wvKind) setRadio("wvKind", wv.wvKind);

  // Color may be radio too – restore if present
  if (wv.wvColor) setRadio("wvColor", wv.wvColor);
  const pageWV = document.getElementById("page-wandverkleidung");
  if (pageWV && wv.wvColor) pageWV.dataset.wvColorRestored = "1";

  // Quantities (keep zeros)
  const pairs = [
    { cb: "wv997", qty: "wvQty997", wrap: "wvQty997Wrap" },
    { cb: "wv1497", qty: "wvQty1497", wrap: "wvQty1497Wrap" },
  ];

  pairs.forEach(({ cb, qty, wrap }) => {
    const qtyEl = document.getElementById(qty);
    const cbEl = document.getElementById(cb);
    const wrapEl = document.getElementById(wrap);
    const n = parseInt(wv[qty] ?? "0", 10) || 0;

    setInputByNameOrId(qty, n);
    if (cbEl) {
      cbEl.checked = n > 0; // tick the panel if qty>0
      cbEl.dispatchEvent(new Event("change", { bubbles: true }));
    }
    if (wrapEl) {
      wrapEl.hidden = !(n > 0);
      wrapEl.setAttribute("aria-hidden", n > 0 ? "false" : "true");
    }
  });

  // Other numbers
  setInputByNameOrId("wvEndProfileQty", wv.wvEndProfileQty);
  setInputByNameOrId("wvSilikonQty", wv.wvSilikonQty);
  setInputByNameOrId("wvFlachenQty", wv.wvFlachenQty);
  setInputByNameOrId("wvV3VQty", wv.wvV3VQty);
  setInputByNameOrId("wvCornersCount", wv.wvCornersCount);

  // --- 2b) Re-enable only what DB says was selected
  // Works with multiple possible DB shapes; keeps it robust.
  const chosenStrings = []
    .concat(wv?.materials || [])
    .concat(wv?.consumables || [])
    .concat(wv?.selected || [])
    .concat(wv?.floorSealing || [])
    .concat(wv?.adhesives || [])
    .concat(wv?.profiles || [])
    .filter(Boolean)
    .map(String);

  const chosenHas = (shortPid) =>
    chosenStrings.some((s) => s.includes(shortPid)); // e.g. "... TRWDSET5"

  setByProductId("TRWDSET5", chosenHas("TRWDSET5")); // TRINNITY Wandabdichtung
  setByProductId("R_4260602", chosenHas("R_4260602")); // Flächenkleber (Wandverkleidung)
  setByProductId("V3A", chosenHas("V3A")); // Abschlussprofil
  setByProductId("2000302", chosenHas("2000302")); // Silikon
  window.__RESTORING__ = prev;

  // Selects/radios for accessories
  if (wv.wvEndProfile) setSelect("wvEndProfile", wv.wvEndProfile);
  if (wv.wvSilikon) setSelect("wvSilikon", wv.wvSilikon);
  if (wv.flechenkleber) setSelect("flechenkleber", wv.flechenkleber);
  if (wv.wvSealing) setSelect("wvSealing", wv.wvSealing);
}

function restoreHassmannQuickAdd(da) {
  const rows = Array.isArray(da?.quickAdd) ? da.quickAdd : [];

  // Find the fieldsets by data-kind
  for (const fs of document.querySelectorAll("fieldset.da-row[data-kind]")) {
    const kind = fs.dataset.kind;
    const wrap = fs.querySelector(".da-items");
    if (!wrap) continue;

    // Clear existing (keep one blank)
    const first = wrap.querySelector(".da-item");
    if (!first) continue;
    wrap
      .querySelectorAll(".da-item:not(:first-child)")
      .forEach((n) => n.remove());

    const list = rows.filter((r) => r.kind === kind);

    const fill = (item, row) => {
      const idEl = item.querySelector(".da-id");
      const priceEl = item.querySelector(".da-price");
      const qtyEl = item.querySelector(".da-qty");
      const nameEl = item.querySelector(".da-name");

      if (idEl) idEl.value = row?.productId || "";
      if (priceEl)
        priceEl.value =
          row?.price != null
            ? String(row.price).replace(".", ",")
            : row?.priceRaw || "";
      if (qtyEl) qtyEl.value = row?.qty != null ? String(row.qty) : "";
      if (nameEl) nameEl.value = row?.label || row?.name || "";
    };

    if (list.length) {
      fill(first, list[0]);

      for (let i = 1; i < list.length; i++) {
        // Use the globally exposed addRow function
        let item =
          typeof window.addRow === "function"
            ? window.addRow(kind, fs, false)
            : null;

        if (!item) {
          // Fallback: clone the first item
          item = first.cloneNode(true);
          wrap.appendChild(item);
        }

        fill(item, list[i]);
      }
    } else {
      // No data for this kind - ensure first row is cleared
      const idEl = first.querySelector(".da-id");
      const priceEl = first.querySelector(".da-price");
      const qtyEl = first.querySelector(".da-qty");
      const nameEl = first.querySelector(".da-name");
      if (idEl) idEl.value = "";
      if (priceEl) priceEl.value = "";
      if (qtyEl) qtyEl.value = "";
      if (nameEl) nameEl.value = "";
    }
  }

  // Update localStorage to match restored state using globally exposed function
  if (typeof window.__daQuickAddSaveState === "function") {
    window.__daQuickAddSaveState();
  }
}
function restoreOptional(opt) {
  if (!opt) return;

  // Local dispatcher that respects the global restore guard
  const dispatchChange = (el) => {
    if (!el) return;
    if (window.__restoring || window.__RESTORING__) return;
    el.dispatchEvent(new Event("change", { bubbles: true }));
  };

  const form = document.getElementById("form-optional");
  if (!form) return;

  // 1) Reset all optional kid checkboxes
  form.querySelectorAll('input[type="checkbox"][id^="opt_"]').forEach((cb) => {
    cb.checked = false;
  });

  // 2) Restore quantities + derive checkbox state from qty_* fields
  Object.entries(opt).forEach(([key, val]) => {
    if (!key.startsWith("qty_")) return;

    // Restore the number field itself
    const qtyInput = document.getElementById(key);
    if (qtyInput) {
      qtyInput.value = val;
    }

    // Matching checkbox id: opt_XXXX from qty_XXXX
    const baseId = key.slice(4); // remove "qty_"
    const cb = document.getElementById(`opt_${baseId}`);
    if (!cb) return;

    const num = parseInt(String(val), 10) || 0;
    cb.checked = num > 0;
  });

  // 3) Fire change for all checked kids so wireTileQty and visibility sync up
  form
    .querySelectorAll('input[type="checkbox"][id^="opt_"]:checked')
    .forEach((el) => dispatchChange(el));
}

function restoreRabatt(r) {
  if (!r) return;
  const slider = document.getElementById("rb-material-discount");
  if (slider) {
    const raw = r.materialDiscountPct || 0; // 0..1
    slider.value = String(raw * 100);
    slider.dispatchEvent(new Event("input", { bubbles: true }));
    slider.dispatchEvent(new Event("change", { bubbles: true }));
  }
  setCheckboxById("rb-bonus-300", !!r.bonus300);
  setCheckboxById("rb-bonus-grab", !!r.bonusGrab);
}

function restoreBwt(bwt) {
  if (!bwt) return;

  const form = document.getElementById("form-bwt");
  if (!form) return;

  // We deliberately do NOT check __restoring / __RESTORING__ here,
  // because we want the tile wiring (wireTileQty) to re-run and
  // sync visibility + qty based on the restored state.
  const fireChange = (el) => {
    if (!el) return;
    el.dispatchEvent(new Event("change", { bubbles: true }));
  };

  // --- Wannenform (bwtShape: radio) ---
  if (bwt.bwtShape) {
    setRadio("bwtShape", bwt.bwtShape);
  }

  // --- BWT Umbau Info: bwt[bwtinfoTasks][] -> checkboxes ---
  let infoTasks = [];
  if (Array.isArray(bwt.bwtinfoTasks)) {
    infoTasks = bwt.bwtinfoTasks.map(String);
  } else if (typeof bwt["bwt[bwtinfoTasks][]"] === "string") {
    infoTasks = [String(bwt["bwt[bwtinfoTasks][]"])];
  }

  if (infoTasks.length) {
    const boxes = form.querySelectorAll(
      'input[type="checkbox"][name="bwt[bwtinfoTasks][]"]',
    );
    boxes.forEach((cb) => {
      cb.checked = infoTasks.includes(String(cb.value));
    });
  }

  // --- Material (bwtMaterial: radio in #bwtMaterialGroup) ---
  if (bwt.bwtMaterial) {
    setRadio("bwtMaterial", bwt.bwtMaterial);
  }

  // --- Tür-Typ (bwtDoorType: checkbox tile(s) + qty) ---
  if (bwt.bwtDoorType) {
    const doorInputs = form.querySelectorAll('input[name="bwtDoorType"]');
    doorInputs.forEach((el) => {
      const on = String(el.value) === String(bwt.bwtDoorType);
      el.checked = on;
      if (on) fireChange(el); // let wireTileQty handle qty-wrapper & required
    });
  }

  if (bwt.bwtDoorStdQty != null) {
    setByNameOrId("bwtDoorStdQty", bwt.bwtDoorStdQty);
  }
  if (bwt.bwtDoorBudgetQty != null) {
    setByNameOrId("bwtDoorBudgetQty", bwt.bwtDoorBudgetQty);
  }
  if (bwt.bwtDoorIndWienGlasQty != null) {
    setByNameOrId("bwtDoorIndWienGlasQty", bwt.bwtDoorIndWienGlasQty);
  }
  if (bwt.bwtDoorVariodoorQty != null) {
    setByNameOrId("bwtDoorVariodoorQty", bwt.bwtDoorVariodoorQty);
  }
  if (bwt.bwtDoorIndWienQty != null) {
    setByNameOrId("bwtDoorIndWienQty", bwt.bwtDoorIndWienQty);
  }

  // --- Anschlag (bwtAnschlag: radio) ---
  if (bwt.bwtAnschlag) {
    setRadio("bwtAnschlag", bwt.bwtAnschlag);
  }

  // --- Farbe (tray_color: color radio group) ---
  if (bwt.tray_color) {
    setRadio("tray_color", bwt.tray_color);
  }

  // --- Haltegriffe (bwtAids[] + *_Qty) ---
  let aids = [];
  if (Array.isArray(bwt.bwtAids)) {
    aids = bwt.bwtAids.map(String);
  } else if (typeof bwt["bwtAids[]"] === "string") {
    aids = [String(bwt["bwtAids[]"])];
  }

  const aidConfigs = [
    {
      value: "Haltegriff40",
      cbId: "bwtAidsHaltegriff40",
      qtyName: "bwtAidsHaltegriff40Qty",
    },
    {
      value: "Haltegriff60",
      cbId: "bwtAidsHaltegriff60",
      qtyName: "bwtAidsHaltegriff60Qty",
    },
    {
      value: "Haltegriff80",
      cbId: "bwtAidsHaltegriff80",
      qtyName: "bwtAidsHaltegriff80Qty",
    },
  ];

  aidConfigs.forEach(({ value, cbId, qtyName }) => {
    const cb = document.getElementById(cbId);
    const qtyInput = document.getElementById(qtyName);
    const num = Number(bwt[qtyName] || 0) || 0;

    const isOn = aids.includes(value) || num > 0;

    if (cb) {
      cb.checked = isOn;
    }
    if (qtyInput && bwt[qtyName] != null) {
      qtyInput.value = String(bwt[qtyName]);
    }

    // Trigger wireTileQty so:
    // - wrappers are shown/hidden correctly
    // - qty 1/0 and required attribute are synced
    fireChange(cb);
  });
  // Freier Posten (BWT) quickAdd
  restoreBwtExtras(bwt);
}

// ---- RESTORE HELPERS PER PAGE ----

// Kundendaten / Kunde
function restoreKundendaten(k, offer) {
  if (!k) return;

  setRadio("salutation", k.salutation);
  setByNameOrId("date", k.date);
  setByNameOrId("firstName", k.firstName);
  setByNameOrId("lastName", k.lastName);
  setByNameOrId("phone", k.phone);
  setByNameOrId("email", k.email);
  setByNameOrId("street", k.street);
  setByNameOrId("city", k.city);
  setByNameOrId("state", k.state);
  setByNameOrId("postalCode", k.postalCode);
  setByNameOrId("deployment", k.deployment);
  setByNameOrId("customerNumber", k.customerNumber);
  setSelect("customerType", k.customerType);

  // contact person
  setRadio("hasContactPerson", k.hasContactPerson);
  setByNameOrId("cp_name", k.cp_name);
  setByNameOrId("cp_phone", k.cp_phone);
  setByNameOrId("cp_street", k.cp_street);
  setByNameOrId("cp_city", k.cp_city);
  setByNameOrId("cp_state", k.cp_state);
  setByNameOrId("cp_postalCode", k.cp_postalCode);

  // internals (+ budget)
  setByNameOrId("emc2_contact", k.emc2_contact);
  setByNameOrId("bitrixContactId", k.bitrixContactId);
  setRadio("payer", k.payer);
  if (typeof restoreBudgetPanel === "function") restoreBudgetPanel(k);
  setRadio("aufschlag", k.aufschlag);

  // Pflegegrad + Wohnumfeld
  setRadio("hasPflegegrad", k.hasPflegegrad);
  if (k.pflegegrad) setRadio("pflegegrad", String(k.pflegegrad));
  if (typeof restorePflegegradAndWohnumfeld === "function") {
    restorePflegegradAndWohnumfeld(k);
  }

  setNumber("copayAmount", k.copayAmount);
}

// Arbeitszeit / Distanz
function restoreArbeitszeit(aw) {
  if (!aw) return;
  setNumber("distanceKm", aw.distanceKm);
  setByNameOrId("travelTime", aw.travelTimeHHMM);
  setByNameOrId("laborHours", aw.laborHoursHHMM);

  // BWT: Extra Arbeitszeit rows (if present in payload)
  if (typeof window.restoreBwtExtraArbeitszeitFromPayload === "function") {
    window.restoreBwtExtraArbeitszeitFromPayload(aw);
  }
}

// Duschwanne
function restoreDuschwanne(dw) {
  if (!dw) return;

  // numeric inputs (quiet during restore)
  setByNameOrId("tray_w_cm", dw.tray_w_cm);
  setByNameOrId("tray_l_cm", dw.tray_l_cm);
  setByNameOrId("tray_h_cm", dw.tray_h_cm);

  // hidden traySize
  setHiddenById("traySize", dw.traySize);

  // color etc.
  setByNameOrId("trayColor", dw.trayColor);

  // toggles
  setCheckbox("ebenerdigeToggle", !!dw.ebenerdigeMontage);
  setCheckbox("abdichtSet", !!dw.abdichtSet);
  setCheckbox("drainSet", !!dw.drainSet);
  setCheckbox("smallMaterial", !!dw.smallMaterial);
  setCheckbox("stelzlager", !!dw.stelzlager);

  setHiddenById("chosenTrayProductId", dw.chosenTrayProductId);
  setNumber("floorArea", dw.floorArea);

  // work tasks
  if (typeof restoreWorkTasks === "function") {
    restoreWorkTasks(dw);
  }
  if (typeof window.restoreDWExtraTasksFromPayload === "function") {
    window.restoreDWExtraTasksFromPayload(dw);
  }
  if (typeof restoreTraySelection === "function") {
    restoreTraySelection(dw);
  }

  if ("addFlooring" in dw) {
    setCheckbox("addFlooring", !!dw.addFlooring);
  }

  // flooring color from payload
  (function restoreFloorColorFromPayload(innerDw) {
    if (!innerDw) return;
    const form = document.getElementById("form-duschwanne");
    if (!form) return;

    let vals = [];

    if (Array.isArray(innerDw.flooringProduct)) {
      vals = innerDw.flooringProduct.slice();
    } else if (
      typeof innerDw.flooringProduct === "string" &&
      innerDw.flooringProduct
    ) {
      vals = [innerDw.flooringProduct];
    } else if (Array.isArray(innerDw["flooringProduct[]"])) {
      vals = innerDw["flooringProduct[]"].slice();
    } else if (
      typeof innerDw["flooringProduct[]"] === "string" &&
      innerDw["flooringProduct[]"]
    ) {
      vals = [innerDw["flooringProduct[]"]];
    } else if (
      innerDw.computed &&
      Array.isArray(innerDw.computed.flooringProduct)
    ) {
      vals = innerDw.computed.flooringProduct.slice();
    }

    if (!vals.length) return;

    const target = String(vals[0] || "");
    if (!target) return;

    const inputs = Array.from(
      form.querySelectorAll('input[name="flooringProduct[]"]'),
    );
    if (!inputs.length) return;

    inputs.forEach((cb) => {
      cb.checked = cb.value === target;
      if (typeof highlightTileForInput === "function") {
        highlightTileForInput(cb, cb.checked);
      }
    });

    if (typeof syncColorWithAreaDW === "function") {
      syncColorWithAreaDW();
    }
  })(dw);

  if (typeof restoreTrinnityFloorSealing === "function") {
    restoreTrinnityFloorSealing(dw);
  }

  // persist SmartTray selection in storage
  try {
    const pid = dw.chosenTrayProductId || "";
    const label = dw.traySize || "";
    if (pid) {
      localStorage.setItem(
        "dw_tray_selection",
        JSON.stringify({ productId: pid, value: label }),
      );
      sessionStorage.setItem("dw_tray_touched", "1");
    }
  } catch {}
}

// BWT – you already have this; keep your current implementation
// function restoreBwt(bwt) { ... }

// Optional
function restoreOptionalPage(opt) {
  if (!opt) return;

  // qty_* fields
  for (const [k, v] of Object.entries(opt)) {
    if (k.startsWith("qty_")) {
      setByNameOrId(k, v);
    }
  }

  // existing granular restore
  restoreOptional(opt);

  // Sonderprodukte (quickAdd)
  if (Array.isArray(opt.quickAdd)) {
    const panel =
      document.getElementById("optSonderPanel") ||
      document.getElementById("opt-sonder");

    if (panel) {
      const rowsContainer = panel.querySelector(".da-items") || panel;
      let rows = Array.from(rowsContainer.querySelectorAll(".da-item"));

      if (!rows.length) {
        const tpl = document.getElementById("opt-item-template");
        if (tpl && tpl.content && tpl.content.firstElementChild) {
          const node = tpl.content.firstElementChild.cloneNode(true);
          node.classList.add("da-item");
          rowsContainer.appendChild(node);
          rows = [node];
        }
      }

      if (rows.length) {
        const tplRow = rows[0];
        const items = opt.quickAdd;

        while (rows.length > items.length && rows.length > 1) {
          const last = rows.pop();
          if (last) last.remove();
        }

        while (rows.length < items.length) {
          const clone = tplRow.cloneNode(true);
          rowsContainer.appendChild(clone);
          rows.push(clone);
        }

        rows.forEach((row, index) => {
          const data = items[index] || {};
          const nameEl = row.querySelector(".opt-name");
          const idEl = row.querySelector(".opt-id");
          const qtyEl = row.querySelector(".opt-qty");
          const priceEl = row.querySelector(".opt-price");

          const label = data.label ?? "";
          const pid = data.productId ?? "";
          const qty = data.qty ?? "";
          let price = data.price ?? "";

          if (typeof price === "number") {
            price = String(price).replace(".", ",");
          } else if (price !== "") {
            price = String(price);
          } else {
            price = "";
          }

          if (nameEl) nameEl.value = label;
          if (idEl) idEl.value = pid;
          if (qtyEl) qtyEl.value = qty !== "" ? String(qty) : "";
          if (priceEl) priceEl.value = price;
        });
      }
    }
  }

  // ensure parent categories ON if kids selected
  (function ensureOptionalParentsSelected(innerOpt) {
    if (!innerOpt) return;
    const map = {
      cat_SHOWER: [
        "opt_V22WS1R",
        "opt_TEMPDSU250",
        "opt_V22BG903R",
        "opt_DEDS2503E",
      ],
      cat_THERMO: ["opt_CLTB", "opt_DEPTB", "opt_CLB"],
      cat_GRAB: ["opt_CLPESG40", "opt_CLPESG60", "opt_CLPESG80"],
      cat_FOLD: ["opt_DEPSKG60", "opt_DEPSKG85"],
      cat_SEAT: ["opt_DEPKS", "opt_CLPESDH", "opt_78090000"],
      cat_BASIN: ["opt_CL60", "opt_CL65", "opt_CL55"],
      cat_BASIN_TAP: ["opt_CL_BASIN", "opt_DEPOH"],
      cat_METER: ["opt_TECEADS"],
      cat_REHA : ["opt_24081000","opt_24081100","opt_24081500","opt_24081600","opt_24081005",
        "opt_24081105", "opt_24081505", "opt_24081605", "opt_25670000", "opt_24081800",
        "opt_24096000", "opt_24097000", "opt_24096240", "opt_19034422", "opt_35035200",
        "opt_35035145", "opt_35035148", "opt_35035281", "opt_35035280", "opt_78700800", 
        "opt_78701700", "opt_78700400","opt_78701500",  "opt_78700750", "opt_78700850",
        "opt_11096600", "opt_11096610", "opt_11020600", "opt_11020700", "opt_11020710",
        "opt_11020300", "opt_14661000", "opt_14662000", "opt_26013000", "opt_26014000",
        "opt_26014200", "opt_091095504", "opt_10440000", 
          ]
    };
    Object.entries(map).forEach(([parentId, kids]) => {
      const anyKidChecked = kids.some((id) => {
        const el = document.getElementById(id);
        return !!(el && el.checked);
      });
      if (anyKidChecked) {
        const parent = document.getElementById(parentId);
        if (parent && !parent.checked) {
          parent.checked = true;
        }
      }
    });

    if (Array.isArray(innerOpt.quickAdd) && innerOpt.quickAdd.length > 0) {
      const sonder = document.getElementById("cat_SONDER");
      if (sonder && !sonder.checked) {
        sonder.checked = true;
      }
    }
  })(opt);
}

// Duschabtrennung quick-add (you already have logic inside restoreConfiguratorFromOffer;
// wrap it into a function so we can call it from the router)
function restoreDuschabtrennung(da) {
  if (!da || !Array.isArray(da.quickAdd)) return;

  const rows = da.quickAdd;
  const byKind = {};
  rows.forEach((r) => {
    const k = r?.kind || "quick";
    if (!byKind[k]) byKind[k] = [];
    byKind[k].push(r);
  });

  const root = document.getElementById("page-duschabtrennung") || document;

  root.querySelectorAll("fieldset.da-row[data-kind]").forEach((fs) => {
    const kind = fs.dataset.kind;
    const list = byKind[kind] || [];
    const wrap = fs.querySelector(".da-items");
    if (!wrap) return;
    const first = wrap.querySelector(".da-item");
    if (!first) return;

    wrap
      .querySelectorAll(".da-item:not(:first-child)")
      .forEach((n) => n.remove());

    const fillRow = (item, row) => {
      const idEl = item.querySelector(".da-id");
      const priceEl = item.querySelector(".da-price");
      const qtyEl = item.querySelector(".da-qty");
      const nameEl = item.querySelector(".da-name");

      if (idEl) idEl.value = row?.productId || "";
      if (priceEl)
        priceEl.value =
          row?.price != null
            ? String(row.price).replace(".", ",")
            : row?.priceRaw || "";
      if (qtyEl) qtyEl.value = row?.qty != null ? String(row.qty) : "";
      if (nameEl) nameEl.value = row?.label || row?.name || "";
    };

    if (list.length) {
      fillRow(first, list[0]);

      for (let i = 1; i < list.length; i++) {
        let item =
          typeof window.addRow === "function"
            ? window.addRow(kind, fs, false)
            : null;

        if (!item) {
          item = first.cloneNode(true);
          wrap.appendChild(item);
        }

        fillRow(item, list[i]);
      }
    } else {
      [
        first.querySelector(".da-id"),
        first.querySelector(".da-price"),
        first.querySelector(".da-qty"),
        first.querySelector(".da-name"),
      ].forEach((el) => {
        if (el) el.value = "";
      });
    }
  });
}

// ---- PAGE → RESTORE HANDLER MAP ----

const RESTORE_HANDLERS = {
  Kundendaten: (p, ctx) => restoreKundendaten(p?.Kundendaten, ctx.offer),
  Arbeitszeit: (p, ctx) => restoreArbeitszeit(p?.Arbeitszeit),

  Duschwanne: (p, ctx) => restoreDuschwanne(p?.duschwanne),

  Wandverkleidung: (p, ctx) =>
    typeof restoreWV === "function" && restoreWV(p?.wandverkleidung),

  Duschabtrennung: (p, ctx) => restoreDuschabtrennung(p?.duschabtrennung),

  Optional: (p, ctx) => restoreOptionalPage(p?.optional),

  Rabatt: (p, ctx) =>
    typeof restoreRabatt === "function" && restoreRabatt(p?.rabatt),

  bwt: (p, ctx) => typeof restoreBwt === "function" && restoreBwt(p?.bwt),

  hl: (p, ctx) => typeof restoreHl === "function" && restoreHl(p?.hl),

  ah: (p, ctx) => typeof restoreAh === "function" && restoreAh(p?.ah),
    hms: (p, ctx) => typeof restoreHms === "function" && restoreAh(p?.hms),

    wd: (p, ctx) => typeof restoreWd === "function" && restoreAh(p?.wd),

};

async function restoreConfiguratorFromOffer(doc) {
  window.__restoring = true;
  window.__RESTORING__ = true;

  let offer = null;
  let p = null;

  const dispatchChange = (el) => {
    if (!el) return;
    if (window.__restoring || window.__RESTORING__) return;
    el.dispatchEvent(new Event("change", { bubbles: true }));
  };

  try {
    offer = doc?.offer || doc;
    p = offer?.payload;
    if (!p) return;

    // normalize offerType
    const rawOfferType =
      doc?.offerType ||
      offer?.offerType ||
      p?.activeOffer ||
      p?.offerType ||
      "bu";

    const offerType = String(rawOfferType).trim().toLowerCase();

    // compute pages for this offer
    const basePages = ["Kundendaten", "Arbeitszeit"]; // always restore these
    const offerPages = (OFFERS[offerType] && OFFERS[offerType].pages) || [];
    const pagesToRestore = Array.from(new Set([...basePages, ...offerPages]));

    const ctx = { offerType, offer, doc };

    // ---- per-page restore, driven by OFFERS[offerType].pages ----
    for (const page of pagesToRestore) {
      const handler = RESTORE_HANDLERS[page];
      if (typeof handler === "function") {
        handler(p, ctx);
      }
    }

    // Rabatt page might not be in OFFERS.pages for some types; ensure it
    if (!pagesToRestore.includes("Rabatt") && RESTORE_HANDLERS.Rabatt) {
      RESTORE_HANDLERS.Rabatt(p, ctx);
    }

    // Show loaded offer number if present
    if (offer?.offerNumber) {
      const el = document.querySelector("#offerNumber");
      if (el) el.value = offer.offerNumber;
    }
  } finally {
    window.__restoring = false;
    window.__RESTORING__ = false;
  }

  // ===== POST-RESTORE NUDGES =====
  const fire = (sel) => dispatchChange(document.querySelector(sel));

  // Kundendaten dependencies
  fire('input[name="payer"]:checked');
  fire('input[name="aufschlag"]:checked');
  fire('input[name="hasPflegegrad"]:checked');
  fire('input[name="pflegegrad"]:checked');
  fire('input[name="wohnumfeldDone"]:checked');

  // Re-run the HH:MM → numeric mirrors so Reisezeit + Tage are correct
  (() => {
    const labor = document.getElementById("laborHours");
    const travel = document.getElementById("travelTime");

    // Prefer the new multi-day helper if available
    if (typeof window.updateTotalHours === "function") {
      window.updateTotalHours();
      return;
    }

    // VERY LAST RESORT: only if updateTotalHours does not exist at all
    if (typeof hhmmToHours === "function") {
      const L = hhmmToHours(labor?.value || "0:00");
      const T1 = hhmmToHours(travel?.value || "0:00");

      // Do NOT assume 1 day here anymore – just mirror simple values
      window.arbeit_hours_numeric = Math.max(0, L);
      window.reise_hours_numeric = Math.max(0, T1 * 2);
      window.total_hours_numeric =
        window.arbeit_hours_numeric + window.reise_hours_numeric;
    }
  })();

  // Duschwanne dependencies
  fire("#addFlooring");
  document
    .querySelectorAll('#form-duschwanne input[name*="workTasks"]')
    .forEach((el) => dispatchChange(el));

  if (
    window.__smartTray &&
    typeof window.__smartTray.fetchAndRender === "function"
  ) {
    window.__smartTray.fetchAndRender();
  }

  // Wandverkleidung dependencies
  fire('input[name="wvKind"]:checked');

  // Optional parents
  [
    "#cat_SHOWER",
    "#cat_THERMO",
    "#cat_GRAB",
    "#cat_FOLD",
    "#cat_SEAT",
    "#cat_BASIN",
    "#cat_BASIN_TAP",
    "#cat_METER",
    "#cat_SONDER",
  ].forEach((id) => dispatchChange(document.querySelector(id)));

  // Optional child tiles
  document
    .querySelectorAll(
      '#form-optional input[type="checkbox"][id^="opt_"]:checked',
    )
    .forEach((el) => dispatchChange(el));

  // ===== Recompute pricing =====
  if (typeof window.updatePricing === "function") {
    const pl =
      p || (typeof buildPayload === "function" ? buildPayload() : null);
    await window.updatePricing(pl);
    await window.updatePricing(pl);

    if (typeof ensureTrinitySealingSelectedFromPayload === "function") {
      ensureTrinitySealingSelectedFromPayload(p?.duschwanne);
    }

    if (typeof window.setPricingData === "function" && window.__pricing) {
      window.setPricingData(window.__pricing);
      window.dispatchEvent(
        new CustomEvent("pricing:updated", { detail: window.__pricing }),
      );
    }

    if (typeof window.refreshAllPanels === "function") {
      await window.refreshAllPanels();
    }

    document
      .getElementById("rb-bonus-300")
      ?.dispatchEvent(new Event("change", { bubbles: true }));
    document
      .getElementById("rb-bonus-grab")
      ?.dispatchEvent(new Event("change", { bubbles: true }));
  }

  // ⬅️ NEW: after restore + pricing, sync the widget name from Kundendaten
  if (typeof updateSummaryWidgetName === "function") {
    updateSummaryWidgetName();
  }
}

function setCurrentOfferType(offerType) {
  const key = String(offerType || "bu")
    .trim()
    .toLowerCase();
  console.log("[setCurrentOfferType] key =", key);

  const state = loadWizardState() || {};
  state.offerType = key;

  const flowSteps = typeof getFlowSteps === "function" ? getFlowSteps() : steps;

  console.log("[setCurrentOfferType] flowSteps =", flowSteps);

  state.step = (flowSteps && flowSteps.find((s) => s !== "home")) || "home";

  if (typeof saveWizardState === "function") {
    saveWizardState(state);
  }

  document.querySelectorAll("[data-offer-key]").forEach((tile) => {
    const tKey = String(tile.dataset.offerKey || "")
      .trim()
      .toLowerCase();
    tile.classList.toggle("active", tKey === key);
  });

  console.log("[setCurrentOfferType] navigating to step", state.step);
  setStep(state.step);
}

document.getElementById("btnLoadOffer")?.addEventListener("click", async () => {
  const input = document.getElementById("loadOfferNumber");
  const n = input?.value?.trim();
  if (!n) {
    alert("Bitte Angebotsnummer eingeben.");
    return;
  }

  try {
    const res = await fetch(`/api/offers/${encodeURIComponent(n)}`, {
      method: "GET",
      credentials: "include",
    });

    if (!res.ok) {
      alert("Angebot wurde nicht gefunden.");
      return;
    }

    const data = await res.json();
    const doc = data.offer || data;
    const offer = doc.offer || doc;
    const payload = offer.payload || {};

    const rawOfferType =
      offer.offerType || payload.activeOffer || payload.offerType || "bu";

    const offerType = String(rawOfferType).trim().toLowerCase();

    // 🔹 Decide which step to open for this offer
    let pages = [];
    if (typeof getPagesForOfferType === "function") {
      pages = getPagesForOfferType(offerType);
    } else if (typeof getFlowSteps === "function") {
      pages = getFlowSteps();
    } else {
      pages = steps || [];
    }

    const targetStep = (pages && pages[0]) || "home"; // [1] = first real page in your logic

    // 🔹 Set wizard state + navigate using the same core function used by boot/hashchange
    if (typeof window.applyWizardState === "function") {
      window.applyWizardState({
        offerType,
        step: targetStep,
      });
    } else {
      // fallback if applyWizardState does not exist
      const state =
        (typeof loadWizardState === "function" ? loadWizardState() : {}) || {};
      state.offerType = offerType;
      state.step = targetStep;
      if (typeof saveWizardState === "function") saveWizardState(state);
      setStep(targetStep);
    }

    // 🔹 Restore all form fields from the offer
    if (typeof window.restoreConfiguratorFromOffer === "function") {
      await window.restoreConfiguratorFromOffer(doc);
    }
  } catch (err) {
    console.error("Failed to load offer:", err);
    alert("Fehler beim Laden des Angebots.");
  }
});

// Collect rows from Optional → Sonderprodukte into payload.optional.quickAdd
function collectOptionalQuickAdd(payload) {
  const panel =
    document.getElementById("optSonderPanel") ||
    document.getElementById("opt-sonder");

  if (!panel) return;

  const rows = panel.querySelectorAll(".da-item");
  const parseEuro =
    typeof parseMoneyStrict === "function"
      ? (v) => parseMoneyStrict(v) || 0
      : (v) => {
          if (typeof parseMoneyEuro === "function") {
            const n = parseMoneyEuro(v);
            if (!isNaN(n) && n > 0) return n;
          }
          if (typeof v !== "string") v = String(v ?? "");
          const cleaned = v
            .replace(/[^\d.,-]/g, "")
            .replace(/\./g, "")
            .replace(",", ".");
          const n = Number(cleaned);
          return isFinite(n) ? n : 0;
        };

  const out = [];
  rows.forEach((row) => {
    const label = row.querySelector(".opt-name")?.value?.trim() || "";
    const pid = row.querySelector(".opt-id")?.value?.trim() || "";
    const qtyV = row.querySelector(".opt-qty")?.value ?? "";
    const priceV = row.querySelector(".opt-price")?.value ?? "";

    const price = parseEuro(priceV) || 0;
    let qty = Number(String(qtyV).replace(/[^\d-]/g, ""));
    if (!Number.isFinite(qty) || qty <= 0) {
      // default qty=1 if price valid and name present, mirroring add-row behavior
      qty = label && price > 0 ? 1 : 0;
    }

    // Keep only valid lines
    if (label && price > 0 && qty > 0) {
      out.push({ label, price, qty, productId: pid });
    }
  });

  if (!payload.optional) payload.optional = {};
  payload.optional.quickAdd = out;
}

// === Optional → Sonderprodukte (Quick-Add) ===
// Assumes presence of the following DOM nodes in index.html:
//   #optSonderToggle  (optional UI toggle; we keep it if present)
//   #optSonderPanel   (panel that contains rows)
//   #opt-item-template  (template to clone rows)
//   #cat_SONDER checkbox controls visibility of #menu_SONDER (category enable)
// Row inputs inside a row (.da-item):
//   .opt-name, .opt-price, .opt-qty, .opt-id
// Row buttons (optional):
//   .btn-del-row  (delete/clear row)
// Add button (outside rows, somewhere inside panel):
//   .btn-add-row
function initOptionalSonderprodukte() {
  const LS_KEY = "optQuickAddRows:v1";

  const toggle = document.getElementById("optSonderToggle") || null;
  const panel =
    document.getElementById("optSonderPanel") ||
    document.getElementById("opt-sonder");

  const tpl = document.getElementById("opt-item-template");
  const catCb = document.getElementById("cat_SONDER");

  if (!panel || !tpl) {
    console.warn("[sonder] missing panel/template, skipping init");
    return;
  }

  // Helper: robust euro parsing (reuse existing tolerant parsers if available)
  const parseEuro = (v) => {
    if (typeof parseMoneyStrict === "function") {
      const n = parseMoneyStrict(v);
      if (!isNaN(n) && n > 0) return n;
    }
    if (typeof parseMoneyEuro === "function") {
      const n = parseMoneyEuro(v);
      if (!isNaN(n) && n > 0) return n;
    }
    if (typeof v !== "string") v = String(v ?? "");
    // accept "1.234,56", "1234.56", "199", "199 €"
    const cleaned = v
      .replace(/[^\d.,-]/g, "")
      .replace(/\./g, "") // drop thousands sep
      .replace(",", "."); // unify decimal
    const n = Number(cleaned);
    return isFinite(n) ? n : 0;
  };

  const rowsContainer = panel.querySelector(".da-items") || panel; // fall back to panel
  rowsContainer.addEventListener("click", (e) => {
    const del = e.target.closest(".da-remove");
    if (!del) return;
    e.preventDefault();

    const row = del.closest(".da-item");
    if (!row) return;

    const rows = queryRows();
    if (rows.length <= 1) {
      // keep one row visible → just clear it
      clearRow(row);
    } else {
      row.remove();
    }
    saveAll();
  });

  const queryRows = () =>
    Array.from(rowsContainer.querySelectorAll(".da-item"));

  const readRow = (row) => {
    const name = row.querySelector(".opt-name")?.value?.trim() || "";
    const pid = row.querySelector(".opt-id")?.value?.trim() || "";
    const qtyV = row.querySelector(".opt-qty")?.value ?? "";
    const priceV = row.querySelector(".opt-price")?.value ?? "";

    const price = parseEuro(priceV) || 0;
    let qty = Number(String(qtyV).replace(/[^\d-]/g, ""));
    if (!Number.isFinite(qty) || qty <= 0) qty = 0;

    return { label: name, productId: pid, qty, price };
  };

  const writeRow = (row, data) => {
    if (!row) return;
    const { label = "", productId = "", qty = "", price = "" } = data || {};
    const $n = row.querySelector(".opt-name");
    if ($n) $n.value = label;
    const $i = row.querySelector(".opt-id");
    if ($i) $i.value = productId;
    const $q = row.querySelector(".opt-qty");
    if ($q) $q.value = Number(qty) > 0 ? qty : "";
    const $p = row.querySelector(".opt-price");
    if ($p) $p.value = price !== "" ? price : "";
  };

  const validateRow = (row) => {
    const { label, price, productId } = readRow(row);
    if (!label) return false;
    if (!(price > 0)) return false;
    if (!productId) return false; // ID is required
    return true;
  };

  const clearRow = (row) =>
    writeRow(row, { label: "", productId: "", qty: "", price: "" });
  const saveAll = () => {
    const rows = queryRows()
      .map(readRow)
      .filter((r) => r.label || r.price || r.qty || r.productId); // keep even partial so user doesn’t lose text
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(rows));
    } catch (e) {
      console.warn("[sonder] save failed", e);
    }
  };

  const loadAll = () => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  };
  // Permanently clear all stored Sonderprodukte rows
  function clearAll() {
    try {
      localStorage.removeItem(LS_KEY);
    } catch (e) {}
  }

  const createRow = (prefill) => {
    const node = tpl.content
      ? tpl.content.firstElementChild.cloneNode(true)
      : tpl.cloneNode(true);
    node.classList.add("da-item"); // ensure class present
    writeRow(node, prefill || {});

    // === Sonderprodukte qty/price behavior ===
    const $qty = node.querySelector(".opt-qty");
    const $price = node.querySelector(".opt-price");

    // When user types in qty:
    //  - strip non-digits
    //  - if "0" → make it empty immediately
    if ($qty) {
      $qty.addEventListener("input", (e) => {
        const raw = String(e.target.value || "");
        const digits = raw.replace(/[^\d]/g, "");
        if (digits === "0") {
          e.target.value = ""; // 0 becomes empty
        } else {
          e.target.value = digits;
        }
        // persist
        if (typeof saveAll === "function") saveAll();
      });

      // On blur: if price is valid and qty empty/≤0 → set to 1. If price invalid → keep empty.
      $qty.addEventListener("blur", () => {
        const r = readRow(node);
        const p = parseEuro(r.price);
        let q = Number(String($qty.value || "").replace(/[^\d]/g, ""));
        if (!Number.isFinite(q)) q = 0;
        if (p > 0 && (!q || q <= 0)) {
          $qty.value = 1;
        } else if (q === 0) {
          $qty.value = ""; // never show 0
        }
        if (typeof saveAll === "function") saveAll();
      });
    }

    // When user types a price:
    //  - if price becomes valid and qty empty/≤0 → set qty to 1 automatically
    if ($price) {
      $price.addEventListener("input", () => {
        const r = readRow(node);
        const p = parseEuro(r.price);
        if (p > 0 && $qty) {
          let q = Number(String($qty.value || "").replace(/[^\d]/g, ""));
          if (!Number.isFinite(q) || q <= 0) {
            $qty.value = 1;
          }
        } else if ($qty) {
          // if price cleared/invalid, normalize a "0" qty to empty
          if (String($qty.value).trim() === "0") $qty.value = "";
        }
        if (typeof saveAll === "function") saveAll();
      });
    }

    // Save on any input change
    node.addEventListener("input", saveAll, { passive: true });

    return node;
  };

  const ensureAtLeastOneRow = () => {
    const rows = queryRows();
    if (!rows.length) {
      rowsContainer.appendChild(createRow());
    }
  };

  const addRow = () => {
    const rows = queryRows();
    if (rows.length) {
      const last = rows[rows.length - 1];
      const r = readRow(last);

      // If label missing → focus label
      if (!r.label) {
        last.querySelector(".opt-name")?.focus();
        return;
      }
      // If price invalid → focus price
      if (!(r.price > 0)) {
        last.querySelector(".opt-price")?.focus();
        return;
      }
      // If ID missing → focus ID
      if (!r.productId) {
        last.querySelector(".opt-id")?.focus();
        return;
      }

      // If price valid & ID present but qty missing/≤0 → auto-default qty to 1
      if (!r.qty || r.qty <= 0) {
        const q = last.querySelector(".opt-qty");
        if (q) q.value = 1;
      }
    }

    rowsContainer.appendChild(createRow());
    saveAll();
  };

  // Restore from storage
  const restored = loadAll();
  const removeAllDomRows = () => {
    queryRows().forEach((el) => el.remove());
  };

  if (restored.length) {
    // Remove any pre-rendered rows (e.g., initial “Freier Posten”) to avoid duplicates
    removeAllDomRows();
    restored.forEach((r) => rowsContainer.appendChild(createRow(r)));
  } else {
    // Start clean: ensure exactly one empty row
    removeAllDomRows();
    ensureAtLeastOneRow();
  }

  // Wire "+" add button
  const addBtn = panel.querySelector(".da-add");
  if (addBtn)
    addBtn.addEventListener("click", (e) => {
      e.preventDefault();
      addRow();
    });

  // Optional: toggle shows/hides the panel (SONDER category still governs main visibility)
  if (toggle) {
    const applyToggle = () => {
      const on = !!(
        toggle.checked || toggle.getAttribute("aria-pressed") === "true"
      );
      panel.style.display = on ? "" : "none";
      // If turning off, we do NOT clear rows automatically (you can change if desired)
    };
    toggle.addEventListener("change", applyToggle);
    applyToggle();
  }
  // When the parent category checkbox is toggled: if turned off, wipe storage + DOM rows
  if (catCb) {
    catCb.addEventListener("change", (e) => {
      const checked = !!e.target.checked;
      if (!checked) {
        // 1) clear persistence
        clearAll();

        // 2) remove all rows from DOM
        queryRows().forEach((el) => el.remove());

        // 3) do NOT call saveAll() here — we want the key gone, not set to "[]"
        // panel will be hidden by applyCatVisibility()
      } else {
        // Re-enabled: start fresh with one empty row (no restore)
        ensureAtLeastOneRow();
        // Optional: do not call saveAll() yet; let user input drive persistence
      }
    });
  }

  // Show/hide with SONDER category checkbox
  const applyCatVisibility = () => {
    // Only manage panel visibility if no explicit toggle in use
    if (!toggle) {
      const on = catCb ? !!catCb.checked : true;
      panel.style.display = on ? "" : "none";
    }
  };
  if (catCb) catCb.addEventListener("change", applyCatVisibility);
  applyCatVisibility();
}

// Save a final offer snapshot after a successful export
async function saveFinalOfferSnapshot() {
  if (typeof buildPayload !== "function") return;

  // 1) Build full payload from UI
  const fullPayload = buildPayload();

  // 2) Filter by offer type (same as drafts)
  const filteredPayload =
    typeof filterPayloadByOffer === "function"
      ? filterPayloadByOffer(fullPayload)
      : fullPayload;

  // 3) Determine offer type (same logic as drafts / restore)
  const rawOfferType =
    filteredPayload.activeOffer ||
    filteredPayload.offerType ||
    (typeof getCurrentOfferType === "function"
      ? getCurrentOfferType()
      : null) ||
    "bu";

  const offerType = String(rawOfferType).trim().toLowerCase();

  // 4) Offer number
  const offerNumber =
    document.getElementById("offerNumber")?.value?.trim() ||
    (typeof genOfferNumber === "function" ? genOfferNumber() : "");

  // 5) Ensure pricing snapshot (use filtered payload!)
  let pricing = window.__pricing;
  if (!pricing && typeof window.updatePricing === "function") {
    pricing = await window.updatePricing(filteredPayload);
  }

  // 6) Persist finished offer snapshot
  try {
    await fetch("/api/offers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        offerNumber,
        offerType,
        payload: filteredPayload,
        pricing,
      }),
    });
  } catch (err) {
    console.error("Failed to save final offer snapshot:", err);
  }
}

document.getElementById("makePdf")?.addEventListener("click", async () => {
  if (!requireBereichValid()) {
    location.hash = "Kundendaten";
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
    await downloadPDFWithProgress("/pdf", payload);
  } catch (e) {
    showPDFProgress(`PDF-Erstellung fehlgeschlagen: ${e.message}`, "error");
  }
});

document
  .getElementById("makePdfFromTemplate")
  ?.addEventListener("click", async () => {
    if (!requireBereichValid()) {
      location.hash = "Kundendaten";
      return;
    }
    try {
      const payload = buildPayload();
      await downloadPDFWithProgress("/pdf-template", payload);
      document
        .getElementById("pdfActions")
        ?.style.setProperty("display", "flex");
    } catch (e) {
      showPDFProgress(`PDF-Erstellung fehlgeschlagen: ${e.message}`, "error");
    }
  });

async function downloadDocx(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    console.error("DOCX download failed", res.status, await res.text());
    return;
  }

  // Read filename from Content-Disposition
  const cd = res.headers.get("content-disposition") || "";
  let serverFilename = "Angebot.docx";
  const match = cd.match(/filename="?(.*?)"?$/i);
  if (match && match[1]) {
    serverFilename = match[1];
  }
  console.log("[downloadDocx] serverFilename:", serverFilename);

  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = serverFilename; // <- use backend name here
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}

document.getElementById("downloadDocx")?.addEventListener("click", async () => {
  if (!requireBereichValid()) {
    location.hash = "Kundendaten";
    return;
  }
  try {
    const payload = buildPayload();
    await downloadDocx("/docx-template", payload);
  } catch (e) {
    show({ error: String(e) }, false);
  }
});

document.getElementById("sendForm")?.addEventListener("click", async () => {
  if (!requireBereichValid()) {
    location.hash = "Kundendaten";
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
    location.hash = "Kundendaten";
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
      location.hash = "Kundendaten";
      return;
    }
    try {
      const payload = buildPayload();

      await downloadDocx(
        "/docx-template/material-overview",
        payload,
        // `Materialuebersicht_${Date.now()}.docx`
      );
    } catch (e) {
      console.error(e);
      show({ error: String(e) }, false);
      alert("Materialübersicht konnte nicht erstellt werden.");
    }
  });

// Angebot als PDF aus LATEX-Vorlage
document
  .getElementById("downloadLatexPdf")
  ?.addEventListener("click", async () => {
    if (!requireBereichValid()) {
      location.hash = "Kundendaten";
      return;
    }
    try {
      const payload = buildPayload();
      await downloadPDFWithProgress("/latex-template/pdf", payload);
    } catch (e) {
      showPDFProgress(
        `LaTeX-PDF-Erstellung fehlgeschlagen: ${e.message}`,
        "error",
      );
    }
  });

// Angebot als PDF aus DOCX-Vorlage
document
  .getElementById("downloadDocxAsPdf")
  ?.addEventListener("click", async () => {
    if (!requireBereichValid()) {
      location.hash = "Kundendaten";
      return;
    }
    try {
      const payload = buildPayload();
      await downloadPDFWithProgress("/docx-template/pdf", payload);
    } catch (e) {
      console.error(e);
      showPDFProgress(`PDF-Erstellung fehlgeschlagen: ${e.message}`, "error");
    }
  });

/* ========== RABATT SECTION (UI bound to server data) ========== */
const elDiscount = document.getElementById("rb-material-discount");
// -- END: bonus-300 first-click fix helpers --

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
    // row.style.display = on ? "contents" : "none";
    row.style.display = on ? "" : "none";
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
// ---- one-and-done reliable recompute for bonus toggles ----
async function __recalcRabattNow() {
  try {
    const pl = typeof buildPayload === "function" ? buildPayload() : null;
    if (!pl) return;
    await window.updatePricing?.(pl); // recompute with the current payload
    if (typeof window.refreshAllPanels === "function") {
      await window.refreshAllPanels(); // repaint Rabatt/Kosten deterministically
    } else if (
      typeof window.setPricingData === "function" &&
      window.__pricing
    ) {
      window.setPricingData(window.__pricing);
      window.dispatchEvent(
        new CustomEvent("pricing:updated", { detail: window.__pricing }),
      );
    }
  } catch (e) {
    console.warn("[rabatt] recompute failed", e);
  }
}

document
  .getElementById("rb-bonus-300")
  ?.addEventListener("change", async () => {
    const cb = document.getElementById("rb-bonus-300");
    if (!cb) return;

    const want = !!cb.checked; // what the user asked for

    // phase 1: recompute once with the new payload
    await __recalcRabattNow();

    // renderer may have toggled visibility or state; enforce user's intent
    if (cb.checked !== want) cb.checked = want;

    // phase 2: recompute again so totals reflect the final state immediately
    await __recalcRabattNow();
  });

document
  .getElementById("rb-bonus-grab")
  ?.addEventListener("change", () => queueMicrotask(__recalcRabattNow));

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
      document.createTextNode(`Aufschlag ${pctInt}%`),
    );

    // Show/hide 300€ bonus based on threshold (after rab.)
    (function gateBonus300() {
      const afterRab = Number(data?.totalAfterRabatt || 0);
      const cb300 = document.getElementById("rb-bonus-300");
      const row =
        document.getElementById("rb-bonus-300-row") ||
        cb300?.closest("label.radio-pill") ||
        cb300?.parentElement ||
        null;

      const shouldShow = afterRab > 3000;

      if (row) {
        row.style.display = shouldShow ? "" : "none";
        row.hidden = !shouldShow;
        row.setAttribute("aria-hidden", String(!shouldShow));
      }

      // If ineligible, clear silently (no 'change' dispatch → no race)
      // if (!shouldShow && cb300 && cb300.checked) {
      // cb300.checked = false;
      //}
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

    const nothingToShow = !hasRabatt && !anyBonus;
    const emptyNote = document.getElementById("rb-empty-note");
    if (emptyNote) {
      emptyNote.style.display = nothingToShow ? "block" : "none";
      emptyNote.hidden = !nothingToShow;
    }

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
    const row =
      document.getElementById("rb-bonus-grab-row") ||
      document.getElementById("rb-bonus-grab")?.closest("label.radio-pill") ||
      document.getElementById("rb-bonus-grab")?.parentElement;
    const cb = document.getElementById("rb-bonus-grab");

    const cl40 = Number(data?.grabCounts?.cl40 || 0);
    const allow = cl40 > 0;

    if (row) {
      row.style.display = allow ? "" : "none";
      row.hidden = !allow;
      row.setAttribute("aria-hidden", String(!allow));
    }
    if (!allow && cb && cb.checked) {
      //cb.checked = false;
      cb.dispatchEvent(new Event("change", { bubbles: true }));
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
  const isAufschlagAtLeast50 = () => {
    const raw = (
      document.querySelector('input[name="aufschlag"]:checked')?.value || ""
    ).trim(); // z.B. "35%", "50%", "60%"

    const m = raw.match(/(\d+)\s*%?/); // Zahl vor dem %
    if (!m) return false;
    const pct = parseInt(m[1], 10);
    if (!Number.isFinite(pct)) return false;

    return pct >= 50; // alles ab 50% → Rabatt erlaubt
  };
  function show(el, on) {
    el.hidden = !on;
    el.setAttribute("aria-hidden", String(!on));
    if (el.style) el.style.display = on ? "" : "none";
  }
  function apply() {
    const allow = isKK() && isAufschlagAtLeast50();
    show(sec, allow);

    if (!allow || window.__restoring) {
      const cur = parseFloat(elDiscount.value || "0") || 0;
      if (!window.__restoring && cur !== 0) {
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
  const reqWrap = document.getElementById("basinRequiredWrap");
  if (!reqWrap) return;

  // Main products
  const cl60 = document.getElementById("opt_CL60");
  const qCL60 = document.getElementById("qty_CL60");

  const cl65 = document.getElementById("opt_CL65");
  const qCL65 = document.getElementById("qty_CL65");

  const cl55 = document.getElementById("opt_CL55");
  const qCL55 = document.getElementById("qty_CL55");

  // Required accessories
  const wtbf = document.getElementById("opt_WTBF");
  const qWT = document.getElementById("qty_WTBF");
  const rsl = document.getElementById("opt_RSL");
  const qRSL = document.getElementById("qty_RSL");
  const ev = document.getElementById("opt_EV");
  const qEV = document.getElementById("qty_EV");
  const evLbl = document.querySelector('label[for="qty_EV"]');

  // CL60 + accessories must exist; CL65/CL55 may be absent in older HTML
  if (
    !cl60 ||
    !qCL60 ||
    !wtbf ||
    !qWT ||
    !rsl ||
    !qRSL ||
    !ev ||
    !qEV ||
    !evLbl
  )
    return;

  const basins = [
    { key: "cl60", cb: cl60, qtyInput: qCL60 },
    { key: "cl65", cb: cl65, qtyInput: qCL65 },
    { key: "cl55", cb: cl55, qtyInput: qCL55 },
  ].filter((b) => b.cb && b.qtyInput);

  // ---------- helpers ----------
  const num = (v, d = 0) => {
    const s = String(v ?? "")
      .trim()
      .replace(/\./g, "")
      .replace(",", ".");
    const n = Number(s);
    return Number.isFinite(n) ? n : d;
  };
  const dispatch = (el) => {
    if (!el) return;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  };
  const show = (el, v = true) => {
    if (!el) return;
    el.hidden = !v;
    el.setAttribute("aria-hidden", String(!v));
  };
  const anyBasinChecked = () => basins.some((b) => b.cb.checked);

  const updateEvPairsLabel = () => {
    const base =
      evLbl.dataset.baseLabel || evLbl.textContent.replace(/\s*\(.*\)\s*$/, "");
    evLbl.dataset.baseLabel = base;
    const qty = num(qEV.value, 0);
    const pairs = qty / 2;
    evLbl.textContent = `${base} (${Number.isInteger(pairs) ? pairs : pairs.toFixed(1)} paare)`;
  };

  // ---------- persistence ----------
  const KEY = "basin_required_state";
  const loadState = () => {
    try {
      return JSON.parse(localStorage.getItem(KEY) || "null") || {};
    } catch {
      return {};
    }
  };
  const saveState = () => {
    const s = {
      // each basin gets its own state
      cl60: { checked: !!cl60.checked, qty: num(qCL60.value, 0) },
      cl65:
        cl65 && qCL65
          ? { checked: !!cl65.checked, qty: num(qCL65.value, 0) }
          : undefined,
      cl55:
        cl55 && qCL55
          ? { checked: !!cl55.checked, qty: num(qCL55.value, 0) }
          : undefined,
      wtbf: { checked: !!wtbf.checked, qty: num(qWT.value, 0) },
      rsl: { checked: !!rsl.checked, qty: num(qRSL.value, 0) },
      ev: { checked: !!ev.checked, qty: num(qEV.value, 0) },
    };
    try {
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch {}
  };
  const applyState = (s) => {
    if (s.cl60) {
      cl60.checked = !!s.cl60.checked;
      dispatch(cl60);
      if (Number.isFinite(s.cl60.qty)) {
        qCL60.value = String(s.cl60.qty);
        dispatch(qCL60);
      }
    }
    if (s.cl65 && cl65 && qCL65) {
      cl65.checked = !!s.cl65.checked;
      dispatch(cl65);
      if (Number.isFinite(s.cl65.qty)) {
        qCL65.value = String(s.cl65.qty);
        dispatch(qCL65);
      }
    }
    if (s.cl55 && cl55 && qCL55) {
      cl55.checked = !!s.cl55.checked;
      dispatch(cl55);
      if (Number.isFinite(s.cl55.qty)) {
        qCL55.value = String(s.cl55.qty);
        dispatch(qCL55);
      }
    }
    if (s.wtbf) {
      wtbf.checked = !!s.wtbf.checked;
      dispatch(wtbf);
      if (Number.isFinite(s.wtbf.qty)) {
        qWT.value = String(s.wtbf.qty);
        dispatch(qWT);
      }
    }
    if (s.rsl) {
      rsl.checked = !!s.rsl.checked;
      dispatch(rsl);
      if (Number.isFinite(s.rsl.qty)) {
        qRSL.value = String(s.rsl.qty);
        dispatch(qRSL);
      }
    }
    if (s.ev) {
      ev.checked = !!s.ev.checked;
      dispatch(ev);
      if (Number.isFinite(s.ev.qty)) {
        qEV.value = String(s.ev.qty);
        dispatch(qEV);
      }
    }
    updateEvPairsLabel();
  };

  // ---------- rule: apply on user basin qty change ----------
  const applyRuleFromBasins = () => {
    if (!anyBasinChecked()) {
      // no basin selected → just keep pairs label + save state
      updateEvPairsLabel();
      saveState();
      return;
    }

    // sum of all selected basin quantities
    let total = 0;
    basins.forEach(({ cb, qtyInput }) => {
      if (!cb.checked) return;
      let q = num(qtyInput.value, 1);
      if (q < 1) {
        q = 1;
        qtyInput.value = "1";
        dispatch(qtyInput);
      }
      total += q;
    });

    // Overwrite accessory quantities when any basin qty changes (user action)
    if (wtbf.checked) {
      qWT.value = String(total);
      dispatch(qWT);
    }
    if (rsl.checked) {
      qRSL.value = String(total);
      dispatch(qRSL);
    }
    if (ev.checked) {
      qEV.value = String(total * 2);
      dispatch(qEV);
    }

    updateEvPairsLabel();
    saveState();
  };

  // ---------- wire events ----------
  // When any basin is turned ON by the user: show required section, select accessories and set base values once
  basins.forEach(({ cb, qtyInput }) => {
    cb.addEventListener("change", () => {
      if (cb.checked) {
        show(reqWrap, true);

        // Ensure required accessories are selected (quantities will be set by the rule)
        if (!wtbf.checked) {
          wtbf.checked = true;
          dispatch(wtbf);
        }
        if (!rsl.checked) {
          rsl.checked = true;
          dispatch(rsl);
        }
        if (!ev.checked) {
          ev.checked = true;
          dispatch(ev);
        }

        // Set this basin to 1 if empty/invalid
        if (!num(qtyInput.value)) {
          qtyInput.value = "1";
          dispatch(qtyInput);
        }

        // Apply the rule NOW so we land on correct WTBF/RSL/EV quantities immediately
        applyRuleFromBasins();
      } else {
        // if this one is turned off, we still keep the section visible
        // as long as any other basin is checked
        show(reqWrap, anyBasinChecked());
        saveState();
      }
    });

    // RULE TRIGGER: when user changes this basin's quantity
    qtyInput.addEventListener("input", applyRuleFromBasins);
    qtyInput.addEventListener("change", applyRuleFromBasins);
  });

  // Any manual edits by the user should persist
  [qWT, qRSL, qEV].forEach((el) => {
    el.addEventListener("input", () => {
      updateEvPairsLabel();
      saveState();
    });
    el.addEventListener("change", () => {
      updateEvPairsLabel();
      saveState();
    });
  });
  [wtbf, rsl, ev].forEach((cb) => cb.addEventListener("change", saveState));

  // ---------- initial restore (NO rule application here) ----------
  const state = loadState();
  const hasSaved = Object.keys(state).length > 0;
  if (hasSaved) {
    // Restore exactly what the user had last time; don't run the rule.
    applyState(state);
    show(reqWrap, anyBasinChecked());
  } else {
    // First-time defaults if any basin already checked (e.g. server-side prefill)
    if (anyBasinChecked()) {
      show(reqWrap, true);
      // Select accessories & set base values, but still no rule until user changes qty
      if (!wtbf.checked) {
        wtbf.checked = true;
        dispatch(wtbf);
      }
      if (!rsl.checked) {
        rsl.checked = true;
        dispatch(rsl);
      }
      if (!ev.checked) {
        ev.checked = true;
        dispatch(ev);
      }

      basins.forEach(({ cb, qtyInput }) => {
        if (cb.checked && !num(qtyInput.value)) {
          qtyInput.value = "1";
          dispatch(qtyInput);
        }
      });

      updateEvPairsLabel();
      saveState();
    }
  }
}

// === WV selection ↔ menge sync (minimal, non-invasive) ===
(function () {
  const byId = (id) => document.getElementById(id);
  const q = (sel, root = document) => root.querySelector(sel);

  // Elements for the 4 items
  const pairs = [
    // Flächenkleber R_4260602
    {
      cb: q('#flechenSection input[type=checkbox][name="flechenkleber"]'),
      qty: byId("wvFlachenQty"),
      kind: "ADH",
    },
    // Abschlussprofil V3A
    {
      cb: q('#wvEndProfileSection input[type=checkbox][name="wvEndProfile"]'),
      qty: byId("wvEndProfileQty"),
      kind: "END",
    },
    // Profilklebstoff V4RPKIT
    {
      cb: q('#wvProfileAdhesiveSection input[type=checkbox][name="wvSilikon"]'),
      qty: byId("wvSilikonQty"),
      kind: "PADH",
    },
    // Verbindungsprofil V3V (checkbox is UI only; qty governs pricing)
    { cb: byId("wvV3VSelected"), qty: byId("wvV3VQty"), kind: "V3V" },
  ].filter((p) => p.cb && p.qty);

  // When a checkbox is toggled
  function onCheckboxChange(p) {
    const current = +p.qty.value || 0;
    if (p.cb.checked) {
      if (current === 0) {
        // Use fallback for adhesive if visible, otherwise min 1
        let v = 1;

        p.qty.value = v;
        // propagate to any existing listeners
        p.qty.dispatchEvent(new Event("input", { bubbles: true }));
        p.qty.dispatchEvent(new Event("change", { bubbles: true }));
      }
    } else {
      if (current !== 0) {
        p.qty.value = 0;
        p.qty.dispatchEvent(new Event("input", { bubbles: true }));
        p.qty.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
  }

  // When quantity changes, reflect on the checkbox (reflexive)
  function onQtyChange(p) {
    let v = +p.qty.value || 0;

    // When we are restoring after a full resetAllForms(),
    // do NOT allow a checked item to end up with qty 0.
    // Enforce minimum qty = 1 in that special case.
    if (window.__restoring && v <= 0 && p.cb && p.cb.checked) {
      v = 1;
      p.qty.value = v;
    }

    if (v <= 0) {
      if (p.cb.checked) {
        p.cb.checked = false;
        p.cb.dispatchEvent(new Event("change", { bubbles: true }));
      }
    } else {
      if (!p.cb.checked) {
        p.cb.checked = true;
        p.cb.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
  }

  // Wire listeners and perform initial sync
  pairs.forEach((p) => {
    p.cb.addEventListener("change", () => onCheckboxChange(p));
    p.qty.addEventListener("input", () => onQtyChange(p));
    p.qty.addEventListener("change", () => onQtyChange(p));

    // Initial sync (page load): keep any prefilled qty (e.g., fallback).
    const current = +p.qty.value || 0;

    if (p.cb.checked && current === 0) {
      // If something marked it selected but left qty empty, set minimum
      let v = 1;

      p.qty.value = v;
    }

    // Reflect qty to checkbox for V3V and others
    onQtyChange(p);
  });
})();

function refreshHassmannFrame() {
  const iframe = document.getElementById("hassmannFrame");
  if (!iframe) return;

  // Base URL to reload (use data attr if you later change src dynamically)
  const base =
    iframe.dataset.src ||
    iframe.getAttribute("src") ||
    "https://gconlineplus.de";

  // Simple cache-buster so the remote site fully re-renders
  const bust = (base.includes("?") ? "&" : "?") + "_=" + Date.now();

  // Safari-safe reload: blank, then set URL
  iframe.src = "about:blank";
  setTimeout(() => {
    iframe.src = base + bust;
  }, 0);
}

// --- Routing suggestion: one-way km from address -> Vorschlag neben distanceKm ---
function secondsToHHMM(totalSeconds) {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return "";
  const minutes = Math.round(totalSeconds / 60); // round to nearest minute
  const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
  const mm = String(minutes % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

async function suggestDistanceFromAddress() {
  const out = document.getElementById("routingSuggestion");
  const kmInput = document.getElementById("distanceKm");
  if (!out) return;

  // Extract Kundendaten from the existing form
  const form = document.getElementById("form-Kundendaten");
  if (!form) {
    out.textContent = "Kundendaten-Formular nicht gefunden.";
    return;
  }

  const streetEl = document.getElementById("street");
  const cityEl = document.getElementById("city");
  const plzEl = document.getElementById("postalCode");

  const street = (streetEl?.value || "").trim();
  const city = (cityEl?.value || "").trim();
  const plz = (plzEl?.value || "").trim();

  if (!street && !city && !plz) {
    out.textContent =
      "Bitte zuerst Adresse, PLZ oder Ort beim Kunden ausfüllen.";
    return;
  }

  out.textContent = "Berechne Routenvorschlag …";

  // Minimal Kundendaten payload (matches backend expectations)
  const kundendaten = {
    street,
    city,
    postalCode: plz,
    state: document.getElementById("state")?.value || "",
    country: document.getElementById("country")?.value || "",
  };

  try {
    const res = await fetch("/api/routing/suggest-distance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ Kundendaten: kundendaten }),
      credentials: "include",
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      out.textContent = err.error || "Routenvorschlag fehlgeschlagen.";
      return;
    }

    const data = await res.json();
    if (!data.ok) {
      out.textContent = data.error || "Routenvorschlag fehlgeschlagen.";
      return;
    }

    const oneWayKm = Number(data.oneWayKm || 0);
    const roundKm = Number(data.roundTripKm || 0);

    if (!Number.isFinite(oneWayKm) || oneWayKm <= 0) {
      out.textContent = "Keine sinnvolle Strecke ermittelt.";
      return;
    }

    const oneWayStr = oneWayKm.toFixed(1).replace(".", ",");
    const roundStr = roundKm.toFixed(1).replace(".", ",");

    // Render suggestion + “Übernehmen” link
   out.innerHTML = `
  <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
    <div>
      Vorschlag: <strong>${oneWayStr} km</strong>
      <span style="opacity:.8;">(Hin- &amp; Rückfahrt: ${roundStr} km)</span>
    </div>

    <button
      type="button"
      id="btnApplyRoutingSuggestion"
      class="btn-primary"
      style="
        margin-left:auto;
        padding:10px 14px;
        font-weight:700;
        border-radius:10px;
        box-shadow:0 6px 16px rgba(0,0,0,.12);
        display:inline-flex;
        align-items:center;
        gap:8px;
      "
      aria-label="Vorschlag übernehmen"
      title="Vorschlag übernehmen"
    >
      ✅ Übernehmen
    </button>
  </div>

  <div style="font-size:0.8rem; opacity:0.8; margin-top:6px;">
    Basis: Strecke von <em>${data.from?.address || "Firma"}</em> zu
    <em>${data.to?.address || "Kundenadresse"}</em>
  </div>
`;


    // fill #travelTime from the API response
    const travelTimeEl = document.getElementById("travelTime");

const hhmm = secondsToHHMM(data.oneWaySeconds ?? null); // or roundTripSeconds if you want total drive time
if (travelTimeEl && hhmm) {
  travelTimeEl.value = hhmm;
  travelTimeEl.dispatchEvent(new Event("input", { bubbles: true }));
  travelTimeEl.dispatchEvent(new Event("change", { bubbles: true }));
}

    // Wire “Übernehmen” button: fill distanceKm and trigger existing preview + pricing
    document
      .getElementById("btnApplyRoutingSuggestion")
      ?.addEventListener("click", () => {
        if (kmInput) {
          kmInput.value = String(oneWayKm.toFixed(1));
          kmInput.dispatchEvent(new Event("input", { bubbles: true }));
          kmInput.dispatchEvent(new Event("change", { bubbles: true }));
        }
      });
  } catch (e) {
    console.warn("[routing] suggestDistanceFromAddress failed:", e);
    out.textContent = "Routenvorschlag fehlgeschlagen (Netzwerkfehler).";
  }
}

// Hook the button + optional auto-refresh
document.addEventListener("DOMContentLoaded", () => {
  document
    .getElementById("btnRoutingSuggest")
    ?.addEventListener("click", suggestDistanceFromAddress);

  // Optional: auto-update hint when address changes (without auto-filling)
  const addrFields = ["street", "city", "postalCode", "state", "country"]
    .map((id) => document.getElementById(id))
    .filter(Boolean);

  let routingTimer = null;
  addrFields.forEach((el) => {
    el.addEventListener("change", () => {
      clearTimeout(routingTimer);
      routingTimer = setTimeout(suggestDistanceFromAddress, 400);
    });
  });
});

document.addEventListener("DOMContentLoaded", () => {
  document
    .getElementById("refreshHassmann")
    ?.addEventListener("click", refreshHassmannFrame);
});
function initOptionalMenus() {
  // Map main category checkboxes -> their panels
  const map = {
        cat_REHA: "menu_REHA",
cat_SHOWER: "menu_SHOWER",
    cat_GRAB: "menu_GRAB",
    cat_FOLD: "menu_FOLD",
    cat_BASIN: "menu_BASIN",
    cat_BASIN_TAP: "menu_BASIN_TAP",
    cat_THERMO: "menu_THERMO",
    cat_SEAT: "menu_SEAT",
    // Add more categories here if needed
    cat_METER: "menu_METER",
    cat_SONDER: "menu_SONDER",
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
    panel
      .querySelectorAll('input[type="checkbox"], input[type="radio"]')
      .forEach((i) => {
        i.checked = false;
      });

    // Zero all numbers, remove required, and hide their *local* wrappers
    panel.querySelectorAll('input[type="number"]').forEach((n) => {
      n.value = "0";
      n.removeAttribute("required");
      const wrap = n.closest('[id$="_wrap"]');
      if (wrap) {
        wrap.hidden = true;
        wrap.setAttribute("aria-hidden", "true");
      }
    });

    // Basin-only: collapse "Erforderliches Zubehör" within this panel and clear saved state
    const reqWrap = panel.querySelector("#basinRequiredWrap");
    if (reqWrap) {
      reqWrap.hidden = true;
      reqWrap.setAttribute("aria-hidden", "true");
    }
    try {
      localStorage.removeItem("basin_required_state");
    } catch {}

    // Keep totals in sync
    window.updatePricing?.();
  }

  // Wire a tile checkbox to its qty-wrapper (show on check, hide & zero on uncheck)
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
    // initial
    apply();
  }

  // ---- category toggles: show/hide, and reset the panel ONLY when turning OFF ----
  Object.entries(map).forEach(([catId, menuId]) => {
    const cat = document.getElementById(catId);
    if (!cat) return;

    function apply() {
      const on = !!cat.checked;
      if (!on) resetPanel(menuId); // clear the content when category is deselected
      showPanel(menuId, on);
    }

    cat.addEventListener("change", apply);
    // initial state (in case some categories are pre-checked)
    apply();
  });

  // ---- SHOWER ----
  wireTileQty("opt_V22WS1R", "qty_V22WS1R_wrap");
  wireTileQty("opt_TEMPDSU250", "qty_TEMPDSU250_wrap");
  wireTileQty("opt_V22BG903R", "qty_V22BG903R_wrap");
  wireTileQty("opt_DEDS2503E", "qty_DEDS2503E_wrap");

  // ---- THERMO ----
  wireTileQty("opt_CLTB", "qty_CLTB_wrap");
  wireTileQty("opt_DEPTB", "qty_DEPTB_wrap");
  wireTileQty("opt_CLB", "qty_CLB_wrap");

  // ---- GRAB ----
  wireTileQty("opt_CLPESG40", "qty_CLPESG40_wrap");
  wireTileQty("opt_CLPESG60", "qty_CLPESG60_wrap");
  wireTileQty("opt_CLPESG80", "qty_CLPESG80_wrap");

  // ---- FOLD ----
  wireTileQty("opt_DEPSKG60", "qty_DEPSKG60_wrap");
  wireTileQty("opt_DEPSKG85", "qty_DEPSKG85_wrap");

  // ---- SEAT ----
  wireTileQty("opt_DEPKS", "qty_DEPKS_wrap");
  wireTileQty("opt_CLPESDH", "qty_CLPESDH_wrap");
  wireTileQty("opt_78090000", "qty_78090000_wrap");

  // ---- BASIN TAP ----
  wireTileQty("opt_CL_BASIN", "qty_CL_BASIN_wrap");
  wireTileQty("opt_DEPOH", "qty_DEPOH_wrap");

  // ---- BASIN (main CL60 tile) ----
  wireTileQty("opt_CL60", "qty_CL60_wrap");
  wireTileQty("opt_CL65", "qty_CL65_wrap");
  wireTileQty("opt_CL55", "qty_CL55_wrap");
  // ---- METER ----
  wireTileQty("opt_TECEADS", "qty_TECEADS_wrap");
  // ---- cat_REHA ----
wireTileQty("opt_24081000", "qty_24081000_wrap");
wireTileQty("opt_24081100", "qty_24081100_wrap");
wireTileQty("opt_24081500", "qty_24081500_wrap");
wireTileQty("opt_24081600", "qty_24081600_wrap");
wireTileQty("opt_24081005", "qty_24081005_wrap");
wireTileQty("opt_24081105", "qty_24081105_wrap");
wireTileQty("opt_24081505", "qty_24081505_wrap");
wireTileQty("opt_24081605", "qty_24081605_wrap");
wireTileQty("opt_25670000", "qty_25670000_wrap");
wireTileQty("opt_24081800", "qty_24081800_wrap");
wireTileQty("opt_24096000", "qty_24096000_wrap");
wireTileQty("opt_24097000", "qty_24097000_wrap");
wireTileQty("opt_24096240", "qty_24096240_wrap");
wireTileQty("opt_19034422", "qty_19034422_wrap");
wireTileQty("opt_35035200", "qty_35035200_wrap");
wireTileQty("opt_35035145", "qty_35035145_wrap");
wireTileQty("opt_35035148", "qty_35035148_wrap");
wireTileQty("opt_35035281", "qty_35035281_wrap");
wireTileQty("opt_35035280", "qty_35035280_wrap");
wireTileQty("opt_78700800", "qty_78700800_wrap");
wireTileQty("opt_78701700", "qty_78701700_wrap");
wireTileQty("opt_78700400", "qty_78700400_wrap");
wireTileQty("opt_78701500", "qty_78701500_wrap");
wireTileQty("opt_78700750", "qty_78700750_wrap");
wireTileQty("opt_78700850", "qty_78700850_wrap");
wireTileQty("opt_11096600", "qty_11096600_wrap");
wireTileQty("opt_11096610", "qty_11096610_wrap");
wireTileQty("opt_11020600", "qty_11020600_wrap");
wireTileQty("opt_11020700", "qty_11020700_wrap");
wireTileQty("opt_11020710", "qty_11020710_wrap");
wireTileQty("opt_11020300", "qty_11020300_wrap");
wireTileQty("opt_14661000", "qty_14661000_wrap");
wireTileQty("opt_14662000", "qty_14662000_wrap");
wireTileQty("opt_26013000", "qty_26013000_wrap");
wireTileQty("opt_26014000", "qty_26014000_wrap");
wireTileQty("opt_26014200", "qty_26014200_wrap");
wireTileQty("opt_091095504", "qty_091095504_wrap");
wireTileQty("opt_10440000", "qty_10440000_wrap");


  // Show/hide "Erforderliches Zubehör" when CL60 is toggled (no cross-panel effects)
  (function wireBasinRequired() {
    const wt = document.getElementById("opt_CL60");
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
        try {
          localStorage.removeItem("basin_required_state");
        } catch {}
        window.updatePricing?.();
      }
    };

    wt.addEventListener("change", apply);
    apply();

    // Accessory tiles inside required block
    wireTileQty("opt_WTBF", "qty_WTBF_wrap");
    wireTileQty("opt_RSL", "qty_RSL_wrap");
    wireTileQty("opt_EV", "qty_EV_wrap");
  })();

  // ---- Independent “Zubehör zum Waschtisch” (loose accessories) ----
  wireTileQty("opt_WTBF__loose", "qty_WTBF__loose_wrap");
  wireTileQty("opt_RSL__loose", "qty_RSL__loose_wrap");
  wireTileQty("opt_EV__loose", "qty_EV__loose_wrap");

  // ---- BWT · Badewannentür ----
  // Door + Haltegriffe behave like other tile+qty pairs:
  //  - unchecked  → qty=0, wrapper hidden
  //  - checked    → qty>=1, wrapper visible
  //  - resetAllForms() re-applies this logic via dispatching "change" events
  wireTileQty("bwtDoorStd", "bwtDoorStdQtyWrap");
  wireTileQty("bwtDoorBudget", "bwtDoorBudgetQtyWrap");
  wireTileQty("bwtDoorIndWienGlas", "bwtDoorIndWienGlasQtyWrap");
  wireTileQty("bwtDoorVariodoor", "bwtDoorVariodoorQtyWrap");
  wireTileQty("bwtDoorIndWien", "bwtDoorIndWienQtyWrap");
  wireTileQty("bwtAidsHaltegriff40", "bwtAidsHaltegriff40QtyWrap");
  wireTileQty("bwtAidsHaltegriff60", "bwtAidsHaltegriff60QtyWrap");
  wireTileQty("bwtAidsHaltegriff80", "bwtAidsHaltegriff80QtyWrap");

  // Keep your existing rule engine for CL60 & accessories (1 / 1 / 2 and persistence)
  if (typeof initBasinAutoAccessories === "function") {
    initBasinAutoAccessories();
  }
}

// === Optional: Mutual exclusivity for Duscharmatur & Thermostat ===
(function initOptionalExclusiveGroups() {
  const form = document.getElementById("form-optional");
  if (!form) return;

  // Map for BWT door → qty wrapper
  const bwtDoorQtyWrapIds = {
    bwtDoorStd: "bwtDoorStdQtyWrap",
    bwtDoorBudget: "bwtDoorBudgetQtyWrap",
    bwtDoorIndWienGlas: "bwtDoorIndWienGlasQtyWrap",
    bwtDoorVariodoor: "bwtDoorVariodoorQtyWrap",
    bwtDoorIndWien: "bwtDoorIndWienQtyWrap",
  };

  // Define exclusive groups: only one can be selected at a time
  const exclusiveGroups = [
    {
      name: "Duscharmatur",
      members: [
        "opt_V22WS1R", // Wannenset individual 2.2
        "opt_TEMPDSU250", // Duschsystem Tempesta Flex
        "opt_V22BG903R", // Brausegarnitur individ.2.2
        "opt_DEDS2503E", // Duschsystem derby Thermostat
      ],
    },
    {
      name: "AP-Thermostat / Brausebatterie",
      members: [
        "opt_CLTB", // AP-Brause-Thermostat clivia
        "opt_DEPTB", // AP-Brause-Thermostat derby plus
        "opt_CLB", // Einhand-Aufputz-Brausebatterie clivia
      ],
    },
    {
      // BWT: Tür-Typ – only one door model allowed
      name: "BWT Tür-Typ",
      members: [
        "bwtDoorStd",
        "bwtDoorBudget",
        "bwtDoorIndWienGlas",
        "bwtDoorVariodoor",
        "bwtDoorIndWien",
      ],
    },
  ];

  function setDisabled(elId, disabled) {
    const cb = document.getElementById(elId);
    if (!cb) return;

    const pill =
      cb.closest("label.radio-pill") || cb.closest("label.image-check");
    if (!pill) return;

    cb.disabled = disabled;
    pill.style.opacity = disabled ? "0.6" : "";
    pill.style.pointerEvents = disabled ? "none" : "";
    pill.style.filter = disabled ? "grayscale(0.3)" : "";
    pill.setAttribute("aria-disabled", disabled ? "true" : "false");
  }

  function enforceGroupExclusivity(group) {
    const members = group.members
      .map((id) => document.getElementById(id))
      .filter(Boolean);
    if (!members.length) return;

    const checked = members.find((cb) => cb.checked);

    members.forEach((cb) => {
      const shouldDisable = checked && cb !== checked;
      setDisabled(cb.id, shouldDisable);
    });
  }

  function applyAllGroups() {
    exclusiveGroups.forEach((group) => enforceGroupExclusivity(group));
  }

  // Wire change listeners for all members
  exclusiveGroups.forEach((group) => {
    group.members.forEach((id) => {
      const cb = document.getElementById(id);
      if (!cb) return;

      cb.addEventListener("change", () => {
        if (cb.checked) {
          // When this one is checked, uncheck others in the same group
          group.members.forEach((otherId) => {
            if (otherId === id) return;
            const other = document.getElementById(otherId);
            if (other && other.checked) {
              other.checked = false;

              // Clear its quantity if it has one
              let qtyWrap = document.getElementById(`qty_${otherId}_wrap`);

              // Special case: BWT doors use different wrapper ids
              if (!qtyWrap && bwtDoorQtyWrapIds[otherId]) {
                qtyWrap = document.getElementById(bwtDoorQtyWrapIds[otherId]);
              }

              if (qtyWrap) {
                const qtyInput = qtyWrap.querySelector('input[type="number"]');
                if (qtyInput) {
                  qtyInput.value = "0";
                  qtyInput.removeAttribute("required");
                }
                qtyWrap.hidden = true;
                qtyWrap.setAttribute("aria-hidden", "true");
              }
            }
          });
        }

        applyAllGroups();

        // Keep pricing in sync
        if (typeof window.updatePricing === "function") {
          window.updatePricing();
        }
      });
    });
  });

  // Initial state
  applyAllGroups();

  // Re-apply when Optional page becomes visible
  window.addEventListener("hashchange", () => {
    if (
      typeof getCurrentStep === "function" &&
      getCurrentStep() === "optional"
    ) {
      applyAllGroups();
    }
  });
})();

function initTECEADSPairsLabel() {
  const qty = document.getElementById("qty_TECEADS");
  const lbl = document.querySelector('label[for="qty_TECEADS"]');
  if (!qty || !lbl) return;

  const base = (lbl.dataset.baseLabel ||= lbl.textContent.replace(
    /\s*\(.*\)\s*$/,
    "",
  ));

  const paint = () => {
    const raw = String(qty.value || "")
      .replace(/\./g, "")
      .replace(",", ".");
    const n = Number(raw);
    const items = Number.isFinite(n) && n > 0 ? n : 0; // input = items

    lbl.textContent = `${base} (${items} paare)`;
  };

  ["input", "change", "blur"].forEach((ev) => qty.addEventListener(ev, paint));
  paint(); // initial
}

document.addEventListener("DOMContentLoaded", initTECEADSPairsLabel);

function initLivePricingSync() {
  // WATCH EVERYTHING (best: your main form; fallback: document.body)
  const watchRoot = document.body;

  let t = null;
  const debounce = (fn, ms = 250) => {
    clearTimeout(t);
    t = setTimeout(fn, ms);
  };

  async function repriceNow() {
    await window.updatePricing?.();
  }

  // Single delegated listener covers ALL inputs/checkboxes/selects in the app
  const handler = () => {
    if (window.__restoring) return; // ← don’t spam while restoring
    debounce(repriceNow, 180);
  };
  watchRoot.addEventListener("input", handler, true);
  watchRoot.addEventListener("change", handler, true);

  // Also watch hidden fields that we set programmatically
  ["chosenTrayProductId", "traySize"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("input", handler);
      el.addEventListener("change", handler);
    }
  });

  // Initial run
  repriceNow();
}
// #endregion

// =================================================================
// #region 12. ADMIN & INTEGRATIONS
// =================================================================
/* ========== ADMIN: Produkte & Leistungen ========== */
(function initAdminProducts() {
  const page = document.getElementById("page-admin");
  if (!page) return;

  const form = document.getElementById("form-admin-product");
  const status = document.getElementById("ap_status");
  const tblBody = document.getElementById("ap_tableBody");
  const search = document.getElementById("ap_search");

  const idEl = document.getElementById("ap_productId");
  const nameEl = document.getElementById("ap_name");
  const priceEl = document.getElementById("ap_price");
  const wEl = document.getElementById("ap_width");
  const lEl = document.getElementById("ap_length");
  const hEl = document.getElementById("ap_height");
  const sourceEl = document.getElementById("ap_source");
  const resetBtn = document.getElementById("ap_reset");

  if (!form || !status || !tblBody || !idEl || !nameEl || !priceEl) return;

  const euroFmt = (n) =>
    (Number(n) || 0).toLocaleString("de-DE", {
      style: "currency",
      currency: "EUR",
    });

  function setStatus(msg, ok = true) {
    status.className = "status " + (ok ? "ok" : "err");
    status.textContent = msg;
  }

  function clearForm() {
    form.reset();
    setStatus("Bereit.", true);
  }

  resetBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    clearForm();
  });

  // ---- Laden und anzeigen ----
  async function loadProducts(q = "") {
    try {
      setStatus("Lade Produkte …", true);
      const url = q
        ? `/api/products?q=${encodeURIComponent(q)}`
        : "/api/products";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const list = await res.json();

      if (!Array.isArray(list) || !list.length) {
        tblBody.innerHTML = `<tr><td colspan="5" style="padding:4px;">Keine Produkte gefunden.</td></tr>`;
        setStatus("Keine Produkte gefunden.", true);
        return;
      }

      tblBody.innerHTML = list
        .map((p) => {
          const dim = [
            p.widthCm != null ? p.widthCm : "",
            p.lengthCm != null ? p.lengthCm : "",
            p.heightCm != null ? p.heightCm : "",
          ]
            .filter((v) => v !== "")
            .join(" / ");

          const priceStr = euroFmt(p.price ?? 0);
          const sourceStr = (p.source || "").toString();
          return `
          <tr data-id="${p.productId}">
            <td style="padding:4px;">${p.productId}</td>
            <td style="padding:4px;">${p.name || ""}</td>
            <td style="padding:4px; text-align:right;">${priceStr}</td>
            <td style="padding:4px; text-align:center;">${dim}</td>
                  <td style="padding:4px;">${sourceStr}</td>
            <td style="padding:4px; text-align:right;">
              <button type="button" class="secondary ap-edit-btn">Bearbeiten</button>
            </td>
          </tr>
        `;
        })
        .join("");

      setStatus(`${list.length} Produkt(e) geladen.`, true);
    } catch (err) {
      console.error(err);
      tblBody.innerHTML = `<tr><td colspan="5" style="padding:4px;">Fehler beim Laden.</td></tr>`;
      setStatus(`Fehler beim Laden: ${err.message}`, false);
    }
  }

  // Initiales Laden
  loadProducts();

  // Suche
  let searchTimer = null;
  search?.addEventListener("input", () => {
    const q = search.value.trim();
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => loadProducts(q), 250);
  });

  // Klick auf "Bearbeiten" → Formular mit Zeile füllen
  tblBody.addEventListener("click", (e) => {
    const btn = e.target.closest(".ap-edit-btn");
    if (!btn) return;
    const tr = btn.closest("tr[data-id]");
    if (!tr) return;

    const pid = tr.getAttribute("data-id") || "";
    const tds = tr.querySelectorAll("td");
    const name = tds[1]?.textContent?.trim() || "";
    const priceStr = tds[2]?.textContent?.trim() || "";
    const dimsStr = tds[3]?.textContent?.trim() || "";
    const srcStr = tds[4]?.textContent?.trim() || ""; // NEW (column 4)

    idEl.value = pid;
    nameEl.value = name;

    // Preis zurück in Eingabeformat bringen (z.B. "1.234,56 €" → "1234,56")
    const pClean = priceStr.replace(/[^\d.,-]/g, "");
    priceEl.value = pClean;

    // grobe Dims-Parsing "B / L / H"
    const parts = dimsStr
      .split("/")
      .map((s) => s.trim())
      .filter(Boolean);
    wEl.value = parts[0] || "";
    lEl.value = parts[1] || "";
    hEl.value = parts[2] || "";

    if (sourceEl) sourceEl.value = srcStr; // preload

    setStatus(`Produkt ${pid} im Formular geladen.`, true);
    idEl.focus();
  });

  // ---- Speichern via /api/products/bulk ----
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const productId = idEl.value.trim();
    const name = nameEl.value.trim();
    const priceRaw = priceEl.value.trim();
    const source = sourceEl?.value.trim() || "";

    if (!productId || !name || !priceRaw) {
      setStatus(
        "Bitte mindestens Produkt-ID, Name und Preis ausfüllen.",
        false,
      );
      return;
    }

    // tolerant EUR parser wiederverwenden
    const priceNum =
      typeof window.parseMoneyEuro === "function"
        ? window.parseMoneyEuro(priceRaw)
        : Number(priceRaw.replace(",", "."));

    if (!(priceNum > 0)) {
      setStatus("Preis ist ungültig oder 0.", false);
      return;
    }

    const widthCm = wEl.value ? Number(wEl.value) : undefined;
    const lengthCm = lEl.value ? Number(lEl.value) : undefined;
    const heightCm = hEl.value ? Number(hEl.value) : undefined;

    const body = [
      {
        productId,
        name,
        price: priceNum,
        ...(widthCm != null && !isNaN(widthCm) ? { widthCm } : {}),
        ...(lengthCm != null && !isNaN(lengthCm) ? { lengthCm } : {}),
        ...(heightCm != null && !isNaN(heightCm) ? { heightCm } : {}),
        ...(source ? { source } : {}),
      },
    ];

    try {
      setStatus("Speichere Produkt …", true);
      const res = await fetch("/api/products/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      setStatus(`Produkt ${productId} gespeichert.`, true);
      if (window.toast?.success) {
        toast.success(
          "Gespeichert",
          `Produkt <b>${productId}</b> wurde gespeichert.`,
        );
      }

      await loadProducts(search?.value.trim() || "");
    } catch (err) {
      console.error(err);
      setStatus(`Fehler beim Speichern: ${err.message}`, false);
      if (window.toast?.error) {
        toast.error("Fehler", err.message);
      }
    }
  });

  // Auto-Neuladen, wenn Admin-Seite aufgerufen wird
  window.addEventListener("hashchange", () => {
    if (typeof getCurrentStep === "function" && getCurrentStep() === "admin") {
      loadProducts(search?.value.trim() || "");
    }
  });
})();

/* ========== ADMIN: Services ========== */
(function initAdminServices() {
  const page = document.getElementById("page-services");
  if (!page) return;

  const form = document.getElementById("form-as");
  const status = document.getElementById("as_status");
  const tblBody = document.getElementById("as_tableBody");
  const search = document.getElementById("as_search");

  const idEl = document.getElementById("as_serviceId");
  const nameEl = document.getElementById("as_name");
  const internalEl = document.getElementById("as_internal_name");
  const descEl = document.getElementById("as_description");
  const priceEl = document.getElementById("as_price");
  const timeEl = document.getElementById("as_time");
  const sourceEl = document.getElementById("as_source");
  const resetBtn = document.getElementById("as_reset");

  if (!form || !status || !tblBody || !idEl || !nameEl || !priceEl || !timeEl)
    return;

  const euroFmt = (n) =>
    (Number(n) || 0).toLocaleString("de-DE", {
      style: "currency",
      currency: "EUR",
    });

  function setStatus(msg, ok = true) {
    status.className = "status " + (ok ? "ok" : "err");
    status.textContent = msg;
  }

  function clearForm() {
    form.reset();
    setStatus("Bereit.", true);
  }

  resetBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    clearForm();
  });

  // ---- Laden und anzeigen ----
  async function loadServices(q = "") {
    try {
      setStatus("Lade Services …", true);
      const url = q
        ? `/api/services?q=${encodeURIComponent(q)}`
        : "/api/services";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const list = await res.json();

      if (!Array.isArray(list) || !list.length) {
        tblBody.innerHTML = `<tr><td colspan="8" style="padding:4px;">Keine Services gefunden.</td></tr>`;
        setStatus("Keine Services gefunden.", true);
        return;
      }

      tblBody.innerHTML = list
        .map((s) => {
          const priceStr = euroFmt(s.price ?? 0);
          const timeStr = (s.time ?? 0).toString();
          const sourceStr = (s.source || "").toString();

          const desc = (s.description || "").toString();
          const descShort = desc.length > 80 ? desc.slice(0, 77) + "…" : desc;
          const descEsc = desc.replace(/"/g, "&quot;");

          return `
            <tr data-id="${s.serviceId}">
              <td style="padding:4px;">${s.serviceId}</td>
              <td style="padding:4px;">${s.name || ""}</td>
              <td style="padding:4px;">${s.internal_name || ""}</td>
              <td style="padding:4px;" title="${descEsc}">${descShort}</td>
              <td style="padding:4px; text-align:right;">${priceStr}</td>
              <td style="padding:4px; text-align:right;">${timeStr}</td>
              <td style="padding:4px;">${sourceStr}</td>
              <td style="padding:4px; text-align:right;">
                <button type="button" class="secondary as-edit-btn">Bearbeiten</button>
              </td>
            </tr>
          `;
        })
        .join("");

      setStatus(`${list.length} Service(s) geladen.`, true);
    } catch (err) {
      console.error(err);
      tblBody.innerHTML = `<tr><td colspan="8" style="padding:4px;">Fehler beim Laden.</td></tr>`;
      setStatus(`Fehler beim Laden: ${err.message}`, false);
    }
  }

  // Initiales Laden
  loadServices();

  // Suche
  let searchTimer = null;
  search?.addEventListener("input", () => {
    const q = search.value.trim();
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => loadServices(q), 250);
  });

  // Klick auf "Bearbeiten" → Formular mit Zeile füllen
  tblBody.addEventListener("click", (e) => {
    const btn = e.target.closest(".as-edit-btn");
    if (!btn) return;
    const tr = btn.closest("tr[data-id]");
    if (!tr) return;

    const sid = tr.getAttribute("data-id") || "";
    const tds = tr.querySelectorAll("td");

    const name = tds[1]?.textContent?.trim() || "";
    const internal = tds[2]?.textContent?.trim() || "";
    const desc =
      tds[3]?.getAttribute("title") || tds[3]?.textContent?.trim() || "";
    const priceStr = tds[4]?.textContent?.trim() || "";
    const timeStr = tds[5]?.textContent?.trim() || "";
    const srcStr = tds[6]?.textContent?.trim() || "";

    idEl.value = sid;
    nameEl.value = name;
    internalEl.value = internal;
    descEl.value = desc;

    // Preis zurück in Eingabeformat (z.B. "1.234,56 €" → "1234,56")
    const pClean = priceStr.replace(/[^\d.,-]/g, "");
    priceEl.value = pClean;

    // Zeit: nur Ziffern
    const tClean = timeStr.replace(/[^\d]/g, "");
    timeEl.value = tClean;

    if (sourceEl) sourceEl.value = srcStr;

    setStatus(`Service ${sid} im Formular geladen.`, true);
    idEl.focus();
  });

  // ---- Speichern via /api/services/bulk ----
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const serviceId = idEl.value.trim();
    const name = nameEl.value.trim();
    const internalName = internalEl?.value.trim() || "";
    const description = descEl?.value.trim() || "";
    const priceRaw = priceEl.value.trim();
    const timeRaw = timeEl.value.trim();
    const source = sourceEl?.value.trim() || "";

    if (!serviceId || !name || !priceRaw || !timeRaw) {
      setStatus(
        "Bitte mindestens Service-ID, Name, Preis und Zeit (Minuten) ausfüllen.",
        false,
      );
      return;
    }

    const priceNum =
      typeof window.parseMoneyEuro === "function"
        ? window.parseMoneyEuro(priceRaw)
        : Number(priceRaw.replace(",", "."));

    if (!(priceNum >= 0)) {
      setStatus("Preis ist ungültig.", false);
      return;
    }

    const timeNum = Number(timeRaw);
    if (!(timeNum >= 0)) {
      setStatus("Zeit ist ungültig.", false);
      return;
    }

    const body = [
      {
        serviceId,
        name,
        price: priceNum,
        time: timeNum,
        ...(internalName ? { internal_name: internalName } : {}),
        ...(description ? { description } : {}),
        ...(source ? { source } : {}),
      },
    ];

    try {
      setStatus("Speichere Service …", true);
      const res = await fetch("/api/services/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      setStatus(`Service ${serviceId} gespeichert.`, true);
      if (window.toast?.success) {
        toast.success(
          "Gespeichert",
          `Service <b>${serviceId}</b> wurde gespeichert.`,
        );
      }

      await loadServices(search?.value.trim() || "");
    } catch (err) {
      console.error(err);
      setStatus(`Fehler beim Speichern: ${err.message}`, false);
      if (window.toast?.error) {
        toast.error("Fehler", err.message);
      }
    }
  });

  // Auto-Neuladen, wenn Admin-Seite aufgerufen wird
  window.addEventListener("hashchange", () => {
    if (typeof getCurrentStep === "function" && getCurrentStep() === "admin") {
      loadServices(search?.value.trim() || "");
    }
  });
})();
// #endregion

// Alltagshilfe: abhängige Leistungsart + ausgegraute, nicht verfügbare Option
(function initAlltagshilfePage() {
  const form = document.getElementById("form-ah");
  if (!form) return;

  const artAlltag = document.getElementById("ahArtAlltagsbegleitung");
  const artHaushalt = document.getElementById("ahArtHaushalt");

  const wrap = document.getElementById("ahLeistungsTypWrap");
  const blockAlltag = document.getElementById(
    "ahLeistungsTypAlltagsbegleitung",
  );
  const blockHaushalt = document.getElementById("ahLeistungsTypHaushalt");

  const inputFahrten = document.getElementById("ahLeistungsTypFahrten");
  const inputPausch = document.getElementById(
    "ahLeistungsTypReinigungsPauschale",
  );

  // Labels separat greifen, damit wir sie „grau“ stylen können
  const labelFahrten = inputFahrten?.closest("label.radio-pill");
  const labelPausch = inputPausch?.closest("label.radio-pill");

  if (!wrap || !blockAlltag || !blockHaushalt || !inputFahrten || !inputPausch)
    return;

  function show(el, on) {
    if (!el) return;
    el.hidden = !on;
    el.setAttribute("aria-hidden", on ? "false" : "true");
  }

  // exakt derselbe „Grau‑Look“ wie beim Aufschlag:
  // disabled + geringere Opacity + keine Klicks
  function setDisabled(labelEl, inputEl, disabled) {
    if (!labelEl || !inputEl) return;
    inputEl.disabled = disabled;
    labelEl.setAttribute("aria-disabled", disabled ? "true" : "false");
    labelEl.style.opacity = disabled ? "0.45" : "";
    labelEl.style.pointerEvents = disabled ? "none" : "";
    labelEl.style.filter = disabled ? "grayscale(0.3)" : "";
  }

  function applySelection(kind) {
    // Block sichtbar, sobald eine Haupt‑Art gewählt wurde
    show(wrap, true);

    // Beide Detail‑Zeilen sollen immer sichtbar bleiben
    show(blockAlltag, true);
    show(blockHaushalt, true);

    if (kind === "Alltagsbegleitung") {
      // Fahrten aktiv, Pauschale grau/disabled
      setDisabled(labelFahrten, inputFahrten, false);
      setDisabled(labelPausch, inputPausch, true);

      // Fahrten vorwählen
      inputFahrten.checked = true;
      inputPausch.checked = false;
      inputFahrten.dispatchEvent(new Event("change", { bubbles: true }));
    } else if (kind === "Haushaltsnahedienstleistungen") {
      // Pauschale aktiv, Fahrten grau/disabled
      setDisabled(labelFahrten, inputFahrten, true);
      setDisabled(labelPausch, inputPausch, false);

      inputPausch.checked = true;
      inputFahrten.checked = false;
      inputPausch.dispatchEvent(new Event("change", { bubbles: true }));
    } else {
      // Nichts gewählt → alles zurücksetzen und ausblenden
      show(wrap, false);
      show(blockAlltag, false);
      show(blockHaushalt, false);

      setDisabled(labelFahrten, inputFahrten, false);
      setDisabled(labelPausch, inputPausch, false);
      inputFahrten.checked = false;
      inputPausch.checked = false;
    }
  }

  // Listener für die zwei Haupt‑Radiobuttons
  artAlltag?.addEventListener("change", () => {
    if (artAlltag.checked) applySelection("Alltagsbegleitung");
  });
  artHaushalt?.addEventListener("change", () => {
    if (artHaushalt.checked) applySelection("Haushaltsnahedienstleistungen");
  });

  // Initialzustand beim Laden (z.B. beim Bearbeiten eines Entwurfs)
  const current = form.querySelector('input[name="ahArt"]:checked');
  if (current) {
    applySelection(current.value);
  } else {
    show(wrap, false);
    show(blockAlltag, false);
    show(blockHaushalt, false);
  }
})();

// =================================================================
// #region 13. GLOBAL EVENT LISTENERS (The Footer)
// =================================================================

document.addEventListener("DOMContentLoaded", () => {
  // If you have explicit nav buttons/tabs:
  const btnRabatt = document.getElementById("nav-rabatt");
  const btnDebug = document.getElementById("nav-debug");
  if (btnRabatt) btnRabatt.addEventListener("click", refreshAllPanels);
  if (btnDebug) btnDebug.addEventListener("click", refreshAllPanels);

  initSmartTraySearch();
  initTraySizeAutoLabel();
  initOptionalMenus && initOptionalMenus();
  initBasinAutoAccessories && initBasinAutoAccessories();
  wireDAQtyAutoFill();
  initOptionalSonderprodukte();

  initLivePricingSync();
  window.addEventListener("hashchange", () => {
    const id = location.hash.replace("#", "");
    if (id === "rabatt" || id === "kosten") refreshAllPanels();
  });

  // Kundennummer nur bei Bestandskunde anzeigen
  document.querySelectorAll('input[name="customerType"]').forEach((r) => {
    r.addEventListener("change", updateCustomerNumberVisibility);
  });
  updateCustomerNumberVisibility();
  // Live update of "Kunde:" in the top-right widget
  const fn = document.getElementById("firstName");
  const ln = document.getElementById("lastName");
  fn && fn.addEventListener("input", updateSummaryWidgetName);
  ln && ln.addEventListener("input", updateSummaryWidgetName);
  updateSummaryWidgetName();

  // Widget: Eigenanteil nur, wenn eine Budget-Option gesetzt ist
  document
    .querySelectorAll('input[name="budgetMax"], input[name="twoPersons"]')
    .forEach((el) => {
      el.addEventListener("change", updateSummaryWidgetSubsidyVisibility);
    });
  updateSummaryWidgetSubsidyVisibility();
  // --- Draft save button under widget ---
  const btnSaveDraft = document.getElementById("btnSaveDraft");
  if (btnSaveDraft) {
    btnSaveDraft.addEventListener("click", () => {
      saveCurrentDraft();
    });
  }

  // --- Draft search / load on Kundendaten ---
  (function initDraftSearchUI() {
    const input = document.getElementById("draftSearchInput");
    const results = document.getElementById("draftSearchResults");
    const btnLoad = document.getElementById("btnLoadSelectedDraft");
    if (!input || !results || !btnLoad) return;

    let lastResults = [];
    let selectedId = null;
    let debounceTimer = null;

    function debounce(fn, ms) {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(fn, ms);
    }

    input.addEventListener("input", () => {
      const q = input.value.trim();
      selectedId = null;
      if (!q) {
        results.style.display = "none";
        results.innerHTML = "";
        return;
      }
      debounce(() => searchDraftsForCurrentOfferType(q), 200);
    });

    results.addEventListener("click", (ev) => {
      const btn = ev.target.closest("button.draft-result-row");
      if (!btn) return;
      selectedId = btn.dataset.id;

      // highlight selection
      Array.from(results.querySelectorAll("button.draft-result-row")).forEach(
        (b) => {
          b.style.background = b === btn ? "#e0e7ff" : "transparent";
        },
      );

      // auto-load on click
      loadDraftById(selectedId);

      // optionally: update the input and hide the list
      input.value = btn.textContent.trim();
      results.style.display = "none";
    });

    btnLoad.addEventListener("click", () => {
      if (!selectedId) {
        alert("Bitte wählen Sie zuerst einen Entwurf aus der Liste.");
        return;
      }
      loadDraftById(selectedId);
    });
  })();
});

const bitrixIdInput = document.getElementById("bitrixContactId");
const loadBitrixBtn = document.getElementById("loadBitrixContactBtn");

if (bitrixIdInput && loadBitrixBtn) {
  const loadBitrixContact = async () => {
    const id = bitrixIdInput.value.trim();
    if (!id) {
      showCustomerMessage("Bitte eine Bitrix Kontakt ID eingeben", "error");
      return;
    }

    try {
      loadBitrixBtn.disabled = true;
      loadBitrixBtn.textContent = "Laden...";

      const res = await fetch(`/api/bitrix/contact/${encodeURIComponent(id)}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Fehler beim Laden aus Bitrix");
      }

      const data = await res.json();
      console.log("[Bitrix frontend] raw data from backend:", data);

      // n8n‑Antwort hat Form: { result: { ID, NAME, LAST_NAME, PHONE, EMAIL, ... }, time: {...} }
      const contact = data.result;
      if (!contact || !contact.ID) {
        throw new Error("Kontakt nicht gefunden");
      }

      // Bitrix → Formular-Mapping
      const phone =
        Array.isArray(contact.PHONE) && contact.PHONE[0]
          ? contact.PHONE[0].VALUE
          : "";
      const email =
        Array.isArray(contact.EMAIL) && contact.EMAIL[0]
          ? contact.EMAIL[0].VALUE
          : "";

      const mapped = {
        // falls du schon eine Kundennummer im Formular hast, nicht überschreiben
        customerNumber:
          document.getElementById("customerNumber")?.value || contact.ID,
        firstName: contact.NAME || "",
        lastName: contact.LAST_NAME || "",
        company: contact.COMPANY_TITLE || "",
        email,
        phone,
        street: contact.ADDRESS || "",
        city: contact.ADDRESS_CITY || "",
        postalCode: contact.ADDRESS_POSTAL_CODE || "",
        state: contact.ADDRESS_REGION || contact.ADDRESS_PROVINCE || "",
        country: contact.ADDRESS_COUNTRY || "",
      };

      fillCustomerForm(mapped);

      // 🔹 update the top-left summary widget (Kunde: ...)
      if (typeof updateSummaryWidgetName === "function") {
        updateSummaryWidgetName();
      }

      // (optional) if you want total / selfPay to refresh too:
      if (typeof window.updatePricing === "function") {
        window.updatePricing();
      }

      showCustomerMessage("Kontakt aus Bitrix übernommen", "success");
    } catch (e) {
      console.error(e);
      showCustomerMessage(
        e.message || "Fehler beim Laden des Bitrix Kontakts",
        "error",
      );
    } finally {
      loadBitrixBtn.disabled = false;
      loadBitrixBtn.textContent = "Aus Bitrix laden";
    }
  };

  loadBitrixBtn.addEventListener("click", loadBitrixContact);

  // Enter im ID-Feld löst ebenfalls das Laden aus
  bitrixIdInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      loadBitrixContact();
    }
  });
}

function initHassmannBestFinder() {
  console.log("[HF] initHassmannBestFinder called"); // <--
  const form = document.getElementById("hassmannFinderForm");
  const btn = document.getElementById("hf_searchBtn");
  const statusEl = document.getElementById("hf_status");
  const resultsEl = document.getElementById("hf_results");

  console.log("[HF] elements", {
    form: !!form,
    btn: !!btn,
    statusEl: !!statusEl,
    resultsEl: !!resultsEl,
  });

  if (!form || !btn || !statusEl || !resultsEl) return;

  const euroC = (n) =>
    new Intl.NumberFormat("de-DE", {
      style: "currency",
      currency: "EUR",
    }).format(Number(n || 0));

  function setStatus(msg, ok = true) {
    statusEl.className = "status " + (ok ? "ok" : "err");
    statusEl.textContent = msg;
  }

  function buildPayloadFromForm() {
    const width = Number(form.hf_width.value || 0);
    const depth = Number(form.hf_depth.value || 0);
    const minP = Number(form.hf_minPrice.value || 0);
    const maxP = Number(form.hf_maxPrice.value || 0);
    const shortS = !!form.hf_shortSide.checked;
    const orient = form.hf_orientation.value || null;

    const openings = Array.from(
      form.querySelectorAll('input[name="hf_opening"]:checked'),
    ).map((el) => el.value);

    const payload = {
      width,
      depth,
      priceRange: {
        min: minP || 0,
        max: maxP || 0,
      },
      openingTypes: openings.length ? openings : undefined,
      isShortSidewall: shortS,
    };

    if (orient) payload.orientation = orient;

    return payload;
  }

  function getKind() {
    const r = form.querySelector('input[name="hf_showerType"]:checked');
    return r ? r.value : "corner";
  }

  function renderResults(list) {
    if (!Array.isArray(list) || !list.length) {
      resultsEl.innerHTML =
        '<div class="muted">Keine passenden Produkte gefunden.</div>';
      return;
    }

    const MEDIA_PREFIX = "https://media.onlineplus.store/";
    const fmt = (v) => (v != null ? euroC(v) : "n/a");

    const html = list
      .map((combo, index) => {
        const main = combo.best || combo;
        const side = combo.sidePanel || combo.tuer2 || null;
        const tray = combo.tray || null;

        const title = main.name || `Produkt ${index + 1}`;
        const pid = main.modelNumber || main.id || "-";

        const totalNet = combo.totalPriceNet ?? null;

        const bestPrice = main.priceGross ?? main.priceNet ?? null;
        const sidePrice = side?.priceGross ?? side?.priceNet ?? null;
        const trayPrice = tray?.priceGross ?? tray?.priceNet ?? null;

        const sideName = side?.name || null;
        const trayName = tray?.name || null;

        // --- MAIN IMAGE (best) ---
        const mainImg = pickImage(main, 2);

        // --- small strip for side (aus den Produktdaten) ---
        const sideImg = pickImage(side, 1);

        // --- WANNENBILD: IMMER LOKALES ASSET ---
        const trayImg = `
        <img src="/assets/duschwanne.jpeg"
             alt="Duschwanne"
             loading="lazy"
             style="width:100%;height:auto;border-radius:4px;object-fit:cover;border:1px solid #e0e0e0;margin-bottom:4px;" />
      `;

        return `
        <div class="card" style="margin-bottom:8px; padding:10px 12px;">
          <div style="display:flex; gap:12px; align-items:flex-start; flex-wrap:wrap;">

            ${
              mainImg
                ? `
              <div style="flex:0 0 140px; max-width:140px;">
                ${mainImg}
              </div>`
                : ""
            }

            <div style="flex:1 1 220px; min-width:220px;">
              <div style="font-weight:600; margin-bottom:2px;">${escapeHtml(
                title,
              )}</div>
              <div style="font-size:0.9rem; color:var(--muted-foreground);">
                ID / Modell: <code>${escapeHtml(pid)}</code>
              </div>

              <div style="margin-top:6px;">
                Gesamtpreis (netto): <strong>${fmt(totalNet)}</strong>
              </div>

              <div style="margin-top:6px; font-size:0.9rem;">
                <div><strong>Tür 1:</strong> ${escapeHtml(
                  title,
                )} – Preis (brutto): <strong>${fmt(bestPrice)}</strong></div>

                ${
                  sideName
                    ? `<div><strong>Seitenwand / Tür 2:</strong> ${escapeHtml(
                        sideName,
                      )} – Preis (brutto): <strong>${fmt(
                        sidePrice,
                      )}</strong></div>`
                    : ""
                }

                ${
                  trayName
                    ? `<div><strong>Duschwanne:</strong> ${escapeHtml(
                        trayName,
                      )} – Preis (brutto): <strong>${fmt(
                        trayPrice,
                      )}</strong></div>`
                    : ""
                }
              </div>

              ${
                combo.widthRangeMessage
                  ? `<div style="margin-top:6px;font-size:0.8rem;color:#b26a00;background:#fff5e6;border:1px solid #ffcc80;border-radius:4px;padding:4px 6px;">
                       ${escapeHtml(combo.widthRangeMessage)}
                     </div>`
                  : ""
              }

              <div style="margin-top:8px; display:flex; gap:12px; flex-wrap:wrap;">
                ${
                  sideImg
                    ? `<div style="flex:0 0 90px; max-width:90px;">
                         <div style="font-size:0.75rem;margin-bottom:2px;">Seite</div>
                         ${sideImg}
                       </div>`
                    : ""
                }

                <!-- Wanne: IMMER anzeigen -->
                <div style="flex:0 0 90px; max-width:90px;">
                  <div style="font-size:0.75rem;margin-bottom:2px;">Wanne</div>
                  ${trayImg}
                </div>
              </div>

            </div>
          </div>
        </div>
      `;

        // ---- helpers ----
    
        function pickImage(product, maxCount) {
          if (!product) return "";

          const links = Array.isArray(product.productLinks)
            ? product.productLinks
            : [];

          const imgs = links.slice(0, maxCount).map((pl) => {
            const url = normalizeMediaUrl(pl.link);
            if (!url) return "";
            return `<img src="${url}"
                       alt="${escapeHtml(product.name || "")}"
                       loading="lazy"
                       style="width:100%;height:auto;border-radius:4px;object-fit:cover;border:1px solid #e0e0e0;margin-bottom:4px;" />`;
          });

          if (!imgs.length && product.productLink) {
            const url = normalizeMediaUrl(product.productLink);
            imgs.push(
              `<img src="${url}"
                  alt="${escapeHtml(product.name || "")}"
                  loading="lazy"
                  style="width:100%;height:auto;border-radius:4px;object-fit:cover;border:1px solid #e0e0e0;" />`,
            );
          }

          return imgs.join("");
        }

        function normalizeMediaUrl(link) {
          if (!link) return null;
          if (link.startsWith("http://") || link.startsWith("https://")) {
            return link;
          }
          return MEDIA_PREFIX + link.replace(/^\/+/, "");
        }

        function escapeHtml(str) {
          return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
        }
      })
      .join("");

    resultsEl.innerHTML = html;
  }

  async function doSearch() {
    if (!form.reportValidity()) return;

    const kind = getKind(); // corner / niche / uform / walkin
    const payload = buildPayloadFromForm();

    setStatus("Suche wird ausgeführt …", true);
    resultsEl.innerHTML = "";

    try {
      const res = await fetch("/api/magic/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ kind, payload }),
      });

      const data = await res.json();
      if (!res.ok) {
        console.error("Hassmann search failed:", data);
        setStatus(data.error || "Fehler bei der Suche.", false);
        return;
      }

      // Erwartete Struktur: { results: [...] } – bei Bedarf anpassen
      const list = Array.isArray(data.results) ? data.results : data;
      setStatus(`Es wurden ${list.length} Produkt(e) gefunden.`, true);
      renderResults(list);
    } catch (err) {
      console.error(err);
      setStatus("Netzwerkfehler bei der Suche.", false);
    }
  }

  btn.addEventListener("click", () => {
    console.log("[HF] search button clicked");
    doSearch();
  });
}

// ===== Angebot als PDF erzeugen und an Auftrag (n8n) senden =====
(function initSendOfferPdfToAuftrag() {
  const auftragInput = document.getElementById("auftragId");
  const sendBtn = document.getElementById("sendPdfToAuftrag");
  const statusBox = document.getElementById("auftragPdfStatus");

  if (!sendBtn || !auftragInput || !statusBox) return;

  const WEBHOOK_URL =
    "https://fly-n8n-1.fly.dev/webhook/c1aa786a-9cc4-4f7d-aba7-b4ac9c978f69";

  function setStatus(msg, type = "info") {
    if (!statusBox) return;
    const ts = new Date().toLocaleTimeString();
    const prefix =
      type === "success"
        ? "✅"
        : type === "error"
          ? "❌"
          : type === "warn"
            ? "⚠️"
            : "ℹ️";

    statusBox.className = "status " + (type === "error" ? "err" : "ok");
    statusBox.textContent = `${prefix} [${ts}] ${msg}`;
  }

  async function fetchOfferPdfBlob() {
    if (typeof buildPayload !== "function") {
      throw new Error("buildPayload ist nicht verfügbar.");
    }
    const payload = buildPayload();

    const resp = await fetch("/docx-template/pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      const txt = await resp.text().catch(() => "");
      throw new Error(
        `PDF-Generierung fehlgeschlagen (${resp.status}): ${txt}`,
      );
    }

    return await resp.blob();
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () =>
        reject(new Error("FileReader-Fehler beim Konvertieren des PDFs."));
      reader.onload = () => {
        const dataUrl = String(reader.result || "");
        const base64 = dataUrl.split(",")[1] || "";
        resolve(base64);
      };
      reader.readAsDataURL(blob);
    });
  }

  async function sendPdfToAuftrag() {
    const auftragId = (auftragInput.value || "").trim();
    if (!auftragId) {
      setStatus("Bitte zuerst eine Auftrag ID eingeben.", "error");
      auftragInput.focus();
      return;
    }

    // Bestehende Angebotsnummer lesen – NICHT neu erzeugen
    const offerInput = document.getElementById("offerNumber");
    const offerNumber = (offerInput?.value || "").trim();

    if (!offerNumber) {
      // Variante A: Fehler, wenn keine Angebotsnummer vorhanden ist
      setStatus(
        "Bitte zuerst eine Angebotsnummer generieren (offerNumber ist leer).",
        "error",
      );
      offerInput?.focus();
      return;

      // Variante B (alternativ): pdfName einfach weglassen
      // -> dann diesen return entfernen und unten pdfName optional machen
    }

    try {
      sendBtn.disabled = true;
      setStatus("Erzeuge Angebots-PDF …", "info");

      const pdfBlob = await fetchOfferPdfBlob();
      setStatus("Konvertiere PDF nach Base64 …", "info");

      const pdfBase64 = await blobToBase64(pdfBlob);

      setStatus("Sende PDF an Auftrag-Webhook …", "info");

      // pdfName exakt aus der bereits existierenden Angebotsnummer ableiten
      //const pdfName = `${offerNumber}.pdf`;
      const pdfName = offerNumber;

      const body = {
        auftragId, // Auftrag ID aus Input
        pdfBase64, // PDF als Base64
        pdfName, // nur aus bestehender offerNumber
      };

      const res = await fetch(WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`Webhook-Fehler (${res.status}): ${txt}`);
      }

      setStatus("Angebots-PDF erfolgreich an Auftrag gesendet.", "success");

      try {
        const json = await res.json();
        console.log("[Auftrag-Webhook] Antwort:", json);
      } catch {
        // kein JSON zurück — egal
      }

      if (typeof saveFinalOfferSnapshot === "function") {
        try {
          await saveFinalOfferSnapshot();
        } catch (e) {
          console.warn(
            "[sendPdfToAuftrag] saveFinalOfferSnapshot fehlgeschlagen:",
            e,
          );
        }
      }
    } catch (err) {
      console.error("sendPdfToAuftrag error:", err);
      setStatus(err.message || "Fehler beim Senden des Angebots-PDF.", "error");
    } finally {
      sendBtn.disabled = false;
    }
  }

  sendBtn.addEventListener("click", () => {
    if (typeof requireBereichValid === "function" && !requireBereichValid()) {
      location.hash = "Kundendaten";
      return;
    }
    sendPdfToAuftrag();
  });
})();

// im DOMContentLoaded-Block aufrufen:
document.addEventListener("DOMContentLoaded", () => {
  // ... dein bisheriger Code ...
  initHassmannBestFinder();
});

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("[data-offer-key]").forEach((tile) => {
    tile.addEventListener("click", () => {
      const key = tile.dataset.offerKey;
      setCurrentOfferType(key);
    });
  });
});

// Small helper: confirmation dialog before going back to Auswahl der Leistung from the sidebar
function askBeforeGoingHome(onConfirm) {
  const overlay = document.getElementById("homeConfirmOverlay");
  const cancelBtn = document.getElementById("homeConfirmCancel");
  const goBtn = document.getElementById("homeConfirmGo");

  // Fallback: native confirm if markup is missing
  if (!overlay || !cancelBtn || !goBtn) {
    const ok = window.confirm(
      "Wenn Sie zur Startseite zurückkehren, gehen alle eingegebenen Daten verloren und Sie müssen neu beginnen. Möchten Sie fortfahren?",
    );
    if (ok && typeof onConfirm === "function") onConfirm();
    return;
  }

  function cleanup() {
    overlay.classList.remove("visible");
    cancelBtn.removeEventListener("click", handleCancel);
    goBtn.removeEventListener("click", handleGo);
  }

  function handleCancel() {
    cleanup();
  }

  function handleGo() {
    cleanup();
    if (typeof onConfirm === "function") onConfirm();
  }

  cancelBtn.addEventListener("click", handleCancel);
  goBtn.addEventListener("click", handleGo);

  overlay.classList.add("visible");
}

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
    if (!link) return;

    const step = link.getAttribute("data-step");
    if (!step) return;

    event.preventDefault();

    if (step === "home") {
      // Already on home? Just close the sidebar.
      const current =
        typeof getCurrentStep === "function"
          ? getCurrentStep()
          : (location.hash || "").replace("#", "") || "home";

      if (current === "home") {
        toggleSidebar(false);
        return;
      }

      // Ask the user before resetting and going back to home
      askBeforeGoingHome(() => {
        setStep("home");
        toggleSidebar(false);
      });
    } else {
      // Normal behavior for all other steps
      setStep(step);
      toggleSidebar(false);
    }
  });
})();

(function () {
  const hiddenInput = document.getElementById("sonstige-innen-input");
  const buttons = document.querySelectorAll(".js-multi-swatch");

  function updateHiddenInput() {
    const selected = Array.from(buttons)
      .filter((btn) => btn.classList.contains("is-selected"))
      .map((btn) => btn.dataset.value);
    hiddenInput.value = selected.join(","); // or JSON.stringify(selected)
  }

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      btn.classList.toggle("is-selected");
      updateHiddenInput();
    });
  });
})();
(function initBwtExtraArbeitszeit() {
  var fs = document.getElementById("bwtAzExtraFieldset");
  if (!fs) return;

  var wrap = fs.querySelector(".bwt-az-items");
  var tpl = document.getElementById("tpl-bwtAzExtraItem");
  var LS_KEY = "bwtExtraTasks:v1";

  // If something is missing in the HTML, do nothing.
  if (!wrap || !tpl || !tpl.content) return;

  // --- helpers like in initDWExtraTasks -------------------------

  function serializeRows() {
    var rows = [];
    var items = wrap.querySelectorAll(".bwt-az-item");

    items.forEach(function (item) {
      var durEl = item.querySelector(".bwt-az-duration");
      var taskEl = item.querySelector(".bwt-az-task");

      var durRaw = ((durEl && durEl.value) || "").trim();
      var task = ((taskEl && taskEl.value) || "").trim();

      if (!durRaw && !task) return;
      rows.push({
        durationHHMM: durRaw,
        task: task,
      });
    });

    return rows;
  }

  function saveState() {
    try {
      var rows = serializeRows();
      localStorage.setItem(LS_KEY, JSON.stringify(rows));
    } catch (e) {
      console.warn("[ExtraAZ] saveState failed", e);
    }
  }

  function restoreFromLocalStorage() {
    var rows = null;
    try {
      rows = JSON.parse(localStorage.getItem(LS_KEY) || "null");
    } catch (e) {
      rows = null;
    }
    if (!Array.isArray(rows) || !rows.length) return false;

    wrap.innerHTML = "";
    rows.forEach(function (row) {
      addExtraRow(false, row);
    });
    return true;
  }

  function wireRow(node) {
    var durEl = node.querySelector(".bwt-az-duration");
    var taskEl = node.querySelector(".bwt-az-task");

    if (durEl && typeof wireDurationAutoFormat === "function") {
      wireDurationAutoFormat(durEl);
    }

    [durEl, taskEl].forEach(function (el) {
      if (!el) return;
      el.addEventListener("input", saveState);
      el.addEventListener("change", saveState);
    });
  }

  // --- UI row creation / removal ------------------------------

  function addExtraRow(focusTask, prefill) {
    if (focusTask === undefined) focusTask = true;

    var first = tpl.content.firstElementChild;
    if (!first) return null;

    var node = first.cloneNode(true);
    wrap.appendChild(node);

    wireRow(node);

    if (prefill && typeof prefill === "object") {
      var durEl = node.querySelector(".bwt-az-duration");
      var taskEl = node.querySelector(".bwt-az-task");
      if (durEl) durEl.value = prefill.durationHHMM || "";
      if (taskEl) taskEl.value = prefill.task || "";
    }

    if (focusTask) {
      var taskEl2 = node.querySelector(".bwt-az-task");
      if (taskEl2) taskEl2.focus();
    }
    return node;
  }

  function removeExtraRow(btn) {
    var item = btn.closest(".bwt-az-item");
    if (!item) return;

    var items = wrap.querySelectorAll(".bwt-az-item");

    // If it's the only row, just clear inputs instead of removing
    if (items.length <= 1) {
      var durEl = item.querySelector(".bwt-az-duration");
      var taskEl = item.querySelector(".bwt-az-task");
      if (durEl) durEl.value = "";
      if (taskEl) taskEl.value = "";
      saveState();
      return;
    }

    item.remove();
    saveState();
  }

  // Event delegation for "+" and 🗑
  fs.addEventListener("click", function (e) {
    var addBtn = e.target.closest(".bwt-az-add");
    if (addBtn) {
      addExtraRow(true);
      saveState();
      return;
    }

    var removeBtn = e.target.closest(".bwt-az-remove");
    if (removeBtn) {
      removeExtraRow(removeBtn);
      return;
    }
  });

  // --- payload-based restore hook (like restoreDWExtraTasksFromPayload) ---

  window.restoreBwtExtraArbeitszeitFromPayload = function (aw) {
    if (!aw || !Array.isArray(aw.extraTasks)) return;

    wrap.innerHTML = "";

    if (aw.extraTasks.length === 0) {
      // keep section empty; user can add rows with "+"
      try {
        localStorage.removeItem(LS_KEY);
      } catch (e) {}
      return;
    }

    aw.extraTasks.forEach(function (row) {
      addExtraRow(false, {
        durationHHMM: row.durationHHMM || "",
        task: row.task || "",
      });
    });

    saveState(); // mirror payload → LS so a refresh keeps it
  };

  // On first load, restore last local edits (if any)
  restoreFromLocalStorage();
})();

// #endregion
