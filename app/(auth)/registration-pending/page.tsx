import type { Metadata } from "next";

import { ButtonLink } from "@/components/ui/button";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("auth.pendingTitle") };
}

export default async function RegistrationPendingPage() {
  const { t } = await getT();
  return (
    <div className="rounded-3xl bg-white p-10 text-center shadow-2xl">
      <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-amber-50 text-3xl">
        ⏳
      </div>
      <h1 className="mt-4 text-2xl font-bold text-slate-800">{t("auth.pendingTitle")}</h1>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-500">
        {t("auth.pendingText")}
      </p>
      <div className="mt-6">
        <ButtonLink href="/login" variant="outline">
          {t("auth.backToLogin")}
        </ButtonLink>
      </div>
    </div>
  );
}
