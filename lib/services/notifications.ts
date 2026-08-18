import "server-only";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import type { NoticeAudience, NotificationType } from "@/lib/constants/enums";
import type { Role } from "@/types";

/**
 * A notification is either system-generated (set titleKey/bodyKey/params — they
 * are translated to the viewer's locale at render time) or carries raw
 * user-written content (set title/body directly, e.g. a complaint subject).
 * A mix is allowed: titleKey for the label + raw body for user text.
 * Param string values prefixed "@:" are themselves i18n keys (e.g. an enum
 * label such as "@:orderStatus.preparing") and get translated at render time.
 */
interface NotifyInput {
  type?: NotificationType;
  title?: string;
  body?: string;
  titleKey?: string;
  bodyKey?: string;
  params?: Record<string, string | number> | null;
  link?: string | null;
  noticeId?: number | null;
}

// Only these categories honour the user's notification toggle. Everything else
// is transactional/security and is ALWAYS delivered — a disabled toggle must
// never drop an order, payment, withdrawal, complaint or account notice.
const OPTIONAL_TYPES = new Set<NotificationType>(["marketing"]);

function isOptional(type: NotificationType | undefined): boolean {
  return OPTIONAL_TYPES.has(type ?? "system");
}

function notificationData(userId: number, input: NotifyInput) {
  return {
    userId,
    type: input.type ?? "system",
    title: input.title ?? "",
    body: input.body ?? "",
    titleKey: input.titleKey ?? null,
    bodyKey: input.bodyKey ?? null,
    params: (input.params ?? undefined) as Prisma.InputJsonValue | undefined,
    link: input.link ?? null,
    noticeId: input.noticeId ?? null,
  };
}

/**
 * Create a single in-app notification for one user. Transactional/security
 * notifications are always delivered; only OPTIONAL (marketing) categories
 * honour the recipient's notification toggle.
 */
export async function createNotification(userId: number, input: NotifyInput) {
  if (isOptional(input.type)) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { notificationsEnabled: true },
    });
    if (!user?.notificationsEnabled) return null;
  }
  return prisma.notification.create({ data: notificationData(userId, input) });
}

/**
 * Fan a notification out to an explicit list of users (deduped). Transactional
 * notifications reach everyone; OPTIONAL (marketing) ones skip users who
 * disabled their toggle.
 */
export async function notifyUsers(userIds: number[], input: NotifyInput): Promise<number> {
  let ids = [...new Set(userIds)];
  if (ids.length === 0) return 0;
  if (isOptional(input.type)) {
    const enabled = await prisma.user.findMany({
      where: { id: { in: ids }, notificationsEnabled: true },
      select: { id: true },
    });
    ids = enabled.map((u) => u.id);
  }
  if (ids.length === 0) return 0;
  await prisma.notification.createMany({
    data: ids.map((userId) => notificationData(userId, input)),
  });
  return ids.length;
}

// ── Standard recipient API ──────────────────────────────────────────────────
// One consistent surface every module should use instead of hand-rolling
// recipient queries. All are thin, toggle-aware wrappers over the primitives
// above, so system-wide notification behaviour stays in one place.

/** Notify one specific user. */
export function notifyUser(userId: number, input: NotifyInput) {
  return createNotification(userId, input);
}

/** Notify every approved+active user of a role (optionally scoped to a branch). */
export async function notifyRole(role: Role, input: NotifyInput, branchId?: number): Promise<number> {
  return notifyUsers(await audienceUserIds(role, branchId), input);
}

export const notifySuperAdmins = (input: NotifyInput) => notifyRole("super_admin", input);

/** Notify the branch's managers (users who manage that branch). */
export async function notifyBranchManagers(branchId: number, input: NotifyInput): Promise<number> {
  const managers = await prisma.user.findMany({
    where: { status: "approved", isActive: true, managedBranches: { some: { id: branchId } } },
    select: { id: true },
  });
  return notifyUsers(managers.map((u) => u.id), input);
}

/** Notify everyone tied to a branch — its managers plus its assigned riders. */
export async function notifyBranch(branchId: number, input: NotifyInput): Promise<number> {
  const users = await prisma.user.findMany({
    where: {
      status: "approved",
      isActive: true,
      OR: [
        { managedBranches: { some: { id: branchId } } },
        { riderProfile: { assignedBranchId: branchId } },
      ],
    },
    select: { id: true },
  });
  return notifyUsers(users.map((u) => u.id), input);
}

/** Approved + active user ids for a role (or every role when audience = "all"). */
async function audienceUserIds(
  audience: NoticeAudience | Role | "all",
  branchId?: number,
): Promise<number[]> {
  const where: Prisma.UserWhereInput = { status: "approved", isActive: true };
  if (audience !== "all") where.role = audience;
  // Scope branch_manager / rider notices to a branch when provided.
  if (branchId && (audience === "branch_manager" || audience === "rider")) {
    where.OR = [
      { managedBranches: { some: { id: branchId } } },
      { riderProfile: { assignedBranchId: branchId } },
    ];
  }
  const users = await prisma.user.findMany({ where, select: { id: true } });
  return users.map((u) => u.id);
}

/** Publish a broadcast notice and fan it out to its audience. */
export async function publishNotice(input: {
  authorId: number;
  title: string;
  body: string;
  audience: NoticeAudience;
  type?: "notice" | "marketing";
}) {
  const notice = await prisma.notice.create({
    data: {
      authorId: input.authorId,
      title: input.title,
      body: input.body,
      audience: input.audience,
      type: input.type ?? "notice",
    },
  });
  const ids = await audienceUserIds(input.audience);
  const count = await notifyUsers(ids, {
    type: input.type === "marketing" ? "marketing" : "notice",
    title: input.title,
    body: input.body,
    link: null,
    noticeId: notice.id,
  });
  return prisma.notice.update({ where: { id: notice.id }, data: { recipients: count } });
}

/** Unread notification count for a user's bell. */
export function unreadCount(userId: number) {
  return prisma.notification.count({ where: { userId, isRead: false } });
}
