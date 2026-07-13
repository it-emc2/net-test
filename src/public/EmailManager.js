
// EmailManager.js
// Handles offer email sending UI + attachment tiles, decoupled from script.js
// + posts a Bitrix timeline comment after successful send (best-effort)

export function initEmailManager(options = {}) {
  const cfg = {
    els: {
      btnSend: "#sendOfferMail",
      to: "#mailTo",
      subject: "#mailSubject",
      body: "#mailBody",
      preview: "#mailHtmlPreview",
      leadId: "#mailAuftragId",
      files: "#mailAttachments",
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

    hooks: {
      requireBereichValid: () => true,
      buildPayload: () => null,
      getCurrentOfferType: () => "bu",
      genOfferNumber: () => "",
      saveFinalOfferSnapshot: async () => {},
    },

    ...options,
  };

  // shallow-merge hooks + bitrix config
  cfg.hooks = { ...(cfg.hooks || {}), ...(options.hooks || {}) };
  cfg.bitrix = { ...(cfg.bitrix || {}), ...(options.bitrix || {}) };

  const $btn = document.querySelector(cfg.els.btnSend);
  const $to = document.querySelector(cfg.els.to);
  const $subject = document.querySelector(cfg.els.subject);
  const $body = document.querySelector(cfg.els.body);
  const $preview = document.querySelector(cfg.els.preview);
  const $leadId = document.querySelector(cfg.els.leadId);
  const $files = document.querySelector(cfg.els.files);
  const $list = document.querySelector(cfg.els.list);
  const $status = document.querySelector(cfg.els.status);
  const $offerNumber = document.querySelector(cfg.els.offerNumber);

  if (!$btn || !$to || !$subject || !$body || !$leadId || !$files || !$list || !$status) {
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
      .ang-stage-fields{display:flex;flex-direction:column;gap:12px;margin:0 0 14px;}
      .ang-stage-field{display:flex;flex-direction:column;gap:4px;font-size:13px;font-weight:600;color:#334049;}
      .ang-stage-field input,.ang-stage-field select{padding:9px 10px;border:1px solid #cdd6dc;
        border-radius:8px;font-size:14px;font-weight:400;}
      .ang-stage-actions{display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;}
      .ang-stage-btn{padding:9px 16px;border-radius:8px;border:1px solid #cdd6dc;background:#f2f5f7;
        cursor:pointer;font-size:14px;color:#243038;}
      .ang-stage-btn--primary{background:#00a86b;border-color:#00a86b;color:#fff;font-weight:600;}
      .ang-stage-btn:disabled{opacity:.6;cursor:default;}
      .ang-stage-status{margin:10px 0 0;font-size:13px;color:#4a575f;}
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
    const maxLen = 1400;
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
  function fmtEuro(n) {
    const num = Number(n) || 0;
    return num.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function closeStageModal() {
    document.getElementById("angStageOverlay")?.remove();
  }

  // Success dialog shown after the email was sent. Offers the stage move.
  function showSentDialog({ dealId, offerTotal, attachmentNames }) {
    closeStageModal();
    const overlay = document.createElement("div");
    overlay.id = "angStageOverlay";
    overlay.className = "ang-stage-overlay";
    const atts = Array.isArray(attachmentNames) && attachmentNames.length
      ? attachmentNames.join(", ")
      : "-";
    overlay.innerHTML = `
      <div class="ang-stage-modal" role="dialog" aria-modal="true" aria-labelledby="angStageTitle">
        <h3 id="angStageTitle" class="ang-stage-title">✅ E-Mail gesendet</h3>
        <p class="ang-stage-text">Anhänge: ${atts}</p>
        <div class="ang-stage-body"></div>
        <div class="ang-stage-actions">
          ${dealId ? `<button type="button" class="ang-stage-btn ang-stage-btn--primary" id="angStageMoveBtn">Deal auf „ANG verschickt" verschieben</button>` : ""}
          <button type="button" class="ang-stage-btn" id="angStageCloseBtn">Schließen</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeStageModal();
    });
    overlay.querySelector("#angStageCloseBtn")?.addEventListener("click", closeStageModal);
    overlay
      .querySelector("#angStageMoveBtn")
      ?.addEventListener("click", () => openStageForm({ dealId, offerTotal }));
  }

  // Fetches the empty required fields for the deal and renders inputs for them.
  async function openStageForm({ dealId, offerTotal }) {
    const body = document.querySelector("#angStageOverlay .ang-stage-body");
    const moveBtn = document.getElementById("angStageMoveBtn");
    if (!body) return;
    body.innerHTML = `<p class="ang-stage-text">Lade Felder…</p>`;
    if (moveBtn) moveBtn.disabled = true;

    let info;
    try {
      const res = await fetch(`/api/bitrix/deal/${encodeURIComponent(dealId)}/ang-verschickt-fields`);
      info = await res.json();
      if (!res.ok) throw new Error(info?.error || `HTTP ${res.status}`);
    } catch (e) {
      body.innerHTML = `<p class="ang-stage-error">Fehler beim Laden: ${e.message || e}</p>`;
      if (moveBtn) moveBtn.disabled = false;
      return;
    }

    const empties = (info.fields || []).filter((f) => f.isEmpty);
    const byName = Object.fromEntries((info.fields || []).map((f) => [f.name, f]));

    // Prefill Betrag with the offer total when the deal has none yet.
    const amountField = byName.OPPORTUNITY;
    const prefillAmount =
      amountField && amountField.isEmpty && Number(offerTotal) > 0
        ? fmtEuro(offerTotal)
        : fmtEuro(amountField?.currentValue || offerTotal || 0);
    const currencyField = byName.CURRENCY_ID;
    const currencyOptions = currencyField?.options || ["EUR"];
    const currentCurrency =
      String(currencyField?.currentValue || "").trim() || "EUR";

    if (!empties.length) {
      body.innerHTML = `<p class="ang-stage-text">Alle Pflichtfelder sind gefüllt. Der Deal kann verschoben werden.</p>`;
    } else {
      const rows = [];
      if (amountField) {
        rows.push(`
          <label class="ang-stage-field">
            <span>Betrag (€)</span>
            <input type="text" id="angFieldAmount" value="${prefillAmount}" inputmode="decimal" />
          </label>`);
      }
      if (currencyField) {
        rows.push(`
          <label class="ang-stage-field">
            <span>Währung</span>
            <select id="angFieldCurrency">
              ${currencyOptions
                .map((c) => `<option value="${c}" ${c === currentCurrency ? "selected" : ""}>${c}</option>`)
                .join("")}
            </select>
          </label>`);
      }
      body.innerHTML = `
        <p class="ang-stage-text">Bitte fehlende Felder ausfüllen:</p>
        <div class="ang-stage-fields">${rows.join("")}</div>
        <p class="ang-stage-status" id="angStageStatus" hidden></p>`;
    }

    if (moveBtn) {
      moveBtn.disabled = false;
      moveBtn.textContent = "Verschieben bestätigen";
      moveBtn.onclick = () => submitStageMove({ dealId, offerTotal });
    }
  }

  function parseEuroInput(v) {
    // "1.234,56 €" -> 1234.56
    const s = String(v || "")
      .replace(/[^\d.,-]/g, "")
      .replace(/\./g, "")
      .replace(",", ".");
    return Number(s);
  }

  async function submitStageMove({ dealId }) {
    const moveBtn = document.getElementById("angStageMoveBtn");
    const statusEl = document.getElementById("angStageStatus");
    const amountEl = document.getElementById("angFieldAmount");
    const currencyEl = document.getElementById("angFieldCurrency");

    const setModalStatus = (msg, isErr = false) => {
      if (!statusEl) return;
      statusEl.hidden = false;
      statusEl.textContent = msg;
      statusEl.classList.toggle("ang-stage-error", !!isErr);
    };

    const payload = {};
    if (amountEl) {
      const amount = parseEuroInput(amountEl.value);
      if (!(amount > 0)) {
        setModalStatus("Bitte einen gültigen Betrag eingeben.", true);
        return;
      }
      payload.opportunity = amount;
    }
    if (currencyEl) payload.currencyId = currencyEl.value;

    if (moveBtn) moveBtn.disabled = true;
    setModalStatus("Verschiebe Deal…");
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
      const body = document.querySelector("#angStageOverlay .ang-stage-body");
      if (body) {
        body.innerHTML = `<p class="ang-stage-text">✅ Deal wurde auf „ANG verschickt" verschoben.</p>`;
      }
      if (moveBtn) moveBtn.remove();
    } catch (e) {
      setModalStatus(`Fehler: ${e.message || e}`, true);
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
  let bodyTouched = false;

  $to.addEventListener("input", () => (toTouched = true));
  $body.addEventListener("input", () => (bodyTouched = true));

  const $customerEmail = document.querySelector("#email");
  const $lastName = document.querySelector("#lastName");

  function getCustomerSalutation() {
    const checked = document.querySelector('input[name="salutation"]:checked');
    return (checked?.value || "").trim(); // Frau | Herr | Familie
  }

  function buildGreetingLine() {
    const salutation = getCustomerSalutation();
    const lastName = ($lastName?.value || "").trim();

    if (salutation === "Herr") return `Sehr geehrter Herr ${lastName || "Mustermann"},`;
    if (salutation === "Frau") return `Sehr geehrte Frau ${lastName || "Mustermann"},`;
    if (salutation === "Familie") return `Sehr geehrte Familie ${lastName || "Mustermann"},`;
    return "Sehr geehrte Damen und Herren,";
  }

  function buildDefaultMailBody() {
    const offerNumber = getOfferNumber() || "ANG-2025-_____";
    const isSelbstzahler =
      document.querySelector('input[name="payer"]:checked')?.value === "Selbstzahler";
    const attachmentList = isSelbstzahler
      ? `1. Ihr Angebot ${offerNumber}\n2. Unseren aktuellen Flyer "Barrierefreies Wohnen"`
      : `1. Ihr Angebot ${offerNumber}\n2. Abtretungserklärung zur Abrechnung mit der Krankenkasse\n3. Vollmacht zur Beantragung des Zuschusses nach §40 Abs. 3, 4, 5 SGB XI\n4. Unseren aktuellen Flyer "Barrierefreies Wohnen"`;

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

Sobald uns Ihre Unterlagen vorliegen, übernehmen wir für Sie sämtliche weiteren Schritte und stellen den Antrag auf Zuschuss direkt bei Ihrer Pflegekasse – selbstverständlich kostenfrei. Dank unserer langjährigen Erfahrung und etablierten Zusammenarbeit mit allen Pflege- und Krankenkassen profitieren Sie von einer reibungslosen und professionellen Abwicklung.

Bei Rückfragen stehe ich Ihnen gerne zur Verfügung.`;
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
      return `<a href="${escapeHtml(href)}" style="color:#00a86b;text-decoration:none;">${match}</a>`;
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

  function buildPreviewHtml(body) {
    const signatureSrc = new URL("./assets/signaturepicture.png", window.location.href).href;
    const contactName =
      (document.getElementById("emc2_contact")?.value || "").trim() || "Stefan Wolfrum";
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
      <p style="margin:0;line-height:1.5;color:#364047;font-size:16px;">EmC2 Attila Landgrafe</p>
      <p style="margin:0 0 22px 0;line-height:1.5;color:#364047;font-size:16px;">Waldstr. 5 / 95032 Hof</p>
      <p style="margin:0;line-height:1.5;color:#364047;font-size:16px;">Tel.: +49 9281 5915900</p>
      <p style="margin:0;line-height:1.5;color:#364047;font-size:16px;">Fax: +49 9281 5915909</p>
      <p style="margin:0;line-height:1.5;color:#364047;font-size:16px;">Mail: <a href="mailto:service@e-m-c-2.de" style="color:#00a86b;text-decoration:none;">service@e-m-c-2.de</a></p>
      <p style="margin:0 0 24px 0;line-height:1.5;color:#364047;font-size:16px;">Web: <a href="https://www.emczwei.de" style="color:#00a86b;text-decoration:none;">www.emczwei.de</a></p>
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

  function updateBodyDefault() {
    if (bodyTouched) return;
    $body.value = buildDefaultMailBody();
    updatePreview();
  }

  function updateMailPrefills() {
    updateRecipientDefault();
    updateBodyDefault();
    updatePreview();
  }

  // Listen to Kundendaten changes
  $customerEmail?.addEventListener("input", updateRecipientDefault);
  $customerEmail?.addEventListener("change", updateRecipientDefault);

  $lastName?.addEventListener("input", updateBodyDefault);
  $lastName?.addEventListener("change", updateBodyDefault);

  document.querySelectorAll('input[name="salutation"]').forEach((el) => {
    el.addEventListener("change", updateBodyDefault);
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

  function makeTile({ name, meta, removable, onRemove }) {
    const tile = document.createElement("div");
    tile.className = "mail-attach-tile";

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
    $list.appendChild(makeTile({ name: offerPdfName, meta: "Offer PDF", removable: false }));

    // Presets (Selbstzahler: no Abtretung/Vollmacht -> 2 attachments total)
    const isSZ =
      document.querySelector('input[name="payer"]:checked')?.value === "Selbstzahler";
    const payerHidden = isSZ ? new Set(["abtretung", "vollmacht"]) : new Set();
    for (const p of cfg.presetAttachments) {
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

  function reset() {
    excludedPreset.clear();
    userFiles = [];
    subjectTouched = false;
    toTouched = false;
    bodyTouched = false;

    $to.value = "";
    $subject.value = "";
    $body.value = "";
    $files.value = "";

    syncFileInput();
    renderList();
    updatePreview();

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

  async function send() {
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
      const dealId = String($leadId?.value || $mainAuftragId?.value || "").trim();
      const contactId = String(
        document.querySelector(cfg.bitrix.contactIdSelector)?.value || "",
      ).trim();

      $btn.disabled = true;
      setStatus("Generating offer PDF + sending email…", "info");

      const subject = ($subject.value || offerNumber || "Angebot").trim();
      const body = $body.value || "";

      const fd = new FormData();
      fd.append("to", to);
      fd.append("subject", subject);
      fd.append("body", body);
      fd.append("offerNumber", offerNumber);
      fd.append("offerType", payload.activeOffer || "");
      fd.append("payload", JSON.stringify(payload));
      fd.append("excludePreset", JSON.stringify(Array.from(excludedPreset)));
      fd.append("dealId", dealId);
      fd.append("contactId", contactId);

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

      // Success dialog with the optional "move deal to ANG verschickt" action.
      try {
        const tgt = getBitrixTarget();
        showSentDialog({
          dealId: tgt?.entityType === "deal" ? tgt.entityId : "",
          offerTotal: Number(data?.offerTotal) || 0,
          attachmentNames: data.attachmentNames || [],
        });
      } catch (e) {
        console.warn("[EmailManager] sent dialog failed:", e);
      }

      if (!data?.bitrixComment) {
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

  return { send, render: renderList, excludedPreset, reset, refreshPrefills };
}
