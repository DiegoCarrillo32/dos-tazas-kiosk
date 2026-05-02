"use client";

import { useState } from "react";
import { Plus, Edit2, Trash2, X, Save, Loader2, ChevronDown, ChevronRight } from "lucide-react";
import type { Modifier, ModifierOption } from "@/lib/types";
import {
  useAllModifiers,
  useCreateModifier,
  useUpdateModifier,
  useDeleteModifier,
  useCreateModifierOption,
  useDeleteModifierOption,
} from "@/lib/hooks";
import { createClient } from "@/utils/supabase/client";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";
import { Checkbox } from "@/components/ui/Checkbox";

export default function ModifiersManagement() {
  const { data: modifiers = [], isLoading } = useAllModifiers();
  const createModMut = useCreateModifier();
  const updateModMut = useUpdateModifier();
  const deleteModMut = useDeleteModifier();
  const createOptMut = useCreateModifierOption();
  const deleteOptMut = useDeleteModifierOption();

  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Modifier form
  const [showModForm, setShowModForm] = useState(false);
  const [editingModId, setEditingModId] = useState<string | null>(null);
  const [modName, setModName] = useState("");
  const [modIsMultiple, setModIsMultiple] = useState(false);
  const [modIsRequired, setModIsRequired] = useState(false);

  // Option form
  const [addingOptionFor, setAddingOptionFor] = useState<string | null>(null);
  const [optName, setOptName] = useState("");
  const [optPrice, setOptPrice] = useState("0");

  const getLocationId = async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");
    const { data: profile } = await supabase.from("user_profiles").select("location_id").eq("id", user.id).single();
    return profile?.location_id;
  };

  const openCreateMod = () => {
    setEditingModId(null);
    setModName("");
    setModIsMultiple(false);
    setModIsRequired(false);
    setShowModForm(true);
  };

  const openEditMod = (mod: Modifier) => {
    setEditingModId(mod.id);
    setModName(mod.name);
    setModIsMultiple(mod.is_multiple);
    setModIsRequired(mod.is_required);
    setShowModForm(true);
  };

  const handleSaveMod = async () => {
    if (!modName.trim()) return;
    if (editingModId) {
      updateModMut.mutate(
        { id: editingModId, updates: { name: modName.trim(), is_multiple: modIsMultiple, is_required: modIsRequired } },
        { onSuccess: () => setShowModForm(false) }
      );
    } else {
      const locationId = await getLocationId();
      createModMut.mutate(
        { location_id: locationId, name: modName.trim(), is_multiple: modIsMultiple, is_required: modIsRequired },
        { onSuccess: () => setShowModForm(false) }
      );
    }
  };

  const handleDeleteMod = (id: string) => {
    if (!confirm("Delete this modifier and all its options?")) return;
    deleteModMut.mutate(id);
  };

  const handleAddOption = (modifierId: string) => {
    if (!optName.trim()) return;
    createOptMut.mutate(
      { modifier_id: modifierId, name: optName.trim(), extra_price: parseFloat(optPrice) || 0 },
      { onSuccess: () => { setAddingOptionFor(null); setOptName(""); setOptPrice("0"); } }
    );
  };

  const isSaving = createModMut.isPending || updateModMut.isPending;

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
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">Modifiers</h1>
          <p className="text-zinc-500 mt-1">Manage item customization options (Milk Type, Size, etc.)</p>
        </div>
        <Button onClick={openCreateMod} leftIcon={<Plus className="w-4 h-4" />}>
          Add Modifier
        </Button>
      </div>

      {showModForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowModForm(false)} />
          <div className="relative w-full max-w-md bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-xl p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">{editingModId ? "Edit Modifier" : "New Modifier"}</h3>
              <button onClick={() => setShowModForm(false)} className="p-2 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <Label className="mb-1 block">Name *</Label>
                <Input type="text" value={modName} onChange={(e) => setModName(e.target.value)} placeholder="e.g. Milk Type, Size" />
              </div>
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox checked={modIsRequired} onChange={(e) => setModIsRequired(e.target.checked)} />
                  <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Required</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox checked={modIsMultiple} onChange={(e) => setModIsMultiple(e.target.checked)} />
                  <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Allow multiple</span>
                </label>
              </div>
            </div>
            <Button onClick={handleSaveMod} disabled={!modName.trim()} isLoading={isSaving} leftIcon={<Save className="w-4 h-4" />} className="w-full">
              {editingModId ? "Update" : "Create"}
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {modifiers.length === 0 ? (
          <div className="bg-white dark:bg-zinc-900 p-12 rounded-2xl border border-zinc-200 dark:border-zinc-800 text-center text-zinc-400 text-sm">
            No modifiers yet. Click &quot;Add Modifier&quot; to create one.
          </div>
        ) : (
          modifiers.map((mod) => {
            const isExpanded = expandedId === mod.id;
            const options = mod.options ?? [];
            return (
              <div key={mod.id} className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden shadow-sm">
                <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors" onClick={() => setExpandedId(isExpanded ? null : mod.id)}>
                  <div className="flex items-center gap-3">
                    {isExpanded ? <ChevronDown className="w-4 h-4 text-zinc-400" /> : <ChevronRight className="w-4 h-4 text-zinc-400" />}
                    <div>
                      <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">{mod.name}</h3>
                      <div className="flex items-center gap-2 mt-0.5">
                        {mod.is_required && <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 font-medium">Required</span>}
                        {mod.is_multiple && <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 font-medium">Multi-select</span>}
                        <span className="text-xs text-zinc-400">{options.length} option{options.length !== 1 ? "s" : ""}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => openEditMod(mod)} className="p-2 text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"><Edit2 className="w-4 h-4" /></button>
                    <button onClick={() => handleDeleteMod(mod.id)} className="p-2 text-zinc-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
                {isExpanded && (
                  <div className="border-t border-zinc-200 dark:border-zinc-800 p-4 bg-zinc-50/50 dark:bg-zinc-950/50 space-y-3">
                    {options.map((opt: ModifierOption) => (
                      <div key={opt.id} className="flex items-center justify-between bg-white dark:bg-zinc-900 p-3 rounded-lg border border-zinc-200 dark:border-zinc-800">
                        <div>
                          <span className="font-medium text-sm text-zinc-900 dark:text-zinc-100">{opt.name}</span>
                          {Number(opt.extra_price) > 0 && <span className="ml-2 text-xs text-zinc-500">+${Number(opt.extra_price).toFixed(2)}</span>}
                        </div>
                        <button onClick={() => deleteOptMut.mutate(opt.id)} className="p-1.5 text-zinc-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    ))}
                    {addingOptionFor === mod.id ? (
                      <div className="flex gap-2 items-end">
                        <div className="flex-1">
                          <Input type="text" value={optName} onChange={(e) => setOptName(e.target.value)} placeholder="Option name" />
                        </div>
                        <div className="w-28">
                          <Input type="number" step="0.01" value={optPrice} onChange={(e) => setOptPrice(e.target.value)} placeholder="Extra $" />
                        </div>
                        <Button onClick={() => handleAddOption(mod.id)} disabled={!optName.trim()} isLoading={createOptMut.isPending}>Add</Button>
                        <button onClick={() => { setAddingOptionFor(null); setOptName(""); setOptPrice("0"); }} className="p-2 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50"><X className="w-4 h-4" /></button>
                      </div>
                    ) : (
                      <button onClick={() => { setAddingOptionFor(mod.id); setOptName(""); setOptPrice("0"); }} className="flex items-center gap-2 text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors">
                        <Plus className="w-4 h-4" /> Add Option
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
