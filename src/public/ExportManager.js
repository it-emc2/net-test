// ExportManager.js
// Decouples export/download logic from script.js (classic script) into an ES module.
// Usage in script.js (classic):
//   window.__exportReady = (async()=>{ const { initExportManager } = await import("./ExportManager.js"); initExportManager(); })();


// ---------- Customer-facing Angebot DOCX payload sanitizer ----------
// Goal: shorten material descriptions ONLY for Angebot.docx (customer-facing),
// while keeping internal exports (Materialübersicht/Kalkulation/Arbeitsbericht) unchanged.

function __cloneForExport(value) {
  try {
    return typeof structuredClone === "function"
      ? structuredClone(value)
      : JSON.parse(JSON.stringify(value));
  } catch {
    return JSON.parse(JSON.stringify(value));
  }
}

// Map productIds/codes -> customer-friendly short labels (add more over time).
const __CUSTOMER_MATERIAL_LABEL_OVERRIDES__ = Object.freeze({
  TRWDB: "Wannenabdichtband-Set",
  AGD9060: "Ablaufgarnitur mit Sifon",
  KM02: "Kleinmaterial",
  PLA5282: "Stelzlager höhenverstellbar",
  TRWDSET5: "Wandabdichtung BASIS-Set",
  V3A: "Abschlussprofil V3 255 cm silber",
  "2000302": "Sanitär-Silikon 310ml weiß",
});

function __sanitizeMaterialLabelText(label, productId) {
  const pid = String(productId || "").trim();
  const override = __CUSTOMER_MATERIAL_LABEL_OVERRIDES__[pid];
  if (!label || typeof label !== "string") return label;

  let cleaned = label;

  if (override) {
    // Preserve qty prefix like "- 1 Stk ..."
    const m = cleaned.match(/^(\s*-\s*[\d.,]+\s*Stk\s+)/i);
    cleaned = m ? `${m[1]}${override}` : override;
  } else {
    // Conservative generic cleanup (materials only):
    cleaned = cleaned
      .replace(/\s*\[[^\]]+\]\s*$/g, "") // drop trailing [CODE]
      .replace(/\s+entspr\.?\s*DIN\s*\d+\b.*$/i, "") // drop DIN tail
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  return cleaned;
}

function __sanitizeCustomerPricing(pricing) {
  if (!pricing || typeof pricing !== "object") return pricing;
  const next = __cloneForExport(pricing);

  const lines =
    (next.materialsDisplayDocx && Array.isArray(next.materialsDisplayDocx.lines) && next.materialsDisplayDocx.lines) ||
    (next.materials && Array.isArray(next.materials.lines) && next.materials.lines) ||
    null;

  if (Array.isArray(lines)) {
    for (let i = 0; i < lines.length; i += 1) {
      const l = lines[i];
      if (!l || typeof l !== "object") continue;

      const pid = String(l.productId || l.id || "").trim();
      if (typeof l.label === "string" && l.label.trim()) {
        l.label = __sanitizeMaterialLabelText(l.label, pid);
      }
      if (typeof l.name === "string" && l.name.trim()) {
        l.name = __sanitizeMaterialLabelText(l.name, pid);
      }
    }
  }

  return next;
}


function __sanitizeCustomerPayloadFields(body) {
  if (!body || typeof body !== "object") return body;

  const exactValueOverrides = {
    // Duschwanne / Abdichtung
    "Wannenabdichtband-Set TRWDB": "Wannenabdichtband-Set",
    "Ablaufgarnitur TRAGD9060": "Ablaufgarnitur mit Sifon",
    "Kleinmaterial": "Kleinmaterial",
    "PLA5282": "Stelzlager höhenverstellbar",

    // Wandverkleidung
    "TRINNITY Wandabdichtung BASIS TRWDSET5": "Wandabdichtung BASIS-Set",
    "Abschlussprofil V3A": "Abschlussprofil V3 255 cm silber",
    "Flächenkleber R_4260602": "Flächenkleber (Wandverkleidung)",
    "flaechenkleber": "Flächenkleber (Wandverkleidung)",
    "silikon": "Sanitär-Silikon 310ml weiß",
  };

  const keySpecific = {
    abdichtSet: "Wannenabdichtband-Set",
    drainSet: "Ablaufgarnitur mit Sifon",
    smallMaterial: "Kleinmaterial",
    stelzlager: "Stelzlager höhenverstellbar",
    wvSealing: "Wandabdichtung BASIS-Set",
    wvEndProfile: "Abschlussprofil V3 255 cm silber",
    flechenkleber: "Flächenkleber (Wandverkleidung)",
    wvSilikon: "Sanitär-Silikon 310ml weiß",
  };

  const changed = [];

  const walk = (node, path = []) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i += 1) walk(node[i], path.concat(String(i)));
      return;
    }
    for (const [k, v] of Object.entries(node)) {
      const p = path.concat(k).join('.');
      if (typeof v === 'string') {
        let next = v;
        if (Object.prototype.hasOwnProperty.call(keySpecific, k) && String(v).trim()) {
          next = keySpecific[k];
        }
        if (Object.prototype.hasOwnProperty.call(exactValueOverrides, next)) {
          next = exactValueOverrides[next];
        }
        // Generic trims for very long material labels (safe-ish)
        next = next
          .replace(/\s+entspr\.?\s*DIN\s*\d+\b.*$/i, '')
          .replace(/\s*\[[^\]]+\]\s*$/g, '')
          .trim();
        if (next !== v) {
          node[k] = next;
          changed.push({ path: p, from: v, to: next });
        }
      } else if (v && typeof v === 'object') {
        walk(v, path.concat(k));
      }
    }
  };

  walk(body);
  if (changed.length) {
    console.log('[customer-docx sanitize] changed fields:', changed.slice(0, 50));
  } else {
    console.log('[customer-docx sanitize] no field changes');
  }
  return body;
}

