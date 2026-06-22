// AdminManager.js
// Handles Admin pages: Products and Services
// Loaded via dynamic import from script.js (classic script safe)

export function initAdminManager(options = {}) {
  const cfg = {
    getCurrentStep: () => window.getCurrentStep?.(),
    parseMoneyEuro: (v) => window.parseMoneyEuro?.(v),
    toast: window.toast,
    ...options,
  };

  function euroFmt(n) {
    return (Number(n) || 0).toLocaleString("de-DE", {
      style: "currency",
      currency: "EUR",
    });
  }

  // -------------------------------
  // Admin Products
  // -------------------------------
  function initAdminProducts() {
    const page = document.getElementById("page-admin");
    if (!page) return null;

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

    if (!form || !status || !tblBody || !idEl || !nameEl || !priceEl) return null;

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

    async function loadProducts(q = "") {
      try {
        setStatus("Lade Produkte …", true);
        const url = q ? `/api/products?q=${encodeURIComponent(q)}` : "/api/products";
        const res = await fetch(url, { credentials: "include" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const list = await res.json();

        if (!Array.isArray(list) || !list.length) {
          tblBody.innerHTML =
            `<tr><td colspan="5" style="padding:4px;">Keine Produkte gefunden.</td></tr>`;
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
        tblBody.innerHTML =
          `<tr><td colspan="5" style="padding:4px;">Fehler beim Laden.</td></tr>`;
        setStatus(`Fehler beim Laden: ${err.message}`, false);
      }
    }

    // initial load
    loadProducts();

    // search debounce
    let searchTimer = null;
    search?.addEventListener("input", () => {
      const q = search.value.trim();
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => loadProducts(q), 250);
    });

    // edit click
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
      const srcStr = tds[4]?.textContent?.trim() || "";

      idEl.value = pid;
      nameEl.value = name;

      const pClean = priceStr.replace(/[^\d.,-]/g, "");
      priceEl.value = pClean;

      const parts = dimsStr
        .split("/")
        .map((s) => s.trim())
        .filter(Boolean);

      if (wEl) wEl.value = parts[0] || "";
      if (lEl) lEl.value = parts[1] || "";
      if (hEl) hEl.value = parts[2] || "";
      if (sourceEl) sourceEl.value = srcStr;

      setStatus(`Produkt ${pid} im Formular geladen.`, true);
      idEl.focus();
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      const productId = idEl.value.trim();
      const name = nameEl.value.trim();
      const priceRaw = priceEl.value.trim();
      const source = sourceEl?.value.trim() || "";

      if (!productId || !name || !priceRaw) {
        setStatus("Bitte mindestens Produkt-ID, Name und Preis ausfüllen.", false);
        return;
      }

      const priceNum =
        typeof cfg.parseMoneyEuro === "function"
          ? cfg.parseMoneyEuro(priceRaw)
          : Number(priceRaw.replace(",", "."));

      if (!(priceNum > 0)) {
        setStatus("Preis ist ungültig oder 0.", false);
        return;
      }

      const widthCm = wEl?.value ? Number(wEl.value) : undefined;
      const lengthCm = lEl?.value ? Number(lEl.value) : undefined;
      const heightCm = hEl?.value ? Number(hEl.value) : undefined;

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

        if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);

        setStatus(`Produkt ${productId} gespeichert.`, true);
        cfg.toast?.success?.("Gespeichert", `Produkt <b>${productId}</b> wurde gespeichert.`);
        await loadProducts(search?.value.trim() || "");
      } catch (err) {
        console.error(err);
        setStatus(`Fehler beim Speichern: ${err.message}`, false);
        cfg.toast?.error?.("Fehler", err.message);
      }
    });

    return { load: loadProducts };
  }

  // -------------------------------
  // Admin Services
  // -------------------------------
  function initAdminServices() {
    const page = document.getElementById("page-services");
    if (!page) return null;

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

    if (!form || !status || !tblBody || !idEl || !nameEl || !priceEl || !timeEl) return null;

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

    async function loadServices(q = "") {
      try {
        setStatus("Lade Services …", true);
        const url = q ? `/api/services?q=${encodeURIComponent(q)}` : "/api/services";
        const res = await fetch(url, { credentials: "include" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const list = await res.json();

        if (!Array.isArray(list) || !list.length) {
          tblBody.innerHTML =
            `<tr><td colspan="8" style="padding:4px;">Keine Services gefunden.</td></tr>`;
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
        tblBody.innerHTML =
          `<tr><td colspan="8" style="padding:4px;">Fehler beim Laden.</td></tr>`;
        setStatus(`Fehler beim Laden: ${err.message}`, false);
      }
    }

    loadServices();

    let searchTimer = null;
    search?.addEventListener("input", () => {
      const q = search.value.trim();
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => loadServices(q), 250);
    });

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
      if (internalEl) internalEl.value = internal;
      if (descEl) descEl.value = desc;

      const pClean = priceStr.replace(/[^\d.,-]/g, "");
      priceEl.value = pClean;

      const tClean = timeStr.replace(/[^\d]/g, "");
      timeEl.value = tClean;

      if (sourceEl) sourceEl.value = srcStr;

      setStatus(`Service ${sid} im Formular geladen.`, true);
      idEl.focus();
    });

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
        setStatus("Bitte mindestens Service-ID, Name, Preis und Zeit (Minuten) ausfüllen.", false);
        return;
      }

      const priceNum =
        typeof cfg.parseMoneyEuro === "function"
          ? cfg.parseMoneyEuro(priceRaw)
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
        if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);

        setStatus(`Service ${serviceId} gespeichert.`, true);
        cfg.toast?.success?.("Gespeichert", `Service <b>${serviceId}</b> wurde gespeichert.`);
        await loadServices(search?.value.trim() || "");
      } catch (err) {
        console.error(err);
        setStatus(`Fehler beim Speichern: ${err.message}`, false);
        cfg.toast?.error?.("Fehler", err.message);
      }
    });

    return { load: loadServices };
  }

  const products = initAdminProducts();
  const services = initAdminServices();

  // Auto refresh when entering admin page
  function onAdminEnter() {
    if (products) products.load(document.getElementById("ap_search")?.value?.trim() || "");
    if (services) services.load(document.getElementById("as_search")?.value?.trim() || "");
  }

  window.addEventListener("hashchange", () => {
    if (cfg.getCurrentStep?.() === "admin") onAdminEnter();
  });

  // If already on admin at init time
  if (cfg.getCurrentStep?.() === "admin") onAdminEnter();

  return { reload: onAdminEnter, products, services };
}
