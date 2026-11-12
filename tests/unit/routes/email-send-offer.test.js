/**
 * POST /api/email/send-offer with every outbound dependency mocked (no SMTP,
 * no IMAP, no Bitrix, no PDF renderer, no database).
 *
 * - Audit S-06: text fields larger than busboy's 1 MB default (offer payload
 *   with sketches, custom photos as data-URLs) must be accepted.
 * - Audit S-12: a failing EmailLog write after SMTP success must not turn the
 *   answer into "Send failed" nor skip the Bitrix filing.
 */
import { jest } from "@jest/globals";
import express from "express";
import request from "supertest";
import { fileURLToPath } from "node:url";

const abs = (rel) => fileURLToPath(new URL(rel, import.meta.url));

const sendMail = jest.fn(async () => ({ messageId: "test-message" }));
const addTimelineComment = jest.fn(async () => ({ ok: true }));
const emailLogCreate = jest.fn(async () => ({}));

jest.unstable_mockModule("nodemailer", () => ({
  default: { createTransport: () => ({ sendMail }) },
}));
jest.unstable_mockModule("imapflow", () => ({
  ImapFlow: class {
    async connect() {
      throw new Error("imap disabled in tests");
    }
  },
}));
jest.unstable_mockModule(abs("../../../src/models/EmailLog.js"), () => ({
  default: { create: emailLogCreate },
}));
jest.unstable_mockModule(abs("../../../src/models/EmailSend.js"), () => ({
  default: { updateOne: async () => ({}) },
}));
jest.unstable_mockModule(abs("../../../src/models/UserActionLog.js"), () => ({
  default: { create: async () => ({}) },
}));
jest.unstable_mockModule(abs("../../../src/lib/sendLock.js"), () => ({
  claimSendLock: async () => null,
}));
jest.unstable_mockModule(abs("../../../src/routes/bitrix.js"), () => ({
  addTimelineComment,
  buildInternalNoteComment: () => "",
  setDealOfferLink: async () => ({}),
}));
jest.unstable_mockModule(abs("../../../src/routes/signing.js"), () => ({
  createSigningRequest: async () => ({ link: "https://example.test/sign/x" }),
}));
jest.unstable_mockModule(abs("../../../src/lib/ansprechpartner.js"), () => ({
  resolveAnsprechpartner: async (k) => k || {},
}));
jest.unstable_mockModule(abs("../../../src/routes/docx-template.js"), () => ({
  generateOfferPdfBuffer: async () => ({ pdfBuffer: Buffer.from("%PDF-test"), computed: { total: 100 }, data: {} }),
  convertDocxToPdf: async () => Buffer.from("%PDF-test"),
  getOfferRenderData: async () => ({ computed: {}, data: {} }),
  aggregateMaterialsForOverview: () => [],
}));
jest.unstable_mockModule(abs("../../../src/lib/productImagePdf.js"), () => ({
  generateProductImagePdf: async () => null,
  resolveProductImages: async () => [],
  floorWvIds: () => [],
  shouldSkipByDefault: () => false,
  PRODUCT_IMAGE_SKIP_KEYWORDS: [],
}));
jest.unstable_mockModule(abs("../../../src/services/configService.js"), () => ({
  default: { get: (_k, d) => d },
}));

process.env.SMTP_HOST = "smtp.invalid";
process.env.SMTP_USER = "test@example.test";
process.env.SMTP_PASS = "not-a-secret";

const { default: emailRouter } = await import("../../../src/routes/email.js");
const app = express();
app.use("/api/email", emailRouter);

const send = (payload) =>
  request(app)
    .post("/api/email/send-offer")
    .field("to", "kunde@example.test")
    .field("subject", "Angebot")
    .field("body", "Hallo")
    .field("offerNumber", "ANG-TEST-1")
    .field("offerType", "bu")
    .field("payload", JSON.stringify(payload));

beforeEach(() => {
  sendMail.mockClear();
  addTimelineComment.mockClear();
  emailLogCreate.mockReset();
  emailLogCreate.mockResolvedValue({});
});

test("accepts a payload text field larger than 1 MB (Audit S-06)", async () => {
  const sketch = "data:image/png;base64," + "A".repeat(3 * 1024 * 1024);
  const res = await send({ bitrixDealId: "123", bl: { sketch: { dataUrl: sketch } } });
  expect(res.status).toBe(200);
  expect(res.body.ok).toBe(true);
  expect(sendMail).toHaveBeenCalledTimes(1);
});

test("a failing EmailLog write after SMTP success still answers ok and files in Bitrix (Audit S-12)", async () => {
  emailLogCreate.mockRejectedValue(new Error("mongo hiccup"));
  const res = await send({ bitrixDealId: "123" });
  expect(res.status).toBe(200);
  expect(res.body.ok).toBe(true);
  expect(sendMail).toHaveBeenCalledTimes(1);
  expect(emailLogCreate).toHaveBeenCalledTimes(1);
  expect(addTimelineComment).toHaveBeenCalledTimes(1);
  expect(res.body.bitrixComment).toEqual({ ok: true });
});
