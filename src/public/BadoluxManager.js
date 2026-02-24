// BadoluxManager.js
// Budget mode widget for Duschwanne + Badolux budget floors.
// Extracted from legacy (function initBadoluxBudgetFrontend(){...}) IIFE in script.js

export function initBadoluxManager(options = {}) {
  const cfg = {
    sessionKey: "dw_budget_mode",
    apiBase: "/api",
    assetsBase: "./assets/budget",
    els: {
      toggle: "#budgetToggle",
      duschwanneForm: "#form-duschwanne",
      flooringBudgetGroup: "#flooringBudgetGroup",
      flooringBudgetOptions: "#flooringBudgetOptions",
      flooringBudgetEmpty: "#flooringBudgetEmpty",
    },
    hooks: {
      // optional external hooks
      setWvBudgetVisibility: null,
      renderBudgetWvColors: null,
      refreshTray: null,
      updatePricing: null,
    },
    ...options,
  };

  const $ = (sel) => (sel ? document.querySelector(sel) : null);

  const getToggle = () => $(cfg.els.toggle);
  const isOn = () => !!getToggle()?.checked;

  function applyBudgetModeUI(on) {
    const form = $(cfg.els.duschwanneForm);
    if (form) form.classList.toggle("budget-mode", !!on);
  }

  function swapAccessoryImages(on) {
    // keep mapping identical to legacy
    const map = {
      TRWDB: `${cfg.assetsBase}/BL-Dichtband.png`,
      TRWDSET5: `${cfg.assetsBase}/BL-Dichtbahn.png`,
      PLA5282: `${cfg.assetsBase}/BL-Stelzlager.png`,
      AGD9060: `${cfg.assetsBase}/AGB001.png`,
      KM02: `${cfg.assetsBase}/AC004.png`,
    };

    Object.entries(map).forEach(([pid, budgetSrc]) => {
      const label =
        document.querySelector(`label[data-product-id="${pid}"]`) ||
        document.querySelector(`[data-product-id="${pid}"]`);
      const img =
        label?.querySelector("img") ||
        document.querySelector(`img[data-product-id="${pid}"]`);
      if (!img) return;

      // store original once
      if (!img.dataset.srcOriginal) {
        img.dataset.srcOriginal = img.getAttribute("src") || "";
      }

      if (on) {
        img.src = budgetSrc;
        img.onerror = () => {
          // fall back to original if asset missing
          if (img.dataset.srcOriginal) img.src = img.dataset.srcOriginal;
        };
      } else {
        if (img.dataset.srcOriginal) img.src = img.dataset.srcOriginal;
      }
    });
  }

  // ===== Budget Fußboden group =====
  let budgetFloorsCache = null;
  let budgetFloorsLoading = null;
  let floorRenderToken = 0;

  function normalizeSource(v) {
    return String(v || "").trim().toLowerCase();
  }
  function startsWithBP(v) {
    return String(v || "").toUpperCase().startsWith("BP");
  }
  function budgetFloorImgFor(pid) {
    return `${cfg.assetsBase}/${pid}.png`;
  }

  async function loadBudgetFloorsFromBackend() {
    if (budgetFloorsCache) return budgetFloorsCache;
    if (budgetFloorsLoading) return budgetFloorsLoading;

    budgetFloorsLoading = (async () => {
      // Preferred (once backend supports params)
      let data = null;
      try {
        const res = await fetch(
          `${cfg.apiBase}/products?prefix=BP&source=badolux&limit=200`,
          { credentials: "include" },
        );
        if (res.ok) data = await res.json().catch(() => null);
      } catch {}

      // Frontend-first fallback: use search and filter client-side
      if (!Array.isArray(data)) {
        try {
          const res2 = await fetch(`${cfg.apiBase}/products?q=BP`, {
            credentials: "include",
          });
          if (res2.ok) data = await res2.json().catch(() => []);
          else data = [];
        } catch {
          data = [];
        }
      }

      const filtered = (Array.isArray(data) ? data : [])
        .filter(
          (p) => startsWithBP(p?.productId) && normalizeSource(p?.source) === "badolux",
        )
        .sort((a, b) => String(a?.productId).localeCompare(String(b?.productId)));

      budgetFloorsCache = filtered.map((p) => ({
        productId: p.productId,
        name: p.name || p.productId,
        img: budgetFloorImgFor(p.productId),
      }));

      return budgetFloorsCache;
    })();

    return budgetFloorsLoading;
  }

  async function renderBudgetFloors() {
    const group = $(cfg.els.flooringBudgetGroup);
    const wrap = $(cfg.els.flooringBudgetOptions);
    const empty = $(cfg.els.flooringBudgetEmpty);
    if (!group || !wrap) return;

    wrap.innerHTML = "";

    const list = await loadBudgetFloorsFromBackend();
    const has = Array.isArray(list) && list.length > 0;

    if (!has) {
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;

    for (const item of list) {
      const pid = item.productId;
      const name = item.name || pid;

      const label = document.createElement("label");
      label.className = "image-check";
      label.setAttribute("data-product-id", pid);

      const input = document.createElement("input");
      input.type = "checkbox";
      input.name = "flooringProduct[]";
      input.value = `${pid}|${name}`;
      input.setAttribute("data-product-id", pid);
      input.setAttribute("data-color", name);

      const imgWrap = document.createElement("span");
      imgWrap.className = "img-wrap";

      const image = document.createElement("img");
      image.loading = "lazy";
      image.alt = `Budget Fußboden — ${name}`;
      image.src = item.img || "";
      image.onerror = () => {
        // if image missing, hide wrapper
        imgWrap.style.display = "none";
      };

      imgWrap.appendChild(image);

      const caption = document.createElement("span");
      caption.className = "caption";
      caption.textContent = name;

      label.appendChild(input);
      label.appendChild(imgWrap);
      label.appendChild(caption);

      wrap.appendChild(label);
    }
  }

  async function updateBudgetFloorVisibility() {
    const group = $(cfg.els.flooringBudgetGroup);
    if (!group) return;
    const on = isOn();
    group.hidden = !on;
    group.setAttribute("aria-hidden", (!on).toString());
    if (on) await renderBudgetFloors();
  }

  function applyAll(on) {
    applyBudgetModeUI(on);
    swapAccessoryImages(on);
    updateBudgetFloorVisibility();

    // WV budget hooks (optional)
    cfg.hooks.setWvBudgetVisibility?.(!!on);
    if (on) cfg.hooks.renderBudgetWvColors?.();

    // smart tray refresh (optional)
    cfg.hooks.refreshTray?.();

    // pricing refresh (optional)
    cfg.hooks.updatePricing?.();
  }

  function bindOnce() {
    const el = getToggle();
    if (!el) return { ok: false, reason: "missing toggle" };

    // Restore session preference only if the checkbox doesn't already have a value from restored offers
    if (!el.dataset.budgetInit) {
      try {
        const saved = sessionStorage.getItem(cfg.sessionKey);
        if (saved === "1" && !el.checked) el.checked = true;
      } catch {}
      el.dataset.budgetInit = "1";
    }

    // apply once
    applyAll(el.checked);
    if (window.__DEBUG_MANAGERS__) console.log('[BadoluxManager] applyAll initial:', el.checked);

    // bind once
    if (el.dataset.boundBudget === "1") {
      return { ok: true, alreadyBound: true };
    }
    el.dataset.boundBudget = "1";

    el.addEventListener("change", () => {
      try {
        sessionStorage.setItem(cfg.sessionKey, el.checked ? "1" : "0");
      } catch {}
      if (window.__DEBUG_MANAGERS__) console.log('[BadoluxManager] toggle changed:', el.checked);
      applyAll(el.checked);
    });

    return { ok: true };
  }

  // public API
  const api = {
    ok: false,
    isOn,
    refresh: async () => {
      await updateBudgetFloorVisibility();
    },
    setEnabled: (on, { persist = true, notify = true } = {}) => {
      const el = getToggle();
      if (!el) return;
      el.checked = !!on;
      if (persist) {
        try { sessionStorage.setItem(cfg.sessionKey, el.checked ? "1" : "0"); } catch {}
      }
      if (notify) {
        el.dispatchEvent(new Event("change", { bubbles: true }));
      } else {
        applyAll(!!on);
      }
    },
    resetCache: () => {
      budgetFloorsCache = null;
      budgetFloorsLoading = null;
    },
    // expose internals for debugging
    _renderBudgetFloors: renderBudgetFloors,
    _loadBudgetFloorsFromBackend: loadBudgetFloorsFromBackend,
  };

  const res = bindOnce();
  api.ok = !!res?.ok;
  api.reason = res?.reason;
  api.alreadyBound = !!res?.alreadyBound;

  return api;
}
