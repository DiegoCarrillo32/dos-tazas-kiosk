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
 * Whether a money amount is zero *as the reader sees it*.
 *
 * Colones are displayed in whole units (formatMoney rounds), but the stored
 * figures carry two decimals from the IVA split, and close_shift rounds only
 * the counted side of the drawer (00014:381). So a shift that reconciled to
 * the colón lands on a cash_variance like 0.37 — which printed as a red "₡0"
 * on the Z-report and in the shift list. Compare on the displayed value
 * instead of on strict equality.
 */
export function isZeroMoney(
  amount: number | null | undefined,
  currency = "CRC"
): boolean {
  if (amount == null) return false;
  const n = Number(amount) || 0;
  return currency === "CRC" ? Math.round(n) === 0 : Math.abs(n) < 0.005;
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
