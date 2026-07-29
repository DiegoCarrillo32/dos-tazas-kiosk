"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/LanguageContext";
import { Button } from "@/components/ui/Button";

/**
 * Replaces the browser's native `alert()` / `confirm()` across the app.
 * Both block the main thread, render outside the app's theme, and —
 * discovered while testing the offline-shift-open flow — are outright
 * disabled in some embedded/automated browser contexts, where
 * `confirm()` silently returns `false` with no visible dialog at all.
 * A checkout or void action gated on that native call would then just
 * silently do nothing, which is a strictly worse failure mode than an
 * on-brand dialog that actually renders.
 *
 * Mounted once at the root (see app/layout.tsx) so every page — POS and
 * Admin alike — shares one toast stack and one confirm dialog instead of
 * each screen managing its own dismissal state.
 */

type ToastVariant = "error" | "success";
type ToastItem = { id: number; message: string; variant: ToastVariant };

type ConfirmRequest = { message: string; resolve: (ok: boolean) => void };

type FeedbackContextValue = {
  toast: (message: string, variant?: ToastVariant) => void;
  confirm: (message: string) => Promise<boolean>;
};

const FeedbackContext = createContext<FeedbackContextValue | null>(null);

const TOAST_DURATION_MS = 5000;

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const t = useT();
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);
  const nextId = useRef(0);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, variant: ToastVariant = "error") => {
      const id = nextId.current++;
      setToasts((prev) => [...prev, { id, message, variant }]);
      setTimeout(() => dismissToast(id), TOAST_DURATION_MS);
    },
    [dismissToast]
  );

  // Only one confirm dialog can be open at a time in this app (they're
  // always a direct reaction to a tap), so a single pending request is
  // enough — no queue needed.
  const confirm = useCallback((message: string) => {
    return new Promise<boolean>((resolve) => {
      setConfirmRequest({ message, resolve });
    });
  }, []);

  const resolveConfirm = (ok: boolean) => {
    confirmRequest?.resolve(ok);
    setConfirmRequest(null);
  };

  const value = useMemo(() => ({ toast, confirm }), [toast, confirm]);

  return (
    <FeedbackContext.Provider value={value}>
      {children}

      {/* Toast stack */}
      <div className="fixed inset-x-0 bottom-0 z-[100] flex flex-col items-center gap-2 p-4 pointer-events-none sm:items-end">
        {toasts.map((item) => (
          <div
            key={item.id}
            role="alert"
            className={cn(
              "pointer-events-auto w-full max-w-sm rounded-xl border shadow-lg p-4 flex items-start gap-3",
              item.variant === "error"
                ? "bg-red-50 dark:bg-red-950/90 border-red-200 dark:border-red-900/40 text-red-800 dark:text-red-300"
                : "bg-green-50 dark:bg-green-950/90 border-green-200 dark:border-green-900/40 text-green-800 dark:text-green-300"
            )}
          >
            {item.variant === "error" ? (
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
            ) : (
              <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
            )}
            <p className="flex-1 text-sm font-medium">{item.message}</p>
            <button
              onClick={() => dismissToast(item.id)}
              className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
              aria-label={t("common.close")}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      {/* Confirm dialog */}
      {confirmRequest && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => resolveConfirm(false)} />
          <div className="relative w-full max-w-sm bg-card rounded-2xl border border-warm-roast/10 shadow-xl p-6 space-y-5">
            <p className="text-sm font-medium text-expresso whitespace-pre-line">{confirmRequest.message}</p>
            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => resolveConfirm(false)}>
                {t("common.cancel")}
              </Button>
              <Button
                className="flex-1 bg-coffee-fruit hover:bg-fruit-light text-white border-transparent"
                onClick={() => resolveConfirm(true)}
              >
                {t("common.confirm")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </FeedbackContext.Provider>
  );
}

function useFeedbackContext(): FeedbackContextValue {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error("useToast/useConfirm must be used within FeedbackProvider");
  return ctx;
}

/** Replaces `alert(message)`. Defaults to the error styling — pass "success" for a positive confirmation. */
export function useToast() {
  return useFeedbackContext().toast;
}

/** Replaces `confirm(message)`. `await confirm(message)` resolves to whether the user confirmed. */
export function useConfirm() {
  return useFeedbackContext().confirm;
}
