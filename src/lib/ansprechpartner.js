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

export async function resolveAnsprechpartner(kundendaten, reqUser) {
  const k = kundendaten || {};
  const apEmail = String(k.ansprechpartner || "").trim().toLowerCase();

  let user = apEmail ? await User.findOne({ email: apEmail }).lean() : null;
  if (!user && reqUser?.email) {
    user = await User.findOne({ email: reqUser.email }).lean();
  }
  if (!user) return k;

  return { ...k, ansprechpartner: user.email, emc2_contact: user.name || user.email };
}
