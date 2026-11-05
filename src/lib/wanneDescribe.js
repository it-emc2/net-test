// lib/wanneDescribe.js
// Customer-facing description of a Wanne article for the Kostentabelle and the
// Angebot PDF/DOCX. Deliberately WITHOUT brand or series name (Steinkamp,
// Novellini, Ottofond, easy entry, Iris, Free-Gate): the offer says what the
// customer gets, not which maker it is. Pure function, shared by the catalog
// route (field `desc`) and by pricing for offers saved before `desc` existed.

const de = (n) => String(n).replace(".", ",");

const dims = (p) => {
  if (!p.lengthCm || !p.widthCm) return "";
  const w =
    p.widthMaxCm && p.widthMaxCm !== p.widthCm ? `${p.widthCm}/${p.widthMaxCm}` : `${p.widthCm}`;
  return `${p.lengthCm} × ${w}${p.tubHeightCm ? ` × ${de(p.tubHeightCm)}` : ""} cm`;
};

export function describeWanne(p) {
  if (!p) return "";
  if (p.type === "screen") {
    const parts = [
      p.klappbar ? "Wannenaufsatz, klappbar" : "Wannenaufsatz, 2-teilig",
      p.side ? `Anschlag ${p.side}` : null,
      p.heightCm ? `Höhe ${p.heightCm} cm` : null,
      /^S\d+/.test(p.seitenwand || "") ? `mit Seitenwand ${p.seitenwand.slice(1)} cm` : null,
      "ESG-Glas klar, Profile chrom",
    ];
    return parts.filter(Boolean).join(", ");
  }
  const parts = [
    p.hasDoor
      ? `Badewanne mit Einstiegstür${p.side ? ` ${p.side}` : ""}`
      : `Badewanne${p.side ? ` ${p.side}` : ""}`,
    p.einbau ? `Einbau ${p.einbau}` : null,
    dims(p),
    p.schuerze || null,
    p.zulauf === "Wanneneinlauf" ? "Wanneneinlauf" : null,
    p.ablauf === "Trio" ? "Trio-Ablauf" : null,
    p.ablauf === "inkl. Ablaufgarnitur" ? "inkl. Ablaufgarnitur" : null,
  ];
  return parts.filter(Boolean).join(", ");
}
