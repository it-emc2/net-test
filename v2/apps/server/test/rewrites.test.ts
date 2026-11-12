// Drift guard for P7-4 (ADR 022): every confirm() rewrite must still match today's UI files
// exactly once, and the result must be valid JavaScript without a native confirm() there.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { REWRITES, applyRewrites } from "../src/modules/web/rewrites.js";

const PUBLIC = fileURLToPath(new URL("../../../../src/public/", import.meta.url));

describe("UI rewrites (confirm → in-page dialog)", () => {
  it.each(Object.keys(REWRITES))("%s: all rules apply once, result parses", (file) => {
    const src = fs.readFileSync(PUBLIC + file, "utf8");
    const out = applyRewrites(file, src);
    for (const r of REWRITES[file]!) expect(out.includes(r.replace)).toBe(true);
    // real syntax check by Node (EmailManager is an ES module, script.js a classic script)
    const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ocrw-")), file.replace(/\.js$/, /^[A-Z]/.test(file) ? ".mjs" : ".cjs"));
    fs.writeFileSync(tmp, out);
    expect(() => execFileSync(process.execPath, ["--check", tmp], { stdio: "pipe" })).not.toThrow();
  });
  it("the four real confirm() questions are gone from what v2 serves", () => {
    const served = Object.keys(REWRITES).map((f) => applyRewrites(f, fs.readFileSync(PUBLIC + f, "utf8"))).join("\n");
    for (const text of ["Wirklich erneut senden?", "Trotzdem fortfahren?", "Wirklich einen ZWEITEN Brief", "wirklich entfernen? Alle Auswahlen"]) expect(served.includes(text)).toBe(false);
  });
});
