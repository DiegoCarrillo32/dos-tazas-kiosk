"use client";

import { createContext, useContext, useState } from "react";
import { en } from "./en";
import { es } from "./es";

export type Lang = "en" | "es";

const translations = { en, es };

function get(obj: Record<string, unknown>, path: string): string {
  let cur: unknown = obj;
  for (const key of path.split(".")) {
    if (cur == null || typeof cur !== "object") return path;
    cur = (cur as Record<string, unknown>)[key];
  }
  return typeof cur === "string" ? cur : path;
}

function interpolate(str: string, vars?: Record<string, string | number>): string {
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
}

type TFn = (key: string, vars?: Record<string, string | number>) => string;

const LanguageContext = createContext<{
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: TFn;
}>({
  lang: "es",
  setLang: () => {},
  t: (k) => k,
});

/** One year, in seconds — the language should outlive any single shift. */
const LANG_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * The preference lives in a cookie rather than localStorage so the server
 * can read it while rendering. localStorage is only legible after hydration,
 * which forced a `useEffect` that flipped the language *after* first paint —
 * an English user watched the whole POS render in Spanish and then swap.
 * The root layout reads the cookie and seeds `initialLang`, so the very
 * first HTML is already in the right language (and `<html lang>` matches it).
 */
export function LanguageProvider({
  children,
  initialLang = "es",
}: {
  children: React.ReactNode;
  initialLang?: Lang;
}) {
  const [lang, setLangState] = useState<Lang>(initialLang);

  const setLang = (l: Lang) => {
    setLangState(l);
    document.cookie = `lang=${l}; path=/; max-age=${LANG_MAX_AGE}; samesite=lax`;
  };

  const t: TFn = (key, vars) => {
    const str = get(translations[lang] as unknown as Record<string, unknown>, key);
    return interpolate(str, vars);
  };

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export const useLanguage = () => useContext(LanguageContext);
export const useT = () => useContext(LanguageContext).t;
