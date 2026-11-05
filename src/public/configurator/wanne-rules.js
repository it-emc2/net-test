// wanne-rules.js — which tub can be combined with which Wannenaufsatz.
// Shared by the Wanne wizard (browser) and the unit tests. Only combinations
// backed by manufacturer data are allowed; anything open is blocked with a
// reason, so nothing gets ordered that cannot be installed.
//
// Facts behind the rules (2026-11-05):
// - The Aufsatz always stands at the DOOR end: you step in through the door and
//   shower there. Megabad lists the Steinkamp Aufsatz "Anschlag links" with the
//   tub "mit Glastür links" as required item; Novellini sells Iris Aufsätze
//   per tub side ("für Iris li/re" = door side).
// - Steinkamp Aufsätze are hinged on an END WALL (Montageanleitung "Drehfalttür
//   zweiteilig") → the door end needs a wall: corner with the wall on the door
//   side, or niche. Vorwandmontage (both ends free) and door at the free end: none.
// - Novellini Iris (GC Bildpreisliste Sanitär 2026 S. 956–959, Langtexte,
//   Montageanleitung Wanne + COMBY): door at the wall end; 2 Schürzen = corner,
//   Frontschürze = niche, 3 Schürzen = both ends free (not in our catalog).
//   Iris "klappbar" Aufsatz (no side panel) hinges on the wall at the door end.
//   COMBY with side panel needs a FREE door end (Anleitung: back wall only) —
//   panel width = tub width at the door end: S70 for 160/170 (70 cm), S75 for
//   180 (75 cm).

export const hasSidePanel = (screen) => /^S\d+/.test(screen?.seitenwand || "");

/** End of the tub the Aufsatz stands at: always the door end. */
export const screenEnd = (tub, screen) => tub?.side || screen?.side;

/** End walls a tub stands against. */
export function endWalls(tub) {
  if (!tub) return [];
  if (tub.einbau === "Nische" || tub.wall === "beide") return ["links", "rechts"];
  if (tub.einbau === "Ecke" && tub.wall) return [tub.wall];
  return [];
}

/** { ok, reason } — reason is a short German sentence for the UI. */
export function screenFit(tub, screen) {
  if (!tub || !screen) return { ok: false, reason: "" };
  if (!tub.screenFamily || tub.screenFamily !== screen.screenFamily)
    return { ok: false, reason: "Passt nicht zu dieser Wanne." };
  if (screen.side !== tub.side)
    return { ok: false, reason: "Der Aufsatz steht immer auf der Türseite." };
  const wallAtDoor = endWalls(tub).includes(tub.side);
  if (hasSidePanel(screen)) {
    if (wallAtDoor || tub.einbau === "Nische")
      return { ok: false, reason: "Aufsatz mit Seitenwand braucht ein freies Ende an der Tür – hier steht dort eine Wand." };
    const w = Number(String(screen.seitenwand).slice(1));
    if (tub.widthCm && w !== tub.widthCm)
      return { ok: false, reason: `Seitenwand ${w} cm passt nicht zur Wannenbreite ${tub.widthCm} cm an der Tür.` };
    return { ok: true, reason: "" };
  }
  return wallAtDoor
    ? { ok: true, reason: "" }
    : { ok: false, reason: "An der Türseite ist keine Wand, an der der Aufsatz angeschlagen werden kann." };
}

export const screensFor = (tub, screens) => screens.filter((s) => screenFit(tub, s).ok);
export const acceptsScreen = (tub, screens) => screensFor(tub, screens).length > 0;

/** Why no tub with these answers can take an Aufsatz (for a greyed-out tile). */
export function noScreenReason({ einbau, wall, side }) {
  if (einbau === "Vorwand") return "Bei freien Enden gibt es keine Wand für den Anschlag.";
  if (einbau === "Ecke" && wall && side && wall !== side)
    return "Tür am freien Ende: dort fehlt die Wand für den Aufsatz.";
  return "Kein passender Aufsatz für diese Auswahl.";
}
