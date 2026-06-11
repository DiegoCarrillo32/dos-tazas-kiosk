"use client";

import { useState } from "react";
import { Shield, ShieldAlert, Trash2, X, Loader2, UserPlus, Users } from "lucide-react";
import type { UserProfile } from "@/lib/types";
import {
  useStaffProfiles,
  useCurrentProfile,
  useUpdateStaffRole,
  useRemoveStaff,
  useInviteStaff,
} from "@/lib/hooks";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";

export default function StaffManagement() {
  const { data: staff = [], isLoading } = useStaffProfiles();
  const { data: currentUser } = useCurrentProfile();
  const updateRoleMut = useUpdateStaffRole();
  const removeMut = useRemoveStaff();
  const inviteMut = useInviteStaff();

  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitePassword, setInvitePassword] = useState("");
  const [inviteFirst, setInviteFirst] = useState("");
  const [inviteLast, setInviteLast] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "staff">("staff");

  const handleInvite = () => {
    if (!inviteEmail || !invitePassword || !inviteFirst) {
      alert("Email, password, and first name are required.");
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
        onError: (err) => alert(`Failed to invite: ${err.message}`),
      }
    );
  };

  const handleToggleRole = (member: UserProfile) => {
    const newRole = member.role === "admin" ? "staff" : "admin";
    if (!confirm(`Change ${member.first_name}'s role to ${newRole}?`)) return;
    updateRoleMut.mutate({ userId: member.id, role: newRole });
  };

  const handleRemove = (member: UserProfile) => {
    if (member.id === currentUser?.id) {
      alert("You cannot remove yourself.");
      return;
    }
    if (!confirm(`Remove ${member.first_name} ${member.last_name ?? ""}? This will revoke their access.`)) return;
    removeMut.mutate(member.id);
  };

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
          <h1 className="text-2xl font-bold text-expresso">Staff Management</h1>
          <p className="text-expresso/60 mt-1">Manage team members for this location</p>
        </div>
        <Button
          onClick={() => setShowInvite(true)}
          leftIcon={<UserPlus className="w-4 h-4" />}
        >
          Invite Staff
        </Button>
      </div>

      {/* Invite Modal */}
      {showInvite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowInvite(false)} />
          <div className="relative w-full max-w-md bg-card rounded-2xl border border-warm-roast/10 shadow-xl p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-expresso">Invite Team Member</h3>
              <button onClick={() => setShowInvite(false)} className="p-2 text-expresso/40 hover:text-expresso">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="mb-1 block">First Name *</Label>
                  <Input type="text" value={inviteFirst} onChange={(e) => setInviteFirst(e.target.value)} />
                </div>
                <div>
                  <Label className="mb-1 block">Last Name</Label>
                  <Input type="text" value={inviteLast} onChange={(e) => setInviteLast(e.target.value)} />
                </div>
              </div>
              <div>
                <Label className="mb-1 block">Email *</Label>
                <Input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="staff@dostazas.com" />
              </div>
              <div>
                <Label className="mb-1 block">Password *</Label>
                <Input type="password" value={invitePassword} onChange={(e) => setInvitePassword(e.target.value)} placeholder="Min 6 characters" />
              </div>
              <div>
                <label className="block text-sm font-medium text-expresso/80 mb-1">Role</label>
                <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as "admin" | "staff")} className="w-full px-3 py-2 bg-background border border-warm-roast/10 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-coffee-fruit">
                  <option value="staff">Staff</option>
                  <option value="admin">Admin</option>
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
              Create Account
            </Button>
          </div>
        </div>
      )}

      {/* Staff Table */}
      <div className="bg-card rounded-2xl border border-warm-roast/10 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-warm-roast/10 bg-muted/40">
                <th className="px-6 py-4 text-sm font-semibold text-expresso">Name</th>
                <th className="px-6 py-4 text-sm font-semibold text-expresso">Role</th>
                <th className="px-6 py-4 text-sm font-semibold text-expresso">Joined</th>
                <th className="px-6 py-4 text-sm font-semibold text-expresso text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-warm-roast/10">
              {staff.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center gap-3 text-expresso/40">
                      <Users className="w-10 h-10 opacity-20" />
                      <p className="text-sm">No team members yet.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                staff.map((member) => {
                  const isCurrentUser = member.id === currentUser?.id;
                  return (
                    <tr key={member.id} className="hover:bg-warm-roast/5 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-warm-roast/10 flex items-center justify-center font-bold text-sm text-expresso/70">
                            {(member.first_name?.[0] ?? "?").toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium text-sm text-expresso">
                              {member.first_name} {member.last_name ?? ""}
                              {isCurrentUser && <span className="ml-2 text-xs text-expresso/40">(you)</span>}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                          member.role === "admin"
                            ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
                            : "bg-warm-roast/10 text-expresso/70"
                        }`}>
                          {member.role === "admin" ? <ShieldAlert className="w-3 h-3" /> : <Shield className="w-3 h-3" />}
                          {member.role.charAt(0).toUpperCase() + member.role.slice(1)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-expresso/60">
                        {new Date(member.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleToggleRole(member)}
                            disabled={isCurrentUser || updateRoleMut.isPending}
                            className="px-3 py-1.5 text-xs font-medium border border-warm-roast/15 rounded-lg hover:bg-warm-roast/5 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            {member.role === "admin" ? "Demote" : "Promote"}
                          </button>
                          <button
                            onClick={() => handleRemove(member)}
                            disabled={isCurrentUser || removeMut.isPending}
                            className="p-2 text-expresso/40 hover:text-destructive transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
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
