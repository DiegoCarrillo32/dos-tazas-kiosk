"use client";

import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";

export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);

  useEffect(() => {
    // Sync with HTML class on mount
    const isDark = document.documentElement.classList.contains("dark");
    setTimeout(() => {
      setTheme(isDark ? "dark" : "light");
    }, 0);
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === "light" ? "dark" : "light";
    setTheme(nextTheme);
    if (nextTheme === "dark") {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  };

  if (theme === null) {
    // Avoid layout shifts or flash before mounting hydration
    return <div className="min-h-[44px] min-w-[44px]" />;
  }

  return (
    <button
      onClick={toggleTheme}
      className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg text-expresso/60 hover:bg-warm-roast/10 hover:text-expresso transition-all active:scale-95 duration-200"
      aria-label="Toggle theme"
    >
      {theme === "light" ? (
        <Moon className="w-5 h-5 transition-all duration-300" />
      ) : (
        <Sun className="w-5 h-5 transition-all duration-300" />
      )}
    </button>
  );
}
