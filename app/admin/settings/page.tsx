"use client";

import { useState, useEffect } from "react";
import { Save, Loader2, User, LogOut, Store } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import {
  useCurrentProfile,
  useUpdateOwnProfile,
  useLocationSettings,
  useUpdateLocationSettings,
} from "@/lib/hooks";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";
import { Checkbox } from "@/components/ui/Checkbox";
import type { UserProfile, LocationSettings } from "@/lib/types";

function SettingsForm({
  profile,
  initialEmail,
  onLogout,
}: {
  profile: UserProfile;
  initialEmail: string;
  onLogout: () => void;
}) {
  const updateProfileMut = useUpdateOwnProfile();
  const { data: bizSettings, isLoading: settingsLoading } = useLocationSettings();
  const [firstName, setFirstName] = useState(profile.first_name ?? "");
  const [lastName, setLastName] = useState(profile.last_name ?? "");

  const handleSave = () => {
    updateProfileMut.mutate(
      { first_name: firstName.trim(), last_name: lastName.trim() },
      { onSuccess: () => alert("Profile updated!") }
    );
  };

  return (
    <div className="p-6 lg:p-8 space-y-8 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-expresso">Settings</h1>
        <p className="text-expresso/60 mt-1">Manage your profile and account</p>
      </div>

      {/* Profile Card */}
      <div className="bg-card rounded-2xl border border-warm-roast/10 shadow-sm p-6 space-y-6">
        <div className="flex items-center gap-4 pb-4 border-b border-warm-roast/10">
          <div className="w-14 h-14 rounded-full bg-warm-roast/10 flex items-center justify-center">
            <User className="w-7 h-7 text-expresso/40" />
          </div>
          <div>
            <p className="font-semibold text-expresso">
              {firstName} {lastName}
            </p>
            <p className="text-sm text-expresso/60">{initialEmail}</p>
            <span className={`inline-flex items-center mt-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${
              profile.role === "admin"
                ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
                : "bg-warm-roast/10 text-expresso/70"
            }`}>
              {profile.role === "admin" ? "Admin" : "Staff"}
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
              value={initialEmail}
              disabled
            />
            <p className="text-xs text-expresso/40 mt-1">Contact an administrator to change your email.</p>
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

      {/* Business & Tax (admins only) */}
      {profile.role === "admin" && !settingsLoading && (
        <BusinessSettingsForm settings={bizSettings ?? null} />
      )}

      {/* Danger Zone */}
      <div className="bg-card rounded-2xl border border-red-200 dark:border-red-900/30 shadow-sm p-6">
        <h3 className="font-semibold text-red-600 dark:text-red-400 mb-2">Sign Out</h3>
        <p className="text-sm text-expresso/60 mb-4">Sign out of your account on this device.</p>
        <Button
          variant="danger"
          onClick={onLogout}
          leftIcon={<LogOut className="w-4 h-4" />}
        >
          Sign Out
        </Button>
      </div>
    </div>
  );
}

function BusinessSettingsForm({ settings }: { settings: LocationSettings | null }) {
  const updateMut = useUpdateLocationSettings();
  const [legalName, setLegalName] = useState(settings?.business_legal_name ?? "");
  const [taxId, setTaxId] = useState(settings?.tax_id ?? "");
  const [address, setAddress] = useState(settings?.address ?? "");
  const [phone, setPhone] = useState(settings?.phone ?? "");
  const [currency, setCurrency] = useState(settings?.currency ?? "CRC");
  const [taxRatePct, setTaxRatePct] = useState(
    String(((settings?.tax_rate ?? 0.13) * 100).toFixed(2)).replace(/\.00$/, "")
  );
  const [pricesIncludeTax, setPricesIncludeTax] = useState(
    settings?.prices_include_tax ?? true
  );
  const [tipEnabled, setTipEnabled] = useState(settings?.tip_enabled ?? false);
  const [receiptFooter, setReceiptFooter] = useState(settings?.receipt_footer ?? "");

  const handleSave = () => {
    const rate = Math.max(0, parseFloat(taxRatePct) || 0) / 100;
    updateMut.mutate(
      {
        business_legal_name: legalName.trim() || null,
        tax_id: taxId.trim() || null,
        address: address.trim() || null,
        phone: phone.trim() || null,
        currency: currency.trim() || "CRC",
        tax_rate: rate,
        prices_include_tax: pricesIncludeTax,
        tip_enabled: tipEnabled,
        receipt_footer: receiptFooter.trim() || null,
      },
      { onSuccess: () => alert("Business settings saved!") }
    );
  };

  return (
    <div className="bg-card rounded-2xl border border-warm-roast/10 shadow-sm p-6 space-y-6">
      <div className="flex items-center gap-3 pb-4 border-b border-warm-roast/10">
        <div className="w-12 h-12 rounded-full bg-warm-roast/10 flex items-center justify-center">
          <Store className="w-6 h-6 text-expresso/40" />
        </div>
        <div>
          <h2 className="font-semibold text-expresso">Business &amp; Tax</h2>
          <p className="text-sm text-expresso/60">
            Fiscal details and how prices and tax are handled at checkout
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <Label className="mb-1 block">Legal Business Name</Label>
          <Input type="text" value={legalName} onChange={(e) => setLegalName(e.target.value)} placeholder="Dos Tazas S.A." />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="mb-1 block">Tax ID (Cédula Jurídica)</Label>
            <Input type="text" value={taxId} onChange={(e) => setTaxId(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1 block">Phone</Label>
            <Input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
        </div>
        <div>
          <Label className="mb-1 block">Address</Label>
          <Input type="text" value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="mb-1 block">IVA Rate (%)</Label>
            <Input type="number" inputMode="decimal" min={0} value={taxRatePct} onChange={(e) => setTaxRatePct(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1 block">Currency</Label>
            <Input type="text" value={currency} onChange={(e) => setCurrency(e.target.value)} placeholder="CRC" />
          </div>
        </div>

        <label className="flex items-start gap-3 cursor-pointer pt-1">
          <Checkbox checked={pricesIncludeTax} onChange={(e) => setPricesIncludeTax(e.target.checked)} />
          <span className="text-sm text-expresso/80">
            <span className="font-medium text-expresso">Menu prices include IVA</span>
            <br />
            The price shown on the menu is what the customer pays; tax is broken out on the receipt.
          </span>
        </label>

        <label className="flex items-start gap-3 cursor-pointer">
          <Checkbox checked={tipEnabled} onChange={(e) => setTipEnabled(e.target.checked)} />
          <span className="text-sm text-expresso/80">
            <span className="font-medium text-expresso">Enable tips at checkout</span>
            <br />
            Show tip options on the Counter when taking payment.
          </span>
        </label>

        <div>
          <Label className="mb-1 block">Receipt Footer</Label>
          <Input type="text" value={receiptFooter} onChange={(e) => setReceiptFooter(e.target.value)} placeholder="¡Gracias por su visita!" />
        </div>
      </div>

      <Button onClick={handleSave} isLoading={updateMut.isPending} leftIcon={<Save className="w-4 h-4" />}>
        Save Business Settings
      </Button>
    </div>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const supabase = createClient();
  const { data: profile, isLoading } = useCurrentProfile();
  const [email, setEmail] = useState("");
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setEmail(user.email ?? "");
      }
      setAuthLoading(false);
    });
  }, [supabase.auth]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  if (isLoading || authLoading || !profile) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-expresso/40" />
      </div>
    );
  }

  return (
    <SettingsForm
      profile={profile}
      initialEmail={email}
      onLogout={handleLogout}
    />
  );
}
