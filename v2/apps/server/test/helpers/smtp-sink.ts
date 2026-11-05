// Local SMTP sink for contract tests: accepts every mail (STARTTLS with smtp-server's built-in
// self-signed certificate, any login) and keeps it parsed in memory. Nothing is relayed.
// Random port; the spawned legacy app (which hard-codes 587) is redirected here by
// legacy-smtp-port-shim.mjs.
import { SMTPServer } from "smtp-server";
import { simpleParser, type ParsedMail } from "mailparser";
import { createHash } from "node:crypto";

export interface CapturedMail { envelope: { from: string; to: string[] }; mail: ParsedMail }

export class SmtpSink {
  private server?: SMTPServer;
  readonly mails: CapturedMail[] = [];
  port = 0;

  async start(port = 0) {
    this.server = new SMTPServer({
      authOptional: true,
      onAuth: (_auth, _session, cb) => cb(null, { user: "test" }),
      onData: (stream, session, cb) => {
        const chunks: Buffer[] = [];
        stream.on("data", (c: Buffer) => chunks.push(c));
        stream.on("end", async () => {
          const mail = await simpleParser(Buffer.concat(chunks));
          this.mails.push({
            envelope: { from: (session.envelope.mailFrom || { address: "" }).address, to: session.envelope.rcptTo.map((r) => r.address) },
            mail,
          });
          cb();
        });
      },
      logger: false,
    });
    await new Promise<void>((resolve, reject) => {
      this.server!.once("error", reject);
      this.server!.listen(port, "127.0.0.1", () => resolve());
    });
    this.port = ((this.server as any).server.address() as { port: number }).port;
  }

  take() { return this.mails.splice(0); }
  async stop() { await new Promise<void>((r) => (this.server ? this.server.close(() => r()) : r())); }
}

/** Comparable view of a parsed mail (no message-id/date/boundaries). */
export function mailView(m: CapturedMail, norm: (s: string) => string = (s) => s) {
  const mail = m.mail;
  const addr = (a: any) => (Array.isArray(a) ? a.map((x) => x.text).join(", ") : a?.text ?? null);
  return {
    envelope: m.envelope,
    from: addr(mail.from), replyTo: addr(mail.replyTo), to: addr(mail.to), cc: addr(mail.cc),
    subject: mail.subject ?? null,
    text: norm(mail.text ?? ""),
    html: norm(typeof mail.html === "string" ? mail.html : ""),
    attachments: mail.attachments.map((a) => ({
      filename: a.filename, contentType: a.contentType, disposition: a.contentDisposition, cid: a.cid ?? null,
      size: a.size, sha256: createHash("sha256").update(a.content).digest("hex"),
    })),
  };
}
