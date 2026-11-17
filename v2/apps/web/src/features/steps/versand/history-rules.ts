// "Versandverlauf" — what really went out (UX-CHANGES U-015; today the add-on
// modules/web/addons/offer-record.js draws it): one line per send of this offer, newest first —
// when, how, to whom, whether it was signed, whether the documents are in Bitrix, and the stored
// document. A failed send is only shown while it is the latest one. A Bitrix filing that failed
// can be repeated from here (nothing is sent again).
// U-023 (owner 2026-11-17): the list holds the sends of the deal (all its offer numbers); a line
// of another offer number than the open one names it. Nothing sent: no list at all.
type Fields = Record<string, unknown>;
const obj = (v: unknown): Fields => (v && typeof v === "object" && !Array.isArray(v) ? (v as Fields) : {});
const str = (v: unknown) => String(v ?? "").trim();

const CHANNEL: Record<string, string> = { email: "per E-Mail", bitrix: "nur in Bitrix abgelegt", post: "per Post", onsite: "Unterschrift vor Ort", signlink: "Link zur Online-Unterschrift" };
const FILE: Record<string, string> = { offer: "Angebot ansehen", letter: "Brief ansehen", signed: "Unterschriebenes Dokument" };
export const when = (d: unknown): string => { const t = new Date(String(d ?? "")); return Number.isNaN(t.getTime()) ? "" : t.toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }); };

export interface Note { tone: "plain" | "ok" | "bad"; text: string }
export interface Line { id: string; when: string; /** the offer number when it is not the open one */ offer: string; how: string; notes: Note[]; retry: boolean; files: { label: string; href: string }[] }

/** the sends worth a line: every one but failed ones that are not the latest */
export const shownSends = (sends: readonly Fields[] | null | undefined): Fields[] => (sends ?? []).filter((s, i) => s.status !== "failed" || i === 0);
export function lineOf(s: Fields, current = ""): Line {
  const id = str(s.sendId), notes: Note[] = [], files: Line["files"] = [];
  let retry = false;
  if (s.status === "running") notes.push({ tone: "bad", text: "läuft noch …" });
  if (s.status === "failed") notes.push({ tone: "bad", text: `nicht versendet${str(s.error) ? `: ${str(s.error)}` : ""}` });
  if (s.status === "done") {
    if (s.signedAt) notes.push({ tone: "ok", text: `✓ unterschrieben am ${when(s.signedAt)}` });
    else if (s.signing && (s.channel === "onsite" || s.channel === "signlink")) notes.push({ tone: "plain", text: "noch nicht unterschrieben" });
    const filing = obj(obj(s.steps).bitrix).status;
    if (filing === "ok") notes.push({ tone: "ok", text: "✓ in Bitrix abgelegt" });
    if (filing === "failed") { notes.push({ tone: "bad", text: "Bitrix-Ablage fehlgeschlagen" }); retry = true; }
    for (const f of (Array.isArray(s.files) ? s.files : []) as Fields[]) { const label = FILE[str(f.role)]; if (label) files.push({ label, href: `/api/sends/${encodeURIComponent(id)}/files/${encodeURIComponent(str(f.fileId))}` }); }
  }
  const offer = str(s.offerNumber) && str(s.offerNumber) !== str(current) ? str(s.offerNumber) : "";
  return { id, when: when(s.finishedAt || s.startedAt), offer, how: `${CHANNEL[str(s.channel)] || str(s.channel)}${str(s.to) ? ` an ${str(s.to)}` : ""}`, notes, retry, files };
}
export const linesOf = (sends: readonly Fields[] | null | undefined, current = ""): Line[] => shownSends(sends).map((s) => lineOf(s, current));
export const TEXT = {
  refiled: "Die Unterlagen sind jetzt in Bitrix abgelegt.",
  refileFailed: "Die Ablage in Bitrix hat wieder nicht geklappt. Bitte versuchen Sie es später noch einmal.",
  offline: "Keine Verbindung. Bitte versuchen Sie es später noch einmal.",
} as const;
