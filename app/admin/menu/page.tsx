"use client";

import { useState } from "react";
import { Plus, Edit2, Trash2, X, Save, Ban, CheckCircle2, Check, Search, Undo2 } from "lucide-react";
import type { MenuItem, Category } from "@/lib/types";
import {
  useAllMenuItems,
  useCategories,
  useCreateMenuItem,
  useUpdateMenuItem,
  useDeleteMenuItem,
  useRestoreMenuItem,
  useCreateCategory,
  useUpdateCategory,
  useDeleteCategory,
  useAllModifiers,
  useMenuItemModifierLinks,
  useSetMenuItemModifiers,
} from "@/lib/hooks";
import { getLocationId } from "@/lib/queries";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";
import { Checkbox } from "@/components/ui/Checkbox";
import { Modal } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";
import { useToast, useConfirm } from "@/components/ui/Feedback";
import { formatMoney, normalizeText } from "@/lib/utils";
import { useT } from "@/lib/i18n/LanguageContext";
import { usePagination } from "@/lib/usePagination";
import { TableSkeleton } from "../_components/Skeletons";

type MenuItemForm = {
  name: string;
  description: string;
  price: string;
  available_quantity: string;
  category_id: string;
  is_active: boolean;
  track_inventory: boolean;
  low_stock_threshold: string;
  is_available: boolean;
};

const emptyForm: MenuItemForm = {
  name: "",
  description: "",
  price: "",
  available_quantity: "0",
  category_id: "",
  is_active: true,
  track_inventory: false,
  low_stock_threshold: "5",
  is_available: true,
};

