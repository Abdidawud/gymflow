"use client";

import type { ReactNode } from "react";
import { Toaster } from "@/components/ui/toaster";
import { I18nProvider } from "@/i18n/provider";
import { AuthProvider } from "./auth-provider";
import { QueryProvider } from "./query-provider";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <I18nProvider>
      <QueryProvider>
        <AuthProvider>
          {children}
          <Toaster />
        </AuthProvider>
      </QueryProvider>
    </I18nProvider>
  );
}
