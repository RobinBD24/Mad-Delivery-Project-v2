import type { ReactNode } from "react";

import { Icon } from "@/components/layout/icons";

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-surface-muted text-fg-subtle">
        <Icon name="inbox" className="size-6" />
      </div>
      <h3 className="mt-2 font-heading text-base font-bold text-fg-base">{title}</h3>
      {description ? <p className="max-w-sm text-sm text-fg-muted">{description}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
