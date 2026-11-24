// One signature of a document: the drawing area and today's choices beside it — "Löschen",
// "Kopieren" / "Einfügen" (the same signature on the next document; kept in this page only),
// "Namen tippen statt zeichnen", "Bild hochladen". Ids as today's page (suffix "2" for the
// second signature of the Zusatzblatt), so the recordings of today's page play against it.
import { forwardRef, useImperativeHandle, useRef, useState, type ChangeEvent } from "react";
import { Button } from "../../shared/ui/button.js";
import { SignaturePad, type PadHandle } from "./SignaturePad.js";
import { fileToSignaturePng, typedNameToPng } from "./picture.js";
import { TEXT, fileProblem } from "./rules.js";

export interface FieldHandle { isFilled(): boolean; toPng(): string }
/** the copied signature, shared by every field of the page (never stored) */
export interface Clipboard { current: string | null }

type Mode = "draw" | "type" | "upload";
interface Props { suffix: string; clipboard: Clipboard; onError(message: string | null): void }

export const SignatureField = forwardRef<FieldHandle, Props>(function SignatureField({ suffix, clipboard, onError }, ref) {
  const pad = useRef<PadHandle>(null);
  const [mode, setMode] = useState<Mode>("draw");
  const [name, setName] = useState("");
  const [uploaded, setUploaded] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ copy?: string; paste?: string }>({});
  const file = useRef<HTMLInputElement>(null);

  const resetUpload = () => { setUploaded(null); if (file.current) file.current.value = ""; };
  const isFilled = () => (mode === "upload" ? !!uploaded : mode === "type" ? !!name.trim() : !!pad.current?.isDirty());
  const toPng = () => (mode === "upload" ? uploaded ?? "" : mode === "type" ? typedNameToPng(name.trim()) : pad.current?.toPng() ?? "");
  useImperativeHandle(ref, () => ({ isFilled, toPng }));

  const show = (which: "copy" | "paste", text: string) => {
    setFlash((f) => ({ ...f, [which]: text }));
    setTimeout(() => setFlash((f) => ({ ...f, [which]: undefined })), 1200);
  };
  const clear = () => {
    if (mode === "upload") resetUpload();
    else if (mode === "type") setName("");
    else pad.current?.clear();
  };
  const copy = () => {
    onError(null);
    if (!isFilled()) return onError(TEXT.copyFirst);
    clipboard.current = toPng();
    show("copy", TEXT.copied);
  };
  const paste = () => {
    onError(null);
    if (!clipboard.current) return onError(TEXT.nothingCopied);
    setMode("draw"); // a pasted signature always lands in the drawing area
    pad.current?.setFromDataUrl(clipboard.current);
    show("paste", TEXT.pasted);
  };
  const picked = (e: ChangeEvent<HTMLInputElement>) => {
    onError(null);
    const f = e.target.files?.[0];
    if (!f) return resetUpload();
    const problem = fileProblem(f);
    if (problem) { resetUpload(); return onError(problem); }
    fileToSignaturePng(f).then(setUploaded, (err: Error) => { resetUpload(); onError(err.message); });
  };
  const s = suffix;

  return (
    <div className="sign-field" data-testid={`signature${s}`}>
      <SignaturePad ref={pad} id={`sigCanvas${s}`} label={s ? TEXT.padLabel2 : TEXT.padLabel} />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="outline" id={`clearSig${s}`} onClick={clear}>{TEXT.clear}</Button>
        <Button variant="outline" id={`copySig${s}`} onClick={copy}>{flash.copy ?? TEXT.copy}</Button>
        <Button variant="outline" id={`pasteSig${s}`} onClick={paste}>{flash.paste ?? TEXT.paste}</Button>
        <Button variant="link" id={`toggleType${s}`} aria-expanded={mode === "type"} aria-controls={`typeWrap${s}`} onClick={() => setMode(mode === "type" ? "draw" : "type")}>
          {mode === "type" ? TEXT.drawInstead : TEXT.typeInstead}
        </Button>
        <Button variant="link" id={`toggleUpload${s}`} aria-expanded={mode === "upload"} aria-controls={`uploadWrap${s}`} onClick={() => setMode(mode === "upload" ? "draw" : "upload")}>
          {mode === "upload" ? TEXT.drawInstead : TEXT.upload}
        </Button>
      </div>
      <div id={`typeWrap${s}`} className="mt-3" hidden={mode !== "type"}>
        <label htmlFor={`typeName${s}`} className="block text-base text-[#333]">{TEXT.typeLabel}</label>
        <input
          id={`typeName${s}`} type="text" autoComplete="name" placeholder={TEXT.typePlaceholder} value={name} onChange={(e) => setName(e.target.value)}
          className="mt-1 min-h-12 w-full max-w-[340px] border-0 border-b border-black bg-transparent px-1 text-lg text-[#111] focus-visible:outline-2 focus-visible:outline-ring"
        />
      </div>
      <div id={`uploadWrap${s}`} className="mt-3" hidden={mode !== "upload"}>
        <label htmlFor={`sigUpload${s}`} className="block text-base text-[#333]">{TEXT.uploadLabel}</label>
        <input ref={file} id={`sigUpload${s}`} type="file" accept="image/*" onChange={picked} className="mt-1 min-h-12 text-base" />
        <img id={`sigPreview${s}`} hidden={!uploaded} src={uploaded ?? undefined} alt={TEXT.previewAlt} className="mt-3 block max-h-[140px] max-w-[320px] border border-[#aaa] bg-white p-1" />
      </div>
    </div>
  );
});
