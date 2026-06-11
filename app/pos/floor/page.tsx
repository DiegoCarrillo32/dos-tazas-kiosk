"use client";

import { useState } from "react";
import { Coffee, Plus, Minus, Trash2, Send, Loader2, X, ShoppingBag, Armchair } from "lucide-react";
import type { MenuItem, ModifierOption, CartItem, SelectedModifier, Modifier, OrderItem } from "@/lib/types";
import { fetchModifiersForItem } from "@/lib/queries";
import {
  useCategories,
  useMenuItems,
  useCreateOrder,
  useAppendToOrder,
  useTables,
  useParkedOrders,
  useOrdersRealtime,
  useLocationSettings,
} from "@/lib/hooks";
import { formatMoney } from "@/lib/utils";
import { Button } from "@/components/ui/Button";

const generateCartId = () => Math.random().toString(36).substring(2, 11);

// ─── Modifier Drawer ──────────────────────────────────────────────

function ModifierDrawer({
  menuItem,
  modifiers,
  onConfirm,
  onClose,
}: {
  menuItem: MenuItem;
  modifiers: Modifier[];
  onConfirm: (item: CartItem) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<SelectedModifier[]>([]);

  const toggleOption = (mod: Modifier, option: ModifierOption) => {
    if (!option) return;
    // Use a functional updater so rapid successive taps (before a re-render)
    // each build on the latest selection instead of a stale closure.
    setSelected((prev) => {
      if (prev.some((s) => s.option.id === option.id)) {
        return prev.filter((s) => s.option.id !== option.id);
      }
      if (!mod.is_multiple) {
        return [
          ...prev.filter((s) => s.modifierId !== mod.id),
          { modifierId: mod.id, modifierName: mod.name, option },
        ];
      }
      return [...prev, { modifierId: mod.id, modifierName: mod.name, option }];
    });
  };

  const totalExtra = selected.reduce((s, m) => s + m.option.extra_price, 0);

  const handleConfirm = () => {
    for (const mod of modifiers) {
      if (mod.is_required && !selected.some((s) => s.modifierId === mod.id)) {
        alert(`Please select an option for "${mod.name}"`);
        return;
      }
    }
    onConfirm({
      cartId: generateCartId(),
      menuItem,
      quantity: 1,
      selectedModifiers: selected,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-md bg-card rounded-t-2xl sm:rounded-2xl border border-warm-roast/10 shadow-xl max-h-[80vh] flex flex-col">
        <div className="p-5 border-b border-warm-roast/10 flex items-center justify-between shrink-0">
          <div>
            <h3 className="font-bold text-lg text-expresso">{menuItem.name}</h3>
            <p className="text-sm text-expresso/60">${Number(menuItem.price).toFixed(2)}</p>
          </div>
          <button onClick={onClose} className="p-2 text-expresso/40 hover:text-expresso rounded-md transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {modifiers.length === 0 ? (
            <p className="text-sm text-expresso/40 text-center py-4">No modifiers available.</p>
          ) : (
            modifiers.map((mod) => (
              <div key={mod.id}>
                <h4 className="text-sm font-semibold text-expresso/60 uppercase tracking-wider mb-3">
                  {mod.name}
                  {mod.is_required && <span className="text-red-500 ml-1">*</span>}
                </h4>
                <div className="space-y-2">
                  {(mod.options ?? []).map((opt) => {
                    const isSelected = selected.some((s) => s.option.id === opt.id);
                    return (
                      <button
                        key={opt.id}
                        onClick={() => toggleOption(mod, opt)}
                        className={`w-full flex items-center justify-between p-3 rounded-lg border transition-all text-left ${
                          isSelected
                            ? "bg-coffee-fruit text-white border-transparent"
                            : "bg-warm-roast/5 text-expresso/80 border-warm-roast/15 hover:border-warm-roast/40"
                        }`}
                      >
                        <span className="font-medium text-sm">{opt.name}</span>
                        {opt.extra_price > 0 && (
                          <span className="text-xs opacity-70">+${Number(opt.extra_price).toFixed(2)}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
        <div className="p-5 border-t border-warm-roast/10 shrink-0">
          <Button
            size="lg"
            onClick={handleConfirm}
            className="w-full bg-coffee-fruit hover:bg-fruit-light text-white border-transparent"
          >
            Add to Order — ${(Number(menuItem.price) + totalExtra).toFixed(2)}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────

const areModifiersEqual = (a: SelectedModifier[], b: SelectedModifier[]) => {
  if (a.length !== b.length) return false;
  const aOptionIds = new Set(a.map((m) => m.option.id));
  return b.every((m) => aOptionIds.has(m.option.id));
};

// ─── Floor View ────────────────────────────────────────────────────

export default function FloorView() {
  const { data: categories = [], isLoading: catsLoading } = useCategories();
  const { data: menuItems = [], isLoading: itemsLoading } = useMenuItems();
  const { data: tables = [] } = useTables();
  const { data: parkedOrders = [] } = useParkedOrders();
  const { data: settings } = useLocationSettings();
  const currency = settings?.currency ?? "CRC";
  const createOrderMut = useCreateOrder();
  const appendOrderMut = useAppendToOrder();
  useOrdersRealtime();

  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [orderItems, setOrderItems] = useState<CartItem[]>([]);
  const [isOrderExpanded, setIsOrderExpanded] = useState(false);
  // null = Takeaway / walk-in (no table)
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);

  // Table tabs: which tables already have an open (parked) order, and the
  // currently-selected table's open tab (if any) so we append to it.
  const occupiedTableIds = new Set(
    parkedOrders.map((o) => o.table_id).filter(Boolean) as string[]
  );
  const openTab = selectedTableId
    ? parkedOrders.find((o) => o.table_id === selectedTableId) ?? null
    : null;
  const selectedTableName = selectedTableId
    ? tables.find((t) => t.id === selectedTableId)?.name ?? "Table"
    : "Takeaway";
  const tabExistingTotal = openTab ? Number(openTab.total_amount) : 0;

  // Modifier drawer
  const [drawerItem, setDrawerItem] = useState<MenuItem | null>(null);
  const [drawerModifiers, setDrawerModifiers] = useState<Modifier[]>([]);
  const [isLoadingModifiers, setIsLoadingModifiers] = useState(false);

  const isLoading = catsLoading || itemsLoading;

  // Derive the effective category instead of setting state during render.
  // Falls back to the first category until the user explicitly picks one.
  const effectiveCategory = activeCategory ?? categories[0]?.id ?? null;

  const filteredProducts = effectiveCategory
    ? menuItems.filter((p) => p.category_id === effectiveCategory)
    : menuItems;

  const total = orderItems.reduce((sum, item) => {
    const modExtra = item.selectedModifiers.reduce((s, m) => s + m.option.extra_price, 0);
    return sum + (Number(item.menuItem.price) + modExtra) * item.quantity;
  }, 0);

  const totalQuantity = orderItems.reduce((sum, item) => sum + item.quantity, 0);

  const handleProductClick = async (product: MenuItem) => {
    setIsLoadingModifiers(true);
    try {
      const mods = await fetchModifiersForItem(product.id);
      if (mods.length > 0) {
        setDrawerItem(product);
        setDrawerModifiers(mods);
      } else {
        addToOrder({
          cartId: generateCartId(),
          menuItem: product,
          quantity: 1,
          selectedModifiers: [],
        });
      }
    } catch {
      addToOrder({
        cartId: generateCartId(),
        menuItem: product,
        quantity: 1,
        selectedModifiers: [],
      });
    } finally {
      setIsLoadingModifiers(false);
    }
  };

  const addToOrder = (newItem: CartItem) => {
    setOrderItems((prev) => {
      const existingIndex = prev.findIndex(
        (item) =>
          item.menuItem.id === newItem.menuItem.id &&
          areModifiersEqual(item.selectedModifiers, newItem.selectedModifiers)
      );

      if (existingIndex > -1) {
        const updated = [...prev];
        updated[existingIndex] = {
          ...updated[existingIndex],
          quantity: updated[existingIndex].quantity + newItem.quantity,
        };
        return updated;
      }

      return [...prev, newItem];
    });
    setDrawerItem(null);
    setDrawerModifiers([]);
  };

  const updateQuantity = (cartId: string, delta: number) => {
    setOrderItems((items) =>
      items.map((item) =>
        item.cartId === cartId
          ? { ...item, quantity: Math.max(1, item.quantity + delta) }
          : item
      )
    );
  };

  const removeItem = (cartId: string) => {
    setOrderItems((items) => items.filter((item) => item.cartId !== cartId));
  };

  const isSending = createOrderMut.isPending || appendOrderMut.isPending;

  const handleSend = () => {
    if (orderItems.length === 0) return;
    if (openTab) {
      // Add to the table's existing running tab.
      appendOrderMut.mutate(
        { orderId: openTab.id, cartItems: orderItems },
        {
          onSuccess: () => {
            setOrderItems([]);
            setIsOrderExpanded(false);
          },
          onError: () => alert("Failed to add to tab. Please try again."),
        }
      );
    } else {
      // Open a new order/tab (with the chosen table, or takeaway).
      createOrderMut.mutate(
        { cartItems: orderItems, tableId: selectedTableId },
        {
          onSuccess: () => {
            setOrderItems([]);
            setIsOrderExpanded(false);
          },
          onError: () => alert("Failed to send order. Please try again."),
        }
      );
    }
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-expresso/40" />
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row h-full pb-[140px] sm:pb-[76px] lg:pb-0 relative overflow-hidden">
      {drawerItem && (
        <ModifierDrawer
          menuItem={drawerItem}
          modifiers={drawerModifiers}
          onConfirm={addToOrder}
          onClose={() => { setDrawerItem(null); setDrawerModifiers([]); }}
        />
      )}

      {isLoadingModifiers && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/20 backdrop-blur-sm">
          <Loader2 className="w-8 h-8 animate-spin text-white" />
        </div>
      )}

      {/* Left: Categories & Products */}
      <div className="flex-1 flex flex-col h-full border-r border-warm-roast/10 bg-card overflow-hidden">
        {/* Table selector */}
        <div className="flex items-center gap-2 overflow-x-auto px-4 py-2.5 border-b border-warm-roast/10 hide-scrollbar shrink-0 bg-muted/30">
          <span className="text-xs font-semibold text-expresso/50 uppercase tracking-wider shrink-0 pr-1">Table</span>
          <button
            onClick={() => setSelectedTableId(null)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
              selectedTableId === null
                ? "bg-coffee-fruit text-white shadow-sm"
                : "bg-warm-roast/10 text-expresso/70 hover:bg-warm-roast/20"
            }`}
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            Takeaway
          </button>
          {tables.map((t) => {
            const occupied = occupiedTableIds.has(t.id);
            const active = selectedTableId === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setSelectedTableId(t.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                  active
                    ? "bg-coffee-fruit text-white shadow-sm"
                    : occupied
                      ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 hover:bg-amber-200"
                      : "bg-warm-roast/10 text-expresso/70 hover:bg-warm-roast/20"
                }`}
              >
                <Armchair className="w-3.5 h-3.5" />
                {t.name}
                {occupied && <span className={`w-1.5 h-1.5 rounded-full ${active ? "bg-white" : "bg-amber-500"}`} />}
              </button>
            );
          })}
          {tables.length === 0 && (
            <span className="text-xs text-expresso/40">No tables yet — add some in Admin → Tables.</span>
          )}
        </div>

        <div className="flex overflow-x-auto p-4 gap-2 border-b border-warm-roast/10 hide-scrollbar shrink-0">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`px-6 py-3 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                effectiveCategory === cat.id
                  ? "bg-coffee-fruit text-white shadow-sm"
                  : "bg-warm-roast/10 text-expresso/70 hover:bg-warm-roast/20"
              }`}
            >
              {cat.name}
            </button>
          ))}
          {categories.length === 0 && (
            <p className="text-sm text-expresso/40 p-2">No categories found. Add some in Admin → Menu.</p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 bg-background">
          {filteredProducts.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-expresso/40 space-y-2">
              <Coffee className="w-12 h-12 opacity-20" />
              <p className="text-sm">No products in this category.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredProducts.map((product) => {
                const soldOut =
                  product.is_available === false ||
                  (product.track_inventory && product.available_quantity <= 0);
                const lowStock =
                  product.track_inventory &&
                  product.available_quantity > 0 &&
                  product.available_quantity <= product.low_stock_threshold;
                return (
                  <button
                    key={product.id}
                    onClick={() => !soldOut && handleProductClick(product)}
                    disabled={soldOut}
                    className={`relative aspect-square bg-card border border-warm-roast/10 rounded-xl p-4 flex flex-col items-center justify-center gap-3 transition-all ${
                      soldOut
                        ? "opacity-50 cursor-not-allowed"
                        : "hover:border-warm-roast/40 hover:shadow-md active:scale-95"
                    }`}
                  >
                    {soldOut && (
                      <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-400">
                        Sold out
                      </span>
                    )}
                    {!soldOut && lowStock && (
                      <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-400">
                        {product.available_quantity} left
                      </span>
                    )}
                    <div className="bg-warm-roast/10 p-3 rounded-full">
                      <Coffee className="w-8 h-8 text-expresso/40" />
                    </div>
                    <div className="text-center">
                      <h3 className="font-semibold text-sm text-expresso leading-tight">{product.name}</h3>
                      <p className="text-xs text-expresso/60 mt-1">{formatMoney(product.price, currency)}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Mobile Bottom Bar — sits above the layout's bottom tab nav on phones
          (bottom-16) and at the screen edge on tablets where that nav is hidden. */}
      <div className="lg:hidden fixed bottom-16 sm:bottom-0 left-0 right-0 bg-card border-t border-warm-roast/10 p-4 flex justify-between items-center z-30 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
        <div>
          <span className="font-semibold text-expresso">
            {totalQuantity} item{totalQuantity !== 1 ? "s" : ""}
          </span>
          <span className="text-expresso/60 text-sm ml-2">{formatMoney(total, currency)}</span>
          <span className="block text-xs text-expresso/50">{selectedTableName}{openTab ? " · open tab" : ""}</span>
        </div>
        <Button onClick={() => setIsOrderExpanded(true)} disabled={orderItems.length === 0}>View Order</Button>
      </div>

      {/* Right: Current Order */}
      <div className={`fixed inset-0 z-50 lg:static lg:z-auto w-full lg:w-[400px] flex flex-col bg-card h-full shrink-0 transition-transform duration-300 ${isOrderExpanded ? "translate-y-0" : "translate-y-full lg:translate-y-0"}`}>
        <div className="p-4 border-b border-warm-roast/10 shrink-0 flex justify-between items-center bg-card">
          <div className="flex items-center gap-2">
            {selectedTableId === null ? (
              <ShoppingBag className="w-4 h-4 text-expresso/50" />
            ) : (
              <Armchair className="w-4 h-4 text-expresso/50" />
            )}
            <h2 className="font-bold text-lg text-expresso">{selectedTableName}</h2>
            {openTab && (
              <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                Open tab
              </span>
            )}
          </div>
          <button className="lg:hidden p-2 text-expresso/60 hover:text-expresso" onClick={() => setIsOrderExpanded(false)}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-muted/40">
          {/* Existing items already on this table's tab (read-only) */}
          {openTab && (openTab.order_items ?? []).length > 0 && (
            <div className="bg-warm-roast/5 border border-warm-roast/10 rounded-lg p-3">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-semibold text-expresso/50 uppercase tracking-wider">Already on tab</span>
                <span className="text-xs font-semibold text-expresso/70">{formatMoney(tabExistingTotal, currency)}</span>
              </div>
              <div className="space-y-1">
                {(openTab.order_items ?? []).map((it: OrderItem) => (
                  <div key={it.id} className="flex justify-between text-sm text-expresso/70">
                    <span>{it.quantity}× {it.menu_item?.name ?? "Item"}</span>
                    <span>{formatMoney(it.total_price, currency)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {orderItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-expresso/40 space-y-2 py-10">
              <Coffee className="w-12 h-12 opacity-20" />
              <p className="text-sm">{openTab ? "Add items to this tab." : "No items in the order yet."}</p>
            </div>
          ) : (
            orderItems.map((item) => {
              const modExtra = item.selectedModifiers.reduce((s, m) => s + m.option.extra_price, 0);
              const unitTotal = Number(item.menuItem.price) + modExtra;
              return (
                <div key={item.cartId} className="bg-card border border-warm-roast/10 rounded-lg p-3 flex flex-col gap-3 shadow-sm">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-medium text-expresso">{item.menuItem.name}</h4>
                      {item.selectedModifiers.length > 0 && (
                        <p className="text-xs text-expresso/40 mt-0.5">
                          {item.selectedModifiers.map((m) => m.option.name).join(", ")}
                        </p>
                      )}
                      <p className="text-sm text-expresso/60">{formatMoney(unitTotal, currency)} each</p>
                    </div>
                    <span className="font-semibold text-expresso">
                      {formatMoney(unitTotal * item.quantity, currency)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1 bg-warm-roast/10 rounded-lg p-1">
                      <button onClick={() => updateQuantity(item.cartId, -1)} aria-label="Decrease quantity" className="h-10 w-10 flex items-center justify-center hover:bg-card rounded-md text-expresso/70 transition-colors active:scale-95">
                        <Minus className="w-4 h-4" />
                      </button>
                      <span className="w-8 text-center font-medium text-sm tabular-nums">{item.quantity}</span>
                      <button onClick={() => updateQuantity(item.cartId, 1)} aria-label="Increase quantity" className="h-10 w-10 flex items-center justify-center hover:bg-card rounded-md text-expresso/70 transition-colors active:scale-95">
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                    <button onClick={() => removeItem(item.cartId)} aria-label="Remove item" className="h-10 w-10 flex items-center justify-center text-red-500 hover:bg-red-50 dark:hover:bg-red-950 rounded-lg transition-colors active:scale-95">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="p-4 border-t border-warm-roast/10 bg-card shrink-0">
          {openTab && (
            <div className="flex justify-between items-center mb-1 text-sm text-expresso/60">
              <span>New items</span>
              <span>{formatMoney(total, currency)}</span>
            </div>
          )}
          <div className="flex justify-between items-center mb-4">
            <span className="text-expresso/60 font-medium">{openTab ? "Tab total" : "Total"}</span>
            <span className="text-2xl font-bold text-expresso">{formatMoney(tabExistingTotal + total, currency)}</span>
          </div>
          <Button
            size="lg"
            onClick={handleSend}
            disabled={orderItems.length === 0}
            isLoading={isSending}
            leftIcon={!isSending && <Send className="w-5 h-5" />}
            className="w-full bg-coffee-fruit hover:bg-fruit-light text-white border-transparent"
          >
            {openTab ? `Add to ${selectedTableName}` : selectedTableId ? `Open ${selectedTableName} Tab` : "Send to Counter"}
          </Button>
        </div>
      </div>
    </div>
  );
}
