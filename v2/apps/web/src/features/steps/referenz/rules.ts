// Referenzbilder (Vorher / Nachher) — rules, as today's referenzbilder.js does them.
//  - Reference material for the sales conversation, NOT part of the offer: nothing is stored,
//    nothing reaches a document, the mail or the price. The pages are outside Weiter / Zurück
//    (getFlowSteps in script.js) and have their own "Zurück zum Angebot".
//  - Which pages an offer type gets: Badumbau Vorher + Nachher (in that order), Badewannentür
//    Nachher only (STEPS in features/offer/steps.ts), the other types none.
//  - The photos depend on the offer type only (manifest[type][vorher|nachher]); no earlier step
//    (tray, wall covering …) changes the choice.
//  - Category chips only when there is more than one category; the chosen chip is kept per page
//    while the offer is open; a chip that no longer exists is dropped.
//  - The switch Vorher | Nachher only when the offer type has photos of both kinds.
//  - Vorher photos are numbered work steps ("3. Unterbau"): number on the photo, rest as caption.
//  - Thumbnails in the grid, the full photo in the large view; both under /assets/referenz.
export type Kind = "vorher" | "nachher";
export interface Photo { file: string; label: string }
export interface Project { projekt: string; kategorie: string; kategorieLabel: string; bilder: Photo[] }
export type Manifest = Record<string, { vorher?: Project[]; nachher?: Project[] }>;

export const KIND_OF_STEP: Record<string, Kind> = { referenzVorher: "vorher", referenzNachher: "nachher" };
export const STEP_OF_KIND: Record<Kind, string> = { vorher: "referenzVorher", nachher: "referenzNachher" };
export const TITLES: Record<Kind, string> = { vorher: "Vorher & Arbeitsschritte", nachher: "Nachher" };
export const BASE = "/assets/referenz";

export const projectsOf = (m: Manifest, type: string, kind: Kind): Project[] => m[type]?.[kind] ?? [];
export const hasKind = (m: Manifest, type: string, kind: Kind): boolean => !!m[type]?.[kind];

export interface Category { key: string; label: string; n: number }
export function categories(projects: Project[]): Category[] {
  const out = new Map<string, Category>();
  for (const p of projects) {
    const c = out.get(p.kategorie) ?? { key: p.kategorie, label: p.kategorieLabel, n: 0 };
    c.n += 1;
    out.set(p.kategorie, c);
  }
  return [...out.values()];
}
/** a chosen chip that no longer exists means "all" */
export const validFilter = (projects: Project[], filter: string | null): string | null =>
  filter && categories(projects).some((c) => c.key === filter) ? filter : null;
export const shownProjects = (projects: Project[], filter: string | null): Project[] =>
  filter ? projects.filter((p) => p.kategorie === filter) : projects;
export const photoCount = (projects: Project[]): number => projects.reduce((s, p) => s + p.bilder.length, 0);

export const photoUrl = (type: string, kind: Kind, file: string, thumb: boolean): string =>
  `${BASE}/${type}/${kind}/${thumb ? "thumbs/" : ""}${encodeURIComponent(file)}`;

/** Vorher labels start with the step number: "3. Unterbau" → number 3, caption "Unterbau" */
export function splitLabel(kind: Kind, label: string): { num: string | null; caption: string } {
  const num = kind === "vorher" ? /^(\d+)\./.exec(label)?.[1] ?? null : null;
  return { num, caption: num ? label.replace(/^\d+\.\s*/, "") : label };
}
/** every picture has an alt text, which is also the caption in the large view */
export const photoLabel = (p: Project, b: Photo): string => `Projekt ${p.projekt} · ${p.kategorieLabel} · ${b.label}`;

export const subline = (kind: Kind, projects: Project[]): string =>
  `${projects.length} ${projects.length === 1 ? "Projekt" : "Projekte"} · ${photoCount(projects)} Fotos${kind === "vorher" ? " · Ablauf in Schritten" : ""}`;
export const emptyText = (offerTitle: string, kind: Kind): string =>
  `Für ${offerTitle} sind noch keine ${kind === "vorher" ? "Vorher-" : "Nachher-"}Bilder hinterlegt.`;
