import type { Metadata } from "next";
import Link from "next/link";

import { RegisterPageShell } from "@/components/auth/register-page-shell";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("auth.customerRegTitle") };
}

/**
 * /register — PUBLIC customer registration only. Staff/admin accounts are
 * created by a super admin from the dashboard, never from public registration.
 */
export default async function RegisterPage() {
  const { t } = await getT();
  return (
    <RegisterPageShell
      title={t("auth.customerRegTitle")}
      subtitle={t("auth.customerRegSubtitle")}
      rolePath="customer"
      footer={
        <>
          {t("auth.haveAccountQ")}{" "}
          <Link href="/login" className="font-semibold text-brand-600 hover:underline">
            {t("auth.loginNow")}
          </Link>
        </>
      }
    />
  );
}
