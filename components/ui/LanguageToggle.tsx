"use client";

import { useLanguage } from "@/lib/i18n/LanguageContext";

export function LanguageToggle() {
  const { lang, setLang } = useLanguage();
  return (
    <button
      onClick={() => setLang(lang === "en" ? "es" : "en")}
      title={lang === "en" ? "Cambiar a Español" : "Switch to English"}
      className="px-3 min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-xs font-bold text-expresso/60 hover:text-expresso bg-warm-roast/10 hover:bg-warm-roast/20 rounded-md transition-colors tracking-wide"
    >
      {lang === "en" ? "ES" : "EN"}
    </button>
  );
}
