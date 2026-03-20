// src/routes/routing.js
import express from "express";

const router = express.Router();

// Read from env
const ORS_API_KEY = process.env.ORS_API_KEY;
const COMPANY_ADDRESS = process.env.COMPANY_ADDRESS || "Kornhausacker 10, Hof";
const COMPANY_LAT = parseFloat(process.env.COMPANY_LAT) || null;
const COMPANY_LNG = parseFloat(process.env.COMPANY_LNG) || null;

if (!ORS_API_KEY) {
  console.warn("[routing] Missing ORS_API_KEY in env – will use OSRM fallback");
}

// --- Helpers -------------------------------------------------------------

/**
 * Build multiple address variants for geocoding fallback
 * Returns array from most specific to least specific
 */
function buildAddressVariants({ street, postalCode, city, state, country }) {
  const variants = [];

  // Clean up inputs
  const cleanStreet = (street || "").trim();
  const cleanPostal = (postalCode || "").trim();
  const cleanCity = (city || "").trim();
  const cleanState = (state || "").trim();
  const cleanCountry = (country || "Deutschland").trim();

  // Variant 1: Full address with state (most specific)
  if (cleanStreet && cleanCity && cleanState) {
    variants.push(
      [cleanStreet, [cleanPostal, cleanCity].filter(Boolean).join(" "), cleanState, cleanCountry]
        .filter(Boolean)
        .join(", ")
    );
  }

  // Variant 2: Without state (often works better for German addresses)
  if (cleanStreet && cleanCity) {
    variants.push(
      [cleanStreet, [cleanPostal, cleanCity].filter(Boolean).join(" "), cleanCountry]
        .filter(Boolean)
        .join(", ")
    );
  }

  // Variant 3: Street + postal code + country (no city name)
  if (cleanStreet && cleanPostal) {
    variants.push([cleanStreet, cleanPostal, cleanCountry].filter(Boolean).join(", "));
  }

  // Variant 4: Just street and city
  if (cleanStreet && cleanCity) {
    variants.push(`${cleanStreet}, ${cleanCity}`);
  }

  // Variant 5: Postal code and city only (fallback for vague addresses)
  if (cleanPostal && cleanCity) {
    variants.push(`${cleanPostal} ${cleanCity}, ${cleanCountry}`);
  }

  // Variant 6: Just city and country
  if (cleanCity) {
    variants.push(`${cleanCity}, ${cleanCountry}`);
  }

  // Remove duplicates while preserving order
  return [...new Set(variants)];
}

/**
 * Build the "canonical" customer address for display purposes
 */
function buildCustomerAddress({ street, postalCode, city, state, country }) {
  const parts = [
    street || "",
    [postalCode, city].filter(Boolean).join(" "),
    state || "",
    country || "",
  ].filter(Boolean);
  return parts.join(", ");
}

function normalizeGeoText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function geocodeResultMatchesInput(result, addressParts = {}) {
  const hay = normalizeGeoText(result?.displayName || "");
  const wantPostal = String(addressParts.postalCode || "").trim();
  const wantCity = normalizeGeoText(addressParts.city || "");

  if (wantPostal && !hay.includes(wantPostal)) {
    return false;
  }

  if (wantCity && !hay.includes(wantCity)) {
    return false;
  }

  return true;
}

// ============================================================
// GEOCODING PROVIDERS (with fallbacks)
// ============================================================

/**
 * Nominatim (OpenStreetMap) - FREE, no API key
 * Rate limit: 1 request/second
 */
async function geocodeWithNominatim(address) {
  const url =
    "https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" +
    encodeURIComponent(address);

  const res = await fetch(url, {
    headers: { "User-Agent": "emc2-configurator/1.0 (routing suggestion)" },
  });

  if (!res.ok) {
    throw new Error(`Nominatim error: HTTP ${res.status}`);
  }

  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error(`Nominatim: Address not found`);
  }

  return {
    lat: parseFloat(data[0].lat),
    lng: parseFloat(data[0].lon),
    displayName: data[0].display_name,
    provider: "nominatim",
  };
}

/**
 * Photon (Komoot) - FREE, no API key, powered by OSM
 * No strict rate limit
 */
async function geocodeWithPhoton(address) {
  const url = new URL("https://photon.komoot.io/api/");
  url.searchParams.set("q", address);
  url.searchParams.set("limit", "1");
  url.searchParams.set("lang", "de");

  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    throw new Error(`Photon error: HTTP ${res.status}`);
  }

  const data = await res.json();
  const feature = data?.features?.[0];

  if (!feature?.geometry?.coordinates) {
    throw new Error("Photon: Address not found");
  }

  const [lng, lat] = feature.geometry.coordinates;
  const props = feature.properties || {};
  const displayName = [
    props.name,
    props.street,
    props.housenumber,
    props.postcode,
    props.city,
    props.country,
  ]
    .filter(Boolean)
    .join(", ");

  return {
    lat,
    lng,
    displayName: displayName || address,
    provider: "photon",
  };
}

