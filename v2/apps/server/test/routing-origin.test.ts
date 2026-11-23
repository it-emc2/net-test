// Distance suggestion: the route starts at the company address — for Alltagshilfe (offer type "ah")
// at its own address. External geocoding/routing is a stub; nothing real is called.
import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { PlanningClient } from "../src/integrations/planning.js";
import { registerRouting } from "../src/modules/planning/routes.js";
import { RoutingService, type RoutingConfig } from "../src/modules/planning/providers.js";

const HOME = "Kornhausacker 10, Hof", AH = "Waldstraße 5, 95032 Hof";
const COORDS: Record<string, [number, number]> = { [HOME]: [11.9, 50.3], [AH]: [11.8, 50.4], "Musterweg 1, 95028 Hof": [11.95, 50.32] };
const CUSTOMER = { Kundendaten: { street: "Musterweg 1", postalCode: "95028", city: "Hof" } };

async function setup(over: Partial<RoutingConfig> = {}) {
  const geocoded: string[] = [], routed: string[] = [];
  const fetchImpl = (async (url: string) => {
    const u = new URL(String(url));
    if (u.hostname === "photon.test") {
      const q = u.searchParams.get("q")!;
      geocoded.push(q);
      const c = COORDS[q] ?? COORDS["Musterweg 1, 95028 Hof"]!;
      return Response.json({ features: [{ geometry: { coordinates: c }, properties: { name: q, postcode: "95028", city: "Hof" } }] });
    }
    if (u.hostname === "osrm.test") {
      routed.push(u.pathname.split("/").pop()!);
      // the start's longitude tells the origins apart: 11.9 → 10 km, 11.8 → 20 km
      return Response.json({ code: "Ok", routes: [{ distance: u.pathname.includes("/11.8,") ? 20000 : 10000, duration: 900 }] });
    }
    throw new Error(`unexpected request ${url}`);
  }) as unknown as typeof fetch;
  const routing = new RoutingService({
    photonUrl: "http://photon.test", nominatimUrl: "http://nominatim.test", orsUrl: "http://ors.test", osrmUrl: "http://osrm.test",
    companyAddress: HOME, companyLat: null, companyLng: null, companyAddressAh: AH, companyAhLat: null, companyAhLng: null,
    fetchImpl, sleep: async () => {}, ...over,
  });
  const app = Fastify();
  await registerRouting(app, { routing, planning: new PlanningClient({ baseUrl: "http://planning.test", apiKey: undefined, fetchImpl }) });
  const ask = async (body: object) => (await app.inject({ method: "POST", url: "/api/routing/suggest-distance", payload: body })).json();
  return { ask, geocoded, routed };
}

describe("suggest-distance: where the route starts", () => {
  it("bu → company address", async () => {
    const { ask, geocoded } = await setup();
    const r = await ask({ ...CUSTOMER, offerType: "bu" });
    expect(r.from.address).toBe(HOME);
    expect(geocoded[0]).toBe(HOME);
    expect(r.oneWayKm).toBe(10);
  });
  it("ah → Waldstraße 5, 95032 Hof, and the answer names it", async () => {
    const { ask, geocoded } = await setup();
    const r = await ask({ ...CUSTOMER, offerType: "ah" });
    expect(r.from.address).toBe(AH);
    expect(geocoded[0]).toBe(AH);
    expect(r.oneWayKm).toBe(20);
  });
  it("no offer type (today's UI), an unknown or non-text one → company address", async () => {
    const { ask } = await setup();
    for (const extra of [{}, { offerType: "xyz" }, { offerType: 7 }, { offerType: null }]) expect((await ask({ ...CUSTOMER, ...extra })).from.address).toBe(HOME);
  });
  it("never cached: the same customer address asked as ah, bu, ah gets each origin's own answer", async () => {
    const { ask } = await setup();
    const seq = [];
    for (const offerType of ["ah", "bu", "ah", "bu"]) { const r = await ask({ ...CUSTOMER, offerType }); seq.push([r.from.address, r.oneWayKm]); }
    expect(seq).toEqual([[AH, 20], [HOME, 10], [AH, 20], [HOME, 10]]);
  });
  it("coordinates for the AH origin skip its geocoding; the company's stay for the others", async () => {
    const { ask, geocoded, routed } = await setup({ companyAhLat: 50.5, companyAhLng: 11.7 });
    const r = await ask({ ...CUSTOMER, offerType: "ah" });
    expect(geocoded).not.toContain(AH);
    expect(r.from).toMatchObject({ address: AH, lat: 50.5, lng: 11.7 });
    expect(routed[0]).toMatch(/^11\.7,50\.5;/);
    expect((await ask({ ...CUSTOMER, offerType: "bu" })).from.address).toBe(HOME);
  });
  it("without an AH address configured, ah falls back to the company address", async () => {
    const { ask } = await setup({ companyAddressAh: undefined });
    expect((await ask({ ...CUSTOMER, offerType: "ah" })).from.address).toBe(HOME);
  });
});
