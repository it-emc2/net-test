/* eslint-disable no-undef */
// scripts/test-routing.mjs

import readline from 'readline';
import { config } from 'dotenv';

// Load .env
config();

// ============================================================
// CONFIG
// ============================================================
// eslint-disable-next-line no-undef
const API_URL = process.env.API_URL || 'http://localhost:3000';
const COMPANY_ADDRESS = process.env.COMPANY_ADDRESS || 'Kornhausacker 10, Hof';

// ============================================================
// COLORS
// ============================================================
const c = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m',
};

// ============================================================
// GERMAN BUNDESLÄNDER (for detection)
// ============================================================
const BUNDESLAENDER = [
  'baden-württemberg', 'bayern', 'berlin', 'brandenburg', 'bremen',
  'hamburg', 'hessen', 'mecklenburg-vorpommern', 'niedersachsen',
  'nordrhein-westfalen', 'rheinland-pfalz', 'saarland', 'sachsen',
  'sachsen-anhalt', 'schleswig-holstein', 'thüringen',
  // Common abbreviations
  'bw', 'by', 'be', 'bb', 'hb', 'hh', 'he', 'mv', 'ni', 'nw', 'nrw', 'rp', 'sl', 'sn', 'st', 'sh', 'th'
];

function isBundesland(str) {
  return BUNDESLAENDER.includes(str.toLowerCase().trim());
}

// ============================================================
// ADDRESS PARSER (improved)
// ============================================================
function parseAddress(fullAddress) {
  const cleaned = fullAddress.trim();
  const parts = cleaned.split(',').map(p => p.trim()).filter(Boolean);
  
  if (parts.length === 0) {
    return { street: cleaned, postalCode: '', city: '', state: '', country: '' };
  }

  let street = '';
  let postalCode = '';
  let city = '';
  let state = '';
  let country = '';

  // First part is usually the street
  street = parts[0] || '';

  // Process remaining parts
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i].trim();
    
    // Check for postal code + city pattern (e.g., "80331 München")
    const postalMatch = part.match(/^(\d{5})\s*(.*)$/);
    if (postalMatch) {
      postalCode = postalMatch[1];
      if (postalMatch[2]) {
        city = postalMatch[2];
      }
      continue;
    }

    // Check if it's a Bundesland
    if (isBundesland(part)) {
      state = part;
      continue;
    }

    // Check if it's "Deutschland" or "Germany"
    if (part.toLowerCase() === 'deutschland' || part.toLowerCase() === 'germany') {
      country = part;
      continue;
    }

    // Otherwise, if we don't have a city yet, assume it's the city
    if (!city) {
      city = part;
    }
  }

  return { street, postalCode, city, state, country: country || 'Deutschland' };
}

// ============================================================
// BUILD ADDRESS VARIANTS (same logic as server)
// ============================================================
function buildAddressVariants({ street, postalCode, city, state, country }) {
  const variants = [];
  
  const cleanStreet = (street || "").trim();
  const cleanPostal = (postalCode || "").trim();
  const cleanCity = (city || "").trim();
  const cleanState = (state || "").trim();
  const cleanCountry = (country || "Deutschland").trim();

  // Variant 1: Full address with state
  if (cleanStreet && cleanCity && cleanState) {
    variants.push(
      [cleanStreet, [cleanPostal, cleanCity].filter(Boolean).join(" "), cleanState, cleanCountry]
        .filter(Boolean)
        .join(", ")
    );
  }

  // Variant 2: Without state (often works better)
  if (cleanStreet && cleanCity) {
    variants.push(
      [cleanStreet, [cleanPostal, cleanCity].filter(Boolean).join(" "), cleanCountry]
        .filter(Boolean)
        .join(", ")
    );
  }

  // Variant 3: Street + postal code + country
  if (cleanStreet && cleanPostal) {
    variants.push(
      [cleanStreet, cleanPostal, cleanCountry]
        .filter(Boolean)
        .join(", ")
    );
  }

  // Variant 4: Just street and city
  if (cleanStreet && cleanCity) {
    variants.push(`${cleanStreet}, ${cleanCity}`);
  }

  // Variant 5: Postal code and city only
  if (cleanPostal && cleanCity) {
    variants.push(`${cleanPostal} ${cleanCity}, ${cleanCountry}`);
  }

  // Variant 6: Just city and country
  if (cleanCity) {
    variants.push(`${cleanCity}, ${cleanCountry}`);
  }

  return [...new Set(variants)];
}

