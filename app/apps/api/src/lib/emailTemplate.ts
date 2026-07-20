// Branded email HTML template + helpers. Ported from the legacy
// src/lib/emailTemplate.js so the new-app offer mail keeps one source of truth
// for branding, footer and the legal disclaimer.

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function formatInlineHtml(text: unknown): string {
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

export function renderBodyHtmlFromText(body: unknown): string {
  const lines = String(body || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const parts: string[] = [];
  let paragraphBuffer: string[] = [];
  let bulletBuffer: string[] = [];
  let orderedBuffer: string[] = [];

  function flushParagraph() {
    if (!paragraphBuffer.length) return;
    const text = paragraphBuffer.join(" ").trim();
    if (text) {
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

export function buildEmailHtml(
  body: unknown,
  {
    signatureCid = null,
    contactName = "Stefan Wolfrum",
    logoSrc = null,
  }: { signatureCid?: string | null; contactName?: string; logoSrc?: string | null } = {},
): string {
  const signatureImageHtml = signatureCid
    ? `<div style="margin:0 0 24px 0;"><img src="cid:${signatureCid}" alt="Signatur emc2" style="display:block;max-width:220px;width:220px;height:auto;border:0;" /></div>`
    : "";

  // emc² logo below the Web line (cid: for real sends, data: URI for preview).
  const logoHtml = logoSrc
    ? `<p style="margin:14px 0 0 0;"><img src="${logoSrc}" alt="emc2" style="display:block;max-width:150px;width:150px;height:auto;border:0;" /></p>`
    : "";

  const contactNameHtml = String(contactName || "").trim()
    ? `<p style="margin:0 0 6px 0;line-height:1.5;color:#364047;font-size:16px;">${escapeHtml(contactName)}</p>`
    : "";

  return `<!DOCTYPE html>
<html lang="de">
  <body style="margin:0;padding:0;background:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#364047;">
    <div style="max-width:980px;margin:0;padding:16px 24px 16px 28px;">
      ${renderBodyHtmlFromText(body)}
      <p style="margin:0 0 8px 0;line-height:1.55;color:#364047;font-size:16px;">--</p>
      <p style="margin:0 0 24px 0;line-height:1.55;color:#364047;font-size:16px;">Freundliche Grüße</p>
      ${contactNameHtml}
      <p style="margin:0 0 28px 0;line-height:1.5;color:#364047;font-size:16px;">Ihr Team von emc2</p>
      <p style="margin:0 0 18px 0;line-height:1.5;color:#364047;font-size:16px;">______________________________</p>
      <p style="margin:0;line-height:1.5;color:#364047;font-size:16px;">EmC2 Attila Landgrafe</p>
      <p style="margin:0 0 22px 0;line-height:1.5;color:#364047;font-size:16px;">Waldstr. 5 / 95032 Hof</p>
      <p style="margin:0;line-height:1.5;color:#364047;font-size:16px;">Tel.: +49 9281 5915900</p>
      <p style="margin:0;line-height:1.5;color:#364047;font-size:16px;">Fax: +49 9281 5915909</p>
      <p style="margin:0;line-height:1.5;color:#364047;font-size:16px;">Mail: <a href="mailto:service@e-m-c-2.de" style="color:#00a86b;text-decoration:none;">service@e-m-c-2.de</a></p>
      <p style="margin:0 0 4px 0;line-height:1.5;color:#364047;font-size:16px;">Web: <a href="https://www.emczwei.de" style="color:#00a86b;text-decoration:none;">www.emczwei.de</a></p>
      ${logoHtml}
      ${signatureImageHtml}
      <p style="margin:0;line-height:1.7;color:#364047;font-size:12px;">
        Diese E-Mail enthält vertrauliche und/oder rechtlich geschützte Informationen. Der Inhalt dieser E-Mail ist ausschließlich für den bezeichneten Adressaten bestimmt. Bitte beachten Sie in diesem Fall, dass jede Form der Kenntnisnahme, Veröffentlichung, Vervielfältigung oder Weitergabe des Inhalts dieser E-Mail unzulässig ist. Wenn Sie nicht der richtige Adressat bzw. sein Vertreter sind oder diese E-Mail irrtümlich erhalten haben, informieren Sie bitte sofort den Absender und vernichten Sie diese E-Mail. Vielen Dank.
      </p>
    </div>
  </body>
</html>`;
}
