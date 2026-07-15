import { Link } from "react-router-dom";
import { FileText, Users, Package, Shield, ArrowUpRight } from "lucide-react";
import { useAuth } from "@/features/auth/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { PlanningPanel } from "@/features/planning/PlanningPanel";
import { RecentDraftsPanel } from "@/features/offer/RecentDraftsPanel";

const QUICK_LINKS = [
  {
    to: "/angebote",
    title: "Angebote",
    description: "Angebote erstellen und verwalten",
    icon: FileText,
  },
  { to: "/kunden", title: "Kunden", description: "Kundenstamm durchsuchen", icon: Users },
  {
    to: "/produkte",
    title: "Produkte",
    description: "Vigor-Katalog mit Bestand",
    icon: Package,
  },
];

export function HomePage() {
  const { user, isAdmin } = useAuth();
  const firstName = user?.firstName || user?.name || "willkommen";

  const links = [
    ...QUICK_LINKS,
    ...(isAdmin
      ? [
          {
            to: "/admin",
            title: "Administration",
            description: "Benutzer und Einstellungen",
            icon: Shield,
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">Übersicht</p>
        <h1 className="mt-1 font-display text-3xl font-bold tracking-tight">
          Hallo {firstName}.
        </h1>
        <p className="mt-2 max-w-prose text-muted-foreground">
          Von hier aus verwaltest du Angebote und Kunden. Wähle einen Bereich, um loszulegen.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <PlanningPanel />
        <RecentDraftsPanel />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {links.map(({ to, title, description, icon: Icon }) => (
          <Link key={to} to={to} className="group">
            <Card className="h-full transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
              <CardContent className="flex h-full flex-col gap-3 p-5">
                <div className="flex items-center justify-between">
                  <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="size-5" />
                  </span>
                  <ArrowUpRight className="size-4 text-muted-foreground transition-colors group-hover:text-primary" />
                </div>
                <div>
                  <h2 className="font-display text-base font-semibold">{title}</h2>
                  <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
