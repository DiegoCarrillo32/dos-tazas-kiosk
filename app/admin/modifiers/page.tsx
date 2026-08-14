"use client";

import { useState } from "react";
import { Plus, Edit2, Trash2, X, Save, ChevronDown, ChevronRight } from "lucide-react";
import type { Modifier, ModifierOption } from "@/lib/types";
import {
  useAllModifiers,
  useCreateModifier,
  useUpdateModifier,
  useDeleteModifier,
  useCreateModifierOption,
  useUpdateModifierOption,
  useDeleteModifierOption,
} from "@/lib/hooks";
import { getLocationId } from "@/lib/queries";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";
import { Checkbox } from "@/components/ui/Checkbox";
import { Modal } from "@/components/ui/Modal";
import { useConfirm } from "@/components/ui/Feedback";
import { formatMoney } from "@/lib/utils";
import { useT } from "@/lib/i18n/LanguageContext";
import { CardListSkeleton } from "../_components/Skeletons";

export default function ModifiersManagement() {
  const t = useT();
  const confirmDialog = useConfirm();
  const { data: modifiers = [], isLoading } = useAllModifiers();
  const createModMut = useCreateModifier();
  const updateModMut = useUpdateModifier();
  const deleteModMut = useDeleteModifier();
  const createOptMut = useCreateModifierOption();
  const updateOptMut = useUpdateModifierOption();
  const deleteOptMut = useDeleteModifierOption();

  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [showModForm, setShowModForm] = useState(false);
  const [editingModId, setEditingModId] = useState<string | null>(null);
  const [modName, setModName] = useState("");
  const [modIsMultiple, setModIsMultiple] = useState(false);
  const [modIsRequired, setModIsRequired] = useState(false);

  const [addingOptionFor, setAddingOptionFor] = useState<string | null>(null);
  const [optName, setOptName] = useState("");
  const [optPrice, setOptPrice] = useState("0");

  const [editingOptId, setEditingOptId] = useState<string | null>(null);
  const [editOptName, setEditOptName] = useState("");
  const [editOptPrice, setEditOptPrice] = useState("0");

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

  const handleDeleteMod = async (id: string) => {
    if (!(await confirmDialog(t("modifiers.deleteConfirm")))) return;
    deleteModMut.mutate(id);
  };

  const handleAddOption = (modifierId: string) => {
    if (!optName.trim()) return;
    createOptMut.mutate(
      { modifier_id: modifierId, name: optName.trim(), extra_price: parseFloat(optPrice) || 0 },
      { onSuccess: () => { setAddingOptionFor(null); setOptName(""); setOptPrice("0"); } }
    );
  };

  const openEditOption = (opt: ModifierOption) => {
    setEditingOptId(opt.id);
    setEditOptName(opt.name);
    setEditOptPrice(String(opt.extra_price));
  };

  const cancelEditOption = () => {
    setEditingOptId(null);
    setEditOptName("");
    setEditOptPrice("0");
  };

  const handleSaveOption = (id: string) => {
    if (!editOptName.trim()) return;
    updateOptMut.mutate(
      { id, updates: { name: editOptName.trim(), extra_price: parseFloat(editOptPrice) || 0 } },
      { onSuccess: cancelEditOption }
    );
  };

  const isSaving = createModMut.isPending || updateModMut.isPending;

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-expresso">{t("modifiers.title")}</h1>
          <p className="text-expresso/60 mt-1">{t("modifiers.subtitle")}</p>
        </div>
        <Button onClick={openCreateMod} leftIcon={<Plus className="w-4 h-4" />}>
          {t("modifiers.addModifier")}
        </Button>
      </div>

      {showModForm && (
        <Modal onClose={() => setShowModForm(false)} title={editingModId ? t("modifiers.editModifier") : t("modifiers.newModifier")} size="md">
          <div className="space-y-5">
            <div className="space-y-4">
              <div>
                <Label className="mb-1 block">{t("modifiers.name")}</Label>
                <Input type="text" value={modName} onChange={(e) => setModName(e.target.value)} placeholder="e.g. Milk Type, Size" />
              </div>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                <label className="flex items-center gap-2 min-h-[44px] cursor-pointer">
                  <Checkbox checked={modIsRequired} onChange={(e) => setModIsRequired(e.target.checked)} />
                  <span className="text-sm font-medium text-expresso/80">{t("modifiers.required")}</span>
                </label>
                <label className="flex items-center gap-2 min-h-[44px] cursor-pointer">
                  <Checkbox checked={modIsMultiple} onChange={(e) => setModIsMultiple(e.target.checked)} />
                  <span className="text-sm font-medium text-expresso/80">{t("modifiers.allowMultiple")}</span>
                </label>
              </div>
            </div>
            <Button onClick={handleSaveMod} disabled={!modName.trim()} isLoading={isSaving} leftIcon={<Save className="w-4 h-4" />} className="w-full">
              {editingModId ? t("modifiers.update") : t("modifiers.create")}
            </Button>
          </div>
        </Modal>
      )}

      {isLoading ? (
        <CardListSkeleton rows={5} />
      ) : (
      <div className="space-y-4 animate-in fade-in-0 duration-200">
        {modifiers.length === 0 ? (
          <div className="bg-card p-12 rounded-2xl border border-warm-roast/10 text-center text-expresso/40 text-sm">
            {t("modifiers.noModifiers")}
          </div>
        ) : (
          modifiers.map((mod) => {
            const isExpanded = expandedId === mod.id;
            const options = mod.options ?? [];
            const optionLabel = options.length === 1 ? t("modifiers.option") : t("modifiers.options");
            return (
              <div key={mod.id} className="bg-card rounded-2xl border border-warm-roast/10 overflow-hidden shadow-sm">
                <div className="flex items-center justify-between gap-2 p-4 cursor-pointer hover:bg-warm-roast/5 transition-colors" onClick={() => setExpandedId(isExpanded ? null : mod.id)}>
                  <div className="flex items-center gap-3 min-w-0">
                    {isExpanded ? <ChevronDown className="w-4 h-4 shrink-0 text-expresso/40" /> : <ChevronRight className="w-4 h-4 shrink-0 text-expresso/40" />}
                    <div className="min-w-0">
                      <h3 className="font-semibold text-expresso truncate">{mod.name}</h3>
                      <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                        {mod.is_required && <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 font-medium">{t("modifiers.required")}</span>}
                        {mod.is_multiple && <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 font-medium">{t("modifiers.multiSelect")}</span>}
                        <span className="text-xs text-expresso/40">{options.length} {optionLabel}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => openEditMod(mod)} className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-expresso/40 hover:text-coffee-fruit transition-colors"><Edit2 className="w-4 h-4" /></button>
                    <button onClick={() => handleDeleteMod(mod.id)} className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-expresso/40 hover:text-destructive transition-colors"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
                {isExpanded && (
                  <div className="border-t border-warm-roast/10 p-4 bg-muted/40 space-y-3">
                    {options.map((opt: ModifierOption) =>
                      editingOptId === opt.id ? (
                        <div key={opt.id} className="flex flex-col sm:flex-row gap-2 sm:items-end bg-card p-3 rounded-lg border border-warm-roast/10">
                          <div className="flex-1 min-w-0">
                            <Input type="text" value={editOptName} onChange={(e) => setEditOptName(e.target.value)} placeholder={t("modifiers.optionName")} />
                          </div>
                          <div className="w-full sm:w-28 shrink-0">
                            <Input type="number" inputMode="numeric" step={1} min={0} value={editOptPrice} onChange={(e) => setEditOptPrice(e.target.value)} placeholder={t("modifiers.extraPrice")} />
                          </div>
                          <div className="flex gap-2 shrink-0">
                            <Button onClick={() => handleSaveOption(opt.id)} disabled={!editOptName.trim()} isLoading={updateOptMut.isPending} className="flex-1 sm:flex-initial">{t("common.save")}</Button>
                            <button onClick={cancelEditOption} className="shrink-0 min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-expresso/40 hover:text-expresso"><X className="w-4 h-4" /></button>
                          </div>
                        </div>
                      ) : (
                        <div key={opt.id} className="flex items-center justify-between gap-2 bg-card p-3 rounded-lg border border-warm-roast/10">
                          <div className="min-w-0">
                            <span className="font-medium text-sm text-expresso">{opt.name}</span>
                            {Number(opt.extra_price) > 0 && <span className="ml-2 text-xs text-expresso/60">+{formatMoney(opt.extra_price, "CRC")}</span>}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button onClick={() => openEditOption(opt)} className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-expresso/40 hover:text-coffee-fruit transition-colors"><Edit2 className="w-3.5 h-3.5" /></button>
                            <button onClick={() => deleteOptMut.mutate(opt.id)} className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-expresso/40 hover:text-destructive transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                          </div>
                        </div>
                      )
                    )}
                    {addingOptionFor === mod.id ? (
                      <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
                        <div className="flex-1 min-w-0">
                          <Input type="text" value={optName} onChange={(e) => setOptName(e.target.value)} placeholder={t("modifiers.optionName")} />
                        </div>
                        <div className="w-full sm:w-28 shrink-0">
                          <Input type="number" inputMode="numeric" step={1} min={0} value={optPrice} onChange={(e) => setOptPrice(e.target.value)} placeholder={t("modifiers.extraPrice")} />
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <Button onClick={() => handleAddOption(mod.id)} disabled={!optName.trim()} isLoading={createOptMut.isPending} className="flex-1 sm:flex-initial">{t("modifiers.add")}</Button>
                          <button onClick={() => { setAddingOptionFor(null); setOptName(""); setOptPrice("0"); }} className="shrink-0 min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-expresso/40 hover:text-expresso"><X className="w-4 h-4" /></button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => { setAddingOptionFor(mod.id); setOptName(""); setOptPrice("0"); }} className="flex items-center gap-2 min-h-[44px] text-sm font-medium text-expresso/60 hover:text-expresso transition-colors">
                        <Plus className="w-4 h-4" /> {t("modifiers.addOption")}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
      )}
    </div>
  );
}
