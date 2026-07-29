"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Menu as MenuIcon, X, History, FileText, Store, LogOut, ArrowLeft, SlidersHorizontal, UsersRound, Settings, BarChart3, Armchair, Wallet } from "lucide-react";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { LanguageToggle } from "@/components/ui/LanguageToggle";
import { useT } from "@/lib/i18n/LanguageContext";
import { useLogout } from "@/lib/hooks";

type NavKey =
  | "admin.dashboard"
  | "admin.analytics"
  | "admin.menuInventory"
  | "admin.tables"
  | "admin.modifiers"
  | "admin.staff"
  | "admin.cash"
  | "admin.transactionHistory"
  | "admin.financialReports"
  | "admin.settings";

const NAV_ITEMS: { href: string; labelKey: NavKey; icon: React.ElementType }[] = [
  { href: "/admin", labelKey: "admin.dashboard", icon: LayoutDashboard },
  { href: "/admin/analytics", labelKey: "admin.analytics", icon: BarChart3 },
  { href: "/admin/menu", labelKey: "admin.menuInventory", icon: MenuIcon },
  { href: "/admin/tables", labelKey: "admin.tables", icon: Armchair },
  { href: "/admin/modifiers", labelKey: "admin.modifiers", icon: SlidersHorizontal },
  { href: "/admin/staff", labelKey: "admin.staff", icon: UsersRound },
  { href: "/admin/cash", labelKey: "admin.cash", icon: Wallet },
  { href: "/admin/history", labelKey: "admin.transactionHistory", icon: History },
  { href: "/admin/reports", labelKey: "admin.financialReports", icon: FileText },
  { href: "/admin/settings", labelKey: "admin.settings", icon: Settings },
];

export default function AdminShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = useT();
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  // Shared with POSNav — enforces the same pending-outbox guard and
  // identity cleanup, so closing the admin tab instead of the POS one is
  // no longer a way to sign out around a sale still queued for THIS
  // session to sync.
  const handleLogout = useLogout();

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Mobile Sidebar Navigation Drawer */}
      {isMobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setIsMobileMenuOpen(false)}
          />
          <aside className="relative w-64 max-w-xs bg-card border-r border-warm-roast/10 flex flex-col z-50 h-full">
            <div className="p-6 flex items-center justify-between border-b border-warm-roast/10">
              <div className="flex items-center gap-3">
                <div className="bg-coffee-fruit p-2 rounded-md">
                  <Store className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h1 className="font-bold tracking-tight text-expresso">Dos Tazas</h1>
                  <p className="text-xs text-expresso/60">{t("admin.adminPortal")}</p>
                </div>
              </div>
              <button
                onClick={() => setIsMobileMenuOpen(false)}
                className="p-1.5 rounded-md text-expresso/40 hover:text-expresso hover:bg-warm-roast/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-warm-roast/10 text-expresso"
                        : "text-expresso/70 hover:bg-warm-roast/5 hover:text-expresso"
                    }`}
                  >
                    <Icon className={`w-5 h-5 ${isActive ? "text-expresso" : "text-expresso/40"}`} />
                    {t(item.labelKey)}
                  </Link>
                );
              })}
            </nav>

            <div className="p-4 border-t border-warm-roast/10 space-y-2">
              <Link
                href="/pos/floor"
                onClick={() => setIsMobileMenuOpen(false)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-expresso/70 hover:bg-warm-roast/5 hover:text-expresso transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-expresso/40" />
                {t("nav.backToPOS")}
              </Link>
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
              >
                <LogOut className="w-5 h-5 text-red-500" />
                {t("common.signOut")}
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Sidebar */}
      <aside className="w-64 bg-card border-r border-warm-roast/10 flex flex-col hidden md:flex shrink-0">
        <div className="p-6 flex items-center justify-between border-b border-warm-roast/10">
          <div className="flex items-center gap-3">
            <div className="bg-coffee-fruit p-2 rounded-md">
              <Store className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold tracking-tight text-expresso">Dos Tazas</h1>
              <p className="text-xs text-expresso/60">{t("admin.adminPortal")}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <LanguageToggle />
            <ThemeToggle />
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-warm-roast/10 text-expresso"
                    : "text-expresso/70 hover:bg-warm-roast/5 hover:text-expresso"
                }`}
              >
                <Icon className={`w-5 h-5 ${isActive ? "text-expresso" : "text-expresso/40"}`} />
                {t(item.labelKey)}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-warm-roast/10 space-y-2">
          <Link
            href="/pos/floor"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-expresso/70 hover:bg-warm-roast/5 hover:text-expresso transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-expresso/40" />
            {t("nav.backToPOS")}
          </Link>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
          >
            <LogOut className="w-5 h-5 text-red-500" />
            {t("common.signOut")}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        <div className="md:hidden flex items-center justify-between p-4 border-b border-warm-roast/10 bg-card">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="p-2 -ml-2 text-expresso/60 hover:text-expresso dark:text-expresso/40 hover:text-expresso focus:outline-none"
              aria-label="Open menu"
            >
              <MenuIcon className="w-5 h-5" />
            </button>
            <h1 className="font-bold tracking-tight text-expresso">{t("admin.adminPortal")}</h1>
          </div>
          <div className="flex items-center gap-3">
            <LanguageToggle />
            <ThemeToggle />
            <Link href="/pos/floor" className="text-sm font-medium text-expresso/60 hover:text-expresso dark:text-expresso/40 hover:text-expresso">{t("nav.backToPOS")}</Link>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
