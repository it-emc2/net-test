// Send records API (ADR 023) — new in v2. Read-only: status of one send (the client polls it
// when its connection dropped mid-send), the sends of an offer, and the stored files.
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { buildInternalNoteComment, type DealWrites } from "../../integrations/bitrix-deal.js";
import { OfferSend, SEND_ID, readSendFile, recordStep, sendView, type SendFile } from "./store.js";

const fail = (req: FastifyRequest, reply: FastifyReply, status: number, code: string, message: string) =>
  reply.status(status).send({ error: { code, message, requestId: req.id } });

export async function registerSends(app: FastifyInstance, d: { deals: DealWrites }) {
  // Repeat a failed Bitrix filing from the stored files — nothing is rendered or mailed again.
  app.post("/api/sends/:sendId/retry-bitrix", async (req, reply) => {
    const { sendId } = req.params as { sendId: string };
    if (!SEND_ID.test(sendId)) return fail(req, reply, 400, "BAD_SEND_ID", "Ungültige Versand-Kennung");
    const s: any = await OfferSend.findOne({ sendId }).lean();
    if (!s) return fail(req, reply, 404, "NOT_FOUND", "Versand nicht gefunden");
    if (s.status !== "done") return fail(req, reply, 409, "NOT_DONE", "Dieser Versand ist nicht abgeschlossen.");
    if (s.steps?.bitrix?.status === "ok") return { ok: true, already: true, send: sendView(s) };
    if (!s.bitrixCall?.target) return fail(req, reply, 409, "NO_TARGET", "Für diesen Versand ist kein Bitrix-Ziel hinterlegt.");
    // one retry at a time
    const claimed = await OfferSend.findOneAndUpdate(
      { sendId, "steps.bitrix.status": { $ne: "ok" }, $or: [{ bitrixRetryAt: null }, { bitrixRetryAt: { $exists: false } }, { bitrixRetryAt: { $lt: new Date(Date.now() - 2 * 60 * 1000) } }] },
      { $set: { bitrixRetryAt: new Date() } },
    );
    if (!claimed) return fail(req, reply, 409, "RETRY_IN_PROGRESS", "Die Ablage wird gerade wiederholt.");
    try {
      const attachments: { filename: string; base64: string }[] = [];
      for (const f of (s.files ?? []) as SendFile[]) {
        const content = await readSendFile(f.fileId);
        if (content) attachments.push({ filename: f.filename, base64: content.toString("base64") });
      }
      const { target, comment, internalNote } = s.bitrixCall;
      if (target.entityType === "deal" && s.offerNumber) await d.deals.setDealOfferLink(target.entityId, s.offerNumber);
      const r: any = await d.deals.addTimelineComment({ ...target, comment, attachments });
      if (r?.ok === false) throw new Error(String(r.error || "Bitrix hat die Ablage abgelehnt"));
      const note = buildInternalNoteComment(internalNote);
      if (note) await d.deals.addTimelineComment({ ...target, comment: note });
      await recordStep(sendId, "bitrix", "ok");
      req.log.info({ sendId }, "Bitrix filing repeated from the send record");
      return { ok: true, send: sendView(await OfferSend.findOne({ sendId }).lean()) };
    } catch (e) {
      await recordStep(sendId, "bitrix", "failed", (e as Error)?.message || String(e));
      return fail(req, reply, 502, "BITRIX_FAILED", "Die Ablage in Bitrix hat wieder nicht geklappt. Bitte versuchen Sie es später noch einmal.");
    } finally {
      await OfferSend.updateOne({ sendId }, { $set: { bitrixRetryAt: null } }).catch(() => {});
    }
  });

  app.get("/api/sends/:sendId", async (req, reply) => {
    const { sendId } = req.params as { sendId: string };
    if (!SEND_ID.test(sendId)) return fail(req, reply, 400, "BAD_SEND_ID", "Ungültige Versand-Kennung");
    const s: any = await OfferSend.findOne({ sendId }).lean();
    if (!s) return fail(req, reply, 404, "NOT_FOUND", "Versand nicht gefunden");
    // `result` is the answer the send request gave (or would have given) — the client uses it
    // to finish its own flow after a dropped connection.
    return { ok: true, send: sendView(s), result: s.status === "done" ? s.result : null };
  });

  app.get("/api/offers/:offerNumber/sends", async (req) => {
    const { offerNumber } = req.params as { offerNumber: string };
    const rows = await OfferSend.find({ offerNumber: String(offerNumber) }, { payload: 0, pricing: 0, result: 0 }).sort({ startedAt: -1 }).limit(50).lean();
    return { ok: true, sends: rows.map(sendView) };
  });

  app.get("/api/sends/:sendId/files/:fileId", async (req, reply) => {
    const { sendId, fileId } = req.params as { sendId: string; fileId: string };
    if (!SEND_ID.test(sendId)) return fail(req, reply, 400, "BAD_SEND_ID", "Ungültige Versand-Kennung");
    const s: any = await OfferSend.findOne({ sendId }, { files: 1 }).lean();
    const file = (s?.files as SendFile[] | undefined)?.find((f) => f.fileId === fileId);
    if (!file) return fail(req, reply, 404, "NOT_FOUND", "Datei nicht gefunden");
    const content = await readSendFile(file.fileId);
    if (!content) return fail(req, reply, 404, "NOT_FOUND", "Datei nicht gefunden");
    const type = /\.pdf$/i.test(file.filename) ? "application/pdf"
      : /\.docx$/i.test(file.filename) ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : "application/octet-stream";
    return reply.header("content-type", type)
      .header("content-disposition", `inline; filename*=UTF-8''${encodeURIComponent(file.filename)}`)
      .header("cache-control", "private, no-store").send(content);
  });
}
