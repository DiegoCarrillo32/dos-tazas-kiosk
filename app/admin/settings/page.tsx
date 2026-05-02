"use client";

import { useState, useEffect } from "react";
import { Save, Loader2, User, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { useCurrentProfile, useUpdateOwnProfile } from "@/lib/hooks";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";

export default function SettingsPage() {
  const router = useRouter();
  const supabase = createClient();
  const { data: profile, isLoading } = useCurrentProfile();
  const updateProfileMut = useUpdateOwnProfile();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");

  useEffect(() => {
    if (profile) {
      setFirstName(profile.first_name ?? "");
      setLastName(profile.last_name ?? "");
    }
  }, [profile]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setEmail(user.email ?? "");
    });
  }, [supabase.auth]);

  const handleSave = () => {
    updateProfileMut.mutate(
      { first_name: firstName.trim(), last_name: lastName.trim() },
      { onSuccess: () => alert("Profile updated!") }
    );
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-8 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">Settings</h1>
        <p className="text-zinc-500 mt-1">Manage your profile and account</p>
      </div>

      {/* Profile Card */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm p-6 space-y-6">
        <div className="flex items-center gap-4 pb-4 border-b border-zinc-200 dark:border-zinc-800">
          <div className="w-14 h-14 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
            <User className="w-7 h-7 text-zinc-400" />
          </div>
          <div>
            <p className="font-semibold text-zinc-900 dark:text-zinc-100">
              {profile?.first_name} {profile?.last_name}
            </p>
            <p className="text-sm text-zinc-500">{email}</p>
            <span className={`inline-flex items-center mt-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${
              profile?.role === "admin"
                ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
                : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
            }`}>
              {profile?.role === "admin" ? "Admin" : "Staff"}
            </span>
          </div>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="mb-1 block">First Name</Label>
              <Input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
            </div>
            <div>
              <Label className="mb-1 block">Last Name</Label>
              <Input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label className="mb-1 block">Email</Label>
            <Input
              type="email"
              value={email}
              disabled
            />
            <p className="text-xs text-zinc-400 mt-1">Contact an administrator to change your email.</p>
          </div>
        </div>

        <Button
          onClick={handleSave}
          isLoading={updateProfileMut.isPending}
          leftIcon={<Save className="w-4 h-4" />}
        >
          Save Changes
        </Button>
      </div>

      {/* Danger Zone */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-red-200 dark:border-red-900/30 shadow-sm p-6">
        <h3 className="font-semibold text-red-600 dark:text-red-400 mb-2">Sign Out</h3>
        <p className="text-sm text-zinc-500 mb-4">Sign out of your account on this device.</p>
        <Button
          variant="danger"
          onClick={handleLogout}
          leftIcon={<LogOut className="w-4 h-4" />}
        >
          Sign Out
        </Button>
      </div>
    </div>
  );
}
