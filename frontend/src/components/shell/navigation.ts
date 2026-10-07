import {
  Banknote,
  ChartColumn,
  IdCard,
  LayoutDashboard,
  Settings,
  Tag,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { MessageKey } from "@/i18n/types";
import type { Permission } from "@/lib/domain/permissions";

export interface NavItem {
  href: string;
  label: MessageKey;
  icon: LucideIcon;
  permission?: Permission;
}

/** Main navigation (design.md §4). No links for deferred Version 2 features. */
export const OPERATIONS_NAV: NavItem[] = [
  { href: "/dashboard", label: "shell.nav.dashboard", icon: LayoutDashboard },
  { href: "/members", label: "shell.nav.members", icon: Users },
  { href: "/payments", label: "shell.nav.payments", icon: Banknote },
  { href: "/memberships", label: "shell.nav.memberships", icon: IdCard },
];

/** Administrator management navigation; hidden for receptionists. */
export const ADMIN_NAV: NavItem[] = [
  { href: "/plans", label: "shell.nav.plans", icon: Tag, permission: "plans.manage" },
  { href: "/reports", label: "shell.nav.reports", icon: ChartColumn, permission: "reports.view" },
  { href: "/users", label: "shell.nav.users", icon: UserCog, permission: "staff.manage" },
  { href: "/settings", label: "shell.nav.settings", icon: Settings, permission: "settings.manage" },
];

export function isActivePath(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}

const TITLES: [RegExp, MessageKey][] = [
  [/^\/dashboard$/, "shell.nav.dashboard"],
  [/^\/members\/new$/, "shell.nav.addMember"],
  [/^\/members\/[^/]+\/edit$/, "shell.nav.editMember"],
  [/^\/members\/[^/]+$/, "shell.nav.memberProfile"],
  [/^\/members$/, "shell.nav.members"],
  [/^\/payments\/[^/]+$/, "shell.nav.paymentDetails"],
  [/^\/payments$/, "shell.nav.payments"],
  [/^\/memberships$/, "shell.nav.memberships"],
  [/^\/plans$/, "shell.nav.plans"],
  [/^\/reports$/, "shell.nav.reports"],
  [/^\/users$/, "shell.nav.users"],
  [/^\/settings$/, "shell.nav.settings"],
  [/^\/account$/, "shell.nav.account"],
];

/** Header page title for the current route (design.md §4). */
export function pageTitleFor(pathname: string | null): MessageKey | null {
  if (!pathname) return null;
  return TITLES.find(([pattern]) => pattern.test(pathname))?.[1] ?? null;
}
