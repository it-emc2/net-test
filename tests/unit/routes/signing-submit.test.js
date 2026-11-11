/**
 * POST /api/signing/:token/documents/:key against a throwaway MongoDB
 * (mongodb-memory-server). Bitrix, SMTP and the PDF renderer are mocked —
 * nothing leaves the process.
 *
 * - Audit S-10: an invalid signature is rejected before it is stored.
 * - Audit S-06: a second identical submit returns the first result; mails
 *   and Bitrix filing happen once.
 */
import { jest } from "@jest/globals";
import express from "express";
import mongoose from "mongoose";
import request from "supertest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { fileURLToPath } from "node:url";

const abs = (rel) => fileURLToPath(new URL(rel, import.meta.url));

const sendMail = jest.fn(async () => ({ messageId: "m" }));
const addTimelineComment = jest.fn(async () => ({ ok: true }));
const htmlToPdfBuffer = jest.fn(async () => Buffer.from("%PDF-test"));

jest.unstable_mockModule("nodemailer", () => ({
  default: { createTransport: () => ({ sendMail }) },
}));
jest.unstable_mockModule(abs("../../../src/routes/bitrix.js"), () => ({
  addTask: async () => ({}),
  addTimelineComment,
  updateDealAfterSigning: jest.fn(async () => ({})),
  ensurePartnerContact: async () => ({ contactId: 1 }),
  getDealContactId: async () => 1,
  AH_SIGNING_CATEGORY_ID: 0,
  AH_SIGNING_STAGE_ID: "",
}));
jest.unstable_mockModule(abs("../../../src/routes/docx-template.js"), () => ({
  generateOfferPdfBuffer: async () => ({ pdfBuffer: Buffer.from("%PDF"), computed: {}, data: {} }),
  getOfferRenderData: async () => ({ computed: {}, data: {} }),
}));
jest.unstable_mockModule(abs("../../../src/utils/htmlToPdf.js"), () => ({
  htmlToPdfBuffer,
  closeBrowser: async () => {},
}));
jest.unstable_mockModule(abs("../../../src/lib/ansprechpartner.js"), () => ({
  resolveAnsprechpartner: async (k) => k || {},
}));

process.env.SMTP_HOST = "smtp.invalid";
process.env.SMTP_USER = "test@example.test";

const { default: signingRouter } = await import("../../../src/routes/signing.js");
const { default: SigningRequest } = await import("../../../src/models/SigningRequest.js");

const app = express();
app.use("/api/signing", signingRouter);

// 1×1 PNG and a second, different valid PNG (extra IEND-less bytes still decode)
const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const PNG2 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEklEQVR42mNk+M/AwMDAxAAAEW4BBM0q+YoAAAAASUVORK5CYII=";

let mongod;
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri(), { dbName: "signing-submit-test" });
}, 180000);
afterAll(async () => {
  await mongoose.disconnect();
  await mongod?.stop();
});

let seq = 0;
async function makeRequest(keys = ["zusatzblatt"]) {
  seq += 1;
  return SigningRequest.create({
    token: `t${seq}${"0".repeat(32)}`,
    offerNumber: `ANG-TEST-${seq}`,
    customerType: "SZ",
    bitrixEntityType: "deal",
    bitrixEntityId: "999",
    customerEmail: "kunde@example.test",
    payloadSnapshot: { Kundendaten: {} },
    prefill: { firstName: "A", lastName: "B", city: "Hof" },
    documents: keys.map((key) => ({ key })),
    expiresAt: new Date(Date.now() + 86400000),
  });
}
const submit = (token, key, signatureImage) =>
  request(app).post(`/api/signing/${token}/documents/${key}`).send({ signatureImage });
const completionComments = () =>
  addTimelineComment.mock.calls.filter(([a]) => /Alle Dokumente unterschrieben/.test(a.comment)).length;

beforeEach(() => {
  sendMail.mockClear();
  addTimelineComment.mockClear();
  htmlToPdfBuffer.mockReset();
  htmlToPdfBuffer.mockResolvedValue(Buffer.from("%PDF-test"));
});

test("rejects a signature that is not a strict PNG data URL and stores nothing (S-10)", async () => {
  const sr = await makeRequest();
  const res = await submit(sr.token, "zusatzblatt", 'data:image/png;base64,AAAA"><script>x</script>');
  expect(res.status).toBe(400);
  const after = await SigningRequest.findById(sr._id).lean();
  expect(after.documents[0].status).toBe("pending");
  expect(after.documents[0].signatureImage).toBe("");
});

test("two identical submits at the same time sign, mail and file once (S-06)", async () => {
  const sr = await makeRequest();
  const [a, b] = await Promise.all([
    submit(sr.token, "zusatzblatt", PNG),
    submit(sr.token, "zusatzblatt", PNG),
  ]);
  expect([a.status, b.status]).toEqual([200, 200]);
  expect([a.body.duplicate, b.body.duplicate].filter(Boolean)).toHaveLength(1);
  expect(sendMail).toHaveBeenCalledTimes(1);
  expect(completionComments()).toBe(1);
  const after = await SigningRequest.findById(sr._id).lean();
  expect(after.status).toBe("completed");
  expect(after.documents[0]).toMatchObject({ status: "signed", signatureImage: PNG });

  // A later retry of the same submit: first result again, nothing re-sent.
  const c = await submit(sr.token, "zusatzblatt", PNG);
  expect(c.status).toBe(200);
  expect(c.body).toMatchObject({ ok: true, completed: true, duplicate: true });
  expect(sendMail).toHaveBeenCalledTimes(1);

  // A different signature on an already signed document stays a conflict.
  const d = await submit(sr.token, "zusatzblatt", PNG2);
  expect(d.status).toBe(409);
});

test("two people signing the last two documents at once complete exactly once (S-06)", async () => {
  const sr = await makeRequest(["zusatzblatt", "vollmacht"]);
  const vollmachtFields = {
    lastName: "B", firstName: "A", street: "Teststr. 1", postalCode: "95028", city: "Hof",
    phone: "0123", geburtsdatum: "1950-01-01", kassenkundeName: "AOK", kk_versichertennr: "X1",
  };
  const [a, b] = await Promise.all([
    submit(sr.token, "zusatzblatt", PNG),
    request(app)
      .post(`/api/signing/${sr.token}/documents/vollmacht`)
      .send({ signatureImage: PNG2, editedFields: vollmachtFields }),
  ]);
  expect([a.status, b.status]).toEqual([200, 200]);
  const after = await SigningRequest.findById(sr._id).lean();
  expect(after.documents.map((d) => d.status)).toEqual(["signed", "signed"]);
  expect(after.status).toBe("completed");
  expect(completionComments()).toBe(1);
  expect(sendMail).toHaveBeenCalledTimes(1);
  // the Vollmacht edits were stored with the signature
  expect(after.prefill.street).toBe("Teststr. 1");
});
