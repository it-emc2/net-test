// POST /api/bitrix/deal/:id/main-contact (v2 only, owner 2026-11-27) — Kundendaten: the deal's
// Bitrix contact is not the insured person typed in the offer. Two answers write to Bitrix:
//  - "replace": the insured person (found or created) becomes the deal's primary contact; the old
//    contact stays linked to the deal (it is the Ansprechpartner) — integrations/bitrix-deal.ts
//  - "rename": the SAME contact gets the typed first and last name (spelling only)
// The deal is read fresh first: another contact than the one the user saw → 409, nothing written.
// More than one fitting contact → 409 ambiguous, nothing written. A failed timeline note does not
// fail the change. Afterwards the server's copy of the deal's customer is dropped (customer.ts).
import { ERROR_CODES, MainContactRequestSchema } from "@oc/api-contract";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { DealWrites } from "../../integrations/bitrix-deal.js";
import { User, UserActionLog } from "../../platform/models.js";

const fail = (req: FastifyRequest, reply: FastifyReply, status: number, code: string, message: string, extra: Record<string, unknown> = {}) =>
  reply.status(status).send({ error: { code, message, requestId: req.id }, ...extra });
const msg = (err: unknown) => (err as Error)?.message || String(err);

export const MAIN_CONTACT_TEXT = {
  changed: "Der Kontakt dieses Auftrags wurde in Bitrix inzwischen geändert. Bitte laden Sie die Kundendaten neu. In Bitrix wurde nichts geändert.",
  ambiguous: "Mehrere passende Kontakte in Bitrix – bitte im Büro klären",
  noDeal: "Diesen Auftrag gibt es in Bitrix nicht.",
  failed: "Bitrix konnte den Kontakt nicht ändern. Bitte prüfen Sie den Auftrag in Bitrix oder geben Sie dem Büro Bescheid.",
  invalid: "Die Angaben zum Kontakt sind unvollständig.",
} as const;

export interface MainContactDeps {
  deals: Pick<DealWrites, "changeMainContact">;
  /** drops the server's copy of the deal's customer (modules/bitrix/customer.ts) */
  forgetDealCustomer?: (dealId: string) => void;
}

export async function registerMainContact(app: FastifyInstance, d: MainContactDeps) {
  const auditLog = (req: FastifyRequest, entry: Record<string, unknown>) =>
    void UserActionLog.create(entry).catch((e) => req.log.warn({ err: e, event: entry.event }, "user action log failed"));

  app.post("/api/bitrix/deal/:id/main-contact", async (req, reply) => {
    const dealId = String((req.params as { id: string }).id || "").trim();
    if (!/^\d{1,12}$/.test(dealId)) return fail(req, reply, 400, ERROR_CODES.INVALID_DEAL_ID, "Die Auftragsnummer besteht nur aus Ziffern.");
    const parsed = MainContactRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) return fail(req, reply, 400, "BAD_REQUEST", MAIN_CONTACT_TEXT.invalid);
    const { mode, expectedContactId, person } = parsed.data;
    const email = req.user?.email ?? "";
    const user = email ? ((await User.findOne({ email }).lean().catch(() => null)) as { name?: string } | null) : null;
    const by = String(user?.name || "").trim() || email || "unbekannt";
    try {
      const r = await d.deals.changeMainContact(
        { dealId: Number(dealId), mode, expectedContactId: Number(expectedContactId), person, by },
        (m, err) => req.log.warn({ err, dealId }, m),
      );
      if (r.kind === "no-deal") return fail(req, reply, 404, ERROR_CODES.DEAL_NOT_FOUND, MAIN_CONTACT_TEXT.noDeal);
      if (r.kind === "moved") {
        d.forgetDealCustomer?.(dealId);
        return fail(req, reply, 409, ERROR_CODES.MAIN_CONTACT_CHANGED, MAIN_CONTACT_TEXT.changed, { contactId: r.contactId === null ? null : String(r.contactId) });
      }
      if (r.kind === "ambiguous") {
        req.log.info({ dealId, candidates: r.candidates.length }, "main contact: several fitting contacts");
        return fail(req, reply, 409, ERROR_CODES.MAIN_CONTACT_AMBIGUOUS, MAIN_CONTACT_TEXT.ambiguous, { ambiguous: true });
      }
      d.forgetDealCustomer?.(dealId);
      auditLog(req, { event: "main_contact_changed", dealId, message: `${mode}: ${expectedContactId} → ${r.contactId}${r.created ? " (neu)" : ""}` });
      return { ok: true as const, contactId: String(r.contactId), created: r.created, mode, ...(r.commentFailed ? { commentFailed: true } : {}) };
    } catch (err) {
      req.log.error({ err, dealId, mode }, "main contact change failed");
      d.forgetDealCustomer?.(dealId); // a part may have been written
      auditLog(req, { event: "main_contact_failed", dealId, message: `${mode}: ${msg(err)}`.slice(0, 500) });
      return fail(req, reply, 502, ERROR_CODES.MAIN_CONTACT_FAILED, MAIN_CONTACT_TEXT.failed);
    }
  });
}
