// SMTP send + IMAP "save to Sent" + preset attachments for offer emails.
// Ported from the legacy src/routes/email.js so the new app matches its
// sending behaviour. Bitrix timeline comment + signing link are intentionally
// NOT here — those subsystems don't exist in the new app yet (see documents.ts).
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport/index.js";
import MailComposer from "nodemailer/lib/mail-composer/index.js";
import { ImapFlow } from "imapflow";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// assets live at app/apps/api/assets (…/src/services → ../../assets)
const ASSETS_DIR = path.resolve(__dirname, "..", "..", "assets");
const EMAIL_DIR = path.join(ASSETS_DIR, "email");
export const SIGNATURE_IMAGE_PATH = path.join(ASSETS_DIR, "signaturepicture.png");
export const SIGNATURE_CID = "emc2-signature-picture";
export const LOGO_IMAGE_PATH = path.join(ASSETS_DIR, "logo.png");
export const LOGO_CID = "emc2-logo";

// Logo as a data: URI (for the email preview, which can't resolve cid:).
// Read + encoded once, cached.
let logoDataUriCache = "";
export function logoDataUri(): string {
  // Only memoize a successful read, so a logo added after first call is picked up.
  if (!logoDataUriCache && fs.existsSync(LOGO_IMAGE_PATH)) {
    logoDataUriCache = `data:image/png;base64,${fs.readFileSync(LOGO_IMAGE_PATH).toString("base64")}`;
  }
  return logoDataUriCache;
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

// Authenticated sender address — SMTP_EMAIL or SMTP_USER.
export function smtpFrom(): string {
  return process.env.SMTP_EMAIL || process.env.SMTP_USER || "";
}

export function buildTransport() {
  const host = requireEnv("SMTP_HOST");
  const user = smtpFrom();
  if (!user) throw new Error("Missing env var SMTP_EMAIL or SMTP_USER");
  // `family: 4` forces IPv4 (some SMTP hosts stall on IPv6); it's passed through
  // to the socket but isn't in the typed Options, hence the cast.
  const opts = {
    host,
    port: 587,
    secure: false,
    requireTLS: true,
    family: 4,
    auth: { user, pass: requireEnv("SMTP_PASS") },
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 12000,
  } as SMTPTransport.Options;
  return nodemailer.createTransport(opts);
}

// SMTP only *sends*; it never files a copy in IMAP "Sent". This composes the
// same message and IMAP-APPENDs it so it shows in mail clients. Best-effort.
export async function saveToSentFolder(mailOptions: Record<string, unknown>): Promise<{ ok: boolean; reason?: string; box?: string }> {
  const host = process.env.IMAP_HOST || process.env.SMTP_HOST;
  const user = smtpFrom();
  const pass = process.env.IMAP_PASS || process.env.SMTP_PASS;
  if (!host || !user || !pass) return { ok: false, reason: "no imap config" };

  const raw: Buffer = await new Promise((resolve, reject) => {
    new MailComposer(mailOptions).compile().build((err: Error | null, msg: Buffer) => (err ? reject(err) : resolve(msg)));
  });

  const client = new ImapFlow({
    host,
    port: Number(process.env.IMAP_PORT || 993),
    secure: true,
    auth: { user, pass },
    logger: false,
  });
  await client.connect();
  try {
    let box = process.env.IMAP_SENT_FOLDER;
    if (!box) {
      const boxes = await client.list();
      const special = boxes.find((b) => b.specialUse === "\\Sent");
      const byName = boxes.find((b) => /^(Sent|Gesendet|Sent Items|Gesendete)/i.test(b.name || ""));
      box = special?.path || byName?.path || "Sent";
    }
    await client.append(box, raw, ["\\Seen"]);
    return { ok: true, box };
  } finally {
    await client.logout().catch(() => {});
  }
}

export interface PresetAttachment {
  filename: string;
  path: string;
}

// Preset attachments for BU (and other non-AH offers): Abtretung, Barrierefrei,
// Vollmacht. Selbstzahler get only the flyer (no Abtretung/Vollmacht).
// excludeIds lets the UI drop presets via the "x" affordance.
export function getPresetAttachments(excludeIds: Set<string>, isSelbstzahler: boolean): PresetAttachment[] {
  const payerExcluded = isSelbstzahler ? new Set(["abtretung", "vollmacht"]) : new Set<string>();
  const preset = [
    { id: "abtretung", filename: "Abtretungserklärung.pdf" },
    { id: "barrierefrei", filename: "emc2_Barrierefreies_Wohnen.pdf" },
    { id: "vollmacht", filename: "Vollmacht.pdf" },
  ];
  return preset
    .filter((p) => !excludeIds.has(p.id) && !payerExcluded.has(p.id))
    .map((p) => ({ filename: p.filename, absPath: path.join(EMAIL_DIR, p.filename) }))
    .filter((p) => fs.existsSync(p.absPath))
    .map((p) => ({ filename: p.filename, path: p.absPath }));
}

export function safeOfferFilename(raw: unknown): string {
  return `${String(raw || "Angebot").replace(/[^\w-]+/g, "_")}.pdf`;
}

// Plain-text body with the standard signature block.
export function buildEmailTextBody(body: unknown, contactName = "Stefan Wolfrum"): string {
  const trimmed = String(body || "").trim();
  const signature = [
    "",
    "--",
    "Freundliche Grüße",
    "",
    contactName,
    "",
    "Ihr Team von emc2",
    "",
    "EmC2 Attila Landgrafe",
    "Waldstr. 5 / 95032 Hof",
    "",
    "Tel.: +49 9281 5915900",
    "Fax: +49 9281 5915909",
    "Mail: service@e-m-c-2.de",
    "Web: www.emczwei.de",
  ].join("\n");
  return `${trimmed}${signature}`;
}
