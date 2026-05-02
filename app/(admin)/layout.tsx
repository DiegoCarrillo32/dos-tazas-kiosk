"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, Menu as MenuIcon, History, FileText, Store, LogOut, ArrowLeft } from "lucide-react";
import { createClient } from "@/utils/supabase/client";

const NAV_ITEMS = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/menu", label: "Menu & Inventory", icon: MenuIcon },
  { href: "/admin/history", label: "Transaction History", icon: History },
  { href: "/admin/reports", label: "Financial Reports", icon: FileText },
];

export default function AdminLayout({
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
    <div className="flex h-screen bg-zinc-50 dark:bg-zinc-950 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 bg-white dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 flex flex-col hidden md:flex shrink-0">
        <div className="p-6 flex items-center gap-3 border-b border-zinc-200 dark:border-zinc-800">
          <div className="bg-zinc-900 dark:bg-zinc-50 p-2 rounded-md">
            <Store className="w-5 h-5 text-zinc-50 dark:text-zinc-900" />
          </div>
          <div>
            <h1 className="font-bold tracking-tight text-zinc-900 dark:text-zinc-50">Dos Tazas</h1>
            <p className="text-xs text-zinc-500">Admin Portal</p>
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
                    ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50"
                    : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 hover:text-zinc-900 dark:hover:text-zinc-50"
                }`}
              >
                <Icon className={`w-5 h-5 ${isActive ? "text-zinc-900 dark:text-zinc-50" : "text-zinc-400"}`} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 space-y-2">
          <Link
            href="/pos/floor"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-zinc-400" />
            Back to POS
          </Link>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
          >
            <LogOut className="w-5 h-5 text-red-500" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        <div className="md:hidden flex items-center justify-between p-4 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
          <h1 className="font-bold tracking-tight">Admin Portal</h1>
          <Link href="/pos/floor" className="text-sm font-medium text-zinc-500">Back to POS</Link>
        </div>
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
