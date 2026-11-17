import { Link } from "react-router";

/** The logo on a light 40×40 tile: readable in light and dark mode. */
export function LogoTile() {
  return (
    <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-border bg-white" data-testid="logo-tile">
      <img src="/assets/logo.png" alt="EmC2" className="h-6 w-auto max-w-8 object-contain" />
    </span>
  );
}

/** Logo tile + two lines: the left side of the header outside an offer. */
export function Brand() {
  return (
    <Link to="/" className="flex min-h-11 min-w-0 items-center gap-3 text-foreground no-underline">
      <LogoTile />
      <span className="grid min-w-0 leading-tight">
        <span className="truncate text-lg font-bold">Angebotskonfigurator</span>
        <span className="truncate text-[0.8rem] text-muted-foreground">EmC² · Hauptmenü</span>
      </span>
    </Link>
  );
}