export default function MenuManagement() {
  const t = useT();
  const toast = useToast();
  const confirmDialog = useConfirm();
  // "Archived" is a separate axis from the category filter: an archived
  // item is one that was deleted but had sales history, so it survives to
  // keep old receipts readable (see delete_menu_item, migration 00031).
  const [view, setView] = useState<"active" | "archived">("active");
  const showArchived = view === "archived";

  const { data: items = [], isLoading: itemsLoading } = useAllMenuItems(showArchived);
  const { data: categories = [], isLoading: catsLoading } = useCategories();
  const createItemMut = useCreateMenuItem();
  const updateItemMut = useUpdateMenuItem();
  const deleteItemMut = useDeleteMenuItem();
  const restoreItemMut = useRestoreMenuItem();
  const createCatMut = useCreateCategory();
  const updateCatMut = useUpdateCategory();
  const deleteCatMut = useDeleteCategory();

  const { data: allModifiers = [] } = useAllModifiers();
  const setModifiersMut = useSetMenuItemModifiers();

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<MenuItemForm>(emptyForm);
  const { data: existingModifierLinks } = useMenuItemModifierLinks(editingId);

  // The item's saved modifiers arrive asynchronously, so rather than copying
  // them into state from an effect (which renders the form once with a stale
  // empty selection first), the selection is derived: null means "untouched,
  // show what the server has", and any toggle takes over with a local list.
  const [modifierOverride, setModifierOverride] = useState<string[] | null>(null);
  const selectedModifierIds =
    modifierOverride ?? (editingId ? existingModifierLinks ?? [] : []);

  const toggleModifier = (modId: string) =>
    setModifierOverride(
      selectedModifierIds.includes(modId)
        ? selectedModifierIds.filter((id) => id !== modId)
        : [...selectedModifierIds, modId]
    );

  const [showCatForm, setShowCatForm] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editCatName, setEditCatName] = useState("");

  const isLoading = itemsLoading || catsLoading;

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const hasFilters = search.trim() !== "" || categoryFilter !== "all";

  const filteredItems = items.filter((item) => {
    // fetchAllMenuItems(true) returns archived AND live rows; the archived
    // view wants only the archived ones.
    if (showArchived !== (item.archived_at != null)) return false;
    if (search.trim() && !normalizeText(item.name).includes(normalizeText(search.trim()))) {
      return false;
    }
    if (categoryFilter === "none") return item.category_id == null;
    if (categoryFilter !== "all") return item.category_id === categoryFilter;
    return true;
  });

  const pg = usePagination(filteredItems, {
    resetKey: `${search}|${categoryFilter}|${view}`,
  });

  const openCreateForm = () => {
    setEditingId(null);
    setForm(emptyForm);
    setModifierOverride(null);
    setShowForm(true);
  };

  const openEditForm = (item: MenuItem) => {
    setEditingId(item.id);
    setModifierOverride(null);
    setForm({
      name: item.name,
      description: item.description ?? "",
      price: String(item.price),
      available_quantity: String(item.available_quantity),
      category_id: item.category_id ?? "",
      is_active: item.is_active,
      track_inventory: item.track_inventory,
      low_stock_threshold: String(item.low_stock_threshold),
      is_available: item.is_available,
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.price) {
      toast(t("menu.nameRequired"));
      return;
    }
    const saveModifiers = (itemId: string) =>
      setModifiersMut.mutateAsync({ menuItemId: itemId, modifierIds: selectedModifierIds });

    if (editingId) {
      updateItemMut.mutate(
        {
          id: editingId,
          updates: {
            name: form.name,
            description: form.description || null,
            price: parseFloat(form.price),
            available_quantity: parseInt(form.available_quantity) || 0,
            category_id: form.category_id || null,
            is_active: form.is_active,
            track_inventory: form.track_inventory,
            low_stock_threshold: parseInt(form.low_stock_threshold) || 0,
            is_available: form.is_available,
          },
        },
        {
          onSuccess: async () => {
            await saveModifiers(editingId);
            setShowForm(false);
          },
          onError: () => toast(t("menu.failedToSave")),
        }
      );
    } else {
      const locationId = await getLocationId();
      createItemMut.mutate(
        {
          location_id: locationId,
          name: form.name,
          description: form.description || null,
          price: parseFloat(form.price),
          available_quantity: parseInt(form.available_quantity) || 0,
          category_id: form.category_id || null,
          is_active: form.is_active,
          track_inventory: form.track_inventory,
          low_stock_threshold: parseInt(form.low_stock_threshold) || 0,
          is_available: form.is_available,
        },
        {
          onSuccess: async (newItem) => {
            if (newItem?.id) await saveModifiers(newItem.id);
            setShowForm(false);
          },
          onError: () => toast(t("menu.failedToSave")),
        }
      );
    }
  };

  const handleDelete = async (item: MenuItem) => {
    if (!(await confirmDialog(t("menu.deleteConfirm", { name: item.name })))) return;
    deleteItemMut.mutate(item.id, {
      // delete_menu_item reports which branch it took: a product nobody
      // ever ordered is really gone, one with sales history is archived so
      // past receipts keep their product name.
      onSuccess: (outcome) =>
        toast(
          outcome === "deleted"
            ? t("menu.itemDeleted", { name: item.name })
            : t("menu.itemArchived", { name: item.name }),
          "success"
        ),
      onError: () => toast(t("menu.failedToDelete")),
    });
  };

  const handleRestore = (item: MenuItem) => {
    restoreItemMut.mutate(item.id, {
      onSuccess: () => toast(t("menu.itemRestored", { name: item.name }), "success"),
      onError: () => toast(t("menu.failedToRestore")),
    });
  };

  const handleToggleAvailable = (item: MenuItem) => {
    updateItemMut.mutate(
      { id: item.id, updates: { is_available: !item.is_available } },
      { onError: () => toast(t("menu.failedToSave")) }
    );
  };

  const handleCreateCategory = async () => {
    if (!newCatName.trim()) return;
    const locationId = await getLocationId();
    createCatMut.mutate(
      { location_id: locationId, name: newCatName.trim(), sort_order: categories.length },
      {
        onSuccess: () => setNewCatName(""),
        onError: () => toast(t("menu.failedCategory")),
      }
    );
  };

  const startEditCategory = (cat: Category) => {
    setEditingCatId(cat.id);
    setEditCatName(cat.name);
  };

  const saveEditCategory = () => {
    if (!editingCatId) return;
    const name = editCatName.trim();
    if (!name) return;
    updateCatMut.mutate(
      { id: editingCatId, updates: { name } },
      {
        onSuccess: () => setEditingCatId(null),
        onError: () => toast(t("menu.failedCategory")),
      }
    );
  };

  const handleDeleteCategory = async (cat: Category) => {
    if (!(await confirmDialog(t("menu.deleteCategoryConfirm", { name: cat.name })))) return;
    deleteCatMut.mutate(cat.id, {
      onError: (err: unknown) => {
        const code = (err as { code?: string })?.code;
        toast(code === "23503" ? t("menu.categoryInUse") : t("menu.failedToDeleteCategory"));
      },
    });
  };

  const isSaving = createItemMut.isPending || updateItemMut.isPending || setModifiersMut.isPending;

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-expresso">{t("menu.title")}</h1>
          <p className="text-expresso/60 mt-1">{t("menu.subtitle")}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setShowCatForm(!showCatForm)} leftIcon={<Plus className="w-4 h-4" />}>
            {t("menu.addCategory")}
          </Button>
          <Button onClick={openCreateForm} leftIcon={<Plus className="w-4 h-4" />}>
            {t("menu.addItem")}
          </Button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <Input
          icon={<Search className="w-4 h-4" />}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("menu.searchPlaceholder")}
          className="flex-1"
        />
        <Select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          aria-label={t("menu.filterByCategory")}
          className="sm:w-56"
        >
          <option value="all">{t("menu.allCategories")}</option>
          <option value="none">{t("menu.noCategory")}</option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>{cat.name}</option>
          ))}
        </Select>
        <Select
          value={view}
          onChange={(e) => setView(e.target.value as "active" | "archived")}
          aria-label={t("menu.filterByView")}
          className="sm:w-44"
        >
          <option value="active">{t("menu.viewActive")}</option>
          <option value="archived">{t("menu.viewArchived")}</option>
        </Select>
      </div>

      {showCatForm && (
        <div className="bg-card p-4 rounded-xl border border-warm-roast/10 space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <Input
              type="text"
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreateCategory()}
              placeholder={t("menu.categoryPlaceholder")}
              className="flex-1"
            />
            <div className="flex gap-2">
              <Button onClick={handleCreateCategory} disabled={!newCatName.trim()} isLoading={createCatMut.isPending} className="flex-1 sm:flex-initial">{t("common.create")}</Button>
              <button onClick={() => setShowCatForm(false)} className="shrink-0 min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-expresso/40 hover:text-expresso"><X className="w-4 h-4" /></button>
            </div>
          </div>
          {categories.length > 0 && (
            <ul className="divide-y divide-warm-roast/10 border-t border-warm-roast/10">
              {categories.map((cat) => (
                <li key={cat.id} className="flex items-center gap-2 py-2">
                  {editingCatId === cat.id ? (
                    <>
                      <Input
                        type="text"
                        value={editCatName}
                        onChange={(e) => setEditCatName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveEditCategory();
                          if (e.key === "Escape") setEditingCatId(null);
                        }}
                        className="flex-1"
                        autoFocus
                      />
                      <button onClick={saveEditCategory} className="shrink-0 min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-green-600 hover:text-green-700" title={t("common.save")}>
                        <Check className="w-4 h-4" />
                      </button>
                      <button onClick={() => setEditingCatId(null)} className="shrink-0 min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-expresso/40 hover:text-expresso" title={t("common.cancel")}>
                        <X className="w-4 h-4" />
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 text-sm text-expresso">{cat.name}</span>
                      <button onClick={() => startEditCategory(cat)} className="shrink-0 min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-expresso/40 hover:text-coffee-fruit transition-colors" title={t("menu.renameCategory")}>
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDeleteCategory(cat)} className="shrink-0 min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-expresso/40 hover:text-destructive transition-colors" title={t("menu.deleteCategoryTitle")}>
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {showForm && (
        <Modal onClose={() => setShowForm(false)} title={editingId ? t("menu.editItem") : t("menu.newMenuItem")} size="lg">
          <div className="space-y-5">
            <div className="space-y-4">
              <div>
                <Label className="mb-1 block">{t("menu.name")}</Label>
                <Input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <Label className="mb-1 block">{t("menu.description")}</Label>
                <Input type="text" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="mb-1 block">{t("menu.price")}</Label>
                  <Input type="number" inputMode="numeric" step={1} min={0} value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
                </div>
                <div>
                  <Label className="mb-1 block">{t("menu.stock")}</Label>
                  <Input type="number" value={form.available_quantity} onChange={(e) => setForm({ ...form, available_quantity: e.target.value })} />
                </div>
              </div>
              <div>
                <Label className="mb-1 block">{t("menu.category")}</Label>
                <Select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
                  <option value="">{t("menu.noCategory")}</option>
                  {categories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                </Select>
              </div>
              <div className="flex items-center gap-2 min-h-[44px]">
                <Checkbox id="is_active" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
                <Label htmlFor="is_active" className="cursor-pointer">{t("menu.activeLabel")}</Label>
              </div>
              <div className="flex items-center gap-2 min-h-[44px]">
                <Checkbox id="is_available" checked={form.is_available} onChange={(e) => setForm({ ...form, is_available: e.target.checked })} />
                <Label htmlFor="is_available" className="cursor-pointer">{t("menu.availableLabel")}</Label>
              </div>
              <div className="flex items-center gap-2 min-h-[44px]">
                <Checkbox id="track_inventory" checked={form.track_inventory} onChange={(e) => setForm({ ...form, track_inventory: e.target.checked })} />
                <Label htmlFor="track_inventory" className="cursor-pointer">{t("menu.trackInventoryLabel")}</Label>
              </div>
              {form.track_inventory && (
                <div>
                  <Label className="mb-1 block">{t("menu.lowStockAlert")}</Label>
                  <Input type="number" min={0} value={form.low_stock_threshold} onChange={(e) => setForm({ ...form, low_stock_threshold: e.target.value })} />
                  <p className="text-xs text-expresso/40 mt-1">{t("menu.lowStockNote")}</p>
                </div>
              )}
              <div>
                <Label className="mb-1 block">{t("menu.modifiers")}</Label>
                {allModifiers.length === 0 ? (
                  <p className="text-xs text-expresso/40">{t("menu.noModifiersAvailable")}</p>
                ) : (
                  <div className="flex flex-wrap gap-2 mt-1">
                    {allModifiers.map((mod) => {
                      const selected = selectedModifierIds.includes(mod.id);
                      return (
                        <button
                          key={mod.id}
                          type="button"
                          onClick={() => toggleModifier(mod.id)}
                          className={`px-3 min-h-[44px] rounded-full text-sm font-medium border transition-colors ${
                            selected
                              ? "bg-coffee-fruit text-white border-coffee-fruit"
                              : "bg-card text-expresso/70 border-warm-roast/20 hover:border-coffee-fruit/50"
                          }`}
                        >
                          {mod.name}
                        </button>
                      );
                    })}
                  </div>
                )}
                {selectedModifierIds.length > 0 && (
                  <p className="text-xs text-expresso/40 mt-1.5">{t("menu.modifiersHint")}</p>
                )}
              </div>
            </div>
            <Button onClick={handleSave} isLoading={isSaving} leftIcon={<Save className="w-4 h-4" />} className="w-full">
              {editingId ? t("menu.updateItem") : t("menu.createItem")}
            </Button>
          </div>
        </Modal>
      )}

      {isLoading ? (
        <TableSkeleton rows={6} cols={6} />
      ) : (
      <div className="bg-card rounded-2xl border border-warm-roast/10 overflow-hidden animate-in fade-in-0 duration-200">
        <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
          <table className="w-full min-w-max whitespace-nowrap text-left border-collapse">
            <thead>
              <tr className="border-b border-warm-roast/10 bg-muted/40">
                <th className="px-4 sm:px-6 py-3 sm:py-4 text-sm font-semibold text-expresso">{t("menu.colName")}</th>
                <th className="px-4 sm:px-6 py-3 sm:py-4 text-sm font-semibold text-expresso">{t("menu.colCategory")}</th>
                <th className="px-4 sm:px-6 py-3 sm:py-4 text-sm font-semibold text-expresso">{t("menu.colPrice")}</th>
                <th className="px-4 sm:px-6 py-3 sm:py-4 text-sm font-semibold text-expresso">{t("menu.colStock")}</th>
                <th className="px-4 sm:px-6 py-3 sm:py-4 text-sm font-semibold text-expresso">{t("menu.colStatus")}</th>
                <th className="px-4 sm:px-6 py-3 sm:py-4 text-sm font-semibold text-expresso text-right">{t("menu.colActions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-warm-roast/10">
              {pg.pageRows.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-12 text-center whitespace-normal text-expresso/40 text-sm">{showArchived ? t("menu.noArchivedItems") : hasFilters ? t("menu.noMatchingItems") : t("menu.noItems")}</td></tr>
              ) : (
                pg.pageRows.map((item) => (
                  <tr key={item.id} className="hover:bg-warm-roast/5 transition-colors">
                    <td className="px-4 sm:px-6 py-3 sm:py-4 text-sm font-medium text-expresso">{item.name}</td>
                    <td className="px-4 sm:px-6 py-3 sm:py-4 text-sm text-expresso/60">{item.category?.name ?? "—"}</td>
                    <td className="px-4 sm:px-6 py-3 sm:py-4 text-sm text-expresso/60">{formatMoney(item.price, "CRC")}</td>
                    <td className="px-4 sm:px-6 py-3 sm:py-4 text-sm">
                      {!item.track_inventory ? (
                        <span className="text-expresso/40">{t("menu.untracked")}</span>
                      ) : (
                        <span className="inline-flex items-center gap-2">
                          <span className={`font-medium ${item.available_quantity <= 0 ? "text-destructive" : item.available_quantity <= item.low_stock_threshold ? "text-amber-600 dark:text-amber-400" : "text-expresso/70"}`}>
                            {item.available_quantity}
                          </span>
                          {item.available_quantity > 0 && item.available_quantity <= item.low_stock_threshold && (
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">{t("menu.stockLow")}</span>
                          )}
                        </span>
                      )}
                    </td>
                    <td className="px-4 sm:px-6 py-3 sm:py-4">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${item.is_active ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" : "bg-warm-roast/10 text-expresso/60"}`}>
                          {item.is_active ? t("menu.statusActive") : t("menu.statusDisabled")}
                        </span>
                        {!item.is_available && item.archived_at == null && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">{t("menu.statusSoldOut")}</span>
                        )}
                        {item.archived_at != null && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-warm-roast/15 text-expresso/70">{t("menu.statusArchived")}</span>
                        )}
                      </div>
                    </td>
                    {/* A `<td>` cannot be `display:flex` — it removes the cell
                        from the table's column-sizing algorithm, so the
                        Actions column detaches from its header. Keep the
                        cell a cell and nest the flex row inside it. */}
                    <td className="px-4 sm:px-6 py-3 sm:py-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {item.archived_at != null ? (
                          <button
                            onClick={() => handleRestore(item)}
                            title={t("menu.restore")}
                            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-expresso/40 hover:text-coffee-fruit transition-colors"
                          >
                            <Undo2 className="w-4 h-4" />
                          </button>
                        ) : (
                          <>
                            <button
                              onClick={() => handleToggleAvailable(item)}
                              title={item.is_available ? t("menu.markSoldOut") : t("menu.markAvailable")}
                              className={`min-h-[44px] min-w-[44px] inline-flex items-center justify-center transition-colors ${item.is_available ? "text-expresso/40 hover:text-destructive" : "text-green-600 hover:text-green-700"}`}
                            >
                              {item.is_available ? <Ban className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                            </button>
                            <button onClick={() => openEditForm(item)} className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-expresso/40 hover:text-coffee-fruit transition-colors"><Edit2 className="w-4 h-4" /></button>
                            <button onClick={() => handleDelete(item)} className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-expresso/40 hover:text-destructive transition-colors"><Trash2 className="w-4 h-4" /></button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Pagination {...pg} />
      </div>
      )}
    </div>
  );
}
