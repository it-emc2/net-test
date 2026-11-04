// The copied CONFIG_SCHEMA must equal the legacy one (keys, defaults, metadata).
import { describe, expect, it } from "vitest";
// @ts-expect-error — untyped legacy module from the current app
import { CONFIG_SCHEMA as LEGACY } from "../../../../src/services/configService.js";
import { BusinessConfig, CONFIG_SCHEMA } from "../src/business-config.js";

describe("business config", () => {
  it("schema is identical to legacy", () => expect(JSON.parse(JSON.stringify(CONFIG_SCHEMA))).toEqual(JSON.parse(JSON.stringify(LEGACY))));

  it("overrides win, unknown keys fall back", async () => {
    const bc = new BusinessConfig(async () => [{ key: "TAX_RATE", value: 0.07 }]);
    await bc.refresh();
    expect(bc.get("TAX_RATE")).toBe(0.07);
    expect(bc.get("LABOR_RATE_KK")).toBe(LEGACY.find((d: any) => d.key === "LABOR_RATE_KK").value);
    expect(bc.get("NOPE", 42)).toBe(42);
  });

  it("a failing refresh keeps the cache and logs", async () => {
    const warns: unknown[] = [];
    const bc = new BusinessConfig(async () => { throw new Error("db down"); });
    await bc.refresh({ warn: (o) => warns.push(o) });
    expect(warns).toHaveLength(1);
    expect(bc.get("TAX_RATE")).toBe(0.19);
  });
});
