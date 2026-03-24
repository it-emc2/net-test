
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

1. Ihr Angebot ${offerNumber}
2. Abtretungserklärung zur Abrechnung mit der Krankenkasse
3. Vollmacht zur Beantragung des Zuschusses nach §40 Abs. 3, 4, 5 SGB XI
4. Unseren aktuellen Flyer "Barrierefreies Wohnen"

Bitte füllen Sie die Dokumente aus und senden Sie uns diese unterschrieben zurück – gerne bequem per E-Mail an service@e-m-c-2.de.

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
        parts.push(
          `<p style="margin:0 0 18px 0;line-height:1.55;color:#364047;font-size:16px;">${formatInlineHtml(text)}</p>`,
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
    return `<!DOCTYPE html>
<html lang="de">
  <body style="margin:0;padding:24px;background:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#364047;">
    <div style="max-width:980px;margin:0 auto;">
      ${renderBodyHtmlFromText(body)}
      <p style="margin:0 0 8px 0;line-height:1.55;color:#364047;font-size:16px;">--</p>
      <p style="margin:0 0 24px 0;line-height:1.55;color:#364047;font-size:16px;">Freundliche Grüße</p>
      <div style="margin:22px 0 14px 0;"><img src="${signatureSrc}" alt="Signatur emc2" style="display:block;max-width:220px;width:220px;height:auto;border:0;" /></div>
      <p style="margin:0 0 6px 0;line-height:1.5;color:#364047;font-size:16px;">Stefan Wolfrum</p>
      <p style="margin:0 0 28px 0;line-height:1.5;color:#364047;font-size:16px;">Ihr Team von emc2</p>
      <p style="margin:0 0 18px 0;line-height:1.5;color:#364047;font-size:16px;">______________________________</p>
      <p style="margin:0;line-height:1.5;color:#364047;font-size:16px;">EmC2 Attila Landgrafe</p>
      <p style="margin:0 0 22px 0;line-height:1.5;color:#364047;font-size:16px;">Waldstr. 5 / 95032 Hof</p>
      <p style="margin:0;line-height:1.5;color:#364047;font-size:16px;">Tel.: +49 9281 5915900</p>
      <p style="margin:0;line-height:1.5;color:#364047;font-size:16px;">Fax: +49 9281 5915909</p>
      <p style="margin:0;line-height:1.5;color:#364047;font-size:16px;">Mail: <a href="mailto:service@e-m-c-2.de" style="color:#00a86b;text-decoration:none;">service@e-m-c-2.de</a></p>
      <p style="margin:0 0 24px 0;line-height:1.5;color:#364047;font-size:16px;">Web: <a href="https://www.emczwei.de" style="color:#00a86b;text-decoration:none;">www.emczwei.de</a></p>
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
    doc.open();
    doc.write(buildPreviewHtml($body.value || ""));
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

      // Best-effort Bitrix timeline comment
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
