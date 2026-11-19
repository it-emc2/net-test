// The variants of the open deal (ADR 027 A) and what the user does with them: switch, create,
// rename, delete. The list is asked only where it is shown (the selector when it opens, the
// Versand page) — opening an offer costs no extra request.
import { FIRST_VARIANT_ID, type DealVariant } from "@oc/api-contract";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { call } from "../../../shared/api/index.js";
import { dropSnapshot, flushDraft, type SaveStatus } from "./draft.js";
import { useOfferStore } from "./store.js";
import { snapshotKey } from "./variants.js";

export const variantsKey = (dealId: string | null) => ["variants", dealId] as const;

/** the open variant as a list row, for as long as the server's list is not known */
export function openAsRow(s: { variantId: string | null; variantName: string; offer: unknown; revision: number }): DealVariant {
  const id = s.variantId ?? FIRST_VARIANT_ID;
  return {
    variantId: id, name: s.variantName || (id === FIRST_VARIANT_ID ? "Variante 1" : "Variante"), offerType: String((s.offer as { activeOffer?: unknown } | null)?.activeOffer ?? ""),
    offerNumber: String((s.offer as { offerNumber?: unknown } | null)?.offerNumber ?? ""), status: "draft", sentAt: null, sentChannel: null, signedAt: null,
    total: null, revision: s.revision, updatedAt: "", notChosenAt: null, isDefault: true,
  };
}

/** the variants of the open deal; `enabled` false: not asked (yet) */
export function useVariants(enabled = true) {
  const dealId = useOfferStore((s) => s.dealId);
  const q = useQuery({
    queryKey: variantsKey(dealId), enabled: enabled && !!dealId, retry: false, staleTime: 5_000,
    queryFn: ({ signal }) => call("dealVariants", { params: { dealId: dealId! }, signal }),
  });
  const variants = q.data?.variants.length ? q.data.variants : null;
  return { query: q, variants };
}

/** after a send or hand-over (Versandverlauf asked again) the status in the list changes too */
export function useVariantsFollowSends(qc: QueryClient) {
  const dealId = useOfferStore((s) => s.dealId);
  const stamp = useOfferStore((s) => s.scratch.sendsStamp);
  useEffect(() => { if (stamp) void qc.invalidateQueries({ queryKey: variantsKey(dealId) }); }, [stamp, dealId, qc]);
}
export const useInvalidateVariants = () => { const qc = useQueryClient(); return () => qc.invalidateQueries({ queryKey: variantsKey(useOfferStore.getState().dealId) }); };

const bad = (s: SaveStatus) => s.state === "conflict" || s.state === "failed";
const why = (s: SaveStatus) => (s.state === "failed" ? s.message : s.state === "conflict" ? "Das Angebot wurde an anderer Stelle geändert." : "");

/** Before another variant is opened or one is copied: the open one is saved. null: saved. */
export async function saveOpen(force = false): Promise<string | null> {
  const s = useOfferStore.getState();
  // a new offer that was never saved: there is nothing on the server to copy yet
  if (force && s.offer && s.revision === 0 && s.version === s.savedVersion) useOfferStore.setState({ version: s.version + 1 });
  const r = await flushDraft();
  return bad(r) ? why(r) || "Speichern fehlgeschlagen." : null;
}

/** a new variant: a copy of the OPEN one (saved first) */
export async function createVariant(name: string): Promise<DealVariant> {
  const s = useOfferStore.getState();
  const r = await call("createDealVariant", { params: { dealId: s.dealId! }, body: { from: s.variantId ?? FIRST_VARIANT_ID, ...(name.trim() ? { name: name.trim() } : {}) } });
  return r.variant;
}

export async function renameVariant(variantId: string, name: string): Promise<DealVariant> {
  const s = useOfferStore.getState();
  const r = await call("renameDealVariant", { params: { dealId: s.dealId!, variantId }, body: { name: name.trim() } });
  if (useOfferStore.getState().variantId === variantId) useOfferStore.getState().setVariantName(r.variant.name);
  return r.variant;
}

/** delete a variant; deleting the open one: what is open next (the server's variant opened last) */
export async function deleteVariant(variantId: string): Promise<{ next: string | null }> {
  const s = useOfferStore.getState(), dealId = s.dealId!;
  const open = s.variantId === variantId;
  if (open) await flushDraft(); // nothing pending is sent to a deleted variant afterwards
  const r = await call("deleteDealVariant", { params: { dealId, variantId } });
  dropSnapshot(snapshotKey(dealId, variantId));
  if (!open) return { next: null };
  const now = useOfferStore.getState();
  if (now.dealId === dealId && now.variantId === variantId) now.saved(now.version, now.revision); // given up with the variant
  return { next: r.defaultVariantId ?? FIRST_VARIANT_ID };
}
