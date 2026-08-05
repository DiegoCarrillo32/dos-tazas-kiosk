"use client";

import { useState } from "react";
import { Shield, ShieldAlert, Trash2, Loader2, UserPlus, UserCog, Users } from "lucide-react";
import type { StaffMember } from "@/lib/types";
import {
  useStaffProfiles,
  useCurrentProfile,
  useSessionContext,
  useUpdateStaffRole,
  useRemoveStaff,
  useInviteStaff,
  useAddStaffMemberByEmail,
} from "@/lib/hooks";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";
import { Modal } from "@/components/ui/Modal";
import { useToast, useConfirm } from "@/components/ui/Feedback";
import { useT } from "@/lib/i18n/LanguageContext";

export default function StaffManagement() {
  const t = useT();
  const toast = useToast();
  const confirmDialog = useConfirm();
  const { data: staff = [], isLoading } = useStaffProfiles();
  const { data: currentUser } = useCurrentProfile();
  const { data: session } = useSessionContext();
  const updateRoleMut = useUpdateStaffRole();
  const removeMut = useRemoveStaff();
  const inviteMut = useInviteStaff();
  const addByEmailMut = useAddStaffMemberByEmail();

  const activeLocationName =
    session?.locations.find((l) => l.id === session.active_location_id)?.name ?? "";

  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitePassword, setInvitePassword] = useState("");
  const [inviteFirst, setInviteFirst] = useState("");
  const [inviteLast, setInviteLast] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "staff">("staff");

  const [showAddByEmail, setShowAddByEmail] = useState(false);
  const [addEmail, setAddEmail] = useState("");
  const [addRole, setAddRole] = useState<"admin" | "staff">("staff");

  const handleInvite = () => {
    if (!inviteEmail || !invitePassword || !inviteFirst) {
      toast(t("staff.fieldsRequired"));
      return;
    }
    inviteMut.mutate(
      {
        email: inviteEmail,
        password: invitePassword,
        firstName: inviteFirst,
        lastName: inviteLast,
        role: inviteRole,
      },
      {
        onSuccess: () => {
          setShowInvite(false);
          setInviteEmail("");
          setInvitePassword("");
          setInviteFirst("");
          setInviteLast("");
          setInviteRole("staff");
        },
        onError: (err) => toast(t("staff.failedToInvite", { msg: err.message })),
      }
    );
  };

  const handleAddByEmail = () => {
    if (!addEmail.trim()) {
      toast(t("staff.emailRequired"));
      return;
    }
    addByEmailMut.mutate(
      { email: addEmail.trim(), role: addRole },
      {
        onSuccess: () => {
          setShowAddByEmail(false);
          setAddEmail("");
          setAddRole("staff");
        },
        onError: (err) => toast(t("staff.failedToAdd", { msg: err.message })),
      }
    );
  };

  const handleToggleRole = async (member: StaffMember) => {
    const newRole = member.role === "admin" ? "staff" : "admin";
    if (!(await confirmDialog(t("staff.confirmRoleChange", { name: member.first_name ?? "", role: newRole })))) return;
    updateRoleMut.mutate(
      { userId: member.id, role: newRole },
      { onError: (err) => toast(err.message) }
    );
  };

  const handleRemove = async (member: StaffMember) => {
    if (member.id === currentUser?.id) {
      toast(t("staff.cannotRemoveSelf"));
      return;
    }
    if (
      !(await confirmDialog(
        t("staff.confirmRemove", {
          name: `${member.first_name} ${member.last_name ?? ""}`.trim(),
          location: activeLocationName,
        })
      ))
    )
      return;
    removeMut.mutate(member.id, { onError: (err) => toast(err.message) });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-expresso/40" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-expresso">{t("staff.title")}</h1>
          <p className="text-expresso/60 mt-1">{t("staff.subtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={() => setShowAddByEmail(true)}
            leftIcon={<UserCog className="w-4 h-4" />}
          >
            {t("staff.addByEmail")}
          </Button>
          <Button
            onClick={() => setShowInvite(true)}
            leftIcon={<UserPlus className="w-4 h-4" />}
          >
            {t("staff.invite")}
          </Button>
        </div>
      </div>

      {/* Add Existing User Modal */}
      {showAddByEmail && (
        <Modal onClose={() => setShowAddByEmail(false)} title={t("staff.addByEmailTitle")} size="sm">
          <div className="space-y-5">
            <div className="space-y-4">
              <div>
                <Label className="mb-1 block">{t("staff.emailToAdd")}</Label>
                <Input
                  type="email"
                  value={addEmail}
                  onChange={(e) => setAddEmail(e.target.value)}
                  placeholder="staff@dostazas.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-expresso/80 mb-1">{t("staff.role")}</label>
                <select
                  value={addRole}
                  onChange={(e) => setAddRole(e.target.value as "admin" | "staff")}
                  className="w-full h-11 px-3 bg-background border border-warm-roast/10 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-coffee-fruit"
                >
                  <option value="staff">{t("settings.roleStaff")}</option>
                  <option value="admin">{t("settings.roleAdmin")}</option>
                </select>
              </div>
            </div>
            <Button
              onClick={handleAddByEmail}
              disabled={!addEmail.trim()}
              isLoading={addByEmailMut.isPending}
              leftIcon={<UserCog className="w-4 h-4" />}
              className="w-full"
            >
              {t("staff.addAccountButton")}
            </Button>
          </div>
        </Modal>
      )}

      {/* Invite Modal */}
      {showInvite && (
        <Modal onClose={() => setShowInvite(false)} title={t("staff.inviteTitle")} size="md">
          <div className="space-y-5">
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="mb-1 block">{t("staff.firstName")}</Label>
                  <Input type="text" value={inviteFirst} onChange={(e) => setInviteFirst(e.target.value)} />
                </div>
                <div>
                  <Label className="mb-1 block">{t("staff.lastName")}</Label>
                  <Input type="text" value={inviteLast} onChange={(e) => setInviteLast(e.target.value)} />
                </div>
              </div>
              <div>
                <Label className="mb-1 block">{t("staff.email")}</Label>
                <Input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="staff@dostazas.com" />
              </div>
              <div>
                <Label className="mb-1 block">{t("staff.password")}</Label>
                <Input type="password" value={invitePassword} onChange={(e) => setInvitePassword(e.target.value)} placeholder={t("staff.passwordPlaceholder")} />
              </div>
              <div>
                <label className="block text-sm font-medium text-expresso/80 mb-1">{t("staff.role")}</label>
                <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as "admin" | "staff")} className="w-full h-11 px-3 bg-background border border-warm-roast/10 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-coffee-fruit">
                  <option value="staff">{t("settings.roleStaff")}</option>
                  <option value="admin">{t("settings.roleAdmin")}</option>
                </select>
              </div>
            </div>
            <Button
              onClick={handleInvite}
              disabled={!inviteEmail || !invitePassword || !inviteFirst}
              isLoading={inviteMut.isPending}
              leftIcon={<UserPlus className="w-4 h-4" />}
              className="w-full"
            >
              {t("staff.createAccount")}
            </Button>
          </div>
        </Modal>
      )}

      {/* Staff Table */}
      <div className="bg-card rounded-2xl border border-warm-roast/10 overflow-hidden shadow-sm">
        <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
          <table className="w-full min-w-max whitespace-nowrap text-left border-collapse">
            <thead>
              <tr className="border-b border-warm-roast/10 bg-muted/40">
                <th className="px-4 sm:px-6 py-3 sm:py-4 text-sm font-semibold text-expresso">{t("staff.colName")}</th>
                <th className="px-4 sm:px-6 py-3 sm:py-4 text-sm font-semibold text-expresso">{t("staff.colRole")}</th>
                <th className="px-4 sm:px-6 py-3 sm:py-4 text-sm font-semibold text-expresso">{t("staff.colJoined")}</th>
                <th className="px-4 sm:px-6 py-3 sm:py-4 text-sm font-semibold text-expresso text-right">{t("staff.colActions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-warm-roast/10">
              {staff.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center whitespace-normal">
                    <div className="flex flex-col items-center gap-3 text-expresso/40">
                      <Users className="w-10 h-10 opacity-20" />
                      <p className="text-sm">{t("staff.noStaff")}</p>
                    </div>
                  </td>
                </tr>
              ) : (
                staff.map((member) => {
                  const isCurrentUser = member.id === currentUser?.id;
                  return (
                    <tr key={member.id} className="hover:bg-warm-roast/5 transition-colors">
                      <td className="px-4 sm:px-6 py-3 sm:py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 shrink-0 rounded-full bg-warm-roast/10 flex items-center justify-center font-bold text-sm text-expresso/70">
                            {(member.first_name?.[0] ?? "?").toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium text-sm text-expresso">
                              {member.first_name} {member.last_name ?? ""}
                              {isCurrentUser && <span className="ml-2 text-xs text-expresso/40">{t("staff.you")}</span>}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 sm:px-6 py-3 sm:py-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                          member.role === "admin"
                            ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
                            : "bg-warm-roast/10 text-expresso/70"
                        }`}>
                          {member.role === "admin" ? <ShieldAlert className="w-3 h-3" /> : <Shield className="w-3 h-3" />}
                          {member.role === "admin" ? t("settings.roleAdmin") : t("settings.roleStaff")}
                        </span>
                      </td>
                      <td className="px-4 sm:px-6 py-3 sm:py-4 text-sm text-expresso/60">
                        {new Date(member.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 sm:px-6 py-3 sm:py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleToggleRole(member)}
                            disabled={isCurrentUser || updateRoleMut.isPending}
                            className="px-3 min-h-[44px] text-xs font-medium border border-warm-roast/15 rounded-lg hover:bg-warm-roast/5 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            {member.role === "admin" ? t("staff.demote") : t("staff.promote")}
                          </button>
                          <button
                            onClick={() => handleRemove(member)}
                            disabled={isCurrentUser || removeMut.isPending}
                            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-expresso/40 hover:text-destructive transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
