"use client";

import { useState } from "react";
import { Plus, Edit2, Trash2, X, Save, Loader2 } from "lucide-react";
import type { MenuItem } from "@/lib/types";
import {
  useAllMenuItems,
  useCategories,
  useCreateMenuItem,
  useUpdateMenuItem,
  useDeleteMenuItem,
  useCreateCategory,
} from "@/lib/hooks";
import { createClient } from "@/utils/supabase/client";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";
import { Checkbox } from "@/components/ui/Checkbox";

type MenuItemForm = {
  name: string;
  description: string;
  price: string;
  available_quantity: string;
  category_id: string;
  is_active: boolean;
};

const emptyForm: MenuItemForm = {
  name: "",
  description: "",
  price: "",
  available_quantity: "0",
  category_id: "",
  is_active: true,
};

export default function MenuManagement() {
  const { data: items = [], isLoading: itemsLoading } = useAllMenuItems();
  const { data: categories = [], isLoading: catsLoading } = useCategories();
  const createItemMut = useCreateMenuItem();
  const updateItemMut = useUpdateMenuItem();
  const deleteItemMut = useDeleteMenuItem();
  const createCatMut = useCreateCategory();

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<MenuItemForm>(emptyForm);

  // New category
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
    setShowForm(true);
  };

  const openEditForm = (item: MenuItem) => {
    setEditingId(item.id);
    setForm({
      name: item.name,
      description: item.description ?? "",
      price: String(item.price),
      available_quantity: String(item.available_quantity),
      category_id: item.category_id ?? "",
      is_active: item.is_active,
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.price) {
      alert("Name and Price are required.");
      return;
    }
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
          },
        },
        { onSuccess: () => setShowForm(false), onError: () => alert("Failed to save.") }
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
        },
        { onSuccess: () => setShowForm(false), onError: () => alert("Failed to save.") }
      );
    }
  };

  const handleDelete = (id: string) => {
    if (!confirm("Delete this item?")) return;
    deleteItemMut.mutate(id);
  };

  const handleCreateCategory = async () => {
    if (!newCatName.trim()) return;
    const locationId = await getLocationId();
    createCatMut.mutate(
      { location_id: locationId, name: newCatName.trim(), sort_order: categories.length },
      {
        onSuccess: () => { setNewCatName(""); setShowCatForm(false); },
        onError: () => alert("Failed to create category."),
      }
    );
  };

  const isSaving = createItemMut.isPending || updateItemMut.isPending;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">Menu & Inventory</h1>
          <p className="text-zinc-500 mt-1">Manage your products and stock</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setShowCatForm(!showCatForm)} leftIcon={<Plus className="w-4 h-4" />}>
            Add Category
          </Button>
          <Button onClick={openCreateForm} leftIcon={<Plus className="w-4 h-4" />}>
            Add Item
          </Button>
        </div>
      </div>

      {showCatForm && (
        <div className="bg-white dark:bg-zinc-900 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 flex gap-3">
          <Input type="text" value={newCatName} onChange={(e) => setNewCatName(e.target.value)} placeholder="Category name" className="flex-1" />
          <Button onClick={handleCreateCategory} disabled={!newCatName.trim()} isLoading={createCatMut.isPending}>Create</Button>
          <button onClick={() => setShowCatForm(false)} className="p-2 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50"><X className="w-4 h-4" /></button>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowForm(false)} />
          <div className="relative w-full max-w-lg bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-xl p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">{editingId ? "Edit Item" : "New Menu Item"}</h3>
              <button onClick={() => setShowForm(false)} className="p-2 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <Label className="mb-1 block">Name *</Label>
                <Input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <Label className="mb-1 block">Description</Label>
                <Input type="text" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="mb-1 block">Price *</Label>
                  <Input type="number" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
                </div>
                <div>
                  <Label className="mb-1 block">Stock</Label>
                  <Input type="number" value={form.available_quantity} onChange={(e) => setForm({ ...form, available_quantity: e.target.value })} />
                </div>
              </div>
              <div>
                <Label className="mb-1 block">Category</Label>
                <select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })} className="w-full px-3 py-2.5 bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-50 border border-zinc-300 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-50 transition-all">
                  <option value="">No category</option>
                  {categories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="is_active" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
                <Label htmlFor="is_active" className="cursor-pointer">Active (visible on Floor)</Label>
              </div>
            </div>
            <Button onClick={handleSave} isLoading={isSaving} leftIcon={<Save className="w-4 h-4" />} className="w-full">
              {editingId ? "Update Item" : "Create Item"}
            </Button>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/50">
                <th className="px-6 py-4 text-sm font-semibold text-zinc-900 dark:text-zinc-50">Name</th>
                <th className="px-6 py-4 text-sm font-semibold text-zinc-900 dark:text-zinc-50">Category</th>
                <th className="px-6 py-4 text-sm font-semibold text-zinc-900 dark:text-zinc-50">Price</th>
                <th className="px-6 py-4 text-sm font-semibold text-zinc-900 dark:text-zinc-50">Stock</th>
                <th className="px-6 py-4 text-sm font-semibold text-zinc-900 dark:text-zinc-50">Status</th>
                <th className="px-6 py-4 text-sm font-semibold text-zinc-900 dark:text-zinc-50 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {items.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-12 text-center text-zinc-400 text-sm">No menu items yet. Click &quot;Add Item&quot; to get started.</td></tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/50 transition-colors">
                    <td className="px-6 py-4 text-sm font-medium text-zinc-900 dark:text-zinc-100">{item.name}</td>
                    <td className="px-6 py-4 text-sm text-zinc-500">{item.category?.name ?? "—"}</td>
                    <td className="px-6 py-4 text-sm text-zinc-500">${Number(item.price).toFixed(2)}</td>
                    <td className="px-6 py-4 text-sm text-zinc-500">{item.available_quantity}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${item.is_active ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500"}`}>
                        {item.is_active ? "Active" : "Disabled"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right flex items-center justify-end gap-2">
                      <button onClick={() => openEditForm(item)} className="p-2 text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"><Edit2 className="w-4 h-4" /></button>
                      <button onClick={() => handleDelete(item.id)} className="p-2 text-zinc-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"><Trash2 className="w-4 h-4" /></button>
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
