// Model drift guard: field names + defaults of the v2 models must equal the legacy
// Mongoose models on this branch (a new field on main fails here until ported).
import { describe, expect, it } from "vitest";
import mongoose from "mongoose";
import * as v2 from "../src/models.js";

// legacy models come from the repo root (they use the root's own mongoose copy → no collisions)
const legacyModel = async (file: string) => {
  const url = new URL(`../../../../src/models/${file}`, import.meta.url).href;
  const src = await import(/* @vite-ignore */ url);
  return (src.default as mongoose.Model<any>).schema;
};
const shape = (schema: mongoose.Schema) =>
  Object.fromEntries(Object.entries(schema.paths).filter(([k]) => !["_id", "__v"].includes(k))
    .map(([k, p]: [string, any]) => [k, { type: p.instance, def: typeof p.defaultValue === "function" ? "fn" : p.defaultValue ?? null }]));

describe("v2 models match legacy models", () => {
  it.each([["Product.js", v2.Product], ["Service.js", v2.Service], ["User.js", v2.User], ["AppConfig.js", v2.AppConfig], ["Offer.js", v2.Offer], ["Draft.js", v2.Draft],
    ["Customer.js", v2.Customer], ["BitrixLog.js", v2.BitrixLog], ["UserActionLog.js", v2.UserActionLog], ["EmailSend.js", v2.EmailSend], ["EmailLog.js", v2.EmailLog], ["PostalSend.js", v2.PostalSend], ["SigningRequest.js", v2.SigningRequest]])(
    "%s", async (file, model) => {
      const legacy = await legacyModel(file);
      expect(shape(model.schema)).toEqual(shape(legacy));
    });
});
