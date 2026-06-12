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
import { useT } from "@/lib/i18n/LanguageContext";

function SettingsForm({
  profile,
  initialEmail,
  onLogout,
}: {
  profile: UserProfile;
  initialEmail: string;
  onLogout: () => void;
}) {
  const t = useT();
  const updateProfileMut = useUpdateOwnProfile();
  const { data: bizSettings, isLoading: settingsLoading } = useLocationSettings();
  const [firstName, setFirstName] = useState(profile.first_name ?? "");
  const [lastName, setLastName] = useState(profile.last_name ?? "");

  const handleSave = () => {
    updateProfileMut.mutate(
      { first_name: firstName.trim(), last_name: lastName.trim() },
      { onSuccess: () => alert(t("settings.profileUpdated")) }
    );
  };

  return (
    <div className="p-6 lg:p-8 space-y-8 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-expresso">{t("settings.title")}</h1>
        <p className="text-expresso/60 mt-1">{t("settings.subtitle")}</p>
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
              {profile.role === "admin" ? t("settings.roleAdmin") : t("settings.roleStaff")}
            </span>
          </div>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="mb-1 block">{t("settings.firstName")}</Label>
              <Input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
            </div>
            <div>
              <Label className="mb-1 block">{t("settings.lastName")}</Label>
              <Input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label className="mb-1 block">{t("settings.email")}</Label>
            <Input
              type="email"
              value={initialEmail}
              disabled
            />
            <p className="text-xs text-expresso/40 mt-1">{t("settings.emailNote")}</p>
          </div>
        </div>

        <Button
          onClick={handleSave}
          isLoading={updateProfileMut.isPending}
          leftIcon={<Save className="w-4 h-4" />}
        >
          {t("settings.saveChanges")}
        </Button>
      </div>

      {/* Business & Tax (admins only) */}
      {profile.role === "admin" && !settingsLoading && (
        <BusinessSettingsForm settings={bizSettings ?? null} />
      )}

      {/* Danger Zone */}
      <div className="bg-card rounded-2xl border border-red-200 dark:border-red-900/30 shadow-sm p-6">
        <h3 className="font-semibold text-red-600 dark:text-red-400 mb-2">{t("settings.signOut")}</h3>
        <p className="text-sm text-expresso/60 mb-4">{t("settings.signOutDesc")}</p>
        <Button
          variant="danger"
          onClick={onLogout}
          leftIcon={<LogOut className="w-4 h-4" />}
        >
          {t("settings.signOut")}
        </Button>
      </div>
    </div>
  );
}

function BusinessSettingsForm({ settings }: { settings: LocationSettings | null }) {
  const t = useT();
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
      { onSuccess: () => alert(t("settings.businessSaved")) }
    );
  };

  return (
    <div className="bg-card rounded-2xl border border-warm-roast/10 shadow-sm p-6 space-y-6">
      <div className="flex items-center gap-3 pb-4 border-b border-warm-roast/10">
        <div className="w-12 h-12 rounded-full bg-warm-roast/10 flex items-center justify-center">
          <Store className="w-6 h-6 text-expresso/40" />
        </div>
        <div>
          <h2 className="font-semibold text-expresso">{t("settings.businessTitle")}</h2>
          <p className="text-sm text-expresso/60">{t("settings.businessSubtitle")}</p>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <Label className="mb-1 block">{t("settings.legalName")}</Label>
          <Input type="text" value={legalName} onChange={(e) => setLegalName(e.target.value)} placeholder="Dos Tazas S.A." />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="mb-1 block">{t("settings.taxId")}</Label>
            <Input type="text" value={taxId} onChange={(e) => setTaxId(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1 block">{t("settings.phone")}</Label>
            <Input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
        </div>
        <div>
          <Label className="mb-1 block">{t("settings.address")}</Label>
          <Input type="text" value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="mb-1 block">{t("settings.ivaRate")}</Label>
            <Input type="number" inputMode="decimal" min={0} value={taxRatePct} onChange={(e) => setTaxRatePct(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1 block">{t("settings.currency")}</Label>
            <Input type="text" value={currency} onChange={(e) => setCurrency(e.target.value)} placeholder="CRC" />
          </div>
        </div>

        <label className="flex items-start gap-3 cursor-pointer pt-1">
          <Checkbox checked={pricesIncludeTax} onChange={(e) => setPricesIncludeTax(e.target.checked)} />
          <span className="text-sm text-expresso/80">
            <span className="font-medium text-expresso">{t("settings.pricesIncludeTax")}</span>
            <br />
            {t("settings.pricesIncludeTaxDesc")}
          </span>
        </label>

        <label className="flex items-start gap-3 cursor-pointer">
          <Checkbox checked={tipEnabled} onChange={(e) => setTipEnabled(e.target.checked)} />
          <span className="text-sm text-expresso/80">
            <span className="font-medium text-expresso">{t("settings.enableTips")}</span>
            <br />
            {t("settings.enableTipsDesc")}
          </span>
        </label>

        <div>
          <Label className="mb-1 block">{t("settings.receiptFooter")}</Label>
          <Input type="text" value={receiptFooter} onChange={(e) => setReceiptFooter(e.target.value)} placeholder="¡Gracias por su visita!" />
        </div>
      </div>

      <Button onClick={handleSave} isLoading={updateMut.isPending} leftIcon={<Save className="w-4 h-4" />}>
        {t("settings.saveBusinessSettings")}
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
