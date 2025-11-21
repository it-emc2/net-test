// src/routes/routing.js
import express from 'express';

const router = express.Router();

// Read from env
const ORS_API_KEY = process.env.ORS_API_KEY;
const COMPANY_ADDRESS = process.env.COMPANY_ADDRESS || 'Kornhausacker 10, Hof';

if (!ORS_API_KEY) {
  console.warn('[routing] Missing ORS_API_KEY in env – routing suggestions disabled');
}

// --- Helpers -------------------------------------------------------------

function buildCustomerAddress({ street, postalCode, city, state, country }) {
  const parts = [
    street || '',
    [postalCode, city].filter(Boolean).join(' '),
    state || '',
    country || '',
  ].filter(Boolean);
  return parts.join(', ');
}

async function geocode(address) {
  const url =
    'https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' +
    encodeURIComponent(address);

  const res = await fetch(url, {
    headers: { 'User-Agent': 'emc2-configurator/1.0 (routing suggestion)' },
  });

  if (!res.ok) {
    throw new Error(`Nominatim error: HTTP ${res.status}`);
  }

  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error(`Address not found: ${address}`);
  }

  return {
    lat: parseFloat(data[0].lat),
    lng: parseFloat(data[0].lon),
    displayName: data[0].display_name,
  };
}

function haversineKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

async function orsDistanceKm(a, b) {
  if (!ORS_API_KEY) return null;

  const url = `https://api.openrouteservice.org/v2/directions/driving-car/geojson?api_key=${ORS_API_KEY}`;
  const body = JSON.stringify({
    coordinates: [
      [a.lng, a.lat],
      [b.lng, b.lat],
    ],
  });

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });

  if (!res.ok) {
    throw new Error(`ORS error: HTTP ${res.status}`);
  }

  const data = await res.json();
  const meters =
    data?.features?.[0]?.properties?.summary?.distance ?? null;

  if (typeof meters !== 'number' || !Number.isFinite(meters)) {
    return null;
  }
  return meters / 1000;
}

// --- Route: POST /api/routing/suggest-distance --------------------------
/**
 * Body:
 * {
 *   Kundendaten: {
 *     street, postalCode, city, state, country
 *   }
 * }
 *
 * Response:
 * 200: { ok: true, oneWayKm, roundTripKm, from, to }
 * 400: { error: '...' } if address missing/invalid
 */
router.post('/suggest-distance', async (req, res) => {
  try {
    const k = req.body?.Kundendaten || req.body?.bereich || {};

    const street = k.street || '';
    const postalCode = k.postalCode || k.PLZ || '';
    const city = k.city || k.Stadt || '';

    if (!street && !city && !postalCode) {
      return res
        .status(400)
        .json({ error: 'Missing address fields in Kundendaten.' });
    }

    const customerAddress = buildCustomerAddress({
      street,
      postalCode,
      city,
      state: k.state,
      country: k.country || 'Deutschland',
    });

    if (!customerAddress.trim()) {
      return res
        .status(400)
        .json({ error: 'Customer address could not be built.' });
    }

    if (!COMPANY_ADDRESS) {
      return res
        .status(500)
        .json({ error: 'COMPANY_ADDRESS missing on server.' });
    }

    // 1) Geocode both addresses
    const [start, dest] = await Promise.all([
      geocode(COMPANY_ADDRESS),
      geocode(customerAddress),
    ]);

    // 2) Try ORS; fallback to haversine
    let km = null;
    try {
      km = await orsDistanceKm(start, dest);
    } catch (e) {
      console.warn('[routing] ORS failed, will fall back to haversine:', e);
    }

    if (!km || !Number.isFinite(km)) {
      km = haversineKm(start, dest);
    }

    // Round sensibly (nearest 0.5 km)
    const oneWayKm = Math.round(km * 2) / 2;
    const roundTripKm = Math.round(oneWayKm * 2 * 10) / 10;

    return res.json({
      ok: true,
      oneWayKm,
      roundTripKm,
      from: {
        address: COMPANY_ADDRESS,
        geocoded: start.displayName,
      },
      to: {
        address: customerAddress,
        geocoded: dest.displayName,
      },
    });
  } catch (err) {
    console.error('[routing] suggest-distance failed:', err);
    return res.status(500).json({ error: 'Routing lookup failed' });
  }
});

export default router;