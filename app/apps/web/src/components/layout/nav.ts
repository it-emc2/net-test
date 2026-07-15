import { Home, FileText, FileStack, Users, Package, Shield, type LucideIcon } from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Only shown to admin users. */
  adminOnly?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Start", icon: Home },
  { to: "/angebote", label: "Angebote", icon: FileText },
  { to: "/entwuerfe", label: "Entwürfe", icon: FileStack },
  { to: "/kunden", label: "Kunden", icon: Users },
  { to: "/produkte", label: "Produkte", icon: Package },
  { to: "/admin", label: "Administration", icon: Shield, adminOnly: true },
];
