import { useState } from "react";
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-auto max-w-[92vw] gap-0 bg-white p-3 sm:max-w-3xl">
          <DialogTitle className="sr-only">{alt || "Bild"}</DialogTitle>
          <img src={src} alt={alt} className="mx-auto block max-h-[80dvh] w-auto max-w-full object-contain" />
        </DialogContent>
      </Dialog>
    </>
  );
}
