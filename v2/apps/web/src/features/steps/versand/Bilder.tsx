// Product pictures for the mail and plan photos for Bitrix (ADR 026, phase 4; Angebotsversand
// slice 4b, part 2). The rules are pictures.ts. Nothing here is part of the offer: it is kept
// while the offer is open and goes out with the send.
import { Camera, Ruler } from "lucide-react";
import { useRef, useState } from "react";
import { ApiFailure, call, postForFile } from "../../../shared/api/index.js";
import { Button, cn } from "../../../shared/ui/index.js";
import { toast } from "../../../shared/ui/toaster.js";
import { useOfferStore } from "../../offer/index.js";
import { NO_PICTURES, fitted, hasPicture, isImage, isTicked, jpgName, leftOut, planName, quantity, withOwnPicture, withProducts, type PictureState, type Product } from "./pictures.js";
import { addFiles } from "./send-rules.js";

const st = () => useOfferStore.getState();
const offerNow = () => (st().offer ?? {}) as Record<string, unknown>;
export const picturesNow = (): PictureState => (st().scratch.productPictures as PictureState | undefined) ?? NO_PICTURES;
const setPictures = (change: (s: PictureState) => PictureState) => st().remember("productPictures", change(picturesNow()));

/** the tick was switched on: ask the server for the offer's products (every time, the offer may have changed) */
async function loadProducts() {
  try {
    const r = await call("productImageList", { body: { payload: offerNow() } });
    setPictures((s) => withProducts(s, (r.products ?? []) as Product[]));
  } catch (err) {
    // the server's "no" reads as an empty list today; only no connection is told as a failure
    setPictures((s) => (err instanceof ApiFailure && err.status > 0 ? withProducts(s, []) : { ...s, products: [], failed: true }));
  }
}
const readAsDataUrl = (file: File) => new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = () => reject(r.error); r.readAsDataURL(file); });

