// BadoluxLegacyFallback.js
// Extracted from legacy script.js initBadoluxBudgetFrontend IIFE.
// Transitional fallback only. Prefer BadoluxManager when enabled.

export function bootBadoluxLegacyFallback() {
  if (window.__FEATURES__?.badoluxManager) {
    if (window.__DEBUG_MANAGERS__) console.log("[Badolux legacy] skipped (BadoluxManager enabled)");
    return { skipped: true, reason: "BadoluxManager enabled" };
  }

  const SESSION_KEY = "dw_budget_mode";

  const getToggle = () => document.getElementById("budgetToggle");
  const isOn = () => !!getToggle()?.checked;

  function applyBudgetModeUI(on) {
    const form = document.getElementById("form-duschwanne");
    if (form) form.classList.toggle("budget-mode", !!on);
  }

  function swapAccessoryImages(on) {
    const map = {
      TRWDB: "./assets/budget/BL-Dichtband.png",
      TRWDSET5: "./assets/budget/BL-Dichtbahn.png",
      PLA5282: "./assets/budget/BL-Stelzlager.png",
        AGD9060: "./assets/budget/AGB001.png",
          KM02: "./assets/budget/AC004.png",
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
      if (!img.dataset.srcOriginal) img.dataset.srcOriginal = img.getAttribute("src") || "";

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

  // ===== Budget Fußboden (Option A): extra group =====
  let budgetFloorsCache = null;
  let budgetFloorsLoading = null;

  function normalizeSource(v) {
    return String(v || "").trim().toLowerCase();
  }
  function startsWithBP(v) {
    return String(v || "").toUpperCase().startsWith("BP");
  }
  function budgetFloorImgFor(pid) {
    return `./assets/budget/${pid}.png`;
  }

  async function loadBudgetFloorsFromBackend() {
    if (budgetFloorsCache) return budgetFloorsCache;
    if (budgetFloorsLoading) return budgetFloorsLoading;

    budgetFloorsLoading = (async () => {
      // Preferred (once backend supports params)
      let data = null;
      try {
        let res = await fetch(`/api/products?prefix=BP&source=badolux&limit=200`, {
          credentials: "include",
        });
        if (res.ok) data = await res.json().catch(() => null);
      } catch {}

      // Frontend-first fallback: use search and filter client-side
      if (!Array.isArray(data)) {
        try {
          const res2 = await fetch(`/api/products?q=BP`, { credentials: "include" });
          if (res2.ok) data = await res2.json().catch(() => []);
          else data = [];
        } catch {
          data = [];
        }
      }

      const filtered = (Array.isArray(data) ? data : [])
        .filter((p) => startsWithBP(p.productId) && normalizeSource(p.source) === "badolux")
        .sort((a, b) => String(a.productId).localeCompare(String(b.productId)));

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
    const group = document.getElementById("flooringBudgetGroup");
    const wrap = document.getElementById("flooringBudgetOptions");
    const empty = document.getElementById("flooringBudgetEmpty");
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
    const group = document.getElementById("flooringBudgetGroup");
    if (!group) return;
    const on = isOn();
    group.hidden = !on;
    group.setAttribute("aria-hidden", (!on).toString());
    if (on) await renderBudgetFloors();
  }

  function init() {
  const el = getToggle();
  if (!el) return;

  // Restore session preference only if the checkbox doesn't already have a value from restored offers
  if (!el.dataset.budgetInit) {
    try {
      const saved = sessionStorage.getItem(SESSION_KEY);
      if (saved === "1" && !el.checked) el.checked = true;
    } catch {}
    el.dataset.budgetInit = "1";
  }

  // apply once
  applyBudgetModeUI(el.checked);
  swapAccessoryImages(el.checked);
  updateBudgetFloorVisibility();

  // NEW: Wandpaneele budget section (Option A)
  setWvBudgetVisibility?.(el.checked);
  if (el.checked) renderBudgetWvColors?.();

  // bind once
  if (el.dataset.boundBudget === "1") return;
  el.dataset.boundBudget = "1";

  el.addEventListener("change", () => {
    try {
      sessionStorage.setItem(SESSION_KEY, el.checked ? "1" : "0");
    } catch {}

    applyBudgetModeUI(el.checked);
    swapAccessoryImages(el.checked);
    updateBudgetFloorVisibility();

    // NEW: Wandpaneele budget section (Option A)
    setWvBudgetVisibility?.(el.checked);
    if (el.checked) renderBudgetWvColors?.();

    // refresh tray suggestions if available
    if (window.__smartTray?.fetchAndRender) window.__smartTray.fetchAndRender();

    // OPTIONAL: update pricing immediately if you do live pricing
    window.updatePricing?.();
  });
}

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  return { ok: true };
}
