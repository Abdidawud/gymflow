"use client";

import { Check, ChevronDown, Languages } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LOCALE_LABELS, LOCALES, type Locale } from "@/i18n/config";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

/**
 * Amharic / English switcher. Each language is listed in its own script so
 * staff can find theirs whichever language is currently shown.
 */
export function LanguageSwitcher({
  onChange,
  className,
  compact = false,
}: {
  onChange: (locale: Locale) => void;
  className?: string;
  /** Icon plus short code only (narrow headers). */
  compact?: boolean;
}) {
  const { t, locale } = useI18n();
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        aria-label={`${t("shell.changeLanguage")} (${LOCALE_LABELS[locale]})`}
        className={cn(
          "text-fg-muted hover:bg-tint hover:text-fg data-[state=open]:bg-tint inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 text-sm font-semibold",
          className,
        )}
      >
        <Languages aria-hidden className="size-5" />
        <span className={cn(compact && "max-sm:sr-only")}>{LOCALE_LABELS[locale]}</span>
        <ChevronDown aria-hidden className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-44">
        {LOCALES.map((option) => (
          <DropdownMenuItem key={option} lang={option} onSelect={() => onChange(option)}>
            <Check aria-hidden className={cn("size-4", option === locale ? "opacity-100" : "opacity-0")} />
            {LOCALE_LABELS[option]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
