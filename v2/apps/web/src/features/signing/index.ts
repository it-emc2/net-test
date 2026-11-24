// The customer signing page (public, /sign/<token> when SIGNING_UI=react). Built as its own entry
// (sign.html → main.tsx): it carries nothing of the app — no router, no login, no offer data.
export { SignPage } from "./SignPage.js";
export * as signRules from "./rules.js";
