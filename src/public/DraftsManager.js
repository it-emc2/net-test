// DraftsManager.js
export function initDraftsManager(options = {}) {
  const cfg = {
    els: {
      input: "#draftSearchInput",
      results: "#draftSearchResults",
      btnLoad: "#btnLoadSelectedDraft",
      status: "#draftStatus", // optional
    },
    apiBase: "/api/drafts",

    // ✅ old UX: click suggestion loads immediately
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
    toast: (msg) => window.showToast?.(msg) || console.log(msg),

    ...options,
  };

  const $input = document.querySelector(cfg.els.input);
  const $results = document.querySelector(cfg.els.results);
  const $btnLoad = document.querySelector(cfg.els.btnLoad);
  const $status = cfg.els.status ? document.querySelector(cfg.els.status) : null;

  if (!$input || !$results || !$btnLoad) {
    console.warn("[DraftsManager] Missing DOM nodes, skipping init");
    return { search: async () => [], loadById: async () => null };
  }

  let selectedId = null;
  let lastResults = [];

  const setStatus = (txt) => {
    if ($status) $status.textContent = txt || "";
  };

  function setActiveRow(id) {
    selectedId = id || null;

    const rows = [...$results.querySelectorAll(".draft-result-row")];
    rows.forEach((x) => {
      const active = x.dataset.id === id;
      x.classList.toggle("active", active);
      x.style.background = active ? "#e0e7ff" : "transparent";
    });

    $btnLoad.disabled = !selectedId;
  }

  function stripLabelFromRow(row) {
    // row contains HTML; innerText gives just the visible text
    const t = (row?.innerText || "").trim();
    // remove trailing "(...date...)" if present
    return t.replace(/\s*\([^)]*\)\s*$/, "").trim();
  }

  // --- API ---
  async function search(query) {
    const offerType = cfg.getOfferType();
    const url = `${cfg.apiBase}/search?q=${encodeURIComponent(
      query || "",
    )}&offerType=${encodeURIComponent(offerType)}`;

    setStatus("Searching…");
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) throw new Error(`Draft search failed (${res.status})`);
    const data = await res.json();
    setStatus("");

    const drafts = Array.isArray(data?.drafts)
      ? data.drafts
      : Array.isArray(data)
        ? data
        : [];

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

    // Support multiple backend shapes:
    // - { draft: { payload, offerType, ... } }
    // - { payload, offerType, ... }
    const draft = data?.draft || data;
    const payload = draft?.payload || null;

    // Determine offerType robustly
    const rawOfferType =
      draft?.offerType ||
      payload?.activeOffer ||
      payload?.offerType ||
      cfg.getOfferType() ||
      "bu";
    const offerType = String(rawOfferType).trim().toLowerCase();

    // Navigate to correct first step BEFORE restore (so correct form is visible)
    const pages = cfg.getPagesForOfferType(offerType);
    const targetStep = (pages && pages[0]) || "home";
    cfg.applyWizardState?.({ offerType, step: targetStep });

    // Restore via doc if possible, otherwise via snapshot
    if (typeof cfg.restoreDoc === "function") {
      // mimic offer doc shape: RestoreManager normalizes anyway
      await cfg.restoreDoc({ offerType, payload, draft });
      return draft;
    }
    if (typeof cfg.restoreSnapshot === "function" && payload) {
      await cfg.restoreSnapshot(payload);
      return draft;
    }

    throw new Error("No restore function available on window");
  }

  // --- UI ---
  function renderResults(drafts) {
    $results.innerHTML = "";
    setActiveRow(null);

    // index.html keeps this container hidden by default
    // so we must explicitly show/hide it here.
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

      // match your previous inline styling
      row.style.display = "block";
      row.style.width = "100%";
      row.style.textAlign = "left";
      row.style.padding = "4px 10px";
      row.style.border = "none";
      row.style.background = "transparent";
      row.style.cursor = "pointer";
      row.style.color = "var(--text)";

      row.onmouseenter = () => {
        // don't override active background
        if (!row.classList.contains("active")) row.style.background = "#eef2ff";
      };
      row.onmouseleave = () => {
        row.style.background = row.classList.contains("active")
          ? "#e0e7ff"
          : "transparent";
      };

      const updated = d?.updatedAt
        ? new Date(d.updatedAt).toLocaleString("de-DE")
        : "";

      row.innerHTML =
        `<strong style="color:var(--accent-strong);">${String(label)}</strong>` +
        (updated
          ? ` <span style="font-size:0.85em; color:#6b7280;">(${updated})</span>`
          : "");

      row.addEventListener("click", async () => {
        setActiveRow(id);

        if (!cfg.autoLoadOnClick) return;

        try {
          await loadById(id);

          if (cfg.fillInputAfterLoad) {
            $input.value = stripLabelFromRow(row);
          }
          if (cfg.hideResultsAfterLoad) {
            $results.style.display = "none";
          }

          cfg.toast?.("Draft loaded");
        } catch (e) {
          console.error(e);
          cfg.toast?.(`Draft load failed: ${e.message || e}`);
        }
      });

      $results.appendChild(row);
    });
  }

  // Search as user types (debounced)
  let t = null;
  $input.addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(async () => {
      try {
        const q = $input.value.trim();
        await search(q);

        // show results when user types
        $results.style.display = "block";
      } catch (e) {
        console.error(e);
        cfg.toast?.(`Draft search failed: ${e.message || e}`);
      }
    }, 250);
  });

  // Load selected (button still works)
  $btnLoad.addEventListener("click", async () => {
    try {
      if (!selectedId) return;
      await loadById(selectedId);

      if (cfg.hideResultsAfterLoad) $results.style.display = "none";
      cfg.toast?.("Draft loaded");
    } catch (e) {
      console.error(e);
      cfg.toast?.(`Draft load failed: ${e.message || e}`);
    }
  });

  // Optional: click outside closes results
  document.addEventListener("click", (e) => {
    const inBox =
      e.target === $input ||
      $input.contains(e.target) ||
      e.target === $results ||
      $results.contains(e.target) ||
      e.target === $btnLoad ||
      $btnLoad.contains(e.target);

    if (!inBox) $results.style.display = "none";
  });

  // expose small API
  return { search, loadById };
}