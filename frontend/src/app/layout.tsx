import type { Metadata, Viewport } from "next";
import { Inter, Noto_Sans_Ethiopic } from "next/font/google";
import type { ReactNode } from "react";
import { DEFAULT_LOCALE } from "@/i18n/config";
import { themeInitScript } from "@/lib/theme-script";
import { AppProviders } from "@/providers/app-providers";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
// Inter has no Ge'ez glyphs; Amharic text falls back to Noto Sans Ethiopic per character.
const ethiopic = Noto_Sans_Ethiopic({ subsets: ["ethiopic"], variable: "--font-ethiopic", display: "swap" });

export const metadata: Metadata = {
  // Page titles are set client-side in the user's language (see useDocumentTitle).
  title: "GymFlow",
  description: "Gym membership and payment management for front-desk staff.",
  applicationName: "GymFlow",
  // Staff-only application: keep it out of search engines.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
    { media: "(prefers-color-scheme: dark)", color: "#0f172a" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang={DEFAULT_LOCALE} className={`${inter.variable} ${ethiopic.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="bg-canvas text-fg font-sans antialiased">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
