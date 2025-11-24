// src/routes/routing.js
import express from 'express';

const router = express.Router();

// Read from env
const ORS_API_KEY = process.env.ORS_API_KEY;
const COMPANY_ADDRESS = process.env.COMPANY_ADDRESS || 'Kornhausacker 10, Hof';

if (!ORS_API_KEY) {
  console.warn('[routing] Missing ORS_API_KEY in env – will use OSRM fallback');
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

// Haversine distance calculation (straight-line distance)
// COMMENTED OUT: We now require road-based routing only
// function haversineKm(a, b) {
//   const R = 6371;
//   const dLat = ((b.lat - a.lat) * Math.PI) / 180;
//   const dLng = ((b.lng - a.lng) * Math.PI) / 180;
//   const la1 = (a.lat * Math.PI) / 180;
//   const la2 = (b.lat * Math.PI) / 180;
//
//   const h =
//     Math.sin(dLat / 2) ** 2 +
//     Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
//   return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
// }

async function osrmDistanceKm(a, b) {
  // Using the public OSRM demo server (consider self-hosting for production)
  const url = `https://router.project-osrm.org/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=false`;

  const res = await fetch(url, {
    headers: { 'User-Agent': 'emc2-configurator/1.0 (routing suggestion)' },
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    throw new Error(`OSRM error: HTTP ${res.status} - ${errorText}`);
  }

  const data = await res.json();
  
  if (data.code !== 'Ok') {
    throw new Error(`OSRM error: ${data.code} - ${data.message || 'Unknown error'}`);
  }

  const meters = data?.routes?.[0]?.distance ?? null;

  if (typeof meters !== 'number' || !Number.isFinite(meters)) {
    throw new Error('OSRM returned invalid distance data');
  }
  return meters / 1000;
}

async function orsDistanceKm(a, b) {
  if (!ORS_API_KEY) {
    throw new Error('ORS_API_KEY not configured');
  }

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
    const errorText = await res.text().catch(() => '');
    throw new Error(`ORS error: HTTP ${res.status} - ${errorText}`);
  }

  const data = await res.json();
  const meters =
    data?.features?.[0]?.properties?.summary?.distance ?? null;

  if (typeof meters !== 'number' || !Number.isFinite(meters)) {
    throw new Error('ORS returned invalid distance data');
  }
  return meters / 1000;
}

async function getRoadDistanceKm(a, b) {
  // Try ORS first if API key is available
  if (ORS_API_KEY) {
    try {
      console.log('[routing] Attempting ORS routing...');
      const km = await orsDistanceKm(a, b);
      console.log('[routing] ORS routing successful');
      return km;
    } catch (err) {
      console.warn('[routing] ORS failed, falling back to OSRM:', err.message);
    }
  }

  // Fallback to OSRM (free, no API key required)
  console.log('[routing] Using OSRM routing...');
  const km = await osrmDistanceKm(a, b);
  console.log('[routing] OSRM routing successful');
  return km;
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
 * 500: { error: '...' } if routing service fails
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

    // 2) Get road-based distance (tries ORS, falls back to OSRM)
    const km = await getRoadDistanceKm(start, dest);

    // COMMENTED OUT: Haversine fallback removed to ensure road-based routing only
    // let km = null;
    // try {
    //   km = await orsDistanceKm(start, dest);
    // } catch (e) {
    //   console.warn('[routing] ORS failed, will fall back to haversine:', e);
    // }
    //
    // if (!km || !Number.isFinite(km)) {
    //   km = haversineKm(start, dest);
    // }

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
    return res.status(500).json({ 
      error: err.message || 'Routing lookup failed',
      details: 'Road-based routing is required but unavailable'
    });
  }
});

export default router;