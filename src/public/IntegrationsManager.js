// IntegrationsManager.js
// Currently: Bitrix contact loader (Hassmann kept separate)
//
// Usage (classic script safe via dynamic import from script.js):
//   const { initIntegrationsManager } = await import("./IntegrationsManager.js");
//   initIntegrationsManager({ hooks: { fillCustomerForm, showCustomerMessage, updateSummaryWidgetName, updatePricing } });

export function initIntegrationsManager(options = {}) {
  const cfg = {
    els: {
      bitrixIdInput: "#bitrixContactId",
      bitrixLoadBtn: "#loadBitrixContactBtn",
    },
    api: {
      bitrixContact: (id) => `/api/bitrix/contact/${encodeURIComponent(id)}`,
    },
    hooks: {
      fillCustomerForm: (data) => (window.fillCustomerForm ? window.fillCustomerForm(data) : null),
      showCustomerMessage: (msg, type) =>
        (window.showCustomerMessage ? window.showCustomerMessage(msg, type) : console.log(type || "info", msg)),
      updateSummaryWidgetName: () => window.updateSummaryWidgetName?.(),
      updatePricing: () => window.updatePricing?.(),
    },
    ...options,
  };

  // allow partial override of hooks
  cfg.hooks = { ...cfg.hooks, ...(options.hooks || {}) };

  const bitrixIdInput = document.querySelector(cfg.els.bitrixIdInput);
  const loadBitrixBtn = document.querySelector(cfg.els.bitrixLoadBtn);

  if (bitrixIdInput && loadBitrixBtn) {
    const loadBitrixContact = async () => {
      const id = String(bitrixIdInput.value || "").trim();
      if (!id) {
        cfg.hooks.showCustomerMessage("Bitte eine Bitrix Kontakt ID eingeben", "error");
        return;
      }

      const prevText = loadBitrixBtn.textContent;
      try {
        loadBitrixBtn.disabled = true;
        loadBitrixBtn.textContent = "Laden...";

        const res = await fetch(cfg.api.bitrixContact(id), { credentials: "include" });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "Fehler beim Laden aus Bitrix");
        }

        const data = await res.json();
        // expected n8n shape: { result: {...}, time: {...} }
        const contact = data?.result;
        if (!contact || !contact.ID) {
          throw new Error("Kontakt nicht gefunden");
        }

        const phone =
          Array.isArray(contact.PHONE) && contact.PHONE[0]
            ? contact.PHONE[0].VALUE
            : "";
        const email =
          Array.isArray(contact.EMAIL) && contact.EMAIL[0]
            ? contact.EMAIL[0].VALUE
            : "";

        const honorificId = String(
          contact?.HONORIFIC?.STATUS_ID ??
            contact?.HONORIFIC ??
            contact?.HONORIFIC_ID ??
            "",
        ).trim();

        const honorificMap = {
          HNR_DE_1: "Frau",
          HNR_DE_2: "Herr",
          "1": "Familie",
        };
        const salutation = honorificMap[honorificId] || "";

        const mapped = {
          bitrixContactId: contact.ID,
          customerNumber: contact.ID,
          firstName: contact.NAME || "",
          lastName: contact.LAST_NAME || "",
          company: contact.COMPANY_TITLE || "",
          email,
          phone,
          salutation,
          street: contact.ADDRESS || "",
          city: contact.ADDRESS_CITY || "",
          postalCode: contact.ADDRESS_POSTAL_CODE || "",
          state: contact.ADDRESS_REGION || contact.ADDRESS_PROVINCE || "",
          country: contact.ADDRESS_COUNTRY || "",
        };

        cfg.hooks.fillCustomerForm(mapped);

        cfg.hooks.updateSummaryWidgetName?.();
        cfg.hooks.updatePricing?.();

        cfg.hooks.showCustomerMessage("Kontakt aus Bitrix übernommen", "success");
      } catch (e) {
        console.error(e);
        cfg.hooks.showCustomerMessage(
          e?.message || "Fehler beim Laden des Bitrix Kontakts",
          "error",
        );
      } finally {
        loadBitrixBtn.disabled = false;
        loadBitrixBtn.textContent = prevText || "Aus Bitrix laden";
      }
    };

    loadBitrixBtn.addEventListener("click", loadBitrixContact);

    bitrixIdInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        loadBitrixContact();
      }
    });
  }

  return {
    reloadBitrix: async () => {
      // convenience for debugging
      const bitrixIdInput = document.querySelector(cfg.els.bitrixIdInput);
      if (!bitrixIdInput) return null;
      const id = String(bitrixIdInput.value || "").trim();
      if (!id) return null;
      // trigger same flow
      const btn = document.querySelector(cfg.els.bitrixLoadBtn);
      btn?.click();
      return id;
    },
  };
}
