import AppConfig from '../models/AppConfig.js';

// Single source of truth for all configurable business constants.
// Each entry defines the key, its hardcoded default, and metadata for the admin UI.
export const CONFIG_SCHEMA = [
  // ── ALLGEMEIN ────────────────────────────────────────────────────────────
  {
    key: 'TAX_RATE', value: 0.19,
    label: 'Mehrwertsteuersatz', unit: '%', type: 'percent', section: 'shared', order: 1,
    description: 'MwSt auf Nettobeträge (0.19 = 19 %)',
    note: 'Erfordert Serverneustart nach Änderung',
  },
  {
    key: 'LABOR_RATE_KK', value: 69.5,
    label: 'Stundensatz Kassenkunde', unit: '€/h', type: 'euro', section: 'shared', order: 2,
    description: 'Stundensatz für Kassenpatienten (KK)',
  },
  {
    key: 'LABOR_RATE_SZ', value: 59.5,
    label: 'Stundensatz Selbstzahler', unit: '€/h', type: 'euro', section: 'shared', order: 3,
    description: 'Stundensatz für Selbstzahler (SZ)',
  },
  {
    key: 'MAX_MATERIAL_DISCOUNT', value: 0.09,
    label: 'Max. Materialrabatt', unit: '%', type: 'percent', section: 'shared', order: 4,
    description: 'Maximaler Rabatt auf Materialkosten (0.09 = 9 %)',
  },
  {
    key: 'OFFER_VALIDITY_WEEKS', value: 8,
    label: 'Angebotsgültigkeit', unit: 'Wochen', type: 'integer', section: 'shared', order: 5,
    description: 'Gültigkeitsdauer eines Angebots ab Angebotsdatum',
  },
  {
    key: 'KK_PAYMENT_THRESHOLD', value: 2000,
    label: 'KK Zahlungsschwelle', unit: '€', type: 'euro', section: 'shared', order: 6,
    description: 'Betrag ab dem andere Zahlungsbedingungen für KK gelten',
  },

  // ── ARBEITSZEIT & FAHRT ──────────────────────────────────────────────────
  {
    key: 'KM_RATE', value: 0.35,
    label: 'Kilometerpauschale', unit: '€/km', type: 'euro', section: 'fahrt', order: 1,
    description: 'Kosten pro Kilometer (Hin- und Rückfahrt)',
  },
  {
    key: 'FAHRZEUGBEREITSTELLUNG', value: 80.0,
    label: 'Fahrzeugbereitstellung', unit: '€/Tag', type: 'euro', section: 'fahrt', order: 2,
    description: 'Tagesrate für Fahrzeugbereitstellung',
  },
  {
    key: 'WERKZEUG', value: 7.5,
    label: 'Maschinen & Werkzeuge', unit: '€/Tag', type: 'euro', section: 'fahrt', order: 3,
    description: 'Tagesrate: Bereitstellung und Vorhaltung Maschinen & Werkzeuge',
  },
  {
    key: 'BERAEUMUNG', value: 4.5,
    label: 'Beräumung der Baustelle', unit: '€/Tag', type: 'euro', section: 'fahrt', order: 4,
    description: 'Tagesrate: Beräumung der Baustelle',
  },

  // ── BU – BADUMBAU ────────────────────────────────────────────────────────
  {
    key: 'BU_FLOOR_PANEL_SIZE_M2', value: 0.3,
    label: 'Bodenpaneel Fläche', unit: 'm²', type: 'number', section: 'bu', order: 1,
    description: 'Fläche eines einzelnen Bodenpaneels (V5FB02)',
  },
  {
    key: 'BU_FLOOR_WASTE_FACTOR', value: 1.15,
    label: 'Verschnittfaktor Boden', unit: '', type: 'number', section: 'bu', order: 2,
    description: 'Aufschlag für Verschnitt bei Bodenpaneelen (1.15 = +15 %)',
  },
  {
    key: 'BU_FLOOR_ADHESIVE_COVERAGE', value: 0.6,
    label: 'Kleber Abdeckung', unit: 'm²/Pack', type: 'number', section: 'bu', order: 3,
    description: 'Fläche die ein Kleberpack (R_4260602) abdeckt',
  },
  {
    key: 'BU_STELZLAGER_DEFAULT_QTY', value: 8,
    label: 'Stelzlager Standardmenge', unit: 'Stk', type: 'integer', section: 'bu', order: 4,
    description: 'Standard-Anzahl Stelzlager (PLA5282) bei Duschwanne',
  },
  {
    key: 'BU_BADOLUX_DISCOUNT', value: 0.20,
    label: 'Badolux Rabatt', unit: '%', type: 'percent', section: 'bu', order: 5,
    description: 'Rabatt auf Badolux-Duschwannen (0.20 = 20 %). Wird auf den Listenpreis angewandt; verändert die DB nicht.',
  },
  // ── BWT – BADEWANNENTÜR ──────────────────────────────────────────────────
  {
    key: 'LABOR_RATE_BWT', value: 79.5,
    label: 'Stundensatz BWT', unit: '€/h', type: 'euro', section: 'bwt', order: 1,
    description: 'Stundensatz für Badewannentür-Montage',
  },
  {
    key: 'BWT_KM_FREE_THRESHOLD', value: 0,
    label: 'Freikilometer BWT', unit: 'km', type: 'integer', section: 'bwt', order: 2,
    description: 'Rundtrip-km-Schwelle – nur km darüber werden berechnet',
  },
  {
    key: 'BWT_TRAVEL_TIME_FREE_HOURS', value: 0,
    label: 'Freie Reisezeit BWT', unit: 'h', type: 'number', section: 'bwt', order: 3,
    description: 'Reisestunden die nicht berechnet werden (Freigrenze)',
  },
  {
    key: 'BWT_WORKER_COUNT', value: 1,
    label: 'Mitarbeiter BWT', unit: 'Pers.', type: 'integer', section: 'bwt', order: 4,
    description: 'Anzahl Monteure bei einem BWT-Einsatz',
  },
  {
    key: 'BWT_LIEFERKOSTEN', value: 59.0,
    label: 'Lieferkosten Badewannentür', unit: '€', type: 'euro', section: 'bwt', order: 5,
    description: 'Lieferkosten je Badewannentür (Position 140322)',
  },

  // ── HL – HANDLÄUFE ───────────────────────────────────────────────────────
  {
    key: 'HL_LIEFERKOSTEN', value: 95.0,
    label: 'Lieferkosten Handläufe', unit: '€', type: 'euro', section: 'hl', order: 1,
    description: 'Pauschale Speditionskosten für lange Rohre je Handläufe-Angebot',
  },

  // ── AH – ALLTAGSHILFE ────────────────────────────────────────────────────
  {
    key: 'ENTLASTUNGSBETRAG_MONAT', value: 131,
    label: 'Entlastungsbetrag § 45b SGB XI', unit: '€/Monat', type: 'euro', section: 'ah', order: 1,
    description: 'Monatlicher Entlastungsbetrag ab Pflegegrad 1, den die Pflegekasse für zweckgebundene Angebote übernimmt',
  },
  {
    key: 'VERHINDERUNGSPFLEGE_JAHR', value: 2418,
    label: 'Verhinderungspflege § 39 SGB XI', unit: '€/Jahr', type: 'euro', section: 'ah', order: 2,
    description: 'Jahresbudget ab Pflegegrad 2 (1.612 € + 806 € aus Kurzzeitpflege), das anteilig auf den Eigenanteil angerechnet werden kann',
  },
  {
    key: 'PFLEGESACHLEISTUNG_UMWIDMUNG_MAX_PCT', value: 40,
    label: 'Pflegesachleistungen-Umwidmung § 45a Abs. 4', unit: '%', type: 'integer', section: 'ah', order: 3,
    description: 'Maximaler Anteil ungenutzter Pflegesachleistungen, der dauerhaft in den Entlastungsbetrag umgewidmet werden kann',
  },
  {
    key: 'STEUERABSETZ_PCT', value: 20,
    label: 'Steuerliche Absetzbarkeit § 35a EStG', unit: '%', type: 'integer', section: 'ah', order: 4,
    description: 'Anteil der selbst getragenen Kosten, den der Kunde über die Steuererklärung absetzen kann (informativ, keine Auswirkung auf die Rechnung)',
  },
  {
    key: 'STEUERABSETZ_CAP_JAHR', value: 4000,
    label: 'Steuerabsetzbarkeit Deckel', unit: '€/Jahr', type: 'euro', section: 'ah', order: 5,
    description: 'Maximale jährliche Steuerermäßigung nach § 35a EStG',
  },

  // ── ZUSCHÜSSE & BONI ─────────────────────────────────────────────────────
  {
    key: 'SUBSIDY_AMOUNT_4180', value: 4180,
    label: 'Wohnumfeld-Zuschuss (1 Person)', unit: '€', type: 'euro', section: 'zuschuss', order: 1,
    description: 'KK-Zuschuss nach § 40 SGB XI – eine Person mit Pflegegrad',
  },
  {
    key: 'SUBSIDY_AMOUNT_8360', value: 8360,
    label: 'Wohnumfeld-Zuschuss (2 Personen)', unit: '€', type: 'euro', section: 'zuschuss', order: 2,
    description: 'KK-Zuschuss – zwei Personen mit Pflegegrad',
  },
  {
    key: 'BONUS_NEW_CUSTOMER_GROSS', value: 252.1,
    label: 'Neukundenbonus (Brutto)', unit: '€', type: 'euro', section: 'zuschuss', order: 3,
    description: 'Bruttowert des Neukundenbonus (Bonus 300 / Bestandkundenbonus)',
  },

  // ── PREISBERECHNUNG ──────────────────────────────────────────────────────
  {
    key: 'AUTO_RECOMPUTE_PRICING', value: true,
    label: 'Automatische Preisneuberechnung', type: 'boolean', section: 'shared', order: 7,
    description: 'Bei geänderten Angeboten automatisch neu berechnen (inkl. Vigor-Live-Preis). Deaktiviert: der zuletzt gespeicherte Preis bleibt bis zur manuellen Neuberechnung bestehen.',
  },
];

