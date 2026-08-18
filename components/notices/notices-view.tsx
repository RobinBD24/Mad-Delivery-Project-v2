import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/layout/icons";
import { Badge } from "@/components/ui/badge";
import { NoticeComposer } from "@/components/notices/notice-composer";
import { NoticeDeleteButton } from "@/components/notices/notice-delete-button";
import { getJSON } from "@/lib/api/client";
import { getT } from "@/lib/i18n/server";
import type { Notice, Paginated } from "@/types";

/** Super-admin notices board: compose broadcast + list past notices. */
export async function NoticesView({
  canCompose = false,
  canDelete = false,
}: {
  canCompose?: boolean;
  canDelete?: boolean;
} = {}) {
  const { t, fmt } = await getT();
  const data = await getJSON<Paginated<Notice>>("/notices/?page_size=100");

  return (
    <>
      <PageHeader title={t("notices.title")} subtitle={t("notices.subtitle")} />

      <div className="grid gap-6 lg:grid-cols-3">
        {canCompose ? (
          <div className="lg:col-span-1">
            <Card>
              <CardHeader title={t("notices.compose")} subtitle={t("notices.composeSub")} />
              <CardContent>
                <NoticeComposer />
              </CardContent>
            </Card>
          </div>
        ) : null}

        <div className={canCompose ? "lg:col-span-2" : "lg:col-span-3"}>
          <Card>
            <CardHeader title={t("notices.sent")} />
            <CardContent>
              {data.results.length === 0 ? (
                <EmptyState title={t("notices.emptyTitle")} description={t("notices.emptyDesc")} />
              ) : (
                <ul className="divide-y divide-border-base">
                  {data.results.map((n) => (
                    <li key={n.id} className="flex items-start gap-3 py-3.5 first:pt-0 last:pb-0">
                      <span className="mt-0.5 flex size-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                        <Icon name="megaphone" className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-fg-base">{n.title}</p>
                          <Badge tone="brand">
                            {n.audience === "all" ? t("notices.everyone") : t(`roles.${n.audience}`)}
                          </Badge>
                          <Badge tone="slate">
                            {t("notices.reachedN", { count: fmt.num(n.recipients) })}
                          </Badge>
                        </div>
                        {n.body ? <p className="mt-0.5 text-sm text-fg-muted">{n.body}</p> : null}
                        <p className="mt-1 text-xs text-fg-subtle">
                          {n.author_name} · {fmt.dateTime(n.created_at)}
                        </p>
                      </div>
                      {canDelete ? <NoticeDeleteButton noticeId={n.id} /> : null}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
