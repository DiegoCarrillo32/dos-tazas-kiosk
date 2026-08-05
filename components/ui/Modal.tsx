"use client";

import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The shared centered-dialog shell — backdrop, card, title bar with a
 * close button. Was `ShiftModal` in components/ShiftDialogs.tsx, used
 * only by the shift dialogs and the sync queue panel; every admin CRUD
 * modal (menu item, category, modifier, staff invite, order detail) had
 * hand-rolled its own near-identical version instead of sharing this one.
 *
 * For the "bottom sheet on mobile, centered on desktop" pattern used by
 * the Receipt, the Z-report and the Floor's modifier drawer, see `Sheet`
 * below — that's a deliberately different shape (touch-first, one-handed
 * reach on a phone), not a variant of this one.
 */
// Literal for the same Tailwind-scanner reason SHEET_MAX_WIDTH is below —
// don't build this by interpolation.
const MODAL_MAX_WIDTH: Record<"sm" | "md" | "lg" | "xl", string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-2xl",
};

export function Modal({
  title,
  children,
  onClose,
  size = "sm",
  footer,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  /** sm ≈ 24rem, md ≈ 28rem, lg ≈ 32rem, xl ≈ 42rem (tablet-width forms). Default sm. */
  size?: "sm" | "md" | "lg" | "xl";
  /**
   * Optional pinned action row below the scrolling body — e.g. the primary
   * submit button. Without it the panel behaves as before (everything,
   * including any buttons in `children`, scrolls with the body); dialogs
   * with a lot of content and a primary action (CloseShiftDialog being the
   * motivating case) should move their buttons here so they stay reachable.
   */
  footer?: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div
        className={cn(
          "relative w-full bg-card rounded-2xl border border-warm-roast/10 shadow-xl flex flex-col max-h-modal",
          MODAL_MAX_WIDTH[size]
        )}
      >
        <div className="shrink-0 flex items-center justify-between gap-3 px-6 pt-6 pb-4 border-b border-warm-roast/10">
          <h3 className="text-lg font-bold text-expresso">{title}</h3>
          <button
            onClick={onClose}
            className="shrink-0 inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded-lg text-expresso/40 hover:text-expresso hover:bg-warm-roast/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-6">{children}</div>
        {footer && (
          <div className="shrink-0 p-6 pt-4 border-t border-warm-roast/10 bg-card">{footer}</div>
        )}
      </div>
    </div>
  );
}

/**
 * The bottom-sheet-on-mobile, centered-on-desktop shell used by the
 * Receipt, the Z-report, and the Floor's modifier drawer — pulled out of
 * three near-identical copies. Deliberately has no title bar: each of
 * those three renders its own header (a receipt logo, a shift summary,
 * a product name + price), which don't share a common shape the way the
 * `Modal` dialogs' "title + close button" does.
 */
// Tailwind's scanner needs each class name to appear as a literal string
// somewhere in scanned source — a template-built `sm:max-w-${x}` would
// silently emit no CSS at all for values it can't statically see. This
// map is that literal appearance; extend it (not string interpolation)
// if a caller needs a size beyond what Receipt/ZReport/ModifierDrawer use.
const SHEET_MAX_WIDTH: Record<"sm" | "md" | "lg", string> = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-md",
  lg: "sm:max-w-lg",
};

export function Sheet({
  children,
  onClose,
  maxWidth = "sm",
  maxHeight = "80dvh",
  className,
  wrapperClassName,
}: {
  children: React.ReactNode;
  onClose: () => void;
  maxWidth?: keyof typeof SHEET_MAX_WIDTH;
  /** CSS max-height value, e.g. "80vh". */
  maxHeight?: string;
  className?: string;
  /** Extra class(es) on the outermost fixed-position wrapper — e.g. "no-print". */
  wrapperClassName?: string;
}) {
  return (
    <div className={cn("fixed inset-0 z-50 flex items-end sm:items-center justify-center", wrapperClassName)}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div
        className={cn(
          "relative w-full bg-card rounded-t-2xl sm:rounded-2xl border border-warm-roast/10 shadow-xl flex flex-col",
          SHEET_MAX_WIDTH[maxWidth],
          className
        )}
        style={{ maxHeight }}
      >
        {children}
      </div>
    </div>
  );
}
