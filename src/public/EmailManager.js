
// EmailManager.js
// Handles offer email sending UI + attachment tiles, decoupled from script.js
// + posts a Bitrix timeline comment after successful send (best-effort)

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
      { id: "vollmacht", name: "Vollmacht.pdf" },
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
  const $to = document.querySelector(cfg.els.to);
  const $cc = document.querySelector(cfg.els.cc);
  const $subject = document.querySelector(cfg.els.subject);
  const $body = document.querySelector(cfg.els.body);
  const $preview = document.querySelector(cfg.els.preview);
  const $leadId = document.querySelector(cfg.els.leadId);
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

  // expose for compatibility (some code may read this)
  window.__mailExcludedPreset = excludedPreset;

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
  function fmtEuro(n) {
    const num = Number(n) || 0;
    return num.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function closeStageModal() {
    document.getElementById("angStageOverlay")?.remove();
  }

  // Success dialog shown after the email was sent. Offers the stage move.
  function showSentDialog({ dealId, offerTotal, attachmentNames, offerExtra }) {
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
    // Use .onclick (not addEventListener) so openStageForm can replace this
    // handler with the confirm-submit one — otherwise both fire and the form
    // re-opens on every click.
    const moveBtn = overlay.querySelector("#angStageMoveBtn");
    if (moveBtn) moveBtn.onclick = () => openStageForm({ dealId, offerTotal, offerExtra });
  }

  // Fetches the empty required fields for the deal and renders inputs for them.
  async function openStageForm({ dealId, offerTotal, offerExtra }) {
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

    const byName = Object.fromEntries((info.fields || []).map((f) => [f.name, f]));

    // Betrag und Währung always mirrors the real computed offer total — no
    // manual override, so it can never drift from "Finaler Auftragswert".
    const amountField = byName.OPPORTUNITY;
    const prefillAmount = fmtEuro(
      Number(offerTotal) > 0 ? offerTotal : (amountField?.currentValue || 0),
    );

    const rows = [];
    if (amountField) {
      rows.push(`
        <label class="ang-stage-field">
          <span>Betrag (€)</span>
          <input type="text" id="angFieldAmount" value="${prefillAmount}" inputmode="decimal" />
        </label>`);
    }
    body.innerHTML = `
      <p class="ang-stage-text">Vorausgefüllt mit dem finalen Angebotsbetrag — bei Bedarf anpassbar.</p>
      <div class="ang-stage-fields">${rows.join("")}</div>
      <p class="ang-stage-status" id="angStageStatus" hidden></p>`;

    if (moveBtn) {
      moveBtn.disabled = false;
      moveBtn.textContent = "Verschieben bestätigen";
      moveBtn.onclick = () => submitStageMove({ dealId, offerExtra });
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

  async function submitStageMove({ dealId, offerExtra }) {
    const moveBtn = document.getElementById("angStageMoveBtn");
    const statusEl = document.getElementById("angStageStatus");
    const amountEl = document.getElementById("angFieldAmount");

    const setModalStatus = (msg, isErr = false) => {
      if (!statusEl) return;
      statusEl.hidden = false;
      statusEl.textContent = msg;
      statusEl.classList.toggle("ang-stage-error", !!isErr);
    };

    // Betrag is editable, but whatever value is confirmed here is also used
    // for "Finaler Auftragswert" — the two fields always mirror each other,
    // sourced from the same confirmed amount. Währung is always EUR.
    const amount = amountEl
      ? parseEuroInput(amountEl.value)
      : Number(offerExtra?.finalTotal) || 0;
    if (!(amount > 0)) {
      setModalStatus("Bitte einen gültigen Betrag eingeben.", true);
      return;
    }

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
      try {
        cfg.hooks.onDealStageMoved?.(dealId, offerExtra?.offerType);
      } catch (e) {
        console.warn("[EmailManager] onDealStageMoved hook failed:", e);
      }
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

    // Presets (Selbstzahler: no Abtretung/Vollmacht -> fewer attachments)
    const isSZ =
      document.querySelector('input[name="payer"]:checked')?.value === "Selbstzahler";
    const isAh = getOfferType() === "ah";
    const presetList = isAh ? cfg.ahPresetAttachments : cfg.presetAttachments;
    const payerHidden = isSZ
      ? new Set(isAh ? ["abtretung_ah", "vollmacht"] : ["abtretung", "vollmacht"])
      : new Set();
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
    ccTouched = false;
    bodyTouched = false;

    $to.value = "";
    if ($cc) $cc.value = "";
    $subject.value = "";
    $body.value = "";
    $files.value = "";
    if ($editedDocx) $editedDocx.value = "";

    syncFileInput();
    renderList();
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

  async function collectBitrixDocs(payload, offerNumber, onStep, { skipAngebotDocx = false } = {}) {
    const safeNo = String(offerNumber || "Angebot").replace(/[^A-Za-z0-9_\-]+/g, "_");
    const jobs = [
      { endpoint: "/docx-template", name: `${safeNo}.docx`, label: "Angebot-DOCX" },
      { endpoint: "/material-overview/hassmann-cart", name: `Hassmann_Warenkorb_${safeNo}.csv`, label: "Hassmann-Warenkorb (CSV)" },
      { endpoint: "/kalkulation/pdf", name: `Kalkulation_${safeNo}.pdf`, label: "Kalkulation-PDF" },
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
        // Abort the whole send: don't email a partial document set.
        throw new Error(`${job.label} konnte nicht erzeugt werden: ${e.message || e}`);
      }
    }
    return docs;
  }

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
      startStatusLog();
      pushStatus("Sende-Vorgang gestartet …");

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
        editedFile
          ? "Konvertiere geänderte DOCX zu PDF & sende E-Mail …"
          : "Erzeuge Angebots-PDF & sende E-Mail …",
      );

      const subject = ($subject.value || offerNumber || "Angebot").trim();
      const body = $body.value || "";

      // Developer option: suppress presets on the Bitrix timeline only
      // (the customer email keeps them regardless).
      const excludeBitrixPresets = !!document.getElementById("devExcludeBitrixPresets")?.checked;

      const cc = ($cc?.value || "").trim();

      const fd = new FormData();
      fd.append("to", to);
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
      if (editedFile) fd.append("editedDocx", editedFile, editedFile.name);

      const res = await fetch(cfg.apiUrl, { method: "POST", body: fd });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || err.error || `HTTP ${res.status}`);
      }

      const data = await res.json().catch(() => ({}));

      pushStatus(
        `E-Mail gesendet — Anhänge: ${data.attachmentNames?.join(", ") || "-"}`,
        "success",
      );

      // Clear the edited-DOCX choice so it can't silently apply to the next send.
      if ($editedDocx) $editedDocx.value = "";

      // Success dialog with the optional "move deal to ANG verschickt" action.
      try {
        const tgt = getBitrixTarget();
        showSentDialog({
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
      pushStatus(`Senden fehlgeschlagen: ${e.message || e}`, "error");
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
