"use client";

import { LogOut, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { API_MODE } from "@/lib/api/client";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import { useAuth, useSession } from "@/providers/auth-provider";
import { Brand } from "./brand";
import { ADMIN_NAV, isActivePath, OPERATIONS_NAV, type NavItem } from "./navigation";

function NavList({
  items,
  pathname,
  onNavigate,
}: {
  items: NavItem[];
  pathname: string | null;
  onNavigate?: () => void;
}) {
  const { t } = useI18n();
  return (
    <ul className="flex flex-col gap-1">
      {items.map((item) => {
        const active = isActivePath(pathname, item.href);
        const Icon = item.icon;
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-11 items-center gap-3 rounded-lg px-3 text-[15px] font-medium transition-colors",
                active ? "bg-primary text-on-primary shadow-card" : "text-fg-muted hover:bg-tint hover:text-fg",
              )}
            >
              <Icon aria-hidden className="size-5 shrink-0" />
              {t(item.label)}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function ActiveNavList(props: { items: NavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  return <NavList {...props} pathname={pathname} />;
}

/** Nav list whose active state streams in; the links themselves prerender. */
function Nav({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  return (
    <Suspense fallback={<NavList items={items} pathname={null} onNavigate={onNavigate} />}>
      <ActiveNavList items={items} onNavigate={onNavigate} />
    </Suspense>
  );
}

export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { account, gym, can } = useSession();
  const { signOut } = useAuth();
  const { t } = useI18n();
  const adminItems = ADMIN_NAV.filter((item) => !item.permission || can(item.permission));

  return (
    <div className="flex h-full flex-col">
      <div className="h-header flex shrink-0 items-center px-5">
        <Link
          href="/dashboard"
          onClick={onNavigate}
          className="rounded-lg"
          aria-label={t("shell.brandHome", { gym: gym.name })}
        >
          <Brand gymName={gym.name} />
        </Link>
      </div>

      <nav aria-label={t("shell.mainNav")} className="flex-1 scrollbar-thin overflow-y-auto px-3 pt-4 pb-6">
        <p className="text-fg-subtle px-3 pb-2 text-xs font-semibold tracking-[0.1em] uppercase">
          {t("shell.operations")}
        </p>
        <Nav items={OPERATIONS_NAV} onNavigate={onNavigate} />
        {adminItems.length > 0 ? (
          <>
            <p className="text-fg-subtle px-3 pt-6 pb-2 text-xs font-semibold tracking-[0.1em] uppercase">
              {t("shell.administration")}
            </p>
            <Nav items={adminItems} onNavigate={onNavigate} />
          </>
        ) : null}
      </nav>

      <div className="shrink-0 p-3">
        {API_MODE === "mock" ? (
          <div className="mb-2 flex justify-center">
            <Badge tone="warning">{t("shell.demoBadge")}</Badge>
          </div>
        ) : null}
        <div className="bg-tint rounded-xl p-3">
          <div className="flex items-center gap-3">
            <Avatar
              name={account.fullName}
              size="md"
              className="bg-primary text-on-primary dark:bg-primary dark:text-on-primary"
            />
            <div className="min-w-0">
              <p className="text-fg truncate text-sm font-semibold">{account.fullName}</p>
              <p className="text-fg-muted truncate text-xs">{t(`labels.roles.${account.role}.label`)}</p>
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <Link
              href="/account"
              onClick={onNavigate}
              className="text-fg-muted hover:text-fg inline-flex min-h-11 items-center gap-1.5 rounded-md px-1 text-sm font-medium whitespace-nowrap md:min-h-9"
            >
              <UserRound aria-hidden className="size-4" />
              {t("shell.myAccount")}
            </Link>
            <button
              type="button"
              onClick={() => void signOut()}
              className="text-fg-muted hover:text-fg inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-md px-1 text-sm font-medium whitespace-nowrap md:min-h-9"
            >
              <LogOut aria-hidden className="size-4" />
              {t("shell.signOut")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
