"use client";

import type { ReactNode } from "react";

import { useTranslation } from "@/lib/i18n/use-translation";
import { cn } from "@/lib/utils";
import type { OrderStatus, Role, UserStatus } from "@/types";

type Tone =
  | "slate"
  | "green"
  | "amber"
  | "red"
  | "blue"
  | "violet"
  | "cyan"
  | "teal"
  | "brand";

const TONES: Record<Tone, string> = {
  slate: "bg-surface-muted text-fg-base ring-1 ring-border-base",
  green: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/25",
  amber: "bg-amber-50 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/25",
  red: "bg-red-50 text-red-700 ring-1 ring-red-200 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/25",
  blue: "bg-blue-50 text-blue-700 ring-1 ring-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-500/25",
  violet: "bg-violet-50 text-violet-700 ring-1 ring-violet-200 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-500/25",
  cyan: "bg-cyan-50 text-cyan-700 ring-1 ring-cyan-200 dark:bg-cyan-500/10 dark:text-cyan-300 dark:ring-cyan-500/25",
  teal: "bg-teal-50 text-teal-700 ring-1 ring-teal-200 dark:bg-teal-500/10 dark:text-teal-300 dark:ring-teal-500/25",
  brand: "bg-brand-50 text-brand-700 ring-1 ring-brand-200 dark:bg-brand-500/10 dark:text-brand-300 dark:ring-brand-500/25",
};

/** Leading dot from the mockup's .status-pill .d, tinted by the pill's tone. */
const DOTS: Record<Tone, string> = {
  slate: "bg-fg-subtle",
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
  blue: "bg-blue-500",
  violet: "bg-violet-500",
  cyan: "bg-cyan-500",
  teal: "bg-teal-500",
  brand: "bg-brand-500",
};

export function Badge({
  tone = "slate",
  className,
  /** The mockup's status pills carry a leading dot; plain labels don't. */
  dot = false,
  children,
}: {
  tone?: Tone;
  className?: string;
  dot?: boolean;
  children: ReactNode;
}) {
  return (
    // .status-pill — 4px 10px, pill radius, 11.5px semibold
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11.5px] font-semibold",
        TONES[tone],
        className,
      )}
    >
      {dot ? <span className={cn("size-1.5 shrink-0 rounded-full", DOTS[tone])} /> : null}
      {children}
    </span>
  );
}

const USER_STATUS_TONES: Record<UserStatus, Tone> = {
  pending: "amber",
  approved: "green",
  rejected: "red",
};

export function UserStatusBadge({ status }: { status: UserStatus }) {
  const { t } = useTranslation();
  return <Badge dot tone={USER_STATUS_TONES[status]}>{t(`userStatus.${status}`)}</Badge>;
}

export function UserAccountStatusBadge({
  status,
  isBlocked,
}: {
  status: UserStatus;
  isBlocked: boolean;
}) {
  const { t } = useTranslation();
  return isBlocked ? (
    <Badge dot tone="red">
      {t("users.statusBlocked")}
    </Badge>
  ) : (
    <UserStatusBadge status={status} />
  );
}

const ORDER_STATUS_TONES: Record<OrderStatus, Tone> = {
  pending: "amber",
  accepted: "blue",
  preparing: "violet",
  ready: "cyan",
  picked_up: "blue",
  on_the_way: "brand",
  delivered: "green",
  cancelled: "red",
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const { t } = useTranslation();
  return <Badge dot tone={ORDER_STATUS_TONES[status]}>{t(`orderStatus.${status}`)}</Badge>;
}

const ROLE_TONES: Record<Role, Tone> = {
  super_admin: "violet",
  management: "cyan",
  marketing: "amber",
  branch_manager: "green",
  accounts: "blue",
  rider: "slate",
  customer: "teal",
};

export function RoleBadge({ role }: { role: Role }) {
  const { t } = useTranslation();
  return <Badge tone={ROLE_TONES[role]}>{t(`roles.${role}`)}</Badge>;
}
