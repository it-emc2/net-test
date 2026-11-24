// One document of the signing request. The document itself is the server's HTML (the same
// rendering as the signed PDF — its text, tick boxes, payment terms and editable fields are
// the legal document and stay exactly as the server sends them). The page puts its own
// controls into it: the signature fields and the submit button replace the server's
// placeholders (canvas, button row, typing / upload parts, submit row); the "Bearbeiten"
// buttons of the document unlock their section, as today. On submit the values are read
// from the document's own fields, as today's page does (signpage/app.js submitCurrent).
import { createPortal } from "react-dom";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Button } from "../../shared/ui/button.js";
import { SignatureField, type Clipboard, type FieldHandle } from "./SignatureField.js";
import { submitDocument, type SubmitAnswer } from "./api.js";
import { FIELD_NAMES, TEXT, missingFields, type SignDoc } from "./rules.js";

interface Mounts { sig: HTMLElement | null; sig2: HTMLElement | null; submit: HTMLElement | null; label: string }
const NONE: Mounts = { sig: null, sig2: null, submit: null, label: TEXT.submit };

/** a place for one of the page's controls, where the server's placeholder was (idempotent) */
function mountFor(root: HTMLElement, name: string, at: Element | null): HTMLElement | null {
  const have = root.querySelector<HTMLElement>(`[data-sign-mount="${name}"]`);
  if (have) return have;
  if (!at?.parentNode) return null;
  const m = document.createElement("div");
  m.dataset.signMount = name;
  at.parentNode.insertBefore(m, at);
  return m;
}
const drop = (el: Element | null | undefined) => el?.remove();

/** the server's signature placeholder (suffix "" or "2") → a mount for the page's signature field */
function takeSignature(root: HTMLElement, suffix: string): HTMLElement | null {
  const canvas = root.querySelector(`#sigCanvas${suffix}`);
  const mount = mountFor(root, `sig${suffix}`, canvas);
  if (canvas) {
    const row = canvas.nextElementSibling;
    if (row?.classList.contains("si-btnrow")) drop(row);
    drop(canvas);
    drop(root.querySelector(`#typeWrap${suffix}`));
    drop(root.querySelector(`#uploadWrap${suffix}`));
  }
  return mount;
}