export function ProductPictures() {
  const s = (useOfferStore((x) => x.scratch.productPictures) as PictureState | undefined) ?? NO_PICTURES;
  const [busy, setBusy] = useState(false);
  const toggle = (on: boolean) => { setPictures((x) => ({ ...x, on })); if (on) void loadProducts(); };
  const preview = async () => {
    setBusy(true);
    try {
      const now = picturesNow();
      const file = await postForFile("/api/email/preview-product-image-pdf", { payload: offerNow(), excludeProductImageIds: leftOut(now), productCustomImageData: now.own });
      if (file.status === 204) { toast.info("Keine Produktbilder vorhanden."); return; }
      const url = URL.createObjectURL(file.blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch { toast.error("Fehler beim Generieren des PDFs."); }
    finally { setBusy(false); }
  };
  const products = s.products ?? [];
  return (
    <div className="grid gap-2" data-testid="zf-pictures">
      <label htmlFor="zf-pictures-on" className="flex min-h-12 cursor-pointer items-center gap-3">
        <input id="zf-pictures-on" type="checkbox" className="size-5 shrink-0 accent-[var(--primary)]" checked={s.on} onChange={(e) => toggle(e.target.checked)} />
        <span className="font-semibold">Produktbilder-PDF anhängen</span>
      </label>
      {s.on ? (
        <div className="grid gap-2" data-part="panel">
          <ul className="m-0 grid list-none gap-2 p-0">
            {products.map((p) => <ProductRow key={p.productId} p={p} s={s} />)}
          </ul>
          {s.products && !products.length ? <p className="m-0 text-[0.9rem] text-muted-foreground" data-part="hint">{s.failed ? "Fehler beim Laden der Produktliste." : "Keine Produkte mit Bild gefunden."}</p> : null}
          <div><Button variant="outline" disabled={busy} onClick={() => void preview()}>{busy ? "Lade…" : "PDF Vorschau"}</Button></div>
        </div>
      ) : null}
    </div>
  );
}

function ProductRow({ p, s }: { p: Product; s: PictureState }) {
  const input = useRef<HTMLInputElement>(null);
  const can = hasPicture(p, s), src = s.own[p.productId] || p.imageUrl || "";
  const own = async (file: File | undefined) => { if (!file) return; try { const url = await readAsDataUrl(file); setPictures((x) => withOwnPicture(x, p.productId, url)); } catch { toast.error("Das Bild konnte nicht gelesen werden."); } };
  return (
    <li data-testid="zf-picture-row" data-product={p.productId} data-picture={s.own[p.productId] ? "own" : src ? "catalogue" : ""} className={cn("flex min-h-14 items-center gap-3 rounded-lg border border-border bg-card px-3 py-1.5", !can && "opacity-70")}>
      {src ? <img src={src} alt="" className="size-12 shrink-0 rounded object-cover" /> : <span aria-hidden className="size-12 shrink-0 rounded bg-muted" />}
      <label className="flex min-h-12 min-w-0 flex-1 cursor-pointer items-center gap-3">
        <input type="checkbox" className="size-5 shrink-0 accent-[var(--primary)]" value={p.productId} checked={isTicked(p, s)} disabled={!can} onChange={(e) => setPictures((x) => ({ ...x, ticks: { ...x.ticks, [p.productId]: e.target.checked } }))} />
        <span className="grid min-w-0"><span className="truncate" title={p.name} data-part="name">{p.name}</span>{p.finish ? <span className="text-[0.85rem] text-muted-foreground" data-part="finish">{p.finish}</span> : null}</span>
      </label>
      <span className="shrink-0 text-[0.9rem] text-muted-foreground" data-part="qty">{quantity(p)}</span>
      <button type="button" title="Eigenes Bild" aria-label={`Eigenes Bild für ${p.name}`} onClick={() => input.current?.click()} className="grid size-12 shrink-0 cursor-pointer place-items-center rounded-lg border-2 border-input bg-card text-foreground"><Camera aria-hidden className="size-5" /></button>
      <input ref={input} type="file" accept="image/*" hidden onChange={(e) => { void own(e.target.files?.[0]); e.target.value = ""; }} />
    </li>
  );
}

/** a picture made smaller for Bitrix; what the browser cannot read (HEIC …) goes as it is */
async function smaller(file: File): Promise<File> {
  if (!isImage(file)) return file;
  try {
    const bitmap = await createImageBitmap(file), size = fitted(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = size.width; canvas.height = size.height;
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, size.width, size.height);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
    return blob ? new File([blob], jpgName(file.name), { type: "image/jpeg" }) : file;
  } catch { return file; }
}
/** pictures for the plan: made smaller, named, and put with the files for Bitrix only */
export async function addPlanFiles(files: readonly File[]): Promise<void> {
  const images = files.filter(isImage);
  if (!images.length) return;
  const day = new Date().toISOString().slice(0, 10), ready: File[] = [];
  for (const [i, f] of images.entries()) { const small = await smaller(f), name = planName(small.name, day, i + 1); ready.push(name === small.name ? small : new File([small], name, { type: small.type })); }
  st().remember("bitrixUploads", addFiles((st().scratch.bitrixUploads as File[] | undefined) ?? [], ready));
}

export function PlanPhotos() {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div role="button" tabIndex={0} aria-label="Grundriss oder Foto hinzufügen" data-testid="zf-plan"
      onClick={() => input.current?.click()} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.current?.click(); } }}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); void addPlanFiles(Array.from(e.dataTransfer.files)); }}
      onPaste={(e) => { const files = Array.from(e.clipboardData.files).filter(isImage); if (files.length) { e.preventDefault(); void addPlanFiles(files); } }}
      className={cn("flex min-h-16 cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed px-4 py-3", over ? "border-primary bg-accent-weak" : "border-input bg-card")}>
      <Ruler aria-hidden className="size-6 shrink-0 text-primary" />
      <span className="grid min-w-0 flex-1">
        <strong data-part="title">Grundriss / Fotos hinzufügen</strong>
        <span className="text-[0.9rem] text-muted-foreground" data-part="text">magicplan-Screenshot aus „Fotos“ wählen, Bild einfügen (⌘V) oder hier ablegen. Landet in der Bitrix-Timeline, nicht in der Kunden-E-Mail.</span>
      </span>
      <input ref={input} type="file" accept="image/*" multiple hidden data-testid="zf-plan-input" onClick={(e) => e.stopPropagation()} onChange={(e) => { void addPlanFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
    </div>
  );
}
