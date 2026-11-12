// Geocoding + road routing — port of legacy src/routes/routing.js providers. Same order and
// fallbacks: geocode Photon → ORS (with key) → Nominatim (1.1 s pause, 1 req/s policy);
// route ORS (with key) → OSRM. Same request shapes. Difference: service base URLs are
// configurable (tests point them at a stub; defaults = the public services legacy uses).
// These services are read-only (no data changes), so no production guard is needed.
import { buildAddressVariants, geocodeResultMatchesInput, type AddressParts } from "./address.js";

export interface GeoPoint { lat: number; lng: number; displayName?: string; provider: string }
export interface RoutingConfig {
  orsApiKey?: string | undefined;
  photonUrl: string; nominatimUrl: string; orsUrl: string; osrmUrl: string;
  companyAddress: string; companyLat: number | null; companyLng: number | null;
  fetchImpl?: typeof fetch; sleep?: (ms: number) => Promise<void>;
  log?: { info(o: object, m: string): void; warn(o: object, m: string): void };
}
const UA = { "User-Agent": "emc2-configurator/1.0 (routing suggestion)" };
const msg = (e: unknown) => (e as Error)?.message;

export class RoutingService {
  private readonly f: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  constructor(readonly c: RoutingConfig) {
    this.f = c.fetchImpl ?? fetch;
    this.sleep = c.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  private async nominatim(address: string): Promise<GeoPoint> {
    const res = await this.f(`${this.c.nominatimUrl}/search?format=json&limit=1&q=` + encodeURIComponent(address), { headers: UA });
    if (!res.ok) throw new Error(`Nominatim error: HTTP ${res.status}`);
    const data: any = await res.json();
    if (!Array.isArray(data) || data.length === 0) throw new Error(`Nominatim: Address not found`);
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), displayName: data[0].display_name, provider: "nominatim" };
  }

  private async photon(address: string): Promise<GeoPoint> {
    const url = new URL(`${this.c.photonUrl}/api/`);
    url.searchParams.set("q", address); url.searchParams.set("limit", "1"); url.searchParams.set("lang", "de");
    const res = await this.f(url.toString(), { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`Photon error: HTTP ${res.status}`);
    const feature = ((await res.json()) as any)?.features?.[0];
    if (!feature?.geometry?.coordinates) throw new Error("Photon: Address not found");
    const [lng, lat] = feature.geometry.coordinates;
    const p = feature.properties || {};
    const displayName = [p.name, p.street, p.housenumber, p.postcode, p.city, p.country].filter(Boolean).join(", ");
    return { lat, lng, displayName: displayName || address, provider: "photon" };
  }

  private async orsGeocode(address: string): Promise<GeoPoint> {
    if (!this.c.orsApiKey) throw new Error("ORS API key not configured");
    const url = new URL(`${this.c.orsUrl}/geocode/search`);
    url.searchParams.set("api_key", this.c.orsApiKey); url.searchParams.set("text", address);
    url.searchParams.set("boundary.country", "DE"); url.searchParams.set("size", "1");
    const res = await this.f(url.toString(), { headers: { Accept: "application/json" } });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`ORS geocode error: HTTP ${res.status} - ${text.slice(0, 100)}`);
    }
    const feature = ((await res.json()) as any)?.features?.[0];
    if (!feature?.geometry?.coordinates) throw new Error("ORS: Address not found");
    const [lng, lat] = feature.geometry.coordinates;
    return { lat, lng, displayName: feature.properties?.label || address, provider: "ors" };
  }

  async geocodeSingle(address: string): Promise<GeoPoint> {
    const errors: string[] = [];
    try { return await this.photon(address); } catch (err) { errors.push(`Photon: ${msg(err)}`); }
    if (this.c.orsApiKey) { try { return await this.orsGeocode(address); } catch (err) { errors.push(`ORS: ${msg(err)}`); } }
    try { await this.sleep(1100); return await this.nominatim(address); } catch (err) { errors.push(`Nominatim: ${msg(err)}`); }
    throw new Error(`All geocoders failed for "${address}": ${errors.join("; ")}`);
  }

  async geocodeWithVariants(parts: AddressParts) {
    const variants = buildAddressVariants(parts);
    if (variants.length === 0) throw new Error("Could not build any valid address from the provided fields");
    const allErrors: string[] = [];
    for (const variant of variants) {
      try {
        const result = await this.geocodeSingle(variant);
        if (!geocodeResultMatchesInput(result, parts)) {
          const m = `Geocode mismatch for "${variant}" -> "${result?.displayName || "unknown result"}"`;
          this.c.log?.warn({ variant }, m);
          allErrors.push(m);
          continue;
        }
        return { ...result, usedAddress: variant, originalParts: parts };
      } catch (err) {
        allErrors.push(`"${variant}": ${msg(err)}`);
      }
    }
    throw new Error(`All address variants failed: ${allErrors.join("; ")}`);
  }

  async companyCoords(): Promise<GeoPoint> {
    if (this.c.companyLat && this.c.companyLng) return { lat: this.c.companyLat, lng: this.c.companyLng, displayName: this.c.companyAddress, provider: "env" };
    return this.geocodeSingle(this.c.companyAddress);
  }

  private async osrm(a: GeoPoint, b: GeoPoint) {
    const res = await this.f(`${this.c.osrmUrl}/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=false`, { headers: UA });
    if (!res.ok) { const t = await res.text().catch(() => ""); throw new Error(`OSRM error: HTTP ${res.status} - ${t}`); }
    const data: any = await res.json();
    if (data.code !== "Ok") throw new Error(`OSRM error: ${data.code} - ${data.message || "Unknown error"}`);
    const route = data?.routes?.[0];
    if (typeof route?.distance !== "number" || !Number.isFinite(route.distance)) throw new Error("OSRM returned invalid distance data");
    if (typeof route?.duration !== "number" || !Number.isFinite(route.duration)) throw new Error("OSRM returned invalid duration data");
    return { km: route.distance / 1000, seconds: route.duration as number, provider: "osrm" };
  }

  private async orsRoute(a: GeoPoint, b: GeoPoint) {
    if (!this.c.orsApiKey) throw new Error("ORS_API_KEY not configured");
    const res = await this.f(`${this.c.orsUrl}/v2/directions/driving-car/geojson`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: this.c.orsApiKey },
      body: JSON.stringify({ coordinates: [[a.lng, a.lat], [b.lng, b.lat]] }),
    });
    if (!res.ok) { const t = await res.text().catch(() => ""); throw new Error(`ORS error: HTTP ${res.status} - ${t}`); }
    const summary = ((await res.json()) as any)?.features?.[0]?.properties?.summary;
    if (typeof summary?.distance !== "number" || !Number.isFinite(summary.distance)) throw new Error("ORS returned invalid distance data");
    if (typeof summary?.duration !== "number" || !Number.isFinite(summary.duration)) throw new Error("ORS returned invalid duration data");
    return { km: summary.distance / 1000, seconds: summary.duration as number, provider: "ors" };
  }

  async roadDistance(a: GeoPoint, b: GeoPoint) {
    const errors: string[] = [];
    if (this.c.orsApiKey) { try { return await this.orsRoute(a, b); } catch (err) { errors.push(`ORS: ${msg(err)}`); this.c.log?.warn({ err: msg(err) }, "ORS routing failed"); } }
    try { return await this.osrm(a, b); } catch (err) { errors.push(`OSRM: ${msg(err)}`); }
    throw new Error(`All routers failed: ${errors.join("; ")}`);
  }
}
