// --- Offer Catalog (single source of truth) ---
const OFFERS = {
  bu: {
    name: "BU · Badumbau",
    pages: [
      "Kundendaten",
      "duschwanne",
      "wandverkleidung",
      "duschabtrennung",
      "optional",
      "rabatt",
      "zusammenfassung",
      "kosten"
      ,
    ],
  },
  bwt: {
    name: "BWT · Badewannentür",
    pages: ["Kundendaten", "zusammenfassung", "kosten", "bwt"],
  },
  hl: {
    name: "HL · Handlauf",
    pages: ["Kundendaten", "zusammenfassung", "kosten"],
  },
};


// --- GLOBAL: tolerant EUR money parser used across the Hassmann page ---
// Accepts "1.099,50", "1099.50", "€ 1 099,50", "12,2", "12.2" -> Number in euros
window.parseMoneyEuro = function (v) {
  let s = String(v ?? '').trim();
  if (!s) return 0;
  s = s.replace(/[^\d,.,,-]/g, '').replace(/\s+/g, ''); // keep digits , .
  const hasComma = s.includes(',');
  const hasDot   = s.includes('.');
  if (hasComma && hasDot) {
    // assume European: dots are thousands, comma is decimal
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (hasComma) {
    // single comma → decimal
    s = s.replace(',', '.');
  } else {
    // only dot → decimal (do not strip)
  }
  const n = parseFloat(s);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
};
// the toast helper
function ntToast(type, title, message, {duration = 3600, withBackdrop = true} = {}) {
  const host = document.getElementById('nt-toaster');
  const backdrop = document.getElementById('nt-toast-backdrop');

  // Fallback if container missing
  if (!host) return alert([title, message].filter(Boolean).join('\n'));

  // Ensure strings
  const safeTitle = String(title ?? '');
  const safeMsg   = String(message ?? '');

  const el = document.createElement('div');
  el.className = `nt-toast ${type||'info'}`;
  el.innerHTML = `
    <div class="nt-title">${safeTitle}</div>
    <button class="nt-close" aria-label="Schließen">×</button>
    ${safeMsg ? `<div class="nt-msg">${safeMsg}</div>` : ''}
  `;
  host.appendChild(el);

  // Backdrop
  if (withBackdrop && backdrop) {
    backdrop.hidden = false;
    requestAnimationFrame(() => {
      backdrop.style.opacity = '1';
      backdrop.style.pointerEvents = 'auto';
    });
  }

  // enter animation
  requestAnimationFrame(() => el.classList.add('show'));

  const close = () => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 180);
    if (withBackdrop && backdrop) {
      backdrop.style.opacity = '0';
      backdrop.style.pointerEvents = 'none';
      setTimeout(() => { backdrop.hidden = true; }, 180);
    }
  };

  el.querySelector('.nt-close')?.addEventListener('click', close);
  if (duration > 0) setTimeout(close, duration);
}

const toast = {
  success: (t, m, opts) => ntToast('success', t, m, opts),
  error:   (t, m, opts) => ntToast('error',   t, m, opts),
  info:    (t, m, opts) => ntToast('info',    t, m, opts),
  warn:    (t, m, opts) => ntToast('warn',    t, m, opts),
};


// top-level (once)
window.__restoring = false;
window.__RESTORING__ = false;



// ---- RESTORE HELPERS ----
function findInputByProductId(pid) {
  const host = document.getElementById('page-wandverkleidung') || document;
  const lab  = host.querySelector(`[data-product-id="${pid}"]`);
  return lab?.querySelector('input[type="checkbox"],input[type="radio"]') || null;
}
function setByProductId(pid, on) {
  const input = findInputByProductId(pid);
  if (!input) return false;
  input.checked = !!on;
  if (typeof highlightTileForInput === 'function') {
    highlightTileForInput(input, !!on);
  }
  if (!window.__RESTORING__) {
   input.dispatchEvent(new Event('change', { bubbles: true }));
 }
  return true;
}

function restoreBudgetPanel(Kundendaten) {
  if (!Kundendaten) return;
  const txt = String(Kundendaten.budgetOptionsPanel || '').toUpperCase();

  const elMax = document.querySelector('input[name="budgetMax"]');
  const elCop = document.querySelector('input[name="budgetCopay"]');
  const elTwo = document.querySelector('input[name="twoPersons"]');
  const copay = document.getElementById('copayAmount');

  if (elMax) elMax.checked = /4180.*MAX/.test(txt);
  if (elCop) elCop.checked = /4180.*(ZUZ|COPAY)/.test(txt);
  if (elTwo) elTwo.checked = /(ZWEI|8360)/.test(txt);

  if (copay) copay.value = (Kundendaten.copayAmount ?? '') + '';
}

function safeDispatch(el, type) {
  if (!el) return;
  if (window.__RESTORING__) return;               // <-- guard
  el.dispatchEvent(new Event(type, { bubbles: true }));
}

function setRadio(name, value) {
  if (value == null) return;
  const r = document.querySelector(`input[type="radio"][name="${name}"][value="${value}"]`);
  if (r) { r.checked = true; safeDispatch(r, 'change'); }
}

function setCheckboxByName(name, on) {
  const el = document.querySelector(`input[type="checkbox"][name="${name}"]`);
  if (!el) return;
  el.checked = !!on; safeDispatch(el, 'change');
}
function setCheckboxById(id, on) {
  const el = document.getElementById(id);
  if (!el) return;
  el.checked = !!on; safeDispatch(el, 'change');
}

