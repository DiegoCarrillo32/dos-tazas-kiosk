import type { CartItem, MenuItem } from "./types";

/**
 * Draft-cart persistence for the Floor.
 *
 * The in-progress cart was the one piece of state in the app that survived
 * nothing — React Query's cache is persisted (lib/QueryProvider.tsx) and
 * queued writes live in IndexedDB (lib/offline/db.ts), but a reload, an
 * accidental back-swipe, or iOS reclaiming a backgrounded tab threw away a
 * half-built order.
 *
 * localStorage rather than the IndexedDB outbox on purpose: this is a
 * *draft*, not a queued write. Putting it in the outbox would enter it into
 * the strict-FIFO sync queue and it would get sent on its own.
 *
 * The read/reconcile logic is deliberately pure (plain data in, plain data
 * out) so it is testable under vitest's node environment — see
 * lib/floorCart.test.ts.
 */

export const FLOOR_CART_KEY = "dostazas.floorCart";

/**
 * A cart older than one shift is stale — the morning shift shouldn't be
 * greeted by whatever last night's cashier abandoned mid-order.
 */
export const FLOOR_CART_MAX_AGE_MS = 8 * 60 * 60 * 1000;

export type StoredFloorCart = {
  items: CartItem[];
  tableId: string | null;
  savedAt: number;
};

/**
 * Reconcile a restored cart against the menu as it is *now*.
 *
 * Two things can have changed while the cart sat in storage: an item can
 * have been deleted or deactivated (a stale line would fail server-side at
 * create_order), and an item's price or availability can have moved. So
 * drop lines whose menu item is gone, and re-point the survivors at the
 * live MenuItem so the cart shows current prices and stock.
 *
 * Prices are only ever a display concern here — `cartItemsToRpcItems` sends
 * IDs, never money — but showing a stale price to a customer is still wrong.
 */
export function reconcileCart(items: CartItem[], menuItems: MenuItem[]): CartItem[] {
  const byId = new Map(menuItems.map((m) => [m.id, m]));
  return items.flatMap((item) => {
    const live = byId.get(item.menuItem.id);
    if (!live) return [];
    return [{ ...item, menuItem: live }];
  });
}

/** Parse and validate whatever came back from storage. Returns null for anything unusable. */
export function parseStoredCart(raw: string | null, now = Date.now()): StoredFloorCart | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;

  const { items, tableId, savedAt } = parsed as Partial<StoredFloorCart>;
  if (!Array.isArray(items) || items.length === 0) return null;
  if (typeof savedAt !== "number" || !Number.isFinite(savedAt)) return null;
  if (now - savedAt > FLOOR_CART_MAX_AGE_MS) return null;
  // A clock that jumped backwards (or a hand-edited value) shouldn't make a
  // cart immortal — treat a future timestamp as untrustworthy.
  if (savedAt > now + 60_000) return null;

  const valid = items.filter(
    (i): i is CartItem =>
      !!i &&
      typeof i === "object" &&
      typeof (i as CartItem).cartId === "string" &&
      typeof (i as CartItem).quantity === "number" &&
      !!(i as CartItem).menuItem?.id &&
      Array.isArray((i as CartItem).selectedModifiers)
  );
  if (valid.length === 0) return null;

  return {
    items: valid,
    tableId: typeof tableId === "string" ? tableId : null,
    savedAt,
  };
}

export function loadFloorCart(now = Date.now()): StoredFloorCart | null {
  if (typeof window === "undefined") return null;
  try {
    return parseStoredCart(window.localStorage.getItem(FLOOR_CART_KEY), now);
  } catch {
    return null;
  }
}

export function saveFloorCart(items: CartItem[], tableId: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (items.length === 0) {
      window.localStorage.removeItem(FLOOR_CART_KEY);
      return;
    }
    const payload: StoredFloorCart = { items, tableId, savedAt: Date.now() };
    window.localStorage.setItem(FLOOR_CART_KEY, JSON.stringify(payload));
  } catch {
    // Storage full or blocked (private mode). Persistence is a convenience,
    // never a precondition for taking an order — carry on with in-memory state.
  }
}

export function clearFloorCart(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(FLOOR_CART_KEY);
  } catch {
    // Nothing to clear.
  }
}
