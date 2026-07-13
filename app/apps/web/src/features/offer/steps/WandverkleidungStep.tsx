import { type ReactNode } from "react";
import { useOffer } from "../OfferContext";
import { StepHeader } from "./KundendatenStep";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

// 14 Wandverkleidung 3.0 colours. Names must match WV_COLOR_ARTICLE keys.
const WV_COLORS = [
  { name: "Weiß", img: "/assets/wv/weiss.jpg" },
  { name: "Marmor weiß", img: "/assets/wv/marmor-weiss.jpg" },
  { name: "Struktur weiß", img: "/assets/wv/struktur-weiss.jpg" },
  { name: "Stein beige", img: "/assets/wv/stein-beige.jpg" },
  { name: "Aragon grau", img: "/assets/wv/aragon-grau.jpg" },
  { name: "Stein grau", img: "/assets/wv/stein-grau.jpg" },
  { name: "Beton grau", img: "/assets/wv/beton-grau.jpg" },
  { name: "Beton grau metallic", img: "/assets/wv/beton-grau-metallic.jpg" },
  { name: "Aragon anthrazit", img: "/assets/wv/aragon-anthrazit.jpg" },
  { name: "Schiefer grau", img: "/assets/wv/schiefer-grau.jpg" },
  { name: "Schwarzwaldeiche Hell", img: "/assets/wv/schwarzwaldeiche-hell.jpg" },
  { name: "Stein anthrazit", img: "/assets/wv/stein-anthrazit.jpg" },
  { name: "Metall oxydant", img: "/assets/wv/metall-oxydant.jpg" },
  { name: "Sonderdekor", img: "/assets/wv/sonderdekor.jpg" },
];

const WV_KINDS = [
  { value: "Fliesenspiegel", label: "Bis Fliesenspiegel" },
  { value: "Fehlstellen", label: "Fehlstellen" },
  { value: "Deckenhoch", label: "Deckenhoch" },
  { value: "Innenraum-der-Kabine", label: "Innenraum der Kabine" },
  { value: "alle-Bad-Wände", label: "Alle Bad-Wände" },
  { value: "Keine", label: "Keine" },
];

