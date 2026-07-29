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
export function Modal({
  title,
  children,
  onClose,
  size = "sm",
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  /** sm ≈ 24rem, md ≈ 28rem, lg ≈ 32rem. Default sm. */
  size?: "sm" | "md" | "lg";
}) {
  const maxWidth = size === "lg" ? "max-w-lg" : size === "md" ? "max-w-md" : "max-w-sm";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div
        className={cn(
          "relative w-full bg-card rounded-2xl border border-warm-roast/10 shadow-xl p-6 max-h-[85vh] overflow-y-auto",
          maxWidth
        )}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-expresso">{title}</h3>
          <button onClick={onClose} className="p-1.5 text-expresso/40 hover:text-expresso">
            <X className="w-5 h-5" />
          </button>
        </div>
        {children}
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
const SHEET_MAX_WIDTH: Record<"sm" | "md", string> = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-md",
};

export function Sheet({
  children,
  onClose,
  maxWidth = "sm",
  maxHeight = "80vh",
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
