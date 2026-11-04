// Business configuration schema — mechanical copy of src/services/configService.js CONFIG_SCHEMA
// (main@4b6002a). Parity enforced by test/business-config.test.ts against the legacy file.
/* eslint-disable */
export interface ConfigDef { key: string; value: any; label?: any; unit?: any; type?: string; section?: string; order?: number; description?: any; note?: any; [k: string]: any }
export const CONFIG_SCHEMA: ConfigDef[] = [
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
    key: 'LABOR_RATE_SZ', value: 69.5,
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
  // Neukundenbonus: new offers snapshot both values into payload.pricingRules
  // (bonusNeuGross / bonusNeuThreshold). Offers without that snapshot keep the
  // old rule (252,10 € netto = 300 € brutto, ab 3.000 €) — see pricing-core.js.
  {
    key: 'NEUKUNDENBONUS_BRUTTO', value: 250,
    label: 'Neukundenbonus (Brutto)', unit: '€', type: 'euro', section: 'zuschuss', order: 3,
    description: 'Bruttowert des Neukundenbonus. Gilt für neue Angebote — gespeicherte Angebote/Entwürfe behalten ihren Wert.',
  },
  {
    key: 'NEUKUNDENBONUS_SCHWELLE', value: 5000,
    label: 'Neukundenbonus ab Auftragswert', unit: '€', type: 'euro', section: 'zuschuss', order: 3.5,
    description: 'Neukundenbonus nur wählbar, wenn der Gesamtwert (brutto, nach Rabatt) diesen Betrag übersteigt. Gilt für neue Angebote.',
  },
  {
    key: 'GRAB_BONUS_MATERIAL_NET', value: 100,
    label: 'Aktion Haltegriff – Material (Netto)', unit: '€', type: 'euro', section: 'zuschuss', order: 4,
    description: 'Materialwert des Gratis-Haltegriffs (30 cm) im Angebot; wird in der Aktionszeile wieder abgezogen',
  },
  {
    key: 'GRAB_BONUS_LABOR_NET', value: 47.06,
    label: 'Aktion Haltegriff – Arbeit (Netto)', unit: '€', type: 'euro', section: 'zuschuss', order: 5,
    description: 'Montagewert des Gratis-Haltegriffs im Angebot (Material + Arbeit = 147,06 € netto = 175 € brutto)',
  },
  {
    key: 'GRAB_BONUS_IDS', value: ['CLPESG30'],
    label: 'Aktion Haltegriff – berechtigte Artikel', type: 'text-list', section: 'zuschuss', order: 6,
    description: 'Artikelnummern (eine pro Zeile), für die "Haltegriff gratis" im Rabatt-Tab angeboten wird. Bei mehreren im Angebot ist der zuerst gelistete gratis. Gilt für neue Angebote — gespeicherte Angebote/Entwürfe behalten ihre Liste.',
  },

  // ── WV EIGENES LAGER ─────────────────────────────────────────────────────
  {
    key: 'WV_OWN_LAGER', value: {},
    label: 'Eigenes WV-Lager', type: 'json', section: 'bu', order: 6,
    description: 'WV-Artikel im eigenen Lager. Format: {"V3WVK09": 5, "V3WV01": 2}',
  },

  // ── PRODUKTBILDER-PDF ────────────────────────────────────────────────────
  {
    key: 'PRODUCT_IMAGE_SKIP_IDS',
    value: [],
    label: 'Produktbilder: Ausgeschlossene Artikelnummern',
    type: 'text-list',
    section: 'shared',
    order: 8,
    description: 'Artikelnummern (eine pro Zeile), die nie im Produktbilder-PDF auftauchen',
  },

  // ── ARBEITSZEITEN JE TÄTIGKEIT ───────────────────────────────────────────
  // Minutes behind the "Automatischer Arbeitszeit-Vorschlag" (BU). Key suffix =
  // work-task value / suggestion key in script.js. New offers snapshot the
  // whole map (payload.pricingRules.azMinutes); saved offers keep theirs.
  ...[
    ['remove_tub', 'Badewanne entfernen', 45],
    ['install_bathtub', 'Badewanne einbauen', 90],
    ['install_bathtub_screen', 'Wannenaufsatz montieren', 60],
    ['remove_showertub', 'Duschwanne entfernen', 30],
    ['install_tray', 'Duschwanne einbauen', 75],
    ['install_sitzbath', 'Sitzbadewanne einbauen', 120],
    ['remove_shower_curtain', 'Duschvorhang entfernen', 15],
    ['remove_enclosure', 'Duschabtrennung entfernen', 25],
    ['install_shower_curtain', 'Duschvorhang montieren', 15],
    ['install_enclosure', 'Duschabtrennung montieren', 60],
    ['install_distance_profile', 'Abstandsprofil montieren', 20],
    ['trockenbau_duschbereich', 'Trockenbau im Duschbereich', 0],
    ['close_valve', 'Armatur stilllegen', 45],
    ['relocate_faucet', 'Armatur versetzen', 90],
    ['relocate_drain', 'Abfluss verlegen', 30],
    ['convert_faucet', 'Armatur umbauen', 90],
    ['replace_thermostat', 'Thermostat auswechseln', 30],
    ['replace_shower_no_thermo', 'Duschsystem auswechseln', 30],
    ['replace_shower_with_thermo', 'Duschsystem + Thermostat auswechseln', 45],
    ['install_shower_basket', 'Duschkorb montieren', 15],
    ['remove_sink', 'Waschbecken entfernen', 30],
    ['install_sink', 'Waschbecken einbauen', 45],
    ['replace_sink_faucet', 'Waschbecken-Armatur auswechseln', 30],
    ['remove_furniture', 'Bademöbel entfernen', 20],
    ['install_furniture', 'Bademöbel einbauen', 30],
    ['remove_toilet', 'Toilette entfernen', 50],
    ['install_toilet', 'Toilette montieren', 20],
    ['install_shower_wc', 'Dusch-WC einbauen', 60],
    ['trockenbau_wc', 'Trockenbau für das WC', 0],
    ['wv997', 'Wandverkleidung 997×2550 (je Platte)', 30],
    ['wv1497', 'Wandverkleidung 1497×2550 (je Platte)', 40],
    ['silikon', 'Silikon', 10],
    ['flooring_m2', 'Fußboden individuell (je m²)', 8],
    ['flooring_flat', 'Fußboden individuell (ohne Fläche, pauschal)', 25],
    ['grab', 'Haltegriff (je Stück)', 30],
  ].map(([task, label, value], i) => ({
    key: `AZ_MIN_${task}`, value,
    label, unit: 'min', type: 'integer', section: 'arbeitszeiten', order: i + 1,
    description: value === 0
      ? 'Zeit fehlt – mit Handwerk abstimmen. Gilt für neue Angebote.'
      : 'Gilt für neue Angebote — gespeicherte Angebote/Entwürfe behalten ihren Wert.',
  })),

  // ── PREISBERECHNUNG ──────────────────────────────────────────────────────
  {
    key: 'AUTO_RECOMPUTE_PRICING', value: true,
    label: 'Automatische Preisneuberechnung', type: 'boolean', section: 'shared', order: 7,
    description: 'Bei geänderten Angeboten automatisch neu berechnen (inkl. Vigor-Live-Preis). Deaktiviert: der zuletzt gespeicherte Preis bleibt bis zur manuellen Neuberechnung bestehen.',
  },
];


const DEFAULTS = new Map(CONFIG_SCHEMA.map((d) => [d.key, d.value]));

/** Admin-tunable values: schema defaults overridden by `appconfigs` documents (legacy ConfigService). */
export class BusinessConfig {
  private cache = new Map<string, unknown>(DEFAULTS);
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly loadOverrides: () => Promise<Array<{ key: string; value: unknown }>>) {}

  /** Load overrides; refresh every 60 s (legacy behaviour, so multi-instance edits propagate). */
  async init(log: { warn: (o: object, m: string) => void }) {
    await this.refresh(log);
    if (!this.timer) {
      this.timer = setInterval(() => void this.refresh(log), 60_000);
      this.timer.unref();
    }
  }

  async refresh(log?: { warn: (o: object, m: string) => void }) {
    try {
      for (const d of await this.loadOverrides()) this.cache.set(d.key, d.value);
    } catch (err) {
      log?.warn({ err }, "business config refresh failed — keeping cached values");
    }
  }

  get(key: string, fallback?: unknown): any {
    if (this.cache.has(key)) return this.cache.get(key);
    return fallback !== undefined ? fallback : DEFAULTS.get(key);
  }

  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }
}
