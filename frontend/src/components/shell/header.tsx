"use client";

import { ChevronDown, LogOut, Menu, Moon, Search, Sun, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { Avatar } from "@/components/ui/avatar";
import { IconButton } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useI18n } from "@/i18n/provider";
import { useIsApplePlatform } from "@/lib/hooks";
import { useTheme } from "@/lib/theme";
import { useAuth, useSession } from "@/providers/auth-provider";
import { LanguageSwitcher } from "./language-switcher";
import { pageTitleFor } from "./navigation";

function PageTitle() {
  const { t } = useI18n();
  const key = pageTitleFor(usePathname());
  return <p className="text-fg truncate text-base font-semibold">{key ? t(key) : null}</p>;
}

function ThemeToggle() {
  const { resolved } = useTheme();
  const { updateAppearance } = useAuth();
  const { t } = useI18n();
  const next = resolved === "dark" ? "LIGHT" : "DARK";
  return (
    <IconButton
      label={resolved === "dark" ? t("shell.switchToLight") : t("shell.switchToDark")}
      onClick={() => updateAppearance(next)}
    >
      {resolved === "dark" ? <Sun aria-hidden /> : <Moon aria-hidden />}
    </IconButton>
  );
}

function UserMenu() {
  const { account } = useSession();
  const { signOut } = useAuth();
  const { t } = useI18n();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="text-fg-muted hover:bg-tint data-[state=open]:bg-tint flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full py-1 pr-2 pl-1"
        aria-label={t("shell.accountMenu", { name: account.fullName })}
      >
        <Avatar
          name={account.fullName}
          size="sm"
          className="bg-primary text-on-primary dark:bg-primary dark:text-on-primary"
        />
        <ChevronDown aria-hidden className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64">
        <DropdownMenuLabel>
          <p className="text-fg truncate text-sm font-semibold">{account.fullName}</p>
          <p className="text-fg-muted truncate text-xs">{account.email}</p>
          <p className="text-primary-soft-fg mt-1 text-xs font-medium">{t(`labels.roles.${account.role}.label`)}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/account">
            <UserRound aria-hidden />
            {t("shell.myAccount")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void signOut()}>
          <LogOut aria-hidden />
          {t("shell.signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Header({ onOpenNav, onOpenLookup }: { onOpenNav: () => void; onOpenLookup: () => void }) {
  const apple = useIsApplePlatform();
  const { t } = useI18n();
  const { updateLanguage } = useAuth();
  return (
    <header className="h-header border-line bg-surface/90 sticky top-0 z-30 flex items-center gap-2 border-b px-3 backdrop-blur-md sm:px-6 lg:gap-4 lg:px-8 print:hidden">
      <IconButton label={t("shell.openNavigation")} className="lg:hidden" onClick={onOpenNav}>
        <Menu aria-hidden />
      </IconButton>
      <div className="min-w-0 lg:hidden">
        <Suspense fallback={null}>
          <PageTitle />
        </Suspense>
      </div>

      <button
        type="button"
        onClick={onOpenLookup}
        className="border-line bg-tint/70 text-fg-subtle hover:border-line-strong hover:bg-tint ml-2 hidden h-11 w-full max-w-xl cursor-pointer items-center gap-3 rounded-lg border px-3 text-left text-[15px] transition-colors md:flex lg:ml-0"
      >
        <Search aria-hidden className="size-[18px] shrink-0" />
        <span className="flex-1 truncate">{t("shell.searchPlaceholder")}</span>
        <kbd className="border-line bg-surface text-fg-muted rounded-md border px-1.5 py-0.5 font-sans text-xs font-semibold">
          {apple ? "⌘K" : "Ctrl K"}
        </kbd>
      </button>

      <div className="ml-auto flex items-center gap-1">
        <IconButton label={t("shell.searchMembers")} className="md:hidden" onClick={onOpenLookup}>
          <Search aria-hidden />
        </IconButton>
        <LanguageSwitcher onChange={updateLanguage} compact />
        <ThemeToggle />
        <UserMenu />
      </div>
    </header>
  );
}
