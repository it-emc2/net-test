// Composition root (ADR 026): builds the shared services (pricing engine, Bitrix client, mailers,
// PDF engine) and registers every module. No routes live here.
import type { FastifyInstance } from "fastify";
import { secondOfferSettings, type AppConfig as Cfg } from "@oc/config";
import { pricingRulesOf } from "@oc/domain";
import { registerAuth } from "./modules/auth/index.js";
import { registerPricing, registerSubmissions } from "./modules/pricing/index.js";
import { BusinessConfig, CONFIG_SCHEMA } from "./platform/business-config.js";
import { AppConfig, Draft, Offer, Product } from "./platform/models.js";
import { vigorPriceFetcher } from "./integrations/vigor.js";
import { registerOffersExternal, registerOffersRead, registerOffersWrite, resolveAnsprechpartner } from "./modules/offers/index.js";
import { registerDealDrafts } from "./modules/deal-drafts/index.js";
import { registerSends } from "./modules/sends/index.js";
import { createSentAwarePricing, sentOfferRecorder } from "./modules/sends/index.js";
import { registerOfferNumbers } from "./modules/sends/index.js";
import { registerAdmin } from "./modules/admin/index.js";
import { registerCustomers } from "./modules/customers/index.js";
import { registerBitrixRead, registerDealCustomer } from "./modules/bitrix/index.js";
import { BitrixClient } from "./integrations/bitrix.js";
import { BitrixLog, PDF_LOG_APP, PdfLog } from "./platform/models.js";
import { dealWrites } from "./integrations/bitrix-deal.js";
import { PlanningClient } from "./integrations/planning.js";
import { registerBitrixWrite } from "./modules/bitrix/index.js";
import { fileURLToPath } from "node:url";
import { Mailer, type MailConfig } from "./integrations/mail.js";
import { registerEmail } from "./modules/email/index.js";
import { registerPost } from "./modules/post/index.js";
import { registerRouting, registerTodaysCustomers } from "./modules/planning/index.js";
import { registerMagic } from "./modules/catalog/index.js";
import { registerSigning } from "./modules/signing/index.js";
import { registerCatalog, registerCatalogBulk, registerProductsRead, registerVigorPrices } from "./modules/catalog/index.js";
import { registerDocuments } from "./modules/documents/index.js";
import { registerRetired } from "./modules/web/index.js";
import { registerWeb } from "./modules/web/index.js";
import { Gotenberg, withPdfLog, type PdfEngine } from "./integrations/gotenberg.js";
import type { SigningRenderer } from "./modules/signing/index.js";
import { MagicApi } from "./integrations/magic.js";
import { RoutingService } from "./modules/planning/index.js";
import { todaysCustomers } from "./integrations/todays-customers.js";
import { Onlinebrief24 } from "./integrations/onlinebrief24.js";
import { UNAVAILABLE_DOCUMENTS, type OfferDocuments, type SigningPort } from "./modules/email/index.js";

/** Until the frontend moves (phase 6) v2 serves the legacy app's static assets. */
const LEGACY_ASSETS = fileURLToPath(new URL("../../../../src/public/assets", import.meta.url));
const LEGACY_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const LEGACY_PUBLIC = fileURLToPath(new URL("../../../../src/public", import.meta.url));
const LEGACY_SIGN_PAGE = fileURLToPath(new URL("../../../../src/public/signpage/index.html", import.meta.url));

export interface ApiDeps {
  cfg: Cfg; businessConfig?: BusinessConfig; bitrix?: BitrixClient;
  /** test seams: documents (phase 5), signing (4g), mail TLS for the local test server */
  documents?: OfferDocuments; signing?: SigningPort; mailTls?: MailConfig["tls"];
  /** signing document rendering (phase 5); default: unavailable */
  signingRenderer?: SigningRenderer;
  /** PDF engine (default: Gotenberg at GOTENBERG_URL) */
  pdfEngine?: PdfEngine;
}

