"use client";

import { useState, useMemo, useEffect } from "react";
import { Coffee, Plus, Minus, Trash2, Send, Loader2, X, ShoppingBag, Armchair, Search, Pencil, AlertTriangle } from "lucide-react";
import type { MenuItem, ModifierOption, CartItem, SelectedModifier, Modifier, OrderItem } from "@/lib/types";
import {
  useCategories,
  useMenuItems,
  useCreateOrder,
  useAppendToOrder,
  useTables,
  useParkedOrders,
  useOrdersRealtime,
  useLocationSettings,
  useAllModifiers,
  useMenuItemModifierMap,
  useCurrentShift,
} from "@/lib/hooks";
import { fetchOrderNumber } from "@/lib/queries";
import { formatMoney, normalizeText } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Sheet } from "@/components/ui/Modal";
import { useToast, useConfirm } from "@/components/ui/Feedback";
import { useT } from "@/lib/i18n/LanguageContext";
import { useConnectionStatus } from "@/lib/offline/useConnectionStatus";
import { enqueuePark } from "@/lib/offline/outbox";
import { isNetworkError } from "@/lib/offline/sync";
import { clearFloorCart, loadFloorCart, reconcileCart, saveFloorCart } from "@/lib/floorCart";

const generateCartId = () => Math.random().toString(36).substring(2, 11);

/** Stable identity, so an untouched cart doesn't look "changed" every render. */
const EMPTY_CART: CartItem[] = [];

// ─── Modifier Drawer ──────────────────────────────────────────────

