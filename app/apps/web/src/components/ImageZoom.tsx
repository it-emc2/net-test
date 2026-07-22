import { useState } from "react";
import { ZoomIn } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// A thumbnail that opens an enlarged view in a dialog (backdrop click, the X, or
// Escape closes it). Sizing is viewport-relative so it fits an 11" iPad Pro in
// both orientations.
export function ImageZoom({ src, alt = "", className }: { src: string; alt?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Bild vergrößern"
        className={cn("block size-full cursor-zoom-in", className)}
      >
        <img src={src} alt={alt} className="size-full object-contain" loading="lazy" />
      </button>

      <ZoomDialog src={src} alt={alt} open={open} setOpen={setOpen} />
    </>
  );
}

// A transparent overlay that covers an image frame (which must be `relative`) and
// enlarges the image on click. Clicking the image opens the dialog; the click does
// not bubble, so a surrounding selection tile still selects when clicked elsewhere.
// A <span> (not a <button>) so it stays valid HTML inside a selector <button>.
export function ZoomBadge({ src, alt = "" }: { src: string; alt?: string }) {
  const [open, setOpen] = useState(false);
  const openZoom = (e: { stopPropagation: () => void; preventDefault: () => void }) => {
    e.stopPropagation();
    e.preventDefault();
    setOpen(true);
  };
  return (
    <>
      <span
        role="button"
        tabIndex={0}
        aria-label="Bild vergrößern"
        onClick={openZoom}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") openZoom(e);
        }}
        className="group absolute inset-0 z-10 flex cursor-zoom-in items-start justify-end p-0.5"
      >
        <span className="flex size-5 items-center justify-center rounded-full bg-background/85 text-muted-foreground opacity-0 shadow-sm ring-1 ring-border transition-opacity group-hover:opacity-100">
          <ZoomIn className="size-3" />
        </span>
      </span>
      <ZoomDialog src={src} alt={alt} open={open} setOpen={setOpen} />
    </>
  );
}

function ZoomDialog({ src, alt, open, setOpen }: { src: string; alt: string; open: boolean; setOpen: (v: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="w-auto max-w-[92vw] gap-0 bg-white p-3 sm:max-w-3xl">
        <DialogTitle className="sr-only">{alt || "Bild"}</DialogTitle>
        <img src={src} alt={alt} className="mx-auto block max-h-[80dvh] w-auto max-w-full object-contain" />
      </DialogContent>
    </Dialog>
  );
}
