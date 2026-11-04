import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import { routes } from "./routes.js";
import "./styles.css";

const router = createBrowserRouter(routes);

// Every uncaught browser error is logged (and later shipped to the error tracker).
window.addEventListener("error", (e) => console.error("[oc] uncaught error", e.error ?? e.message));
window.addEventListener("unhandledrejection", (e) => console.error("[oc] unhandled rejection", e.reason));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
