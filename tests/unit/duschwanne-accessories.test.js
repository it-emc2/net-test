/**
 * Duschwanne accessories by line (decided 2026-10-19): the Ablaufgarnitur is the
 * Siphon Bridge 90 (PR95DW001) on the Standard (Badolux) line and AGD9060 on
 * Premium; Kleinmaterial is KM02 on both — AC004 is not used any more.
 */
import pricingCore from "../../src/logic/pricing-core.js";

const PRODUCTS = {
  AGD9060: { productId: "AGD9060", name: "Ablaufgarnitur", price: 20.2 },
  PR95DW001: { productId: "PR95DW001", name: "Siphon Bridge 90", price: 25.08, source: "badolux" },
  KM02: { productId: "KM02", name: "Kleinmaterial groß", price: 150 },
  AGB001: { productId: "AGB001", name: "Abfluss", price: 33.42 },
  AC004: { productId: "AC004", name: "1KU-PU-Kleber", price: 7.59 },
};
const ProductModel = {
  find: (q) => {
    const docs = (q?.productId?.$in || []).map((id) => PRODUCTS[id]).filter(Boolean);
    return { lean: async () => docs, select: () => ({ lean: async () => docs }) };
  },
  findOne: () => ({ lean: async () => null }),
};
const noDoc = { findOne: () => ({ select: () => ({ lean: async () => null }), lean: async () => null }) };
const { computePrices } = pricingCore(ProductModel, {
  cfg: { get: (_k, def) => def },
  fetchVigourNetPrices: async () => new Map(),
  OfferModel: noDoc,
  DraftModel: noDoc,
});

const ids = async (duschwanne) =>
  (await computePrices({
    activeOffer: "bu",
    Kundendaten: { payer: "Selbstzahler" },
    duschwanne: { drainSet: "on", smallMaterial: "on", ...duschwanne },
    wandverkleidung: {}, optional: {}, rabatt: {}, Arbeitszeit: {},
  })).materials.lines.map((l) => l.productId);

test("Premium: AGD9060 + KM02", async () => {
  expect(await ids({})).toEqual(["AGD9060", "KM02"]);
});

test("Standard: Siphon Bridge 90 + KM02, no AGB001 / AC004 (also not via the retired extra row)", async () => {
  expect(await ids({ budgetMode: "1", drainBadolux: "on" })).toEqual(["PR95DW001", "KM02"]);
});
