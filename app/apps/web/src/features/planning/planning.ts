import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

export interface PlanningEntry {
  id: number | string;
  name: string;
  address?: string;
  contactAddress?: { street?: string; postalCode?: string; city?: string };
  phone?: string;
  email?: string;
  importDealId?: number | string;
  bitrixContactId?: number | string;
  contactId?: number | string;
  duration?: number;
  manualStartMinutes?: number;
  plannedDate?: string;
  priority?: string;
  taetigkeitenBadge?: string;
  lockedSlot?: number;
  cancelled?: boolean;
  travelMinutesAfter?: number;
}

interface PlanningBody {
  planning?: { futurePlanned?: PlanningEntry[]; days?: { date?: string; customers?: PlanningEntry[] }[] };
}
type ActivityTimes = Record<string, { startMinutes: number | null }>;

const todayKey = () => new Date().toLocaleDateString("sv-SE");

/** Today's entries: prefer futurePlanned filtered to today, else the matching day.
 *  Enrich start times from Bitrix activities (by importDealId), sort by slot/name. */
function todaysEntries(body: PlanningBody, times: ActivityTimes): PlanningEntry[] {
  const pl = body?.planning || {};
  const key = todayKey();
  const fromFuture = (pl.futurePlanned || []).filter((c) => c?.plannedDate === key);
  const fromDay = pl.days?.find((d) => d?.date === key)?.customers || [];
  const list = fromFuture.length ? fromFuture : fromDay;
  return list
    .map((c) => {
      const t = c.importDealId != null ? times[String(c.importDealId)] : undefined;
      return t?.startMinutes != null ? { ...c, manualStartMinutes: t.startMinutes } : c;
    })
    .sort((a, b) => {
      const sa = Number.isFinite(Number(a.lockedSlot)) ? Number(a.lockedSlot) : Number.MAX_SAFE_INTEGER;
      const sb = Number.isFinite(Number(b.lockedSlot)) ? Number(b.lockedSlot) : Number.MAX_SAFE_INTEGER;
      return sa - sb || String(a.name || "").localeCompare(String(b.name || ""), "de");
    });
}

export function formatSlot(entry: PlanningEntry): string {
  const m = Number(entry.manualStartMinutes);
  if (!Number.isFinite(m) || m < 0) return "";
  const t = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  return entry.duration ? `${t} · ${entry.duration} min` : t;
}

/** Live today's-planning: snapshot + Bitrix time enrichment, refreshed on SSE events. */
export function useTodaysPlanning() {
  const [entries, setEntries] = useState<PlanningEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timesRef = useRef<ActivityTimes>({});

  const refresh = useCallback(async () => {
    try {
      const [body, act] = await Promise.all([
        api.get<PlanningBody>("/api/planning/current"),
        api.get<{ byDealId: ActivityTimes }>("/api/bitrix/activities/today").catch(() => ({ byDealId: {} })),
      ]);
      timesRef.current = act.byDealId || {};
      setEntries(todaysEntries(body, timesRef.current));
      setError(null);
    } catch (e: any) {
      setError(e?.message || "Planung nicht erreichbar");
      setEntries([]);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const es = new EventSource("/api/planning/stream");
    const onEvt = () => void refresh();
    es.addEventListener("planning", onEvt);
    es.onmessage = onEvt;
    es.onerror = () => es.close(); // fall back to snapshot; refresh button remains
    return () => es.close();
  }, [refresh]);

  return { entries, error, refresh };
}