const DEFAULTS_MAP = new Map(CONFIG_SCHEMA.map(d => [d.key, d.value]));

class ConfigService {
  constructor() {
    this._cache = new Map(DEFAULTS_MAP);
  }

  async init() {
    try {
      const docs = await AppConfig.find({}).lean();
      for (const doc of docs) {
        this._cache.set(doc.key, doc.value);
      }
      console.log(`ConfigService: loaded ${docs.length} overrides from DB`);
    } catch (err) {
      console.warn('ConfigService: DB load failed, using defaults:', err.message);
    }
  }

  async seed() {
    for (const item of CONFIG_SCHEMA) {
      await AppConfig.findOneAndUpdate(
        { key: item.key },
        { $setOnInsert: { key: item.key, value: item.value } },
        { upsert: true, new: false },
      );
    }
    console.log('ConfigService: seeded defaults');
  }

  get(key, fallback) {
    if (this._cache.has(key)) return this._cache.get(key);
    return fallback !== undefined ? fallback : DEFAULTS_MAP.get(key);
  }

  async set(key, value) {
    await AppConfig.findOneAndUpdate({ key }, { $set: { value } }, { upsert: true });
    this._cache.set(key, value);
  }

  async setMany(updates) {
    for (const [key, value] of Object.entries(updates)) {
      const def = CONFIG_SCHEMA.find(d => d.key === key);
      await this.set(key, def?.type === 'boolean' ? Boolean(value) : Number(value));
    }
  }
}

export default new ConfigService();
