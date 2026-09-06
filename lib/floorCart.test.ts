import { describe, expect, it } from "vitest";
import type { CartItem, MenuItem } from "./types";
import {
  FLOOR_CART_MAX_AGE_MS,
  parseStoredCart,
  reconcileCart,
  type StoredFloorCart,
} from "./floorCart";

const NOW = 1_700_000_000_000;

function makeMenuItem(overrides: Partial<MenuItem> = {}): MenuItem {
  return {
    id: "item-1",
    name: "Café Americano",
    price: 1500,
    is_available: true,
    track_inventory: false,
    available_quantity: 0,
    low_stock_threshold: 0,
    ...overrides,
  } as unknown as MenuItem;
}

function makeCartItem(overrides: Partial<CartItem> = {}): CartItem {
  return {
    cartId: "cart-1",
    menuItem: makeMenuItem(),
    quantity: 1,
    selectedModifiers: [],
    ...overrides,
  };
}

function stored(overrides: Partial<StoredFloorCart> = {}): string {
  return JSON.stringify({
    items: [makeCartItem()],
    tableId: null,
    savedAt: NOW,
    ...overrides,
  });
}

describe("parseStoredCart", () => {
  it("restores a cart saved moments ago", () => {
    const result = parseStoredCart(stored(), NOW);
    expect(result?.items).toHaveLength(1);
    expect(result?.items[0].menuItem.id).toBe("item-1");
  });

  it("keeps the selected table", () => {
    expect(parseStoredCart(stored({ tableId: "mesa-2" }), NOW)?.tableId).toBe("mesa-2");
  });

  it("drops a cart older than one shift", () => {
    const old = stored({ savedAt: NOW - FLOOR_CART_MAX_AGE_MS - 1 });
    expect(parseStoredCart(old, NOW)).toBeNull();
  });

  it("keeps a cart right at the age limit", () => {
    const edge = stored({ savedAt: NOW - FLOOR_CART_MAX_AGE_MS });
    expect(parseStoredCart(edge, NOW)).not.toBeNull();
  });

  it("distrusts a timestamp from the future", () => {
    // A device whose clock jumped backwards would otherwise make a cart
    // effectively immortal, since `now - savedAt` never grows past the cap.
    expect(parseStoredCart(stored({ savedAt: NOW + 5 * 60_000 }), NOW)).toBeNull();
  });

  it("returns null for absent, malformed or empty carts", () => {
    expect(parseStoredCart(null, NOW)).toBeNull();
    expect(parseStoredCart("{not json", NOW)).toBeNull();
    expect(parseStoredCart(JSON.stringify({ items: [], savedAt: NOW }), NOW)).toBeNull();
    expect(parseStoredCart(JSON.stringify({ items: [makeCartItem()] }), NOW)).toBeNull();
  });

  it("discards individual lines that aren't shaped like cart items", () => {
    const mixed = JSON.stringify({
      items: [makeCartItem(), { cartId: "junk" }, null],
      tableId: null,
      savedAt: NOW,
    });
    expect(parseStoredCart(mixed, NOW)?.items).toHaveLength(1);
  });

  it("preserves a line's note", () => {
    const withNote = stored({ items: [makeCartItem({ notes: "sin azúcar" })] });
    expect(parseStoredCart(withNote, NOW)?.items[0].notes).toBe("sin azúcar");
  });
});

describe("reconcileCart", () => {
  it("drops lines whose menu item no longer exists", () => {
    // A deleted or deactivated item would otherwise fail server-side at
    // create_order, after the cashier had already rung up the whole order.
    const cart = [makeCartItem(), makeCartItem({ cartId: "cart-2", menuItem: makeMenuItem({ id: "gone" }) })];
    const result = reconcileCart(cart, [makeMenuItem()]);
    expect(result).toHaveLength(1);
    expect(result[0].cartId).toBe("cart-1");
  });

  it("re-points surviving lines at the live menu item", () => {
    const cart = [makeCartItem({ menuItem: makeMenuItem({ price: 1500 }) })];
    const result = reconcileCart(cart, [makeMenuItem({ price: 1800, name: "Café Americano Grande" })]);
    expect(result[0].menuItem.price).toBe(1800);
    expect(result[0].menuItem.name).toBe("Café Americano Grande");
  });

  it("keeps quantity, modifiers and notes untouched", () => {
    const cart = [makeCartItem({ quantity: 3, notes: "para llevar" })];
    const result = reconcileCart(cart, [makeMenuItem({ price: 1800 })]);
    expect(result[0].quantity).toBe(3);
    expect(result[0].notes).toBe("para llevar");
  });

  it("empties the cart when the whole menu is gone", () => {
    expect(reconcileCart([makeCartItem()], [])).toEqual([]);
  });
});
