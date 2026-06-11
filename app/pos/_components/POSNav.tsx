"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Coffee, MonitorPlay, LogOut, UserCircle } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

export default function POSNav({
  children,
  isAdmin,
}: {
  children: React.ReactNode;
  isAdmin: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      {/* Top Navigation Bar */}
      <header className="h-16 flex items-center justify-between px-4 sm:px-6 bg-card border-b border-warm-roast/10 shrink-0 shadow-sm z-10">
        <div className="flex items-center gap-2">
          <div className="bg-coffee-fruit p-2 rounded-md">
            <Coffee className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-lg hidden sm:block tracking-tight text-expresso">
            Dos Tazas POS
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
            Floor View
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
            Counter View
          </Link>
        </div>

        <div className="flex items-center gap-4">
          {isAdmin && (
            <Link
              href="/admin"
              className="text-sm font-medium text-expresso/60 hover:text-expresso dark:text-expresso/40 hover:text-expresso hidden sm:block"
            >
              Admin
            </Link>
          )}
          {isAdmin && (
            <div className="h-8 w-px bg-warm-roast/20 hidden sm:block"></div>
          )}
          <ThemeToggle />
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-expresso/60 hover:text-red-600 dark:text-expresso/40 dark:hover:text-red-400 transition-colors"
            title="Log out"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

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
          <span className="text-xs font-medium">Floor</span>
        </Link>
        <Link
          href="/pos/counter"
          className={`flex flex-col items-center justify-center w-full h-full gap-1 transition-colors ${
            pathname === "/pos/counter" ? "text-expresso" : "text-expresso/60"
          }`}
        >
          <MonitorPlay className="w-5 h-5" />
          <span className="text-xs font-medium">Counter</span>
        </Link>
        {isAdmin && (
          <Link
            href="/admin"
            className="flex flex-col items-center justify-center w-full h-full gap-1 text-expresso/60 hover:text-expresso transition-colors"
          >
            <UserCircle className="w-5 h-5" />
            <span className="text-xs font-medium">Admin</span>
          </Link>
        )}
      </nav>
    </div>
  );
}