function ModifierDrawer({
  menuItem,
  modifiers,
  currency,
  initialSelected,
  initialNotes,
  isEditing,
  onConfirm,
  onClose,
}: {
  menuItem: MenuItem;
  modifiers: Modifier[];
  currency: string;
  initialSelected?: SelectedModifier[];
  initialNotes?: string;
  isEditing?: boolean;
  onConfirm: (selected: SelectedModifier[], notes: string) => void;
  onClose: () => void;
}) {
  const t = useT();
  const toast = useToast();
  const [selected, setSelected] = useState<SelectedModifier[]>(initialSelected ?? []);
  const [notes, setNotes] = useState(initialNotes ?? "");

  const toggleOption = (mod: Modifier, option: ModifierOption) => {
    if (!option) return;
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

  // Chips append rather than replace: "sin azúcar" and "para llevar" are
  // routinely both true, and retyping the first one is exactly the friction
  // these are here to remove.
  const appendNote = (chip: string) => {
    setNotes((prev) => {
      const trimmed = prev.trim();
      if (!trimmed) return chip;
      if (normalizeText(trimmed).includes(normalizeText(chip))) return trimmed;
      return `${trimmed}, ${chip}`;
    });
  };

  const noteChips = [
    t("floor.noteChipNoSugar"),
    t("floor.noteChipExtraHot"),
    t("floor.noteChipIced"),
    t("floor.noteChipToGo"),
  ];

  const totalExtra = selected.reduce((s, m) => s + m.option.extra_price, 0);

  const handleConfirm = () => {
    for (const mod of modifiers) {
      if (mod.is_required && !selected.some((s) => s.modifierId === mod.id)) {
        toast(t("floor.selectOptionAlert", { name: mod.name }));
        return;
      }
    }
    onConfirm(selected, notes.trim());
  };

  return (
    <Sheet onClose={onClose} maxWidth="lg">
        <div className="p-5 border-b border-warm-roast/10 flex items-center justify-between shrink-0">
          <div>
            <h3 className="font-bold text-lg text-expresso">{menuItem.name}</h3>
            <p className="text-sm text-expresso/60">{formatMoney(menuItem.price, currency)}</p>
          </div>
          <button onClick={onClose} className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-expresso/40 hover:text-expresso rounded-md transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {modifiers.length === 0 ? (
            <p className="text-sm text-expresso/40 text-center py-4">{t("floor.noModifiers")}</p>
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
                          <span className="text-xs opacity-70">+{formatMoney(opt.extra_price, currency)}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}

          {/* Prep note — order_items.notes, which every order RPC already
              reads but nothing in the app has ever written. */}
          <div>
            <h4 className="text-sm font-semibold text-expresso/60 uppercase tracking-wider mb-3">
              {t("floor.note")}
            </h4>
            <Input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t("floor.notePlaceholder")}
              maxLength={120}
            />
            <div className="flex flex-wrap gap-2 mt-2">
              {noteChips.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => appendNote(chip)}
                  className="px-3.5 min-h-[44px] text-sm rounded-lg bg-warm-roast/10 text-expresso/70 hover:bg-warm-roast/20 transition-colors"
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="p-5 border-t border-warm-roast/10 shrink-0">
          <Button
            size="lg"
            onClick={handleConfirm}
            className="w-full bg-coffee-fruit hover:bg-fruit-light text-white border-transparent"
          >
            {isEditing ? t("floor.updateItem") : t("floor.addToOrder")} — {formatMoney(Number(menuItem.price) + totalExtra, currency)}
          </Button>
        </div>
    </Sheet>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────

/**
 * Whether two cart lines are the same thing and should merge into one row.
 *
 * The note is part of this on purpose: a "sin azúcar" latte and a plain
 * latte are different drinks to whoever makes them, and merging them would
 * silently drop the instruction.
 */
const isSameCartLine = (
  a: Pick<CartItem, "menuItem" | "selectedModifiers" | "notes">,
  b: Pick<CartItem, "menuItem" | "selectedModifiers" | "notes">
) => {
  if (a.menuItem.id !== b.menuItem.id) return false;
  if ((a.notes ?? "").trim() !== (b.notes ?? "").trim()) return false;
  if (a.selectedModifiers.length !== b.selectedModifiers.length) return false;
  const aOptionIds = new Set(a.selectedModifiers.map((m) => m.option.id));
  return b.selectedModifiers.every((m) => aOptionIds.has(m.option.id));
};

// ─── Floor View ────────────────────────────────────────────────────

export default function FloorView() {
  const t = useT();
  const toast = useToast();
  const confirmDialog = useConfirm();
  const {
    data: categories = [],
    isLoading: catsLoading,
    isError: catsError,
    refetch: refetchCategories,
  } = useCategories();
  const {
    data: menuItems = [],
    isLoading: itemsLoading,
    isError: itemsError,
    refetch: refetchMenuItems,
  } = useMenuItems();
  const { data: tables = [] } = useTables();
  const { data: parkedOrders = [] } = useParkedOrders();
  const { data: settings } = useLocationSettings();
  const { data: allModifiers = [] } = useAllModifiers();
  const { data: modifierMap = {} } = useMenuItemModifierMap();
  const currency = settings?.currency ?? "CRC";

  // Resolve each product's modifiers from cache so taps are instant (no fetch).
  const modsByItem = useMemo(() => {
    const byId = new Map(allModifiers.map((m) => [m.id, m]));
    const map = new Map<string, Modifier[]>();
    for (const [itemId, modifierIds] of Object.entries(modifierMap)) {
      map.set(
        itemId,
        modifierIds.map((id) => byId.get(id)).filter((m): m is Modifier => !!m)
      );
    }
    return map;
  }, [allModifiers, modifierMap]);
  const createOrderMut = useCreateOrder();
  const appendOrderMut = useAppendToOrder();
  const { data: shift } = useCurrentShift();
  const conn = useConnectionStatus();
  useOrdersRealtime();

  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isOrderExpanded, setIsOrderExpanded] = useState(false);

  // ── Draft-cart persistence ──────────────────────────────────────
  // The saved cart is *derived* during render rather than pushed in from an
  // effect. Two reasons: an effect that calls setState on mount cascades a
  // second render on every visit, and — because this component is still
  // server-rendered — a localStorage read at mount would make the server's
  // markup (empty cart) disagree with the client's. Gating on `menuItems`
  // sidesteps both: the menu is empty on the server AND on the first client
  // render, so both agree, and by the time it isn't empty reconcileCart can
  // tell "this item was deleted" apart from "the menu hasn't loaded yet".
  const restoredCart = useMemo(() => {
    if (menuItems.length === 0) return null;
    const saved = loadFloorCart();
    if (!saved) return null;
    const items = reconcileCart(saved.items, menuItems);
    return items.length > 0 ? { items, tableId: saved.tableId } : null;
  }, [menuItems]);

  // `null`/`undefined` mean "the cashier hasn't touched this yet, so the
  // restored draft still speaks for it".
  const [cartOverride, setCartOverride] = useState<CartItem[] | null>(null);
  const [tableOverride, setTableOverride] = useState<string | null | undefined>(undefined);

  const orderItems = cartOverride ?? restoredCart?.items ?? EMPTY_CART;
  const selectedTableId = tableOverride !== undefined ? tableOverride : restoredCart?.tableId ?? null;

  useEffect(() => {
    // Nothing is written before the menu lands — otherwise this fires on
    // mount with an empty cart and deletes the very draft we're restoring.
    if (menuItems.length === 0) return;
    saveFloorCart(orderItems, selectedTableId);
  }, [menuItems, orderItems, selectedTableId]);

  const occupiedTableIds = new Set(
    parkedOrders.map((o) => o.table_id).filter(Boolean) as string[]
  );
  const openTab = selectedTableId
    ? parkedOrders.find((o) => o.table_id === selectedTableId) ?? null
    : null;
  const selectedTableName = selectedTableId
    ? tables.find((t) => t.id === selectedTableId)?.name ?? t("floor.table")
    : t("common.takeaway");
  const tabExistingTotal = openTab ? Number(openTab.total_amount) : 0;

  const [drawerItem, setDrawerItem] = useState<MenuItem | null>(null);
  const [drawerModifiers, setDrawerModifiers] = useState<Modifier[]>([]);
  // Set when the drawer was opened to edit an existing line rather than add
  // a new one; holds that line's cartId.
  const [editingCartId, setEditingCartId] = useState<string | null>(null);
  const editingLine = editingCartId ? orderItems.find((i) => i.cartId === editingCartId) ?? null : null;

  const isLoading = catsLoading || itemsLoading;
  const loadFailed = catsError || itemsError;

  const effectiveCategory = activeCategory ?? categories[0]?.id ?? null;

  // A search spans the whole menu — reaching an item you can name shouldn't
  // require knowing which category it lives in.
  const trimmedQuery = searchQuery.trim();
  const filteredProducts = useMemo(() => {
    if (trimmedQuery) {
      const q = normalizeText(trimmedQuery);
      return menuItems.filter((p) => normalizeText(p.name).includes(q));
    }
    return effectiveCategory
      ? menuItems.filter((p) => p.category_id === effectiveCategory)
      : menuItems;
  }, [menuItems, trimmedQuery, effectiveCategory]);

  const total = orderItems.reduce((sum, item) => {
    const modExtra = item.selectedModifiers.reduce((s, m) => s + m.option.extra_price, 0);
    return sum + (Number(item.menuItem.price) + modExtra) * item.quantity;
  }, 0);

  const totalQuantity = orderItems.reduce((sum, item) => sum + item.quantity, 0);

  const closeDrawer = () => {
    setDrawerItem(null);
    setDrawerModifiers([]);
    setEditingCartId(null);
  };

  const handleProductClick = (product: MenuItem) => {
    const mods = modsByItem.get(product.id) ?? [];
    setEditingCartId(null);
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
  };

  const openLineEditor = (item: CartItem) => {
    setEditingCartId(item.cartId);
    setDrawerItem(item.menuItem);
    setDrawerModifiers(modsByItem.get(item.menuItem.id) ?? []);
  };

  const addToOrder = (newItem: CartItem) => {
    const existingIndex = orderItems.findIndex((item) => isSameCartLine(item, newItem));
    if (existingIndex > -1) {
      setCartOverride(
        orderItems.map((item, i) =>
          i === existingIndex ? { ...item, quantity: item.quantity + newItem.quantity } : item
        )
      );
    } else {
      setCartOverride([...orderItems, newItem]);
    }
    closeDrawer();
    // Land back on the full grid, ready for the next item, instead of on a
    // one-result screen the cashier has to clear by hand.
    setSearchQuery("");
  };

  /** Apply a drawer confirmation to the line being edited. */
  const updateLine = (cartId: string, selected: SelectedModifier[], notes: string) => {
    const target = orderItems.find((i) => i.cartId === cartId);
    if (!target) return;
    const edited: CartItem = { ...target, selectedModifiers: selected, notes: notes || undefined };

    // The edit can make this line identical to another one — merge rather
    // than leave two rows that look the same and can't be told apart.
    const twin = orderItems.find((i) => i.cartId !== cartId && isSameCartLine(i, edited));
    if (twin) {
      setCartOverride(
        orderItems
          .filter((i) => i.cartId !== cartId)
          .map((i) => (i.cartId === twin.cartId ? { ...i, quantity: i.quantity + edited.quantity } : i))
      );
    } else {
      setCartOverride(orderItems.map((i) => (i.cartId === cartId ? edited : i)));
    }
    closeDrawer();
  };

  const updateQuantity = (cartId: string, delta: number) => {
    setCartOverride(
      orderItems.flatMap((item) => {
        if (item.cartId !== cartId) return [item];
        const next = item.quantity + delta;
        // Minus at 1 removes the line. It used to clamp at 1, which made it
        // a dead tap and forced a detour to the trash button.
        if (next < 1) return [];
        return [{ ...item, quantity: next }];
      })
    );
  };

  const removeItem = (cartId: string) => {
    setCartOverride(orderItems.filter((item) => item.cartId !== cartId));
  };

  const handleClearCart = async () => {
    if (orderItems.length === 0) return;
    if (!(await confirmDialog(t("floor.confirmClearCart")))) return;
    setCartOverride([]);
  };

  const [isQueueing, setIsQueueing] = useState(false);
  const isSending = createOrderMut.isPending || appendOrderMut.isPending || isQueueing;

  const itemLabel = (count: number) => (count === 1 ? t("common.item") : t("common.items"));

  const finishSend = () => {
    setCartOverride([]);
    setIsOrderExpanded(false);
    clearFloorCart();
  };

  const queueCart = async () => {
    setIsQueueing(true);
    try {
      const entry = await enqueuePark(
        { cartItems: orderItems, tableId: selectedTableId, tableName: selectedTableName, currency },
        shift?.shift_id ?? null
      );
      finishSend();
      toast(t("floor.orderQueued", { ref: entry.offlineRef }), "success");
    } finally {
      setIsQueueing(false);
    }
  };

  const handleSend = () => {
    if (orderItems.length === 0) return;

    if (openTab) {
      // No offline path exists for adding to an already-parked tab — the
      // sync RPCs only ever create a new order, never append to one — so
      // this stays online-only rather than silently dropping the add.
      if (conn === "offline") {
        toast(t("floor.appendNeedsConnection"));
        return;
      }
      const addedCount = totalQuantity;
      appendOrderMut.mutate(
        { orderId: openTab.id, cartItems: orderItems },
        {
          onSuccess: () => {
            finishSend();
            toast(
              t("floor.itemsAddedToTab", {
                count: addedCount,
                itemLabel: itemLabel(addedCount),
                name: selectedTableName,
              }),
              "success"
            );
          },
          onError: () => toast(t("floor.failedToAddToTab")),
        }
      );
      return;
    }

    if (conn === "offline") {
      void queueCart();
      return;
    }

    createOrderMut.mutate(
      { cartItems: orderItems, tableId: selectedTableId },
      {
        onSuccess: async (orderId) => {
          finishSend();
          // The order number is what the cashier actually tells the
          // customer, but create_order returns only the uuid. Look it up
          // separately and fall back to a generic confirmation — a failure
          // here must never read as a failed sale, since the sale landed.
          let orderNumber: number | null = null;
          try {
            orderNumber = await fetchOrderNumber(orderId);
          } catch {
            // fall through to the generic message
          }
          toast(
            orderNumber != null
              ? t("floor.orderSent", { number: orderNumber })
              : t("floor.orderSentGeneric"),
            "success"
          );
        },
        onError: (err) => {
          // navigator.onLine said "online" but the request itself
          // couldn't reach Supabase (flaky wifi, captive portal) — queue
          // it rather than showing an error and losing the cart.
          if (isNetworkError(err)) {
            void queueCart();
          } else {
            toast(t("floor.failedToSendOrder"));
          }
        },
      }
    );
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-expresso/40" />
      </div>
    );
  }

  // A failed menu load used to render as "No products in this category",
  // which reads as an empty menu and sends the cashier to Admin for nothing.
  if (loadFailed) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 p-6 text-center">
        <AlertTriangle className="w-10 h-10 text-expresso/30" />
        <p className="text-sm text-expresso/70">{t("floor.loadFailed")}</p>
        <Button
          variant="secondary"
          onClick={() => {
            void refetchCategories();
            void refetchMenuItems();
          }}
        >
          {t("floor.retry")}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row h-full min-h-0 relative overflow-hidden">
      {drawerItem && (
        <ModifierDrawer
          key={editingCartId ?? drawerItem.id}
          menuItem={drawerItem}
          modifiers={drawerModifiers}
          currency={currency}
          initialSelected={editingLine?.selectedModifiers}
          initialNotes={editingLine?.notes}
          isEditing={!!editingLine}
          onConfirm={(selected, notes) => {
            if (editingCartId) {
              updateLine(editingCartId, selected, notes);
              return;
            }
            addToOrder({
              cartId: generateCartId(),
              menuItem: drawerItem,
              quantity: 1,
              selectedModifiers: selected,
              notes: notes || undefined,
            });
          }}
          onClose={closeDrawer}
        />
      )}

      {/* Left: Categories & Products */}
      <div className="flex-1 min-w-0 flex flex-col h-full md:border-r border-warm-roast/10 bg-card overflow-hidden">
        {/* Table selector */}
        <div className="relative shrink-0 border-b border-warm-roast/10 bg-muted/30">
          <div className="flex items-center gap-2 overflow-x-auto px-4 py-1.5 hide-scrollbar">
            <span className="text-xs font-semibold text-expresso/50 uppercase tracking-wider shrink-0 pr-1">{t("floor.table")}</span>
            <button
              onClick={() => setTableOverride(null)}
              className={`flex items-center gap-1.5 px-3.5 min-h-[44px] rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                selectedTableId === null
                  ? "bg-coffee-fruit text-white shadow-sm"
                  : "bg-warm-roast/10 text-expresso/70 hover:bg-warm-roast/20"
              }`}
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              {t("common.takeaway")}
            </button>
            {tables.map((tbl) => {
              const occupied = occupiedTableIds.has(tbl.id);
              const active = selectedTableId === tbl.id;
              return (
                <button
                  key={tbl.id}
                  onClick={() => setTableOverride(tbl.id)}
                  className={`flex items-center gap-1.5 px-3.5 min-h-[44px] rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                    active
                      ? "bg-coffee-fruit text-white shadow-sm"
                      : occupied
                        ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 hover:bg-amber-200"
                        : "bg-warm-roast/10 text-expresso/70 hover:bg-warm-roast/20"
                  }`}
                >
                  <Armchair className="w-3.5 h-3.5" />
                  {tbl.name}
                  {occupied && <span className={`w-1.5 h-1.5 rounded-full ${active ? "bg-white" : "bg-amber-500"}`} />}
                </button>
              );
            })}
            {tables.length === 0 && (
              <span className="text-xs text-expresso/40">{t("floor.noTables")}</span>
            )}
          </div>
          {/* Right-edge fade so a strip that overflows doesn't look complete
              when it isn't — hide-scrollbar removes the only other cue. */}
          <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-muted to-transparent" />
        </div>

        {/* Menu search — spans every category, so an item you can name is
            always two taps away regardless of where it's filed. */}
        <div className="shrink-0 border-b border-warm-roast/10 px-4 pt-4">
          <Input
            type="text"
            icon={<Search className="w-4 h-4" />}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("floor.searchPlaceholder")}
            rightElement={
              searchQuery ? (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  aria-label={t("floor.clearSearch")}
                  className="min-h-[44px] min-w-[44px] -mr-1 inline-flex items-center justify-center text-expresso/40 hover:text-expresso transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              ) : undefined
            }
          />
        </div>

        {/* Categories are what a search replaces, so hide the strip while
            one is active rather than showing a selection that isn't
            filtering anything. */}
        {!trimmedQuery && (
          <div className="relative shrink-0 border-b border-warm-roast/10">
            <div className="flex overflow-x-auto p-4 gap-2 hide-scrollbar">
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
                <p className="text-sm text-expresso/40 p-2">{t("floor.noCategories")}</p>
              )}
            </div>
            <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-card to-transparent" />
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 bg-background">
          {filteredProducts.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-expresso/40 space-y-2">
              <Coffee className="w-12 h-12 opacity-20" />
              <p className="text-sm">
                {trimmedQuery
                  ? t("floor.noSearchResults", { query: trimmedQuery })
                  : t("floor.noProducts")}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
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
                      <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-400">
                        {t("floor.soldOut")}
                      </span>
                    )}
                    {!soldOut && lowStock && (
                      <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-400">
                        {t("floor.stockLeft", { n: product.available_quantity })}
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

      {/* Mobile/Phone Bottom Bar — in-flow shrink-0, not fixed, so it never
          needs hand-computed offsets against the shell's tab nav. */}
      <div className="md:hidden shrink-0 bg-card border-t border-warm-roast/10 p-4 flex justify-between items-center gap-3 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
        <div>
          <span className="font-semibold text-expresso">
            {totalQuantity} {itemLabel(totalQuantity)}
          </span>
          <span className="text-expresso/60 text-sm ml-2">{formatMoney(total, currency)}</span>
          <span className="block text-xs text-expresso/50">{selectedTableName}{openTab ? ` · ${t("floor.openTabBadge")}` : ""}</span>
        </div>
        <Button onClick={() => setIsOrderExpanded(true)} disabled={orderItems.length === 0}>{t("floor.viewOrder")}</Button>
      </div>

      {/* Right: Current Order — a full-screen slide-up sheet below `md`
          (tablet portrait and phones), a persistent side panel from `md` up. */}
      <div className={`fixed inset-0 z-50 md:static md:z-auto w-full md:w-[320px] lg:w-[380px] xl:w-[440px] flex flex-col bg-card h-full min-h-0 shrink-0 transition-transform duration-300 md:translate-y-0 ${isOrderExpanded ? "translate-y-0" : "translate-y-full"}`}>
        <div className="p-4 border-b border-warm-roast/10 shrink-0 flex justify-between items-center bg-card gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {selectedTableId === null ? (
              <ShoppingBag className="w-4 h-4 text-expresso/50 shrink-0" />
            ) : (
              <Armchair className="w-4 h-4 text-expresso/50 shrink-0" />
            )}
            <h2 className="font-bold text-lg text-expresso truncate">{selectedTableName}</h2>
            {openTab && (
              <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 shrink-0">
                {t("floor.openTabBadge")}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {orderItems.length > 0 && (
              <button
                onClick={handleClearCart}
                className="min-h-[44px] px-3 text-sm font-medium text-expresso/60 hover:text-red-600 rounded-lg transition-colors"
              >
                {t("floor.clearCart")}
              </button>
            )}
            <button className="md:hidden min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-expresso/60 hover:text-expresso" onClick={() => setIsOrderExpanded(false)}>
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-muted/40">
          {/* Existing items already on this table's tab (read-only) */}
          {openTab && (openTab.order_items ?? []).length > 0 && (
            <div className="bg-warm-roast/5 border border-warm-roast/10 rounded-lg p-3">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-semibold text-expresso/50 uppercase tracking-wider">{t("floor.alreadyOnTab")}</span>
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
              <p className="text-sm">{openTab ? t("floor.addItemsToTab") : t("floor.noItemsYet")}</p>
            </div>
          ) : (
            orderItems.map((item) => {
              const modExtra = item.selectedModifiers.reduce((s, m) => s + m.option.extra_price, 0);
              const unitTotal = Number(item.menuItem.price) + modExtra;
              return (
                <div key={item.cartId} className="bg-card border border-warm-roast/10 rounded-lg p-3 flex flex-col gap-3 shadow-sm">
                  <div className="flex justify-between items-start gap-2">
                    {/* Tapping the line reopens the modifier drawer seeded
                        with what's already on it — editing used to mean
                        deleting the line and building it again. */}
                    <button
                      type="button"
                      onClick={() => openLineEditor(item)}
                      aria-label={t("floor.editItem")}
                      className="flex-1 min-w-0 text-left group"
                    >
                      <h4 className="font-medium text-expresso flex items-center gap-1.5">
                        <span className="truncate">{item.menuItem.name}</span>
                        <Pencil className="w-3 h-3 shrink-0 text-expresso/30 group-hover:text-expresso/70 transition-colors" />
                      </h4>
                      {item.selectedModifiers.length > 0 && (
                        <p className="text-xs text-expresso/40 mt-0.5">
                          {item.selectedModifiers.map((m) => m.option.name).join(", ")}
                        </p>
                      )}
                      {/* Deliberately styled apart from the modifiers above:
                          a note is an instruction to whoever makes the drink,
                          not a priced option. */}
                      {item.notes && (
                        <p className="text-xs font-medium text-coffee-fruit mt-1 break-words">
                          {item.notes}
                        </p>
                      )}
                      <p className="text-sm text-expresso/60 mt-0.5">{formatMoney(unitTotal, currency)} {t("floor.each")}</p>
                    </button>
                    <span className="font-semibold text-expresso shrink-0">
                      {formatMoney(unitTotal * item.quantity, currency)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1 bg-warm-roast/10 rounded-lg p-1">
                      <button onClick={() => updateQuantity(item.cartId, -1)} aria-label="Decrease quantity" className="h-11 w-11 flex items-center justify-center hover:bg-card rounded-md text-expresso/70 transition-colors active:scale-95">
                        <Minus className="w-4 h-4" />
                      </button>
                      <span className="w-8 text-center font-medium text-sm tabular-nums">{item.quantity}</span>
                      <button onClick={() => updateQuantity(item.cartId, 1)} aria-label="Increase quantity" className="h-11 w-11 flex items-center justify-center hover:bg-card rounded-md text-expresso/70 transition-colors active:scale-95">
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                    <button onClick={() => removeItem(item.cartId)} aria-label="Remove item" className="h-11 w-11 flex items-center justify-center text-red-500 hover:bg-red-50 dark:hover:bg-red-950 rounded-lg transition-colors active:scale-95">
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
              <span>{t("floor.newItems")}</span>
              <span>{formatMoney(total, currency)}</span>
            </div>
          )}
          <div className="flex justify-between items-center mb-4">
            <span className="text-expresso/60 font-medium">{openTab ? t("floor.tabTotal") : t("floor.total")}</span>
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
            {openTab
              ? t("floor.addToTab", { name: selectedTableName })
              : selectedTableId
                ? t("floor.openTab", { name: selectedTableName })
                : t("floor.sendToCounter")}
          </Button>
        </div>
      </div>
    </div>
  );
}
