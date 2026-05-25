"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Coffee, MonitorPlay, LogOut, UserCircle } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

export default function POSLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <div className="flex flex-col h-screen bg-zinc-50 dark:bg-zinc-950 overflow-hidden">
      {/* Top Navigation Bar */}
      <header className="h-16 flex items-center justify-between px-4 sm:px-6 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 shrink-0 shadow-sm z-10">
        <div className="flex items-center gap-2">
          <div className="bg-zinc-900 dark:bg-zinc-50 p-2 rounded-md">
            <Coffee className="w-5 h-5 text-zinc-50 dark:text-zinc-900" />
          </div>
          <span className="font-bold text-lg hidden sm:block tracking-tight text-zinc-900 dark:text-zinc-50">
            Dos Tazas POS
          </span>
        </div>

        {/* View Toggle (Desktop/Tablet) */}
        <div className="hidden sm:flex bg-zinc-100 dark:bg-zinc-800 p-1 rounded-lg">
          <Link
            href="/pos/floor"
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              pathname === "/pos/floor"
                ? "bg-white dark:bg-zinc-900 shadow-sm text-zinc-900 dark:text-zinc-50"
                : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50"
            }`}
          >
            <Coffee className="w-4 h-4" />
            Floor View
          </Link>
          <Link
            href="/pos/counter"
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              pathname === "/pos/counter"
                ? "bg-white dark:bg-zinc-900 shadow-sm text-zinc-900 dark:text-zinc-50"
                : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50"
            }`}
          >
            <MonitorPlay className="w-4 h-4" />
            Counter View
          </Link>
        </div>

        <div className="flex items-center gap-4">
          <Link href="/admin" className="text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50 hidden sm:block">
            Admin
          </Link>
          <div className="h-8 w-px bg-zinc-200 dark:bg-zinc-800 hidden sm:block"></div>
          <ThemeToggle />
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-zinc-500 hover:text-red-600 dark:text-zinc-400 dark:hover:text-red-400 transition-colors"
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
      <nav className="sm:hidden h-16 bg-white dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800 shrink-0 flex items-center justify-around pb-safe">
        <Link
          href="/pos/floor"
          className={`flex flex-col items-center justify-center w-full h-full gap-1 transition-colors ${
            pathname === "/pos/floor"
              ? "text-zinc-900 dark:text-zinc-50"
              : "text-zinc-500 dark:text-zinc-400"
          }`}
        >
          <Coffee className="w-5 h-5" />
          <span className="text-xs font-medium">Floor</span>
        </Link>
        <Link
          href="/pos/counter"
          className={`flex flex-col items-center justify-center w-full h-full gap-1 transition-colors ${
            pathname === "/pos/counter"
              ? "text-zinc-900 dark:text-zinc-50"
              : "text-zinc-500 dark:text-zinc-400"
          }`}
        >
          <MonitorPlay className="w-5 h-5" />
          <span className="text-xs font-medium">Counter</span>
        </Link>
        <Link
          href="/admin"
          className="flex flex-col items-center justify-center w-full h-full gap-1 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors"
        >
          <UserCircle className="w-5 h-5" />
          <span className="text-xs font-medium">Admin</span>
        </Link>
      </nav>
    </div>
  );
}
