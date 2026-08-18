import { ButtonLink } from "@/components/ui/button";
import { getT } from "@/lib/i18n/server";

export default async function NotFound() {
  const { t, fmt } = await getT();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-7xl font-extrabold text-brand-500">{fmt.num(404)}</p>
      <h1 className="text-xl font-semibold text-fg-base">{t("notFound.title")}</h1>
      <p className="max-w-sm text-sm text-fg-muted">{t("notFound.desc")}</p>
      <ButtonLink href="/">{t("notFound.backHome")}</ButtonLink>
    </div>
  );
}