// ============================================================
// GEOCODING FUNCTIONS
// ============================================================
async function geocodeWithPhoton(address) {
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(address)}&limit=1&lang=de`;
  const res = await fetch(url);
  const data = await res.json();
  
  if (data.features?.length > 0) {
    const f = data.features[0];
    const [lng, lat] = f.geometry.coordinates;
    const props = f.properties || {};
    const name = [props.name, props.street, props.housenumber, props.postcode, props.city]
      .filter(Boolean)
      .join(', ');
    return { lat, lng, name: name || address, provider: 'Photon' };
  }
  return null;
}

async function geocodeWithNominatim(address) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'routing-test-script/1.0' }
  });
  const data = await res.json();
  
  if (data.length > 0) {
    return {
      lat: parseFloat(data[0].lat),
      lng: parseFloat(data[0].lon),
      name: data[0].display_name,
      provider: 'Nominatim'
    };
  }
  return null;
}

async function geocodeSingle(address) {
  // Try Photon first, then Nominatim
  let result = await geocodeWithPhoton(address);
  if (!result) {
    // Small delay for Nominatim rate limit
    await new Promise(r => setTimeout(r, 1100));
    result = await geocodeWithNominatim(address);
  }
  return result;
}

/**
 * Geocode with address variant fallbacks
 */
async function geocodeWithVariants(addressParts, verbose = true) {
  const variants = buildAddressVariants(addressParts);
  
  if (variants.length === 0) {
    return null;
  }

  if (verbose) {
    console.log(`   ${c.dim}Trying ${variants.length} address variant(s)...${c.reset}`);
  }

  for (let i = 0; i < variants.length; i++) {
    const variant = variants[i];
    if (verbose) {
      console.log(`   ${c.dim}[${i + 1}/${variants.length}] "${variant}"${c.reset}`);
    }
    
    const result = await geocodeSingle(variant);
    if (result) {
      if (verbose) {
        console.log(`   ${c.green}✓${c.reset} Found with variant: "${variant}"`);
      }
      return { ...result, usedVariant: variant };
    }
  }

  return null;
}

/**
 * Simple geocode for plain string addresses
 */
async function geocode(address) {
  return await geocodeSingle(address);
}

// ============================================================
// ROUTING FUNCTIONS
// ============================================================
async function getRouteOSRM(fromLat, fromLng, toLat, toLng) {
  const url = `https://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=false`;
  
  const res = await fetch(url);
  const data = await res.json();
  
  if (data.code === 'Ok' && data.routes?.length > 0) {
    const route = data.routes[0];
    return {
      distanceKm: Math.round(route.distance / 100) / 10,
      durationMin: Math.round(route.duration / 60),
      provider: 'OSRM'
    };
  }
  return null;
}

async function getRouteORS(fromLat, fromLng, toLat, toLng) {
  const apiKey = process.env.ORS_API_KEY;
  if (!apiKey) return null;

  const url = 'https://api.openrouteservice.org/v2/directions/driving-car';
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': apiKey
    },
    body: JSON.stringify({
      coordinates: [[fromLng, fromLat], [toLng, toLat]]
    })
  });

  if (!res.ok) return null;
  
  const data = await res.json();
  if (data.routes?.length > 0) {
    const route = data.routes[0].summary;
    return {
      distanceKm: Math.round(route.distance / 100) / 10,
      durationMin: Math.round(route.duration / 60),
      provider: 'ORS'
    };
  }
  return null;
}

async function getRoute(fromLat, fromLng, toLat, toLng) {
  let result = await getRouteOSRM(fromLat, fromLng, toLat, toLng);
  if (!result) {
    result = await getRouteORS(fromLat, fromLng, toLat, toLng);
  }
  return result;
}

