// Client for the offer document endpoints. Uses raw fetch (not the JSON api
// helper) because these return a PDF blob / accept multipart form-data.
import type { OfferPayload } from "./payload";

export interface SendOfferResult {
  ok: true;
  messageId: string;
  attachmentNames: string[];
  offerTotal: number;
  selfPayAmount: number;
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

  // Render the offer PDF and open it in a new tab.
  async openPdf(payload: OfferPayload): Promise<void> {
    const res = await fetch("/api/documents/angebot.pdf", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) await jsonError(res, "PDF-Erstellung fehlgeschlagen");
    const url = URL.createObjectURL(await res.blob());
    window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  },

  // Send the offer by email (PDF + presets attached server-side).
  async send(
    payload: OfferPayload,
    fields: { to: string; subject: string; body: string; excludePreset?: string[] },
  ): Promise<SendOfferResult> {
    const fd = new FormData();
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
    if (!res.ok) await jsonError(res, "Senden fehlgeschlagen");
    return res.json();
  },
};
