// Guard for ADR 026: modules/features import each other only through their index; platform,
// integrations and shared never depend on a module/feature; features register no global listeners.
import { describe, expect, it } from "vitest";
// @ts-expect-error plain .mjs script
import { AREAS, checkImport, checkSource, violations } from "../../../scripts/module-boundaries.mjs";

const server = AREAS[0], web = AREAS[1];

describe("module boundaries (ADR 026)", () => {
  it("the code base has no violations", () => {
    expect(violations()).toEqual([]);
  });

  it("server: another module only through its index; platform/integrations never import modules", () => {
    expect(checkImport("modules/offers/routes.ts", "./service.js", server)).toBeNull(); // own files
    expect(checkImport("modules/offers/routes.ts", "../sends/index.js", server)).toBeNull();
    expect(checkImport("modules/offers/routes.ts", "../sends", server)).toBeNull();
    expect(checkImport("modules/offers/routes.ts", "../../platform/db.js", server)).toBeNull();
    expect(checkImport("modules/offers/routes.ts", "@oc/pricing", server)).toBeNull();
    expect(checkImport("modules/offers/routes.ts", "../sends/store.js", server)).toMatch(/reaches into modules\/sends/);
    expect(checkImport("platform/db.ts", "../modules/offers/index.js", server)).toMatch(/platform\/ must not import modules\/offers/);
    expect(checkImport("integrations/bitrix.ts", "../modules/bitrix/service.js", server)).toMatch(/must not import/);
    expect(checkImport("app.ts", "./modules/offers/index.js", server)).toBeNull(); // composition root
  });

  it("web: another feature only through its index; shared never imports features; no global listeners", () => {
    expect(checkImport("features/offer/model/store.ts", "../../steps/index.js", web)).toBeNull();
    expect(checkImport("features/offer/model/store.ts", "../../steps/kosten/Kosten.js", web)).toMatch(/reaches into features\/steps/);
    expect(checkImport("shared/ui/Button.tsx", "../../features/offer/index.js", web)).toMatch(/shared\/ must not import features\/offer/);
    expect(checkSource("features/home/Home.tsx", 'import { x } from "../offer/model/store.js";\nconst y = import("../drafts/index.js");', web))
      .toEqual([expect.stringMatching(/reaches into features\/offer/)]);
    expect(checkSource("features/home/Home.tsx", 'window.addEventListener("hashchange", f);', web)).toEqual([expect.stringMatching(/listeners/)]);
    expect(checkSource("app/main.tsx", 'window.addEventListener("error", f);', web)).toEqual([]); // the app shell may
  });
});