// ============================================================
// TEST FUNCTION (via your API)
// ============================================================
async function testAddress(destinationAddress) {
  console.log('');
  console.log(`${c.cyan}From:${c.reset} ${COMPANY_ADDRESS}`);
  console.log(`${c.cyan}To:${c.reset}   ${destinationAddress}`);
  console.log(`${c.dim}${'─'.repeat(50)}${c.reset}`);

  const parsed = parseAddress(destinationAddress);

  const body = {
    Kundendaten: {
      street: parsed.street,
      postalCode: parsed.postalCode,
      city: parsed.city,
      state: parsed.state,
      country: parsed.country,
    }
  };

  console.log(`${c.dim}Parsed: street="${parsed.street}", postalCode="${parsed.postalCode}", city="${parsed.city}", state="${parsed.state}"${c.reset}`);
  console.log('');

  try {
    const start = Date.now();
    const res = await fetch(`${API_URL}/api/routing/suggest-distance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    const duration = Date.now() - start;

    if (data.ok) {
      console.log(`${c.green}✓ Success${c.reset} ${c.dim}(${duration}ms)${c.reset}`);
      console.log('');
      console.log(`  ${c.bright}📍 From:${c.reset}      ${data.from?.geocoded || data.from?.address || COMPANY_ADDRESS}`);
      console.log(`  ${c.bright}📍 To:${c.reset}        ${data.to?.geocoded || data.to?.address || destinationAddress}`);
      if (data.to?.usedVariant) {
        console.log(`  ${c.dim}   (matched: "${data.to.usedVariant}")${c.reset}`);
      }
      console.log('');
      console.log(`  ${c.bright}📏 One-way:${c.reset}   ${data.oneWayKm} km`);
      console.log(`  ${c.bright}🔄 Round:${c.reset}     ${data.roundTripKm} km`);
      console.log(`  ${c.bright}⏱️  Time:${c.reset}      ${Math.round(data.oneWaySeconds / 60)} min (one-way)`);
      console.log('');
      console.log(`  ${c.dim}Geocoder: ${data.geocodeProvider || 'unknown'} | Router: ${data.routeProvider || 'unknown'}${c.reset}`);
    } else {
      console.log(`${c.red}✗ Failed:${c.reset} ${data.error}`);
    }

  } catch (err) {
    console.log(`${c.red}✗ Error:${c.reset} ${err.message}`);
    console.log(`${c.dim}Is your server running at ${API_URL}?${c.reset}`);
  }

  console.log('');
}

// ============================================================
// DIRECT GEOCODE + ROUTE TEST (bypasses your API)
// ============================================================
async function testGeocodeDirect(destinationAddress) {
  console.log('');
  console.log(`${c.cyan}${c.bright}Direct Geocoding + Routing Test${c.reset}`);
  console.log(`${c.dim}${'─'.repeat(50)}${c.reset}`);
  console.log(`${c.yellow}From:${c.reset} ${COMPANY_ADDRESS}`);
  console.log(`${c.yellow}To:${c.reset}   ${destinationAddress}`);
  console.log(`${c.dim}${'─'.repeat(50)}${c.reset}`);

  // Parse the address
  const parsed = parseAddress(destinationAddress);
  console.log(`\n${c.dim}Parsed: street="${parsed.street}", postal="${parsed.postalCode}", city="${parsed.city}", state="${parsed.state}"${c.reset}`);

  // Step 1: Geocode the origin (company address)
  console.log(`\n${c.cyan}1. Geocoding origin...${c.reset}`);
  const originCoords = await geocode(COMPANY_ADDRESS);
  
  if (!originCoords) {
    console.log(`   ${c.red}✗ Could not geocode origin address${c.reset}`);
    console.log('');
    return;
  }
  console.log(`   ${c.green}✓${c.reset} ${originCoords.name}`);
  console.log(`   ${c.dim}Coords: ${originCoords.lat}, ${originCoords.lng} (${originCoords.provider})${c.reset}`);

  // Step 2: Geocode the destination with variants
  console.log(`\n${c.cyan}2. Geocoding destination...${c.reset}`);
  const destCoords = await geocodeWithVariants(parsed);
  
  if (!destCoords) {
    console.log(`   ${c.red}✗ Could not geocode destination address (all variants failed)${c.reset}`);
    console.log('');
    return;
  }
  console.log(`   ${c.dim}Resolved: ${destCoords.name}${c.reset}`);
  console.log(`   ${c.dim}Coords: ${destCoords.lat}, ${destCoords.lng} (${destCoords.provider})${c.reset}`);

  // Step 3: Calculate route
  console.log(`\n${c.cyan}3. Calculating driving route...${c.reset}`);
  const route = await getRoute(
    originCoords.lat, originCoords.lng,
    destCoords.lat, destCoords.lng
  );

  if (!route) {
    console.log(`   ${c.red}✗ Could not calculate route${c.reset}`);
    console.log('');
    return;
  }

  // Display results
  console.log('');
  console.log(`${c.green}${c.bright}═══════════════════════════════════════════════════${c.reset}`);
  console.log(`${c.green}${c.bright}  ROUTE CALCULATED SUCCESSFULLY${c.reset}`);
  console.log(`${c.green}${c.bright}═══════════════════════════════════════════════════${c.reset}`);
  console.log('');
  console.log(`  ${c.bright}📍 From:${c.reset}       ${COMPANY_ADDRESS}`);
  console.log(`  ${c.bright}📍 To:${c.reset}         ${destinationAddress}`);
  if (destCoords.usedVariant && destCoords.usedVariant !== destinationAddress) {
    console.log(`  ${c.dim}   (matched as: "${destCoords.usedVariant}")${c.reset}`);
  }
  console.log('');
  console.log(`  ${c.bright}${c.cyan}📏 Distance:${c.reset}   ${c.bright}${route.distanceKm} km${c.reset} (one-way)`);
  console.log(`  ${c.bright}${c.cyan}🔄 Round-trip:${c.reset} ${c.bright}${route.distanceKm * 2} km${c.reset}`);
  console.log(`  ${c.bright}${c.cyan}⏱️  Duration:${c.reset}   ${c.bright}${route.durationMin} min${c.reset} (one-way)`);
  console.log('');
  console.log(`  ${c.dim}Geocoder: ${destCoords.provider} | Router: ${route.provider}${c.reset}`);
  console.log('');
}

// ============================================================
// BATCH TEST
// ============================================================
async function runBatchTest() {
  const testAddresses = [
    'Alexanderplatz 1, 10178 Berlin',
    'Marienplatz 1, 80331 München',
    'Marienplatz 1, 80331 München, Bayern',           // With Bundesland
    'Marienplatz 1, 80331 München, Bayern, Deutschland', // Full address
    'Maximilianstraße 1, 95028 Hof, Bayern',
    'Bahnhofstraße 1, 95444 Bayreuth',
    'Königstraße 1, 90402 Nürnberg, Bayern',
    'Hauptstraße 1, 01067 Dresden, Sachsen',
  ];

  console.log('');
  console.log(`${c.cyan}${c.bright}Running batch test with ${testAddresses.length} addresses...${c.reset}`);
  console.log(`${c.dim}(Including addresses with Bundesland to test fallback)${c.reset}`);
  
  for (const addr of testAddresses) {
    await testGeocodeDirect(addr);
    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`${c.green}${c.bright}Batch test complete!${c.reset}`);
  console.log('');
}

// ============================================================
// INTERACTIVE MODE
// ============================================================
function startInteractive() {
  console.log('');
  console.log(`${c.cyan}${c.bright}╔════════════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.cyan}${c.bright}║     🗺️  Routing Test - Interactive Mode        ║${c.reset}`);
  console.log(`${c.cyan}${c.bright}╚════════════════════════════════════════════════╝${c.reset}`);
  console.log('');
  console.log(`${c.yellow}Starting Point:${c.reset} ${c.bright}${COMPANY_ADDRESS}${c.reset}`);
  console.log(`${c.dim}API: ${API_URL}${c.reset}`);
  console.log('');
  console.log('Commands:');
  console.log(`  ${c.yellow}[address]${c.reset}       Calculate route directly (geocode + OSRM)`);
  console.log(`  ${c.yellow}api [address]${c.reset}   Test via your API server`);
  console.log(`  ${c.yellow}parse [address]${c.reset} Show how an address is parsed`);
  console.log(`  ${c.yellow}examples${c.reset}        Show example addresses`);
  console.log(`  ${c.yellow}batch${c.reset}           Run batch test`);
  console.log(`  ${c.yellow}health${c.reset}          Check API health`);
  console.log(`  ${c.yellow}exit${c.reset}            Quit`);
  console.log('');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const prompt = () => {
    rl.question(`${c.cyan}>${c.reset} `, async (input) => {
      const cmd = input.trim();

      if (!cmd) {
        prompt();
        return;
      }

      // Check for api command
      if (cmd.toLowerCase().startsWith('api ')) {
        const address = cmd.slice(4).trim();
        if (address) {
          await testAddress(address);
        } else {
          console.log('Usage: api [address]');
        }
        prompt();
        return;
      }

      // Check for parse command
      if (cmd.toLowerCase().startsWith('parse ')) {
        const address = cmd.slice(6).trim();
        if (address) {
          const parsed = parseAddress(address);
          console.log('');
          console.log(`${c.cyan}Address Parsing Result:${c.reset}`);
          console.log(`  ${c.bright}Input:${c.reset}      "${address}"`);
          console.log(`  ${c.bright}Street:${c.reset}     "${parsed.street}"`);
          console.log(`  ${c.bright}PostalCode:${c.reset} "${parsed.postalCode}"`);
          console.log(`  ${c.bright}City:${c.reset}       "${parsed.city}"`);
          console.log(`  ${c.bright}State:${c.reset}      "${parsed.state}"`);
          console.log(`  ${c.bright}Country:${c.reset}    "${parsed.country}"`);
          console.log('');
          console.log(`${c.cyan}Address Variants:${c.reset}`);
          const variants = buildAddressVariants(parsed);
          variants.forEach((v, i) => {
            console.log(`  ${c.dim}${i + 1}.${c.reset} ${v}`);
          });
          console.log('');
        } else {
          console.log('Usage: parse [address]');
        }
        prompt();
        return;
      }

      switch (cmd.toLowerCase()) {
        case 'exit':
        case 'quit':
        case 'q':
          console.log('Bye! 👋');
          rl.close();
          process.exit(0);
          break;

        case 'examples':
          console.log('');
          console.log('Example destinations:');
          console.log(`  ${c.dim}Alexanderplatz 1, 10178 Berlin${c.reset}`);
          console.log(`  ${c.dim}Marienplatz 1, 80331 München${c.reset}`);
          console.log(`  ${c.dim}Marienplatz 1, 80331 München, Bayern${c.reset}  ${c.yellow}← with Bundesland${c.reset}`);
          console.log(`  ${c.dim}Jungfernstieg 1, 20095 Hamburg${c.reset}`);
          console.log(`  ${c.dim}Domplatz 1, 50667 Köln, Nordrhein-Westfalen${c.reset}`);
          console.log(`  ${c.dim}Römerberg 1, 60311 Frankfurt${c.reset}`);
          console.log(`  ${c.dim}Maximilianstraße 1, 95028 Hof, Bayern${c.reset}`);
          console.log(`  ${c.dim}Bahnhofstraße 1, 95444 Bayreuth${c.reset}`);
          console.log(`  ${c.dim}Königstraße 1, 90402 Nürnberg${c.reset}`);
          console.log('');
          break;

        case 'batch':
          await runBatchTest();
          break;

        case 'health':
          try {
            const res = await fetch(`${API_URL}/api/routing/health`);
            const data = await res.json();
            console.log('');
            console.log(`${c.green}✓ API is healthy${c.reset}`);
            console.log('');
            console.log(`  ${c.bright}Company:${c.reset}  ${data.companyAddress}`);
            if (data.companyCoords) {
              console.log(`  ${c.bright}Coords:${c.reset}   ${data.companyCoords.lat}, ${data.companyCoords.lng}`);
            }
            console.log('');
            console.log(`  ${c.bright}Providers:${c.reset}`);
            Object.entries(data.providers || {}).forEach(([name, available]) => {
              const icon = available ? `${c.green}✓${c.reset}` : `${c.red}✗${c.reset}`;
              console.log(`    ${icon} ${name}`);
            });
            console.log('');
          } catch (err) {
            console.log(`${c.red}✗ API unreachable: ${err.message}${c.reset}`);
            console.log(`${c.dim}Make sure your server is running at ${API_URL}${c.reset}`);
            console.log('');
          }
          break;

        case 'help':
          console.log('');
          console.log(`Type a destination address to calculate the route.`);
          console.log(`Use "api [address]" to test via your API server.`);
          console.log(`Use "parse [address]" to see how an address is parsed.`);
          console.log('');
          break;

        default:
          await testGeocodeDirect(cmd);
          break;
      }

      prompt();
    });
  };

  prompt();
}

// ============================================================
// MAIN
// ============================================================
const args = process.argv.slice(2);

if (args.length > 0) {
  const input = args.join(' ');
  
  if (input.toLowerCase().startsWith('api ')) {
    testAddress(input.slice(4)).then(() => process.exit(0));
  } else {
    testGeocodeDirect(input).then(() => process.exit(0));
  }
} else {
  startInteractive();
}