// Bitrix routes, part 2: writes to the CRM (timeline, uploads, stage moves) + admin retry of a
// logged failure. Ported 1:1 from legacy src/routes/bitrix.js / admin.js; the contract test
// requires identical responses AND identical outgoing Bitrix/planning calls (recording stub).
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { BitrixClient } from "../../integrations/bitrix.js";
import { AH_FIELD, DEAL_ENTITY_TYPE_ID, DEAL_UPLOADS, INVOICE_COPY_ENUM, STAGES, buildAhBitrixFields, type DealWrites } from "../../integrations/bitrix-deal.js";
import type { PlanningClient } from "../../integrations/planning.js";
import { BitrixLog, User, UserActionLog } from "../../platform/models.js";
import { dealSignature } from "../deal-drafts/index.js";
import { ahTotalsOfPayload } from "../documents/index.js";

const fail = (req: FastifyRequest, reply: FastifyReply, status: number, code: string, message: string, extra: Record<string, unknown> = {}) =>
  reply.status(status).send({ error: { code, message, requestId: req.id }, ...extra });
const msg = (err: unknown) => (err as Error)?.message || String(err);
const BIG = { bodyLimit: 25 * 1024 * 1024 }; // legacy express.json({ limit: "25mb" }) for base64 files

export interface BitrixWriteDeps { bx: BitrixClient; deals: DealWrites; planning: PlanningClient; materialCodesField?: string | undefined }

