// Send records API (ADR 023) — new in v2. Read-only: status of one send (the client polls it
// when its connection dropped mid-send), the sends of an offer, and the stored files.
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { OfferSend, SEND_ID, readSendFile, sendView, type SendFile } from "./store.js";

const fail = (req: FastifyRequest, reply: FastifyReply, status: number, code: string, message: string) =>
  reply.status(status).send({ error: { code, message, requestId: req.id } });

export async function registerSends(app: FastifyInstance) {
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
