// The steps that exist as React screens.
export { Kundendaten } from "./kundendaten/Kundendaten.js";
export { Rabatt } from "./rabatt/Rabatt.js";

// what "Weiter" asks for on these steps before it goes on
import { setStepCheck } from "../offer/index.js";
import { checkKundendaten } from "./kundendaten/required.js";
import { markupProblem } from "./markup/rules.js";
setStepCheck("Kundendaten", checkKundendaten);
setStepCheck("Rabatt", markupProblem);
