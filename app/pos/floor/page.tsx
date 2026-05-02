"use client";

import { useState } from "react";
import { Coffee, Plus, Minus, Trash2, Send, Loader2, X } from "lucide-react";
import type { MenuItem, ModifierOption, CartItem, SelectedModifier, Modifier } from "@/lib/types";
import { fetchModifiersForItem } from "@/lib/queries";
import { useCategories, useMenuItems, useCreateOrder } from "@/lib/hooks";
import { Button } from "@/components/ui/Button";

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
    const existing = selected.find((s) => s.option.id === option.id);
    if (existing) {
      setSelected(selected.filter((s) => s.option.id !== option.id));
    } else {
      if (!mod.is_multiple) {
        setSelected([
          ...selected.filter((s) => s.modifierId !== mod.id),
          { modifierId: mod.id, modifierName: mod.name, option },
        ]);
      } else {
        setSelected([
          ...selected,
          { modifierId: mod.id, modifierName: mod.name, option },
        ]);
      }
    }
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
      cartId: Math.random().toString(36).substr(2, 9),
      menuItem,
      quantity: 1,
      selectedModifiers: selected,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-md bg-white dark:bg-zinc-900 rounded-t-2xl sm:rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-xl max-h-[80vh] flex flex-col">
        <div className="p-5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between shrink-0">
          <div>
            <h3 className="font-bold text-lg text-zinc-900 dark:text-zinc-50">{menuItem.name}</h3>
            <p className="text-sm text-zinc-500">${Number(menuItem.price).toFixed(2)}</p>
          </div>
          <button onClick={onClose} className="p-2 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50 rounded-md transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {modifiers.length === 0 ? (
            <p className="text-sm text-zinc-400 text-center py-4">No modifiers available.</p>
          ) : (
            modifiers.map((mod) => (
              <div key={mod.id}>
                <h4 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider mb-3">
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
                            ? "bg-zinc-900 text-zinc-50 dark:bg-zinc-50 dark:text-zinc-900 border-transparent"
                            : "bg-zinc-50 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-500"
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
        <div className="p-5 border-t border-zinc-200 dark:border-zinc-800 shrink-0">
          <Button
            size="lg"
            onClick={handleConfirm}
            className="w-full bg-green-600 hover:bg-green-700 text-white border-transparent"
          >
            Add to Order — ${(Number(menuItem.price) + totalExtra).toFixed(2)}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Floor View ────────────────────────────────────────────────────

export default function FloorView() {
  const { data: categories = [], isLoading: catsLoading } = useCategories();
  const { data: menuItems = [], isLoading: itemsLoading } = useMenuItems();
  const createOrderMut = useCreateOrder();

  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [orderItems, setOrderItems] = useState<CartItem[]>([]);

  // Modifier drawer
  const [drawerItem, setDrawerItem] = useState<MenuItem | null>(null);
  const [drawerModifiers, setDrawerModifiers] = useState<Modifier[]>([]);
  const [isLoadingModifiers, setIsLoadingModifiers] = useState(false);

  const isLoading = catsLoading || itemsLoading;

  // Auto-select first category
  if (categories.length > 0 && !activeCategory) {
    setActiveCategory(categories[0].id);
  }

  const filteredProducts = activeCategory
    ? menuItems.filter((p) => p.category_id === activeCategory)
    : menuItems;

  const total = orderItems.reduce((sum, item) => {
    const modExtra = item.selectedModifiers.reduce((s, m) => s + m.option.extra_price, 0);
    return sum + (Number(item.menuItem.price) + modExtra) * item.quantity;
  }, 0);

  const handleProductClick = async (product: MenuItem) => {
    setIsLoadingModifiers(true);
    try {
      const mods = await fetchModifiersForItem(product.id);
      if (mods.length > 0) {
        setDrawerItem(product);
        setDrawerModifiers(mods);
      } else {
        addToOrder({
          cartId: Math.random().toString(36).substr(2, 9),
          menuItem: product,
          quantity: 1,
          selectedModifiers: [],
        });
      }
    } catch {
      addToOrder({
        cartId: Math.random().toString(36).substr(2, 9),
        menuItem: product,
        quantity: 1,
        selectedModifiers: [],
      });
    } finally {
      setIsLoadingModifiers(false);
    }
  };

  const addToOrder = (item: CartItem) => {
    setOrderItems((prev) => [...prev, item]);
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

  const handleSendToCounter = () => {
    if (orderItems.length === 0) return;
    createOrderMut.mutate(orderItems, {
      onSuccess: () => setOrderItems([]),
      onError: () => alert("Failed to send order. Please try again."),
    });
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row h-full">
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
      <div className="flex-1 flex flex-col h-[60vh] lg:h-full border-b lg:border-b-0 lg:border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
        <div className="flex overflow-x-auto p-4 gap-2 border-b border-zinc-200 dark:border-zinc-800 hide-scrollbar shrink-0">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`px-6 py-3 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                activeCategory === cat.id
                  ? "bg-zinc-900 text-zinc-50 dark:bg-zinc-50 dark:text-zinc-900 shadow-sm"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800"
              }`}
            >
              {cat.name}
            </button>
          ))}
          {categories.length === 0 && (
            <p className="text-sm text-zinc-400 p-2">No categories found. Add some in Admin → Menu.</p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 bg-zinc-50 dark:bg-zinc-950">
          {filteredProducts.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-zinc-400 space-y-2">
              <Coffee className="w-12 h-12 opacity-20" />
              <p className="text-sm">No products in this category.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredProducts.map((product) => (
                <button
                  key={product.id}
                  onClick={() => handleProductClick(product)}
                  className="aspect-square bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 flex flex-col items-center justify-center gap-3 hover:border-zinc-400 dark:hover:border-zinc-600 hover:shadow-md transition-all active:scale-95"
                >
                  <div className="bg-zinc-100 dark:bg-zinc-800 p-3 rounded-full">
                    <Coffee className="w-8 h-8 text-zinc-400 dark:text-zinc-500" />
                  </div>
                  <div className="text-center">
                    <h3 className="font-semibold text-sm text-zinc-900 dark:text-zinc-100 leading-tight">{product.name}</h3>
                    <p className="text-xs text-zinc-500 mt-1">${Number(product.price).toFixed(2)}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right: Current Order */}
      <div className="w-full lg:w-[400px] flex flex-col bg-white dark:bg-zinc-900 h-[40vh] lg:h-full shrink-0">
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
          <h2 className="font-bold text-lg text-zinc-900 dark:text-zinc-50">Current Order</h2>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-zinc-50/50 dark:bg-zinc-950/50">
          {orderItems.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-zinc-400 space-y-2">
              <Coffee className="w-12 h-12 opacity-20" />
              <p className="text-sm">No items in the order yet.</p>
            </div>
          ) : (
            orderItems.map((item) => {
              const modExtra = item.selectedModifiers.reduce((s, m) => s + m.option.extra_price, 0);
              const unitTotal = Number(item.menuItem.price) + modExtra;
              return (
                <div key={item.cartId} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-3 flex flex-col gap-3 shadow-sm">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-medium text-zinc-900 dark:text-zinc-100">{item.menuItem.name}</h4>
                      {item.selectedModifiers.length > 0 && (
                        <p className="text-xs text-zinc-400 mt-0.5">
                          {item.selectedModifiers.map((m) => m.option.name).join(", ")}
                        </p>
                      )}
                      <p className="text-sm text-zinc-500">${unitTotal.toFixed(2)} each</p>
                    </div>
                    <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                      ${(unitTotal * item.quantity).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 bg-zinc-100 dark:bg-zinc-800 rounded-md p-1">
                      <button onClick={() => updateQuantity(item.cartId, -1)} className="p-1 hover:bg-white dark:hover:bg-zinc-700 rounded text-zinc-600 dark:text-zinc-300 transition-colors">
                        <Minus className="w-4 h-4" />
                      </button>
                      <span className="w-6 text-center font-medium text-sm">{item.quantity}</span>
                      <button onClick={() => updateQuantity(item.cartId, 1)} className="p-1 hover:bg-white dark:hover:bg-zinc-700 rounded text-zinc-600 dark:text-zinc-300 transition-colors">
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                    <button onClick={() => removeItem(item.cartId)} className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-950 rounded-md transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shrink-0">
          <div className="flex justify-between items-center mb-4">
            <span className="text-zinc-500 dark:text-zinc-400 font-medium">Total</span>
            <span className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">${total.toFixed(2)}</span>
          </div>
          <Button
            size="lg"
            onClick={handleSendToCounter}
            disabled={orderItems.length === 0}
            isLoading={createOrderMut.isPending}
            leftIcon={!createOrderMut.isPending && <Send className="w-5 h-5" />}
            className="w-full bg-green-600 hover:bg-green-700 text-white border-transparent"
          >
            Send to Counter
          </Button>
        </div>
      </div>
    </div>
  );
}