/**
 * OpenRouteService Geocoding - FREE with API key (2000/day)
 */
async function geocodeWithORS(address) {
  if (!ORS_API_KEY) {
    throw new Error("ORS API key not configured");
  }

  const url = new URL("https://api.openrouteservice.org/geocode/search");
  url.searchParams.set("api_key", ORS_API_KEY);
  url.searchParams.set("text", address);
  url.searchParams.set("boundary.country", "DE");
  url.searchParams.set("size", "1");

  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`ORS geocode error: HTTP ${res.status} - ${text.slice(0, 100)}`);
  }

  const data = await res.json();
  const feature = data?.features?.[0];

  if (!feature?.geometry?.coordinates) {
    throw new Error("ORS: Address not found");
  }

  const [lng, lat] = feature.geometry.coordinates;

  return {
    lat,
    lng,
    displayName: feature.properties?.label || address,
    provider: "ors",
  };
}

/**
 * Try to geocode a single address with all providers
 */
async function geocodeSingleAddress(address) {
  const errors = [];

  // 1. Try Photon first (fast, no rate limit)
  try {
    const result = await geocodeWithPhoton(address);
    return result;
  } catch (err) {
    errors.push(`Photon: ${err.message}`);
  }

  // 2. Try ORS if API key available
  if (ORS_API_KEY) {
    try {
      const result = await geocodeWithORS(address);
      return result;
    } catch (err) {
      errors.push(`ORS: ${err.message}`);
    }
  }

  // 3. Try Nominatim as last resort (strict rate limit)
  try {
    // Small delay to respect rate limit
    await new Promise((resolve) => setTimeout(resolve, 1100));
    const result = await geocodeWithNominatim(address);
    return result;
  } catch (err) {
    errors.push(`Nominatim: ${err.message}`);
  }

  throw new Error(`All geocoders failed for "${address}": ${errors.join("; ")}`);
}

/**
 * Geocode with address variant fallbacks
 * Tries multiple address formats if the first one fails
 */
async function geocodeWithVariants(addressParts) {
  const variants = buildAddressVariants(addressParts);

  if (variants.length === 0) {
    throw new Error("Could not build any valid address from the provided fields");
  }

  console.log(`[routing] Will try ${variants.length} address variant(s)`);

  const allErrors = [];

  for (let i = 0; i < variants.length; i++) {
    const variant = variants[i];
    console.log(`[routing] Trying variant ${i + 1}/${variants.length}: "${variant}"`);

    try {
      const result = await geocodeSingleAddress(variant);

      if (!geocodeResultMatchesInput(result, addressParts)) {
        const mismatchMsg =
          `Geocode mismatch for "${variant}" -> "${result?.displayName || "unknown result"}"`;
        console.warn(`[routing] ${mismatchMsg}`);
        allErrors.push(mismatchMsg);
        continue;
      }

      console.log(`[routing] Success with variant: "${variant}"`);
      return {
        ...result,
        usedAddress: variant,
        originalParts: addressParts,
      };
    } catch (err) {
      console.warn(`[routing] Variant failed: ${err.message}`);
      allErrors.push(`"${variant}": ${err.message}`);
    }
  }

  throw new Error(`All address variants failed: ${allErrors.join("; ")}`);
}

/**
 * Geocode a plain string address (for company address etc.)
 */
async function geocode(address) {
  console.log(`[routing] Geocoding: "${address}"`);
  return await geocodeSingleAddress(address);
}

/**
 * Get company coordinates (from env or geocode)
 */
async function getCompanyCoords() {
  // Use pre-configured coordinates if available
  if (COMPANY_LAT && COMPANY_LNG) {
    console.log("[routing] Using pre-configured company coordinates");
    return {
      lat: COMPANY_LAT,
      lng: COMPANY_LNG,
      displayName: COMPANY_ADDRESS,
      provider: "env",
    };
  }

  // Otherwise geocode the company address
  return await geocode(COMPANY_ADDRESS);
}

// ============================================================
// ROUTING PROVIDERS
// ============================================================

async function osrmDistanceAndDuration(a, b) {
  const url = `https://router.project-osrm.org/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=false`;

  const res = await fetch(url, {
    headers: { "User-Agent": "emc2-configurator/1.0 (routing suggestion)" },
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    throw new Error(`OSRM error: HTTP ${res.status} - ${errorText}`);
  }

  const data = await res.json();
  if (data.code !== "Ok") {
    throw new Error(`OSRM error: ${data.code} - ${data.message || "Unknown error"}`);
  }

  const route = data?.routes?.[0];
  const meters = route?.distance;
  const seconds = route?.duration;

  if (typeof meters !== "number" || !Number.isFinite(meters)) {
    throw new Error("OSRM returned invalid distance data");
  }
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) {
    throw new Error("OSRM returned invalid duration data");
  }

  return { km: meters / 1000, seconds, provider: "osrm" };
}

