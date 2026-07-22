// The AH · Alltagshilfe offer payload. Self-contained (BU has its own payload.ts).
// AH prices client-side, so this shape is web-only and the API stores it opaquely
// as a draft. Field names for the AH-specific sections mirror the legacy wizard
// (prep_*, ah_*) so a later document/send port maps cleanly.
import type { Payer } from "../payload";

export type { Payer };

export interface AhKundendaten {
  // Contact
  salutation: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  // Address + abweichender Einsatzort
  street: string;
  city: string;
  postalCode: string;
  deployment: string; // abweichender Einsatzort
  // IDs / linkage
  customerNumber: string;
  bitrixContactId: string;
  dealId: string;
  emc2_contact: string; // Ansprechpartner EmC²
  // Classification + optional (customer-side) contact person
  customerType: string; // "" | "neu" | "bestand"
  hasContactPerson: boolean;
  contactPersonName: string;
  contactPersonPhone: string;
  // Billing — payer drives pricing (Kassenkunde subtracts the Entlastungsbetrag)
  payer: Payer;
  krankenkasse: string;
  pflegegrad: string; // "" | "1".."5" | "beantragt"
  // Objekt / Parken
  parkenMoeglich: string; // "" | "ja" | "nein"
  parkDetails: string;
  notes: string;

  // AH-only: Vorbereitung vor dem Termin (Checkliste)
  prep_terminBestaetigt: boolean;
  prep_erstberatungsbogen: boolean;
  prep_visitenkarten: boolean;
  prep_leistungsuebersicht: boolean;
  prep_mustervertrag: boolean;

  // AH-only: Besondere Hinweise
  ah_mobilitaet: string;
  ah_allergien: string;
  ah_demenz: string;
  ah_sprache: string;
  ah_sonstiges: string;

  // AH-only: Lebenssituation
  ah_alleinLebend: string; // "" | "ja" | "nein"
  ah_haustiere: string; // "" | "ja" | "nein"
  ah_schluessel: string; // "" | "ja" | "nein" | "klaeren"
  ah_bestehendeHilfe: string; // "" | "pflegedienst" | "angehoerige" | "nachbarn" | "keine"
}

export type AhServiceType = "Haushaltsnahedienstleistungen" | "Alltagsbegleitung";

export interface AhSchedule {
  dauer: string; // "H:MM"
  regelmaessigkeit: string; // one of REGELMAESSIGKEIT ("" = unset)
}
export interface AhService {
  type: AhServiceType;
  schedules: AhSchedule[];
  tasks: string[]; // task ids
}

export interface Ah {
  services: AhService[];
  note: string;
  entlastungAuto: boolean; // auto-fit HnD Dauer to the monthly Entlastungsbetrag
  travelMinutes: string; // one-way travel time (min) → Reisezone
}

export interface AhPayload {
  activeOffer: "ah";
  offerType: "ah";
  offerNumber?: string;
  Kundendaten: AhKundendaten;
  ah: Ah;
  // Later phases add: Arbeitszeit (Reisezone), pricing.
  [key: string]: any;
}

export const AH_SALUTATIONS = ["Herr", "Frau", "Familie", "Divers"];
// AH adds "beantragt" (Pflegegrad beantragt) on top of the numeric grades.
export const AH_PFLEGEGRADE = ["1", "2", "3", "4", "5", "beantragt"];

export function defaultAhKundendaten(): AhKundendaten {
  return {
    salutation: "",
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    street: "",
    city: "",
    postalCode: "",
    deployment: "",
    customerNumber: "",
    bitrixContactId: "",
    dealId: "",
    emc2_contact: "",
    customerType: "",
    hasContactPerson: false,
    contactPersonName: "",
    contactPersonPhone: "",
    payer: "",
    krankenkasse: "",
    pflegegrad: "",
    parkenMoeglich: "",
    parkDetails: "",
    notes: "",
    prep_terminBestaetigt: false,
    prep_erstberatungsbogen: false,
    prep_visitenkarten: false,
    prep_leistungsuebersicht: false,
    prep_mustervertrag: false,
    ah_mobilitaet: "",
    ah_allergien: "",
    ah_demenz: "",
    ah_sprache: "",
    ah_sonstiges: "",
    ah_alleinLebend: "",
    ah_haustiere: "",
    ah_schluessel: "",
    ah_bestehendeHilfe: "",
  };
}

export function defaultAhPayload(): AhPayload {
  return {
    activeOffer: "ah",
    offerType: "ah",
    Kundendaten: defaultAhKundendaten(),
    ah: { services: [], note: "", entlastungAuto: false, travelMinutes: "" },
  };
}
