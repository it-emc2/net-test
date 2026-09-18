
// EmailManager.js
// Handles offer email sending UI + attachment tiles, decoupled from script.js
// + posts a Bitrix timeline comment after successful send (best-effort)

// Kassenkunde (non-AH) body-text lines for the 3 optional documents, in the
// order they should be numbered. ids match cfg.presetAttachments below and
// the checkboxes in #zfDocSelectionCard (index.html) — a single excludedPreset
// Set drives both the attachment tiles and this text.
const KASSE_DOC_LINES = [
  { id: "abtretung", line: "Abtretungserklärung zur Abrechnung mit der Krankenkasse" },
  { id: "vollmacht", line: "Vollmacht zur Beantragung des Zuschusses nach §40 SGB XI" },
  { id: "barrierefrei", line: 'Unseren aktuellen Flyer "Barrierefreies Wohnen"' },
];

export function initEmailManager(options = {}) {
  const cfg = {
    els: {
      btnSend: "#sendOfferMail",
      to: "#mailTo",
      cc: "#mailCc",
      subject: "#mailSubject",
      body: "#mailBody",
      preview: "#mailHtmlPreview",
      leadId: "#mailAuftragId",
      antragGestellt: "#mailAntragGestellt",
      files: "#mailAttachments",
      editedDocx: "#mailEditedDocx",
      list: "#mailAttachmentList",
      status: "#mailStatus",
      offerNumber: "#offerNumber",
    },
    apiUrl: "/api/email/send-offer",

    // Bitrix timeline comment API (backend)
    bitrix: {
      commentApiUrl: "/api/bitrix/timeline/comment",
      // if deal exists -> comment on deal, else fallback to contact
      dealIdSelector: "#auftragId",
      contactIdSelector: "#bitrixContactId",
    },

    presetAttachments: [
      { id: "abtretung", name: "Abtretungserklärung.pdf" },
      { id: "barrierefrei", name: "emc2_Barrierefreies_Wohnen.pdf" },
      { id: "vollmacht", name: "Vollmacht.pdf" },
    ],

    // AH (Alltagshilfe) uses its own document set (EmC2 Soziale Dienste UG).
    ahPresetAttachments: [
      { id: "flyer_ah", name: "Flyer_Alltagshilfe_EmC2 Soziale Dienste.pdf" },
      { id: "barrierefrei", name: "emc2_Barrierefreies_Wohnen.pdf" },
      { id: "agb_ah", name: "AGB_Alltagshilfe_EmC2 Soziale Dienste UG.pdf" },
      {
        id: "zusatzblatt_ah",
        name: "Zusatzblatt für Krankenkasse Alltagshilfe_EmC2 Soziale Dienste UG.pdf",
      },
      {
        id: "abtretung_ah",
        name: "Abtretungserklärung_SGB_45b_EmC2 Soziale Dienste UG.pdf",
      },
      { id: "vollmacht", name: "Vollmacht_SGB_45b_EmC2 Soziale Dienste UG.pdf" },
    ],

    hooks: {
      requireBereichValid: () => true,
      buildPayload: () => null,
      getCurrentOfferType: () => "bu",
      genOfferNumber: () => "",
      saveFinalOfferSnapshot: async () => {},
      onDealStageMoved: () => {},
    },

    ...options,
  };

  // shallow-merge hooks + bitrix config
  cfg.hooks = { ...(cfg.hooks || {}), ...(options.hooks || {}) };
  cfg.bitrix = { ...(cfg.bitrix || {}), ...(options.bitrix || {}) };

  const $btn = document.querySelector(cfg.els.btnSend);
  // Optional "Bitrix only" button — same send path, no customer email.
  const $btnBitrix = document.querySelector("#sendOfferBitrix");
  const $to = document.querySelector(cfg.els.to);
  const $cc = document.querySelector(cfg.els.cc);
  const $subject = document.querySelector(cfg.els.subject);
  const $body = document.querySelector(cfg.els.body);
  const $preview = document.querySelector(cfg.els.preview);
  const $leadId = document.querySelector(cfg.els.leadId);
  const $antragGestellt = document.querySelector(cfg.els.antragGestellt);
  const $files = document.querySelector(cfg.els.files);
  const $editedDocx = document.querySelector(cfg.els.editedDocx);
  const $list = document.querySelector(cfg.els.list);
  const $status = document.querySelector(cfg.els.status);
  const $offerNumber = document.querySelector(cfg.els.offerNumber);

  if (!$btn || !$to || !$subject || !$body || !$leadId || !$files || !$list || !$status) {
    console.warn("[EmailManager] missing DOM nodes, skipping init");
    return { send: async () => false };
  }

  const excludedPreset = new Set();
  let userFiles = [];
  // Uploads that go to the Bitrix timeline only — never to the customer email.
  const $bitrixFiles = document.getElementById("mailBitrixAttachments");
  const $bitrixList = document.getElementById("mailBitrixAttachmentList");
  let bitrixFiles = [];

  // expose for compatibility (some code may read this)
  window.__mailExcludedPreset = excludedPreset;

  // ---- Edited-DOCX drop zone -------------------------------------------
  // Visual state around #mailEditedDocx: empty = green dashed invite,
  // file chosen = amber "override active" card + amber send button.
  const $docxZone = document.getElementById("mailDocxZone");
  const $docxZoneBadge = document.getElementById("mailDocxZoneBadge");
  const $docxZoneTitle = document.getElementById("mailDocxZoneTitle");
  const $docxZoneSub = document.getElementById("mailDocxZoneSub");
  const $docxRemove = document.getElementById("mailDocxRemove");
  const $docxSendNote = document.getElementById("mailDocxSendNote");
  const btnDefaultHtml = $btn.innerHTML;

  function clearEditedDocx() {
    if ($editedDocx) $editedDocx.value = "";
    renderDocxZone();
  }

  function renderDocxZone() {
    if (!$docxZone || !$editedDocx) return;
    const file = $editedDocx.files?.[0] || null;
    $docxZone.classList.toggle("has-file", !!file);
    $docxRemove.hidden = !file;
    if ($docxSendNote) $docxSendNote.hidden = !file;
    if (file) {
      $docxZoneBadge.textContent = "✅";
      $docxZoneTitle.textContent = file.name;
      $docxZoneSub.textContent =
        "Diese Datei wird statt des automatisch erzeugten Angebots versendet.";
      $btn.classList.add("btn-edited-docx");
      $btn.innerHTML = '<span class="btn-icon">📝</span> Geänderte DOCX senden';
    } else {
      $docxZoneBadge.textContent = "📝";
      $docxZoneTitle.textContent = "Angebot in Word angepasst?";
      $docxZoneSub.textContent =
        "Bearbeitete DOCX hier ablegen oder auswählen — sie wird statt des " +
        "automatisch erzeugten Angebots als PDF versendet.";
      $btn.classList.remove("btn-edited-docx");
      $btn.innerHTML = btnDefaultHtml;
    }
  }

  function acceptEditedDocx(file) {
    if (!file) return;
    if (!/\.docx$/i.test(file.name)) {
      setStatus("Die geänderte Datei muss eine .docx sein.", "error");
      return;
    }
    const dt = new DataTransfer();
    dt.items.add(file);
    $editedDocx.files = dt.files;
    renderDocxZone();
  }

  if ($docxZone && $editedDocx) {
    $docxZone.addEventListener("click", () => $editedDocx.click());
    $docxZone.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        $editedDocx.click();
      }
    });
    $editedDocx.addEventListener("change", () => {
      const f = $editedDocx.files?.[0];
      if (f && !/\.docx$/i.test(f.name)) {
        setStatus("Die geänderte Datei muss eine .docx sein.", "error");
        $editedDocx.value = "";
      }
      renderDocxZone();
    });
    $docxRemove.addEventListener("click", (e) => {
      e.stopPropagation();
      clearEditedDocx();
    });
    for (const ev of ["dragenter", "dragover"]) {
      $docxZone.addEventListener(ev, (e) => {
        e.preventDefault();
        $docxZone.classList.add("drag-over");
      });
    }
    $docxZone.addEventListener("dragleave", () => $docxZone.classList.remove("drag-over"));
    $docxZone.addEventListener("drop", (e) => {
      e.preventDefault();
      $docxZone.classList.remove("drag-over");
      acceptEditedDocx(e.dataTransfer?.files?.[0]);
    });
    renderDocxZone();
  }

  const setStatus = (msg, type = "info") => {
    $status.classList.remove("mail-log");
    $status.hidden = false;
    $status.textContent = msg || "";
    $status.dataset.type = type;
  };

  // Step-by-step "what's going on" log during send (mirrors the BU flow):
  // each awaited step appends an emoji + timestamp line to #mailStatus.
  const STEP_EMOJI = { info: "🔄", success: "✅", error: "❌", warning: "⚠️" };
  function startStatusLog() {
    $status.classList.add("mail-log");
    $status.textContent = "";
    $status.dataset.type = "info";
    $status.hidden = false;
  }
  function pushStatus(msg, type = "info") {
    if (!$status.classList.contains("mail-log")) startStatusLog();
    $status.hidden = false;
    const line = document.createElement("div");
    line.className = "mail-log-line mail-log-line--" + type;
    line.textContent = `${STEP_EMOJI[type] || "🔄"} [${new Date().toLocaleTimeString()}] ${msg}`;
    $status.appendChild(line);
    $status.scrollTop = $status.scrollHeight;
    $status.dataset.type = type;
  }

  // One-time styles for the "ANG verschickt" success/stage-move dialog.
  if (!document.getElementById("angStageStyles")) {
    const style = document.createElement("style");
    style.id = "angStageStyles";
    style.textContent = `
      .ang-stage-overlay{position:fixed;inset:0;background:rgba(15,23,32,.55);
        display:flex;align-items:center;justify-content:center;z-index:10000;padding:16px;}
      .ang-stage-modal{background:#fff;border-radius:14px;max-width:440px;width:100%;
        padding:24px;box-shadow:0 18px 60px rgba(0,0,0,.28);font-family:Arial,Helvetica,sans-serif;color:#243038;}
      .ang-stage-title{margin:0 0 8px;font-size:19px;}
      .ang-stage-text{margin:0 0 14px;font-size:14px;line-height:1.5;color:#4a575f;}
      .ang-stage-actions{display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;}
      .ang-stage-btn{padding:9px 16px;border-radius:8px;border:1px solid #cdd6dc;background:#f2f5f7;
        cursor:pointer;font-size:14px;color:#243038;}
      .ang-stage-btn--primary{background:#00a86b;border-color:#00a86b;color:#fff;font-weight:600;}
      .ang-stage-btn:disabled{opacity:.6;cursor:default;}
      .ang-stage-error{color:#c0392b;}
    `;
    document.head.appendChild(style);
  }

  const $mainAuftragId = document.querySelector(cfg.bitrix.dealIdSelector);

  function markInvalid(el, invalid = true) {
    if (!el) return;
    el.classList.toggle("input-error", !!invalid);
    if (invalid) el.setAttribute("aria-invalid", "true");
    else el.removeAttribute("aria-invalid");
  }

  function syncLeadIdFields(source = null) {
    const sourceVal = String(source?.value || "").trim();

    if (source === $leadId && $mainAuftragId && $mainAuftragId.value !== sourceVal) {
      $mainAuftragId.value = sourceVal;
      $mainAuftragId.dispatchEvent(new Event("input", { bubbles: true }));
      $mainAuftragId.dispatchEvent(new Event("change", { bubbles: true }));
    }

    if (source === $mainAuftragId && $leadId && $leadId.value !== sourceVal) {
      $leadId.value = sourceVal;
    }

    const effective = String($leadId?.value || $mainAuftragId?.value || "").trim();
    markInvalid($leadId, false);
    markInvalid($mainAuftragId, false);
    return effective;
  }

  if ($mainAuftragId && !$leadId.value.trim()) {
    $leadId.value = String($mainAuftragId.value || "").trim();
  }

  $leadId.addEventListener("input", () => syncLeadIdFields($leadId));
  $leadId.addEventListener("change", () => syncLeadIdFields($leadId));
  $mainAuftragId?.addEventListener("input", () => syncLeadIdFields($mainAuftragId));
  $mainAuftragId?.addEventListener("change", () => syncLeadIdFields($mainAuftragId));

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

  const getOfferType = () => {
    try {
      return String(cfg.hooks.getCurrentOfferType?.() || "bu").trim().toLowerCase();
    } catch {
      return "bu";
    }
  };

  const getOfferSubjectSuffix = () => {
    const suffixByOffer = {
      bu: "zum Badumbau",
      bwt: "zur Badewannentür",
      ah: "zur Alltagshilfe",
      hl: "zum Handlauf",
      bl: "zum Badelift",
      hms: "zum Hausmeisterservice",
      wd: "zum Winterdienst",
    };
    return suffixByOffer[getOfferType()] || "";
  };

  const buildDefaultSubject = () => {
    const offerNumber = getOfferNumber();
    const suffix = getOfferSubjectSuffix();
    const base = offerNumber
      ? `emc2 | Ihr Angebot ${offerNumber}`
      : "emc2 | Ihr Angebot";
    return suffix ? `${base} ${suffix}` : base;
  };

  // -----------------------------
  // Bitrix comment helpers
  // -----------------------------
  function buildBitrixEmailComment({ offerNumber, to, subject, body, attachmentNames }) {
    const when = new Date();
    const dt = when.toLocaleString("de-DE", {
      timeZone: "Europe/Berlin",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    const safe = (v) => String(v ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");

    const subj = safe(subject).trim();
    const rcpt = safe(to).trim();
    const onr = safe(offerNumber).trim();
    const atts = Array.isArray(attachmentNames) ? attachmentNames.filter(Boolean) : [];

    const rawBody = safe(body || "").trim();
    // Generous safety cap only — the full offer email (~2k chars) fits easily.
    // Bitrix timeline comments accept large text; this just guards pathological input.
    const maxLen = 20000;
    const bodyOut =
      rawBody.length > maxLen ? rawBody.slice(0, maxLen) + "\n…(gekürzt)…" : rawBody;

    return [
      "📧 Email automatisch von OC gesendet",
      onr ? `Angebot: ${onr}` : null,
      `Datum/Zeit: ${dt}`,
      `Empfänger: ${rcpt || "-"}`,
      `Betreff: ${subj || "-"}`,
      `Anhänge: ${atts.length ? atts.join(", ") : "-"}`,
      "",
      "Inhalt:",
      bodyOut || "-",
    ]
      .filter(Boolean)
      .join("\n");
  }

  function getBitrixTarget() {
    const dealId = String(
      document.querySelector(cfg.bitrix.dealIdSelector)?.value || "",
    ).trim();

    const contactId = String(
      document.querySelector(cfg.bitrix.contactIdSelector)?.value || "",
    ).trim();

    if (dealId) return { entityType: "deal", entityId: dealId };
    if (contactId) return { entityType: "contact", entityId: contactId };
    return null;
  }

  async function postBitrixEmailComment({ comment }) {
    const target = getBitrixTarget();
    if (!target) return { skipped: true, reason: "no bitrix id" };

    const res = await fetch(cfg.bitrix.commentApiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...target, comment }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Bitrix comment failed (HTTP ${res.status})`);
    }

    return res.json().catch(() => ({}));
  }

  // -----------------------------
  // "Deal auf 'ANG verschickt' verschieben" dialog
  // -----------------------------
  function logDialogEvent(dealId, event, offerExtra) {
    if (!dealId) return;
    fetch(`/api/bitrix/deal/${encodeURIComponent(dealId)}/log-dialog-event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event,
        offerNumber: offerExtra?.offerNumber,
        offerType: offerExtra?.offerType,
      }),
    }).catch(() => {});
  }

  function closeStageModal() {
    const overlay = document.getElementById("angStageOverlay");
    // Log a "dismissed" event only if the move was never confirmed —
    // moveBtn is removed from the DOM once the move succeeds (see
    // submitStageMove), so its presence means the user closed without acting.
    if (overlay?.querySelector("#angStageMoveBtn") && overlay.dataset.dealId) {
      logDialogEvent(overlay.dataset.dealId, "move_dialog_dismissed", {
        offerNumber: overlay.dataset.offerNumber,
        offerType: overlay.dataset.offerType,
      });
    }
    overlay?.remove();
  }

  // Success dialog shown after the email was sent. Offers the stage move.
  // The postal send reuses it through window.__showSentDialog (title via `via`).
  function showSentDialog({ dealId, offerTotal, attachmentNames, offerExtra, bitrixOnly = false, via = "mail" }) {
    closeStageModal();
    const overlay = document.createElement("div");
    overlay.id = "angStageOverlay";
    overlay.className = "ang-stage-overlay";
    overlay.dataset.dealId = dealId || "";
    overlay.dataset.offerNumber = offerExtra?.offerNumber || "";
    overlay.dataset.offerType = offerExtra?.offerType || "";
    const atts = Array.isArray(attachmentNames) && attachmentNames.length
      ? attachmentNames.join(", ")
      : "-";
    overlay.innerHTML = `
      <div class="ang-stage-modal" role="dialog" aria-modal="true" aria-labelledby="angStageTitle">
        <h3 id="angStageTitle" class="ang-stage-title">${
          via === "post" ? "✅ Brief übergeben" : bitrixOnly ? "✅ Dokumente in Bitrix abgelegt" : "✅ E-Mail gesendet"
        }</h3>
        <p class="ang-stage-text">Anhänge: ${atts}</p>
        <div class="ang-stage-body"></div>
        <div class="ang-stage-actions">
          ${dealId ? `<button type="button" class="ang-stage-btn ang-stage-btn--primary" id="angStageMoveBtn">Deal auf „ANG verschickt" verschieben</button>` : ""}
          <button type="button" class="ang-stage-btn" id="angStageCloseBtn">Schließen</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    if (dealId) logDialogEvent(dealId, "move_dialog_shown", offerExtra);

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeStageModal();
    });
    overlay.querySelector("#angStageCloseBtn")?.addEventListener("click", closeStageModal);
    const moveBtn = overlay.querySelector("#angStageMoveBtn");
    if (moveBtn) moveBtn.onclick = () => submitStageMove({ dealId, offerTotal, offerExtra });
  }

  // Moves the deal straight to "ANG verschickt" using the offer's own
  // computed total — no manual Betrag entry/confirm step, so it can never
  // drift from "Finaler Auftragswert" and costs the user one less click.
  async function submitStageMove({ dealId, offerTotal, offerExtra }) {
    const moveBtn = document.getElementById("angStageMoveBtn");
    const body = document.querySelector("#angStageOverlay .ang-stage-body");
    const amount = Number(offerTotal) > 0 ? Number(offerTotal) : Number(offerExtra?.finalTotal) || 0;

    if (moveBtn) moveBtn.disabled = true;
    if (body) body.innerHTML = `<p class="ang-stage-text">Verschiebe Deal…</p>`;

    const payload = { opportunity: amount, finalTotal: amount };
    if (offerExtra) {
      payload.workDays = offerExtra.workDays;
      payload.offerType = offerExtra.offerType;
      payload.offerNumber = offerExtra.offerNumber;
      if (offerExtra.isKassenkunde && Number(offerExtra.selfPayAmount) > 0) {
        payload.selfPayAmount = offerExtra.selfPayAmount;
      }
      // AH derives its own Bitrix fields server-side from the full offer payload.
      if (offerExtra.offerType === "ah" && offerExtra.payload) {
        payload.payload = JSON.stringify(offerExtra.payload);
      }
    }

    try {
      const res = await fetch(
        `/api/bitrix/deal/${encodeURIComponent(dealId)}/move-ang-verschickt`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      if (body) {
        body.innerHTML = `<p class="ang-stage-text">✅ Deal wurde auf „ANG verschickt" verschoben.</p>`;
      }
      if (moveBtn) moveBtn.remove();
      try {
        cfg.hooks.onDealStageMoved?.(dealId, offerExtra?.offerType);
      } catch (e) {
        console.warn("[EmailManager] onDealStageMoved hook failed:", e);
      }
    } catch (e) {
      if (body) body.innerHTML = `<p class="ang-stage-error">Fehler: ${e.message || e}</p>`;
      if (moveBtn) moveBtn.disabled = false;
    }
  }

  // -----------------------------
  // Subject auto-fill unless user edits
  // -----------------------------
  let subjectTouched = false;
  $subject.addEventListener("input", () => (subjectTouched = true));

  const updateSubjectDefault = () => {
    if (subjectTouched) return;
    $subject.value = buildDefaultSubject();
  };

  $offerNumber?.addEventListener("input", updateSubjectDefault);
  $offerNumber?.addEventListener("change", updateSubjectDefault);
  updateSubjectDefault();

  // -----------------------------
  // Recipient + body auto-fill unless user edits
  // -----------------------------
  let toTouched = false;
  let ccTouched = false;
  let bodyTouched = false;

  $to.addEventListener("input", () => (toTouched = true));
  $cc?.addEventListener("input", () => (ccTouched = true));
  $body.addEventListener("input", () => (bodyTouched = true));

  const $customerEmail = document.querySelector("#email");
  const $lastName = document.querySelector("#lastName");
  const $cpEmail = document.querySelector("#cp_email");
  const $cpName = document.querySelector("#cp_name");

  function getCustomerSalutation() {
    const checked = document.querySelector('input[name="salutation"]:checked');
    return (checked?.value || "").trim(); // Frau | Herr | Familie
  }

  function greetFragment(salutation, lastName) {
    const l = (lastName || "").trim();
    if (salutation === "Herr") return `sehr geehrter Herr ${l || "Mustermann"}`;
    if (salutation === "Frau") return `sehr geehrte Frau ${l || "Mustermann"}`;
    if (salutation === "Familie") return `sehr geehrte Familie ${l || "Mustermann"}`;
    return "sehr geehrte Damen und Herren";
  }

  function buildGreetingLine() {
    const salutation = getCustomerSalutation();
    const lastName = ($lastName?.value || "").trim();

    // Two persons: greet both (customer + partner).
    const twoPersons = !!document.querySelector('input[name="twoPersons"]:checked');
    const partnerSalutation = (document.getElementById("partnerSalutation")?.value || "").trim();
    const partnerLastName = (document.getElementById("partnerLastName")?.value || "").trim();
    if (twoPersons && (partnerSalutation || partnerLastName)) {
      const both = `${greetFragment(salutation, lastName)}, ${greetFragment(partnerSalutation, partnerLastName)},`;
      return both.charAt(0).toUpperCase() + both.slice(1);
    }

    const hasContactPerson =
      document.querySelector('input[name="hasContactPerson"]:checked')?.value === "Ja";
    const cpSalutation = (
      document.querySelector('input[name="cp_salutation"]:checked')?.value || ""
    ).trim();
    const cpName = ($cpName?.value || "").trim();
    if (hasContactPerson && cpName) {
      const both = `${greetFragment(salutation, lastName)}, ${greetFragment(cpSalutation, cpName)},`;
      return both.charAt(0).toUpperCase() + both.slice(1);
    }

    const one = `${greetFragment(salutation, lastName)},`;
    return one.charAt(0).toUpperCase() + one.slice(1);
  }

  const DOC_LIST_ANCHOR = "Im Anhang erhalten Sie wie gewünscht die folgenden Unterlagen:";

  // The numbered attachment list of the Kassenkunden body, following the
  // #zfDocSelectionCard checkboxes (excludedPreset).
  function buildAttachmentLines() {
    const offerNumber = getOfferNumber() || "ANG-2025-_____";
    return [
      `Ihr Angebot ${offerNumber}`,
      ...KASSE_DOC_LINES.filter((p) => !excludedPreset.has(p.id)).map((p) => p.line),
    ].map((line, i) => `${i + 1}. ${line}`);
  }

  // Rewrite only the numbered list, leaving the rest of the body alone.
  //
  // Toggling a document checkbox has to reach the text even when the body
  // counts as edited: reopening a saved offer writes the stored body
  // programmatically, which marks it touched, and a saved body may also carry
  // genuinely hand-written text that a full rebuild would throw away.
  function syncDocListInBody() {
    if (getOfferType() === "ah") return; // AH has a fixed list, no checkboxes
    const lines = ($body.value || "").split("\n");
    const anchorAt = lines.findIndex((l) => l.trim() === DOC_LIST_ANCHOR);
    if (anchorAt === -1) return;

    const isItem = (l) => /^\s*\d+\.\s/.test(l);
    let start = anchorAt + 1;
    while (start < lines.length && !lines[start].trim()) start++;
    let end = start;
    while (end < lines.length && isItem(lines[end])) end++;
    if (end === start) return; // no list where one is expected — leave it be

    const next = buildAttachmentLines();
    if (lines.slice(start, end).join("\n") === next.join("\n")) return;

    lines.splice(start, end - start, ...next);
    $body.value = lines.join("\n");
    updatePreview();
  }

  function buildDefaultMailBody() {
    const offerNumber = getOfferNumber() || "ANG-2025-_____";
    const isSelbstzahler =
      document.querySelector('input[name="payer"]:checked')?.value === "Selbstzahler";

    if (getOfferType() === "ah") {
      const attachmentList = isSelbstzahler
        ? `1. Ihr Angebot ${offerNumber}\n2. Zusatzblatt für Wichtige Hinweise zum Angebot / zu Terminen\n3. Unsere allgemeinen Geschäftsbedingungen (AGB)\n4. Unseren aktuellen Flyer "Alltagshilfe"\n5. Unseren aktuellen Flyer "Barrierefreies Wohnen"`
        : `1. Ihr Angebot ${offerNumber}\n2. Zusatzblatt für Wichtige Hinweise zum Angebot / zu Terminen\n3. Abtretungserklärung SGB 45b für die direkte Abrechnung mit Ihrer Pflegekasse\n4. Unsere allgemeinen Geschäftsbedingungen (AGB)\n5. Unseren aktuellen Flyer "Alltagshilfe"\n6. Unseren aktuellen Flyer "Barrierefreies Wohnen"`;

      return `${buildGreetingLine()}

vielen Dank für Ihr Interesse an unseren Dienstleistungen. Mit emc2 entscheiden Sie sich für einen zuverlässigen Partner, der Ihnen höchste Qualität und volle Sicherheit bietet.

Unser Ziel ist es, sie im Alltag zu unterstützen und Ihr Leben leichter, sicherer und komfortabler zu machen.

Im Anhang erhalten Sie wie gewünscht die folgenden Unterlagen:

${attachmentList}

Bitte füllen Sie die Dokumente aus und senden Sie uns diese unterschrieben zurück – gerne bequem per E-Mail an service@e-m-c-2.de.

Keine Möglichkeit, die Dokumente auszudrucken? Kein Problem - nutzen Sie einfach nachfolgenden Link, um die Dokumente online auszufüllen, zu unterschreiben und direkt an uns zurückzuschicken:

{{SIGN_LINK}}

Dank unserer langjährigen Erfahrung und etablierten Zusammenarbeit mit allen Pflege- und Krankenkassen profitieren Sie von einer reibungslosen und professionellen Abwicklung.

Überzeugen Sie sich selbst - hier berichten unsere Kunden: https://www.youtube.com/watch?v=Ie0sxagHlFo

Bei Rückfragen stehe ich Ihnen gerne zur Verfügung.`;
    }

    // Selbstzahler vs Kassenkunde is not a branch here any more: the payer only
    // seeds the #zfDocSelectionCard checkboxes (applyPayerDocDefaults in
    // script.js), and this list follows the checkboxes — so a Selbstzahler who
    // ticks Abtretung/Vollmacht gets them named in the text too.
    const attachmentList = buildAttachmentLines().join("\n");

    return `${buildGreetingLine()}

vielen Dank für Ihr Interesse an unseren Dienstleistungen. Mit emc2 entscheiden Sie sich für einen zuverlässigen Partner, der Ihnen höchste Qualität und volle Sicherheit bietet:

• Anerkannter Dienstleister nach SGB – von allen Pflegekassen geprüft und anerkannt.
• Nur Markenqualität vom Fachhändler – langlebige Produkte, auf die Sie sich verlassen können.
• 5 Jahre Gewährleistung – unsere Sicherheit für Ihre Investition.
• Professionelle Antragsstellung - auf Wunsch übernehmen wir die Antragsstellung bei der Pflegekasse für Sie.
• Exklusiver Neukundenbonus – profitieren Sie von unserem besonderen Willkommensvorteil.
• Gratis Haltegriff – für mehr Komfort und Sicherheit in Ihrem Alltag.

Unser Ziel ist es, Ihr Leben leichter, sicherer und komfortabler zu machen.

Im Anhang erhalten Sie wie gewünscht die folgenden Unterlagen:

${attachmentList}

Bitte füllen Sie die Dokumente aus und senden Sie uns diese unterschrieben zurück – gerne bequem per E-Mail an service@e-m-c-2.de.

Keine Möglichkeit, die Dokumente auszudrucken? Kein Problem - nutzen Sie einfach nachfolgenden Link, um die Dokumente online auszufüllen, zu unterschreiben und direkt an uns zurückzuschicken:

{{SIGN_LINK}}

${$antragGestellt?.checked ? "" : "Sobald uns Ihre Unterlagen vorliegen, übernehmen wir für Sie sämtliche weiteren Schritte und stellen den Antrag auf Zuschuss direkt bei Ihrer Pflegekasse – selbstverständlich kostenfrei. Dank unserer langjährigen Erfahrung und etablierten Zusammenarbeit mit allen Pflege- und Krankenkassen profitieren Sie von einer reibungslosen und professionellen Abwicklung.\n\n"}Bei Rückfragen stehe ich Ihnen gerne zur Verfügung.`;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatInlineHtml(text) {
    const escaped = escapeHtml(text);
    const withEmails = escaped.replace(
      /([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi,
      '<a href="mailto:$1" style="color:#00a86b;text-decoration:none;">$1</a>',
    );

    return withEmails.replace(/\b((?:https?:\/\/|www\.)[^\s<]+)\b/gi, (match) => {
      const href = /^https?:\/\//i.test(match) ? match : `https://${match}`;
      // The online-signing link gets a descriptive label instead of the raw URL.
      const linkText = /\/sign\//.test(match)
        ? "&gt;&gt; Hier Unterlagen online ausfüllen und unterzeichnen &lt;&lt;"
        : match;
      return `<a href="${escapeHtml(href)}" style="color:#00a86b;text-decoration:none;">${linkText}</a>`;
    });
  }

  function renderBodyHtmlFromText(body) {
    const lines = String(body || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
    const parts = [];
    let paragraphBuffer = [];
    let bulletBuffer = [];
    let orderedBuffer = [];

    function flushParagraph() {
      if (!paragraphBuffer.length) return;
      const text = paragraphBuffer.join(" ").trim();
      if (text) {
        // The sign-link intro sentence is emphasised in bold.
        const bold = /^Keine Möglichkeit, die Dokumente auszudrucken\?/.test(text);
        const weight = bold ? "font-weight:bold;" : "";
        parts.push(
          `<p style="margin:0 0 18px 0;line-height:1.55;color:#364047;font-size:16px;${weight}">${formatInlineHtml(text)}</p>`,
        );
      }
      paragraphBuffer = [];
    }

    function flushBullets() {
      if (!bulletBuffer.length) return;
      parts.push(
        `<ul style="margin:0 0 24px 22px;padding:0;color:#364047;">${bulletBuffer
          .map(
            (item) =>
              `<li style="margin:0 0 10px 0;line-height:1.5;font-size:16px;"><strong>${formatInlineHtml(item)}</strong></li>`,
          )
          .join("")}</ul>`,
      );
      bulletBuffer = [];
    }

    function flushOrdered() {
      if (!orderedBuffer.length) return;
      parts.push(
        `<ol style="margin:0 0 24px 28px;padding:0;color:#364047;">${orderedBuffer
          .map(
            (item) =>
              `<li style="margin:0 0 10px 0;line-height:1.5;font-size:16px;"><strong>${formatInlineHtml(item)}</strong></li>`,
          )
          .join("")}</ol>`,
      );
      orderedBuffer = [];
    }

    function flushAll() {
      flushParagraph();
      flushBullets();
      flushOrdered();
    }

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) {
        flushAll();
        continue;
      }

      const bulletMatch = line.match(/^[•*-]\s+(.*)$/);
      if (bulletMatch) {
        flushParagraph();
        flushOrdered();
        bulletBuffer.push(bulletMatch[1].trim());
        continue;
      }

      const orderedMatch = line.match(/^\d+\.\s+(.*)$/);
      if (orderedMatch) {
        flushParagraph();
        flushBullets();
        orderedBuffer.push(orderedMatch[1].trim());
        continue;
      }

      flushBullets();
      flushOrdered();
      paragraphBuffer.push(line);
    }

    flushAll();
    return parts.join("");
  }

  // Fallback name for the signature when no Ansprechpartner is set yet: the
  // logged-in user (fetched once). ansprechpartner.js normally fills
  // #emc2_contact with the default/selected user; this only covers the brief
  // window before that resolves.
  let loggedInName = "";

  // BU footer (default) vs AH footer (EmC2 Soziale Dienste UG contact block,
  // incl. Steuer-Nr./Geschäftsführer) — mirrors src/lib/emailTemplate.js.
  function buildFooterHtml() {
    const p = (text, extraMargin) =>
      `<p style="margin:0${extraMargin ? ` 0 ${extraMargin}px 0` : ""};line-height:1.5;color:#364047;font-size:16px;">${text}</p>`;

    if (getOfferType() === "ah") {
      return [
        p("emc2 Attila Landgrafe"),
        p("Waldstraße 5"),
        p("95032 Hof"),
        p("Deutschland", 22),
        p("Tel.: 09281 5915900"),
        p("Fax.: 09281 5915909"),
        p(
          'Email: <a href="mailto:kontakt@e-m-c-2.de" style="color:#00a86b;text-decoration:none;">kontakt@e-m-c-2.de</a>',
        ),
        p('Web: <a href="https://emczwei.de" style="color:#00a86b;text-decoration:none;">emczwei.de</a>', 22),
        p("Hof/Saale"),
        p("Steuer-Nr.: 223/147/40118"),
        p("Geschäftsführer: Attila Landgrafe", 24),
      ].join("\n      ");
    }

    return [
      p("EmC2 Attila Landgrafe"),
      p("Waldstr. 5 / 95032 Hof", 22),
      p("Tel.: +49 9281 5915900"),
      p("Fax: +49 9281 5915909"),
      p(
        'Mail: <a href="mailto:service@e-m-c-2.de" style="color:#00a86b;text-decoration:none;">service@e-m-c-2.de</a>',
      ),
      p('Web: <a href="https://www.emczwei.de" style="color:#00a86b;text-decoration:none;">www.emczwei.de</a>', 24),
    ].join("\n      ");
  }

  function buildPreviewHtml(body) {
    const signatureSrc = new URL("./assets/signaturepicture.png", window.location.href).href;
    const contactName =
      (document.getElementById("emc2_contact")?.value || "").trim() || loggedInName;
    return `<!DOCTYPE html>
<html lang="de">
  <body style="margin:0;padding:24px;background:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#364047;">
    <div style="max-width:980px;margin:0 auto;">
      ${renderBodyHtmlFromText(body)}
      <p style="margin:0 0 8px 0;line-height:1.55;color:#364047;font-size:16px;">--</p>
      <p style="margin:0 0 24px 0;line-height:1.55;color:#364047;font-size:16px;">Freundliche Grüße</p>
      <p style="margin:0 0 6px 0;line-height:1.5;color:#364047;font-size:16px;">${escapeHtml(contactName)}</p>
      <p style="margin:0 0 28px 0;line-height:1.5;color:#364047;font-size:16px;">Ihr Team von emc2</p>
      <p style="margin:0 0 18px 0;line-height:1.5;color:#364047;font-size:16px;">______________________________</p>
      ${buildFooterHtml()}
      <div style="margin:0 0 24px 0;"><img src="${signatureSrc}" alt="Signatur emc2" style="display:block;max-width:220px;width:220px;height:auto;border:0;" /></div>
      <p style="margin:0;line-height:1.7;color:#364047;font-size:12px;">
        Diese E-Mail enthält vertrauliche und/oder rechtlich geschützte Informationen. Der Inhalt dieser E-Mail ist ausschließlich für den bezeichneten Adressaten bestimmt. Bitte beachten Sie in diesem Fall, dass jede Form der Kenntnisnahme, Veröffentlichung, Vervielfältigung oder Weitergabe des Inhalts dieser E-Mail unzulässig ist. Wenn Sie nicht der richtige Adressat bzw. sein Vertreter sind oder diese E-Mail irrtümlich erhalten haben, informieren Sie bitte sofort den Absender und vernichten Sie diese E-Mail. Vielen Dank.
      </p>
    </div>
  </body>
</html>`;
  }

  function updatePreview() {
    if (!$preview) return;
    const doc = $preview.contentWindow?.document;
    if (!doc) return;
    // The {{SIGN_LINK}} marker is replaced with the real link on send; show a
    // friendly note in the preview instead of the raw marker.
    const previewBody = (($body.value || "")).split("{{SIGN_LINK}}").join(
      "(Ihr persönlicher Link wird beim Versand automatisch eingefügt)",
    );
    doc.open();
    doc.write(buildPreviewHtml(previewBody));
    doc.close();
  }

  function updateRecipientDefault() {
    if (toTouched) return;
    const v = ($customerEmail?.value || "").trim();
    if (v) $to.value = v;
  }

  function updateCcDefault() {
    if (ccTouched || !$cc) return;
    const v = ($cpEmail?.value || "").trim();
    $cc.value = v;
  }

  function updateBodyDefault() {
    if (bodyTouched) return;
    $body.value = buildDefaultMailBody();
    updatePreview();
  }

  function updateMailPrefills() {
    updateRecipientDefault();
    updateCcDefault();
    updateBodyDefault();
    updatePreview();
  }

  // Listen to Kundendaten changes
  $customerEmail?.addEventListener("input", updateRecipientDefault);
  $customerEmail?.addEventListener("change", updateRecipientDefault);

  $cpEmail?.addEventListener("input", updateCcDefault);
  $cpEmail?.addEventListener("change", updateCcDefault);

  document.querySelectorAll('input[name="hasContactPerson"]').forEach((el) => {
    el.addEventListener("change", () => {
      updateCcDefault();
      updateBodyDefault();
    });
  });
  document.querySelectorAll('input[name="cp_salutation"]').forEach((el) => {
    el.addEventListener("change", updateBodyDefault);
  });
  $cpName?.addEventListener("input", updateBodyDefault);
  $cpName?.addEventListener("change", updateBodyDefault);

  $lastName?.addEventListener("input", updateBodyDefault);
  $lastName?.addEventListener("change", updateBodyDefault);

  document.querySelectorAll('input[name="salutation"]').forEach((el) => {
    el.addEventListener("change", updateBodyDefault);
  });

  // Two-person offer: rebuild greeting when the checkbox or partner name changes.
  document.querySelectorAll('input[name="twoPersons"]').forEach((el) => {
    el.addEventListener("change", updateBodyDefault);
  });
  ["partnerSalutation", "partnerLastName"].forEach((id) => {
    const el = document.getElementById(id);
    el?.addEventListener("input", updateBodyDefault);
    el?.addEventListener("change", updateBodyDefault);
  });

  $antragGestellt?.addEventListener("change", () => {
    updateBodyDefault();
    updatePreview();
  });

  // Selbstzahler/Kassenkunde toggle: rebuild body (doc list) AND the attachment
  // tiles (2 vs 4), then refresh the preview.
  document.querySelectorAll('input[name="payer"]').forEach((el) => {
    el.addEventListener("change", () => {
      updateBodyDefault();
      renderList();
      updatePreview();
    });
  });

  // Rebuild body when offer number changes (only if body wasn't manually edited)
  $offerNumber?.addEventListener("input", updateBodyDefault);
  $offerNumber?.addEventListener("change", updateBodyDefault);

  $body.addEventListener("input", updatePreview);
  $body.addEventListener("change", updatePreview);

  // Ansprechpartner selection: ansprechpartner.js writes the chosen user's name
  // into #emc2_contact and fires an "input" event — refresh the preview so the
  // signature name follows the selection (and the async default on load).
  const $contact = document.getElementById("emc2_contact");
  $contact?.addEventListener("input", updatePreview);
  $contact?.addEventListener("change", updatePreview);

  // Cache the logged-in user as the empty-state fallback name.
  fetch("/api/auth/me", { credentials: "same-origin" })
    .then((r) => (r.ok ? r.json() : null))
    .then((res) => {
      loggedInName = (res?.user?.name || "").trim();
      updatePreview();
    })
    .catch(() => {});

  // Initial prefill on load
  updateMailPrefills();

  // -----------------------------
  // Attachment handling
  // -----------------------------
  function syncFileInput() {
    const dt = new DataTransfer();
    for (const f of userFiles) dt.items.add(f);
    $files.files = dt.files;
  }

  function fmtSize(bytes) {
    const n = Number(bytes) || 0;
    if (!n) return "";
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  }

  function makeTile({ name, meta, removable, onRemove }) {
    const tile = document.createElement("div");
    tile.className = "mail-attach-tile";
    // CSS picks the file-type glyph from this attribute.
    tile.dataset.ext = (String(name).split(".").pop() || "").toLowerCase();

    const main = document.createElement("div");
    main.className = "mail-attach-main";

    const label = document.createElement("div");
    label.className = "mail-attach-name";
    label.textContent = name;
    label.title = name;
    main.appendChild(label);

    if (meta) {
      const m = document.createElement("div");
      m.className = "mail-attach-meta";
      m.textContent = meta;
      main.appendChild(m);
    }

    tile.appendChild(main);

    if (removable) {
      const x = document.createElement("button");
      x.type = "button";
      x.className = "mail-attach-x";
      x.textContent = "✕";
      x.title = `${name} entfernen`;
      x.setAttribute("aria-label", `${name} entfernen`);
      x.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        onRemove?.();
      });
      tile.appendChild(x);
    } else {
      const lock = document.createElement("span");
      lock.className = "mail-attach-lock";
      lock.textContent = "Pflicht";
      tile.appendChild(lock);
    }

    return tile;
  }

  function renderList() {
    $list.innerHTML = "";

    // Offer PDF (always attached by backend)
    const offerNumber = getOfferNumber();
    const offerPdfName = `${offerNumber || "Angebot"}.pdf`;
    $list.appendChild(makeTile({ name: offerPdfName, meta: "Angebots-PDF", removable: false }));

    // Presets (Selbstzahler: no Abtretung/Vollmacht -> fewer attachments)
    const isSZ =
      document.querySelector('input[name="payer"]:checked')?.value === "Selbstzahler";
    const isAh = getOfferType() === "ah";
    const presetList = isAh ? cfg.ahPresetAttachments : cfg.presetAttachments;
    // Non-AH: the checkboxes decide (excludedPreset). AH keeps its own payer rule.
    const payerHidden =
      isSZ && isAh ? new Set(["abtretung_ah", "vollmacht"]) : new Set();
    for (const p of presetList) {
      if (payerHidden.has(p.id)) continue;
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
          meta: `Hinzugefügt · ${fmtSize(f.size)}`,
          removable: true,
          onRemove: () => {
            userFiles.splice(idx, 1);
            syncFileInput();
            renderList();
          },
        }),
      );
    });

    const $count = document.getElementById("mailAttachCount");
    if ($count) {
      const n = $list.childElementCount;
      $count.textContent = n === 1 ? "1 Datei" : `${n} Dateien`;
    }
  }

  // de-dup by name+size+lastModified
  function dedup(files) {
    const seen = new Set();
    return files.filter((f) => {
      const k = `${f.name}|${f.size}|${f.lastModified}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  $files.addEventListener("change", () => {
    userFiles = dedup(userFiles.concat(Array.from($files.files || [])));
    syncFileInput();
    renderList();
  });

  $bitrixFiles?.addEventListener("change", () => {
    bitrixFiles = dedup(bitrixFiles.concat(Array.from($bitrixFiles.files || [])));
    renderBitrixList();
  });

  function renderBitrixList() {
    if (!$bitrixList) return;
    $bitrixList.innerHTML = "";
    bitrixFiles.forEach((f, idx) => {
      $bitrixList.appendChild(
        makeTile({
          name: f.name,
          meta: `Nur Bitrix · ${fmtSize(f.size)}`,
          removable: true,
          onRemove: () => {
            bitrixFiles.splice(idx, 1);
            renderBitrixList();
          },
        }),
      );
    });
    const $count = document.getElementById("mailBitrixAttachCount");
    if ($count) {
      const n = bitrixFiles.length;
      $count.textContent = n === 1 ? "1 Datei" : `${n} Dateien`;
    }
  }

  renderBitrixList();

  // ---- Grundriss / Fotos (iPad workflow) --------------------------------
  // A magicplan screenshot lives in Photos; on iOS this file input opens the
  // native sheet, so it is 3 taps. Images are downscaled before upload —
  // an iPad screenshot is ~4 MB PNG, Bitrix chokes on a timeline full of those.
  const $planZone = document.getElementById("planDropZone");
  const $planFiles = document.getElementById("planFiles");

  const MAX_EDGE = 1600;

  async function downscaleImage(file) {
    if (!/^image\//.test(file.type || "")) return file;
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
      const w = Math.round(bitmap.width * scale);
      const h = Math.round(bitmap.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d").drawImage(bitmap, 0, 0, w, h);
      bitmap.close?.();
      const blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.85));
      if (!blob) return file;
      const base = (file.name || "Grundriss").replace(/\.[^.]+$/, "");
      return new File([blob], `${base}.jpg`, { type: "image/jpeg" });
    } catch (e) {
      // HEIC or anything the browser can't decode: send the original.
      console.warn("[EmailManager] Bild-Verkleinerung fehlgeschlagen:", e);
      return file;
    }
  }

  async function addPlanFiles(files) {
    const imgs = Array.from(files || []).filter((f) => /^image\//.test(f.type || ""));
    if (!imgs.length) return;
    const stamp = new Date().toISOString().slice(0, 10);
    const prepared = [];
    for (const [i, f] of imgs.entries()) {
      const small = await downscaleImage(f);
      // Screenshots are all called "image.png" — give them a useful name.
      const named = /^(image|screenshot|img)[-_. 0-9]*\.(jpe?g|png)$/i.test(small.name)
        ? new File([small], `Grundriss_${stamp}_${i + 1}.jpg`, { type: small.type })
        : small;
      prepared.push(named);
    }
    bitrixFiles = dedup(bitrixFiles.concat(prepared));
    renderBitrixList();
  }

  $planZone?.addEventListener("click", () => $planFiles?.click());
  $planZone?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      $planFiles?.click();
    }
  });
  $planFiles?.addEventListener("change", async () => {
    await addPlanFiles($planFiles.files);
    $planFiles.value = "";
  });

  ["dragenter", "dragover"].forEach((ev) =>
    $planZone?.addEventListener(ev, (e) => {
      e.preventDefault();
      $planZone.classList.add("drag-over");
    }),
  );
  ["dragleave", "drop"].forEach((ev) =>
    $planZone?.addEventListener(ev, () => $planZone.classList.remove("drag-over")),
  );
  $planZone?.addEventListener("drop", (e) => {
    e.preventDefault();
    addPlanFiles(e.dataTransfer?.files);
  });

  // Paste an image from the clipboard (iPad: copy screenshot → ⌘V / Einsetzen).
  // Ignored while typing in a field so it never hijacks a normal text paste.
  document.addEventListener("paste", (e) => {
    if (!$planZone || !document.body.contains($planZone)) return;
    const t = e.target;
    if (t && (t.matches?.("input, textarea") || t.isContentEditable)) return;
    const files = Array.from(e.clipboardData?.files || []).filter((f) =>
      /^image\//.test(f.type || ""),
    );
    if (!files.length) return;
    e.preventDefault();
    addPlanFiles(files);
  });

  renderList();

  function reset() {
    excludedPreset.clear();
    userFiles = [];
    bitrixFiles = [];
    if ($bitrixFiles) $bitrixFiles.value = "";
    subjectTouched = false;
    toTouched = false;
    ccTouched = false;
    bodyTouched = false;

    $to.value = "";
    if ($cc) $cc.value = "";
    $subject.value = "";
    $body.value = "";
    $files.value = "";
    clearEditedDocx();

    syncFileInput();
    renderList();
    renderBitrixList();
    updatePreview();

    $status.classList.remove("mail-log");
    $status.textContent = "";
    $status.dataset.type = "";
    $status.hidden = true;

    markInvalid($leadId, false);
    markInvalid($mainAuftragId, false);
  }

  function refreshPrefills() {
    updateSubjectDefault();
    updateMailPrefills();
    renderList();
    updatePreview();
  }

  window.addEventListener("offerflow:changed", () => {
    refreshPrefills();
  });

  // Extra documents attached to the Bitrix timeline comment only (NOT the
  // customer email): Angebot DOCX, Hassmann CSV, Kalkulation PDF. If any of
  // these fails, the whole send aborts — we never email a partial document set.
  async function fetchBitrixExtraDoc(endpoint, payload, fallbackName) {
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      const txt = await resp.text().catch(() => "");
      throw new Error(`${endpoint} (${resp.status}): ${txt}`);
    }
    const cd = resp.headers.get("content-disposition") || "";
    let filename = fallbackName;
    const match = cd.match(/filename="?([^"]+)"?/i);
    if (match && match[1]) filename = match[1];
    return { blob: await resp.blob(), filename };
  }

  // Extra documents for the Bitrix timeline — used by the e-mail send and, via
  // window.__collectBitrixDocs, by the postal send, so both archive the same set.
  // The Kalkulation comes from /kalkulation/pdf-v2, the HTML-rendered "Neue
  // Version"; the old DOCX-based /kalkulation/pdf stays available for manual
  // download only.
  // onError turns the all-or-nothing behaviour into best-effort: the e-mail
  // send omits it and aborts on the first failure (never mail a partial set),
  // the postal send passes it so a broken document can't block the postage.
  async function collectBitrixDocs(
    payload,
    offerNumber,
    onStep,
    { skipAngebotDocx = false, onError = null } = {},
  ) {
    const safeNo = String(offerNumber || "Angebot").replace(/[^A-Za-z0-9_\-]+/g, "_");
    const jobs = [
      { endpoint: "/docx-template", name: `${safeNo}.docx`, label: "Angebot-DOCX" },
      { endpoint: "/material-overview/hassmann-cart", name: `Hassmann_Warenkorb_${safeNo}.csv`, label: "Hassmann-Warenkorb (CSV)" },
      { endpoint: "/kalkulation/pdf-v2", name: `Kalkulation_${safeNo}.pdf`, label: "Kalkulation-PDF" },
      // When a hand-edited DOCX is sent, the backend archives that file on the
      // Bitrix timeline instead of a freshly rendered (unedited) Angebot-DOCX.
    ].filter((j) => !(skipAngebotDocx && j.endpoint === "/docx-template"));
    const docs = [];
    for (const job of jobs) {
      onStep?.(`Erzeuge ${job.label} …`);
      try {
        docs.push(await fetchBitrixExtraDoc(job.endpoint, payload, job.name));
      } catch (e) {
        console.error("[EmailManager] Bitrix-Dokument fehlgeschlagen:", job.endpoint, e);
        const message = `${job.label} konnte nicht erzeugt werden: ${e.message || e}`;
        if (!onError) throw new Error(message);
        onError(message);
      }
    }
    return docs;
  }
  window.__collectBitrixDocs = collectBitrixDocs;

  async function send({ bitrixOnly = false } = {}) {
    try {
      if (cfg.hooks.requireBereichValid && !cfg.hooks.requireBereichValid()) {
        location.hash = "Kundendaten";
        return false;
      }

      const leadId = syncLeadIdFields($leadId);
      if (!leadId) {
        markInvalid($leadId, true);
        markInvalid($mainAuftragId, true);
        setStatus("Please fill in the Lead ID / Auftrag ID before sending the email.", "error");
        $leadId.focus();
        return false;
      }

      const to = ($to.value || "").trim();
      if (!to && !bitrixOnly) {
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

      try {
        await cfg.hooks.saveDraftBeforeSend?.();
      } catch (e) {
        console.warn("Auto-Entwurf vor dem Senden fehlgeschlagen:", e);
      }

      const offerNumber = getOfferNumber();
      const dealId = String($leadId?.value || $mainAuftragId?.value || "").trim();
      const contactId = String(
        document.querySelector(cfg.bitrix.contactIdSelector)?.value || "",
      ).trim();

      setSendingState(true);
      startStatusLog();
      pushStatus(
        bitrixOnly ? "Bitrix-Ablage gestartet …" : "Sende-Vorgang gestartet …",
      );

      // Optional hand-edited Angebot-DOCX: sent to the backend, which converts
      // it to PDF instead of rendering a fresh offer.
      const editedFile = $editedDocx?.files?.[0] || null;
      if (editedFile && !/\.docx$/i.test(editedFile.name)) {
        pushStatus("Die geänderte Datei muss eine .docx sein.", "error");
        return false;
      }
      if (editedFile) pushStatus(`Geänderte DOCX wird verwendet: ${editedFile.name}`);

      // Generate the extra Bitrix documents (Angebot DOCX, Hassmann CSV,
      // Kalkulation PDF) up front so they can be attached to the timeline comment.
      const bitrixDocs = await collectBitrixDocs(payload, offerNumber, pushStatus, {
        skipAngebotDocx: !!editedFile,
      });

      pushStatus(
        bitrixOnly
          ? (editedFile
              ? "Konvertiere geänderte DOCX zu PDF & lege Dokumente in Bitrix ab …"
              : "Erzeuge Angebots-PDF & lege Dokumente in Bitrix ab …")
          : (editedFile
              ? "Konvertiere geänderte DOCX zu PDF & sende E-Mail …"
              : "Erzeuge Angebots-PDF & sende E-Mail …"),
      );

      const subject = ($subject.value || offerNumber || "Angebot").trim();
      const body = $body.value || "";

      // Developer option: suppress presets on the Bitrix timeline only
      // (the customer email keeps them regardless).
      const excludeBitrixPresets = !!document.getElementById("devExcludeBitrixPresets")?.checked;

      const cc = ($cc?.value || "").trim();

      const fd = new FormData();
      fd.append("to", to);
      if (bitrixOnly) fd.append("bitrixOnly", "1");
      if (cc) fd.append("cc", cc);
      fd.append("subject", subject);
      fd.append("body", body);
      fd.append("offerNumber", offerNumber);
      fd.append("offerType", payload.activeOffer || "");
      fd.append("payload", JSON.stringify(payload));
      fd.append("excludePreset", JSON.stringify(Array.from(excludedPreset)));
      fd.append("excludeBitrixPresets", excludeBitrixPresets ? "1" : "");
      fd.append("dealId", dealId);
      fd.append("contactId", contactId);

      for (const f of userFiles) fd.append("attachments", f, f.name);
      for (const d of bitrixDocs) fd.append("bitrixDocs", d.blob, d.filename);
      for (const f of bitrixFiles) fd.append("bitrixDocs", f, f.name);
      if (editedFile) fd.append("editedDocx", editedFile, editedFile.name);

      const sendTimeout = AbortSignal.timeout(60000);
      let res;
      try {
        res = await fetch(cfg.apiUrl, { method: "POST", body: fd, signal: sendTimeout });
      } catch (err) {
        if (err.name === "TimeoutError" || err.name === "AbortError") {
          throw new Error(
            "Zeitüberschreitung — der Server antwortet nicht. Bitte nicht neu laden, kurz warten und Bitrix prüfen, ob die Mail trotzdem verschickt wurde, bevor erneut gesendet wird.",
          );
        }
        throw err;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || err.error || `HTTP ${res.status}`);
      }

      const data = await res.json().catch(() => ({}));

      pushStatus(
        `${bitrixOnly ? "In Bitrix abgelegt" : "E-Mail gesendet"} — Anhänge: ${data.attachmentNames?.join(", ") || "-"}`,
        "success",
      );

      // Clear the edited-DOCX choice so it can't silently apply to the next send.
      clearEditedDocx();

      // Success dialog with the optional "move deal to ANG verschickt" action.
      try {
        const tgt = getBitrixTarget();
        showSentDialog({
          bitrixOnly,
          dealId: tgt?.entityType === "deal" ? tgt.entityId : "",
          offerTotal: Number(data?.offerTotal) || 0,
          attachmentNames: data.attachmentNames || [],
          offerExtra: {
            workDays: Number(payload?.Arbeitszeit?.workDays) || 0,
            offerType: payload.activeOffer || "",
            offerNumber,
            isKassenkunde: payload?.Kundendaten?.payer === "Kassenkunde",
            selfPayAmount: Number(data?.selfPayAmount) || 0,
            finalTotal: Number(data?.offerTotal) || 0,
            // Full offer payload — only used by the backend for AH, to derive
            // its own set of Bitrix fields (Anfahrtszone, Art der Leistung, …).
            payload,
          },
        });
      } catch (e) {
        console.warn("[EmailManager] sent dialog failed:", e);
      }

      if (!bitrixOnly && !data?.bitrixComment) {
        try {
          const comment = buildBitrixEmailComment({
            offerNumber,
            to,
            subject,
            body,
            attachmentNames: data.attachmentNames || [],
          });
          await postBitrixEmailComment({ comment });
        } catch (e) {
          console.warn("[EmailManager] Bitrix timeline comment failed:", e);
        }
      }

      try {
        await cfg.hooks.saveFinalOfferSnapshot?.();
      } catch {}

      return true;
    } catch (e) {
      console.error("[EmailManager] send failed:", e);
      pushStatus(`Senden fehlgeschlagen: ${e.message || e}`, "error");
      return false;
    } finally {
      setSendingState(false);
    }
  }

  function setSendingState(busy) {
    $btn.disabled = busy;
    if ($btnBitrix) $btnBitrix.disabled = busy;
  }

  $btn.addEventListener("click", (e) => {
    e.preventDefault();
    send();
  });

  $btnBitrix?.addEventListener("click", (e) => {
    e.preventDefault();
    send({ bitrixOnly: true });
  });

  window.__showSentDialog = showSentDialog;

  return { send, render: renderList, excludedPreset, reset, refreshPrefills, syncDocListInBody };
}
