// The BU offer payload — the exact shape the pricing engine (and later the
// document generator) consumes. Values are mostly strings, matching the legacy
// wizard state. The container is intentionally open ([key: string]: any) since
// later steps add more sections.

export type Payer = "" | "Kassenkunde" | "Selbstzahler";

export interface WohnumfeldEntry {
  purpose: string; // "wofür"
  amount: string; // "Betrag (€)"
}
export interface Wohnumfeld {
  amount: string; // total (sum of entries) — pricing reads this
  done: boolean; // kept in sync with status === "ja" (pricing reads this)
  status: string; // "" | "ja" | "nein" | "unbekannt"
  entries: WohnumfeldEntry[]; // one or more Wofür/Betrag rows (when status === "ja")
}

export interface Partner {
  salutation: string;
  firstName: string;
  lastName: string;
  krankenkasse: string;
  pflegegrad: string;
}

export interface Kundendaten {
  salutation: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  street: string;
  city: string;
  postalCode: string;
  customerNumber: string;
  bitrixContactId: string;
  dealId: string;
  emc2_contact: string;
  // Classification + optional (customer-side) contact person
  customerType: string; // "" | "neu" | "bestand"
  hasContactPerson: boolean;
  contactPersonName: string;
  contactPersonPhone: string;
  // Objekt- & Förderinformationen
  pflegekasseAntrag: string; // "" | "ja" | "nein" — Antrag auf Zuschuss gestellt?
  pflegekasseGenehmigung: string; // if Antrag "ja": "" | "ja" | "nein"
  pflegekasseEmc2Antrag: string; // if Antrag "nein": darf EmC² den Antrag stellen? "" | "ja" | "nein"
  vermieterGenehmigung: string; // "" | "ja" | "nein" | "ausstehend"
  wohnsituation: string; // "" | "Eigentum" | "Miete"
  parkenMoeglich: string; // "" | "ja" | "nein"
  parkDetails: string;
  notes: string;
  payer: Payer;
  aufschlag: string; // e.g. "35%"
  // Kassenkunde-only conditional fields
  pflegegrad: string;
  krankenkasse: string;
  budgetOption: string; // subsidy option (see SUBSIDY_OPTIONS)
  budgetOptionManuallySet: boolean; // once true, auto-derivation from `partner` stops overwriting it
  zuzahlung: string;
  wohnumfeld: Wohnumfeld;
  // second person sharing the Pflegegrad budget, e.g. Ehepartner — added on demand mid-consultation
  partner?: Partner;
}

export interface Arbeitszeit {
  // inputs
  distanceKm: string; // one-way km
  distanceLocked: boolean; // freeze the distance so it is not auto-recomputed
  travelTimeHHMM: string; // one-way travel time "H:MM"
  laborHoursHHMM: string; // work hours "H:MM"
  uebernachten: string; // overnights
  travelSecondWorkerRate: number; // 25 | 35
  // derived (feed the pricing engine)
  workDays: number;
  travelDays: number;
  ArbeitHoursNumeric: number;
  ReiseHoursNumeric: number;
  totalHoursNumeric: number;
  totalHoursHHMM: string;
}

export interface OfferPayload {
  activeOffer: "bu";
  offerType: "bu";
  offerNumber?: string;
  Kundendaten: Kundendaten;
  Arbeitszeit: Arbeitszeit;
  duschwanne: Record<string, any>;
  wandverkleidung: Record<string, any>;
  optional: Record<string, any>;
  rabatt: Record<string, any>;
  duschabtrennung: Record<string, any>;
  [key: string]: any;
}

/** Subsidy options for a Kassenkunde. Values must match the pricing engine's switch. */
export const SUBSIDY_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Kein Zuschuss" },
  { value: "4180 MAXIMAL", label: "4180 € – Maximal" },
  { value: "4180 MIT ZUZAHLUNG", label: "4180 € – mit Zuzahlung" },
  { value: "ZWEI PERSONEN MIT PFLEGEGRAD", label: "8360 € – Zwei Personen mit Pflegegrad" },
];

