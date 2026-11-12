// Route table. The address is the navigation (ADR 006): reload and bookmarks keep the place.
//   /                              Hauptmenü
//   /neu/:type                     a new offer without a deal number → gets a temporary key
//   /deal/:dealId/:type[/:step]    an offer of a deal (or of a temporary key)
// Every feature is its own chunk and is loaded only when its route is opened (ADR 026).
import { Navigate, Outlet, type RouteObject } from "react-router";
import { RequireLogin } from "../features/auth/index.js";
import { ErrorPage, NotFoundPage } from "./ErrorPage.js";

function Root() {
  return (
    <RequireLogin>
      <Outlet />
    </RequireLogin>
  );
}

const home = () => import("../features/home/index.js").then((m) => ({ Component: m.HomePage }));
const offer = () => import("../features/offer/index.js").then((m) => ({ Component: m.OfferShell }));
const newOffer = () => import("../features/offer/index.js").then((m) => ({ Component: m.NewOffer }));
const stepInLegacy = () => import("../features/offer/index.js").then((m) => ({ Component: m.StepInLegacy }));
// Steps that exist as React screens — one lazy chunk each. Every other step falls through to
// ":step" and continues in today's UI.
const kundendaten = () => import("../features/steps/index.js").then((m) => ({ Component: m.Kundendaten }));

export const routes: RouteObject[] = [
  {
    path: "/",
    Component: Root,
    ErrorBoundary: ErrorPage,
    children: [
      { index: true, lazy: home },
      { path: "neu/:type", lazy: newOffer },
      {
        path: "deal/:dealId/:type",
        lazy: offer,
        children: [
          { index: true, element: null }, // the frame sends the address on to the first step
          { path: "Kundendaten", lazy: kundendaten },
          { path: ":step", lazy: stepInLegacy },
        ],
      },
      { path: "home", element: <Navigate to="/" replace /> },
      { path: "*", Component: NotFoundPage },
    ],
  },
];

/** The app is served under /app; today's UI keeps "/" until every screen has moved. */
export const BASENAME = "/app";
