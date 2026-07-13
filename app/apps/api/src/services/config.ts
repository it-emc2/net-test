// Single source of truth for configurable business constants (pricing rates,
// thresholds, subsidies). Ported from src/services/configService.js — same keys
// and defaults, loaded from the shared "appconfigs" collection at startup.
import AppConfig from "../models/AppConfig.js";

export interface ConfigEntry {
  key: string;
  value: number;
  label: string;
  unit: string;
  type: "percent" | "euro" | "integer" | "number";
  section: "shared" | "fahrt" | "bu" | "bwt" | "zuschuss";
  order: number;
  description: string;
  note?: string;
}

export const CONFIG_SCHEMA: ConfigEntry[] = [
  // ── ALLGEMEIN ──
  { key: "TAX_RATE", value: 0.19, label: "Mehrwertsteuersatz", unit: "%", type: "percent", section: "shared", order: 1, description: "MwSt auf Nettobeträge (0.19 = 19 %)", note: "Erfordert Serverneustart nach Änderung" },
  { key: "LABOR_RATE_KK", value: 69.5, label: "Stundensatz Kassenkunde", unit: "€/h", type: "euro", section: "shared", order: 2, description: "Stundensatz für Kassenpatienten (KK)" },
  { key: "LABOR_RATE_SZ", value: 59.5, label: "Stundensatz Selbstzahler", unit: "€/h", type: "euro", section: "shared", order: 3, description: "Stundensatz für Selbstzahler (SZ)" },
  { key: "MAX_MATERIAL_DISCOUNT", value: 0.09, label: "Max. Materialrabatt", unit: "%", type: "percent", section: "shared", order: 4, description: "Maximaler Rabatt auf Materialkosten (0.09 = 9 %)" },
  { key: "OFFER_VALIDITY_WEEKS", value: 8, label: "Angebotsgültigkeit", unit: "Wochen", type: "integer", section: "shared", order: 5, description: "Gültigkeitsdauer eines Angebots ab Angebotsdatum" },
  { key: "KK_PAYMENT_THRESHOLD", value: 2000, label: "KK Zahlungsschwelle", unit: "€", type: "euro", section: "shared", order: 6, description: "Betrag ab dem andere Zahlungsbedingungen für KK gelten" },
  // ── ARBEITSZEIT & FAHRT ──
  { key: "KM_RATE", value: 0.35, label: "Kilometerpauschale", unit: "€/km", type: "euro", section: "fahrt", order: 1, description: "Kosten pro Kilometer (Hin- und Rückfahrt)" },
  { key: "FAHRZEUGBEREITSTELLUNG", value: 80.0, label: "Fahrzeugbereitstellung", unit: "€/Tag", type: "euro", section: "fahrt", order: 2, description: "Tagesrate für Fahrzeugbereitstellung" },
  { key: "WERKZEUG", value: 7.5, label: "Maschinen & Werkzeuge", unit: "€/Tag", type: "euro", section: "fahrt", order: 3, description: "Tagesrate: Bereitstellung und Vorhaltung Maschinen & Werkzeuge" },
  { key: "BERAEUMUNG", value: 4.5, label: "Beräumung der Baustelle", unit: "€/Tag", type: "euro", section: "fahrt", order: 4, description: "Tagesrate: Beräumung der Baustelle" },
  // ── BU – BADUMBAU ──
  { key: "BU_FLOOR_PANEL_SIZE_M2", value: 0.3, label: "Bodenpaneel Fläche", unit: "m²", type: "number", section: "bu", order: 1, description: "Fläche eines einzelnen Bodenpaneels (V5FB02)" },
  { key: "BU_FLOOR_WASTE_FACTOR", value: 1.15, label: "Verschnittfaktor Boden", unit: "", type: "number", section: "bu", order: 2, description: "Aufschlag für Verschnitt bei Bodenpaneelen (1.15 = +15 %)" },
  { key: "BU_FLOOR_ADHESIVE_COVERAGE", value: 0.6, label: "Kleber Abdeckung", unit: "m²/Pack", type: "number", section: "bu", order: 3, description: "Fläche die ein Kleberpack (R_4260602) abdeckt" },
  { key: "BU_STELZLAGER_DEFAULT_QTY", value: 8, label: "Stelzlager Standardmenge", unit: "Stk", type: "integer", section: "bu", order: 4, description: "Standard-Anzahl Stelzlager (PLA5282) bei Duschwanne" },
  { key: "BU_BADOLUX_DISCOUNT", value: 0.2, label: "Badolux Rabatt", unit: "%", type: "percent", section: "bu", order: 5, description: "Rabatt auf Badolux-Duschwannen (0.20 = 20 %). Wird auf den Listenpreis angewandt; verändert die DB nicht." },
  // ── BWT – BADEWANNENTÜR ──
  { key: "LABOR_RATE_BWT", value: 79.5, label: "Stundensatz BWT", unit: "€/h", type: "euro", section: "bwt", order: 1, description: "Stundensatz für Badewannentür-Montage" },
  { key: "BWT_KM_FREE_THRESHOLD", value: 200, label: "Freikilometer BWT", unit: "km", type: "integer", section: "bwt", order: 2, description: "Rundtrip-km-Schwelle – nur km darüber werden berechnet" },
  { key: "BWT_TRAVEL_TIME_FREE_HOURS", value: 2, label: "Freie Reisezeit BWT", unit: "h", type: "number", section: "bwt", order: 3, description: "Reisestunden die nicht berechnet werden (Freigrenze)" },
  { key: "BWT_WORKER_COUNT", value: 1, label: "Mitarbeiter BWT", unit: "Pers.", type: "integer", section: "bwt", order: 4, description: "Anzahl Monteure bei einem BWT-Einsatz" },
  { key: "BWT_LIEFERKOSTEN", value: 59.0, label: "Lieferkosten Badewannentür", unit: "€", type: "euro", section: "bwt", order: 5, description: "Lieferkosten je Badewannentür (Position 140322)" },
  // ── ZUSCHÜSSE & BONI ──
  { key: "SUBSIDY_AMOUNT_4180", value: 4180, label: "Wohnumfeld-Zuschuss (1 Person)", unit: "€", type: "euro", section: "zuschuss", order: 1, description: "KK-Zuschuss nach § 40 SGB XI – eine Person mit Pflegegrad" },
  { key: "SUBSIDY_AMOUNT_8360", value: 8360, label: "Wohnumfeld-Zuschuss (2 Personen)", unit: "€", type: "euro", section: "zuschuss", order: 2, description: "KK-Zuschuss – zwei Personen mit Pflegegrad" },
  { key: "BONUS_NEW_CUSTOMER_GROSS", value: 252.1, label: "Neukundenbonus (Brutto)", unit: "€", type: "euro", section: "zuschuss", order: 3, description: "Bruttowert des Neukundenbonus (Bonus 300 / Bestandkundenbonus)" },
];

const DEFAULTS = new Map<string, number>(CONFIG_SCHEMA.map((d) => [d.key, d.value]));

class ConfigService {
  private cache = new Map<string, number>(DEFAULTS);

  /** Load DB overrides into the cache. Call once at startup, after connectDb(). */
  async init(): Promise<void> {
    try {
      const docs = await AppConfig.find({}).lean();
      for (const doc of docs) {
        if (typeof doc.value === "number") this.cache.set(doc.key, doc.value);
        else if (doc.value != null && !Number.isNaN(Number(doc.value))) {
          this.cache.set(doc.key, Number(doc.value));
        }
      }
      // eslint-disable-next-line no-console
      console.log(`ConfigService: loaded ${docs.length} overrides from DB`);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("ConfigService: DB load failed, using defaults:", (err as Error).message);
    }
  }

  get(key: string, fallback?: number): number {
    if (this.cache.has(key)) return this.cache.get(key) as number;
    if (fallback !== undefined) return fallback;
    return DEFAULTS.get(key) ?? 0;
  }
}

export const config = new ConfigService();
export default config;
