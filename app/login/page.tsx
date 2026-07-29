"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { Eye, EyeOff } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";
import { useT } from "@/lib/i18n/LanguageContext";

type LoginForm = {
  email: string;
  password: string;
};

export default function LoginPage() {
  const t = useT();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>();

  const onSubmit = async (data: LoginForm) => {
    setLoading(true);
    setError(null);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });

    if (signInError) {
      setError(signInError.message);
      setLoading(false);
    } else {
      router.push("/pos/floor");
      router.refresh();
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 bg-background">
      <div className="w-full max-w-md bg-card rounded-xl shadow-lg border border-warm-roast/10 p-8">
        <h1 className="text-2xl font-bold text-center mb-6 text-expresso">
          {t("login.title")}
        </h1>

        {error && (
          <div className="mb-4 p-3 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 rounded-md text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">{t("login.email")}</Label>
            <Input
              id="email"
              type="email"
              {...register("email", { required: t("login.emailRequired") })}
              error={errors.email?.message}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="password">{t("login.password")}</Label>
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              {...register("password", { required: t("login.passwordRequired") })}
              error={errors.password?.message}
              rightElement={
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? t("login.hidePassword") : t("login.showPassword")}
                  className="flex h-9 w-9 items-center justify-center rounded-md text-expresso/40 hover:text-expresso/70 focus:outline-none focus:ring-2 focus:ring-coffee-fruit/30"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              }
            />
          </div>

          <Button type="submit" isLoading={loading} className="mt-4 w-full">
            {t("login.signIn")}
          </Button>
        </form>
      </div>
    </main>
  );
}
