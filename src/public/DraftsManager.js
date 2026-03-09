// DraftsManager.js
export function initDraftsManager(options = {}) {
  const cfg = {
    els: {
      input: "#draftSearchInput",
      results: "#draftSearchResults",
      btnLoad: "#btnLoadSelectedDraft",
      status: "#draftStatus", // optional
      summaryWidget: "#summaryWidget",
      summaryActions: "#summaryWidget .sw-actions",
      legacySaveBtn: "#btnSaveDraft",
    },
    apiBase: "/api/drafts",

    // search/load UX
    autoLoadOnClick: true,
    hideResultsAfterLoad: true,
    fillInputAfterLoad: true,

    // dependency callbacks (default to window-based)
    getOfferType: () => window.getCurrentOfferType?.() || "bu",
    applyWizardState: (state) => window.applyWizardState?.(state),
    getPagesForOfferType: (offerType) =>
      window.getPagesForOfferType?.(offerType) ||
      window.getFlowSteps?.() ||
      window.steps ||
      [],
    restoreDoc: (doc) => window.restoreConfiguratorFromOffer?.(doc),
    restoreSnapshot: (payload) =>
      window.restoreConfiguratorFromSnapshot?.({ payload }),
    buildPayload: () => window.buildPayload?.(),
    toast: (msg, type) => window.showToast?.(msg, type) || console.log(type ? `[${type}] ${msg}` : msg),

    ...options,
  };

  const $input = document.querySelector(cfg.els.input);
  const $results = document.querySelector(cfg.els.results);
  const $btnLoad = document.querySelector(cfg.els.btnLoad);
  const $status = cfg.els.status ? document.querySelector(cfg.els.status) : null;
  const $summaryActions = document.querySelector(cfg.els.summaryActions);
  const $legacySaveBtn = document.querySelector(cfg.els.legacySaveBtn);

  let selectedId = null;
  let lastResults = [];
  let lastLoadedDraftMeta = null;
  let modal = null;
  let saveAsBtn = null;
  let duplicateTimer = null;

  const setStatus = (txt) => {
    if ($status) $status.textContent = txt || "";
  };

  function getCustomerParts() {
    const first = (document.getElementById("firstName")?.value || "").trim();
    const last = (document.getElementById("lastName")?.value || "").trim();
    const company = (document.getElementById("company")?.value || "").trim();
    return { first, last, company };
  }

  function slugifyPart(value, fallback = "NA") {
    const out = String(value || "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/ß/g, "ss")
      .replace(/[^A-Za-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return out || fallback;
  }

  function formatDraftTimestamp(date = new Date()) {
    const dd = String(date.getDate()).padStart(2, "0");
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const yyyy = String(date.getFullYear());
    const hh = String(date.getHours()).padStart(2, "0");
    const mi = String(date.getMinutes()).padStart(2, "0");
    const ss = String(date.getSeconds()).padStart(2, "0");
    return `${dd}${mm}${yyyy}-${hh}${mi}${ss}`;
  }

  function buildDraftDefaultName() {
    const offerType = String(cfg.getOfferType() || "bu").trim().toUpperCase();
    const { first, last, company } = getCustomerParts();

    if (first || last) {
      return [
        "ANG",
        offerType,
        slugifyPart(first, "NoName"),
        slugifyPart(last, "NoSurname"),
        formatDraftTimestamp(),
      ].join("-");
    }

    return [
      "ANG",
      offerType,
      slugifyPart(company, "NoCustomer"),
      formatDraftTimestamp(),
    ].join("-");
  }

  function stripLabelFromRow(row) {
    const t = (row?.innerText || "").trim();
    return t.replace(/\s*\([^)]*\)\s*$/, "").trim();
  }

  function setActiveRow(id) {
    selectedId = id || null;
    if (!$results) return;

    const rows = [...$results.querySelectorAll(".draft-result-row")];
    rows.forEach((x) => {
      const active = x.dataset.id === id;
      x.classList.toggle("active", active);
      x.style.background = active ? "#e0e7ff" : "transparent";
    });

    if ($btnLoad) $btnLoad.disabled = !selectedId;
  }

  async function fetchDrafts(query) {
    const offerType = cfg.getOfferType();
    const url = `${cfg.apiBase}/search?q=${encodeURIComponent(
      query || "",
    )}&offerType=${encodeURIComponent(offerType)}`;

    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) throw new Error(`Draft search failed (${res.status})`);
    const data = await res.json();
    return Array.isArray(data?.drafts) ? data.drafts : Array.isArray(data) ? data : [];
  }

  // --- API ---
  async function search(query) {
    if (!$results) return [];
    setStatus("Searching…");
    const drafts = await fetchDrafts(query);
    setStatus("");
    lastResults = drafts;
    renderResults(drafts);
    return drafts;
  }

  async function loadById(id) {
    if (!id) return null;

    setStatus("Loading…");
    const res = await fetch(`${cfg.apiBase}/${encodeURIComponent(id)}`, {
      credentials: "include",
    });
    if (!res.ok) throw new Error(`Draft load failed (${res.status})`);

    const data = await res.json();
    setStatus("");

    const draft = data?.draft || data;
    const payload = draft?.payload || null;

    const rawOfferType =
      draft?.offerType ||
      payload?.activeOffer ||
      payload?.offerType ||
      cfg.getOfferType() ||
      "bu";
    const offerType = String(rawOfferType).trim().toLowerCase();

    const pages = cfg.getPagesForOfferType(offerType);
    const targetStep = (pages && pages[0]) || "home";
    cfg.applyWizardState?.({ offerType, step: targetStep });

    if (typeof cfg.restoreDoc === "function") {
      await cfg.restoreDoc({ offerType, payload, draft });
    } else if (typeof cfg.restoreSnapshot === "function" && payload) {
      await cfg.restoreSnapshot(payload);
    } else {
      throw new Error("No restore function available on window");
    }

    lastLoadedDraftMeta = {
      id: draft?._id || draft?.id || id,
      name: draft?.name || "",
      offerType,
      updatedAt: draft?.updatedAt || null,
    };

    return draft;
  }

  async function saveDraftWithName(name) {
    if (typeof cfg.buildPayload !== "function") {
      throw new Error("Konfigurator-Payload kann nicht gebaut werden.");
    }

    const trimmedName = String(name || "").trim();
    if (!trimmedName) {
      throw new Error("Name darf nicht leer sein.");
    }

    const offerType = cfg.getOfferType();
    const payload = cfg.buildPayload();

    if (!payload) {
      throw new Error("Keine Daten zum Speichern gefunden.");
    }

    const res = await fetch(cfg.apiBase, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        name: trimmedName,
        offerType,
        payload,
      }),
    });

    if (res.status === 409) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || "Ein Entwurf mit diesem Namen existiert bereits.");
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || "Fehler beim Speichern des Entwurfs.");
    }

    const data = await res.json().catch(() => ({}));
    const newId = data?.id || data?._id || data?.draft?._id || data?.draft?.id || null;
    lastLoadedDraftMeta = {
      id: newId,
      name: trimmedName,
      offerType: String(offerType || "bu").toLowerCase(),
      updatedAt: new Date().toISOString(),
    };

    return data;
  }

  async function quickSaveCurrentDraft() {
    const name = buildDraftDefaultName();
    await saveDraftWithName(name);
    cfg.toast?.(`Entwurf gespeichert: ${name}`, "success");
    return name;
  }

  function ensureModalStyles() {
    if (document.getElementById("drafts-manager-inline-styles")) return;
    const style = document.createElement("style");
    style.id = "drafts-manager-inline-styles";
    style.textContent = `
      .summary-widget .sw-actions.sw-actions--drafts {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        justify-content: flex-end;
      }
      .summary-widget .sw-save-btn.sw-save-btn--secondary {
        background: transparent;
        color: var(--text);
      }
      .summary-widget .sw-save-btn.sw-save-btn--secondary:hover,
      .summary-widget .sw-save-btn.sw-save-btn--secondary:focus-visible {
        background: var(--accent-weak);
        color: var(--accent-strong);
      }
      .dm-overlay {
        position: fixed;
        inset: 0;
        display: none;
        align-items: center;
        justify-content: center;
        background: rgba(15, 23, 42, 0.5);
        z-index: 10020;
        padding: 20px;
      }
      .dm-overlay.is-open { display: flex; }
      .dm-dialog {
        width: min(680px, calc(100vw - 32px));
        max-height: min(86vh, 820px);
        overflow: auto;
        background: var(--panel);
        color: var(--text);
        border: 1px solid var(--border);
        border-radius: 18px;
        box-shadow: 0 24px 60px rgba(15, 23, 42, 0.45);
        padding: 18px;
      }
      .dm-header { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; margin-bottom: 14px; }
      .dm-title { margin: 0; font-size: 1.08rem; font-weight: 700; }
      .dm-subtitle { margin: 6px 0 0; color: var(--muted); font-size: .92rem; }
      .dm-close {
        border: 1px solid var(--border);
        background: transparent;
        color: var(--text);
        border-radius: 999px;
        width: 34px;
        height: 34px;
        display:grid;
        place-items:center;
        cursor:pointer;
        flex: 0 0 auto;
      }
      .dm-body { display:grid; gap: 14px; }
      .dm-field { display:grid; gap: 8px; }
      .dm-label { font-weight: 600; }
      .dm-input {
        width: 100%;
        padding: 12px 14px;
        border-radius: 12px;
        border: 1px solid var(--input-border, var(--border));
        background: var(--input-bg, var(--panel));
        color: var(--text);
        font: inherit;
      }
      .dm-input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--ring); }
      .dm-help { color: var(--muted); font-size: .88rem; }
      .dm-suggestions {
        display: grid;
        gap: 10px;
        border: 1px solid var(--border);
        border-radius: 14px;
        padding: 12px;
        background: color-mix(in srgb, var(--panel) 90%, transparent);
      }
      .dm-suggestions-head { display:flex; align-items:center; justify-content:space-between; gap:12px; }
      .dm-suggestions-title { font-weight: 700; }
      .dm-suggestions-sub { color: var(--muted); font-size: .86rem; }
      .dm-suggestions-list { display:grid; gap:8px; }
      .dm-suggestion {
        width: 100%;
        text-align: left;
        border: 1px solid var(--border);
        background: var(--card, var(--panel));
        color: var(--text);
        border-radius: 12px;
        padding: 10px 12px;
        cursor: pointer;
      }
      .dm-suggestion:hover, .dm-suggestion:focus-visible {
        border-color: var(--accent);
        box-shadow: 0 0 0 2px var(--ring);
      }
      .dm-suggestion-name { display:block; font-weight: 700; color: var(--accent-strong); }
      .dm-suggestion-meta { display:block; margin-top: 4px; color: var(--muted); font-size: .83rem; }
      .dm-empty, .dm-loading, .dm-error {
        padding: 10px 12px;
        border-radius: 12px;
        font-size: .9rem;
      }
      .dm-empty { color: var(--muted); background: color-mix(in srgb, var(--panel) 94%, transparent); border: 1px dashed var(--border); }
      .dm-loading { color: var(--muted); background: color-mix(in srgb, var(--panel) 94%, transparent); border: 1px dashed var(--border); }
      .dm-error { color: #b91c1c; background: rgba(239, 68, 68, .08); border: 1px solid rgba(239, 68, 68, .18); }
      .dm-footer { display:flex; justify-content:flex-end; gap: 8px; margin-top: 6px; flex-wrap: wrap; }
      .dm-btn-secondary {
        background: transparent;
        color: var(--text);
        border: 1px solid var(--border);
      }
      .dm-btn-primary {
        background: var(--accent);
        color: #fff;
        border: 1px solid var(--accent);
      }
      .dm-btn-primary[disabled] { opacity: .6; cursor: not-allowed; }
      .dm-confirm {
        border-top: 1px solid var(--border);
        padding-top: 12px;
        display:none;
        gap: 10px;
      }
      .dm-confirm.is-open { display:grid; }
      .dm-confirm-card {
        border: 1px solid rgba(239, 68, 68, .28);
        background: rgba(239, 68, 68, .10);
        border-radius: 14px;
        padding: 12px;
      }
      .dm-confirm-title { margin: 0 0 6px; font-weight: 700; }
      .dm-confirm-copy { margin: 0; color: var(--muted); font-size: .92rem; }
      .dm-confirm-actions { display:flex; justify-content:flex-end; gap:8px; flex-wrap:wrap; }
      @media (max-width: 640px) {
        .dm-dialog { padding: 14px; border-radius: 16px; }
        .dm-footer, .dm-confirm-actions { justify-content: stretch; }
        .dm-footer button, .dm-confirm-actions button { width: 100%; }
      }
    `;
    document.head.appendChild(style);
  }

  function ensureWidgetButtons() {
    if (!$summaryActions) return;
    ensureModalStyles();

    $summaryActions.classList.add("sw-actions--drafts");

    if ($legacySaveBtn) {
      $legacySaveBtn.textContent = "⚡ Schnellspeichern";
      $legacySaveBtn.title = "Sofort mit automatisch generiertem Namen speichern";
    }

    if (!document.getElementById("btnSaveDraftAs")) {
      saveAsBtn = document.createElement("button");
      saveAsBtn.type = "button";
      saveAsBtn.id = "btnSaveDraftAs";
      saveAsBtn.className = "sw-save-btn sw-save-btn--secondary";
      saveAsBtn.textContent = "💾 Speichern unter";
      saveAsBtn.title = "Entwurf mit eigenem Namen speichern";
      $summaryActions.appendChild(saveAsBtn);
    } else {
      saveAsBtn = document.getElementById("btnSaveDraftAs");
    }
  }

  function ensureModal() {
    if (modal) return modal;
    ensureModalStyles();

    modal = document.createElement("div");
    modal.className = "dm-overlay";
    modal.id = "draftSaveOverlay";
    modal.innerHTML = `
      <div class="dm-dialog" role="dialog" aria-modal="true" aria-labelledby="dmTitle">
        <div class="dm-header">
          <div>
            <h3 id="dmTitle" class="dm-title">Entwurf speichern</h3>
            <p class="dm-subtitle">Quick Save für sofortiges Speichern. Save As für eigenen Namen und bessere Übersicht.</p>
          </div>
          <button type="button" class="dm-close" id="dmCloseBtn" aria-label="Dialog schließen">✕</button>
        </div>

        <div class="dm-body">
          <div class="dm-field">
            <label for="dmNameInput" class="dm-label">Name des Entwurfs</label>
            <input id="dmNameInput" class="dm-input" type="text" autocomplete="off" />
            <div class="dm-help" id="dmNameHelp">Vorschlag basiert auf Angebotsart, Kunde und aktuellem Zeitpunkt.</div>
          </div>

          <div class="dm-suggestions">
            <div class="dm-suggestions-head">
              <div>
                <div class="dm-suggestions-title">Bereits vorhandene ähnliche Entwürfe</div>
                <div class="dm-suggestions-sub">Vor dem Speichern siehst du direkt passende Namen, damit keine Verwechslungen entstehen.</div>
              </div>
            </div>
            <div id="dmSuggestionsList" class="dm-suggestions-list">
              <div class="dm-empty">Tippe einen Namen ein, um ähnliche Entwürfe anzuzeigen.</div>
            </div>
          </div>

          <div id="dmConfirmCancel" class="dm-confirm" aria-live="polite">
            <div class="dm-confirm-card">
              <h4 class="dm-confirm-title">Sind Sie wirklich sicher, dass Sie diesen Entwurf nicht speichern möchten?</h4>
              <p class="dm-confirm-copy">Mit „Nicht speichern“ schließen Sie den Dialog ohne Speichern. Mit „Weiter bearbeiten“ kehren Sie zum Entwurf zurück.</p>
            </div>
            <div class="dm-confirm-actions">
              <button type="button" class="dm-btn-secondary" id="dmBackToEditBtn">Weiter bearbeiten</button>
              <button type="button" class="dm-btn-danger" id="dmDiscardBtn">Nicht speichern</button>
            </div>
          </div>

          <div class="dm-footer">
            <button type="button" class="dm-btn-secondary" id="dmCancelBtn">Abbrechen</button>
            <button type="button" class="dm-btn-primary" id="dmSaveBtn">Speichern</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const onOverlayClick = (e) => {
      if (e.target === modal) requestCloseModal();
    };
    modal.addEventListener("click", onOverlayClick);

    modal.querySelector("#dmCloseBtn")?.addEventListener("click", requestCloseModal);
    modal.querySelector("#dmCancelBtn")?.addEventListener("click", requestCloseModal);
    modal.querySelector("#dmBackToEditBtn")?.addEventListener("click", () => setCancelConfirmVisible(false));
    modal.querySelector("#dmDiscardBtn")?.addEventListener("click", closeModalNow);

    modal.querySelector("#dmSaveBtn")?.addEventListener("click", async () => {
      const input = modal.querySelector("#dmNameInput");
      const btn = modal.querySelector("#dmSaveBtn");
      const value = String(input?.value || "").trim();
      if (!value) {
        input?.focus();
        renderDuplicateState({ type: "error", message: "Bitte geben Sie einen Namen für den Entwurf ein." });
        return;
      }

      try {
        btn.disabled = true;
        await saveDraftWithName(value);
        cfg.toast?.(`Entwurf gespeichert: ${value}`, "success");
        closeModalNow();
      } catch (e) {
        console.error(e);
        renderDuplicateState({ type: "error", message: e.message || String(e) });
      } finally {
        btn.disabled = false;
      }
    });

    modal.querySelector("#dmNameInput")?.addEventListener("input", () => {
      setCancelConfirmVisible(false);
      scheduleDuplicateSearch();
    });

    document.addEventListener("keydown", (e) => {
      if (!modal?.classList.contains("is-open")) return;
      if (e.key === "Escape") {
        e.preventDefault();
        requestCloseModal();
      }
    });

    return modal;
  }

  function renderDuplicateState(state) {
    const wrap = ensureModal().querySelector("#dmSuggestionsList");
    if (!wrap) return;

    if (state.type === "loading") {
      wrap.innerHTML = `<div class="dm-loading">Suche nach ähnlichen Entwürfen…</div>`;
      return;
    }
    if (state.type === "error") {
      wrap.innerHTML = `<div class="dm-error">${String(state.message || "Fehler bei der Suche.")}</div>`;
      return;
    }
    if (state.type === "empty") {
      wrap.innerHTML = `<div class="dm-empty">${String(state.message || "Keine ähnlichen Entwürfe gefunden.")}</div>`;
      return;
    }

    const list = Array.isArray(state.items) ? state.items : [];
    if (!list.length) {
      wrap.innerHTML = `<div class="dm-empty">Keine ähnlichen Entwürfe gefunden.</div>`;
      return;
    }

    wrap.innerHTML = "";
    list.forEach((d) => {
      const id = d?._id || d?.id || "";
      const name = d?.name || d?.title || id;
      const updated = d?.updatedAt ? new Date(d.updatedAt).toLocaleString("de-DE") : "";

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "dm-suggestion";
      btn.dataset.id = id;
      btn.innerHTML = `
        <span class="dm-suggestion-name">${escapeHtml(String(name))}</span>
        <span class="dm-suggestion-meta">${updated ? `Zuletzt gespeichert: ${escapeHtml(updated)}` : "Vorhandener Entwurf"}</span>
      `;
      btn.addEventListener("click", () => {
        const input = modal?.querySelector("#dmNameInput");
        if (input) {
          input.value = name;
          input.focus();
          input.select();
        }
      });
      wrap.appendChild(btn);
    });
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }


  function getDuplicateSearchTerms(query) {
    const terms = new Set();
    const q = String(query || "").trim();
    if (q) terms.add(q);

    const parts = getCustomerParts();
    const customerLast = String(parts.last || "").trim();
    if (customerLast) terms.add(customerLast);

    // also try to extract the surname-like token from generated names such as:
    // ANG-BU-Barbara-Niebler-06032026-161938
    const generatedMatch = q.match(/^ANG-[A-Z0-9]+-[^-]+-([^-]+)-\d{8}-\d{6}$/i);
    if (generatedMatch?.[1]) terms.add(generatedMatch[1]);

    // fallback: use second-to-last token if the string is dash separated
    const dashParts = q.split("-").map((x) => x.trim()).filter(Boolean);
    if (dashParts.length >= 2) {
      const candidate = dashParts[dashParts.length - 2];
      if (candidate && !/^\d{6,}$/.test(candidate)) terms.add(candidate);
    }

    return [...terms].filter(Boolean);
  }

  function mergeUniqueDrafts(groups) {
    const seen = new Set();
    const out = [];
    for (const group of groups) {
      for (const d of Array.isArray(group) ? group : []) {
        const id = d?._id || d?.id || d?.name;
        if (!id || seen.has(id)) continue;
        seen.add(id);
        out.push(d);
      }
    }
    return out;
  }

  async function updateDuplicateSuggestions(query) {
    const q = String(query || "").trim();
    if (!q) {
      renderDuplicateState({ type: "empty", message: "Tippe einen Namen ein, um ähnliche Entwürfe anzuzeigen." });
      return;
    }

    renderDuplicateState({ type: "loading" });
    try {
      const terms = getDuplicateSearchTerms(q);
      const batches = await Promise.all(terms.map((term) => fetchDrafts(term)));
      const drafts = mergeUniqueDrafts(batches);

      const exact = drafts.filter((d) => String(d?.name || "").toLowerCase() === q.toLowerCase());
      const similar = drafts.filter((d) => String(d?.name || "").toLowerCase() !== q.toLowerCase());

      renderDuplicateState({ items: [...exact, ...similar].slice(0, 8) });
    } catch (e) {
      console.error(e);
      renderDuplicateState({ type: "error", message: e.message || "Fehler bei der Suche nach vorhandenen Entwürfen." });
    }
  }

  function scheduleDuplicateSearch() {
    clearTimeout(duplicateTimer);
    const input = modal?.querySelector("#dmNameInput");
    duplicateTimer = setTimeout(() => updateDuplicateSuggestions(input?.value || ""), 180);
  }

  function setCancelConfirmVisible(open) {
    const box = ensureModal().querySelector("#dmConfirmCancel");
    if (!box) return;
    box.classList.toggle("is-open", !!open);
  }

  function openSaveAsModal() {
    const node = ensureModal();
    const input = node.querySelector("#dmNameInput");
    const hint = node.querySelector("#dmNameHelp");
    const defaultName = buildDraftDefaultName();

    if (input) input.value = defaultName;
    if (hint) {
      hint.textContent = lastLoadedDraftMeta?.name
        ? `Zuletzt geladener Entwurf: ${lastLoadedDraftMeta.name}. Du kannst hier einen neuen Namen vergeben.`
        : "Vorschlag basiert auf Angebotsart, Kunde und aktuellem Zeitpunkt.";
    }

    setCancelConfirmVisible(false);
    node.classList.add("is-open");
    node.setAttribute("aria-hidden", "false");
    renderDuplicateState({ type: "loading" });
    updateDuplicateSuggestions(defaultName);
    setTimeout(() => {
      input?.focus();
      input?.select();
    }, 0);
  }

  function closeModalNow() {
    if (!modal) return;
    setCancelConfirmVisible(false);
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
  }

  function requestCloseModal() {
    if (!modal?.classList.contains("is-open")) return;
    setCancelConfirmVisible(true);
  }

  function renderResults(drafts) {
    if (!$results) return;

    $results.innerHTML = "";
    setActiveRow(null);
    $results.style.display = "block";

    if (!drafts.length) {
      $results.innerHTML = `<div class="muted" style="padding:6px 10px;">Keine Entwürfe gefunden.</div>`;
      return;
    }

    drafts.forEach((d) => {
      const id = d?._id || d?.id || d?.draftId || "";
      const label = d?.title || d?.name || d?.offerNumber || d?.createdAt || id;

      const row = document.createElement("button");
      row.type = "button";
      row.className = "draft-result-row";
      row.dataset.id = id;
      row.style.display = "block";
      row.style.width = "100%";
      row.style.textAlign = "left";
      row.style.padding = "4px 10px";
      row.style.border = "none";
      row.style.background = "transparent";
      row.style.cursor = "pointer";
      row.style.color = "var(--text)";

      row.onmouseenter = () => {
        if (!row.classList.contains("active")) row.style.background = "#eef2ff";
      };
      row.onmouseleave = () => {
        row.style.background = row.classList.contains("active") ? "#e0e7ff" : "transparent";
      };

      const updated = d?.updatedAt ? new Date(d.updatedAt).toLocaleString("de-DE") : "";
      row.innerHTML =
        `<strong style="color:var(--accent-strong);">${escapeHtml(String(label))}</strong>` +
        (updated ? ` <span style="font-size:0.85em; color:#6b7280;">(${escapeHtml(updated)})</span>` : "");

      row.addEventListener("click", async () => {
        setActiveRow(id);
        if (!cfg.autoLoadOnClick) return;

        try {
          await loadById(id);
          if (cfg.fillInputAfterLoad) $input.value = stripLabelFromRow(row);
          if (cfg.hideResultsAfterLoad) $results.style.display = "none";
          cfg.toast?.("Entwurf geladen", "info");
        } catch (e) {
          console.error(e);
          cfg.toast?.(`Entwurf konnte nicht geladen werden: ${e.message || e}`, "error");
        }
      });

      $results.appendChild(row);
    });
  }

  // expose/save APIs to legacy boot code
  window.buildDraftDefaultName = buildDraftDefaultName;
  window.quickSaveDraft = quickSaveCurrentDraft;
  window.saveCurrentDraft = quickSaveCurrentDraft; // legacy btnSaveDraft becomes Quick Save
  window.openSaveDraftAs = openSaveAsModal;
  window.searchDraftsForCurrentOfferType = search;
  window.loadDraftById = loadById;

  ensureWidgetButtons();
  ensureModal();

  if (saveAsBtn && saveAsBtn.dataset.bound !== "1") {
    saveAsBtn.dataset.bound = "1";
    saveAsBtn.addEventListener("click", openSaveAsModal);
  }

  // Search as user types (debounced)
  if ($input && $results) {
    let t = null;
    $input.addEventListener("input", () => {
      clearTimeout(t);
      t = setTimeout(async () => {
        try {
          const q = $input.value.trim();
          await search(q);
          $results.style.display = "block";
        } catch (e) {
          console.error(e);
          cfg.toast?.(`Draft search failed: ${e.message || e}`, "error");
        }
      }, 250);
    });
  }

  if ($btnLoad) {
    $btnLoad.addEventListener("click", async () => {
      try {
        if (!selectedId) return;
        await loadById(selectedId);
        if (cfg.hideResultsAfterLoad && $results) $results.style.display = "none";
        cfg.toast?.("Entwurf geladen", "info");
      } catch (e) {
        console.error(e);
        cfg.toast?.(`Draft load failed: ${e.message || e}`, "error");
      }
    });
  }

  if ($input && $results && $btnLoad) {
    document.addEventListener("click", (e) => {
      const target = e.target;
      const inBox =
        target === $input ||
        $input.contains(target) ||
        target === $results ||
        $results.contains(target) ||
        target === $btnLoad ||
        $btnLoad.contains(target);
      if (!inBox) $results.style.display = "none";
    });
  }

  return {
    search,
    loadById,
    quickSaveCurrentDraft,
    openSaveAsModal,
    saveDraftWithName,
    buildDraftDefaultName,
    getLastLoadedDraft: () => ({ ...lastLoadedDraftMeta }),
  };
}
