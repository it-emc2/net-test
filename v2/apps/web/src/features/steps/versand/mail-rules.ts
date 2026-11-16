// The mail of an offer — the rules of today's UI (src/public/EmailManager.js; reference:
// test/fixtures/versand-mail.json, v2/scripts/capture-versand-mail.cjs):
//  - recipient (the customer's e-mail), CC (the customer's CC and the contact person's e-mail),
//    subject and text fill themselves from the offer until they are changed by hand
//  - a text changed by hand is kept; only three things in it still follow the offer: the
//    numbered list of documents, the line about the Neukundenbonus, and the offer number
//  - the attachments: the offer PDF (always), then the enclosed documents — for Alltagshilfe its
//    own set, of which a Selbstzahler gets neither Abtretung nor Vollmacht
//  - stored: `mail` { auftragId, to, subject, body } and `auftragId`
type Fields = Record<string, unknown>;
const obj = (v: unknown): Fields => (v && typeof v === "object" && !Array.isArray(v) ? (v as Fields) : {});
const str = (v: unknown) => String(v ?? "").trim();
export const typeOf = (offer: Fields): string => str(offer.activeOffer).toLowerCase() || "bu";
const kdOf = (offer: Fields) => obj(offer.Kundendaten);

const SUFFIX: Record<string, string> = { bu: "zum Badumbau", bwt: "zur Badewannentür", ah: "zur Alltagshilfe", hl: "zum Handlauf", bl: "zum Badelift", hms: "zum Hausmeisterservice", wd: "zum Winterdienst" };
export function subjectDefault(offer: Fields): string {
  const nr = str(offer.offerNumber), suffix = SUFFIX[typeOf(offer)] || "";
  const base = nr ? `emc2 | Ihr Angebot ${nr}` : "emc2 | Ihr Angebot";
  return suffix ? `${base} ${suffix}` : base;
}
export const toDefault = (offer: Fields): string => str(kdOf(offer).email);
export const ccDefault = (offer: Fields): string => [...new Set([kdOf(offer).emailCc, kdOf(offer).cp_email].map(str).filter(Boolean))].join(", ");

const greet = (salutation: string, lastName: string) => {
  const l = lastName.trim() || "Mustermann";
  if (salutation === "Herr") return `sehr geehrter Herr ${l}`;
  if (salutation === "Frau") return `sehr geehrte Frau ${l}`;
  if (salutation === "Familie") return `sehr geehrte Familie ${l}`;
  return "sehr geehrte Damen und Herren";
};
const upper = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** the first line: the customer, with the partner of a two-person offer or else the contact person */
export function greetingLine(offer: Fields): string {
  const kd = kdOf(offer), one = greet(str(kd.salutation), str(kd.lastName));
  if (kd.twoPersons && (str(kd.partnerSalutation) || str(kd.partnerLastName))) return upper(`${one}, ${greet(str(kd.partnerSalutation), str(kd.partnerLastName))},`);
  if (kd.hasContactPerson === "Ja" && str(kd.cp_name)) return upper(`${one}, ${greet(str(kd.cp_salutation), str(kd.cp_name))},`);
  return upper(`${one},`);
}

const DOC_LINES = [
  { id: "abtretung", line: "Abtretungserklärung zur Abrechnung mit der Krankenkasse" },
  { id: "vollmacht", line: "Vollmacht zur Beantragung des Zuschusses nach §40 Abs. 3,4,5 SGB XI" },
  { id: "barrierefrei", line: 'Unseren aktuellen Flyer "Barrierefreies Wohnen"' },
] as const;
const enclosed = (offer: Fields, id: string) => obj(offer.docSelection)[id] !== false;
const numberOr = (offer: Fields) => str(offer.offerNumber) || "ANG-2025-_____";
/** the numbered list of the text: the offer, then the enclosed documents */
export const documentLines = (offer: Fields): string[] => [`Ihr Angebot ${numberOr(offer)}`, ...DOC_LINES.filter((d) => enclosed(offer, d.id)).map((d) => d.line)].map((l, i) => `${i + 1}. ${l}`);

