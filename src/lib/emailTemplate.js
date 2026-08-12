// Shared branded email HTML template + helpers.
// Used by the Zusammenfassung offer mail (routes/email.js) and the
// online-signing confirmation mail (routes/signing.js) so both share one
// source of truth for branding, footer and legal disclaimer.

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function formatInlineHtml(text) {
  const escaped = escapeHtml(text);
  const withEmails = escaped.replace(
    /([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi,
    '<a href="mailto:$1" style="color:#00a86b;text-decoration:none;">$1</a>'
  );

  return withEmails.replace(
    /\b((?:https?:\/\/|www\.)[^\s<]+)\b/gi,
    (match) => {
      const href = /^https?:\/\//i.test(match) ? match : `https://${match}`;
      // The online-signing link gets a descriptive label instead of the raw URL.
      const linkText = /\/sign\//.test(match)
        ? "&gt;&gt; Jetzt weitere Angaben erfassen (hier klicken) &lt;&lt;"
        : match;
      return `<a href="${escapeHtml(href)}" style="color:#00a86b;text-decoration:none;">${linkText}</a>`;
    }
  );
}

export function renderBodyHtmlFromText(body) {
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
        `<p style="margin:0 0 18px 0;line-height:1.55;color:#364047;font-size:12px;${weight}">${formatInlineHtml(text)}</p>`
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
            `<li style="margin:0 0 10px 0;line-height:1.5;font-size:12px;"><strong>${formatInlineHtml(
              item
            )}</strong></li>`
        )
        .join("")}</ul>`
    );
    bulletBuffer = [];
  }

  function flushOrdered() {
    if (!orderedBuffer.length) return;
    parts.push(
      `<ol style="margin:0 0 24px 28px;padding:0;color:#364047;">${orderedBuffer
        .map(
          (item) =>
            `<li style="margin:0 0 10px 0;line-height:1.5;font-size:12px;"><strong>${formatInlineHtml(
              item
            )}</strong></li>`
        )
        .join("")}</ol>`
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

// BU footer (default) vs AH footer (EmC2 Soziale Dienste UG contact block,
// incl. Steuer-Nr./Geschäftsführer). Selected via isAh.
function footerHtml(isAh) {
  const p = (text, extraMargin) =>
    `<p style="margin:0${extraMargin ? ` 0 ${extraMargin}px 0` : ""};line-height:1.5;color:#364047;font-size:9px;">${text}</p>`;

  if (isAh) {
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
      p(
        'Web: <a href="https://emczwei.de" style="color:#00a86b;text-decoration:none;">emczwei.de</a>',
        22,
      ),
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
    p(
      'Web: <a href="https://www.emczwei.de" style="color:#00a86b;text-decoration:none;">www.emczwei.de</a>',
      24,
    ),
  ].join("\n      ");
}

export function buildEmailHtml(
  body,
  { signatureCid = null, contactName = "Stefan Wolfrum", isAh = false } = {},
) {
  const signatureImageHtml = signatureCid
    ? `<div style="margin:0 0 24px 0;"><img src="cid:${signatureCid}" alt="Signatur emc2" style="display:block;max-width:220px;width:220px;height:auto;border:0;" /></div>`
    : "";

  // Personal name line is omitted when contactName is empty (e.g. the
  // signing-confirmation mail is signed generically as "Ihr Team von emc2").
  const contactNameHtml = String(contactName || "").trim()
    ? `<p style="margin:0 0 6px 0;line-height:1.5;color:#364047;font-size:12px;">${escapeHtml(contactName)}</p>`
    : "";

  return `<!DOCTYPE html>
<html lang="de">
  <body style="margin:0;padding:0;background:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#364047;">
    <div style="max-width:640px;margin:0;padding:24px 20px 12px 20px;">
      ${renderBodyHtmlFromText(body)}
      <p style="margin:0 0 8px 0;line-height:1.55;color:#364047;font-size:12px;">--</p>
      <p style="margin:0 0 24px 0;line-height:1.55;color:#364047;font-size:12px;">Freundliche Grüße</p>
      ${contactNameHtml}
      <p style="margin:0 0 28px 0;line-height:1.5;color:#364047;font-size:12px;">Ihr Team von emc2</p>
      <p style="margin:0 0 18px 0;line-height:1.5;color:#364047;font-size:12px;">______________________________</p>
      ${footerHtml(isAh)}
      ${signatureImageHtml}
      <p style="margin:0;line-height:1.7;color:#364047;font-size:9px;">
        Diese E-Mail enthält vertrauliche und/oder rechtlich geschützte Informationen. Der Inhalt dieser E-Mail ist ausschließlich für den bezeichneten Adressaten bestimmt. Bitte beachten Sie in diesem Fall, dass jede Form der Kenntnisnahme, Veröffentlichung, Vervielfältigung oder Weitergabe des Inhalts dieser E-Mail unzulässig ist. Wenn Sie nicht der richtige Adressat bzw. sein Vertreter sind oder diese E-Mail irrtümlich erhalten haben, informieren Sie bitte sofort den Absender und vernichten Sie diese E-Mail. Vielen Dank.
      </p>
    </div>
  </body>
</html>`;
}
