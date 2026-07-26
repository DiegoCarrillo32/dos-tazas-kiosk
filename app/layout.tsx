import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import QueryProvider from "@/lib/QueryProvider";
import { LanguageProvider, type Lang } from "@/lib/i18n/LanguageContext";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dos Tazas POS",
  description: "Point of Sale system for Dos Tazas",
};

// Lock scaling so tablets/phones don't zoom into inputs on focus and the
// POS behaves like a fixed kiosk surface.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Read the language before paint so the first HTML is already in the
  // user's language — see the note in LanguageContext.
  const lang: Lang = (await cookies()).get("lang")?.value === "en" ? "en" : "es";

  return (
    <html lang={lang} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                if (localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                  document.documentElement.classList.add('dark')
                } else {
                  document.documentElement.classList.remove('dark')
                }
              } catch (_) {}
            `,
          }}
        />
      </head>
      <body>
        <LanguageProvider initialLang={lang}>
          <QueryProvider>{children}</QueryProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
