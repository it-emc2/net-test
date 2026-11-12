// Pure address helpers of the distance suggestion — copied from legacy src/routes/routing.js
// (logic unchanged, types added). Differential test: test/routing.test.ts.
export interface AddressParts { street?: string; postalCode?: string; city?: string; state?: string; country?: string }

export function buildAddressVariants({ street, postalCode, city, state, country }: AddressParts): string[] {
  const variants: string[] = [];

  // Clean up inputs
  const cleanStreet = (street || "").trim();
  const cleanPostal = (postalCode || "").trim();
  const cleanCity = (city || "").trim();
  const cleanState = (state || "").trim();
  const cleanCountry = (country || "Deutschland").trim();

  // For compound German city names like "Triebel/Vogtland", also try the primary name
  // (part before "/") — geocoders often don't recognise the district suffix variant.
  const simpleCity = cleanCity.includes("/") ? cleanCity.split("/")[0]!.trim() : null;

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

  // Variant 2b: Same as variant 2 but with simplified city (e.g. "Triebel" instead of "Triebel/Vogtland")
  if (simpleCity && cleanStreet) {
    variants.push(
      [cleanStreet, [cleanPostal, simpleCity].filter(Boolean).join(" "), cleanCountry]
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

  // Variant 5b: Postal + simplified city
  if (simpleCity && cleanPostal) {
    variants.push(`${cleanPostal} ${simpleCity}, ${cleanCountry}`);
  }

  // Variant 6: Just city and country
  if (cleanCity) {
    variants.push(`${cleanCity}, ${cleanCountry}`);
  }

  // Variant 6b: Just simplified city and country
  if (simpleCity) {
    variants.push(`${simpleCity}, ${cleanCountry}`);
  }

  // Remove duplicates while preserving order
  return [...new Set(variants)];
}

/**
 * Build the "canonical" customer address for display purposes
 */
export function buildCustomerAddress({ street, postalCode, city, state, country }: AddressParts): string {
  const parts = [
    street || "",
    [postalCode, city].filter(Boolean).join(" "),
    state || "",
    country || "",
  ].filter(Boolean);
  return parts.join(", ");
}

function normalizeGeoText(value: unknown): string {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function geocodeResultMatchesInput(result: { displayName?: string } | null | undefined, addressParts: AddressParts = {}): boolean {
  const hay = normalizeGeoText(result?.displayName || "");
  const wantPostal = String(addressParts.postalCode || "").trim();
  const wantCity = normalizeGeoText(addressParts.city || "");

  if (wantPostal && !hay.includes(wantPostal)) {
    return false;
  }

  if (wantCity && !hay.includes(wantCity)) {
    // Compound German city names like "Triebel/Vogtland" normalize to "triebel vogtland".
    // Geocoders return just "Triebel" — fall back to matching the primary city token only.
    const primaryCity = wantCity.split(" ")[0]!;
    if (primaryCity && primaryCity.length >= 3 && hay.includes(primaryCity)) {
      return true;
    }

    // Merged municipalities sometimes repeat a segment, e.g. query
    // "Mohlsdorf-Teichwolframsdorf-Mohlsdorf" while the geocoder answers with
    // just "Mohlsdorf-Teichwolframsdorf". Try progressively shorter
    // hyphen-joined prefixes before giving up. Also covers Ortsteil names
    // like "Hof-Haidt", where the geocoder correctly answers with just the
    // parent town "Hof" (len=1).
    const citySegments = wantCity.split("-").filter(Boolean);
    for (let len = citySegments.length - 1; len >= 1; len--) {
      const candidate = citySegments.slice(0, len).join("-");
      if (candidate.length >= 3 && hay.includes(candidate)) {
        return true;
      }
    }

    return false;
  }

  return true;
}

