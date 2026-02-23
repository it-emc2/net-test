// HassmannManager.js
// Owns the Hassmann "Best Finder" UI (Duschabtrennung search wizard)

export function initHassmannManager(options = {}) {
  const cfg = {
    els: {
      form: "#hassmannFinderForm",
      btn: "#hf_searchBtn",
      status: "#hf_status",
      results: "#hf_results",
    },
    apiUrl: "/api/magic/search",
    toast: (msg) => console.log(msg),
    ...options,
  };

  const form = document.querySelector(cfg.els.form);
  const btn = document.querySelector(cfg.els.btn);
  const statusEl = document.querySelector(cfg.els.status);
  const resultsEl = document.querySelector(cfg.els.results);

  if (!form || !btn || !statusEl || !resultsEl) {
    // Page not present → no-op
    return { search: async () => [], destroy: () => {} };
  }

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
    const width = Number(form.hf_width?.value || 0);
    const depth = Number(form.hf_depth?.value || 0);
    const minP = Number(form.hf_minPrice?.value || 0);
    const maxP = Number(form.hf_maxPrice?.value || 0);
    const shortS = !!form.hf_shortSide?.checked;
    const orient = form.hf_orientation?.value || null;

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
          if (String(link).startsWith("http://") || String(link).startsWith("https://")) {
            return link;
          }
          return MEDIA_PREFIX + String(link).replace(/^\/+/, "");
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

  async function search() {
    if (typeof form.reportValidity === "function" && !form.reportValidity()) {
      return [];
    }

    const kind = getKind(); // corner / niche / uform / walkin
    const payload = buildPayloadFromForm();

    setStatus("Suche wird ausgeführt …", true);
    resultsEl.innerHTML = "";

    try {
      const res = await fetch(cfg.apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ kind, payload }),
      });

      const data = await res.json();
      if (!res.ok) {
        console.error("Hassmann search failed:", data);
        setStatus(data.error || "Fehler bei der Suche.", false);
        return [];
      }

      const list = Array.isArray(data?.results)
        ? data.results
        : Array.isArray(data)
          ? data
          : [];

      setStatus(`Es wurden ${list.length} Produkt(e) gefunden.`, true);
      renderResults(list);
      return list;
    } catch (err) {
      console.error(err);
      setStatus("Netzwerkfehler bei der Suche.", false);
      return [];
    }
  }

  const onClick = () => search();
  btn.addEventListener("click", onClick);

  return {
    search,
    destroy: () => {
      btn.removeEventListener("click", onClick);
    },
  };
}
