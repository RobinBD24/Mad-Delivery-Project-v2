import type { Metadata } from "next";

import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("auth.forgotTitle") };
}

export default async function ForgotPasswordPage() {
  const { t } = await getT();

  return (
    <div className="rounded-3xl bg-white p-8 shadow-2xl sm:p-10">
      <h1 className="text-2xl font-bold text-slate-800">{t("auth.forgotTitle")}</h1>
      <p className="mt-1 text-sm text-slate-500">{t("auth.forgotSubtitle")}</p>
      <div className="mt-6">
        <ForgotPasswordForm />
      </div>
    </div>
  );
}
