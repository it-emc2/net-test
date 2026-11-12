// Route table. The address is the navigation (ADR 006): reload and bookmarks keep the place.
//   /                              Hauptmenü
//   /neu/:type[/:step]             a new offer without a deal number
//   /deal/:dealId/:type[/:step]    an offer of a deal
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

export const routes: RouteObject[] = [
  {
    path: "/",
    Component: Root,
    ErrorBoundary: ErrorPage,
    children: [
      { index: true, lazy: home },
      { path: "neu/:type", lazy: offer },
      { path: "neu/:type/:step", lazy: offer },
      { path: "deal/:dealId/:type", lazy: offer },
      { path: "deal/:dealId/:type/:step", lazy: offer },
      { path: "home", element: <Navigate to="/" replace /> },
      { path: "*", Component: NotFoundPage },
    ],
  },
];

/** The app is served under /app; today's UI keeps "/" until every screen has moved. */
export const BASENAME = "/app";
