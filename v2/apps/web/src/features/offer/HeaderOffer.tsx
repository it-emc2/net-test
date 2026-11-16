// The header while an offer is open (own chunk with the offer model): home button, what is open
// (type · customer, deal · offer number) and how saving stands. Outside an offer it shows the brand.
import { Home } from "lucide-react";
import { Link } from "react-router";
import { Brand } from "../../app/Brand.js";
import { OFFER_TITLES } from "./steps.js";
import { useOfferField, useOfferStore } from "./model/store.js";

/** "<Art> · <Nachname>, <Vorname>"; empty parts are left out */
export function offerLine(type: string, last: string, first: string): string {
  const who = [last.trim(), first.trim()].filter(Boolean).join(", ");
  return [OFFER_TITLES[type as keyof typeof OFFER_TITLES] ?? type, who].filter(Boolean).join(" · ");
}
/** "Deal <id> · <ANG>"; temporary keys and empty parts are left out */
export function dealLine(dealId: string | null, offerNumber: string): string {
  return [dealId && !dealId.startsWith("t-") ? `Deal ${dealId}` : "", offerNumber.trim()].filter(Boolean).join(" · ");
}

export function HeaderLeft() {
  const open = useOfferStore((s) => s.offer !== null);
  const type = useOfferStore((s) => String(s.offer?.activeOffer ?? ""));
  const dealId = useOfferStore((s) => s.dealId);
  const number = useOfferStore((s) => String((s.offer as { offerNumber?: unknown } | null)?.offerNumber ?? ""));
  const first = useOfferField<string>("Kundendaten", "firstName") ?? "";
  const last = useOfferField<string>("Kundendaten", "lastName") ?? "";
  if (!open) return <Brand />;
  const sub = dealLine(dealId, number);
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Link to="/" aria-label="Hauptmenü" className="grid size-11 shrink-0 place-items-center rounded-full border border-border bg-card text-foreground hover:bg-muted"><Home aria-hidden className="size-5" /></Link>
      <div className="min-w-0 leading-tight">
        <p className="m-0 truncate font-bold" data-testid="header-offer">{offerLine(type, last, first)}</p>
        {sub ? <p className="m-0 truncate text-[0.8rem] text-muted-foreground" data-testid="header-deal">{sub}</p> : null}
      </div>
    </div>
  );
}