function setInputByNameOrId(key, val) {
  if (val == null) return;
  const el = document.querySelector(`[name="${key}"]`) || document.getElementById(key);
  if (!el) return;
  el.value = String(val);
  if (!window.__RESTORING__) {                    // <-- quiet during restore
    el.dispatchEvent(new Event('input',  { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
}
function setHiddenById(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  el.value = value == null ? '' : String(value);
  // no events on purpose
}
function ensureTrinitySealingSelectedFromPayload(dw) {
  // must have an array with a value including TRBDSET7
  const chosen = Array.isArray(dw?.floorSealing) ? dw.floorSealing : [];
  const hasTRBD = chosen.some(s => String(s || '').includes('TRBDSET7'));
  if (!hasTRBD) return;

  const toggle = document.getElementById('addFlooring');
  const tile   = document.getElementById('tile_TRBDSET7');
  const input  = tile?.querySelector('input[type="checkbox"][name="floorSealing[]"]');

  const selectNow = () => {
    if (!input) return;

    // 1) make sure the section is open
    if (toggle && !toggle.checked) {
      toggle.checked = true;
      toggle.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // 2) actually tick the TRBDSET7 tile
    if (!input.checked) {
      input.checked = true;
      // keep the picture tile UI in sync
      if (typeof highlightTileForInput === 'function') {
        highlightTileForInput(input, true);
      }
      // persist “on” so future loads keep it checked
      try { localStorage.setItem('dw_floor_sealing', '1'); } catch {}
      // notify any listeners that rely on change
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  };

  // Run it on the next tick, then once more after the flooring apply() likely ran
  queueMicrotask(selectNow);
  setTimeout(selectNow, 0);
}

function restoreTrinnityFloorSealing(dw) {
  if (!dw) return;

  const chosen = Array.isArray(dw.floorSealing) ? dw.floorSealing : [];
  const hasTRBD = chosen.some(s => String(s || '').includes('TRBDSET7'));
  if (!hasTRBD) return;

  const form   = document.getElementById('form-duschwanne');
  const toggle = document.getElementById('addFlooring');
  const tile   = document.getElementById('tile_TRBDSET7');
  const input  = tile?.querySelector('input[type="checkbox"][name="floorSealing[]"]');

  // 1) open the panel if needed
  if (toggle && !toggle.checked) {
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // 2) tick the tile’s checkbox
  if (input && !input.checked) {
    input.checked = true;
    // keep the picture tile UI in sync
    if (typeof highlightTileForInput === 'function') highlightTileForInput(input, true);
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // 3) make sure pricing/UI reflect it immediately
  if (typeof window.updatePricing === 'function') window.updatePricing();
}

function restoreFlooringSelections(dw) {
  if (!dw) return;
  const f = document.getElementById('form-duschwanne');
  if (!f) return;

  // Normalize a stored entry like "TRINNITY Bodenabdichtung TRBDSET7" → "TRBDSET7"
  const extractPid = (s) => {
    const m = String(s || '').match(/([A-Z0-9]{5,})\s*$/);
    return m ? m[1] : '';
  };

  // Tick a checkbox by either exact value or by productId found at end
  const checkByValueOrPid = (name, raw) => {
    const val = String(raw || '');
    const pid = extractPid(val);

    let input = f.querySelector(`input[name="${name}"][value="${CSS?.escape ? CSS.escape(val) : val}"]`);
    if (!input && pid) {
      input = f.querySelector(`input[name="${name}"][value="${CSS?.escape ? CSS.escape(pid) : pid}"]`);
    }
    if (!input && val) {
      // Last resort: match by label text
      const candidates = f.querySelectorAll(`input[name="${name}"]`);
      for (const i of candidates) {
        const lbl = i.closest('label');
        const text = (lbl?.textContent || '').trim();
        if (text.includes(val) || (pid && text.includes(pid))) { input = i; break; }
      }
    }

    if (input) {
      input.checked = true;
      // keep tile UI in sync
      if (typeof highlightTileForInput === 'function') {
        highlightTileForInput(input, true);
      }
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    return false;
  };

  const arr = {
    'flooringProduct[]': Array.isArray(dw.flooringProduct) ? dw.flooringProduct : [],
    'floorAdhesive[]'  : Array.isArray(dw.floorAdhesive)   ? dw.floorAdhesive   : [],
    'floorSealing[]'   : Array.isArray(dw.floorSealing)    ? dw.floorSealing    : [],
  };

  const anyFlooringChosen = Object.values(arr).some(a => a && a.length);

  // Ensure the panel is open if something was chosen in the DB
  if (anyFlooringChosen) {
    const toggle = document.getElementById('addFlooring');
    if (toggle && !toggle.checked) {
      toggle.checked = true;
      toggle.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  // Apply each saved selection (this will re-check TRINNITY/TRBDSET7 too)
  Object.entries(arr).forEach(([name, list]) => {
    list.forEach(val => checkByValueOrPid(name, val));
  });

  // Keep totals consistent
  if (typeof window.updatePricing === 'function') {
    window.updatePricing();
  }
}



function setByNameOrId(nameOrId, value) {
  if (value === undefined || value === null) return;
  const el = document.querySelector(`[name="${nameOrId}"]`) || document.getElementById(nameOrId);
  if (!el) return;

  const t = (el.type || '').toLowerCase();
  if (t === 'checkbox') {
    el.checked = !!value; safeDispatch(el, 'change'); return;
  }
  if (t === 'radio') {
    const r = document.querySelector(`[name="${nameOrId}"][value="${String(value)}"]`);
    if (r) { r.checked = true; safeDispatch(r, 'change'); }
    return;
  }
  el.value = String(value);
  if (!window.__RESTORING__) {
    el.dispatchEvent(new Event('input',  { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

function setSelect(nameOrId, value) {
  if (value === undefined || value === null) return;
  const el = document.querySelector(`[name="${nameOrId}"]`) || document.getElementById(nameOrId);
  if (!el) return;
  el.value = String(value); safeDispatch(el, 'change');
}

function restorePflegegradAndWohnumfeld(b) {
  if (!b) return;

  // hasPflegegrad + level
  if (b.hasPflegegrad) setRadio('hasPflegegrad', b.hasPflegegrad);
  if (b.pflegegrad != null && b.pflegegrad !== '') {
    setRadio('pflegegrad', String(b.pflegegrad));
  }

  // Wohnumfeld object is the source of truth
  const we = b.wohnumfeld || {};
  const done = !!we.done || b.wohnumfeldDone === 'Ja';
  setRadio('wohnumfeldDone', done ? 'Ja' : 'Nein');

  if (we.application) {
    // e.g. 'Kunde', 'Sanitaer', 'Angehörige' – whatever your values are
    setRadio('wohnumfeldApplication', String(we.application));
  }

  const amount = we.amount ?? b.wohnumfeldAmount ?? 0;
  setInputByNameOrId('wohnumfeldAmount', amount);
}


function setNumber(nameOrId, value) {
  if (value === undefined || value === null) return;
  const el = document.querySelector(`[name="${nameOrId}"]`) || document.getElementById(nameOrId);
  if (!el) return;
  el.value = String(value); // keep "0"
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function setCheckbox(nameOrId, on) {
  const el = document.querySelector(`[name="${nameOrId}"]`) || document.getElementById(nameOrId);
  if (!el) return;
  el.checked = !!on;
  el.dispatchEvent(new Event('change', { bubbles: true }));
}


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
      const val = window.parseMoneyEuro(p.value);
      if (val > 0) {
        if (!q.value) q.value = '1';
      } else {
        q.value = '';
      }
    });

    p.addEventListener('blur', () => {
      const val = window.parseMoneyEuro(p.value);
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
      const val = window.parseMoneyEuro(p.value);
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

// Replace your current DOMContentLoaded block that defines updateTotalHours with this:
document.addEventListener("DOMContentLoaded", () => {
  const laborEl  = document.getElementById("laborHours");   // Arbeitszeit (HH:MM)
  const travelEl = document.getElementById("travelTime");   // Reisezeit (one-way, HH:MM)
  const outEl    = document.getElementById("totalHoursHHMM");

  function updateTotalHours() {
    // Parse inputs (HH:MM -> decimal hours)
    const arbeitsH   = hhmmToHours(laborEl?.value  || "0:00");
    const reiseOneH  = hhmmToHours(travelEl?.value || "0:00");

    // Daily cap after travel (10h/day total − 2× one-way travel)
    const capPerDayH = 10 - (2 * reiseOneH);

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
      const daysHTML  = ` • Arbeitstage: <strong>${days}</strong>`;
      const warnHTML  = infeasible
        ? ` <span style="color:var(--danger)">&nbsp;⚠️ Reisezeit zu lang für 10:00 h/Tag – bitte Zeiten prüfen.</span>`
        : "";
      outEl.innerHTML = `Gesamtzeit (Arbeit + Fahrt): <strong>${totalHHMM}</strong>${daysHTML}${warnHTML}`;
    }

    // Expose numeric mirrors (useful for payload/pricing)
    // - total_hours_numeric: total time (work + all travel across days)
    // - reise_hours_numeric: total travel time across all days
    // - arbeit_hours_numeric: pure work time
    const totalTravelH = days * (2 * reiseOneH);
    window.total_hours_numeric  = Math.max(0, totalH);
    window.reise_hours_numeric  = Math.max(0, totalTravelH);
    window.arbeit_hours_numeric = Math.max(0, arbeitsH);
  }

  // Live updates
  laborEl?.addEventListener("input", updateTotalHours);
  laborEl?.addEventListener("blur",  updateTotalHours);
  travelEl?.addEventListener("input", updateTotalHours);
  travelEl?.addEventListener("blur",  updateTotalHours);

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
  applyTheme(themeToggle.checked ? "dark" : "light")
);

/* ========== NAVIGATION ========== */
// Build the global "steps" list from OFFERS so OFFERS is the only source of truth
const ALL_PAGES = Array.from(
  new Set(
    Object.values(OFFERS).flatMap((offer) => offer.pages)
  )
);

// "steps" is just the union of all pages across all offers plus "home"
const steps = ["home", ...ALL_PAGES];

const pages = Object.fromEntries(
  steps.map((s) => [s, document.getElementById("page-" + s)])
);
const nav = document.getElementById("stepsNav");
const sideMenu = document.getElementById("sideMenu");

// Currently active offer key (e.g. "bu", "bwt"), or null when no flow is active
let currentOfferKey = null;

// Reset all forms to their initial HTML defaults for a fresh start per offer
function resetAllForms() {
  const formIds = [
    "form-Kundendaten",
    "form-duschwanne",
    "form-wandverkleidung",
    "form-duschabtrennung",
    "form-optional",
    "form-rabatt",
  ];

  formIds.forEach((id) => {
    const form = document.getElementById(id);
    if (form && typeof form.reset === "function") {
      form.reset();
    }
  });
}


// Effective list of steps used for prev/next navigation
function getFlowSteps() {
  if (currentOfferKey && OFFERS[currentOfferKey]) {
    return OFFERS[currentOfferKey].pages;
  }
  return steps;
}

// Show only the pages for the active offer in the sidebar
function updateSidebarForOffer() {
  if (!sideMenu) return;
  const flow = getFlowSteps();
  const allowed = new Set(flow);

  // If you later want Home in the sidebar, keep this:
  allowed.add("home");

  sideMenu.querySelectorAll(".side-link").forEach((link) => {
    const step = link.getAttribute("data-step");
    if (!step) return;
    const visible = allowed.has(step);
    link.style.display = visible ? "" : "none";
  });
}

// Start a flow for a given offer and jump to its first page
function startOfferFlow(offerKey) {
  if (!OFFERS[offerKey]) return;

  // Fresh start for this offer: clear all forms back to their HTML defaults
  resetAllForms();

  currentOfferKey = offerKey;
  updateSidebarForOffer();

  const flow = getFlowSteps();
  const first = flow[0];
  if (first) setStep(first);
}



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

    // sync sidebar highlight
    const sideLink = sideMenu?.querySelector(`.side-link[data-step="${s}"]`);
    sideLink?.classList.toggle("active", s === step);
    sideLink?.classList.toggle("done", steps.indexOf(step) > i);
  });
  location.hash = step;
  updateSummary();

  // ✅ Recompute whenever entering Rabatt or Kosten
  if (step === 'rabatt' || step === 'kosten') {
    // small defer to let layout/classes switch
    setTimeout(() => window.updatePricing?.(), 0);
  }
    if (step === 'rabatt' || step === 'kosten') {
   // Do a full panel refresh (pricing + paint), not just pricing
    setTimeout(() => window.refreshAllPanels?.(), 0);
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
    const kind = fs.dataset.kind || '';
    const isCustom = kind === 'custom';
    const canonicalLabel = KIND_TO_LABEL[kind] || 'Duschabtrennung (Hassmann)';
    fs.querySelectorAll('.da-item').forEach(item => {
      const priceEl = item.querySelector('.da-price');
      const qtyEl   = item.querySelector('.da-qty');
      const idEl    = item.querySelector('.da-id');
     const nameEl  = item.querySelector('.da-name'); // only in Freier Posten
      const priceRaw = (priceEl?.value ?? '').trim();
      const priceNum = window.parseMoneyEuro(priceRaw);
      const qty = Math.max(0, parseInt((qtyEl?.value ?? '').trim(), 10) || 0);
      if (isCustom) {
        const name = (nameEl?.value ?? '').trim();
        if (!name) return;               // require label
        if (priceNum <= 0) return;       // require price
        const productId = (idEl?.value ?? '').trim();
        qa.push({
          kind,
          label: name,                   // exact custom label
          qty: Math.max(1, qty || 1),   // default to 1 if blank
          price: priceRaw,               // keep raw string; parsed later
          productId
        });
      } else {
        if (priceNum <= 0) return;       // only priced rows
        if (qty <= 0) return;
        const productId = (idEl?.value ?? '').trim();
        qa.push({
          kind,
           label: productId,
          qty,
          price: priceRaw,
          productId
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
  return [...root.querySelectorAll('fieldset.da-row[data-kind="custom"] .da-item')].map(item => {
    const name  = item.querySelector('.da-name')?.value?.trim() || '';
    const price = item.querySelector('.da-price')?.value || '';
    const qty   = item.querySelector('.da-qty')?.value || '';
    const id    = item.querySelector('.da-id')?.value?.trim() || '';

    // normalize numeric price (accepts "1.234,56" or "1234.56")
    const priceNum = (() => {
      const raw = String(price).trim();
      if (!raw) return 0;
      const norm = raw.replace(/\./g, '').replace(',', '.'); // de → en
      const n = Number(norm);
      return Number.isFinite(n) ? n : 0;
    })();

    const qtyNum = Math.max(0, parseInt(qty, 10) || 0);

    return {
      kind: 'custom',
      name,
      id,
      price: priceNum,
      qty: qtyNum,
      total: +(priceNum * qtyNum).toFixed(2)
    };
  }).filter(x => x.name && x.price > 0 && x.qty > 0);
}


function readWVConsumablesStrict() {
  const form = document.getElementById('form-wandverkleidung');
  if (!form) return [];

  // If we have checkbox tiles, use ONLY those (true source of truth)
  const boxInputs = form.querySelectorAll(
    'input[type="checkbox"][name="wvSealing[]"],' +
    'input[type="checkbox"][name="flechenkleber[]"],' +
    'input[type="checkbox"][name="wvEndProfile[]"],' +
    'input[type="checkbox"][name="wvSilikon[]"]'
  );

  const picked = [];
  if (boxInputs.length) {
    boxInputs.forEach(i => { if (i.checked) picked.push(String(i.value)); });
    return Array.from(new Set(picked));
  }

  // Fallback (no boxes present): accept singles from <select>s,
  // but only when the control is visible & enabled.
  ['wvSealing','flechenkleber','wvEndProfile','wvSilikon'].forEach(name => {
    const el = form.querySelector(`[name="${name}"]`);
    if (el && !el.disabled && !el.closest('[hidden]') && el.value) {
      picked.push(String(el.value));
    }
  });

  return Array.from(new Set(picked));
}

// Remove or empty sections that do not belong to the currently active offer
function filterPayloadByOffer(payload) {
  if (!currentOfferKey || !OFFERS[currentOfferKey]) {
    return payload;
  }

  const pagesForOffer = OFFERS[currentOfferKey].pages || [];
  const allowedPages = new Set(pagesForOffer);

  // Map: page-id in OFFERS.pages → key name in payload
  const pageToKey = {
    Kundendaten: "Kundendaten",
    duschwanne: "duschwanne",
    wandverkleidung: "wandverkleidung",
    duschabtrennung: "duschabtrennung",
    optional: "optional",
    rabatt: "rabatt",
  };

  Object.entries(pageToKey).forEach(([page, key]) => {
    if (!allowedPages.has(page) && key in payload) {
      // For non-selected pages, make their contribution empty
      payload[key] = {};
      // If you prefer deleting instead, you can use:
      // delete payload[key];
    }
  });

  return payload;
}

function buildPayload() {
  const payload = {
    Kundendaten: formToObject(document.getElementById("form-Kundendaten")),
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
    const getAllVals = (name) => fdDW.getAll(name).map(v => String(v));

    // Existing
    const flooringProduct = getAllVals("flooringProduct[]");
    const floorAdhesive   = getAllVals("floorAdhesive[]");
    const floorSealing    = getAllVals("floorSealing[]");

    // ✅ Read the actual field name you used:
    const extraTasks = [
      ...getAllVals("duschwanne[extraTasks][]"), // primary (your markup)
      ...getAllVals("extraTasks[]"),             // optional fallback if ever used
    ].map(s => s.trim()).filter(Boolean);

    payload.duschwanne = payload.duschwanne || {};
    if (flooringProduct.length) payload.duschwanne.flooringProduct = flooringProduct;
    if (floorAdhesive.length)   payload.duschwanne.floorAdhesive   = floorAdhesive;
    if (floorSealing.length)    payload.duschwanne.floorSealing    = floorSealing;
    if (extraTasks.length)      payload.duschwanne.extraTasks      = Array.from(new Set(extraTasks));

    // Normalize toggle to boolean
    payload.duschwanne.addFlooring = !!document.getElementById('addFlooring')?.checked;
  }
} catch (e) {
  console.warn('[buildPayload] flooring arrays capture failed:', e);
}

// WV consumables – ONLY what's actually selected in the UI
try {
  const values = readWVConsumablesStrict();
  payload.wandverkleidung = payload.wandverkleidung || {};
  payload.wandverkleidung.consumables = values;
} catch (e) {
  console.warn('[buildPayload] WV consumables capture failed:', e);
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
  // --- OPTIONAL: Sonderprodukte (Freier Posten unter Optional) ---
  collectOptionalQuickAdd(payload);

  let selected = "";
  if (elMax?.checked) selected = elMax.value;
  else if (elCopay?.checked) selected = elCopay.value;
  else if (elTwo?.checked) selected = elTwo.value;

  const canonical = selected
    ? selected.toUpperCase().replace(/_/g, " ").replace(/\s+/g, " ").trim()
    : "";

  payload.Kundendaten = payload.Kundendaten || {};
  payload.Kundendaten.budgetOptionsPanel = canonical || selected || "";
  payload.Kundendaten.copayAmount = copayEl ? parseEuroToNumber(copayEl.value) : 0;

  // Rabatt fields for server
  const pct = parseFloat(document.getElementById("rb-material-discount")?.value || "0");
  payload.rabatt = {
    ...payload.rabatt,
    materialDiscountPct: isFinite(pct) ? pct / 100 : 0,
    bonus300: !!document.getElementById("rb-bonus-300")?.checked,
    bonusGrab: !!document.getElementById("rb-bonus-grab")?.checked,
  };

  payload.offerNumber = (document.getElementById("offerNumber")?.value || "").trim();
  payload.Kundendaten.totalHoursHHMM =
    document.getElementById("totalHoursHHMM")?.textContent?.match(/(\d+:\d{2})/)?.[1] || "";
 
   // Fallback compute if mirrors are not populated yet
  const _L = typeof hhmmToHours === 'function' ? hhmmToHours(document.getElementById('laborHours')?.value || '0:00') : 0;
  const _T1= typeof hhmmToHours === 'function' ? hhmmToHours(document.getElementById('travelTime')?.value || '0:00') : 0;
  const F_total  = (_T1 * 2) + _L;
  payload.Kundendaten.totalHoursNumeric = Number(window.total_hours_numeric ?? F_total ?? 0);
  payload.Kundendaten.ReiseHoursNumeric = Number(window.reise_hours_numeric  ?? (_T1 * 2) ?? 0);
  payload.Kundendaten.ArbeitHoursNumeric= Number(window.arbeit_hours_numeric ?? _L ?? 0);
  payload.Kundendaten.laborHoursHHMM = laborHHMM;
  //payload.Kundendaten.laborHoursNumeric = laborNumeric;

  const woh = readWohnumfeld();
  const isKK =
    (payload.Kundendaten?.payer ||
      document.querySelector('input[name="payer"]:checked')?.value) === "Kassenkunde";
  payload.Kundendaten.wohnumfeld = isKK ? woh : { done: false, amount: 0 };

  // --- Attach Duschwanne selection from DOM (if present) ---
  {
    const eb = !!document.getElementById('ebenerdigeToggle')?.checked;
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

    // Remember which offer was active when building this payload
  payload.activeOffer = currentOfferKey || null;

  // Remove/empty sections that are not part of the active offer's pages
  return filterPayloadByOffer(payload);
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
    // Save snapshot now that the export succeeded
await saveFinalOfferSnapshot();

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
// === FIX: area <-> color coupling (self-contained) ===
function syncColorWithAreaDW() {
  const form = document.getElementById('form-duschwanne');
  if (!form) return;

  const areaEl = form.querySelector('#floorArea');
  const raw = (areaEl?.value || '').replace(',', '.');
  const hasArea = Number.isFinite(+raw) && +raw > 0;

  const colors = Array.from(form.querySelectorAll('input[name="flooringProduct[]"]'));
  if (!colors.length) return;

  // ensure exclusivity helper
  const uncheckAll = () => colors.forEach(i => { i.checked = false; highlightTileForInput(i, false); });

  const anyChecked = form.querySelector('input[name="flooringProduct[]"]:checked');

  if (!hasArea) {
    // area empty/0 -> NO color selected
    uncheckAll();
  } else if (!anyChecked) {
    // area > 0 -> ensure exactly ONE is selected (default: Lava-Beige if present)
    const def =
      form.querySelector('input[name="flooringProduct[]"][data-color="Lava-Beige"]') ||
      colors[0];
    if (def) {
      def.checked = true;
      // make sure we keep exclusivity visually
      colors.forEach(i => highlightTileForInput(i, i === def));
    }
  } else {
    // area > 0 and one is already checked -> enforce exclusivity (in case multiple were ticked)
    const first = anyChecked;
    colors.forEach(i => {
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
  const form = document.getElementById("form-Kundendaten");
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
// Map home tiles (data-step on .tile-btn) to OFFERS keys
const TILE_TO_OFFER = {
  "BU-Badumbau": "bu",
  "BWT-Badewannentür": "bwt",
   "HL-Handlauf": "hl",
  // "AH-Alltagshilfe": "ah",
  // "HMS-Hausmeister-Service": "hms",
  // "WD-Winterdienst": "wd",
};

// Home tiles → start the corresponding offer flow
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
  recomputeWVFlachenQty();   // <-- added
  if (typeof updateKostenDetails === "function") updateKostenDetails();
});
qtyEl.addEventListener("change", () => {
  recomputeWVFlachenQty();   // <-- added
});
recomputeWVFlachenQty();     // <-- initial paint based on current panel Mengen

  });
}
// === WV PANELS → FLÄCHENKLEBER (one-way) ==============================
function recomputeWVFlachenQty() {
  const n = (id) => parseInt(document.getElementById(id)?.value || '0', 10) || 0;
  const out = document.getElementById('wvFlachenQty');
  if (!out) return;

  const v = (2 * n('wvQty997')) + (2 * n('wvQty1497'));
  // Write only if changed (prevents noisy loops)
  if ((parseInt(out.value || '0', 10) || 0) !== v) {
    out.value = String(v);
    // notify any listeners (pricing, UI mirrors, etc.)
    out.dispatchEvent(new Event('input',  { bubbles: true }));
    out.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

function initWVConnectorsUI() {
  const qtyVEl   = document.getElementById('wvV3VQty');       // user-entered connectors
  const outEl    = document.getElementById('wvV3VRuleText');  // hint line
  const cb997    = document.getElementById('wv997');
  const cb1497   = document.getElementById('wv1497');
  const q997El   = document.getElementById('wvQty997');
  const q1497El  = document.getElementById('wvQty1497');
 const corners  = document.getElementById('wvCornersCount');

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
    const ecken = Math.max(0, n(corners?.value));
  rec = Math.max(0, rec - ecken);          // add vertical profiles for corners
    return rec;
  }

  function render() {
    const rec = recommendedVCount();
    const cur = n(qtyVEl.value);
      if (rec > 0) {
    outEl.classList.remove('warn');
    outEl.textContent = `- Verbindungsprofil(e) empfohlen: ${rec} Stk • aktuell: ${cur} Stk`;
  } else {
    outEl.classList.add('warn');
    outEl.textContent =
      '⚠️ Keine Verbindungsprofile empfohlen. Bitte Paneelanzahl und „Ecke(n) vorhanden“ prüfen.';
  }
}

  // Wire listeners (any change should refresh the hint)
  ['input','change','blur'].forEach(ev => {
    qtyVEl.addEventListener(ev, render);
    q997El?.addEventListener(ev, render);
    q1497El?.addEventListener(ev, render);
    corners?.addEventListener(ev, render);
  });
  cb997?.addEventListener('change', render);
  cb1497?.addEventListener('change', render);
  

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
  // Pick the correct <template> for a fieldset (Freier Posten has its own)
function getTemplateFor(fs) {
  const tplId = fs && fs.getAttribute('data-template');
  const t = tplId ? document.getElementById(tplId) : TPL;
  // Fallback to shared TPL if custom template missing
  return (t && t.content) ? t : TPL;
}

  const KINDS = [
    { kind: 'pendeltuer',   label: 'Pendeltür Hassmann' },
    { kind: 'gleittuer',    label: 'Gleittür Hassmann' },
    { kind: 'faltpendel',   label: 'Falt-Pendeltür Hassmann' },
    { kind: 'walkin',       label: 'Walk-In Hassmann' },
  ];

  const LS_KEY = 'daQuickAddRows:v1';

const saveState = () => {
  const state = {};
  for (const fs of section.querySelectorAll('fieldset.da-row[data-kind]')) {
    const kind = fs.dataset.kind;
    const rows = [];
    fs.querySelectorAll('.da-item').forEach(item => {
      const price = window.parseMoneyEuro(item.querySelector('.da-price')?.value);
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
    if (!wrap) return null;
const tpl = getTemplateFor(fs);
if (!tpl?.content) return null;


    // rule: only add if the last existing row is valid
   const last = wrap.querySelector('.da-item:last-child');
if (last) {
  const lastPrice = window.parseMoneyEuro(last.querySelector('.da-price')?.value);
  const lastId = (last.querySelector('.da-id')?.value || '').trim();

  if (kind === 'custom') {
    const lastName = (last.querySelector('.da-name')?.value || '').trim();
    if (!lastName) { last.querySelector('.da-name')?.focus(); return null; }
    if (lastPrice <= 0) { last.querySelector('.da-price')?.focus(); return null; }
    if (!lastId) { last.querySelector('.da-id')?.focus(); return null; }
  } else {
    if (lastPrice <= 0) { last.querySelector('.da-price')?.focus(); return null; }
    if (!lastId) { last.querySelector('.da-id')?.focus(); return null; }
  }
}


    const node = tpl.content.firstElementChild.cloneNode(true);

    wrap.appendChild(node);
    wireRow(node);
    if (focusPrice) node.querySelector('.da-price')?.focus();
    saveState();
    return node;
  }

 function removeRow(btn) {
  var item = btn.closest('.da-item');
  var fs   = btn.closest('fieldset.da-row[data-kind]');
  if (!item || !fs) return;

  var wrap = fs.querySelector('.da-items');
  var onlyOne = wrap && wrap.querySelectorAll('.da-item').length <= 1;

  if (onlyOne) {
    // Clear inputs instead of removing the last row
    var priceEl = item.querySelector('.da-price');
    var qtyEl   = item.querySelector('.da-qty');
    var idEl    = item.querySelector('.da-id');
    if (priceEl) priceEl.value = '';
    if (qtyEl)   qtyEl.value   = '';
    if (idEl)    idEl.value    = '';

    // Special: Freier Posten (custom) also clears the label (da-name)
    if ((fs.getAttribute('data-kind') || '') === 'custom') {
      var nameEl = item.querySelector('.da-name');
      if (nameEl) nameEl.value = '';
    }
  } else {
    // Remove the row normally
    if (item.parentNode) item.parentNode.removeChild(item);
  }

  // Persist state after any change
  if (typeof saveState === 'function') saveState();
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
    const n = window.parseMoneyEuro(priceEl.value);
      if (!Number.isFinite(n) || n <= 0) {
        priceEl.value = '';
        if (qtyEl) qtyEl.value = '';
        saveState();
        return;
      }
      const parts = n.toFixed(2).split('.');
      parts[0] = parts[0]
        .replace(/^0+(?=\d)/, '')         // strip leading zeros
        .replace(/\B(?=(\d{3})+(?!\d))/g, '.'); // thousands with dots
      priceEl.value = parts.join(',') + ' €';
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

    //  “+” add a row (only if last row is valid)
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

// ===== DUSCHWANNE: free-text extra tasks (repeater) =====
(function initDWExtraTasks() {
  const fs   = document.getElementById('dw-extra-tasks');
  if (!fs) return;

  const wrap = fs.querySelector('.da-items');
  const addBtn = fs.querySelector('.da-add');
  const LS_KEY = 'dwExtraTasks:v1';

  function makeItem(value = '') {
    const item = document.createElement('div');
    item.className = 'da-item';
    item.setAttribute('data-kind', 'extra');
    item.innerHTML = `
      <div class="da-grid">
        <label class="da-label" style="grid-column: 1 / -1;">
          Aufgabe
          <input class="dw-extra" type="text" name="duschwanne[extraTasks][]" />
        </label>
      </div>
      <button type="button" class="da-remove" aria-label="Diese Zeile entfernen">🗑</button>
    `;
    const input = item.querySelector('.dw-extra');
    input.value = value || '';
    wireItem(item);
    return item;
  }

  function wireItem(item) {
    const input = item.querySelector('.dw-extra');
    const removeBtn = item.querySelector('.da-remove');

    input?.addEventListener('input', saveState);
    removeBtn?.addEventListener('click', () => {
      const all = wrap.querySelectorAll('.da-item');
      if (all.length <= 1) {
        // keep one row; just clear it
        input.value = '';
      } else {
        item.remove();
      }
      saveState();
      // keep pricing/UI in sync if you want
      window.updatePricing?.();
    });
  }

  function saveState() {
    const vals = Array.from(wrap.querySelectorAll('.dw-extra'))
      .map(i => String(i.value || '').trim())
      .filter(Boolean);
    try { localStorage.setItem(LS_KEY, JSON.stringify(vals)); } catch {}
  }

  function restoreFromLocalStorage() {
    let vals = null;
    try { vals = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch {}
    if (!Array.isArray(vals) || !vals.length) return false;

    // leave only first row and fill/append others
    const first = wrap.querySelector('.da-item');
    if (first) {
      const input = first.querySelector('.dw-extra');
      input.value = vals[0] || '';
      wireItem(first);
    }
    for (let i = 1; i < vals.length; i++) {
      wrap.appendChild(makeItem(vals[i]));
    }
    return true;
  }

  function ensureOneRow() {
    if (!wrap.querySelector('.da-item')) {
      wrap.appendChild(makeItem(''));
    } else {
      // wire existing first row once
      wrap.querySelectorAll('.da-item').forEach(wireItem);
    }
  }

  addBtn?.addEventListener('click', () => {
    wrap.appendChild(makeItem(''));
    saveState();
  });

  // expose an optional payload-based restore (call this from your global restore pipeline)
  window.restoreDWExtraTasksFromPayload = function(dw) {
    if (!dw || !Array.isArray(dw.extraTasks)) return;
    // reset to exactly what's in payload
    wrap.innerHTML = '';
    if (dw.extraTasks.length === 0) {
      wrap.appendChild(makeItem(''));
    } else {
      dw.extraTasks.forEach(t => wrap.appendChild(makeItem(String(t || ''))));
    }
    saveState(); // mirror to LS so navigation keeps it
  };

  ensureOneRow();
  // if we didn't restore from payload, at least restore last local edits
  restoreFromLocalStorage();
})();

/* ========== Kundendaten UI (contact, aufschlag/pflegegrad, etc.) ========== */
(function initContactPersonToggle() {
  const form = document.getElementById("form-Kundendaten");
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
  const form = document.getElementById("form-Kundendaten");
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

// Live round-trip preview (Kundendaten → Entfernung)
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
      unitPanel =   Number((p?.price) || 0);
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
    // Adhesive: if none picked, pick the default SINGLE adhesive
    const anyAdh = f.querySelector('input[name="floorAdhesive[]"]:checked');
    if (!anyAdh) {
      const defAdh =
        f.querySelector('#tile_V4FK600 input[name="floorAdhesive[]"]') ||
        f.querySelector('input[name="floorAdhesive[]"]');
      if (defAdh) {
        defAdh.checked = true;
        highlightTileForInput(defAdh, true);
      }
    }

    // Keep color selection consistent with area (>0 => ensure ONE color; 0 => none)
    ensureUnits().then(() => { updateUI(); syncColorWithAreaDW(); });


    init(); // keep
  } else {
    if (area) area.value = "";
    try { localStorage.removeItem(AREA_KEY); } catch {}

    f.querySelectorAll(
      'input[name="flooringProduct[]"],input[name="floorAdhesive[]"],input[name="floorSealing[]"]'
    ).forEach((i) => {
      i.checked = false;
      highlightTileForInput(i, false);
    });

    if (liveAdh) adhesivePriceEl.textContent = "0";
    if (liveSeal) sealingPriceEl.textContent = "0";
    if (panelsPriceEl) panelsPriceEl.textContent = "0";

    unitAdh = unitSeal = 0;
    computed.areaM2 = 0;
    computed.adhesive = { productId: "V4FK600", packs: 0, unit: 0, total: 0 };
    computed.sealing  = { productId: "TRBDSET7", sets: 0, unit: 0, total: 0 };
  }

  // Keep totals in sync with server
  window.updatePricing?.();
}

const floorColors = Array.from(f.querySelectorAll('input[name="flooringProduct[]"]'));
floorColors.forEach(cb => {
  cb.addEventListener('change', () => {
    if (cb.checked) {
      floorColors.forEach(other => { if (other !== cb) { other.checked = false; highlightTileForInput(other, false); } });
      highlightTileForInput(cb, true);
    }
    ensureUnits().then(() => { updateUI(); syncColorWithAreaDW(); });
  });
});


  toggle?.addEventListener("change", apply);

 area?.addEventListener("input", () => {
  try { localStorage.setItem(AREA_KEY, area.value); } catch {}
  ensureUnits().then(() => { updateUI(); syncColorWithAreaDW(); });
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
// UI-only: if a Duschabtrennung (Hassmann) quick-add has a user ID,
// show it in the Kosten-Details label. Do NOT affect server, DOCX, or PDF.
// UI-only: append [ID] to Kosten-Details labels.
// - Already handled: “... Hassmann ...” lines (e.g., Pendeltür Hassmann).
// - NEW: also handle both “Freier Posten” variants (Hassmann + Optional/Sonderprodukte),
//        whose labels typically look like "- 1 Stk <text>" without the word "Hassmann".
function decorateDALabel(line) {
  const pid  = String(line.productId || line.id || '').trim();
  const base = (line.label ? line.label : (line.name || pid || '-'));

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

  const rows = lines.map(l => {
    if (l.__subtitle) {
      return `<div style="grid-column:1 / -1; font-weight:700; margin:8px 0 2px;">${l.label}</div>`;
    }
    return `
      <div>${decorateDALabel(l)}</div>
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
window.renderFromData = async function renderFromData(data) {
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


window.refreshAllPanels = async function refreshAllPanels() {
  try {
    const payload = collectAllFormData();
    const r = await fetch('/api/price', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await r.json();

    window.lastComputed = data;

    // Rabatt
    if (typeof renderRabatt === 'function') {
      renderRabatt(data);
    } else if (typeof window.setPricingData === 'function') {
      window.setPricingData(data);
    }

    // Kosten-Details (renderFromData is async)
    if (typeof renderFromData === 'function') {
      await renderFromData(data);
    }
  } catch (err) {
    console.error(err);
  }
};

// call this whenever those panels become visible (no reload needed)
document.getElementById('nav-rabatt')?.addEventListener('click', refreshAllPanels);
document.getElementById('nav-debug') ?.addEventListener('click', refreshAllPanels);
// If you use hash-based navigation:
window.addEventListener('hashchange', () => {
  const id = location.hash.replace('#','');
  if (id === 'rabatt' || id === 'kosten') refreshAllPanels();
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

    // Apply playground overrides into payload.Kundendaten / payload.rabatt
    payload.Kundendaten = payload.Kundendaten || {};

    // payer
    const payer = (payerRadios.find(r=>r.checked)?.value) || '';
    if (payer) payload.Kundendaten.payer = payer;

    // aufschlag
    const auf = (aufRadios.find(r=>r.checked)?.value) || '';
    if (auf) payload.Kundendaten.aufschlag = auf;

    // pflegegrad / budget
    const hasPG = hasPgCB.checked;
    if (hasPG) {
      payload.Kundendaten.hasPflegegrad = 'Ja';
      const lvl = pgLvlRadios.find(r=>r.checked)?.value || '2';
      payload.Kundendaten.pflegegrad = lvl;
    } else {
      payload.Kundendaten.hasPflegegrad = 'Nein';
      payload.Kundendaten.pflegegrad = '';
    }

    // budget options (canonical combined field used by server)
    let budget = '';
    if (twoPersons.checked) budget = 'Zwei Personen mit Pflegegrad';
    else if (budgetMax.checked) budget = '4180 maximal';
    else if (budgetCopay.checked) budget = '4180 mit Zuzahlung';
    payload.Kundendaten.budgetOptionsPanel = budget;

    payload.Kundendaten.copayAmount = Number(copayAmount.value || 0) || 0;

    // wohnumfeld
    payload.Kundendaten.wohnumfeld = {
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
    if (payload.Kundendaten?.payer) {
      const r = document.querySelector(`input[name="payer"][value="${payload.Kundendaten.payer}"]`);
      if (r) { r.checked = true; r.dispatchEvent(new Event('change', { bubbles:true })); }
    }
    // aufschlag
    if (payload.Kundendaten?.aufschlag) {
      const r = document.querySelector(`input[name="aufschlag"][value="${payload.Kundendaten.aufschlag}"]`);
      if (r) { r.checked = true; r.dispatchEvent(new Event('change', { bubbles:true })); }
    }
    // pflegegrad (just show/hide panels; exact mapping to Kundendaten panel already handled by initPflegegrad)
    if (payload.Kundendaten?.hasPflegegrad === 'Ja') {
      const yes = document.querySelector('input[name="hasPflegegrad"][value="Ja"]');
      yes && (yes.checked = true, yes.dispatchEvent(new Event('change', { bubbles:true })));
      const lvl = payload.Kundendaten?.pflegegrad || '';
      if (lvl) {
        const rl = document.querySelector(`input[name="pflegegrad"][value="${lvl}"]`);
        rl && (rl.checked = true, rl.dispatchEvent(new Event('change', { bubbles:true })));
      }
    } else {
      const no = document.querySelector('input[name="hasPflegegrad"][value="Nein"]');
      no && (no.checked = true, no.dispatchEvent(new Event('change', { bubbles:true })));
    }

    // budget options panel
    const b = String(payload.Kundendaten?.budgetOptionsPanel||'').toUpperCase();
    const elMax  = document.querySelector('input[name="budgetMax"]');
    const elCop  = document.querySelector('input[name="budgetCopay"]');
    const elTwo  = document.querySelector('input[name="twoPersons"]');
    const copay  = document.getElementById('copayAmount');
    if (elMax) elMax.checked = /4180.*MAX/.test(b);
    if (elCop) elCop.checked = /4180.*ZUZ/.test(b);
    if (elTwo) elTwo.checked = /ZWEI.*PERSONEN|8360/.test(b);
    if (copay) copay.value = String(payload.Kundendaten?.copayAmount||0);

    // woh num feld
    const weY = document.querySelector('input[name="wohnumfeldDone"][value="Ja"]');
    const weN = document.querySelector('input[name="wohnumfeldDone"][value="Nein"]');
    if (payload.Kundendaten?.wohnumfeld?.done) {
      weY && (weY.checked = true, weY.dispatchEvent(new Event('change', {bubbles:true})));
      const amt = document.getElementById('wohnumfeldAmount');
      if (amt) amt.value = String(payload.Kundendaten?.wohnumfeld?.amount||0);
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
function restoreTraySelection(dw) {
  if (!dw) return;
  // keep suggestion radio if you actually store it explicitly
  if (dw.traySuggestion) setRadio('traySuggestion', dw.traySuggestion);

  // hidden fields ONLY — do NOT address [name="traySize"] radios here
  setHiddenById('chosenTrayProductId', dw.chosenTrayProductId);
  setHiddenById('traySize', dw.traySize);
}



function restoreWorkTasks(dw) {
  if (!dw) return;

  let tasks = [];
  if (Array.isArray(dw.workTasks)) {
    tasks = dw.workTasks.map(String);
  } else {
    if (dw.remove_tub) tasks.push('remove_tub');
    if (dw.remove_enclosure) tasks.push('remove_enclosure');
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

    boxes.forEach(cb => {
      const on = tasks.includes(String(cb.value));
      cb.checked = on;
      cb.dispatchEvent(new Event('change', { bubbles: true }));
    });
    break; // stop after the group we found
  }
}

function restoreWV(wv) {
  if (!wv) return;
 const prev = window.__RESTORING__;
 window.__RESTORING__ = true;
  // --- 2a) WV consumables: clear the 4 “defaulty” items first
const WV_DEFAULT_PIDS = ['TRWDSET5','V4FK600','V3A','V4RPKIT'];
 WV_DEFAULT_PIDS.forEach(pid => setByProductId(pid, false));

  // Kind is a radio
  if (wv.wvKind) setRadio('wvKind', wv.wvKind);

  // Color may be radio too – restore if present
  if (wv.wvColor) setRadio('wvColor', wv.wvColor);
  const pageWV = document.getElementById('page-wandverkleidung');
 if (pageWV && wv.wvColor) pageWV.dataset.wvColorRestored = '1';

  // Quantities (keep zeros)
  const pairs = [
    { cb: 'wv997',   qty: 'wvQty997',   wrap: 'wvQty997Wrap' },
    { cb: 'wv1497',  qty: 'wvQty1497',  wrap: 'wvQty1497Wrap' },
  ];

  pairs.forEach(({ cb, qty, wrap }) => {
    const qtyEl = document.getElementById(qty);
    const cbEl  = document.getElementById(cb);
    const wrapEl= document.getElementById(wrap);
    const n = parseInt(wv[qty] ?? '0', 10) || 0;

    setInputByNameOrId(qty, n);
    if (cbEl) {
      cbEl.checked = n > 0;                       // tick the panel if qty>0
      cbEl.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (wrapEl) {
      wrapEl.hidden = !(n > 0);
      wrapEl.setAttribute('aria-hidden', n>0 ? 'false':'true');
    }
  });

  // Other numbers
  setInputByNameOrId('wvEndProfileQty',      wv.wvEndProfileQty);
  setInputByNameOrId('wvSilikonQty',        wv.wvSilikonQty);
  setInputByNameOrId('wvFlachenQty',        wv.wvFlachenQty);
  setInputByNameOrId('wvV3VQty',             wv.wvV3VQty);
  setInputByNameOrId('wvCornersCount',       wv.wvCornersCount);

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
   chosenStrings.some(s => s.includes(shortPid)); // e.g. "... TRWDSET5"

 setByProductId('TRWDSET5',  chosenHas('TRWDSET5')); // TRINNITY Wandabdichtung
 setByProductId('V4FK600',    chosenHas('V4FK600'));   // Flächenkleber (Wandverkleidung)
 setByProductId('V3A',       chosenHas('V3A'));      // Abschlussprofil
 setByProductId('CARESMH',   chosenHas('CARESMH'));  // Silikon
 window.__RESTORING__ = prev;

  // Selects/radios for accessories
  if (wv.wvEndProfile)      setSelect('wvEndProfile', wv.wvEndProfile);
  if (wv.wvSilikon)          setSelect('wvSilikon', wv.wvSilikon);
  if (wv.flechenkleber)        setSelect('flechenkleber', wv.flechenkleber);
  if (wv.wvSealing)         setSelect('wvSealing', wv.wvSealing);
}

function restoreHassmannQuickAdd(da) {
  const rows = Array.isArray(da?.quickAdd) ? da.quickAdd : [];
  // Find the fieldsets by data-kind (gleittuer, pendeltuer, etc.)
  for (const fs of document.querySelectorAll('fieldset.da-row[data-kind]')) {
    const kind = fs.dataset.kind;
    const wrap = fs.querySelector('.da-items');
    if (!wrap) continue;

    // Clear existing (keep one blank)
    const first = wrap.querySelector('.da-item');
    if (!first) continue;
    wrap.querySelectorAll('.da-item:not(:first-child)').forEach(n => n.remove());

    const list = rows.filter(r => r.kind === kind);
    const fill = (item, row) => {
      const qtyEl = item.querySelector('.da-qty');
      const priceEl = item.querySelector('.da-price');
      const idEl = item.querySelector('.da-id');
      if (qtyEl) qtyEl.value = String(row.qty || 0);
      if (priceEl) priceEl.value = row.price != null ? String(row.price).replace('.', ',') : (row.priceRaw || '');
      if (idEl) idEl.value = row.productId || '';
      // fire events
      if (qtyEl) qtyEl.dispatchEvent(new Event('input', { bubbles: true }));
      if (priceEl) priceEl.dispatchEvent(new Event('input', { bubbles: true }));
      if (idEl) idEl.dispatchEvent(new Event('input', { bubbles: true }));
    };

    if (list.length) {
      fill(first, list[0]);
      for (let i = 1; i < list.length; i++) {
        const item = (typeof window.addRow === 'function') ? window.addRow(kind, fs, false) : null;
        if (item) fill(item, list[i]);
      }
    } else {
      // leave the first row blank
      const qtyEl = first.querySelector('.da-qty');
      const priceEl = first.querySelector('.da-price');
      const idEl = first.querySelector('.da-id');
      if (qtyEl) qtyEl.value = '';
      if (priceEl) priceEl.value = '';
      if (idEl) idEl.value = '';
    }
  }
}
function restoreOptional(opt) {
  if (!opt) return;

  // 1) Set all qty_ fields and opt_ toggles
  Object.entries(opt).forEach(([k, v]) => {
    if (k.startsWith('qty_')) setInputByNameOrId(k, v);
    if (k.startsWith('opt_')) setCheckboxById(k, !!v); // if IDs == names
    setByNameOrId(k, v); // fallback by name
  });

  // 2) Open parent categories if any child is active
  const categories = {
    SHOWER:    [/^opt_V22|^opt_TEMPDSU|^opt_V22BG|^opt_DEDS/],
    GRAB:      [/^opt_CLPESG/],
    FOLD:      [/^opt_DEPSKG/],
    BASIN:     [/^opt_CL60$/, /^opt_WTBF/, /^opt_RSL/, /^opt_EV/],
    BASIN_TAP: [/^opt_CL_BASIN$/, /^opt_DEPOH$/],
    THERMO:    [/^opt_CLTB$|^opt_DEPTB$|^opt_CLB$/],
    SEAT:      [/^opt_DEPKS$/],
      METER:     [/^opt_TECEADS$|^qty_TECEADS$/],

  };

  Object.entries(categories).forEach(([cat, patterns]) => {
    const active = Object.entries(opt).some(([k, v]) => {
      if (!patterns.some(rx => rx.test(k))) return false;
      if (k.startsWith('qty_')) return (parseInt(v, 10) || 0) > 0;
      if (k.startsWith('opt_')) return v === 'on' || v === true || v === 'true';
      return false;
    });

    if (active) {
      const parent = document.getElementById(`cat_${cat}`);
      const menuId = `menu_${cat}`;
      if (parent && !parent.checked) {
        parent.checked = true;
        parent.dispatchEvent(new Event('change', { bubbles: true }));
      }
      const panel = document.getElementById(menuId);
      if (panel) {
        panel.hidden = false;
        panel.setAttribute('aria-hidden', 'false');
      }
    }
  });
}

function restoreRabatt(r) {
  if (!r) return;
  const slider = document.getElementById('rb-material-discount');
  if (slider) {
    const raw = r.materialDiscountPct || 0; // 0..1
    slider.value = String(raw * 100);
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    slider.dispatchEvent(new Event('change', { bubbles: true }));
  }
  setCheckboxById('rb-bonus-300', !!r.bonus300);
  setCheckboxById('rb-bonus-grab', !!r.bonusGrab);
}


// Call this with the full document returned by GET /api/offers/:offerNumber
async function restoreConfiguratorFromOffer(doc) {
  // guard (support both spellings in case other code checks one of them)
  window.__restoring = true;
  window.__RESTORING__ = true;

  // we'll need these after the try/finally as well
  let offer = null;
  let p = null;

  // local safe dispatcher (no events while restoring)
  const dispatchChange = (el) => {
    if (!el) return;
    if (window.__restoring || window.__RESTORING__) return;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };

  try {
    offer = doc?.offer || doc; // accept either shape
    p = offer?.payload;
    if (!p) return;

    // ---- Kundendaten / Kunde ----
    setSelect('salutation', p?.Kundendaten?.salutation);
    setByNameOrId('date', p?.Kundendaten?.date);
    setByNameOrId('firstName', p?.Kundendaten?.firstName);
    setByNameOrId('lastName', p?.Kundendaten?.lastName);
    setByNameOrId('phone', p?.Kundendaten?.phone);
    setByNameOrId('email', p?.Kundendaten?.email);
    setByNameOrId('street', p?.Kundendaten?.street);
    setByNameOrId('city', p?.Kundendaten?.city);
    setByNameOrId('state', p?.Kundendaten?.state);
    setByNameOrId('postalCode', p?.Kundendaten?.postalCode);
    setByNameOrId('deployment', p?.Kundendaten?.deployment);
    setByNameOrId('customerNumber', p?.Kundendaten?.customerNumber);
    setSelect('customerType', p?.Kundendaten?.customerType);

    // contact person
    setRadio('hasContactPerson', p?.Kundendaten?.hasContactPerson);
    setByNameOrId('cp_name', p?.Kundendaten?.cp_name);
    setByNameOrId('cp_phone', p?.Kundendaten?.cp_phone);
    setByNameOrId('cp_street', p?.Kundendaten?.cp_street);
    setByNameOrId('cp_city', p?.Kundendaten?.cp_city);
    setByNameOrId('cp_state', p?.Kundendaten?.cp_state);
    setByNameOrId('cp_postalCode', p?.Kundendaten?.cp_postalCode);

    // internals (+ budget)
    setByNameOrId('emc2_contact', p?.Kundendaten?.emc2_contact);
    setRadio('payer', p?.Kundendaten?.payer);
    if (typeof restoreBudgetPanel === 'function') restoreBudgetPanel(p?.Kundendaten);
    setRadio('aufschlag', p?.Kundendaten?.aufschlag);

    // Distances & Times
    setNumber('distanceKm', p?.Kundendaten?.distanceKm);
    setByNameOrId('travelTime', p?.Kundendaten?.travelTime);   // "5:00"
    setByNameOrId('laborHours', p?.Kundendaten?.laborHours);   // "07:00"

    // Pflegegrad radios FIRST…
    setRadio('hasPflegegrad', p?.Kundendaten?.hasPflegegrad);  // "Ja"/"Nein"
    if (p?.Kundendaten?.pflegegrad) setRadio('pflegegrad', String(p.Kundendaten.pflegegrad));

    // …then Wohnumfeld (depends on payer/PG visibility)
    restorePflegegradAndWohnumfeld(p?.Kundendaten);

    setNumber('copayAmount', p?.Kundendaten?.copayAmount);

    // ---- Duschwanne ----
// numeric inputs (quiet during restore)
setByNameOrId('tray_w_cm', p?.duschwanne?.tray_w_cm);
setByNameOrId('tray_l_cm', p?.duschwanne?.tray_l_cm);
setByNameOrId('tray_h_cm', p?.duschwanne?.tray_h_cm);

// IMPORTANT: do NOT touch the traySize RADIO group here (it shares the name).
// Only fill the hidden text field by its ID so we don't fire defaults:
setHiddenById('traySize', p?.duschwanne?.traySize);

// Color is typically a radio/tile; keep as-is:
setByNameOrId('trayColor', p?.duschwanne?.trayColor);
 // ebenerdige Montage toggle (checkbox)
 setCheckbox('ebenerdigeToggle', !!p?.duschwanne?.ebenerdigeMontage);

// Restore the 4 dependency toggles as *checkboxes*, not selects:
 setCheckbox('abdichtSet',   !!p?.duschwanne?.abdichtSet);
   setCheckbox('drainSet',     !!p?.duschwanne?.drainSet);
   setCheckbox('smallMaterial',!!p?.duschwanne?.smallMaterial); // "Kleinmaterial"
   setCheckbox('stelzlager',   !!p?.duschwanne?.stelzlager);

// keep hidden selection fields
setHiddenById('chosenTrayProductId', p?.duschwanne?.chosenTrayProductId);


setNumber('floorArea', p?.duschwanne?.floorArea);


// work tasks → only set now; nudge after restore
restoreWorkTasks(p?.duschwanne);

// if you keep a helper for selection, ensure it ONLY sets hidden fields (see below)
restoreTraySelection(p?.duschwanne);


    // optional flooring toggle/area
    if ('addFlooring' in (p?.duschwanne || {})) {
      setCheckbox('addFlooring', !!p.duschwanne.addFlooring);
      // don't dispatch yet; we'll nudge once after restore
    }
    setNumber('floorArea', p?.duschwanne?.floorArea);
    
// restore specific flooring tiles (panels/adhesive/sealing)
restoreTrinnityFloorSealing(p?.duschwanne);

    setByNameOrId('chosenTrayProductId', p?.duschwanne?.chosenTrayProductId);
    // Persist selection so SmartTray can auto-check it on render
  try {
   const pid = p?.duschwanne?.chosenTrayProductId || '';
    const label = p?.duschwanne?.traySize || '';
    if (pid) {
      localStorage.setItem('dw_tray_selection', JSON.stringify({ productId: pid, value: label }));
     sessionStorage.setItem('dw_tray_touched', '1');
    }
  } catch {}

    // work tasks → only set now; nudge after restore
    restoreWorkTasks(p?.duschwanne);

    // ---- Wandverkleidung ----
     if (p?.wandverkleidung?.wvKind) setRadio('wvKind', p.wandverkleidung.wvKind);
 if (p?.wandverkleidung?.wvColor) {
   setRadio('wvColor', p.wandverkleidung.wvColor);
   const pageWV = document.getElementById('page-wandverkleidung');
   if (pageWV) pageWV.dataset.wvColorRestored = '1';
 }
    setNumber('wvQty997', p?.wandverkleidung?.wvQty997);
    setNumber('wvQty1497', p?.wandverkleidung?.wvQty1497);
    if (p?.wandverkleidung?.wvColor) setRadio('wvColor', p.wandverkleidung.wvColor);
    setSelect('wvSealing', p?.wandverkleidung?.wvSealing);
    setSelect('flechenkleber', p?.wandverkleidung?.flechenkleber);
    setNumber('wvFlachenQty', p?.wandverkleidung?.wvFlachenQty);
    setSelect('wvEndProfile', p?.wandverkleidung?.wvEndProfile);
    setNumber('wvEndProfileQty', p?.wandverkleidung?.wvEndProfileQty);
    setSelect('wvSilikon', p?.wandverkleidung?.wvSilikon);
    setNumber('wvSilikonQty', p?.wandverkleidung?.wvSilikonQty);
    setNumber('wvV3VQty', p?.wandverkleidung?.wvV3VQty);
    setNumber('wvCornersCount', p?.wandverkleidung?.wvCornersCount);

    restoreWV(p?.wandverkleidung);
    try { typeof setupWandverkleidungPage === 'function' && setupWandverkleidungPage(); } catch {}

    // ---- Hassmann quick add rows ----
    if (Array.isArray(p?.duschabtrennung?.quickAdd)) {
      const fs = document.querySelector('fieldset.da-row[data-kind]');
      if (fs) {
        const wrap = fs.querySelector('.da-items');
        if (wrap) {
          wrap.querySelectorAll('.da-item:not(:first-child)').forEach(n => n.remove());
          const first = wrap.querySelector('.da-item');
          const fillRow = (item, row) => {
            const idEl = item.querySelector('.da-id');
            const priceEl = item.querySelector('.da-price');
            const qtyEl = item.querySelector('.da-qty');
            if (idEl)   idEl.value   = row?.productId || '';
            if (priceEl) priceEl.value = row?.price ? String(row.price).replace('.', ',') : (row?.priceRaw || '');
            if (qtyEl)   qtyEl.value   = String(row?.qty ?? '');
            // no dispatch during restore
          };
          if (p.duschabtrennung.quickAdd.length > 0) {
            fillRow(first, p.duschabtrennung.quickAdd[0]);
            for (let i = 1; i < p.duschabtrennung.quickAdd.length; i++) {
              const item = window.addRow ? window.addRow('quick', fs, false) : first.cloneNode(true);
              if (!item.isConnected) wrap.appendChild(item);
              fillRow(item, p.duschabtrennung.quickAdd[i]);
            }
          } else {
            first?.querySelectorAll('input').forEach(i => (i.value = ''));
          }
        }
      }
    }
    restoreHassmannQuickAdd(p?.duschabtrennung);

    // ---- Optional block ----
    if (p?.optional) {
      for (const [k, v] of Object.entries(p.optional)) setByNameOrId(k, v);
    }
    restoreOptional(p?.optional);

    // ensure parent categories ON if any kid is selected
    (function ensureOptionalParentsSelected(opt) {
      if (!opt) return;
      const map = {
        cat_SHOWER:    ['opt_V22WS1R','opt_TEMPDSU250','opt_V22BG903R','opt_DEDS2503E'],
        cat_THERMO:    ['opt_CLTB','opt_DEPTB','opt_CLB'],
        cat_GRAB:      ['opt_CLPESG40','opt_CLPESG60','opt_CLPESG80'],
        cat_FOLD:      ['opt_DEPSKG60','opt_DEPSKG85'],
        cat_SEAT:      ['opt_DEPKS', 'opt_CLPESDH'],
        cat_BASIN:     ['opt_CL60'],
        cat_BASIN_TAP: ['opt_CL_BASIN','opt_DEPOH'],
      };
      Object.entries(map).forEach(([parentId, kids]) => {
        const anyKidChecked = kids.some(id => {
          const el = document.getElementById(id);
          return !!(el && el.checked);
        });
        if (anyKidChecked) {
          const parent = document.getElementById(parentId);
          if (parent && !parent.checked) {
            parent.checked = true;
            // don't dispatch yet; we’ll nudge once after restore
          }
        }
      });
    })(p?.optional);

    restoreRabatt(p?.rabatt);

    // Show the loaded offer number
    if (offer?.offerNumber) {
      const el = document.querySelector('#offerNumber');
      if (el) el.value = offer.offerNumber;
    }
  } finally {
    // end restore guard
    window.__restoring = false;
    window.__RESTORING__ = false;
  }

  // ===== POST-RESTORE NUDGES (single, ordered) =====
  const fire = (sel) => dispatchChange(document.querySelector(sel));

  // Kundendaten dependencies
  fire('input[name="payer"]:checked');
  fire('input[name="aufschlag"]:checked');
  fire('input[name="hasPflegegrad"]:checked');
  fire('input[name="pflegegrad"]:checked');
  fire('input[name="wohnumfeldDone"]:checked');

   // Re-run the HH:MM → numeric mirrors so Reisezeit counts
 (() => {
   const labor = document.getElementById('laborHours');
   const travel = document.getElementById('travelTime');
   // trigger the live listeners
   labor?.dispatchEvent(new Event('input', { bubbles: true }));
   travel?.dispatchEvent(new Event('input', { bubbles: true }));
   // hard fallback if listeners are guarded:
   if (typeof hhmmToHours === 'function') {
     const L = hhmmToHours(labor?.value || '0:00');
     const T1 = hhmmToHours(travel?.value || '0:00');
     window.arbeit_hours_numeric = Math.max(0, L);
     window.reise_hours_numeric  = Math.max(0, T1 * 2);
     window.total_hours_numeric  = window.arbeit_hours_numeric + window.reise_hours_numeric;
   }
 })();

   // Duschwanne dependencies
  fire('#addFlooring');
  document
    .querySelectorAll('#form-duschwanne input[name*="workTasks"]')
    .forEach(el => dispatchChange(el));

  // Ensure suggestions render and auto-select the restored pick
  if (window.__smartTray && typeof window.__smartTray.fetchAndRender === 'function') {
    window.__smartTray.fetchAndRender();
  }


  // Wandverkleidung dependencies
  fire('input[name="wvKind"]:checked');

  // Optional parent categories
  [
    '#cat_SHOWER', '#cat_THERMO', '#cat_GRAB', '#cat_FOLD',
    '#cat_SEAT', '#cat_BASIN', '#cat_BASIN_TAP'
  ].forEach(id => dispatchChange(document.querySelector(id)));

  // ===== Deterministic recompute (twice to squash any stragglers) =====
  if (typeof window.updatePricing === 'function') {
    const pl = p || (typeof buildPayload === 'function' ? buildPayload() : null);
    await window.updatePricing(pl);
    await window.updatePricing(pl); // belt & suspenders for Rabatt visibility
    ensureTrinitySealingSelectedFromPayload(p?.duschwanne);


    if (typeof window.setPricingData === 'function' && window.__pricing) {
      window.setPricingData(window.__pricing);
      window.dispatchEvent(new CustomEvent('pricing:updated', { detail: window.__pricing }));
    }
       // Make sure Rabatt/Kosten UIs are fully rendered with fresh data
    if (typeof window.refreshAllPanels === 'function') {
     await window.refreshAllPanels();
    }

    // Final nudge for bonus controls that show/hide based on computed data
    document.getElementById('rb-bonus-300')
      ?.dispatchEvent(new Event('change', { bubbles: true }));
    document.getElementById('rb-bonus-grab')
      ?.dispatchEvent(new Event('change', { bubbles: true }));
  }
}



document.getElementById('btnLoadOffer')?.addEventListener('click', async (ev) => {
  const btn = ev.currentTarget;
  const input = document.getElementById('loadOfferNumber');
  const n = input?.value?.trim();

  // Validate
  if (!n) {
    toast.warn('Eingabe fehlt', 'Bitte Angebotsnummer eingeben.');
    input?.focus();
    return;
  }
  // (Optional) quick format hint: ANGYYYY-MMDD-HHmmss
  // if (!/^ANG\d{4}-\d{4}-\d{6}$/.test(n)) {
  //   toast.info('Format prüfen', 'Die Angebotsnummer wirkt ungewöhnlich.');
  // }

  // Loading state
  const prev = btn?.textContent;
  if (btn) { btn.disabled = true; btn.textContent = 'Lädt…'; }

  try {
    const r = await fetch(`/api/offers/${encodeURIComponent(n)}`, { credentials: 'include' });

    if (r.status === 404) {
      toast.error('Nicht gefunden', `Kein Angebot mit der Nummer <b>${n}</b> vorhanden.`);
      input?.focus();
      input?.select?.();
      return;
    }

    // Other non-OK
    if (!r.ok) {
      let msg = '';
      try { const j = await r.json(); msg = j?.error || ''; } catch {}
      toast.error('Nicht gefunden', `Kein Angebot mit der Nummer <b>${n}</b> vorhanden.`, { withBackdrop: true });

      return;
    }

    const data = await r.json();

    // Restore UI
    await restoreConfiguratorFromOffer(data);

    // Success toast
    const who = data?.offer?.payload?.Kundendaten?.firstName && data?.offer?.payload?.Kundendaten?.lastName
      ? `für ${data.offer.payload.Kundendaten.firstName} ${data.offer.payload.Kundendaten.lastName}`
      : '';
    toast.success('Angebot geladen', `Nummer <b>${n}</b>`, { withBackdrop: true });


  } catch (e) {
    console.warn(e);
    toast.error('Netzwerkfehler', 'Bitte Internetverbindung prüfen und erneut versuchen.');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = prev || 'Angebot laden'; }
  }
});
// Collect rows from Optional → Sonderprodukte into payload.optional.quickAdd
function collectOptionalQuickAdd(payload) {
  const panel = document.getElementById('optSonderPanel') || document.getElementById('opt-sonder');

  if (!panel) return;

  const rows = panel.querySelectorAll('.da-item');
  const parseEuro = (typeof parseMoneyStrict === 'function')
    ? (v) => (parseMoneyStrict(v) || 0)
    : (v) => {
        if (typeof parseMoneyEuro === 'function') {
          const n = parseMoneyEuro(v);
          if (!isNaN(n) && n > 0) return n;
        }
        if (typeof v !== 'string') v = String(v ?? '');
        const cleaned = v.replace(/[^\d.,-]/g, '').replace(/\./g, '').replace(',', '.');
        const n = Number(cleaned);
        return isFinite(n) ? n : 0;
      };

  const out = [];
  rows.forEach(row => {
    const label = row.querySelector('.opt-name')?.value?.trim() || '';
    const pid   = row.querySelector('.opt-id')?.value?.trim() || '';
    const qtyV  = row.querySelector('.opt-qty')?.value ?? '';
    const priceV= row.querySelector('.opt-price')?.value ?? '';

    const price = parseEuro(priceV) || 0;
    let qty = Number(String(qtyV).replace(/[^\d-]/g, ''));
    if (!Number.isFinite(qty) || qty <= 0) {
      // default qty=1 if price valid and name present, mirroring add-row behavior
      qty = (label && price > 0) ? 1 : 0;
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
  const LS_KEY = 'optQuickAddRows:v1';

  const toggle = document.getElementById('optSonderToggle') || null;
  const panel  = document.getElementById('optSonderPanel') || document.getElementById('opt-sonder');

  const tpl    = document.getElementById('opt-item-template');
  const catCb  = document.getElementById('cat_SONDER');

  if (!panel || !tpl) {
    console.warn('[sonder] missing panel/template, skipping init');
    return;
  }

  // Helper: robust euro parsing (reuse existing tolerant parsers if available)
  const parseEuro = (v) => {
    if (typeof parseMoneyStrict === 'function') {
      const n = parseMoneyStrict(v);
      if (!isNaN(n) && n > 0) return n;
    }
    if (typeof parseMoneyEuro === 'function') {
      const n = parseMoneyEuro(v);
      if (!isNaN(n) && n > 0) return n;
    }
    if (typeof v !== 'string') v = String(v ?? '');
    // accept "1.234,56", "1234.56", "199", "199 €"
    const cleaned = v
      .replace(/[^\d.,-]/g, '')
      .replace(/\./g, '')      // drop thousands sep
      .replace(',', '.');      // unify decimal
    const n = Number(cleaned);
    return isFinite(n) ? n : 0;
  };

  const rowsContainer = panel.querySelector('.da-items') || panel; // fall back to panel
  rowsContainer.addEventListener('click', (e) => {
  const del = e.target.closest('.da-remove');
  if (!del) return;
  e.preventDefault();

  const row = del.closest('.da-item');
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

  const queryRows = () => Array.from(rowsContainer.querySelectorAll('.da-item'));

  const readRow = (row) => {
    const name  = row.querySelector('.opt-name')?.value?.trim() || '';
    const pid   = row.querySelector('.opt-id')?.value?.trim() || '';
    const qtyV  = row.querySelector('.opt-qty')?.value ?? '';
    const priceV= row.querySelector('.opt-price')?.value ?? '';

    const price = parseEuro(priceV) || 0;
    let qty = Number(String(qtyV).replace(/[^\d-]/g, ''));
    if (!Number.isFinite(qty) || qty <= 0) qty = 0;

    return { label: name, productId: pid, qty, price };
  };

  const writeRow = (row, data) => {
    if (!row) return;
    const { label = '', productId = '', qty = '', price = '' } = data || {};
    const $n = row.querySelector('.opt-name');   if ($n) $n.value = label;
    const $i = row.querySelector('.opt-id');     if ($i) $i.value = productId;
    const $q = row.querySelector('.opt-qty');    if ($q) $q.value = (Number(qty) > 0) ? qty : '';
    const $p = row.querySelector('.opt-price');  if ($p) $p.value = price !== '' ? price : '';
  };

  const validateRow = (row) => {
  const { label, price, productId } = readRow(row);
  if (!label) return false;
  if (!(price > 0)) return false;
  if (!productId) return false; // ID is required
  return true;
};


  const clearRow = (row) => writeRow(row, { label: '', productId: '', qty: '', price: '' });
  const saveAll = () => {
    const rows = queryRows()
      .map(readRow)
      .filter(r => r.label || r.price || r.qty || r.productId); // keep even partial so user doesn’t lose text
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(rows));
    } catch (e) {
      console.warn('[sonder] save failed', e);
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
    node.classList.add('da-item'); // ensure class present
    writeRow(node, prefill || {});

   // === Sonderprodukte qty/price behavior ===
const $qty   = node.querySelector('.opt-qty');
const $price = node.querySelector('.opt-price');

// When user types in qty:
//  - strip non-digits
//  - if "0" → make it empty immediately
if ($qty) {
  $qty.addEventListener('input', (e) => {
    const raw = String(e.target.value || '');
    const digits = raw.replace(/[^\d]/g, '');
    if (digits === '0') {
      e.target.value = ''; // 0 becomes empty
    } else {
      e.target.value = digits;
    }
    // persist
    if (typeof saveAll === 'function') saveAll();
  });

  // On blur: if price is valid and qty empty/≤0 → set to 1. If price invalid → keep empty.
  $qty.addEventListener('blur', () => {
    const r = readRow(node);
    const p = parseEuro(r.price);
    let q = Number(String($qty.value || '').replace(/[^\d]/g, ''));
    if (!Number.isFinite(q)) q = 0;
    if (p > 0 && (!q || q <= 0)) {
      $qty.value = 1;
    } else if (q === 0) {
      $qty.value = ''; // never show 0
    }
    if (typeof saveAll === 'function') saveAll();
  });
}

// When user types a price:
//  - if price becomes valid and qty empty/≤0 → set qty to 1 automatically
if ($price) {
  $price.addEventListener('input', () => {
    const r = readRow(node);
    const p = parseEuro(r.price);
    if (p > 0 && $qty) {
      let q = Number(String($qty.value || '').replace(/[^\d]/g, ''));
      if (!Number.isFinite(q) || q <= 0) {
        $qty.value = 1;
      }
    } else if ($qty) {
      // if price cleared/invalid, normalize a "0" qty to empty
      if (String($qty.value).trim() === '0') $qty.value = '';
    }
    if (typeof saveAll === 'function') saveAll();
  });
}



    // Save on any input change
    node.addEventListener('input', saveAll, { passive: true });

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
  if (!r.label) { last.querySelector('.opt-name')?.focus(); return; }
  // If price invalid → focus price
  if (!(r.price > 0)) { last.querySelector('.opt-price')?.focus(); return; }
  // If ID missing → focus ID
  if (!r.productId) { last.querySelector('.opt-id')?.focus(); return; }

  // If price valid & ID present but qty missing/≤0 → auto-default qty to 1
  if (!r.qty || r.qty <= 0) {
    const q = last.querySelector('.opt-qty');
    if (q) q.value = 1;
  }
}

    rowsContainer.appendChild(createRow());
    saveAll();
  };

 // Restore from storage
const restored = loadAll();
const removeAllDomRows = () => {
  queryRows().forEach(el => el.remove());
};

if (restored.length) {
  // Remove any pre-rendered rows (e.g., initial “Freier Posten”) to avoid duplicates
  removeAllDomRows();
  restored.forEach(r => rowsContainer.appendChild(createRow(r)));
} else {
  // Start clean: ensure exactly one empty row
  removeAllDomRows();
  ensureAtLeastOneRow();
}


  // Wire "+" add button
  const addBtn = panel.querySelector('.da-add');
  if (addBtn) addBtn.addEventListener('click', (e) => { e.preventDefault(); addRow(); });

  // Optional: toggle shows/hides the panel (SONDER category still governs main visibility)
  if (toggle) {
    const applyToggle = () => {
      const on = !!(toggle.checked || toggle.getAttribute('aria-pressed') === 'true');
      panel.style.display = on ? '' : 'none';
      // If turning off, we do NOT clear rows automatically (you can change if desired)
    };
    toggle.addEventListener('change', applyToggle);
    applyToggle();
  }
// When the parent category checkbox is toggled: if turned off, wipe storage + DOM rows
if (catCb) {
  catCb.addEventListener('change', (e) => {
    const checked = !!e.target.checked;
    if (!checked) {
      // 1) clear persistence
      clearAll();

      // 2) remove all rows from DOM
      queryRows().forEach(el => el.remove());

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
      panel.style.display = on ? '' : 'none';
    }
  };
  if (catCb) catCb.addEventListener('change', applyCatVisibility);
  applyCatVisibility();
}



// Save a final snapshot after a successful export
async function saveFinalOfferSnapshot() {
  try {
    const offerNumber =
      document.getElementById('offerNumber')?.value?.trim() ||
      (typeof genOfferNumber === 'function' ? genOfferNumber() : '');

    if (!offerNumber) return;

    const payload = typeof buildPayload === 'function' ? buildPayload() : {};
    let pricing = window.__pricing;
    if (!pricing && typeof window.updatePricing === 'function') {
      pricing = await window.updatePricing(payload);
    }
    if (!pricing) return;

    await fetch('/api/offers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ offerNumber, payload, pricing }),
    });
  } catch (e) {
    console.warn('[saveFinalOfferSnapshot] failed:', e);
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
    await downloadPDFWithProgress("/pdf", payload, "Anfrage.pdf");
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
  await saveFinalOfferSnapshot(); // <-- add this after a.click()
  a.remove();
  URL.revokeObjectURL(urlObj);
}

document.getElementById("downloadDocx")?.addEventListener("click", async () => {
  if (!requireBereichValid()) {
    location.hash = "Kundendaten";
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
      location.hash = "Kundendaten";
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
    const pl = (typeof buildPayload === 'function') ? buildPayload() : null;
    if (!pl) return;
    await window.updatePricing?.(pl);                 // recompute with the current payload
    if (typeof window.refreshAllPanels === 'function') {
      await window.refreshAllPanels();                // repaint Rabatt/Kosten deterministically
    } else if (typeof window.setPricingData === 'function' && window.__pricing) {
      window.setPricingData(window.__pricing);
      window.dispatchEvent(new CustomEvent('pricing:updated', { detail: window.__pricing }));
    }
  } catch (e) {
    console.warn('[rabatt] recompute failed', e);
  }
}

document.getElementById("rb-bonus-300")?.addEventListener("change", async () => {
  const cb = document.getElementById("rb-bonus-300");
  if (!cb) return;

  const want = !!cb.checked;           // what the user asked for

  // phase 1: recompute once with the new payload
  await __recalcRabattNow();

  // renderer may have toggled visibility or state; enforce user's intent
  if (cb.checked !== want) cb.checked = want;

  // phase 2: recompute again so totals reflect the final state immediately
  await __recalcRabattNow();
});


document.getElementById("rb-bonus-grab")
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
      document.createTextNode(`Aufschlag ${pctInt}%`)
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
  if (!shouldShow && cb300 && cb300.checked) {
    cb300.checked = false;
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

    const nothingToShow = !hasRabatt && !anyBonus;
const emptyNote = document.getElementById('rb-empty-note');
if (emptyNote) {
  emptyNote.style.display = nothingToShow ? 'block' : 'none';
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
    //cb.checked = false;
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
// === WV selection ↔ menge sync (minimal, non-invasive) ===
(function () {
  const byId = (id) => document.getElementById(id);
  const q = (sel, root = document) => root.querySelector(sel);

  // Elements for the 4 items
  const pairs = [
    // Flächenkleber V4FK600
    { cb: q('#flechenSection input[type=checkbox][name="flechenkleber"]'), qty: byId('wvFlachenQty'), kind: 'ADH' },
    // Abschlussprofil V3A
    { cb: q('#wvEndProfileSection input[type=checkbox][name="wvEndProfile"]'), qty: byId('wvEndProfileQty'), kind: 'END' },
    // Profilklebstoff V4RPKIT
    { cb: q('#wvProfileAdhesiveSection input[type=checkbox][name="wvSilikon"]'), qty: byId('wvSilikonQty'), kind: 'PADH' },
    // Verbindungsprofil V3V (checkbox is UI only; qty governs pricing)
    { cb: byId('wvV3VSelected'), qty: byId('wvV3VQty'), kind: 'V3V' },
  ].filter(p => p.cb && p.qty);

  // Try to read an integer suggestion from #wvAdhesiveSuggestion text, else null
  function readAdhesiveSuggestion() {
    const el = byId('wvAdhesiveSuggestion');
    if (!el) return null;
    const m = (el.textContent || '').match(/\d+/);
    return m ? parseInt(m[0], 10) : null;
  }

  // When a checkbox is toggled
  function onCheckboxChange(p) {
    const current = +p.qty.value || 0;
    if (p.cb.checked) {
      if (current === 0) {
        // Use fallback for adhesive if visible, otherwise min 1
        let v = 1;
        if (p.kind === 'ADH') {
          const sug = readAdhesiveSuggestion();
          if (Number.isInteger(sug) && sug > 0) v = sug;
        }
        p.qty.value = v;
        // propagate to any existing listeners
        p.qty.dispatchEvent(new Event('input', { bubbles: true }));
        p.qty.dispatchEvent(new Event('change', { bubbles: true }));
      }
    } else {
      if (current !== 0) {
        p.qty.value = 0;
        p.qty.dispatchEvent(new Event('input', { bubbles: true }));
        p.qty.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  }

  // When quantity changes, reflect on the checkbox (reflexive)
  function onQtyChange(p) {
    const v = +p.qty.value || 0;
    if (v <= 0) {
      if (p.cb.checked) {
        p.cb.checked = false;
        p.cb.dispatchEvent(new Event('change', { bubbles: true }));
      }
    } else {
      if (!p.cb.checked) {
        p.cb.checked = true;
        p.cb.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  }

  // Wire listeners and perform initial sync
  pairs.forEach((p) => {
    p.cb.addEventListener('change', () => onCheckboxChange(p));
    p.qty.addEventListener('input', () => onQtyChange(p));
    p.qty.addEventListener('change', () => onQtyChange(p));

    // Initial sync (page load): keep any prefilled qty (e.g., fallback).
    const current = +p.qty.value || 0;

    if (p.cb.checked && current === 0) {
      // If something marked it selected but left qty empty, set minimum
      let v = 1;
      if (p.kind === 'ADH') {
        const sug = readAdhesiveSuggestion();
        if (Number.isInteger(sug) && sug > 0) v = sug;
      }
      p.qty.value = v;
    }

    // Reflect qty to checkbox for V3V and others
    onQtyChange(p);
  });
})();

function refreshHassmannFrame() {
  const iframe = document.getElementById('hassmannFrame');
  if (!iframe) return;

  // Base URL to reload (use data attr if you later change src dynamically)
  const base = iframe.dataset.src || iframe.getAttribute('src') || 'https://gconlineplus.de';

  // Simple cache-buster so the remote site fully re-renders
  const bust = (base.includes('?') ? '&' : '?') + '_=' + Date.now();

  // Safari-safe reload: blank, then set URL
  iframe.src = 'about:blank';
  setTimeout(() => { iframe.src = base + bust; }, 0);
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('refreshHassmann')?.addEventListener('click', refreshHassmannFrame);
});
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
    cat_METER:     "menu_METER",
    cat_SONDER:     "menu_SONDER",
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
  wireTileQty("opt_CLPESDH", "qty_CLPESDH_wrap");

  // ---- BASIN TAP ----
  wireTileQty("opt_CL_BASIN", "qty_CL_BASIN_wrap");
  wireTileQty("opt_DEPOH",    "qty_DEPOH_wrap");

  // ---- BASIN (main CL60 tile) ----
  wireTileQty("opt_CL60", "qty_CL60_wrap");
  // ---- METER ----
wireTileQty("opt_TECEADS", "qty_TECEADS_wrap");


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
function initTECEADSPairsLabel() {
  const qty = document.getElementById('qty_TECEADS');
  const lbl = document.querySelector('label[for="qty_TECEADS"]');
  if (!qty || !lbl) return;

  const base = (lbl.dataset.baseLabel ||= lbl.textContent.replace(/\s*\(.*\)\s*$/, ''));

  const paint = () => {
    const raw = String(qty.value || '').replace(/\./g, '').replace(',', '.');
    const n = Number(raw);
    const items = Number.isFinite(n) && n > 0 ? n : 0;     // input = items
    const pairs = items / 2;                               // show pairs
    const pairsStr = Number.isInteger(pairs) ? String(pairs) : pairs.toFixed(1);
    lbl.textContent = `${base} (${pairsStr} paare)`;
  };

  ['input','change','blur'].forEach(ev => qty.addEventListener(ev, paint));
  paint(); // initial
}

document.addEventListener('DOMContentLoaded', initTECEADSPairsLabel);


function initLivePricingSync() {
  // WATCH EVERYTHING (best: your main form; fallback: document.body)
  const watchRoot =
    document.getElementById('form-konfigurator') || // <- put your main form's id here if you have one
    document.querySelector('form') ||
    document.body;

  let t = null;
  const debounce = (fn, ms=250) => { clearTimeout(t); t = setTimeout(fn, ms); };

  async function repriceNow() { await window.updatePricing?.(); }


  // Single delegated listener covers ALL inputs/checkboxes/selects in the app
  const handler = () => {
  if (window.__restoring) return;   // ← don’t spam while restoring
   debounce(repriceNow, 180);
 };
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
  initOptionalSonderprodukte();

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
  if (!link) return;

  const step = link.getAttribute("data-step");
  if (step) {
    event.preventDefault();
    setStep(step);
  }
  toggleSidebar(false);
});

      })();

  