export function WandverkleidungStep() {
  const { payload, patchSection } = useOffer();
  const wv = payload.wandverkleidung;
  const set = (patch: Record<string, any>) => patchSection("wandverkleidung", patch);
  const pc = wv.panelConfigs ?? { "997x2550": { color: "" }, "1497x2550": { color: "" } };
  const setColor = (size: string, color: string) =>
    set({ panelConfigs: { ...pc, [size]: { ...(pc[size] || {}), color } } });

  const needsSonder =
    pc["997x2550"]?.color === "Sonderdekor" || pc["1497x2550"]?.color === "Sonderdekor";

  return (
    <div className="space-y-8">
      <StepHeader title="Wandverkleidung" hint="Umfang, Plattenmaße mit Farbe und Profile wählen." />

      <Section title="Umfang">
        <div className="flex flex-wrap gap-2">
          {WV_KINDS.map((k) => (
            <button
              key={k.value}
              type="button"
              onClick={() => set({ wvKind: k.value })}
              className={cn(
                "rounded-md border px-3 py-1.5 text-sm transition-colors",
                wv.wvKind === k.value ? "border-primary bg-primary/10 text-primary" : "hover:bg-accent",
              )}
            >
              {k.label}
            </button>
          ))}
        </div>
      </Section>

      <PanelSize
        title="Platten 997 × 2550 mm"
        qty={wv.wvQty997 ?? ""}
        onQty={(v) => set({ wvQty997: v })}
        color={pc["997x2550"]?.color ?? ""}
        onColor={(c) => setColor("997x2550", c)}
      />
      <PanelSize
        title="Platten 1497 × 2550 mm"
        qty={wv.wvQty1497 ?? ""}
        onQty={(v) => set({ wvQty1497: v })}
        color={pc["1497x2550"]?.color ?? ""}
        onColor={(c) => setColor("1497x2550", c)}
      />

      {needsSonder && (
        <Section title="Sonderdekor">
          <Field label="Konfigurations-Nr. (Vigour Wall Configurator)">
            <Input
              value={wv.wvSonderConfigNr ?? ""}
              onChange={(e) => set({ wvSonderConfigNr: e.target.value })}
              placeholder="z. B. 123456"
            />
          </Field>
        </Section>
      )}

      {/* Profiles & accessories */}
      <Section title="Profile & Zubehör">
        <Toggle label="Wandabdichtung (TRWDSET5)" checked={!!wv.wvSealing} onChange={(v) => set({ wvSealing: v })} />

        <Toggle
          label="Flächenkleber (R_4260602) — automatisch aus Plattenzahl"
          checked={!!wv.flechenkleber}
          onChange={(v) => set({ flechenkleber: v })}
        />
        {wv.flechenkleber && (
          <SubQty label="Menge überschreiben (optional)" value={wv.wvFlachenQty ?? ""} onChange={(v) => set({ wvFlachenQty: v })} />
        )}

        <Toggle label="Abschlussprofil (V3A)" checked={!!wv.wvEndProfile} onChange={(v) => set({ wvEndProfile: v })} />
        {wv.wvEndProfile && (
          <SubQty label="Anzahl" value={wv.wvEndProfileQty ?? ""} onChange={(v) => set({ wvEndProfileQty: v })} />
        )}

        <Toggle label="Silikon (2000302)" checked={!!wv.wvSilikon} onChange={(v) => set({ wvSilikon: v })} />
        {wv.wvSilikon && (
          <SubQty label="Menge (mind. Abschlussprofile)" value={wv.wvSilikonQty ?? ""} onChange={(v) => set({ wvSilikonQty: v })} />
        )}
      </Section>

      <Section title="Verbindungsprofil (V3V)">
        <p className="text-xs text-muted-foreground">
          Automatisch: Plattenanzahl − 1 − Ecken. Menge optional überschreiben (0 = kein Profil).
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Ecken (Außenecken)">
            <Input inputMode="numeric" value={wv.wvCornersCount ?? ""} onChange={(e) => set({ wvCornersCount: e.target.value })} placeholder="0" />
          </Field>
          <Field label="Menge überschreiben (optional)">
            <Input inputMode="numeric" value={wv.wvV3VQty ?? ""} onChange={(e) => set({ wvV3VQty: e.target.value })} placeholder="auto" />
          </Field>
        </div>
      </Section>
    </div>
  );
}

function PanelSize({
  title,
  qty,
  onQty,
  color,
  onColor,
}: {
  title: string;
  qty: string;
  onQty: (v: string) => void;
  color: string;
  onColor: (c: string) => void;
}) {
  const active = (Number(qty) || 0) > 0;
  return (
    <Section title={title}>
      <div className="flex items-end gap-4">
        <Field label="Anzahl Platten" className="w-32">
          <Input inputMode="numeric" value={qty} onChange={(e) => onQty(e.target.value)} placeholder="0" />
        </Field>
      </div>
      {active && (
        <div className="space-y-2">
          <Label>Farbe</Label>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-7">
            {WV_COLORS.map((c) => {
              const sel = color === c.name;
              return (
                <button
                  key={c.name}
                  type="button"
                  onClick={() => onColor(c.name)}
                  title={c.name}
                  className={cn(
                    "overflow-hidden rounded-md border text-left transition-colors",
                    sel ? "border-primary ring-2 ring-primary" : "hover:border-primary/40",
                  )}
                >
                  <span className="block aspect-square overflow-hidden bg-white">
                    <img src={c.img} alt={c.name} className="size-full object-cover" loading="lazy" />
                  </span>
                  <span className={cn("block px-1.5 py-1 text-[11px] leading-tight", sel && "text-primary")}>
                    {c.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </Section>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={"space-y-1.5 " + (className ?? "")}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 rounded border-input accent-[hsl(var(--primary))]"
      />
      {label}
    </label>
  );
}

function SubQty({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2 pl-6">
      <Label className="normal-case">{label}</Label>
      <Input inputMode="numeric" value={value} onChange={(e) => onChange(e.target.value)} className="w-24" />
    </div>
  );
}