export async function registerBitrixWrite(app: FastifyInstance, d: BitrixWriteDeps) {
  const { bx, deals, planning } = d;
  const auditLog = (req: FastifyRequest, entry: Record<string, unknown>) =>
    void UserActionLog.create(entry).catch((e) => req.log.warn({ err: e, event: entry.event }, "user action log failed"));

  app.post("/api/bitrix/timeline/comment", BIG, async (req, reply) => {
    const b = (req.body ?? {}) as Record<string, any>;
    try {
      const entityType = String(b.entityType || "").trim();
      const comment = String(b.comment || "").trim();
      if (!entityType) return fail(req, reply, 400, "BAD_REQUEST", "entityType is required");
      if (b.entityId === undefined || b.entityId === null || String(b.entityId).trim() === "") return fail(req, reply, 400, "BAD_REQUEST", "entityId is required");
      if (!comment) return fail(req, reply, 400, "BAD_REQUEST", "comment is required");
      return await deals.addTimelineComment({ entityType, entityId: b.entityId, comment, attachments: Array.isArray(b.attachments) ? b.attachments : [] });
    } catch (err) {
      req.log.error({ err }, "timeline comment failed");
      return fail(req, reply, 500, "BITRIX_ERROR", msg(err));
    }
  });

  app.post("/api/bitrix/deal/:id/upload/:type", BIG, async (req, reply) => {
    const { id: rawId, type } = req.params as { id: string; type: string };
    const b = (req.body ?? {}) as Record<string, any>;
    try {
      const cfg = DEAL_UPLOADS[type];
      if (!cfg || !Object.hasOwn(DEAL_UPLOADS, type)) return fail(req, reply, 400, "BAD_REQUEST", "Unbekannter Upload-Typ");
      const id = Number(rawId);
      const filename = String(b.filename || "").trim();
      const base64 = String(b.base64 || "").replace(/^data:[^,]*,/, "").trim();
      if (!Number.isFinite(id) || id <= 0) return fail(req, reply, 400, "BAD_REQUEST", "Ungültige Auftrag-ID");
      if (!filename || !base64) return fail(req, reply, 400, "BAD_REQUEST", "Datei fehlt");
      const deal = (await bx.get("crm.deal.get", { id }))?.result;
      if (!deal) return fail(req, reply, 404, "NOT_FOUND", "Auftrag nicht gefunden");
      // only crm.item.update with the existing file objects as returned + [name, base64] appends
      const existing = (Array.isArray(deal[cfg.field]) ? deal[cfg.field] : []).filter((f: any) => f?.id);
      await bx.post("crm.item.update", {
        entityTypeId: DEAL_ENTITY_TYPE_ID, id,
        fields: { ["ufCrm_" + cfg.field.slice("UF_CRM_".length)]: [...existing, [filename, base64]] },
      });
      const after = (await bx.get("crm.deal.get", { id }))?.result?.[cfg.field];
      const afterCount = Array.isArray(after) ? after.length : 0;
      const kept = afterCount >= existing.length + 1;
      if (!kept) req.log.warn({ dealId: id, type, before: existing.length, after: afterCount }, "upload replaced the multi-file field");
      await deals.addTimelineComment({
        entityType: "deal", entityId: id,
        comment: `📎 ${cfg.note} hochgeladen (Konfigurator): ${filename}\nAblage im Feld „${cfg.label}“ und als Anhang an dieser Notiz.${kept ? "" : "\n⚠️ Das Feld enthält nur die neueste Datei – frühere Dateien ggf. in älteren Notizen."}`,
        attachments: [{ filename, base64 }],
      });
      return { ok: true, kept };
    } catch (err) {
      req.log.error({ err }, "deal upload failed");
      return fail(req, reply, 500, "BITRIX_ERROR", msg(err));
    }
  });

  app.post("/api/bitrix/deal/:id/move-ang-verschickt", async (req, reply) => {
    const dealId = String((req.params as { id: string }).id || "").trim();
    const b = (req.body ?? {}) as Record<string, any>;
    try {
      if (!dealId) return fail(req, reply, 400, "BAD_REQUEST", "id is required");
      // ADR 027 A, step 3 (owner 2026-11-20) — no stage fall-back after a signature: a deal with a
      // signed offer is not moved at all by a send — neither for another variant nor for a resend
      // of the signed one. No Bitrix call; the answer says so (stage, amount, number, link stay).
      let signed: { offerNumber: string } | null = null;
      try { signed = await dealSignature(dealId); }
      catch (e) { req.log.warn({ err: e, dealId }, "signature check failed — move as before"); }
      if (signed) {
        req.log.info({ dealId, offerNumber: b.offerNumber, signedOfferNumber: signed.offerNumber }, "move-ang-verschickt: deal kept (offer signed)"); // the user-action log's event list is the old app's
        return { ok: true, dealId: Number(dealId), stageKept: true, amountKept: true, signedOfferNumber: signed.offerNumber };
      }
      const deal = (await bx.get("crm.deal.get", { id: dealId }))?.result;
      if (!deal) return fail(req, reply, 404, "NOT_FOUND", "Deal not found");
      const isAh = String(b.offerType || "").toLowerCase() === "ah";
      const provided = Number(b.opportunity);
      let extra: Record<string, unknown> | undefined;
      // AH (ADR 028, owner 2026-11-20): the deal amount is the offer's monthly amount — gross for a
      // Selbstzahler, net for a Kassenkunde (not the Eigenanteil) — from THE AH total function on the
      // payload as sent; without a payload the amount the client sent (none → no amount, as before)
      let ahAmount = 0;
      if (isAh) {
        let ahPayload: unknown = null;
        try { ahPayload = b.payload ? JSON.parse(b.payload) : null; } catch { /* invalid JSON → AH fields not set this time */ }
        if (ahPayload) extra = buildAhBitrixFields(ahPayload, deal[AH_FIELD.ANFAHRTSZONE]);
        ahAmount = ahPayload ? ahTotalsOfPayload(ahPayload).customerAmount : Number.isFinite(provided) && provided > 0 ? provided : 0;
      }
      const amount = isAh ? ahAmount : Number.isFinite(provided) && provided > 0 ? provided : Number(deal.OPPORTUNITY) || 0;
      const currencyId = String(b.currencyId || "").trim() || String(deal.CURRENCY_ID || "").trim() || "EUR";
      if (!isAh && !(amount > 0)) return fail(req, reply, 400, "MISSING_FIELDS", "Betrag (OPPORTUNITY) fehlt", { missing: ["OPPORTUNITY"] });

      const materialCodes = String(b.materialCodes || "").trim().slice(0, 100);
      if (!isAh && d.materialCodesField && materialCodes) extra = { ...(extra || {}), [d.materialCodesField]: materialCodes };
      const invoice = Object.hasOwn(INVOICE_COPY_ENUM, String(b.invoiceCopy)) ? INVOICE_COPY_ENUM[String(b.invoiceCopy)] : undefined;

      const target = isAh ? STAGES.AH_ANG_VERSCHICKT : STAGES.ANG_VERSCHICKT;
      const data = await deals.updateDealStage({
        dealId, stageId: target.stageId, categoryId: target.categoryId, opportunity: amount, currencyId,
        workDays: b.workDays, offerType: b.offerType, offerNumber: b.offerNumber, finalTotal: b.finalTotal ?? amount,
        selfPayAmount: b.selfPayAmount,
        extraFields: invoice ? { ...extra, UF_CRM_1721218585: invoice } : extra,
      });
      auditLog(req, { event: "move_succeeded", dealId, offerNumber: b.offerNumber, offerType: b.offerType });
      return { ok: true, dealId: Number(dealId), result: data?.result ?? data };
    } catch (err) {
      req.log.error({ err, dealId }, "move-ang-verschickt failed");
      auditLog(req, { event: "move_failed", dealId, offerNumber: b.offerNumber, offerType: b.offerType, message: msg(err) });
      return fail(req, reply, 500, "BITRIX_ERROR", msg(err));
    }
  });

  app.post("/api/bitrix/deal/:id/move-zuteilen", async (req, reply) => {
    const dealId = String((req.params as { id: string }).id || "").trim();
    try {
      if (!dealId) return fail(req, reply, 400, "BAD_REQUEST", "id is required");
      const data = await deals.updateDealStage({ dealId, ...STAGES.ZUTEILEN });
      return { ok: true, dealId: Number(dealId), result: data?.result ?? data };
    } catch (err) {
      req.log.error({ err, dealId }, "move-zuteilen failed");
      return fail(req, reply, 500, "BITRIX_ERROR", msg(err));
    }
  });

  app.post("/api/bitrix/deal/:id/move-besichtigung", async (req, reply) => {
    const dealId = String((req.params as { id: string }).id || "").trim();
    const b = (req.body ?? {}) as Record<string, any>;
    try {
      if (!dealId) return fail(req, reply, 400, "BAD_REQUEST", "id is required");
      const comment = String(b.comment || "").trim();
      if (!comment) return fail(req, reply, 400, "BAD_REQUEST", "comment is required");
      const data = await deals.updateDealStage({ dealId, ...STAGES.BESICHTIGUNG });
      // stage move already happened — a failing comment must not report the whole action as failed
      let commentFailed = false;
      try { await deals.addTimelineComment({ entityType: "deal", entityId: dealId, comment }); }
      catch (e) { commentFailed = true; req.log.warn({ err: e, dealId }, "move-besichtigung comment failed"); }
      const email = req.user?.email;
      const user = email ? ((await User.findOne({ email }).lean().catch(() => null)) as any) : null;
      const planner = await planning.notifyTerminNotHeld({ dealId, reason: String(b.reason || "").trim() || comment, by: user?.name || email || null });
      if (!planner.ok) req.log.warn({ dealId, err: planner.error }, "planning termin-not-held sync failed");
      return { ok: true, dealId: Number(dealId), commentFailed, plannerSynced: planner.ok, result: data?.result ?? data };
    } catch (err) {
      req.log.error({ err, dealId }, "move-besichtigung failed");
      return fail(req, reply, 500, "BITRIX_ERROR", msg(err));
    }
  });

  // admin: replay a logged failed call with its original params; success marks it resolved,
  // a new failure writes a NEW log entry (via the client) and leaves the original untouched.
  app.post("/admin/api/bitrix-logs/:id/retry", { config: { admin: true } }, async (req, reply) => {
    try {
      const log = await BitrixLog.findById((req.params as { id: string }).id);
      if (!log) throw new Error("Log-Eintrag nicht gefunden");
      const result = await bx.call(log.method, (log.params as Record<string, unknown>) || {}, log.httpMethod === "GET" ? "GET" : "POST");
      log.resolved = true;
      log.resolvedAt = new Date();
      await log.save();
      return { ok: true, result };
    } catch (err) {
      req.log.error({ err }, "bitrix log retry failed");
      return fail(req, reply, 500, "BITRIX_ERROR", msg(err));
    }
  });
}
