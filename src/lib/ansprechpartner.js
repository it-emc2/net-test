// Server-side source of truth for "Ansprechpartner" on an offer: the printed
// name, the email signature line, and the internal signature image (see
// docx-template.js mapData) all key off Kundendaten.ansprechpartner (an
// email). The client also sends a free-text Kundendaten.emc2_contact name —
// never trust it: derive it here from the User record instead, so a request
// can't claim to be "Stefan Wolfrum" while pointing at someone else's email
// (or vice versa). Whichever Ansprechpartner the user actually picked in the
// dropdown is honored; only an unknown/missing email falls back to whoever
// is logged in.
import User from "../models/User.js";

// Only active users WITH a signature may be Ansprechpartner (same rule as
// GET /api/users). Anyone else falls back to the logged-in user if eligible,
// else AP_DEFAULT_EMAIL, else the oldest eligible user — never an admin account.
const ELIGIBLE = { active: true, signatureDataUrl: { $exists: true, $ne: "" } };
const find = (email) => (email ? User.findOne({ ...ELIGIBLE, email }).lean() : null);

export async function resolveAnsprechpartner(kundendaten, reqUser) {
  const k = kundendaten || {};
  const apEmail = String(k.ansprechpartner || "").trim().toLowerCase();

  const user =
    (await find(apEmail)) ||
    (await find(String(reqUser?.email || "").toLowerCase())) ||
    (await find(String(process.env.AP_DEFAULT_EMAIL || "").trim().toLowerCase())) ||
    (await User.findOne(ELIGIBLE).sort({ createdAt: 1 }).lean());
  if (!user) return k;

  return { ...k, ansprechpartner: user.email, emc2_contact: user.name || user.email };
}