// Build the body for Angebot.docx only.
// IMPORTANT: write sanitized pricing back into the *actual* payload keys that the
// backend/template likely already reads (not just a namespaced helper key).
async function __buildCustomerOfferDocxBody(cfg, basePayload) {
  const body = __cloneForExport(basePayload);

  // Best-effort: compute pricing snapshot if not present
  let pricing = window.__pricing;
  if (!pricing) {
    try { pricing = await cfg.updatePricing?.(body); } catch {}
  }

  if (pricing) {
    const sanitizedPricing = __sanitizeCustomerPricing(pricing);

    // Preserve helper/debug copy (harmless if backend ignores it)
    body.__pricing = __cloneForExport(sanitizedPricing);
    body.__customerDoc = { sanitizeMaterials: true, ts: Date.now() };

    // Most likely locations used by export backends/templates.
    body.pricing = __cloneForExport(sanitizedPricing);
    body.kalkulation = __cloneForExport(sanitizedPricing);

    // Some builders flatten these onto the payload root.
    if (sanitizedPricing.materialsDisplayDocx) {
      body.materialsDisplayDocx = __cloneForExport(sanitizedPricing.materialsDisplayDocx);
    }
    if (sanitizedPricing.materials) {
      body.materials = __cloneForExport(sanitizedPricing.materials);
    }

    // If the payload already contains rendered offer positions/description lines,
    // sanitize those too so the template cannot print the long product strings.
    const sanitizeRenderedLines = (node) => {
      if (!node || typeof node !== "object") return;
      if (Array.isArray(node)) {
        node.forEach(sanitizeRenderedLines);
        return;
      }
      for (const [k, v] of Object.entries(node)) {
        if (typeof v === "string") {
          // Remove verbose material tails often seen in customer offers.
          node[k] = v
            .replace(/\s+entspr\.?\s*DIN\s*\d+.*$/i, "")
            .replace(/\s*\[[^\]]+\]\s*$/g, "")
            .trim();
        } else {
          sanitizeRenderedLines(v);
        }
      }
    };

    if (body.offerItems) sanitizeRenderedLines(body.offerItems);
    if (body.positionen) sanitizeRenderedLines(body.positionen);
    if (body.items) sanitizeRenderedLines(body.items);
    if (body.lines) sanitizeRenderedLines(body.lines);
  }

  return body;
}


