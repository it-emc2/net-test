// „Versionen“: the list of the open offer's saved versions and what the user does with it
// (restore, and the two choices after a save was refused). The rules and texts are versions.ts.
import { ERROR_CODES, type DealDraftRevision } from "@oc/api-contract";
import { useQuery, type QueryClient } from "@tanstack/react-query";
import { ApiFailure, call } from "../../../shared/api/index.js";
import { flushDraft, reloadDraft } from "./draft.js";
import { useOfferStore } from "./store.js";
import { variantQuery } from "./variants.js";
import { TEXT } from "./versions.js";

export const versionsKey = (dealId: string | null, variantId: string | null) => ["versions", dealId, variantId] as const;

export interface VersionList {
  /** null: the server's versions could not be loaded (today: „Keine Verbindung …“) */
  revisions: DealDraftRevision[] | null;
  /** the version the draft stands at on the server; null: no draft yet */
  current: { revision: number; updatedAt: string | Date } | null;
}

const q = () => { const s = useOfferStore.getState(); const query = variantQuery(s); return { params: { dealId: s.dealId! }, ...(query ? { query } : {}) }; };

/** the list, asked each time the panel opens (as today: …/draft/revisions and …/draft) */
export function useVersionList(enabled: boolean) {
  const dealId = useOfferStore((s) => s.dealId);
  const variantId = useOfferStore((s) => s.variantId);
  return useQuery({
    queryKey: versionsKey(dealId, variantId), enabled: enabled && !!dealId, retry: false, staleTime: 0, gcTime: 0,
    queryFn: async ({ signal }): Promise<VersionList> => {
      const [list, draft] = await Promise.all([
        // as today: an answer without a list (404) is „no version yet“; no answer at all is „no connection“
        call("dealDraftRevisions", { ...q(), signal }).catch((err: unknown) => { if ((err as Error)?.name === "AbortError") throw err; return err instanceof ApiFailure && err.status === 404 ? { revisions: [] } : null; }),
        call("dealDraft", { ...q(), signal }).catch((err: unknown) => { if ((err as Error)?.name === "AbortError") throw err; return null; }),
      ]);
      return { revisions: list ? list.revisions : null, current: draft ? { revision: draft.revision, updatedAt: draft.updatedAt } : null };
    },
  });
}

/** `sentOffer`: refused because the version carries an older, already sent offer number (U-074) */
export type Outcome = { ok: true; message: string; detail?: string } | { ok: false; message: string; sentOffer?: string };

/**
 * „Wiederherstellen“: unsaved input is saved first as its own version (today it is replaced), then
 * the server writes the old content as a NEW version; the open offer is loaded again from it.
 * `onOtherType`: the restored version is an offer of another type → open it there.
 */
export async function restoreVersion(r: DealDraftRevision, onOtherType: (type: string) => void): Promise<Outcome> {
  const saved = await flushDraft();
  if (saved.state === "conflict") return { ok: false, message: TEXT.conflict };
  if (saved.state === "failed") return { ok: false, message: TEXT.notSaved(saved.message) };
  const s = useOfferStore.getState();
  if (!s.offer || !s.dealId) return { ok: false, message: TEXT.failed };
  try {
    await call("restoreDealDraft", { ...q(), body: { revision: r.revision, baseRevision: s.revision } });
  } catch (err) {
    if ((err as Error)?.name === "AbortError") throw err;
    if (err instanceof ApiFailure && err.code === ERROR_CODES.RESTORE_SENT_NUMBER) {
      const nr = String(err.detail.offerNumber ?? "").trim();
      return { ok: false, message: err.message || TEXT.sentRefused(nr), ...(nr ? { sentOffer: nr } : {}) };
    }
    // ADR 030: a version of another type cannot come back while the deal has several variants — the server says why
    if (err instanceof ApiFailure && err.code === ERROR_CODES.VARIANT_TYPE_MISMATCH && err.message) return { ok: false, message: err.message };
    return { ok: false, message: TEXT.failed };
  }
  const type = String(r.offerType ?? s.offer.activeOffer);
  if (type !== s.offer.activeOffer) { onOtherType(type); return { ok: true, message: TEXT.restored(r.revision) }; }
  if (!(await reloadDraft())) return { ok: false, message: TEXT.loadFailed };
  return { ok: true, message: TEXT.restored(r.revision), detail: TEXT.restoredAt(r.at) };
}

/** changed elsewhere: the state open here is saved on top of the newest version (nothing is lost — the other one stays a version) */
export async function keepMine(): Promise<Outcome> {
  const s = useOfferStore.getState();
  if (!s.offer || !s.dealId) return { ok: false, message: TEXT.failed };
  let newest: number;
  try { newest = (await call("dealDraft", q())).revision; } catch (err) {
    newest = err instanceof ApiFailure && err.status === 404 ? 0 : -1; // the draft is gone: the save starts it anew
  }
  if (newest < 0) return { ok: false, message: TEXT.failed };
  const now = useOfferStore.getState();
  useOfferStore.setState({ revision: newest, ...(now.version === now.savedVersion ? { version: now.version + 1 } : {}) });
  const r = await flushDraft();
  return r.state === "saved" ? { ok: true, message: TEXT.keptMine } : { ok: false, message: r.state === "failed" ? TEXT.notSaved(r.message) : TEXT.failed };
}

/** changed elsewhere: the newest version replaces the state open here */
export async function loadNewest(): Promise<Outcome> {
  return (await reloadDraft()) ? { ok: true, message: TEXT.loadedNewest } : { ok: false, message: TEXT.loadFailed };
}

export const refreshVersions = (qc: QueryClient) => qc.invalidateQueries({ queryKey: ["versions"] });
