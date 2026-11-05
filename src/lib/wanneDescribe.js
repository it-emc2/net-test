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

// "Ecke" with a known wall side says where the wall is; door side is separate.
const mountText = (p) =>
  p.einbau === "Ecke"
    ? p.wall === "links" || p.wall === "rechts"
      ? `Einbau Ecke, Wand ${p.wall}`
      : "Einbau Ecke"
    : p.einbau === "Nische"
      ? "Nischeneinbau"
      : p.einbau === "Vorwand"
        ? "Vorwandmontage, Verkleidung vorn und an beiden Enden"
        : null;

export function describeWanne(p) {
  if (!p) return "";
  if (p.type === "screen") {
    const kind =
      p.screenKind === "pendel"
        ? "Wannenaufsatz Pendeltür, 1-teilig"
        : p.screenKind === "falt"
          ? "Wannenaufsatz, 2-teilig faltbar"
          : p.klappbar
            ? "Wannenaufsatz, klappbar"
            : "Wannenaufsatz, 2-teilig";
    const parts = [
      kind,
      p.side ? `Anschlag ${p.side}` : null,
      p.screenFamily === "steinkamp" && p.widthCm && p.heightCm
        ? `${p.widthCm} × ${p.heightCm} cm`
        : p.heightCm
          ? `Höhe ${p.heightCm} cm`
          : null,
      /^S\d+/.test(p.seitenwand || "") ? `mit Seitenwand ${p.seitenwand.slice(1)} cm` : null,
      p.screenFamily === "steinkamp" ? "ESG-Glas klar" : "ESG-Glas klar, Profile chrom",
    ];
    return parts.filter(Boolean).join(", ");
  }
  const parts = [
    p.hasDoor
      ? `Badewanne mit Einstiegstür${p.side ? ` ${p.side}` : ""}`
      : `Badewanne${p.side ? ` ${p.side}` : ""}`,
    mountText(p),
    dims(p),
    // the mount text already says "Verkleidung vorn und an beiden Enden"
    p.einbau === "Vorwand" ? null : p.schuerze || null,
    p.zulauf === "Wanneneinlauf" ? "Wanneneinlauf" : null,
    p.ablauf === "Trio" ? "Trio-Ablauf" : null,
    p.ablauf === "inkl. Ablaufgarnitur" ? "inkl. Ablaufgarnitur" : null,
  ];
  return parts.filter(Boolean).join(", ");
}
