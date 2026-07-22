// Client for the offer document endpoints. Uses raw fetch (not the JSON api
// helper) because these return a PDF blob / accept multipart form-data.
import type { OfferPayload } from "./payload";

export interface SendOfferResult {
  ok: true;
  mode: "email" | "bitrix";
  messageId?: string;
  attachmentNames: string[];
  offerTotal: number;
  selfPayAmount: number;
  bitrixComment?: unknown;
  dealMove?: unknown;
  bitrixErrors?: string[];
}

async function jsonError(res: Response, fallback: string): Promise<never> {
  let msg = fallback;
  try {
    const d = await res.json();
    msg = d?.error || d?.detail || fallback;
  } catch {
    /* non-JSON body */
  }
  throw new Error(msg);
}

export const documentsApi = {
  // Branded email body HTML for the live compose preview.
  async emailPreview(body: string): Promise<string> {
    const res = await fetch("/api/documents/email.preview.html", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
    if (!res.ok) await jsonError(res, "Vorschau fehlgeschlagen");
    return res.text();
  },

  // Render the offer PDF and return it as a Blob (caller owns the object URL).
  async offerPdfBlob(payload: OfferPayload): Promise<Blob> {
    const res = await fetch("/api/documents/angebot.pdf", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) await jsonError(res, "PDF-Erstellung fehlgeschlagen");
    return res.blob();
  },

  // Render the offer PDF and open it in a new tab.
  async openPdf(payload: OfferPayload): Promise<void> {
    const url = URL.createObjectURL(await this.offerPdfBlob(payload));
    window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  },

  // Send the offer. mode "email" (default): customer email + Bitrix push + deal
  // move to "ANG verschickt". mode "bitrix": no email — push documents to the
  // Bitrix timeline + move the deal to "ANG schr. BB & Handwerk".
  async send(
    payload: OfferPayload,
    fields: { to: string; subject: string; body: string; excludePreset?: string[] },
    mode: "email" | "bitrix" = "email",
  ): Promise<SendOfferResult> {
    const fd = new FormData();
    fd.set("mode", mode);
    fd.set("to", fields.to);
    fd.set("subject", fields.subject);
    fd.set("body", fields.body);
    fd.set("offerNumber", payload.offerNumber || "");
    fd.set("payload", JSON.stringify(payload));
    fd.set("excludePreset", JSON.stringify(fields.excludePreset || []));
    const res = await fetch("/api/documents/angebot.send", {
      method: "POST",
      credentials: "same-origin",
      body: fd,
    });
    if (!res.ok) await jsonError(res, mode === "bitrix" ? "An Bitrix senden fehlgeschlagen" : "Senden fehlgeschlagen");
    return res.json();
  },
};
