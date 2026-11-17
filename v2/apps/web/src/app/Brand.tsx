import { Link } from "react-router";

/** Logo + title: the left side of the header outside an offer. */
export function Brand() {
  return (
    <Link to="/" className="flex min-h-11 min-w-0 items-center gap-3 text-foreground no-underline">
      <img src="/assets/logo.png" alt="EmC2" className="h-8 w-auto rounded-md dark:bg-white dark:px-1.5 dark:py-0.5" />
      <span className="truncate text-lg font-bold">Angebotskonfigurator</span>
    </Link>
  );
}
