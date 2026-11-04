import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";
import { routes } from "../src/routes.js";

const at = (path: string) => {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
};

describe("URL routing", () => {
  it("start page offers to open a deal", () => {
    at("/");
    expect(screen.getByRole("heading", { name: "Angebotskonfigurator" })).toBeInTheDocument();
    expect(screen.getByLabelText("Deal-Nummer")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Auftrag öffnen" })).toBeInTheDocument();
  });

  it("/deal/:dealId opens that deal directly", () => {
    at("/deal/65462");
    expect(screen.getByRole("heading", { name: "Auftrag 65462" })).toBeInTheDocument();
  });

  it("/deal/:dealId/:step keeps the step in the URL", () => {
    at("/deal/65462/Kundendaten");
    expect(screen.getByText("Schritt: Kundendaten")).toBeInTheDocument();
  });

  it("rejects non-numeric deal ids", () => {
    at("/deal/abc");
    expect(screen.getByRole("heading", { name: "Nicht gefunden" })).toBeInTheDocument();
  });

  it("legacy /?offer=ANG… deep link redirects to /offer/:offerNumber", () => {
    const router = at("/?offer=ANG2025-1008-092040");
    expect(router.state.location.pathname).toBe("/offer/ANG2025-1008-092040");
    expect(screen.getByRole("heading", { name: "Angebot ANG2025-1008-092040" })).toBeInTheDocument();
  });

  it("unknown paths show a friendly not-found page", () => {
    at("/irgendwas");
    expect(screen.getByRole("heading", { name: "Nicht gefunden" })).toBeInTheDocument();
  });
});
