"use client";

import { useState, type ReactNode } from "react";
import { DialogDescription, DialogTitle, Sheet, SheetContent } from "@/components/ui/dialog";
import { MemberLookup } from "@/features/members/member-lookup";
import { useI18n } from "@/i18n/provider";
import { PaymentDrawerProvider } from "@/features/payments/payment-drawer-provider";
import { Header } from "./header";
import { SidebarContent } from "./sidebar";

/**
 * Authenticated application shell (design.md §4, §19): persistent 248px
 * sidebar from 1024px, navigation drawer below; 72px header with member lookup.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [navOpen, setNavOpen] = useState(false);
  const [lookupOpen, setLookupOpen] = useState(false);

  return (
    <PaymentDrawerProvider>
      <a
        href="#main"
        className="bg-primary text-on-primary sr-only z-[60] rounded-lg px-4 py-2 font-semibold focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        {t("shell.skipToContent")}
      </a>

      <aside className="w-sidebar border-line bg-surface fixed inset-y-0 left-0 z-40 hidden border-r lg:block print:hidden">
        <SidebarContent />
      </aside>

      <Sheet open={navOpen} onOpenChange={setNavOpen}>
        <SheetContent side="left" className="lg:hidden">
          <DialogTitle className="sr-only">{t("shell.navigation")}</DialogTitle>
          <DialogDescription className="sr-only">{t("shell.navigationDescription")}</DialogDescription>
          <SidebarContent onNavigate={() => setNavOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="lg:pl-sidebar flex min-h-dvh flex-col print:pl-0">
        <Header onOpenNav={() => setNavOpen(true)} onOpenLookup={() => setLookupOpen(true)} />
        <main
          id="main"
          tabIndex={-1}
          className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 focus:outline-none sm:px-6 lg:px-8 lg:py-8 print:p-0"
        >
          {children}
        </main>
      </div>

      <MemberLookup open={lookupOpen} onOpenChange={setLookupOpen} />
    </PaymentDrawerProvider>
  );
}
