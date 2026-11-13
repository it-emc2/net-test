// The steps that exist as React screens.
export { Arbeiten } from "./arbeiten/Arbeiten.js";
export { Arbeitszeit } from "./arbeitszeit/Arbeitszeit.js";
export { Duschwanne } from "./duschwanne/Duschwanne.js";
export { Kundendaten } from "./kundendaten/Kundendaten.js";
export { Rabatt } from "./rabatt/Rabatt.js";

// what "Weiter" asks for on these steps before it goes on
import { setStepCheck } from "../offer/index.js";
import { useOfferStore } from "../offer/index.js";
import { arbeitszeitProblem } from "./arbeitszeit/rules.js";
import { checkKundendaten } from "./kundendaten/required.js";
import { markupProblem } from "./markup/rules.js";
setStepCheck("Kundendaten", checkKundendaten);
setStepCheck("Rabatt", markupProblem);
setStepCheck("Arbeitszeit", () => { const o = useOfferStore.getState().offer as Record<string, any> | null; return o ? arbeitszeitProblem(o.activeOffer, o.Arbeitszeit ?? {}) : null; });