const bonus = (offer: Fields, key: string) => obj(offer.rabatt).rabattEnabled === true && obj(offer.rabatt)[key] === true;
export const BONUS_LINE = "• Exklusiver Neukundenbonus – profitieren Sie von unserem besonderen Willkommensvorteil.";
const ANCHOR = "Im Anhang erhalten Sie wie gewünscht die folgenden Unterlagen:";
const SIGN = `Bitte füllen Sie die Dokumente aus und senden Sie uns diese unterschrieben zurück – gerne bequem per E-Mail an service@e-m-c-2.de.

Keine Möglichkeit, die Dokumente auszudrucken? Kein Problem - nutzen Sie einfach nachfolgenden Link, um die Dokumente online auszufüllen, zu unterschreiben und direkt an uns zurückzuschicken:

{{SIGN_LINK}}`;
const CLOSING = "Bei Rückfragen stehe ich Ihnen gerne zur Verfügung.";
const EXPERIENCE = "Dank unserer langjährigen Erfahrung und etablierten Zusammenarbeit mit allen Pflege- und Krankenkassen profitieren Sie von einer reibungslosen und professionellen Abwicklung.";

/** The text the mail starts with. `applied`: "Antrag bei Pflegekasse bereits gestellt" is ticked. */
export function bodyDefault(offer: Fields, applied = false): string {
  const sz = kdOf(offer).payer === "Selbstzahler", nr = numberOr(offer);
  if (typeOf(offer) === "ah") {
    const list = (sz
      ? [`Ihr Angebot ${nr}`, "Zusatzblatt für Wichtige Hinweise zum Angebot / zu Terminen", "Unsere allgemeinen Geschäftsbedingungen (AGB)", 'Unseren aktuellen Flyer "Alltagshilfe"', 'Unseren aktuellen Flyer "Barrierefreies Wohnen"']
      : [`Ihr Angebot ${nr}`, "Zusatzblatt für Wichtige Hinweise zum Angebot / zu Terminen", "Abtretungserklärung SGB 45b für die direkte Abrechnung mit Ihrer Pflegekasse", "Unsere allgemeinen Geschäftsbedingungen (AGB)", 'Unseren aktuellen Flyer "Alltagshilfe"', 'Unseren aktuellen Flyer "Barrierefreies Wohnen"']
    ).map((l, i) => `${i + 1}. ${l}`).join("\n");
    return `${greetingLine(offer)}

vielen Dank für Ihr Interesse an unseren Dienstleistungen. Mit emc2 entscheiden Sie sich für einen zuverlässigen Partner, der Ihnen höchste Qualität und volle Sicherheit bietet.

Unser Ziel ist es, sie im Alltag zu unterstützen und Ihr Leben leichter, sicherer und komfortabler zu machen.

${ANCHOR}

${list}

${SIGN}

${sz ? "" : `${EXPERIENCE}\n\n`}Überzeugen Sie sich selbst - hier berichten unsere Kunden: https://www.youtube.com/watch?v=Ie0sxagHlFo

${CLOSING}`;
  }
  return `${greetingLine(offer)}

vielen Dank für Ihr Interesse an unseren Dienstleistungen. Mit emc2 entscheiden Sie sich für einen zuverlässigen Partner, der Ihnen höchste Qualität und volle Sicherheit bietet:

${sz ? "" : "• Anerkannter Dienstleister nach SGB – von allen Pflegekassen geprüft und anerkannt.\n"}• Nur Markenqualität vom Fachhändler – langlebige Produkte, auf die Sie sich verlassen können.
• 5 Jahre Gewährleistung – unsere Sicherheit für Ihre Investition.
${sz ? "" : "• Professionelle Antragsstellung - auf Wunsch übernehmen wir die Antragsstellung bei der Pflegekasse für Sie.\n"}${bonus(offer, "bonus300") ? `${BONUS_LINE}\n` : ""}${bonus(offer, "bonusGrab") ? "• Gratis Haltegriff – für mehr Komfort und Sicherheit in Ihrem Alltag.\n" : ""}
Unser Ziel ist es, Ihr Leben leichter, sicherer und komfortabler zu machen.

${ANCHOR}

${documentLines(offer).join("\n")}

${SIGN}

${sz || applied ? "" : `Sobald uns Ihre Unterlagen vorliegen, übernehmen wir für Sie sämtliche weiteren Schritte und stellen den Antrag auf Zuschuss direkt bei Ihrer Pflegekasse – selbstverständlich kostenfrei. ${EXPERIENCE}\n\n`}${CLOSING}`;
}

