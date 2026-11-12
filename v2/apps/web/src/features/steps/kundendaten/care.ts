// Care level (Pflegegrad) and budget options — the rules of today's UI, recorded for all offer
// types (test/fixtures/kundendaten-care.json, v2/scripts/capture-kundendaten.cjs).
// Each function returns the fields of `Kundendaten` that change (`undefined` = remove the field:
// today's UI stores a tick only while it is set).
//
// Reproduced on purpose, because today's UI stores it this way:
//  - "Premium" stays ticked when the care level is switched to "Nein" (the other options are cleared)
//  - when another option replaces "2 Personen", the (empty) fields of the second person stay stored
type Fields = Record<string, unknown>;

export const MAIN_OPTIONS = {
  budgetMax: { value: "4180 MAXIMAL", label: "4.180 € MAXIMAL" },
  twoPersons: { value: "Zwei Personen mit Pflegegrad", label: "2 Personen mit Pflegegrad (+ 4.180 €)" },
  premium: { value: "Premium", label: "Premium" },
} as const;
export type MainOption = keyof typeof MAIN_OPTIONS;
const MAINS = Object.keys(MAIN_OPTIONS) as MainOption[];
const COPAY_VALUE = "4180 mit Zuzahlung";
/** the second person's fields, stored (empty) as soon as "2 Personen" is ticked */
export const PARTNER_FIELDS = ["partnerFirstName", "partnerLastName", "partnerGeburtsdatum", "partnerKassenkundeName", "partnerKrankenkasseAdresse", "partnerKvnr", "partnerPflegegradSeit"] as const;

/** `budgetOptionsPanel`: the ticked main option in capitals, as today's UI derives it */
export const budgetPanelOf = (kd: Fields): string => {
  const main = MAINS.find((m) => !!kd[m]);
  return main ? MAIN_OPTIONS[main].value.toUpperCase() : "";
};

// ---- name and greeting for two persons (today: Zusammenfassung fields, filled automatically) ----
const nameFrag = (sal: unknown, name: string) => [sal, name].filter(Boolean).join(" ").trim();
const greetFrag = (sal: unknown, last: unknown) => {
  const l = String(last ?? "").trim();
  if (sal === "Frau") return `sehr geehrte Frau ${l}`.trim();
  if (sal === "Herr") return `sehr geehrter Herr ${l}`.trim();
  if (sal === "Familie") return `sehr geehrte Familie ${l}`.trim();
  return "sehr geehrte Damen und Herren";
};
const str = (v: unknown) => String(v ?? "").trim();
export function twoPersonsTexts(kd: Fields): { kundenName: string; greetingLine: string } {
  const cust = [str(kd.firstName), str(kd.lastName)].filter(Boolean).join(" ");
  const partner = [str(kd.partnerFirstName), str(kd.partnerLastName)].filter(Boolean).join(" ");
  const two = `${greetFrag(kd.salutation, kd.lastName)}, ${greetFrag(kd.partnerSalutation, kd.partnerLastName)}`;
  return {
    kundenName: `${nameFrag(kd.salutation, cust)} und ${nameFrag(kd.partnerSalutation, partner)}`.trim(),
    greetingLine: two.charAt(0).toUpperCase() + two.slice(1),
  };
}

// ---- the choices ----
export function chooseHasCareLevel(kd: Fields, answer: "Ja" | "Nein"): Fields {
  if (answer === "Ja") return { hasPflegegrad: "Ja" };
  // no care level: the level and the budget options go — except "Premium" (as today)
  const after = { ...kd, budgetMax: undefined, twoPersons: undefined };
  return {
    hasPflegegrad: "Nein", pflegegrad: undefined, budgetMax: undefined, twoPersons: undefined, budgetCopay: undefined, copayAmount: 0,
    budgetOptionsPanel: budgetPanelOf(after), ...(kd.twoPersons ? { kundenName: "", greetingLine: "" } : {}),
  };
}

/** the second person's entries that go when "2 Personen" is unticked by hand (the Anrede stays, as today) */
export const PARTNER_ENTRIES = [...PARTNER_FIELDS, "partnerPflegegrad"] as const;

/** Tick or untick one of the three main options; only one of them can be set.
 *  `rememberedPartner`: the second person's entries from before "2 Personen" was unticked — they
 *  come back when it is ticked again (as today). */
export function toggleMainOption(kd: Fields, option: MainOption, on: boolean, rememberedPartner: Fields = {}): Fields {
  const out: Fields = {};
  for (const m of MAINS) out[m] = m === option && on ? MAIN_OPTIONS[m].value : m === option ? undefined : on ? undefined : kd[m];
  const after = { ...kd, ...out };
  out.budgetOptionsPanel = budgetPanelOf(after);
  if (!MAINS.some((m) => !!after[m])) { out.budgetCopay = undefined; out.copayAmount = 0; } // co-payment needs a main option
  if (option === "twoPersons") {
    if (on) {
      for (const f of PARTNER_FIELDS) if (!(f in kd)) out[f] = "";
      Object.assign(out, rememberedPartner);
      Object.assign(out, twoPersonsTexts({ ...kd, ...out }));
    } else {
      for (const f of PARTNER_ENTRIES) out[f] = undefined; // unticked by the user: the second person is no longer stored
      Object.assign(out, { kundenName: "", greetingLine: "" });
    }
  } else if (on && kd.twoPersons) {
    Object.assign(out, { kundenName: "", greetingLine: "" }); // replaced by another option: only name and greeting go (as today)
  }
  return out;
}

export function toggleCopay(kd: Fields, on: boolean): Fields {
  if (on && !MAINS.some((m) => !!kd[m])) return {};
  return on ? { budgetCopay: COPAY_VALUE } : { budgetCopay: undefined, copayAmount: 0 };
}

/** "1.250,50" / "1250" → number; anything else → 0 (today's parseEuroToNumber) */
export function parseEuro(v: unknown): number {
  const n = parseFloat(String(v ?? "").trim().replace(/[^\d.,-]/g, "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

/** The "Anrechenbares Budget" readout: display only, never stored. */
export function budgetReadout(kd: Fields): string {
  const total = kd.twoPersons ? 8360 : kd.budgetMax ? 4180 : 0;
  const copay = Number(kd.copayAmount) || 0;
  const fmt = (n: number) => `${n.toLocaleString("de-DE")} €`;
  return copay ? `${fmt(total)} + Zuzahlung ${fmt(copay)}` : fmt(total);
}

/** While two persons are chosen and name/greeting are still the automatic ones, they follow the names. */
export function followNames(before: Fields, after: Fields): Fields {
  if (!after.twoPersons) return {};
  const was = twoPersonsTexts(before), now = twoPersonsTexts(after);
  const out: Fields = {};
  if (after.kundenName === was.kundenName && now.kundenName !== was.kundenName) out.kundenName = now.kundenName;
  if (after.greetingLine === was.greetingLine && now.greetingLine !== was.greetingLine) out.greetingLine = now.greetingLine;
  return out;
}
