// A place to add files: drag and drop, paste (⌘V) while the zone has the focus, or the button
// "Datei auswählen". No document/window listener — paste is taken on the zone itself.
import { Upload } from "lucide-react";
import { useState } from "react";
import { cn } from "../lib/cn.js";

export function DropZone({ id, title, hint, accept, onFiles, button = "Datei auswählen", ...rest }: {
  /** id of the hidden file input (the button is its label) */
  id: string; title: string; hint?: string; accept?: string; onFiles: (files: File[]) => void; button?: string; "data-testid"?: string;
}) {
  const [over, setOver] = useState(false);
  return (
    <div role="group" tabIndex={0} aria-label={title} {...rest} data-over={over ? "true" : "false"}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); const files = Array.from(e.dataTransfer.files); if (files.length) onFiles(files); }}
      onPaste={(e) => { const files = Array.from(e.clipboardData.files); if (files.length) { e.preventDefault(); onFiles(files); } }}
      className={cn("flex flex-wrap items-center gap-3 rounded-xl border-2 border-dashed px-4 py-3 outline-offset-2 focus-visible:outline-3 focus-visible:outline-ring",
        over ? "border-primary bg-accent-weak" : "border-input bg-card")}>
      <Upload aria-hidden className="size-6 shrink-0 text-primary" />
      <span className="grid min-w-0 flex-1 basis-56">
        <span className="font-semibold" data-part="title">{title}</span>
        {hint ? <span className="text-[0.95rem] text-muted-foreground" data-part="hint">{hint}</span> : null}
      </span>
      <label htmlFor={id} className="inline-flex min-h-12 shrink-0 cursor-pointer items-center rounded-lg border-2 border-primary bg-card px-4 font-semibold text-primary hover:bg-accent-weak">{button}</label>
      <input id={id} type="file" multiple accept={accept} hidden onChange={(e) => { const files = Array.from(e.target.files ?? []); e.target.value = ""; if (files.length) onFiles(files); }} />
    </div>
  );
}