/** A text changed by hand: its numbered list of documents follows the ticks (not for Alltagshilfe). */
export function withDocumentList(body: string, offer: Fields): string {
  if (typeOf(offer) === "ah") return body;
  const lines = body.split("\n"), at = lines.findIndex((l) => l.trim() === ANCHOR);
  if (at === -1) return body;
  let start = at + 1;
  while (start < lines.length && !lines[start]!.trim()) start++;
  let end = start;
  while (end < lines.length && /^\s*\d+\.\s/.test(lines[end]!)) end++;
  if (end === start) return body; // no list where one is expected
  const next = documentLines(offer);
  if (lines.slice(start, end).join("\n") === next.join("\n")) return body;
  lines.splice(start, end - start, ...next);
  return lines.join("\n");
}
/** A text changed by hand: the line about the Neukundenbonus comes and goes with the bonus. */
export function withBonusLine(body: string, offer: Fields): string {
  if (typeOf(offer) === "ah") return body;
  const lines = body.split("\n"), at = lines.findIndex((l) => l.trim() === BONUS_LINE), want = bonus(offer, "bonus300");
  if (want === (at !== -1)) return body;
  if (!want) lines.splice(at, 1);
  else {
    let i = lines.findIndex((l) => l.startsWith("• Gratis Haltegriff"));
    if (i === -1) {
      i = lines.findIndex((l) => l.startsWith("• "));
      if (i === -1) return body; // no list to put it in
      while (lines[i + 1]?.startsWith("• ")) i++;
      i++;
    }
    lines.splice(i, 0, BONUS_LINE);
  }
  return lines.join("\n");
}
/** an offer number written in a text follows the offer's number */
export const withNumber = (text: string, offer: Fields): string => (str(offer.offerNumber) ? text.replace(/ANG\d{4}-\d{4}-\d{6}/g, str(offer.offerNumber)) : text);
/** what still follows the offer in a text changed by hand */
export const keptBody = (body: string, offer: Fields): string => withNumber(withBonusLine(withDocumentList(body, offer), offer), offer);

// ---- attachments ----
export interface Attachment { id: string; name: string; meta: string; fixed: boolean }
const PRESETS = [{ id: "abtretung", name: "Abtretungserklärung.pdf" }, { id: "barrierefrei", name: "emc2_Barrierefreies_Wohnen.pdf" }, { id: "vollmacht", name: "Vollmacht.pdf" }] as const;
const AH_PRESETS = [
  { id: "flyer_ah", name: "Flyer_Alltagshilfe_EmC2 Soziale Dienste.pdf" }, { id: "barrierefrei", name: "emc2_Barrierefreies_Wohnen.pdf" }, { id: "agb_ah", name: "AGB_Alltagshilfe_EmC2 Soziale Dienste UG.pdf" },
  { id: "zusatzblatt_ah", name: "Zusatzblatt für Krankenkasse Alltagshilfe_EmC2 Soziale Dienste UG.pdf" }, { id: "abtretung_ah", name: "Abtretungserklärung_SGB_45b_EmC2 Soziale Dienste UG.pdf" }, { id: "vollmacht", name: "Vollmacht_SGB_45b_EmC2 Soziale Dienste UG.pdf" },
] as const;
/** the documents taken out of this mail: the unticked ones of "Mitgesendete Unterlagen" plus what was removed from the list */
export function excluded(offer: Fields, removed: readonly string[] = []): string[] {
  const unticked = typeOf(offer) === "ah" ? [] : DOC_LINES.map((d) => d.id).filter((id) => !enclosed(offer, id));
  return [...new Set([...unticked, ...removed])];
}
export function attachments(offer: Fields, removed: readonly string[] = []): Attachment[] {
  const ah = typeOf(offer) === "ah", out = new Set(excluded(offer, removed));
  if (ah && kdOf(offer).payer === "Selbstzahler") { out.add("abtretung_ah"); out.add("vollmacht"); }
  return [{ id: "angebot", name: `${str(offer.offerNumber) || "Angebot"}.pdf`, meta: "Angebots-PDF", fixed: true },
    ...(ah ? AH_PRESETS : PRESETS).filter((p) => !out.has(p.id)).map((p) => ({ id: p.id, name: p.name, meta: "Default", fixed: false }))];
}
export const countText = (n: number): string => (n === 1 ? "1 Datei" : `${n} Dateien`);

