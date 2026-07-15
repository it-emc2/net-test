import type { DraftDetail, DraftListItem, DraftsListResponse, SaveDraftRequest } from "@emc2/shared";
import { api } from "@/lib/api";
import type { OfferPayload } from "./payload";

export const draftsApi = {
  save: (req: SaveDraftRequest) => api.post<DraftListItem>("/api/drafts", req),
  list: (params: { dealId?: string; offerType?: string; q?: string } = {}) => {
    const sp = new URLSearchParams();
    if (params.dealId) sp.set("dealId", params.dealId);
    if (params.offerType) sp.set("offerType", params.offerType);
    if (params.q) sp.set("q", params.q);
    const qs = sp.toString();
    return api.get<DraftsListResponse>(`/api/drafts${qs ? `?${qs}` : ""}`).then((r) => r.drafts);
  },
  get: (id: string) => api.get<DraftDetail>(`/api/drafts/${encodeURIComponent(id)}`),
  remove: (id: string) => api.delete<{ ok: true }>(`/api/drafts/${encodeURIComponent(id)}`),
};

/** Customer display name from the payload (firstName lastName, else company). */
export function customerNameFromPayload(p: OfferPayload): string {
  const k = p.Kundendaten || ({} as OfferPayload["Kundendaten"]);
  return `${k.firstName || ""} ${k.lastName || ""}`.trim();
}

/** Legacy-style auto name: ANG-BU-<Nachname|Firma>-DDMMYYYY-HHMMSS. */
export function autoDraftName(p: OfferPayload): string {
  const k = p.Kundendaten || ({} as OfferPayload["Kundendaten"]);
  const who = (k.lastName || k.firstName || "Kunde").trim().replace(/\s+/g, "");
  const d = new Date();
  const z = (n: number) => String(n).padStart(2, "0");
  const stamp = `${z(d.getDate())}${z(d.getMonth() + 1)}${d.getFullYear()}-${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}`;
  return `ANG-${String(p.offerType || "bu").toUpperCase()}-${who}-${stamp}`;
}
