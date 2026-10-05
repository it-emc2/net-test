/**
 * @jest-environment node
 *
 * Postversand via onlinebrief24: the whole letter goes out in ONE
 * POST /v1/printjobs, so the request body is the thing worth pinning down —
 * auth object, md5 checksum of the base64 string, and the attachment order.
 */
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { PDFDocument } from "pdf-lib";
import postRouter from "../../src/routes/post.js";

// A real, minimal A4 PDF — the route parses every PDF now, so a fake string won't do.
const PDF = await (async () => {
  const doc = await PDFDocument.create();
  doc.addPage([595.28, 841.89]);
  return Buffer.from(await doc.save()).toString("base64");
})();

// Call the route handler straight out of the router — no HTTP server, so the
// test stays fast and immune to port/worker contention in the full suite.
const sendHandler = postRouter.stack.find((layer) => layer.route?.path === "/send").route.stack[0]
  .handle;

async function sendOnce(
  body,
  ob24Response = { status: 200, message: "OK", data: { id: 6035143, status: "queue", items: [{ pages: 2 }] } },
  httpStatus = 200,
) {
  process.env.OB24_API_KEY = "key-123";
  process.env.OB24_API_SECRET = "secret-456";
  process.env.OB24_MODE = "test";

  // tests/setup.js replaces global.fetch with a jest mock; the route is the only
  // fetch caller here, so we swap in our own recorder.
  const calls = [];
  const previousFetch = global.fetch;
  global.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    return {
      ok: httpStatus < 400,
      status: httpStatus,
      headers: { get: () => "application/json" },
      json: async () => ob24Response,
    };
  };

  const result = { status: 200, json: null };
  const res = {
    status(code) {
      result.status = code;
      return res;
    },
    json(payload) {
      result.json = payload;
      return res;
    },
  };

  try {
    await sendHandler({ body }, res);
    return { ...result, calls };
  } finally {
    global.fetch = previousFetch;
  }
}

const baseBody = {
  recipient: { name: "Max Mustermann", street: "Musterstr. 1", zipCode: "95032", city: "Hof" },
  document: { filename: "ANG-1.pdf", base64: PDF },
  attachments: [{ type: "upload", filename: "Extra.pdf", base64: PDF }],
  offerNumber: "ANG-1",
};

test("sends one printjob with auth, checksum and attachments", async () => {
  const { status, json, calls } = await sendOnce(baseBody);

  expect(status).toBe(200);
  expect(calls).toHaveLength(1);
  expect(calls[0].url).toBe("https://api.onlinebrief24.de/v1/printjobs");

  const { auth, letter } = calls[0].body;
  expect(auth).toEqual({ apiKey: "key-123", apiSecret: "secret-456", mode: "test" });
  expect(letter.base64_file).toBe(PDF);
  expect(letter.base64_file_checksum).toBe(crypto.createHash("md5").update(PDF).digest("hex"));
  expect(letter.specification).toEqual({ color: "4", mode: "duplex", shipping: "national" });
  expect(letter.base64_attachments).toEqual([PDF]);

  expect(json).toMatchObject({ ok: true, provider: "onlinebrief24", mode: "test", printjobId: 6035143 });
});

test("rejects an incomplete address before calling the API", async () => {
  const { status, json, calls } = await sendOnce({
    ...baseBody,
    recipient: { name: "Max Mustermann" },
  });

  expect(calls).toHaveLength(0);
  expect(status).toBe(500);
  expect(json.stage).toBe("normalize_recipient");
});

test("surfaces an onlinebrief24 error instead of reporting success", async () => {
  const { status, json } = await sendOnce(baseBody, { message: "Unauthorized." }, 401);

  expect(status).toBe(401);
  expect(json.ok).toBe(false);
  expect(json.error).toBe("Unauthorized.");
  expect(json.stage).toBe("submit_printjob");
});

// onlinebrief24 only accepts A4 portrait. Real assets from the repo are used as
// fixtures: the Abtretung is A4, the flyer is landscape (859x612).
const asset = (name) => path.join(process.cwd(), "src", "public", "assets", "Email", name);
const pageSizes = async (base64) =>
  (await PDFDocument.load(Buffer.from(base64, "base64")))
    .getPages()
    .map((p) => [Math.round(p.getSize().width), Math.round(p.getSize().height)]);

test("fits a non-A4 PDF onto A4 portrait before sending", async () => {
  const landscape = (await fs.readFile(asset("emc2_Barrierefreies_Wohnen.pdf"))).toString("base64");
  expect(await pageSizes(landscape)).toEqual([[859, 612], [859, 612]]);

  const { calls } = await sendOnce({
    ...baseBody,
    attachments: [{ type: "upload", filename: "Flyer.pdf", base64: landscape }],
  });

  expect(await pageSizes(calls[0].body.letter.base64_attachments[0])).toEqual([
    [595, 842],
    [595, 842],
  ]);
});

test("leaves an already-A4 PDF untouched", async () => {
  const a4 = (await fs.readFile(asset("Abtretungserklärung.pdf"))).toString("base64");

  const { calls } = await sendOnce({ ...baseBody, document: { filename: "A4.pdf", base64: a4 }, attachments: [] });

  expect(calls[0].body.letter.base64_file).toBe(a4);
  expect(calls[0].body.letter.base64_file_checksum).toBe(crypto.createHash("md5").update(a4).digest("hex"));
});