export async function registerApi(app: FastifyInstance, deps: ApiDeps) {
  const { cfg } = deps;
  const secureCookie = cfg.COOKIE_SECURE ?? cfg.NODE_ENV === "production";
  const businessConfig = deps.businessConfig ?? new BusinessConfig(() => AppConfig.find({}).lean() as any);
  if (!deps.businessConfig) await businessConfig.init(app.log);
  app.addHook("onClose", async () => businessConfig.stop());

  // sent offers return their stored price; an offer that was only saved does so while it is
  // unchanged (sends/pinned-price.ts); drafts/offers feed the snapshot cache (legacy pricing.js)
  const { pricing, unpinned: unpinnedPricing } = createSentAwarePricing(Product as any, {
    cfg: businessConfig,
    fetchVigourNetPrices: vigorPriceFetcher(cfg.VIGOR_MONGODB_URI ?? cfg.MONGODB_URI),
    OfferModel: Offer as any,
    DraftModel: Draft as any,
  });

  await registerAuth(app, { authSecret: cfg.AUTH_SECRET, secureCookie });
  await registerProductsRead(app);
  await registerOffersRead(app);
  // ---------------- documents (phase 5) ----------------
  const pdfEngine = deps.pdfEngine ?? withPdfLog(
    new Gotenberg({ baseUrl: cfg.GOTENBERG_URL, timeoutMs: cfg.GOTENBERG_TIMEOUT_MS }),
    (row) => { PdfLog.create({ app: PDF_LOG_APP, engine: "gotenberg", ...row }).catch(() => {}); },
  );
  const vigorPrices = vigorPriceFetcher(cfg.VIGOR_MONGODB_URI ?? cfg.MONGODB_URI);
  const { offerDocuments, signingRenderer: ownSigningRenderer } = await registerDocuments(app, {
    businessConfig, fetchVigourNetPrices: vigorPrices, vigorUri: cfg.VIGOR_MONGODB_URI ?? cfg.MONGODB_URI, root: cfg.DOCUMENTS_ROOT ?? LEGACY_ROOT, pdf: pdfEngine,
    externalApiKey: cfg.EXTERNAL_API_KEY,
    log: { debug: (o, m) => app.log.debug(o, m), warn: (o, m) => app.log.warn(o, m), error: (o, m) => app.log.error(o, m) },
  });
  const ownDocuments: OfferDocuments = offerDocuments;
  await registerRetired(app);
  // ---------------- today's UI (phase 6a, ADR 021) ----------------
  await registerWeb(app, {
    publicDir: cfg.WEB_PUBLIC_DIR ?? LEGACY_PUBLIC, logicDir: `${cfg.DOCUMENTS_ROOT ?? LEGACY_ROOT}/src/logic`,
    fontAwesomeDir: `${cfg.DOCUMENTS_ROOT ?? LEGACY_ROOT}/node_modules/@fortawesome/fontawesome-free`, authSecret: cfg.AUTH_SECRET,
    indexInjections: ['<script src="/v2/addons/deal-link.js" defer></script>', '<script src="/v2/addons/local-store.js" defer></script>', '<script src="/v2/addons/deal-draft.js" defer></script>', '<script src="/v2/addons/ux.js" defer></script>', '<script src="/v2/addons/header.js" defer></script>', '<script src="/v2/addons/quickwins.js" defer></script>', '<script src="/v2/addons/send-guard.js" defer></script>', '<script src="/v2/addons/offer-record.js" defer></script>', '<script src="/v2/addons/kosten-edit.js" defer></script>'],
  });
  await registerCatalog(app, {
    vigorUri: cfg.VIGOR_MONGODB_URI ?? cfg.MONGODB_URI,
    badoluxDiscount: () => businessConfig.get("BU_BADOLUX_DISCOUNT", 0.25),
    badoluxModelFile: `${LEGACY_PUBLIC}/configurator/badolux-model.json`,
    vorhangAssetsDir: `${cfg.ASSETS_DIR ?? LEGACY_ASSETS}/vorhang`,
  });
  await registerVigorPrices(app, { vigorUri: cfg.VIGOR_MONGODB_URI ?? cfg.MONGODB_URI });
  await registerCatalogBulk(app);
  await registerSubmissions(app, { computePrices: (p) => pricing.computePrices(p) });
  await registerOffersExternal(app, { externalApiKey: cfg.EXTERNAL_API_KEY });
  await registerOffersWrite(app, pricing, { apDefaultEmail: cfg.AP_DEFAULT_EMAIL ?? "" });
  const bitrix = deps.bitrix ?? new BitrixClient({
    baseUrl: cfg.BITRIX_WEBHOOK_BASE,
    minGapMs: cfg.BITRIX_MIN_GAP_MS,
    logFailure: async (entry) => {
      app.log.error({ bitrixMethod: entry.method, httpMethod: entry.httpMethod, err: entry.message }, "bitrix call failed");
      await BitrixLog.create(entry);
    },
  });
  const deals = dealWrites(bitrix, { offerLinkBase: cfg.OFFER_LINK_BASE });
  await registerDealDrafts(app, {
    // a new variant is the signed-in user's document, like "Neue Version" (ADR 027 A)
    resolveContact: (kd, user) => resolveAnsprechpartner({ ...kd, ansprechpartner: user?.email ?? "" }, user, cfg.AP_DEFAULT_EMAIL ?? ""),
    // a second offer type for the same customer: a new deal in „Neue Anfragen“ (ADR 027 B)
    secondOffer: {
      deals, bitrixConfigured: () => bitrix.configured, settings: secondOfferSettings(cfg),
      pricingRules: () => pricingRulesOf(Object.fromEntries(CONFIG_SCHEMA.map((d) => [d.key, businessConfig.get(d.key)]))),
    },
  });
  await registerCustomers(app);
  await registerAdmin(app, { businessConfig, authSecret: cfg.AUTH_SECRET, secureCookie });
  await registerBitrixRead(app, bitrix);
  await registerDealCustomer(app, bitrix);
  await registerSends(app, { deals });
  await registerOfferNumbers(app);
  const ensureSentOffer = sentOfferRecorder(unpinnedPricing, app.log);
  const signingSvc = await registerSigning(app, {
    ensureSentOffer,
    deals, renderer: deps.signingRenderer ?? ownSigningRenderer,
    mailer: new Mailer({
      smtpHost: cfg.SMTP_HOST, smtpPort: cfg.SMTP_PORT || 587, secure: cfg.SMTP_SECURE === "true", requirePass: false,
      smtpEmail: cfg.SMTP_EMAIL, smtpUser: cfg.SMTP_USER, smtpPass: cfg.SMTP_PASS, replyTo: cfg.SMTP_REPLY_TO,
      ...(deps.mailTls ? { tls: deps.mailTls } : {}),
    }),
    officeEmail: cfg.SIGNING_OFFICE_EMAIL, assetsDir: cfg.ASSETS_DIR ?? LEGACY_ASSETS, signPageFile: LEGACY_SIGN_PAGE,
    publicBaseUrl: cfg.PUBLIC_BASE_URL, apDefaultEmail: cfg.AP_DEFAULT_EMAIL ?? "", authSecret: cfg.AUTH_SECRET, log: app.log,
  });
  const ownSigning: SigningPort = {
    createRequest: async (a) => {
      const r: any = await signingSvc.createRequest(a);
      return { link: r.link, token: r.token };
    },
  };
  await registerEmail(app, {
    mailer: new Mailer({
      smtpHost: cfg.SMTP_HOST, smtpPort: cfg.SMTP_SEND_PORT, smtpEmail: cfg.SMTP_EMAIL, smtpUser: cfg.SMTP_USER, smtpPass: cfg.SMTP_PASS,
      replyTo: cfg.SMTP_REPLY_TO, imapHost: cfg.IMAP_HOST, imapPort: cfg.IMAP_PORT, imapPass: cfg.IMAP_PASS, imapSentFolder: cfg.IMAP_SENT_FOLDER,
      ...(deps.mailTls ? { tls: deps.mailTls } : {}),
    }),
    deals, documents: deps.documents ?? ownDocuments, signing: deps.signing ?? ownSigning, businessConfig,
    assetsDir: cfg.ASSETS_DIR ?? LEGACY_ASSETS, publicBaseUrl: cfg.PUBLIC_BASE_URL, apDefaultEmail: cfg.AP_DEFAULT_EMAIL ?? "",
    smtpTestPort: cfg.SMTP_PORT || 465, smtpHost: cfg.SMTP_HOST, ensureSentOffer,
  });
  const num = (v?: string) => parseFloat(v ?? "") || null; // legacy parseFloat(env) || null
  await registerRouting(app, {
    routing: new RoutingService({
      orsApiKey: cfg.ORS_API_KEY, photonUrl: cfg.GEO_PHOTON_URL, nominatimUrl: cfg.GEO_NOMINATIM_URL, orsUrl: cfg.GEO_ORS_URL, osrmUrl: cfg.ROUTE_OSRM_URL,
      companyAddress: cfg.COMPANY_ADDRESS, companyLat: num(cfg.COMPANY_LAT), companyLng: num(cfg.COMPANY_LNG), companyAddressAh: cfg.COMPANY_ADDRESS_AH, companyAhLat: num(cfg.COMPANY_AH_LAT), companyAhLng: num(cfg.COMPANY_AH_LNG), log: app.log,
    }),
    planning: new PlanningClient({ baseUrl: cfg.PLANNING_API_BASE_URL, apiKey: cfg.PLANNING_API_KEY }),
  });
  await registerTodaysCustomers(app, todaysCustomers({ baseUrl: cfg.BITRIX_WEBHOOK_BASE }));
  await registerMagic(app, new MagicApi({ baseUrl: cfg.EXTERNAL_API_BASE, user: cfg.EXTERNAL_API_USER, password: cfg.EXTERNAL_API_PASSWORD }));
  await registerPost(app, {
    ob24: new Onlinebrief24({ baseUrl: cfg.OB24_BASE_URL, apiKey: cfg.OB24_API_KEY, apiSecret: cfg.OB24_API_SECRET, mode: cfg.OB24_MODE, allowProductionDefault: cfg.NODE_ENV === "production" }),
    deals, assetsDir: cfg.ASSETS_DIR ?? LEGACY_ASSETS, ensureSentOffer,
  });
  await registerBitrixWrite(app, {
    bx: bitrix,
    deals,
    planning: new PlanningClient({ baseUrl: cfg.PLANNING_API_BASE_URL, apiKey: cfg.PLANNING_API_KEY }),
    materialCodesField: cfg.BITRIX_FIELD_MATERIAL_CODES,
  });

  await registerPricing(app, { computePrices: (p) => pricing.computePrices(p), businessConfig, buildId: cfg.BUILD_ID });
}
