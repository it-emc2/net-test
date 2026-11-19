// „Auf diesem Gerät gespeichert“ (U-016). Synced drafts open here; a draft that only exists on the
// device (waiting / conflict) opens in today's UI, which still writes the device copy.
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { call } from "../../shared/api/index.js";
import { useState } from "react";
import { useNavigate } from "react-router";
import { Button, Card, CardTitle } from "../../shared/ui/index.js";
import { deviceDrafts, removeDeviceDraft } from "./device.js";
import { draftState, isTempKey, shownDrafts, type DeviceDraft } from "./rules.js";

const TYPE_DE: Record<string, string> = { bu: "Badumbau", bwt: "Badewannentür", hl: "Handlauf", bl: "Badelift", ah: "Alltagshilfe" };
const when = (t?: number) => (t ? new Date(t).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");

export function DeviceDrafts() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const [confirm, setConfirm] = useState("");
  const q = useQuery({ queryKey: ["device-drafts"], queryFn: deviceDrafts, staleTime: 0, gcTime: 0 });
  const shown = shownDrafts(q.data ?? []);
  // ADR 027 A: a deal with several variants — the device copy is of the variant today's UI edits
  // (the one opened last), and the line names it
  const deals = [...new Set(shown.filter((r) => !isTempKey(r.key)).map((r) => r.key))];
  const lists = useQueries({ queries: deals.map((d) => ({ queryKey: ["variants", d], staleTime: 30_000, retry: false, queryFn: ({ signal }: { signal: AbortSignal }) => call("dealVariants", { params: { dealId: d }, signal }) })) });
  const variantName = (key: string) => {
    const l = lists[deals.indexOf(key)]?.data;
    return l && l.variants.length > 1 ? (l.variants.find((v) => v.isDefault) ?? l.variants[0])?.name ?? "" : "";
  };
  if (!shown.length) return null;
  const pending = shown.filter((r) => r.dirty || r.conflict).length;
  const del = async (r: DeviceDraft) => {
    if (r.dirty && confirm !== r.key) { setConfirm(r.key); return; } // unsent: ask once, in the page
    await removeDeviceDraft(r.key).catch(() => undefined);
    setConfirm("");
    await qc.invalidateQueries({ queryKey: ["device-drafts"] });
  };
  return (
    <Card data-testid="device-drafts">
      <CardTitle>Auf diesem Gerät gespeichert</CardTitle>
      <p className="m-0 text-muted-foreground">
        {pending ? `${pending} ${pending === 1 ? "Entwurf wartet" : "Entwürfe warten"} noch auf die Übertragung. Das geschieht von selbst, sobald das Internet da ist.` : "Zuletzt bearbeitet. Lässt sich auch ohne Internet öffnen."}
      </p>
      <ul className="m-0 grid list-none gap-2 p-0">
        {shown.map((r) => {
          const variant = variantName(r.key);
          const label = `${TYPE_DE[r.offerType ?? ""] ?? r.offerType} · ${r.title || "ohne Namen"} · ${isTempKey(r.key) ? "ohne Deal-Nummer" : `Deal ${r.key}`}${variant ? ` · Variante „${variant}“` : ""} · ${when(r.localAt)}`;
          const onlyHere = r.dirty || r.conflict;
          return (
            <li key={r.key} data-testid="device-draft" className="flex flex-wrap items-center gap-2 border-t border-border pt-2">
              <span className="min-w-60 flex-1">{label}</span>
              <strong>{draftState(r)}</strong>
              {onlyHere ? <Button asChild variant="secondary"><a href="/">Öffnen</a></Button>
                : <Button onClick={() => nav(`/deal/${r.key}/${r.offerType}`)}>Öffnen</Button>}
              <Button variant="secondary" aria-label={`Vom Gerät löschen: ${label}`} onClick={() => void del(r)}>
                {confirm === r.key ? "Wirklich löschen (nicht übertragen)" : "✕"}
              </Button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
