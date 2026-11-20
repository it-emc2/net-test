// The header while an offer is open (own chunk with the offer model): burger (opens the step list),
// who/what is open (customer; type · deal · offer number). Outside an offer it shows the brand.
import { Menu } from "lucide-react";
import { Brand } from "../../app/Brand.js";
import { OFFER_TITLES } from "./steps.js";
import { useNav, useWide } from "./model/nav.js";
import { useOfferField, useOfferStore } from "./model/store.js";
import { VariantSwitch } from "./VariantSwitch.js";

const who = (last: string, first: string) => [last.trim(), first.trim()].filter(Boolean).join(", ");
/** line 1: "<Nachname>, <Vorname>"; without a customer the offer type */
export function offerLine(type: string, last: string, first: string): string {
  return who(last, first) || (OFFER_TITLES[type as keyof typeof OFFER_TITLES] ?? type);
}
/** line 2: "<Art> · Deal <id> · <ANG>"; the type only when line 1 is the customer; temporary keys and empty parts are left out */
export function dealLine(type: string, last: string, first: string, dealId: string | null, offerNumber: string): string {
  const art = who(last, first) ? (OFFER_TITLES[type as keyof typeof OFFER_TITLES] ?? type) : "";
  return [art, dealId && !dealId.startsWith("t-") ? `Deal ${dealId}` : "", offerNumber.trim()].filter(Boolean).join(" · ");
}

/** the offer's name and numbers — header and drawer show the same two lines */
export function useOfferLines() {
  const type = useOfferStore((s) => String(s.offer?.activeOffer ?? ""));
  const dealId = useOfferStore((s) => s.dealId);
  const number = useOfferStore((s) => String((s.offer as { offerNumber?: unknown } | null)?.offerNumber ?? ""));
  const first = useOfferField<string>("Kundendaten", "firstName") ?? "";
  const last = useOfferField<string>("Kundendaten", "lastName") ?? "";
  return { line1: offerLine(type, last, first), line2: dealLine(type, last, first, dealId, number) };
}

export function HeaderLeft() {
  const open = useOfferStore((s) => s.offer !== null);
  const { line1, line2 } = useOfferLines();
  const wide = useWide();
  const { drawer, sidebar, setDrawer, toggleSidebar } = useNav();
  if (!open) return <Brand />;
  return (
    <div className="flex min-w-0 items-center gap-3">
      <button
        id="offer-burger" type="button" aria-label="Schritte öffnen" aria-expanded={wide ? sidebar : drawer}
        onClick={() => (wide ? toggleSidebar() : setDrawer(true))}
        className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-lg border border-border bg-card text-foreground hover:bg-muted"
      ><Menu aria-hidden className="size-5" /></button>
      <div className="min-w-0 leading-tight">
        <p className="m-0 truncate font-bold" data-testid="header-offer">{line1}</p>
        {line2 ? <p className="m-0 truncate text-[0.8rem] text-muted-foreground" data-testid="header-deal">{line2}</p> : null}
      </div>
      <VariantSwitch />
    </div>
  );
}
