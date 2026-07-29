"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Coffee, MonitorPlay, LogOut, UserCircle } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { LanguageToggle } from "@/components/ui/LanguageToggle";
import { useT } from "@/lib/i18n/LanguageContext";
import { initSyncEngine } from "@/lib/offline/sync";
import { useOutbox } from "@/lib/offline/useOutbox";
import { OfflineBanner } from "@/components/OfflineBanner";
import ServiceWorkerRegistrar, { clearOfflineShell } from "@/components/ServiceWorkerRegistrar";

export default function POSNav({
  children,
  isAdmin,
}: {
  children: React.ReactNode;
  isAdmin: boolean;
}) {
  const t = useT();
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const qc = useQueryClient();
  const { pendingCount, failedCount } = useOutbox();

  useEffect(() => {
    initSyncEngine(qc);
  }, [qc]);

  const handleLogout = async () => {
    // Signing out drops the session the queued RPC calls need to
    // authenticate as — a queued sale would never be able to sync again.
    // The outbox itself isn't cleared (IndexedDB survives signOut), so
    // this is a hard block, not a warning: there's no safe way to proceed.
    const stillPending = pendingCount + failedCount;
    if (stillPending > 0) {
      alert(t("offline.cannotLogoutPending", { n: stillPending }));
      return;
    }
    await supabase.auth.signOut();
    clearOfflineShell();
    router.push("/login");
  };

  const badgeCount = failedCount > 0 ? failedCount : pendingCount;
  const pendingBadge = badgeCount > 0 && (
    <span
      className={`inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold ${
        failedCount > 0
          ? "bg-red-500 text-white"
          : "bg-amber-500 text-white"
      }`}
    >
      {badgeCount}
    </span>
  );

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      <ServiceWorkerRegistrar />
      {/* Top Navigation Bar */}
      <header className="h-16 flex items-center justify-between px-4 sm:px-6 bg-card border-b border-warm-roast/10 shrink-0 shadow-sm z-10">
        <div className="flex items-center gap-2">
          <div className="bg-coffee-fruit p-2 rounded-md">
            <Coffee className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-lg hidden sm:block tracking-tight text-expresso">
            {t("nav.appName")}
          </span>
        </div>

        {/* View Toggle (Desktop/Tablet) */}
        <div className="hidden sm:flex bg-warm-roast/10 p-1 rounded-lg">
          <Link
            href="/pos/floor"
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              pathname === "/pos/floor"
                ? "bg-card shadow-sm text-expresso"
                : "text-expresso/60 hover:text-expresso"
            }`}
          >
            <Coffee className="w-4 h-4" />
            {t("nav.floorView")}
          </Link>
          <Link
            href="/pos/counter"
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              pathname === "/pos/counter"
                ? "bg-card shadow-sm text-expresso"
                : "text-expresso/60 hover:text-expresso"
            }`}
          >
            <MonitorPlay className="w-4 h-4" />
            {t("nav.counterView")}
            {pendingBadge}
          </Link>
        </div>

        <div className="flex items-center gap-3">
          {isAdmin && (
            <Link
              href="/admin"
              className="text-sm font-medium text-expresso/60 hover:text-expresso dark:text-expresso/40 hover:text-expresso hidden sm:block"
            >
              {t("nav.admin")}
            </Link>
          )}
          {isAdmin && (
            <div className="h-8 w-px bg-warm-roast/20 hidden sm:block"></div>
          )}
          <LanguageToggle />
          <ThemeToggle />
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-expresso/60 hover:text-red-600 dark:text-expresso/40 dark:hover:text-red-400 transition-colors"
            title={t("nav.logOut")}
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      <OfflineBanner />

      {/* Main Content Area */}
      <main className="flex-1 overflow-hidden relative">
        {children}
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="sm:hidden h-16 bg-card border-t border-warm-roast/10 shrink-0 flex items-center justify-around pb-safe">
        <Link
          href="/pos/floor"
          className={`flex flex-col items-center justify-center w-full h-full gap-1 transition-colors ${
            pathname === "/pos/floor" ? "text-expresso" : "text-expresso/60"
          }`}
        >
          <Coffee className="w-5 h-5" />
          <span className="text-xs font-medium">{t("nav.floor")}</span>
        </Link>
        <Link
          href="/pos/counter"
          className={`relative flex flex-col items-center justify-center w-full h-full gap-1 transition-colors ${
            pathname === "/pos/counter" ? "text-expresso" : "text-expresso/60"
          }`}
        >
          <span className="relative">
            <MonitorPlay className="w-5 h-5" />
            {badgeCount > 0 && (
              <span
                className={`absolute -top-1 -right-1.5 inline-flex items-center justify-center min-w-[14px] h-3.5 px-0.5 rounded-full text-[9px] font-bold ${
                  failedCount > 0 ? "bg-red-500 text-white" : "bg-amber-500 text-white"
                }`}
              >
                {badgeCount}
              </span>
            )}
          </span>
          <span className="text-xs font-medium">{t("nav.counter")}</span>
        </Link>
        {isAdmin && (
          <Link
            href="/admin"
            className="flex flex-col items-center justify-center w-full h-full gap-1 text-expresso/60 hover:text-expresso transition-colors"
          >
            <UserCircle className="w-5 h-5" />
            <span className="text-xs font-medium">{t("nav.admin")}</span>
          </Link>
        )}
      </nav>
    </div>
  );
}