export function DocumentView({ token, doc, html, clipboard, onSigned }: {
  token: string; doc: SignDoc; html: string; clipboard: Clipboard; onSigned(answer: SubmitAnswer): void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const primary = useRef<FieldHandle>(null);
  const secondary = useRef<FieldHandle>(null);
  const [mounts, setMounts] = useState<Mounts>(NONE);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inner = useMemo(() => ({ __html: html }), [html]);

  useLayoutEffect(() => {
    const root = box.current;
    if (!root) return;
    const submitBtn = root.querySelector("#submitBtn:not([data-sign-own])");
    const submit = mountFor(root, "submit", submitBtn?.closest(".si-btnrow") ?? null);
    if (submit && submitBtn) submit.dataset.label = submitBtn.textContent?.trim() || TEXT.submit; // the document's own wording
    const label = submit?.dataset.label || TEXT.submit;
    if (submitBtn) { drop(submitBtn.closest(".si-btnrow")); drop(root.querySelector("#docError")); }
    setMounts({ sig: takeSignature(root, ""), sig2: takeSignature(root, "2"), submit, label });

    // fields the document labels only by their key (or not at all): a German name for screen readers
    root.querySelectorAll<HTMLInputElement>("input[data-edit-field]").forEach((i) => {
      const key = i.getAttribute("data-edit-field") || "";
      const own = i.closest(".fld")?.querySelector(".fld-label")?.textContent?.trim();
      const aria = i.getAttribute("aria-label");
      if (!aria || aria === key) i.setAttribute("aria-label", own || FIELD_NAMES[key] || key);
    });

    // "✎ Bearbeiten" unlocks the fields of its section, "✓ Fertig" locks them again (today's rule)
    const toggles = [...root.querySelectorAll<HTMLButtonElement>(".edit-toggle")];
    const onToggle = (e: Event) => {
      const btn = e.currentTarget as HTMLButtonElement;
      const sec = btn.closest(".editsec") || root;
      const editing = btn.getAttribute("data-editing") !== "1";
      sec.querySelectorAll<HTMLInputElement>('[data-edit-field], input[name="pflegegrad"]').forEach((i) => { i.disabled = !editing; });
      btn.setAttribute("data-editing", editing ? "1" : "0");
      btn.setAttribute("aria-pressed", String(editing));
      btn.textContent = editing ? TEXT.editing : TEXT.edit;
    };
    toggles.forEach((t) => { t.type = "button"; t.addEventListener("click", onToggle); });
    return () => toggles.forEach((t) => t.removeEventListener("click", onToggle));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [html]);

  const submit = async () => {
    const root = box.current;
    if (!root || busy) return;
    setError(null);
    const extraFields: Record<string, unknown> = {};
    if (root.querySelector('input[name="paymentTerm"]')) {
      const checked = root.querySelector<HTMLInputElement>('input[name="paymentTerm"]:checked');
      if (!checked) return setError(TEXT.choosePayment);
      extraFields.paymentTermIdx = Number(checked.value);
    }
    const tick = (id: string, as: string) => { const el = root.querySelector<HTMLInputElement>(`#${id}`); if (el) extraFields[as] = el.checked; };
    tick("entlastungCheckbox", "entlastungsguthaben");
    tick("budgetWuMCheckbox", "budgetWuM");
    tick("rechnungPostCheckbox", "rechnungPost");
    tick("rechnungEmailCheckbox", "rechnungEmail");

    const editedFields: Record<string, string> = {};
    root.querySelectorAll<HTMLInputElement>("[data-edit-field]").forEach((i) => { editedFields[i.getAttribute("data-edit-field")!] = (i.value || "").trim(); });
    const pg = root.querySelector<HTMLInputElement>('input[name="pflegegrad"]:checked');
    if (pg) editedFields.pflegegrad = pg.value;
    const missing = missingFields(doc.key, editedFields);
    if (missing.length) return setError(TEXT.fillAll + missing.join(", "));

    if (!primary.current?.isFilled()) return setError(TEXT.signHere);
    const signatureImage = primary.current.toPng();
    if (mounts.sig2 && (editedFields.bevollmaechtigterName || "").trim()) {
      if (!secondary.current?.isFilled()) return setError(TEXT.secondSigner);
      extraFields.bevollmaechtigterSignature = secondary.current.toPng();
    }

    setBusy(true);
    try {
      const answer = await submitDocument(token, doc.key, { signatureImage, extraFields, editedFields });
      onSigned(answer);
    } catch (e) {
      setError((e as Error).message || TEXT.submitFailed);
      setBusy(false);
    }
  };

  return (
    <div className="sign-doc" data-testid="sign-document">
      <div ref={box} dangerouslySetInnerHTML={inner} />
      {mounts.sig ? createPortal(<SignatureField ref={primary} suffix="" clipboard={clipboard} onError={setError} />, mounts.sig) : null}
      {mounts.sig2 ? createPortal(<SignatureField ref={secondary} suffix="2" clipboard={clipboard} onError={setError} />, mounts.sig2) : null}
      {mounts.submit ? createPortal(
        <div className="mt-6">
          <Button size="lg" id="submitBtn" data-sign-own="" disabled={busy} onClick={() => void submit()} className="w-full sm:w-auto">
            {busy ? TEXT.submitting : mounts.label}
          </Button>
          <div id="docError" role="alert" hidden={!error} className="mt-3 whitespace-pre-line border border-[#b71c1c] bg-[#fdecea] px-3 py-2.5 text-base text-[#7f1d1d]">{error}</div>
        </div>,
        mounts.submit,
      ) : null}
    </div>
  );
}
