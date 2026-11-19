// Referenzbilder (Vorher / Nachher): photos of finished and in-progress jobs to show the customer.
// Display only — nothing is stored in the offer (rules and today's behaviour: rules.ts). The large
// view is the shared Lightbox. Only the thumbnails of what is on screen are loaded (lazy).
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { Card, CardTitle, Lightbox, cn } from "../../../shared/ui/index.js";
import { OFFER_TITLES, firstStep, useOfferStore } from "../../offer/index.js";
import { MANIFEST } from "./manifest.js";
import { KIND_OF_STEP, STEP_OF_KIND, TITLES, categories, emptyText, hasKind, photoLabel, photoUrl, projectsOf, shownProjects, splitLabel, subline, validFilter, type Kind, type Manifest } from "./rules.js";

/** where "Zurück zum Angebot" leads: the step the user came from (kept by the frame), else the first */
export const RETURN_KEY = "referenz:from";
const filterKey = (kind: Kind) => `referenz:filter:${kind}`;
const pill = "inline-flex min-h-12 items-center rounded-lg px-4 font-semibold";

function Page({ kind, manifest = MANIFEST }: { kind: Kind; manifest?: Manifest }) {
  const { dealId = "", type = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const remember = useOfferStore((s) => s.remember);
  const filterRaw = useOfferStore((s) => s.scratch[filterKey(kind)]) as string | null | undefined;
  const from = useOfferStore((s) => s.scratch[RETURN_KEY]) as string | undefined;
  const [open, setOpen] = useState<number | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const base = `/deal/${dealId}/${type}`;
  const offerTitle = (OFFER_TITLES as Record<string, string>)[type] ?? "dieses Angebot";

  const projects = projectsOf(manifest, type, kind);
  const filter = validFilter(projects, filterRaw ?? null);
  const shown = shownProjects(projects, filter);
  const cats = categories(projects);
  const other: Kind = kind === "vorher" ? "nachher" : "vorher";
  const twins = useMemo(() => new Map(projectsOf(manifest, type, other).map((p) => [p.projekt, p])), [manifest, type, other]);
  // the large view shows exactly the visible photos, in the visible order
  const photos = useMemo(() => shown.flatMap((p) => p.bilder.map((b) => ({ src: photoUrl(type, kind, b.file, false), label: photoLabel(p, b) }))), [shown, type, kind]);

  // jumped here from the twin page: scroll to that project and flash it once
  const target = (location.state as { projekt?: string } | null)?.projekt;
  useEffect(() => {
    if (!target) return;
    const card = root.current?.querySelector<HTMLElement>(`[data-projekt="${CSS.escape(target)}"]`);
    card?.scrollIntoView?.({ block: "start" });
    setFlash(target);
    const t = setTimeout(() => setFlash(null), 1600);
    return () => clearTimeout(t);
  }, [target]);

  let index = 0; // running number over the visible photos, for the large view
  return (
    <Card data-testid={`ref-${kind}`} aria-labelledby="ref-title">
      <div ref={root} className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button type="button" data-testid="ref-back" onClick={() => navigate(`${base}/${from ?? firstStep(type as never)}`)} className={cn(pill, "gap-1 border-0 bg-transparent pl-2 text-primary hover:bg-accent-weak")}>
            <ChevronLeft aria-hidden className="size-5" />Zurück zum Angebot
          </button>
          {hasKind(manifest, type, other) ? (
            <div role="tablist" aria-label="Bildart" className="inline-flex gap-1 rounded-xl border border-border bg-muted p-1">
              {(["vorher", "nachher"] as const).map((k) => (
                <button key={k} type="button" role="tab" aria-selected={k === kind} onClick={() => { if (k !== kind) navigate(`${base}/${STEP_OF_KIND[k]}`); }}
                  className={cn("min-h-12 min-w-28 cursor-pointer rounded-lg border-0 px-4 font-semibold", k === kind ? "bg-card text-foreground shadow-sm" : "bg-transparent text-muted-foreground")}>
                  {k === "vorher" ? "Vorher" : "Nachher"}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div>
          <CardTitle id="ref-title">{TITLES[kind]} <span className="font-normal text-muted-foreground">· {offerTitle}</span></CardTitle>
          <p data-testid="ref-sub" className="m-0 text-muted-foreground">{subline(kind, shown)}</p>
        </div>
        {cats.length > 1 ? (
          <div role="toolbar" aria-label="Kategorie filtern" className="flex flex-wrap gap-2">
            {[{ key: "", label: "Alle", n: projects.length }, ...cats].map((c) => {
              const on = (filter ?? "") === c.key;
              return (
                <button key={c.key} type="button" aria-pressed={on} data-chip={c.key} onClick={() => remember(filterKey(kind), c.key || null)}
                  className={cn("inline-flex min-h-12 cursor-pointer items-center gap-2 rounded-full border px-4 font-medium", on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground")}>
                  {c.label}<span className="rounded-full bg-accent-weak px-2 text-[0.85rem] font-bold text-foreground">{c.n}</span>
                </button>
              );
            })}
          </div>
        ) : null}
        {!projects.length ? (
          <p data-testid="ref-empty" className="m-0 rounded-lg border-2 border-dashed border-border p-10 text-center text-muted-foreground">{emptyText(offerTitle, kind)}</p>
        ) : (
          <div className={cn("grid gap-4", kind === "nachher" ? "grid-cols-[repeat(auto-fill,minmax(min(100%,26rem),1fr))]" : "grid-cols-1")}>
            {shown.map((p) => {
              const twin = twins.get(p.projekt);
              return (
                <article key={p.projekt} data-projekt={p.projekt} className={cn("grid scroll-mt-40 content-start gap-3 rounded-xl border border-border bg-card p-3", flash === p.projekt && "ring-4 ring-primary")}>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="m-0 text-[1.05rem]">Projekt {p.projekt}</h3>
                    <span className="rounded-full bg-accent-weak px-3 text-[0.9rem] font-semibold">{p.kategorieLabel}</span>
                  </div>
                  <div className={cn("grid gap-3", kind === "nachher" ? "grid-cols-2" : "grid-cols-[repeat(auto-fill,minmax(12rem,1fr))]")}>
                    {p.bilder.map((b) => {
                      const i = index++;
                      const { num, caption } = splitLabel(kind, b.label);
                      return (
                        <figure key={b.file} className="m-0 min-w-0">
                          <button type="button" data-photo={i} aria-label={`${photoLabel(p, b)} – vergrößern`} onClick={() => setOpen(i)}
                            className="relative block aspect-[3/4] w-full cursor-zoom-in overflow-hidden rounded-lg border-0 bg-muted p-0">
                            <img src={photoUrl(type, kind, b.file, true)} alt={photoLabel(p, b)} loading="lazy" decoding="async" className="size-full object-cover" />
                            {num ? <span aria-hidden className="absolute left-2 top-2 grid h-8 min-w-8 place-items-center rounded-full bg-black/60 px-2 text-[0.95rem] font-bold text-white">{num}</span> : null}
                          </button>
                          {kind === "vorher" ? <figcaption className="mt-1.5 text-[0.95rem] text-muted-foreground">{caption}</figcaption> : null}
                        </figure>
                      );
                    })}
                  </div>
                  {twin ? (
                    <div className="flex justify-end">
                      <button type="button" data-testid="ref-twin" onClick={() => { remember(filterKey(other), null); navigate(`${base}/${STEP_OF_KIND[other]}`, { state: { projekt: p.projekt } }); }}
                        className="inline-flex min-h-12 cursor-pointer items-center gap-1 border-0 bg-transparent px-3 font-semibold text-primary">
                        {kind === "vorher" ? "Ergebnis ansehen" : `Arbeitsschritte ansehen (${twin.bilder.length})`}<ChevronRight aria-hidden className="size-5" />
                      </button>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </div>
      {open != null ? <Lightbox images={photos} start={open} onClose={() => setOpen(null)} testId="ref-lightbox" /> : null}
    </Card>
  );
}

export const ReferenzVorher = () => <Page kind="vorher" />;
export const ReferenzNachher = () => <Page kind="nachher" />;
export { Page as ReferenzPage, KIND_OF_STEP };
