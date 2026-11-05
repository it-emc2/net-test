// SMTP sending + IMAP "Sent" copy — port of buildTransport/smtpFrom/saveToSentFolder in legacy
// src/routes/email.js. Same library (nodemailer) and the same transport options → same MIME.
// Differences (ADR 017): send port configurable (legacy hard-coded 587, still the default);
// TLS options injectable for the local test SMTP server only (never from env).
import nodemailer, { type SendMailOptions, type Transporter } from "nodemailer";
import MailComposer from "nodemailer/lib/mail-composer/index.js";
import { ImapFlow } from "imapflow";
import type { ConnectionOptions } from "node:tls";

export interface MailConfig {
  smtpHost?: string | undefined; smtpPort?: number; smtpEmail?: string | undefined; smtpUser?: string | undefined;
  smtpPass?: string | undefined; replyTo?: string | undefined;
  imapHost?: string | undefined; imapPort?: number; imapPass?: string | undefined; imapSentFolder?: string | undefined;
  /** tests only: accept the local test server's self-signed certificate */
  tls?: ConnectionOptions;
}

export class Mailer {
  constructor(private readonly c: MailConfig) {}

  /** Authenticated sender — SMTP_EMAIL or SMTP_USER (legacy smtpFrom). */
  get from() { return this.c.smtpEmail || this.c.smtpUser || ""; }
  get replyTo() { return this.c.replyTo || this.from; }

  private transport(): Transporter {
    if (!this.c.smtpHost) throw new Error("Missing env var SMTP_HOST");
    if (!this.from) throw new Error("Missing env var SMTP_EMAIL or SMTP_USER");
    if (!this.c.smtpPass) throw new Error("Missing env var SMTP_PASS");
    return nodemailer.createTransport({
      host: this.c.smtpHost, port: this.c.smtpPort ?? 587, secure: false, requireTLS: true, family: 4,
      auth: { user: this.from, pass: this.c.smtpPass },
      connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 12000,
      ...(this.c.tls ? { tls: this.c.tls } : {}),
    } as any);
  }

  send(mail: SendMailOptions) { return this.transport().sendMail(mail); }

  /** Best-effort IMAP APPEND to the Sent folder so the mail shows up in mail clients. */
  async saveToSentFolder(mail: SendMailOptions): Promise<{ ok: true; box: string } | { ok: false; reason: string }> {
    const host = this.c.imapHost || this.c.smtpHost;
    const pass = this.c.imapPass || this.c.smtpPass;
    if (!host || !this.from || !pass) return { ok: false, reason: "no imap config" };
    const raw = await new Promise<Buffer>((resolve, reject) =>
      new MailComposer(mail).compile().build((err, msg) => (err ? reject(err) : resolve(msg))));
    const client = new ImapFlow({ host, port: this.c.imapPort ?? 993, secure: true, auth: { user: this.from, pass }, logger: false, ...(this.c.tls ? { tls: this.c.tls } : {}) });
    await client.connect();
    try {
      let box = this.c.imapSentFolder;
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
}
