"use client";

import { useState } from "react";
import {
  Building2,
  Plus,
  MapPin,
  Pencil,
  Archive,
  ArchiveRestore,
  Check,
  X,
  ShieldAlert,
  Shield,
} from "lucide-react";
import {
  useSessionContext,
  useCreateLocation,
  useUpdateLocation,
  useArchiveLocation,
  useRestoreLocation,
} from "@/lib/hooks";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";
import { Modal } from "@/components/ui/Modal";
import { Checkbox } from "@/components/ui/Checkbox";
import { useToast, useConfirm } from "@/components/ui/Feedback";
import { useT } from "@/lib/i18n/LanguageContext";
import { PageHeaderSkeleton, CardListSkeleton } from "../_components/Skeletons";
import { Skeleton } from "@/components/ui/Skeleton";

export default function LocationsManagement() {
  const t = useT();
  const toast = useToast();
  const confirmDialog = useConfirm();
  const { data: session, isLoading } = useSessionContext();
  const createMut = useCreateLocation();
  const updateMut = useUpdateLocation();
  const archiveMut = useArchiveLocation();
  const restoreMut = useRestoreLocation();

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [copyFrom, setCopyFrom] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editAddress, setEditAddress] = useState("");

  const [showArchived, setShowArchived] = useState(false);

  const locations = session?.locations ?? [];
  // Only locations the caller administers make sense as a copy-menu
  // source — create_location (00026) rejects any other choice server-side.
  const adminLocations = locations.filter((l) => l.role === "admin");
  const visible = locations.filter((l) => showArchived || !l.archived);
  const archivedCount = locations.filter((l) => l.archived).length;

  const handleCreate = () => {
    const name = newName.trim();
    if (!name) {
      toast(t("locations.nameRequired"));
      return;
    }
    createMut.mutate(
      { name, address: newAddress.trim() || null, copyMenuFrom: copyFrom || null },
      {
        onSuccess: () => {
          setShowCreate(false);
          setNewName("");
          setNewAddress("");
          setCopyFrom("");
        },
        onError: (err) => toast(t("locations.failedToCreate", { msg: err.message })),
      }
    );
  };

  const startEdit = (loc: { id: string; name: string; address: string | null }) => {
    setEditingId(loc.id);
    setEditName(loc.name);
    setEditAddress(loc.address ?? "");
  };

  const saveEdit = () => {
    if (!editingId) return;
    const name = editName.trim();
    if (!name) {
      toast(t("locations.nameRequired"));
      return;
    }
    updateMut.mutate(
      { id: editingId, name, address: editAddress.trim() || null },
      {
        onSuccess: () => setEditingId(null),
        onError: (err) => toast(t("locations.failedToSave", { msg: err.message })),
      }
    );
  };

  const handleArchive = async (loc: { id: string; name: string }) => {
    if (!(await confirmDialog(t("locations.archiveConfirm", { name: loc.name })))) return;
    archiveMut.mutate(loc.id, {
      onError: (err) => toast(t("locations.archiveFailed", { msg: err.message })),
    });
  };

  const handleRestore = (loc: { id: string }) => {
    restoreMut.mutate(loc.id, {
      onError: (err) => toast(t("locations.restoreFailed", { msg: err.message })),
    });
  };

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-3xl">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <PageHeaderSkeleton />
          <Skeleton className="h-11 w-32 rounded-md" />
        </div>
        <CardListSkeleton rows={4} />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-3xl animate-in fade-in-0 duration-200">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-expresso">{t("locations.title")}</h1>
          <p className="text-expresso/60 mt-1">{t("locations.subtitle")}</p>
        </div>
        <Button onClick={() => setShowCreate(true)} leftIcon={<Plus className="w-4 h-4" />}>
          {t("locations.add")}
        </Button>
      </div>

      {archivedCount > 0 && (
        <label className="flex items-center gap-2 min-h-[44px] py-2 text-sm text-expresso/60 cursor-pointer w-fit">
          <Checkbox
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          {t("locations.showArchived")}
        </label>
      )}

      {/* Create Modal */}
      {showCreate && (
        <Modal onClose={() => setShowCreate(false)} title={t("locations.addTitle")} size="md">
          <div className="space-y-5">
            <div className="space-y-4">
              <div>
                <Label className="mb-1 block">{t("locations.name")}</Label>
                <Input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder={t("locations.namePlaceholder")}
                  autoFocus
                />
              </div>
              <div>
                <Label className="mb-1 block">{t("locations.address")}</Label>
                <Input
                  type="text"
                  value={newAddress}
                  onChange={(e) => setNewAddress(e.target.value)}
                  placeholder={t("locations.addressPlaceholder")}
                />
              </div>
              {adminLocations.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-expresso/80 mb-1">
                    {t("locations.copyMenuFrom")}
                  </label>
                  <select
                    value={copyFrom}
                    onChange={(e) => setCopyFrom(e.target.value)}
                    className="w-full h-11 px-3 bg-background border border-warm-roast/10 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-coffee-fruit"
                  >
                    <option value="">{t("locations.copyMenuNone")}</option>
                    {adminLocations.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-expresso/40 mt-1">{t("locations.copyMenuHelp")}</p>
                </div>
              )}
            </div>
            <Button
              onClick={handleCreate}
              disabled={!newName.trim()}
              isLoading={createMut.isPending}
              leftIcon={<Building2 className="w-4 h-4" />}
              className="w-full"
            >
              {t("locations.create")}
            </Button>
          </div>
        </Modal>
      )}

      {/* List */}
      <div className="bg-card rounded-2xl border border-warm-roast/10 overflow-hidden">
        {visible.length === 0 ? (
          <div className="px-6 py-12 text-center text-expresso/40 text-sm">
            {t("locations.noLocations")}
          </div>
        ) : (
          <ul className="divide-y divide-warm-roast/10">
            {visible.map((loc) => (
              <li key={loc.id} className="flex items-center gap-3 px-5 py-4">
                <div className="w-10 h-10 rounded-lg bg-warm-roast/10 flex items-center justify-center shrink-0">
                  <Building2 className="w-5 h-5 text-expresso/40" />
                </div>

                {editingId === loc.id ? (
                  <div className="flex-1 flex flex-col sm:flex-row gap-2">
                    <Input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="flex-1"
                      autoFocus
                    />
                    <Input
                      type="text"
                      value={editAddress}
                      onChange={(e) => setEditAddress(e.target.value)}
                      placeholder={t("locations.addressPlaceholder")}
                      className="flex-1"
                    />
                    <div className="flex gap-1 shrink-0">
                      <button onClick={saveEdit} className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-green-600 hover:text-green-700" title={t("common.save")}>
                        <Check className="w-4 h-4" />
                      </button>
                      <button onClick={() => setEditingId(null)} className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-expresso/40 hover:text-expresso" title={t("common.cancel")}>
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-expresso truncate">{loc.name}</p>
                        {loc.id === session?.active_location_id && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                            {t("locations.active")}
                          </span>
                        )}
                        {loc.archived && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-warm-roast/10 text-expresso/60">
                            {t("locations.archived")}
                          </span>
                        )}
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                            loc.role === "admin"
                              ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
                              : "bg-warm-roast/10 text-expresso/70"
                          }`}
                        >
                          {loc.role === "admin" ? <ShieldAlert className="w-3 h-3" /> : <Shield className="w-3 h-3" />}
                          {loc.role === "admin" ? t("settings.roleAdmin") : t("settings.roleStaff")}
                        </span>
                      </div>
                      {loc.address && (
                        <p className="text-sm text-expresso/50 flex items-center gap-1 mt-0.5">
                          <MapPin className="w-3.5 h-3.5" /> {loc.address}
                        </p>
                      )}
                    </div>

                    {/* Only an admin AT THIS location can edit/archive it —
                        matches is_admin_at() in update_location/archive_location. */}
                    {loc.role === "admin" && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => startEdit(loc)}
                          className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-expresso/40 hover:text-coffee-fruit transition-colors"
                          title={t("locations.editTitle")}
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        {loc.archived ? (
                          <button
                            onClick={() => handleRestore(loc)}
                            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-expresso/40 hover:text-coffee-fruit transition-colors"
                            title={t("locations.restore")}
                          >
                            <ArchiveRestore className="w-4 h-4" />
                          </button>
                        ) : (
                          <button
                            onClick={() => handleArchive(loc)}
                            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-expresso/40 hover:text-destructive transition-colors"
                            title={t("locations.archive")}
                          >
                            <Archive className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    )}
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
