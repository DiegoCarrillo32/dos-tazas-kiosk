"use client";

import { useState } from "react";
import { Plus, Trash2, Loader2, Armchair, Check, X, Pencil } from "lucide-react";
import type { Table } from "@/lib/types";
import { useTables, useCreateTable, useUpdateTable, useDeleteTable } from "@/lib/hooks";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useToast, useConfirm } from "@/components/ui/Feedback";
import { useT } from "@/lib/i18n/LanguageContext";

export default function TablesManagement() {
  const t = useT();
  const toast = useToast();
  const confirmDialog = useConfirm();
  const { data: tables = [], isLoading } = useTables();
  const createMut = useCreateTable();
  const updateMut = useUpdateTable();
  const deleteMut = useDeleteTable();

  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const handleCreate = () => {
    const name = newName.trim();
    if (!name) return;
    createMut.mutate(name, { onSuccess: () => setNewName("") });
  };

  const startEdit = (tbl: Table) => {
    setEditingId(tbl.id);
    setEditName(tbl.name);
  };

  const saveEdit = () => {
    if (!editingId) return;
    const name = editName.trim();
    if (!name) return;
    updateMut.mutate(
      { id: editingId, updates: { name } },
      { onSuccess: () => setEditingId(null) }
    );
  };

  const handleDelete = async (tbl: Table) => {
    if (!(await confirmDialog(t("tables.deleteConfirm", { name: tbl.name })))) return;
    deleteMut.mutate(tbl.id, { onError: () => toast(t("tables.failedToDelete")) });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-expresso/40" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-expresso">{t("tables.title")}</h1>
        <p className="text-expresso/60 mt-1">{t("tables.subtitle")}</p>
      </div>

      {/* Add */}
      <div className="bg-card p-4 rounded-xl border border-warm-roast/10 flex flex-col sm:flex-row gap-3">
        <Input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          placeholder={t("tables.placeholder")}
          className="flex-1"
        />
        <Button onClick={handleCreate} disabled={!newName.trim()} isLoading={createMut.isPending} leftIcon={<Plus className="w-4 h-4" />} className="w-full sm:w-auto">
          {t("tables.addTable")}
        </Button>
      </div>

      {/* List */}
      <div className="bg-card rounded-2xl border border-warm-roast/10 overflow-hidden">
        {tables.length === 0 ? (
          <div className="px-6 py-12 text-center text-expresso/40 text-sm">
            {t("tables.noTables")}
          </div>
        ) : (
          <ul className="divide-y divide-warm-roast/10">
            {tables.map((tbl) => (
              <li key={tbl.id} className="flex items-center gap-3 px-5 py-3">
                <div className="w-9 h-9 rounded-lg bg-warm-roast/10 flex items-center justify-center shrink-0">
                  <Armchair className="w-5 h-5 text-expresso/40" />
                </div>
                {editingId === tbl.id ? (
                  <>
                    <Input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveEdit();
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      className="flex-1"
                      autoFocus
                    />
                    <button onClick={saveEdit} className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-green-600 hover:text-green-700" title={t("common.save")}>
                      <Check className="w-4 h-4" />
                    </button>
                    <button onClick={() => setEditingId(null)} className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-expresso/40 hover:text-expresso" title={t("common.cancel")}>
                      <X className="w-4 h-4" />
                    </button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 font-medium text-expresso">{tbl.name}</span>
                    <button onClick={() => startEdit(tbl)} className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-expresso/40 hover:text-coffee-fruit transition-colors" title={t("tables.rename")}>
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDelete(tbl)} className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-expresso/40 hover:text-destructive transition-colors" title={t("tables.delete")}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
