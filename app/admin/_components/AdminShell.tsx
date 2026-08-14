"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Menu as MenuIcon, X, History, FileText, Store, LogOut, ArrowLeft, SlidersHorizontal, UsersRound, Settings, BarChart3, Armchair, Wallet, Building2, ChevronDown, Check } from "lucide-react";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { LanguageToggle } from "@/components/ui/LanguageToggle";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/Popover";
import { Sheet } from "@/components/ui/Modal";
import { useT } from "@/lib/i18n/LanguageContext";
import { useLogout, useSessionContext, useSwitchLocation, useLocationSwitchListener } from "@/lib/hooks";
import { useScrollIntoViewOnFocus } from "@/lib/useScrollIntoViewOnFocus";

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
  | "admin.locations"
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
  { href: "/admin/locations", labelKey: "admin.locations", icon: Building2 },
  { href: "/admin/settings", labelKey: "admin.settings", icon: Settings },
];

/**
 * Locations the switcher offers: only ones the caller ADMINISTERS.
 * Switching to a location where they're staff-only would immediately
 * eject them back to /pos/floor via app/admin/layout.tsx's RBAC redirect
 * — better not to build that trap into the switcher itself.
 */
function useSwitchableLocations() {
  const { data: session } = useSessionContext();
  const active = session?.locations.find((l) => l.id === session.active_location_id) ?? null;
  const options = (session?.locations ?? []).filter((l) => l.role === "admin" && !l.archived);
  return { active, options };
}

function LocationSwitcher() {
  const t = useT();
  const { active, options } = useSwitchableLocations();
  const doSwitch = useSwitchLocation();
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);

  // One location (the 100% case today) ⇒ plain text, no affordance.
  if (options.length <= 1) {
    return <p className="text-xs text-expresso/60 truncate">{active?.name ?? t("admin.adminPortal")}</p>;
  }

  const handlePick = async (locationId: string) => {
    if (locationId === active?.id) {
      setOpen(false);
      return;
    }
    setSwitching(true);
    await doSwitch(locationId);
    // On success this tab navigates away (useSwitchLocation ends in
    // window.location.assign) — only reachable here if it declined or errored.
    setSwitching(false);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1 text-xs text-expresso/60 hover:text-expresso transition-colors truncate max-w-full"
        >
          <span className="truncate">{switching ? t("locations.switching") : (active?.name ?? t("admin.adminPortal"))}</span>
          <ChevronDown className="w-3 h-3 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-2">
        <p className="px-2 py-1 text-xs font-semibold text-expresso/40 uppercase tracking-wide">
          {t("locations.switchTo")}
        </p>
        <div className="space-y-0.5 mt-1">
          {options.map((loc) => (
            <button
              key={loc.id}
              type="button"
              onClick={() => handlePick(loc.id)}
              disabled={switching}
              className={`w-full text-left px-2 py-2 rounded-lg text-sm flex items-center justify-between transition-colors disabled:opacity-50 ${
                loc.id === active?.id
                  ? "bg-warm-roast/10 text-expresso font-medium"
                  : "text-expresso/70 hover:bg-warm-roast/5"
              }`}
            >
              {loc.name}
              {loc.id === active?.id && <Check className="w-4 h-4 shrink-0" />}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function LocationSwitcherSheet() {
  const t = useT();
  const { active, options } = useSwitchableLocations();
  const doSwitch = useSwitchLocation();
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);

  if (options.length <= 1) {
    return <h1 className="font-bold tracking-tight text-expresso truncate">{active?.name ?? t("admin.adminPortal")}</h1>;
  }

  const handlePick = async (locationId: string) => {
    if (locationId === active?.id) {
      setOpen(false);
      return;
    }
    setSwitching(true);
    await doSwitch(locationId);
    setSwitching(false);
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 font-bold tracking-tight text-expresso min-w-0"
      >
        <span className="truncate">{switching ? t("locations.switching") : (active?.name ?? t("admin.adminPortal"))}</span>
        <ChevronDown className="w-4 h-4 text-expresso/40 shrink-0" />
      </button>
      {open && (
        <Sheet onClose={() => setOpen(false)}>
          <div className="p-4 border-b border-warm-roast/10 flex items-center justify-between shrink-0">
            <h3 className="font-bold text-expresso">{t("locations.switchTo")}</h3>
            <button onClick={() => setOpen(false)} className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-expresso/40 hover:text-expresso">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {options.map((loc) => (
              <button
                key={loc.id}
                type="button"
                onClick={() => handlePick(loc.id)}
                disabled={switching}
                className={`w-full text-left px-4 py-3.5 rounded-lg text-base flex items-center justify-between transition-colors disabled:opacity-50 ${
                  loc.id === active?.id
                    ? "bg-warm-roast/10 text-expresso font-medium"
                    : "text-expresso/80 hover:bg-warm-roast/5"
                }`}
              >
                {loc.name}
                {loc.id === active?.id && <Check className="w-5 h-5 shrink-0" />}
              </button>
            ))}
          </div>
        </Sheet>
      )}
    </>
  );
}

/**
 * The nav item list, shared by the mobile drawer and the desktop sidebar —
 * previously copy-pasted between the two. `onNavigate` closes the drawer on
 * mobile after a tap; the desktop sidebar doesn't need it since it's always
 * visible.
 */
