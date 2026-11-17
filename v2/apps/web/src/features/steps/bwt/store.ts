// The step's writes: the fields and the document lines made again, in one change (shared by the
// sections of the step).
import { useOfferStore } from "../../offer/index.js";
import { materialsOf, withInfo } from "./rules.js";

export type Fields = Record<string, unknown>;
export const useBwt = () => useOfferStore((s) => ((s.offer as Record<string, Fields> | null)?.bwt ?? {}) as Fields);
export const str = (v: unknown) => (v == null ? "" : String(v));
/** write a change of the step: the fields and the document lines made again, in one change */
export const write = (change: (b: Fields) => Fields) => {
  const store = useOfferStore.getState(), b = ((store.offer as Record<string, Fields> | null)?.bwt ?? {}) as Fields;
  const fields = withInfo(b, change(b)), next = { ...b, ...fields };
  for (const k of Object.keys(fields)) if (fields[k] === undefined) delete next[k];
  store.patch("bwt" as never, fields as never);
  const materials = materialsOf(next);
  if (materials && JSON.stringify(materials) !== JSON.stringify((store.offer as Fields | null)?.materials)) useOfferStore.getState().setTop({ materials });
};
export const set = (field: string, value: string) => write(() => ({ [field]: value }));
