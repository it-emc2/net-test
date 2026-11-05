// wanne-rules.js — which tub can be combined with which Wannenaufsatz.
// Shared by the Wanne wizard (browser) and the unit tests. Only combinations
// backed by manufacturer data are allowed; anything open is blocked with a
// reason, so nothing gets ordered that cannot be installed.
//
// Facts behind the rules (2026-11-05):
// - Steinkamp Aufsätze are hinged on an END WALL and run along the front rim
//   (Montageanleitung "Drehfalttür zweiteilig"); Anschlag links = left end wall.
// - Steinkamp Vorwandmontage has panels on both ends → no end wall → no Aufsatz.
// - Steinkamp Aufsatz above the entry door (same end): the door cut-out reaches
//   the rim; no manufacturer statement that a screen can stand there → blocked.
// - Novellini Iris Aufsätze are sold per tub side ("für Iris li/re") → the
//   Aufsatz side must equal the Iris tub side.

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
  if (screen.screenFamily === "iris") {
    return screen.side === tub.side
      ? { ok: true, reason: "" }
      : { ok: false, reason: "Der Iris-Aufsatz muss zur Seite der Wanne passen." };
  }
  // steinkamp
  if (tub.einbau === "Vorwand")
    return { ok: false, reason: "Ein Aufsatz wird an einer Seitenwand angeschlagen – bei freien Enden gibt es keine." };
  if (!endWalls(tub).includes(screen.side))
    return { ok: false, reason: `Keine Wand auf der Anschlagseite (${screen.side}).` };
  if (screen.side === tub.side)
    return { ok: false, reason: "Aufsatz über der Tür ist vom Hersteller nicht freigegeben." };
  return { ok: true, reason: "" };
}

export const screensFor = (tub, screens) => screens.filter((s) => screenFit(tub, s).ok);
export const acceptsScreen = (tub, screens) => screensFor(tub, screens).length > 0;

/** Why no tub with these answers can take an Aufsatz (for a greyed-out tile). */
export function noScreenReason({ einbau, wall, side }) {
  if (einbau === "Vorwand") return "Bei freien Enden gibt es keine Wand für den Anschlag.";
  if (einbau === "Ecke" && wall && side && wall === side)
    return "Tür an der Wandseite: Der Aufsatz käme über die Tür – nicht freigegeben.";
  return "Kein passender Aufsatz für diese Auswahl.";
}