export const SALUTATIONS = ["Herr", "Frau", "Familie", "Divers"];
export const PFLEGEGRADE = ["", "1", "2", "3", "4", "5"];

export function emptyPartner(): Partner {
  return { salutation: "", firstName: "", lastName: "", krankenkasse: "", pflegegrad: "" };
}

/** Default salutation for a newly added partner — opposite of the main contact where that's meaningful. */
export function oppositeSalutation(s: string): string {
  if (s === "Herr") return "Frau";
  if (s === "Frau") return "Herr";
  return "";
}

/** Default subsidy tier derived from partner presence — overridden once the user picks manually. */
export function deriveBudgetOption(k: Kundendaten): string {
  return k.partner ? "ZWEI PERSONEN MIT PFLEGEGRAD" : "4180 MAXIMAL";
}

export function defaultPayload(): OfferPayload {
  return {
    activeOffer: "bu",
    offerType: "bu",
    Kundendaten: {
      salutation: "",
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      street: "",
      city: "",
      postalCode: "",
      customerNumber: "",
      bitrixContactId: "",
      dealId: "",
      emc2_contact: "",
      customerType: "",
      hasContactPerson: false,
      contactPersonName: "",
      contactPersonPhone: "",
      pflegekasseAntrag: "",
      pflegekasseGenehmigung: "",
      pflegekasseEmc2Antrag: "",
      vermieterGenehmigung: "",
      wohnsituation: "",
      parkenMoeglich: "",
      parkDetails: "",
      notes: "",
      payer: "",
      aufschlag: "35%",
      pflegegrad: "",
      krankenkasse: "",
      budgetOption: "",
      budgetOptionManuallySet: false,
      zuzahlung: "",
      wohnumfeld: { amount: "", done: false, status: "", entries: [] },
    },
    Arbeitszeit: {
      distanceKm: "",
      distanceLocked: false,
      travelTimeHHMM: "",
      // BU defaults to 7 h Arbeitszeit; derived values match (no travel yet) so
      // pricing sees 7 h without needing to open the Arbeitszeit step.
      laborHoursHHMM: "7:00",
      uebernachten: "",
      travelSecondWorkerRate: 25,
      workDays: 1,
      travelDays: 1,
      ArbeitHoursNumeric: 7,
      ReiseHoursNumeric: 0,
      totalHoursNumeric: 7,
      totalHoursHHMM: "7:00",
    },
    wandverkleidung: {
      wvKind: "Fliesenspiegel",
      wvQty997: "",
      wvQty1497: "",
      panelConfigs: { "997x2550": { color: "" }, "1497x2550": { color: "" } },
      wvSonderConfigNr: "",
      wvSealing: false,
      flechenkleber: false,
      wvFlachenQty: "",
      wvEndProfile: false,
      wvEndProfileQty: "",
      wvV3VQty: "",
      wvCornersCount: "",
      wvSilikon: false,
      wvSilikonQty: "",
    },
    duschwanne: {
      // tray search + selection
      tray_w_cm: "",
      tray_l_cm: "",
      chosenTrayProductId: "",
      traySize: "",
      trayColor: "",
      selectedTrayInfo: null,
      // user-entered fallback tray (name + qty + price)
      customTray: { name: "", qty: "1", price: "" },
      // accessories — a fresh offer starts at 0 €; these auto-tick on the first
      // visit to the Duschwanne step (see defaultsApplied), then the user owns them.
      abdichtSet: false,
      drainSet: false,
      smallMaterial: false,
      stelzlager: false,
      stelzlagerQty: "8",
      defaultsApplied: false,
      // toggles
      budgetMode: false,
      ebenerdigeMontage: true,
      // Fußboden (own step; stored here to match the engine)
      addFlooring: false,
      floorArea: "",
      floorKind: "",
      flooringProduct: [] as string[],
      floorSealing: false,
      // set on the Arbeiten page
      workTasks: [],
      extraTasks: [],
    },
    optional: {},
    rabatt: {},
    duschabtrennung: { cards: [], quickAdd: [] },
  };
}
