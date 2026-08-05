"use client";

import { useEffect } from "react";

/**
 * Both app shells are `h-app overflow-hidden` — a fixed kiosk frame, not a
 * scrolling page. On a tablet that's correct everywhere except when the OS
 * soft keyboard opens: it covers the bottom ~40% of the screen with no
 * browser chrome to push content out of the way, so a field low in the
 * layout (amount tendered, a denomination near the end of the list) can end
 * up entirely behind it with nothing the cashier can do about it.
 *
 * This nudges the focused field into view whenever the visual viewport
 * shrinks (the keyboard opening) or a text field is focused directly,
 * without attempting a full `visualViewport`-driven layout offset — that's
 * a lot more machinery than a kiosk-scale form needs.
 */
export function useScrollIntoViewOnFocus() {
  useEffect(() => {
    const isTextField = (el: EventTarget | null): el is HTMLElement =>
      !!el &&
      el instanceof HTMLElement &&
      (el.tagName === "INPUT" || el.tagName === "TEXTAREA") &&
      !(el as HTMLInputElement).readOnly &&
      !(el as HTMLInputElement).disabled;

    const scrollFocusedIntoView = () => {
      const active = document.activeElement;
      if (isTextField(active)) {
        active.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    };

    const onFocusIn = (e: FocusEvent) => {
      if (!isTextField(e.target)) return;
      // Give the keyboard time to finish animating in before measuring;
      // scrolling immediately on focus can land short of where the field
      // ends up once the viewport has actually shrunk.
      setTimeout(scrollFocusedIntoView, 150);
    };

    document.addEventListener("focusin", onFocusIn);

    // visualViewport resize covers the case where the keyboard opens
    // without a fresh focus event (e.g. rotating while a field is focused).
    const vv = window.visualViewport;
    vv?.addEventListener("resize", scrollFocusedIntoView);

    return () => {
      document.removeEventListener("focusin", onFocusIn);
      vv?.removeEventListener("resize", scrollFocusedIntoView);
    };
  }, []);
}
