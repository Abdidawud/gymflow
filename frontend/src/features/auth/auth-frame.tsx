"use client";

import { CalendarCheck, ReceiptText, Search } from "lucide-react";
import type { ReactNode } from "react";
import { Brand } from "@/components/shell/brand";
import { LanguageSwitcher } from "@/components/shell/language-switcher";
import { setLocale, useI18n } from "@/i18n/provider";
import type { MessageKey } from "@/i18n/types";

const HIGHLIGHTS: { icon: typeof Search; title: MessageKey; text: MessageKey }[] = [
  { icon: Search, title: "auth.layout.lookupTitle", text: "auth.layout.lookupText" },
  { icon: CalendarCheck, title: "auth.layout.renewalsTitle", text: "auth.layout.renewalsText" },
  { icon: ReceiptText, title: "auth.layout.receiptsTitle", text: "auth.layout.receiptsText" },
];

/** Split layout: modest branding on the left, focused form on the right (design.md §7). */
export function AuthFrame({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  // Chosen before sign-in: saved to the account once the staff member signs in.
  const switcher = <LanguageSwitcher onChange={(locale) => setLocale(locale, { explicit: true })} />;

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="relative hidden overflow-hidden bg-[#4338ca] px-12 py-12 text-white lg:flex lg:flex-col">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-32 -right-32 size-[28rem] rounded-full bg-white/[0.06]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-40 -left-24 size-[26rem] rounded-full bg-white/[0.05]"
        />
        <Brand inverted />
        <div className="relative mt-auto max-w-md">
          <h1 className="text-[40px] leading-[48px] font-bold tracking-[-0.02em]">{t("auth.layout.headline")}</h1>
          <p className="mt-4 text-lg text-white/85">{t("auth.layout.subhead")}</p>
          <ul className="mt-10 flex flex-col gap-3">
            {HIGHLIGHTS.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex items-start gap-3.5 rounded-xl bg-white/[0.08] p-4 ring-1 ring-white/10">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/15">
                  <Icon aria-hidden className="size-5" />
                </span>
                <div>
                  <p className="font-semibold">{t(title)}</p>
                  <p className="mt-0.5 text-sm text-white/80">{t(text)}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative mt-auto pt-10 text-sm text-white/70">{t("auth.layout.location")}</p>
      </aside>

      <main className="bg-surface flex min-h-dvh flex-col lg:min-h-0">
        <div className="border-line border-b px-6 py-5 lg:hidden">
          <div className="flex items-start justify-between gap-4">
            <Brand />
            {switcher}
          </div>
          <p className="text-fg mt-3 text-lg font-semibold">{t("auth.layout.headline")}</p>
          <p className="text-fg-muted text-sm">{t("auth.layout.subhead")}</p>
        </div>
        <div className="hidden justify-end px-8 pt-6 lg:flex">{switcher}</div>
        <div className="flex flex-1 items-center justify-center px-5 py-10 sm:px-8">
          <div className="w-full max-w-[420px]">{children}</div>
        </div>
      </main>
    </div>
  );
}
