// The steps that exist as React screens.
export { Arbeiten } from "./arbeiten/Arbeiten.js";
export { Arbeitszeit } from "./arbeitszeit/Arbeitszeit.js";
export { Duschabtrennung } from "./duschabtrennung/Duschabtrennung.js";
export { Duschvorhang } from "./duschvorhang/Duschvorhang.js";
export { Duschwanne } from "./duschwanne/Duschwanne.js";
export { Fussboden } from "./fussboden/Fussboden.js";
export { Kundendaten } from "./kundendaten/Kundendaten.js";
export { Optional } from "./optional/Optional.js";
export { Wandverkleidung } from "./wandverkleidung/Wandverkleidung.js";
export { Rabatt } from "./rabatt/Rabatt.js";

// what "Weiter" asks for on these steps before it goes on
import { setStepCheck } from "../offer/index.js";
import { useOfferStore } from "../offer/index.js";
import { arbeitszeitProblem } from "./arbeitszeit/rules.js";
import { fussbodenProblem } from "./fussboden/rules.js";
import { checkKundendaten } from "./kundendaten/required.js";
import { markupProblem } from "./markup/rules.js";
setStepCheck("Kundendaten", checkKundendaten);
setStepCheck("Rabatt", markupProblem);
setStepCheck("Arbeitszeit", () => { const o = useOfferStore.getState().offer as Record<string, any> | null; return o ? arbeitszeitProblem(o.activeOffer, o.Arbeitszeit ?? {}) : null; });
setStepCheck("Fussboden", () => { const o = useOfferStore.getState().offer as Record<string, any> | null; return o ? fussbodenProblem(o.duschwanne ?? {}) : null; });
// "Optional" has no check, as today: the question of the shower system is asked for on "Weiter"
// in today's code, but that check is wired to a step name that does not exist (optional/rules.ts
// keeps the rule as `optionalProblem`, ready to be registered here).