async function orsDistanceAndDuration(a, b) {
  if (!ORS_API_KEY) throw new Error("ORS_API_KEY not configured");

  const url = `https://api.openrouteservice.org/v2/directions/driving-car/geojson`;
  const body = JSON.stringify({
    coordinates: [
      [a.lng, a.lat],
      [b.lng, b.lat],
    ],
  });

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: ORS_API_KEY,
    },
    body,
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    throw new Error(`ORS error: HTTP ${res.status} - ${errorText}`);
  }

  const data = await res.json();
  const summary = data?.features?.[0]?.properties?.summary;

  const meters = summary?.distance;
  const seconds = summary?.duration;

  if (typeof meters !== "number" || !Number.isFinite(meters)) {
    throw new Error("ORS returned invalid distance data");
  }
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) {
    throw new Error("ORS returned invalid duration data");
  }

  return { km: meters / 1000, seconds, provider: "ors" };
}

async function getRoadDistanceAndDuration(a, b) {
  const errors = [];

  // 1. Try ORS first if API key available
  if (ORS_API_KEY) {
    try {
      console.log("[routing] Attempting ORS routing...");
      const out = await orsDistanceAndDuration(a, b);
      console.log("[routing] ORS routing successful");
      return out;
    } catch (err) {
      errors.push(`ORS: ${err.message}`);
      console.warn("[routing] ORS failed:", err.message);
    }
  }

  // 2. Fallback to OSRM
  try {
    console.log("[routing] Using OSRM routing...");
    const out = await osrmDistanceAndDuration(a, b);
    console.log("[routing] OSRM routing successful");
    return out;
  } catch (err) {
    errors.push(`OSRM: ${err.message}`);
    console.warn("[routing] OSRM failed:", err.message);
  }

  throw new Error(`All routers failed: ${errors.join("; ")}`);
}

// ============================================================
// ROUTES
// ============================================================

/**
 * POST /api/routing/suggest-distance
 */
router.post("/suggest-distance", async (req, res) => {
  try {
    const k = req.body?.Kundendaten || req.body?.bereich || req.body || {};

    const street = k.street || "";
    const postalCode = k.postalCode || k.PLZ || "";
    const city = k.city || k.Stadt || "";
    const state = k.state || k.Bundesland || "";
    const country = k.country || k.Land || "Deutschland";

    if (!street && !city && !postalCode) {
      return res.status(400).json({ error: "Missing address fields in Kundendaten." });
    }

    // Build the canonical display address (with state)
    const customerAddress = buildCustomerAddress({
      street,
      postalCode,
      city,
      state,
      country,
    });

    if (!customerAddress.trim()) {
      return res.status(400).json({ error: "Customer address could not be built." });
    }

    if (!COMPANY_ADDRESS) {
      return res.status(500).json({ error: "COMPANY_ADDRESS missing on server." });
    }

    // 1) Get coordinates for company
    const start = await getCompanyCoords();

    // 2) Geocode customer with variant fallbacks
    const dest = await geocodeWithVariants({
      street,
      postalCode,
      city,
      state,
      country,
    });

    // 3) Get road-based distance
    const { km, seconds, provider: routeProvider } = await getRoadDistanceAndDuration(start, dest);

    // Round sensibly
    const oneWayKm = Math.round(km * 2) / 2;
    const roundTripKm = Math.round(oneWayKm * 2 * 10) / 10;
    const oneWaySeconds = Math.round(seconds);
    const roundTripSeconds = oneWaySeconds * 2;

    return res.json({
      ok: true,
      oneWayKm,
      roundTripKm,
      oneWaySeconds,
      roundTripSeconds,
      from: {
        address: COMPANY_ADDRESS,
        geocoded: start.displayName,
        lat: start.lat,
        lng: start.lng,
      },
      to: {
        address: customerAddress,
        geocoded: dest.displayName,
        usedVariant: dest.usedAddress,
        lat: dest.lat,
        lng: dest.lng,
      },
      geocodeProvider: dest.provider,
      routeProvider,
    });
  } catch (err) {
    console.error("[routing] suggest-distance failed:", err);
    return res.status(500).json({
      error: err.message || "Routing lookup failed",
    });
  }
});

/**
 * GET /api/routing/health
 */
router.get("/health", (req, res) => {
  res.json({
    ok: true,
    companyAddress: COMPANY_ADDRESS,
    companyCoords: COMPANY_LAT && COMPANY_LNG ? { lat: COMPANY_LAT, lng: COMPANY_LNG } : null,
    providers: {
      ors: !!ORS_API_KEY,
      osrm: true,
      photon: true,
      nominatim: true,
    },
  });
});

export default router;
