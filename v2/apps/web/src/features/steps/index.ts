// The steps that exist as React screens.
export { Angebotscheck } from "./angebotscheck/Angebotscheck.js";
export { Arbeiten } from "./arbeiten/Arbeiten.js";
export { BwtArbeiten } from "./bwt/BwtArbeiten.js";
export { Badewannentuer } from "./bwt/Badewannentuer.js";
export { HlArbeiten } from "./hl/HlArbeiten.js";
export { Handlaeufe } from "./hl/Handlaeufe.js";
export { Checkliste } from "./checkliste/Checkliste.js";
export { Arbeitszeit } from "./arbeitszeit/Arbeitszeit.js";
export { Duschabtrennung } from "./duschabtrennung/Duschabtrennung.js";
export { Duschvorhang } from "./duschvorhang/Duschvorhang.js";
export { Duschwanne } from "./duschwanne/Duschwanne.js";
export { Fussboden } from "./fussboden/Fussboden.js";
export { Kosten } from "./kosten/Kosten.js";
export { Kundendaten } from "./kundendaten/Kundendaten.js";
export { Optional } from "./optional/Optional.js";
export { ReferenzNachher, ReferenzVorher } from "./referenz/Referenz.js";
export { Versand } from "./versand/Versand.js";
export { Wandverkleidung } from "./wandverkleidung/Wandverkleidung.js";
export { Rabatt } from "./rabatt/Rabatt.js";
export { AhLeistungen } from "./ah/Leistungen.js";
export { AhFinanzierung } from "./ah/Finanzierung.js";

// what "Weiter" asks for on these steps before it goes on
import { setStepCheck, setStepStatuses } from "../offer/index.js";
import { statuses } from "./status.js";
import { installAhSettle } from "./ah/settle.js";
import { installAhFundingDefaults } from "./ah/funding.js";
import { useOfferStore } from "../offer/index.js";
import { arbeitszeitProblem } from "./arbeitszeit/rules.js";
import { bwtProblem } from "./bwt/rules.js";
import { fussbodenProblem } from "./fussboden/rules.js";
import { checkKundendaten } from "./kundendaten/required.js";
import { markupProblem } from "./markup/rules.js";
setStepCheck("Kundendaten", checkKundendaten);
setStepCheck("Rabatt", markupProblem);
setStepCheck("bwt", () => { const o = useOfferStore.getState().offer as Record<string, any> | null; return o ? bwtProblem(o.bwt ?? {}) : null; });
setStepCheck("Arbeitszeit", () => { const o = useOfferStore.getState().offer as Record<string, any> | null; return o ? arbeitszeitProblem(o.activeOffer, o.Arbeitszeit ?? {}) : null; });
setStepCheck("Fussboden", () => { const o = useOfferStore.getState().offer as Record<string, any> | null; return o ? fussbodenProblem(o.duschwanne ?? {}) : null; });
// "Optional" has no check, as today: the question of the shower system is asked for on "Weiter"
// in today's code, but that check is wired to a step name that does not exist (optional/rules.ts
// keeps the rule as `optionalProblem`, ready to be registered here).

setStepStatuses(statuses);
installAhFundingDefaults(); // Alltagshilfe: the Entlastungsbetrag follows the Pflegegrad answer while the Finanzierung is untouched (ah/funding.ts)
installAhSettle(); // Alltagshilfe budget mode follows price changes made on any step (ah/settle.ts) // step list: done / warning / open / not chosen (U-011 D2)
