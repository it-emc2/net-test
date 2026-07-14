import type { OptionalCategoryDef } from "@emc2/shared";

// Seed catalog ported from the legacy Optional tab. Used when the DB
// "optionalcategories" collection is empty; the Admin CRUD (Phase B) overrides it.
// Prices/names/images are resolved live (Vigor → legacy Products) at request time.
export const OPTIONAL_CATALOG_SEED: OptionalCategoryDef[] = [
  {
    id: "cat_SHOWER",
    label: "Duschsystem",
    order: 1,
    selection: "multi",
    items: [
      { productId: "V22WS1R" },
      { productId: "TEMPDSU250" },
      { productId: "V22BG903R" },
      { productId: "V12DS250E" },
    ],
  },
  {
    id: "cat_THERMO",
    label: "Thermostat",
    order: 2,
    selection: "multi",
    items: [{ productId: "CLTB" }, { productId: "DEPTB" }, { productId: "CLB" }],
  },
  {
    id: "cat_GRAB",
    label: "Haltegriffe",
    order: 3,
    selection: "multi",
    items: [
      { productId: "CLPESG30" },
      { productId: "CLPESG40" },
      { productId: "CLPESG60" },
      { productId: "CLPESG80" },
    ],
  },
  {
    id: "cat_FOLD",
    label: "Stützklappgriffe",
    order: 4,
    selection: "multi",
    items: [{ productId: "DEPSKG60" }, { productId: "DEPSKG85" }],
  },
  {
    id: "cat_BASIN",
    label: "Waschtisch",
    order: 5,
    selection: "multi",
    // Selecting a basin auto-adds the required companions (legacy BASIN rule).
    items: [
      { productId: "CL60", companions: [{ productId: "WTBF", qtyRatio: 1 }, { productId: "RSL", qtyRatio: 1 }, { productId: "EV", qtyRatio: 2 }] },
      { productId: "CL65", companions: [{ productId: "WTBF", qtyRatio: 1 }, { productId: "RSL", qtyRatio: 1 }, { productId: "EV", qtyRatio: 2 }] },
      { productId: "CL55", companions: [{ productId: "WTBF", qtyRatio: 1 }, { productId: "RSL", qtyRatio: 1 }, { productId: "EV", qtyRatio: 2 }] },
      { productId: "ON35", companions: [{ productId: "WTBF", qtyRatio: 1 }, { productId: "RSL", qtyRatio: 1 }, { productId: "EV", qtyRatio: 2 }] },
    ],
  },
  {
    id: "cat_BASIN_TAP",
    label: "Waschtischarmatur",
    order: 6,
    selection: "multi",
    items: [{ productId: "CL_BASIN" }, { productId: "DEPOH" }],
  },
  {
    id: "cat_SEAT",
    label: "Duschsitz / Hocker",
    order: 7,
    selection: "multi",
    items: [{ productId: "DEPKS" }, { productId: "CLPESDH" }, { productId: "78090000" }],
  },
  {
    id: "cat_WC",
    label: "WC",
    order: 8,
    selection: "multi",
    special: "wc",
    // WC panel derives its structure from the data:
    //  - items WITHOUT companions = base "Produkte für Wandmontage" (auto-selected)
    //  - items WITH a companion (the matching WC-Sitz) = selectable WC models (single-select)
    items: [
      { productId: "CVIS3WCT112" },
      { productId: "SCHALL" },
      { productId: "V1DON" },
      { productId: "0601010003" },
      { productId: "DERWWCOSVP", companions: [{ productId: "DERSIAS", qtyRatio: 1 }] },
      {
        productId: "DEDWWC",
        // Derby V3 AQUAWASH: extra product shots from the legacy assets.
        extraImages: ["/assets/wc/DEDWWC1.png", "/assets/wc/DEDWWC2.png", "/assets/wc/DEDWWC3.png"],
        companions: [{ productId: "DERSIAS", qtyRatio: 1 }],
      },
      { productId: "CLPWWCOS5", companions: [{ productId: "CLSIAS", qtyRatio: 1 }] },
    ],
  },
  {
    id: "cat_METER",
    label: "Wasserzähler",
    order: 9,
    selection: "multi",
    items: [{ productId: "TECEADS" }],
  },
  {
    id: "cat_RAMPE",
    label: "Rampe",
    order: 10,
    selection: "multi",
    items: [{ productId: "RAMPE35" }],
  },
  {
    id: "cat_WESGH",
    label: "Weitere Haltegriffe",
    order: 11,
    selection: "multi",
    items: [{ productId: "WESGH" }],
  },
  {
    id: "cat_SONDER",
    label: "Sonderprodukte",
    order: 12,
    selection: "multi",
    special: "sonder",
    items: [],
  },
];
