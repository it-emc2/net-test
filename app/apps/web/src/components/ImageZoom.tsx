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

// A small magnifier badge to drop inside an existing image frame (which must be
// `relative`). Enlarges the image without hijacking the frame's own click, so it
// works even when the image lives inside a selection tile. Place next to the <img>.
export function ZoomBadge({ src, alt = "" }: { src: string; alt?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setOpen(true);
        }}
        aria-label="Bild vergrößern"
        className="absolute right-0.5 top-0.5 z-10 flex size-5 items-center justify-center rounded-full bg-background/85 text-muted-foreground shadow-sm ring-1 ring-border transition-colors hover:text-primary"
      >
        <ZoomIn className="size-3" />
      </button>
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