// ---- the preview of the mail ----
const esc = (v: unknown) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const LINK = "color:#00a86b;text-decoration:none;";
function inline(text: string): string {
  const mails = esc(text).replace(/([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi, `<a href="mailto:$1" style="${LINK}">$1</a>`);
  return mails.replace(/\b((?:https?:\/\/|www\.)[^\s<]+)\b/gi, (m) => {
    const href = /^https?:\/\//i.test(m) ? m : `https://${m}`;
    return `<a href="${esc(href)}" style="${LINK}">${/\/sign\//.test(m) ? "&gt;&gt; Hier Unterlagen online ausfüllen und unterzeichnen &lt;&lt;" : m}</a>`;
  });
}
/** the text as the mail shows it: paragraphs, "•" lists and numbered lists */
export function bodyHtml(body: string): string {
  const parts: string[] = [];
  let para: string[] = [], bullets: string[] = [], ordered: string[] = [];
  const li = (item: string) => `<li style="margin:0 0 10px 0;line-height:1.5;font-size:16px;"><strong>${inline(item)}</strong></li>`;
  const flushPara = () => { const t = para.join(" ").trim(); if (t) parts.push(`<p style="margin:0 0 18px 0;line-height:1.55;color:#364047;font-size:16px;${/^Keine Möglichkeit, die Dokumente auszudrucken\?/.test(t) ? "font-weight:bold;" : ""}">${inline(t)}</p>`); para = []; };
  const flushBullets = () => { if (bullets.length) parts.push(`<ul style="margin:0 0 24px 22px;padding:0;color:#364047;">${bullets.map(li).join("")}</ul>`); bullets = []; };
  const flushOrdered = () => { if (ordered.length) parts.push(`<ol style="margin:0 0 24px 28px;padding:0;color:#364047;">${ordered.map(li).join("")}</ol>`); ordered = []; };
  for (const raw of body.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    if (!line) { flushPara(); flushBullets(); flushOrdered(); continue; }
    const b = line.match(/^[•*-]\s+(.*)$/), o = line.match(/^\d+\.\s+(.*)$/);
    if (b) { flushPara(); flushOrdered(); bullets.push(b[1]!.trim()); }
    else if (o) { flushPara(); flushBullets(); ordered.push(o[1]!.trim()); }
    else { flushBullets(); flushOrdered(); para.push(line); }
  }
  flushPara(); flushBullets(); flushOrdered();
  return parts.join("");
}
const P = (text: string, below = 0) => `<p style="margin:0${below ? ` 0 ${below}px 0` : ""};line-height:1.5;color:#364047;font-size:16px;">${text}</p>`;
const footer = (ah: boolean) => (ah
  ? [P("emc2 Attila Landgrafe"), P("Waldstraße 5"), P("95032 Hof"), P("Deutschland", 22), P("Tel.: 09281 5915900"), P("Fax.: 09281 5915909"), P(`Email: <a href="mailto:kontakt@e-m-c-2.de" style="${LINK}">kontakt@e-m-c-2.de</a>`), P(`Web: <a href="https://emczwei.de" style="${LINK}">emczwei.de</a>`, 22), P("Hof/Saale"), P("Steuer-Nr.: 223/147/40118"), P("Geschäftsführer: Attila Landgrafe", 24)]
  : [P("EmC2 Attila Landgrafe"), P("Waldstr. 5 / 95032 Hof", 22), P("Tel.: +49 9281 5915900"), P("Fax: +49 9281 5915909"), P(`Mail: <a href="mailto:service@e-m-c-2.de" style="${LINK}">service@e-m-c-2.de</a>`), P(`Web: <a href="https://www.emczwei.de" style="${LINK}">www.emczwei.de</a>`, 24)]
).join("\n      ");
/** The mail as the customer gets it (the link for signing is put in when the mail is sent). */
export function previewHtml(body: string, offer: Fields, signatureSrc = "/assets/signaturepicture.png"): string {
  const shown = body.split("{{SIGN_LINK}}").join("(Ihr persönlicher Link wird beim Versand automatisch eingefügt)");
  const line = (text: string, margin: string) => `<p style="margin:${margin};line-height:${margin === "0 0 8px 0" || margin === "0 0 24px 0" ? "1.55" : "1.5"};color:#364047;font-size:16px;">${text}</p>`;
  return `<!DOCTYPE html>
<html lang="de">
  <body style="margin:0;padding:24px;background:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#364047;">
    <div style="max-width:980px;margin:0 auto;">
      ${bodyHtml(shown)}
      ${line("--", "0 0 8px 0")}
      ${line("Freundliche Grüße", "0 0 24px 0")}
      ${line(esc(str(kdOf(offer).emc2_contact)), "0 0 6px 0")}
      ${line("Ihr Team von emc2", "0 0 28px 0")}
      ${line("______________________________", "0 0 18px 0")}
      ${footer(typeOf(offer) === "ah")}
      <div style="margin:0 0 24px 0;"><img src="${esc(signatureSrc)}" alt="Signatur emc2" style="display:block;max-width:220px;width:220px;height:auto;border:0;" /></div>
      <p style="margin:0;line-height:1.7;color:#364047;font-size:12px;">
        Diese E-Mail enthält vertrauliche und/oder rechtlich geschützte Informationen. Der Inhalt dieser E-Mail ist ausschließlich für den bezeichneten Adressaten bestimmt. Bitte beachten Sie in diesem Fall, dass jede Form der Kenntnisnahme, Veröffentlichung, Vervielfältigung oder Weitergabe des Inhalts dieser E-Mail unzulässig ist. Wenn Sie nicht der richtige Adressat bzw. sein Vertreter sind oder diese E-Mail irrtümlich erhalten haben, informieren Sie bitte sofort den Absender und vernichten Sie diese E-Mail. Vielen Dank.
      </p>
    </div>
  </body>
</html>`;
}

// ---- what the offer stores ----
export type MailField = "to" | "subject" | "body";
export interface Touched { to?: boolean; cc?: boolean; subject?: boolean; body?: boolean }
/** The stored mail fields as they should be now: a field not changed by hand is the default, a
 *  text changed by hand keeps following documents, bonus and number, a subject the number.
 *  Returns only what differs from what is stored. */
export function mailChanges(offer: Fields, touched: Touched, applied: boolean): Fields {
  const mail = obj(offer.mail), out: Fields = {};
  const want: Record<MailField, string> = {
    to: touched.to ? String(mail.to ?? "") : toDefault(offer) || String(mail.to ?? ""), // an emptied customer e-mail leaves the recipient as it is
    subject: touched.subject ? withNumber(String(mail.subject ?? ""), offer) : subjectDefault(offer),
    body: touched.body ? keptBody(String(mail.body ?? ""), offer) : bodyDefault(offer, applied),
  };
  for (const k of ["to", "subject", "body"] as const) if (String(mail[k] ?? "") !== want[k]) out[k] = want[k];
  return out;
}
/** An opened offer: a stored field that is not what the offer would write by itself was changed by hand. */
export function touchedOf(offer: Fields): Touched {
  const mail = obj(offer.mail), differs = (stored: unknown, def: string) => !!String(stored ?? "") && String(stored) !== def;
  return { to: differs(mail.to, toDefault(offer)), subject: differs(mail.subject, subjectDefault(offer)), body: differs(mail.body, bodyDefault(offer)) && differs(mail.body, bodyDefault(offer, true)) };
}
