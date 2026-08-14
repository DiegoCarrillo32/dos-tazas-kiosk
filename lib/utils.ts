import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format a money amount for display. Costa Rican colones (CRC) are whole
 * numbers shown with a ₡ sign and thousands separators; other currencies
 * fall back to a 2-decimal amount with a $ sign.
 */
export function formatMoney(amount: number | string, currency = "CRC"): string {
  const n = Number(amount) || 0;
  if (currency === "CRC") {
    return "₡" + Math.round(n).toLocaleString("es-CR");
  }
  return "$" + n.toFixed(2);
}

/**
 * Lowercase and strip diacritics for accent-insensitive search, e.g. so a
 * search for "cafe" matches "Café".
 */
export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}
