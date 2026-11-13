// Public, typed surface of the pricing engine. The engine itself (core.ts) is a 1:1 port
// of the legacy JS; this file only names its inputs/outputs for the rest of v2.
import createPricingCore, {
  lineEditDeltas,
  computeFingerprint,
  NO_MARKUP_IDS,
  sumPriceAdjustments,
  type PricingDeps,
  type PricingProductModel,
  type PricingSnapshotModel,
} from "./core.js";

export type { PricingDeps, PricingProductModel, PricingSnapshotModel };
export { computeFingerprint, lineEditDeltas, NO_MARKUP_IDS, sumPriceAdjustments };
export { SUPPLIER_QUALITY, supplierCodes } from "./core.js";
// winwall: the catalogue names of the decors and the sealing sets an area needs (also used by the UI)
export { KERAMICO_SITUATIONS, keramicoPanelPlan, WINWALL_CATALOG, WINWALL_FORMATS, resolveWvArticle, vigourPanelPlan, winwallLeftoverM2, winwallOrderLines, winwallPanelPlan, winwallProfileSuggestion, winwallSealingSets } from "./core.js";
export * from "./tray-search.js";

/** One priced line (materials or services). Extra legacy fields are kept as-is. */
export interface PriceLine {
  productId?: string;
  id?: string;
  label?: string;
  qty?: number;
  unitPrice?: number;
  lineTotal?: number;
  [k: string]: unknown;
}

export interface PriceBlock {
  title: string;
  lines: PriceLine[];
  sum: number;
  [k: string]: unknown;
}

/** Result of computePrices — the fields v2 relies on; all legacy fields remain present. */
export interface PriceResult {
  total?: number;
  materials?: PriceBlock;
  services?: PriceBlock;
  subsidyAmount?: number;
  selfPayAmount?: number | null;
  markup?: number;
  markupPct?: number;
  /** Response-only flag: price came from a locked (sent) offer. */
  _locked?: boolean;
  [k: string]: unknown;
}

export interface PricingEngine {
  /**
   * Price a wizard payload. NOTE (legacy behaviour, kept for parity): the payload object
   * is mutated during computation — pass a clone if you need the original afterwards.
   */
  computePrices(payload: Record<string, unknown>): Promise<PriceResult>;
  computeServiceCosts(payload: Record<string, unknown>): Promise<PriceBlock>;
}

export function createPricingEngine(ProductModel: PricingProductModel, deps: PricingDeps): PricingEngine {
  return createPricingCore(ProductModel, deps) as unknown as PricingEngine;
}
export * from "./ah.js";
export * from "./aufschlag-rules.js";