export function initExportManager(options = {}) {
  const cfg = {
    // DOM
    statusEl: () => document.getElementById("status"),
    offerNumberEl: () =>
      document.querySelector("#offerNumber") ||
      document.querySelector('input[name="offerNumber"]'),

    // Dependencies (default to window.*)
    buildPayload: () => window.buildPayload?.(),
    requireBereichValid: () => (typeof window.requireBereichValid === "function" ? window.requireBereichValid() : true),
    filterPayloadByOffer: (p) =>
      typeof window.filterPayloadByOffer === "function" ? window.filterPayloadByOffer(p) : p,
    getCurrentOfferType: () =>
      (typeof window.getCurrentOfferType === "function" && window.getCurrentOfferType()) ||
      (typeof window.getCurrentOfferKey === "function" && window.getCurrentOfferKey()) ||
      "bu",
    updatePricing: async (payload) =>
      (typeof window.updatePricing === "function" ? window.updatePricing(payload) : null),
    toast: (msg, ok = true) => {
      // tolerant: supports toast.success / toast.error, or showToast, or console
      const t = window.toast;
      if (t?.success && ok) return t.success("Info", msg);
      if (t?.error && !ok) return t.error("Fehler", msg);
      if (typeof window.showToast === "function") return window.showToast(msg);
      console.log(msg);
    },

    ...options,
  };

  // ---------- Offer number ----------
  function genOfferNumber() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    const yyyy = d.getFullYear();
    const mmdd = `${p(d.getMonth() + 1)}${p(d.getDate())}`;
    const hhmmss = `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
    return `ANG${yyyy}-${mmdd}-${hhmmss}`;
  }

  function stampOfferOnExport() {
    const offerInput = cfg.offerNumberEl();
    if (!offerInput) return;

    const ids = [
      "makePdfFromTemplate",
      "downloadDocx",
      "downloadDocxAsPdf",
      "downloadMaterialOverview",
      "makePdf",
      "downloadPdf",
      "downloadLatexPdf",
      "downloadArbeitsbericht",
      "downloadKalkulation",
      "downloadKalkulationDocx",
    ];

    const apply = () => {
      offerInput.value = genOfferNumber();
    };

    ids.forEach((id) => {
      const btn = document.getElementById(id);
      if (btn) btn.addEventListener("click", apply, { capture: true });
    });
  }

  // ---------- Status helpers ----------
  function showPDFProgress(message, type = "info") {
    const statusEl = cfg.statusEl();
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
    const statusEl = cfg.statusEl();
    if (!statusEl) return;

    const emoji = seconds > 0 ? "⏱️" : "🔄";
    statusEl.textContent =
      seconds > 0
        ? `${emoji} PDF wird generiert... noch ca. ${seconds}s`
        : `${emoji} PDF fast fertig...`;
  }

  // ---------- Snapshot ----------
  async function saveFinalOfferSnapshot() {
    // This is optional. If buildPayload doesn't exist, just no-op.
    const fullPayload = cfg.buildPayload?.();
    if (!fullPayload) return;

    const filteredPayload = cfg.filterPayloadByOffer(fullPayload);

    const rawOfferType =
      filteredPayload?.activeOffer ||
      filteredPayload?.offerType ||
      cfg.getCurrentOfferType?.() ||
      "bu";
    const offerType = String(rawOfferType).trim().toLowerCase();

    const offerNumber =
      cfg.offerNumberEl()?.value?.trim() ||
      (typeof genOfferNumber === "function" ? genOfferNumber() : "");

    // Ensure pricing snapshot (best-effort)
    let pricing = window.__pricing;
    if (!pricing) {
      try {
        pricing = await cfg.updatePricing?.(filteredPayload);
      } catch {}
    }

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
      console.error("[ExportManager] Failed to save final offer snapshot:", err);
    }
  }

  // ---------- Downloads ----------
  async function downloadPDFWithProgress(endpoint, payload, fallbackFilename) {
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
        showPDFProgress(`Fehler: ${errorData.error || "Unbekannter Fehler"}`, "error");
        if (errorData.detail) {
          setTimeout(() => showPDFProgress(`Details: ${errorData.detail}`, "error"), 1000);
        }
        return;
      }

      const cd = response.headers.get("content-disposition") || "";
      let serverFilename = fallbackFilename || "Angebot.pdf";
      const match = cd.match(/filename="?(.*?)"?$/i);
      if (match && match[1]) serverFilename = match[1];

      showPDFProgress("PDF wird konvertiert (LibreOffice)...", "info");
      const blob = await response.blob();

      clearInterval(timerInterval);
      showPDFProgress("PDF erfolgreich erstellt!", "success");

      // best-effort snapshot after successful export
      try {
        await saveFinalOfferSnapshot();
      } catch {}

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = serverFilename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      setTimeout(() => showPDFProgress("PDF-Download abgeschlossen!", "success"), 500);
    } catch (error) {
      clearInterval(timerInterval);
      showPDFProgress(`Netzwerkfehler: ${error.message}`, "error");
      console.error("[ExportManager] PDF generation failed:", error);
    }
  }

  async function downloadDocx(url, body) {
    console.groupCollapsed("[ExportManager][DOCX DEBUG] POST "+url);
    console.log("request body", body);
    console.groupEnd();
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      console.error("[ExportManager] DOCX download failed", res.status, await res.text());
      throw new Error(`DOCX download failed (${res.status})`);
    }

    const cd = res.headers.get("content-disposition") || "";
    let serverFilename = "Angebot.docx";
    const match = cd.match(/filename="?(.*?)"?$/i);
    if (match && match[1]) serverFilename = match[1];

    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = serverFilename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
  }

  // ---------- Wiring ----------
  function ensureActiveOffer(payload, fallback = "bu") {
    if (!payload) return payload;
    if (!payload.activeOffer) {
      payload.activeOffer =
        cfg.getCurrentOfferType?.() ||
        payload.offerType ||
        payload.currentOfferKey ||
        fallback;
    }
    return payload;
  }

  function goToKundendatenIfInvalid() {
    if (!cfg.requireBereichValid?.()) {
      location.hash = "Kundendaten";
      return false;
    }
    return true;
  }

  function bindButton(id, handler) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("click", (e) => {
      // Keep behavior consistent with legacy code (no preventDefault needed for buttons)
      handler(e).catch((err) => {
        console.error(`[ExportManager] ${id} failed:`, err);
      });
    });
  }

  function init() {
    // expose helpers for other modules / legacy calls
    window.genOfferNumber = window.genOfferNumber || genOfferNumber;
    window.showPDFProgress = window.showPDFProgress || showPDFProgress;
    window.downloadPDFWithProgress = window.downloadPDFWithProgress || downloadPDFWithProgress;
    window.downloadDocx = window.downloadDocx || downloadDocx;
    window.saveFinalOfferSnapshot = window.saveFinalOfferSnapshot || saveFinalOfferSnapshot;

    stampOfferOnExport();

    // Legacy dev buttons
    bindButton("makePdf", async () => {
      if (!goToKundendatenIfInvalid()) return;
      const payload = cfg.buildPayload?.();
      if (!payload) throw new Error("buildPayload() missing");
      await downloadPDFWithProgress("/pdf", payload, "Anfrage.pdf");
      document.getElementById("pdfActions")?.style.setProperty("display", "flex");
    });

    bindButton("downloadPdf", async () => {
      const payload = cfg.buildPayload?.();
      if (!payload) throw new Error("buildPayload() missing");
      await downloadPDFWithProgress("/pdf", payload);
    });

    bindButton("makePdfFromTemplate", async () => {
      if (!goToKundendatenIfInvalid()) return;
      const payload = cfg.buildPayload?.();
      if (!payload) throw new Error("buildPayload() missing");
      await downloadPDFWithProgress("/pdf-template", payload);
      document.getElementById("pdfActions")?.style.setProperty("display", "flex");
    });

    // Main export cards
    bindButton("downloadDocx", async () => {
      if (!goToKundendatenIfInvalid()) return;
      const payload = cfg.buildPayload?.();
      if (!payload) throw new Error("buildPayload() missing");

      // Customer-facing Angebot.docx ONLY:
      // - do NOT mutate payload
      // - do NOT affect Materialübersicht/Kalkulation/Arbeitsbericht exports
      // - try to include a sanitized pricing snapshot for shorter material labels
      const customerBody = await __buildCustomerOfferDocxBody(cfg, payload);
      __debugCustomerDocxDiff(payload, customerBody);

      try {
        await downloadDocx("/docx-template", customerBody);
      } catch (e) {
        // Backward-compatibility fallback: retry with original payload if backend rejects extra keys
        console.warn("[ExportManager] Angebot.docx sanitized body failed; retrying with original payload.", e);
        await downloadDocx("/docx-template", payload);
      }
    });

    bindButton("downloadMaterialOverview", async () => {
      if (!goToKundendatenIfInvalid()) return;
      const payload = cfg.buildPayload?.();
      if (!payload) throw new Error("buildPayload() missing");
      ensureActiveOffer(payload, "bu");
      await downloadDocx("/material-overview", payload);
    });

    bindButton("downloadArbeitsbericht", async () => {
      if (!goToKundendatenIfInvalid()) return;
      const payload = cfg.buildPayload?.();
      if (!payload) throw new Error("buildPayload() missing");
      ensureActiveOffer(payload, "bu");
      await downloadPDFWithProgress("/arbeitsbericht/docx", payload);
    });

    bindButton("downloadLatexPdf", async () => {
      if (!goToKundendatenIfInvalid()) return;
      const payload = cfg.buildPayload?.();
      if (!payload) throw new Error("buildPayload() missing");
      await downloadPDFWithProgress("/latex-template/pdf", payload);
    });

    bindButton("downloadDocxAsPdf", async () => {
      if (!goToKundendatenIfInvalid()) return;
      const payload = cfg.buildPayload?.();
      if (!payload) throw new Error("buildPayload() missing");
      await downloadPDFWithProgress("/docx-template/pdf", payload);
    });

    bindButton("downloadKalkulationDocx", async () => {
      if (!goToKundendatenIfInvalid()) return;
      const payload = cfg.buildPayload?.();
      if (!payload) throw new Error("buildPayload() missing");
      ensureActiveOffer(payload, "bu");
      await downloadDocx("/kalkulation/docx", payload);
    });

    bindButton("downloadKalkulation", async () => {
      if (!goToKundendatenIfInvalid()) return;
      const payload = cfg.buildPayload?.();
      if (!payload) throw new Error("buildPayload() missing");
      ensureActiveOffer(payload, "bu");
      await downloadPDFWithProgress("/kalkulation/pdf", payload);
    });
  }

  init();
  return {
    genOfferNumber,
    stampOfferOnExport,
    showPDFProgress,
    downloadPDFWithProgress,
    downloadDocx,
    saveFinalOfferSnapshot,
  };
}
