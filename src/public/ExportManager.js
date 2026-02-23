// ExportManager.js
// Decouples export/download logic from script.js (classic script) into an ES module.
// Usage in script.js (classic):
//   window.__exportReady = (async()=>{ const { initExportManager } = await import("./ExportManager.js"); initExportManager(); })();

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
      await downloadDocx("/docx-template", payload);
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
