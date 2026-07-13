import { Construction } from "lucide-react";

/** Stand-in for sections not yet migrated from the legacy app. */
export function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-3xl font-bold tracking-tight">{title}</h1>
      </header>
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-20 text-center">
        <Construction className="size-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Dieser Bereich wird in einem späteren Schritt umgesetzt.
        </p>
      </div>
    </div>
  );
}
