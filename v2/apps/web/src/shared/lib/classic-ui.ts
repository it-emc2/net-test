// Today's UI beside the React app (U-061). With START_UI=react the server sends a bare "/" to this
// app; "/?classic=1" sets the session cookie oc_ui=classic and opens today's UI, which then stays
// there (reloads included) for this browser session (apps/server/src/modules/web/register.ts).

/** Every link from this app to today's UI home. A plain "/" would come straight back here. */
export const CLASSIC_HOME = "/?classic=1";

/**
 * Called once when this app starts: whoever is back here gets this app again at "/" — the choice
 * of today's UI only lasts until the user returns. Harmless when the cookie is not set
 * (START_UI=classic, or today's UI never chosen).
 */
export function forgetClassicChoice(doc: Pick<Document, "cookie"> = document): void {
  doc.cookie = "oc_ui=; Path=/; Max-Age=0";
}
