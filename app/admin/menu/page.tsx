"use client";

import { useState, useEffect } from "react";
import { Plus, Edit2, Trash2, X, Save, Loader2, Ban, CheckCircle2 } from "lucide-react";
import type { MenuItem } from "@/lib/types";
import {
  useAllMenuItems,
  useCategories,
  useCreateMenuItem,
  useUpdateMenuItem,
  useDeleteMenuItem,
  useCreateCategory,
  useAllModifiers,
  useMenuItemModifierLinks,
  useSetMenuItemModifiers,
} from "@/lib/hooks";
import { createClient } from "@/utils/supabase/client";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";
import { Checkbox } from "@/components/ui/Checkbox";
import { useT } from "@/lib/i18n/LanguageContext";

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
  const { data: items = [], isLoading: itemsLoading } = useAllMenuItems();
  const { data: categories = [], isLoading: catsLoading } = useCategories();
  const createItemMut = useCreateMenuItem();
  const updateItemMut = useUpdateMenuItem();
  const deleteItemMut = useDeleteMenuItem();
  const createCatMut = useCreateCategory();

  const { data: allModifiers = [] } = useAllModifiers();
  const setModifiersMut = useSetMenuItemModifiers();

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<MenuItemForm>(emptyForm);
  const [selectedModifierIds, setSelectedModifierIds] = useState<string[]>([]);

  const { data: existingModifierLinks } = useMenuItemModifierLinks(editingId);

  useEffect(() => {
    if (existingModifierLinks && showForm && editingId) {
      setSelectedModifierIds(existingModifierLinks);
    }
  }, [existingModifierLinks, showForm, editingId]);

  const [showCatForm, setShowCatForm] = useState(false);
  const [newCatName, setNewCatName] = useState("");

  const isLoading = itemsLoading || catsLoading;

  const getLocationId = async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");
    const { data: profile } = await supabase.from("user_profiles").select("location_id").eq("id", user.id).single();
    return profile?.location_id;
  };

  const openCreateForm = () => {
    setEditingId(null);
    setForm(emptyForm);
    setSelectedModifierIds([]);
    setShowForm(true);
  };

  const openEditForm = (item: MenuItem) => {
    setEditingId(item.id);
    setSelectedModifierIds([]);
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
      alert(t("menu.nameRequired"));
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
          onError: () => alert(t("menu.failedToSave")),
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
          onError: () => alert(t("menu.failedToSave")),
        }
      );
    }
  };

  const handleDelete = (id: string) => {
    if (!confirm(t("menu.deleteConfirm"))) return;
    deleteItemMut.mutate(id);
  };

  const handleToggleAvailable = (item: MenuItem) => {
    updateItemMut.mutate({ id: item.id, updates: { is_available: !item.is_available } });
  };

  const handleCreateCategory = async () => {
    if (!newCatName.trim()) return;
    const locationId = await getLocationId();
    createCatMut.mutate(
      { location_id: locationId, name: newCatName.trim(), sort_order: categories.length },
      {
        onSuccess: () => { setNewCatName(""); setShowCatForm(false); },
        onError: () => alert(t("menu.failedCategory")),
      }
    );
  };

  const isSaving = createItemMut.isPending || updateItemMut.isPending || setModifiersMut.isPending;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-expresso/40" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-6">
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

      {showCatForm && (
        <div className="bg-card p-4 rounded-xl border border-warm-roast/10 flex gap-3">
          <Input type="text" value={newCatName} onChange={(e) => setNewCatName(e.target.value)} placeholder={t("menu.categoryPlaceholder")} className="flex-1" />
          <Button onClick={handleCreateCategory} disabled={!newCatName.trim()} isLoading={createCatMut.isPending}>{t("common.create")}</Button>
          <button onClick={() => setShowCatForm(false)} className="p-2 text-expresso/40 hover:text-expresso"><X className="w-4 h-4" /></button>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowForm(false)} />
          <div className="relative w-full max-w-lg bg-card rounded-2xl border border-warm-roast/10 shadow-xl p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-expresso">{editingId ? t("menu.editItem") : t("menu.newMenuItem")}</h3>
              <button onClick={() => setShowForm(false)} className="p-2 text-expresso/40 hover:text-expresso"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <Label className="mb-1 block">{t("menu.name")}</Label>
                <Input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <Label className="mb-1 block">{t("menu.description")}</Label>
                <Input type="text" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="mb-1 block">{t("menu.price")}</Label>
                  <Input type="number" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
                </div>
                <div>
                  <Label className="mb-1 block">{t("menu.stock")}</Label>
                  <Input type="number" value={form.available_quantity} onChange={(e) => setForm({ ...form, available_quantity: e.target.value })} />
                </div>
              </div>
              <div>
                <Label className="mb-1 block">{t("menu.category")}</Label>
                <select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })} className="w-full px-3 py-2.5 bg-card text-expresso border border-warm-roast/20 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-coffee-fruit transition-all">
                  <option value="">{t("menu.noCategory")}</option>
                  {categories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="is_active" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
                <Label htmlFor="is_active" className="cursor-pointer">{t("menu.activeLabel")}</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="is_available" checked={form.is_available} onChange={(e) => setForm({ ...form, is_available: e.target.checked })} />
                <Label htmlFor="is_available" className="cursor-pointer">{t("menu.availableLabel")}</Label>
              </div>
              <div className="flex items-center gap-2">
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
                          onClick={() =>
                            setSelectedModifierIds((prev) =>
                              selected ? prev.filter((id) => id !== mod.id) : [...prev, mod.id]
                            )
                          }
                          className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
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
        </div>
      )}

      <div className="bg-card rounded-2xl border border-warm-roast/10 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-warm-roast/10 bg-muted/40">
                <th className="px-6 py-4 text-sm font-semibold text-expresso">{t("menu.colName")}</th>
                <th className="px-6 py-4 text-sm font-semibold text-expresso">{t("menu.colCategory")}</th>
                <th className="px-6 py-4 text-sm font-semibold text-expresso">{t("menu.colPrice")}</th>
                <th className="px-6 py-4 text-sm font-semibold text-expresso">{t("menu.colStock")}</th>
                <th className="px-6 py-4 text-sm font-semibold text-expresso">{t("menu.colStatus")}</th>
                <th className="px-6 py-4 text-sm font-semibold text-expresso text-right">{t("menu.colActions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-warm-roast/10">
              {items.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-12 text-center text-expresso/40 text-sm">{t("menu.noItems")}</td></tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id} className="hover:bg-warm-roast/5 transition-colors">
                    <td className="px-6 py-4 text-sm font-medium text-expresso">{item.name}</td>
                    <td className="px-6 py-4 text-sm text-expresso/60">{item.category?.name ?? "—"}</td>
                    <td className="px-6 py-4 text-sm text-expresso/60">${Number(item.price).toFixed(2)}</td>
                    <td className="px-6 py-4 text-sm">
                      {!item.track_inventory ? (
                        <span className="text-expresso/40">{t("menu.untracked")}</span>
                      ) : (
                        <span className="inline-flex items-center gap-2">
                          <span className={`font-medium ${item.available_quantity <= 0 ? "text-destructive" : item.available_quantity <= item.low_stock_threshold ? "text-amber-600 dark:text-amber-400" : "text-expresso/70"}`}>
                            {item.available_quantity}
                          </span>
                          {item.available_quantity > 0 && item.available_quantity <= item.low_stock_threshold && (
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">Low</span>
                          )}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${item.is_active ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" : "bg-warm-roast/10 text-expresso/60"}`}>
                          {item.is_active ? t("menu.statusActive") : t("menu.statusDisabled")}
                        </span>
                        {!item.is_available && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">{t("menu.statusSoldOut")}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleToggleAvailable(item)}
                        title={item.is_available ? t("menu.markSoldOut") : t("menu.markAvailable")}
                        className={`p-2 transition-colors ${item.is_available ? "text-expresso/40 hover:text-destructive" : "text-green-600 hover:text-green-700"}`}
                      >
                        {item.is_available ? <Ban className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                      </button>
                      <button onClick={() => openEditForm(item)} className="p-2 text-expresso/40 hover:text-coffee-fruit transition-colors"><Edit2 className="w-4 h-4" /></button>
                      <button onClick={() => handleDelete(item.id)} className="p-2 text-expresso/40 hover:text-destructive transition-colors"><Trash2 className="w-4 h-4" /></button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
