// The BU offer payload — the exact shape the pricing engine (and later the
// document generator) consumes. Values are mostly strings, matching the legacy
// wizard state. The container is intentionally open ([key: string]: any) since
// later steps add more sections.

export type Payer = "" | "Kassenkunde" | "Selbstzahler";

export interface Wohnumfeld {
  amount: string;
  done: boolean;
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
  payer: Payer;
  aufschlag: string; // e.g. "35%"
  // Kassenkunde-only conditional fields
  pflegegrad: string;
  budgetOption: string; // subsidy option (see SUBSIDY_OPTIONS)
  zuzahlung: string;
  wohnumfeld: Wohnumfeld;
}

export interface Arbeitszeit {
  workDays: string;
  travelDays: string;
  distanceKm: string; // one-way km
  ArbeitHoursNumeric: string;
  ReiseHoursNumeric: string;
  totalHoursNumeric: string;
  totalHoursHHMM: string;
  travelSecondWorkerRate: number; // 25 | 35
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
      payer: "",
      aufschlag: "35%",
      pflegegrad: "",
      budgetOption: "",
      zuzahlung: "",
      wohnumfeld: { amount: "", done: false },
    },
    Arbeitszeit: {
      workDays: "",
      travelDays: "",
      distanceKm: "",
      ArbeitHoursNumeric: "",
      ReiseHoursNumeric: "",
      totalHoursNumeric: "",
      totalHoursHHMM: "",
      travelSecondWorkerRate: 25,
    },
    duschwanne: {},
    wandverkleidung: {},
    optional: {},
    rabatt: {},
  };
}
