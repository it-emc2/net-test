// EmailManager.js
// Handles offer email sending UI + attachment tiles, decoupled from script.js

export function initEmailManager(options = {}) {
  const cfg = {
    els: {
      btnSend: "#sendOfferMail",
      to: "#mailTo",
      subject: "#mailSubject",
      body: "#mailBody",
      files: "#mailAttachments",
      list: "#mailAttachmentList",
      status: "#mailStatus",
      offerNumber: "#offerNumber",
    },
    apiUrl: "/api/email/send-offer",
    presetAttachments: [
      { id: "abtretung", name: "Abtretungserklärung.pdf" },
      { id: "barrierefrei", name: "emc2_Barrierefreies_Wohnen.pdf" },
      { id: "vollmacht", name: "Vollmacht.pdf" },
    ],
    hooks: {
      requireBereichValid: () => true,
      buildPayload: () => null,
      getCurrentOfferType: () => "bu",
      genOfferNumber: () => "",
      saveFinalOfferSnapshot: async () => {},
    },
    ...options,
  };

  // shallow-merge hooks
  cfg.hooks = { ...(cfg.hooks || {}), ...(options.hooks || {}) };

  const $btn = document.querySelector(cfg.els.btnSend);
  const $to = document.querySelector(cfg.els.to);
  const $subject = document.querySelector(cfg.els.subject);
  const $body = document.querySelector(cfg.els.body);
  const $files = document.querySelector(cfg.els.files);
  const $list = document.querySelector(cfg.els.list);
  const $status = document.querySelector(cfg.els.status);
  const $offerNumber = document.querySelector(cfg.els.offerNumber);

  if (!$btn || !$to || !$subject || !$body || !$files || !$list || !$status) {
    console.warn("[EmailManager] missing DOM nodes, skipping init");
    return { send: async () => false };
  }

  const excludedPreset = new Set();
  let userFiles = [];

  // expose for compatibility (some code may read this)
  window.__mailExcludedPreset = excludedPreset;

  const setStatus = (msg, type = "info") => {
    $status.hidden = false;
    $status.textContent = msg || "";
    $status.dataset.type = type;
  };

  const getOfferNumber = () => {
    const v = ($offerNumber?.value || "").trim();
    if (v) return v;
    try {
      const g = cfg.hooks.genOfferNumber?.();
      return (g || "").trim();
    } catch {
      return "";
    }
  };

  // Subject auto-fill unless user edits
  let subjectTouched = false;
  $subject.addEventListener("input", () => (subjectTouched = true));

  const updateSubjectDefault = () => {
    if (subjectTouched) return;
    const offerNumber = getOfferNumber();
    if (offerNumber) $subject.value = offerNumber;
  };

  $offerNumber?.addEventListener("input", updateSubjectDefault);
  $offerNumber?.addEventListener("change", updateSubjectDefault);
  updateSubjectDefault();

  // ---- Attachment handling ----
  function syncFileInput() {
    const dt = new DataTransfer();
    for (const f of userFiles) dt.items.add(f);
    $files.files = dt.files;
  }

  function makeTile({ name, meta, removable, onRemove }) {
    const tile = document.createElement("div");
    // Prefer tile class if present in CSS; fallback to chip
    tile.className = "mail-attach-tile";
    if (!document.querySelector(".mail-attach-tile") && !document.querySelector(".mail-attach-chip")) {
      // keep class anyway; won't hurt
    }

    const label = document.createElement("div");
    label.className = "mail-attach-name";
    label.textContent = name;

    tile.appendChild(label);

    if (meta) {
      const m = document.createElement("div");
      m.className = "mail-attach-meta";
      m.textContent = meta;
      tile.appendChild(m);
    }

    if (removable) {
      const x = document.createElement("div");
      x.className = "mail-attach-x";
      x.textContent = "✕";
      x.title = "Remove";
      x.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        onRemove?.();
      });
      tile.appendChild(x);
    }

    return tile;
  }

  function renderList() {
    $list.innerHTML = "";

    // Offer PDF (always attached by backend)
    const offerNumber = getOfferNumber();
    const offerPdfName = `${offerNumber || "Angebot"}.pdf`;
    $list.appendChild(
      makeTile({ name: offerPdfName, meta: "Offer PDF", removable: false }),
    );

    // Presets
    for (const p of cfg.presetAttachments) {
      if (excludedPreset.has(p.id)) continue;
      $list.appendChild(
        makeTile({
          name: p.name,
          meta: "Default",
          removable: true,
          onRemove: () => {
            excludedPreset.add(p.id);
            renderList();
          },
        }),
      );
    }

    // Uploads
    userFiles.forEach((f, idx) => {
      $list.appendChild(
        makeTile({
          name: f.name,
          meta: "Added",
          removable: true,
          onRemove: () => {
            userFiles.splice(idx, 1);
            syncFileInput();
            renderList();
          },
        }),
      );
    });
  }

  $files.addEventListener("change", () => {
    const newly = Array.from($files.files || []);
    userFiles = userFiles.concat(newly);

    // de-dup by name+size+lastModified
    const seen = new Set();
    userFiles = userFiles.filter((f) => {
      const k = `${f.name}|${f.size}|${f.lastModified}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    syncFileInput();
    renderList();
  });

  renderList();

  async function send() {
    try {
      if (cfg.hooks.requireBereichValid && !cfg.hooks.requireBereichValid()) {
        location.hash = "Kundendaten";
        return false;
      }

      const to = ($to.value || "").trim();
      if (!to) {
        setStatus("Please enter a recipient email.", "error");
        return false;
      }

      const payload = cfg.hooks.buildPayload?.();
      if (!payload) throw new Error("buildPayload() is missing / returned nothing");

      if (!payload.activeOffer) {
        payload.activeOffer =
          cfg.hooks.getCurrentOfferType?.() ||
          payload.offerType ||
          payload.currentOfferKey ||
          "bu";
      }

      const offerNumber = getOfferNumber();

      $btn.disabled = true;
      setStatus("Generating offer PDF + sending email…", "info");

      const fd = new FormData();
      fd.append("to", to);
      fd.append("subject", ($subject.value || offerNumber || "Angebot").trim());
      fd.append("body", $body.value || "");
      fd.append("offerNumber", offerNumber);
      fd.append("offerType", payload.activeOffer || "");
      fd.append("payload", JSON.stringify(payload));
      fd.append("excludePreset", JSON.stringify(Array.from(excludedPreset)));

      for (const f of userFiles) fd.append("attachments", f, f.name);

      const res = await fetch(cfg.apiUrl, { method: "POST", body: fd });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || err.error || `HTTP ${res.status}`);
      }

      const data = await res.json().catch(() => ({}));
      setStatus(
        `Email sent ✅ Attachments: ${data.attachmentNames?.join(", ") || "-"}`,
        "success",
      );

      try {
        await cfg.hooks.saveFinalOfferSnapshot?.();
      } catch {}
      return true;
    } catch (e) {
      console.error("[EmailManager] send failed:", e);
      setStatus(`Send failed: ${e.message || e}`, "error");
      return false;
    } finally {
      $btn.disabled = false;
    }
  }

  $btn.addEventListener("click", (e) => {
    e.preventDefault();
    send();
  });

  return { send, render: renderList, excludedPreset };
}