function NavLinks({
  pathname,
  t,
  onNavigate,
}: {
  pathname: string;
  t: ReturnType<typeof useT>;
  onNavigate?: () => void;
}) {
  return (
    <>
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const isActive = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={`flex items-center gap-3 px-3 min-h-[44px] rounded-lg text-sm font-medium transition-all ${
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
    </>
  );
}

/** "Back to POS" + sign-out, shared the same way as NavLinks above. */
function SidebarFooter({
  t,
  onNavigate,
  onLogout,
}: {
  t: ReturnType<typeof useT>;
  onNavigate?: () => void;
  onLogout: () => void;
}) {
  return (
    <>
      <Link
        href="/pos/floor"
        onClick={onNavigate}
        className="flex items-center gap-3 px-3 min-h-[44px] rounded-lg text-sm font-medium text-expresso/70 hover:bg-warm-roast/5 hover:text-expresso transition-colors"
      >
        <ArrowLeft className="w-5 h-5 text-expresso/40" />
        {t("nav.backToPOS")}
      </Link>
      <button
        onClick={onLogout}
        className="w-full flex items-center gap-3 px-3 min-h-[44px] rounded-lg text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
      >
        <LogOut className="w-5 h-5 text-red-500" />
        {t("common.signOut")}
      </button>
    </>
  );
}

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
  // Reloads this tab if another tab switches location — see step 6 of
  // useSwitchLocation (lib/hooks.ts).
  useLocationSwitchListener();
  useScrollIntoViewOnFocus();

  // Close the drawer on Escape — it's always mounted now (for the slide
  // transition below), so a keyboard user tabbed into it needs a way out
  // that doesn't depend on finding the on-screen close button.
  useEffect(() => {
    if (!isMobileMenuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsMobileMenuOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isMobileMenuOpen]);

  return (
    <div className="flex h-app bg-background overflow-hidden pl-safe pr-safe">
      {/* Mobile Sidebar Navigation Drawer — always mounted (unlike a
          conditional `{isMobileMenuOpen && ...}`) so the transform/opacity
          transitions below actually have something to animate between,
          both opening AND closing. `inert` + aria-hidden keep it out of
          the tab order and off-screen readers while closed. */}
      <div
        className={`md:hidden fixed inset-0 z-50 flex ${isMobileMenuOpen ? "" : "pointer-events-none"}`}
        aria-hidden={!isMobileMenuOpen}
      >
        <div
          className={`fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300 ${
            isMobileMenuOpen ? "opacity-100" : "opacity-0"
          }`}
          onClick={() => setIsMobileMenuOpen(false)}
        />
        <aside
          className={`relative w-64 max-w-xs bg-card border-r border-warm-roast/10 flex flex-col h-full transition-transform duration-300 ease-out ${
            isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
          }`}
          inert={!isMobileMenuOpen}
        >
          <div className="p-6 flex items-center justify-between gap-2 border-b border-warm-roast/10">
            <div className="flex items-center gap-3 min-w-0">
              <div className="bg-coffee-fruit p-2 rounded-md shrink-0">
                <Store className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="font-bold tracking-tight text-expresso">Dos Tazas</h1>
                <LocationSwitcher />
              </div>
            </div>
            <button
              onClick={() => setIsMobileMenuOpen(false)}
              className="shrink-0 min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-md text-expresso/40 hover:text-expresso hover:bg-warm-roast/10 active:scale-95 transition-transform"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
            <NavLinks pathname={pathname} t={t} onNavigate={() => setIsMobileMenuOpen(false)} />
          </nav>

          <div className="p-4 pb-safe border-t border-warm-roast/10 space-y-2 shrink-0">
            <SidebarFooter t={t} onNavigate={() => setIsMobileMenuOpen(false)} onLogout={handleLogout} />
          </div>
        </aside>
      </div>

      {/* Sidebar */}
      <aside className="hidden md:flex w-64 bg-card border-r border-warm-roast/10 flex-col shrink-0">
        <div className="p-6 flex items-center justify-between gap-2 border-b border-warm-roast/10">
          <div className="flex items-center gap-3 min-w-0">
            <div className="bg-coffee-fruit p-2 rounded-md shrink-0">
              <Store className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="font-bold tracking-tight text-expresso truncate">Dos Tazas</h1>
              <p className="text-xs text-expresso/60 truncate">{t("admin.adminPortal")}</p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <LanguageToggle />
            <ThemeToggle />
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          <NavLinks pathname={pathname} t={t} />
        </nav>

        <div className="p-4 pb-safe border-t border-warm-roast/10 space-y-2 shrink-0">
          <SidebarFooter t={t} onLogout={handleLogout} />
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        <div className="md:hidden flex items-center justify-between gap-2 p-4 border-b border-warm-roast/10 bg-card">
          <div className="flex items-center gap-1 min-w-0">
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="shrink-0 min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-expresso/60 hover:text-expresso active:scale-95 transition-transform focus:outline-none"
              aria-label="Open menu"
            >
              <MenuIcon className="w-5 h-5" />
            </button>
            <LocationSwitcherSheet />
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <LanguageToggle />
            <ThemeToggle />
            <Link
              href="/pos/floor"
              className="hidden sm:inline-flex items-center min-h-[44px] px-2 text-sm font-medium text-expresso/60 hover:text-expresso"
            >
              {t("nav.backToPOS")}
            </Link>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
