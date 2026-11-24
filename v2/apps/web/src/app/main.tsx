import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import { Providers } from "./providers.js";
import { BASENAME, routes } from "./router.js";
import { applyPrefs } from "../shared/lib/prefs.js";
import { forgetClassicChoice } from "../shared/lib/classic-ui.js";
import "../styles.css";

applyPrefs();
// START_UI=react (U-061): being back in this app makes it the start at "/" again
forgetClassicChoice();
const router = createBrowserRouter(routes, { basename: BASENAME });

// Every uncaught browser error is logged (and later shipped to the error tracker).
window.addEventListener("error", (e) => console.error("[oc] uncaught error", e.error ?? e.message));
window.addEventListener("unhandledrejection", (e) => console.error("[oc] unhandled rejection", e.reason));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Providers>
      <RouterProvider router={router} />
    </Providers>
  </StrictMode>,
);
