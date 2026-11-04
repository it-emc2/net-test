// DOCX golden master: the real docx-template router must produce the recorded text and
// structure (tables/images per part) for every selected anonymised case — offer DOCX and
// Materialübersicht. Built by scripts/golden/build-docs-golden.mjs. Runs fully in-process
// (in-memory MongoDB seeded from fixtures/docs), so it works in CI without any database.
import { jest } from "@jest/globals";
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  DOCS_DIR, PRICING_DIR, ENDPOINTS, startHarness, stopHarness, renderDocx, normaliseDocx, selectDocCases,
} from "./docs-harness.mjs";

jest.setTimeout(120000);

const snapshots = JSON.parse(readFileSync(join(DOCS_DIR, "snapshots.json"), "utf8"));
const byId = new Map(snapshots.map((s) => [s.id, s]));
const cases = selectDocCases(JSON.parse(readFileSync(join(PRICING_DIR, "cases.json"), "utf8")));

const quiet = ["log", "info", "warn"].map((m) => jest.spyOn(console, m).mockImplementation(() => {}));
beforeAll(startHarness);
afterAll(async () => {
  await stopHarness();
  quiet.forEach((s) => s.mockRestore());
  // material-overview writes a debug copy into cwd (current behaviour) — don't leave it around
  rmSync("out-Materialuebersicht.docx", { force: true });
});

describe("DOCX golden master", () => {
  test("every case × endpoint has a recorded snapshot", () => {
    for (const c of cases) for (const ep of ENDPOINTS) expect(byId.has(`${c.id}__${ep.key}`)).toBe(true);
  });

  const rows = cases.flatMap((c) => ENDPOINTS.map((ep) => [`${c.id}__${ep.key}`, c, ep]));
  test.each(rows)("%s", async (id, c, ep) => {
    const { status, body } = await renderDocx(ep.path, structuredClone(c.payload));
    expect(status).toBe(200);
    expect(normaliseDocx(body)).toEqual(byId.get(id).docx);
  });
});
