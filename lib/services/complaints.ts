import "server-only";
import type { Prisma, User } from "@prisma/client";

import { prisma } from "@/lib/db";
import { forbidden, notFound, sk, validationError } from "@/lib/http/errors";
import {
  COMPLAINT_CATEGORIES,
  COMPLAINT_RECIPIENTS,
  COMPLAINT_STATUSES,
} from "@/lib/constants/enums";
import { branchForManager } from "@/lib/selectors";
import { createNotification, notifyUsers } from "@/lib/services/notifications";
import type { Role } from "@/types";

export const COMPLAINT_INCLUDE = {
  complainant: true,
  branch: true,
  assignedTo: true,
  _count: { select: { messages: true } },
} satisfies Prisma.ComplaintInclude;

export const COMPLAINT_DETAIL_INCLUDE = {
  complainant: true,
  branch: true,
  assignedTo: true,
  messages: { include: { sender: true }, orderBy: { createdAt: "asc" } },
  _count: { select: { messages: true } },
} satisfies Prisma.ComplaintInclude;

/** Which complaints a user may list/read. */
export async function complaintsWhereForUser(user: User): Promise<Prisma.ComplaintWhereInput> {
  switch (user.role) {
    case "super_admin":
      return {}; // sees everything
    case "management":
    case "marketing":
      // Oversight roles (roles spec / features note 12): in addition to
      // complaints addressed to them, management & marketing can see all
      // customer- and branch-manager-filed complaints.
      return {
        OR: [
          { recipientRole: user.role },
          { complainantId: user.id },
          { complainant: { role: { in: ["customer", "branch_manager"] } } },
        ],
      };
    case "accounts":
      return { OR: [{ recipientRole: user.role }, { complainantId: user.id }] };
    case "branch_manager": {
      const branch = await branchForManager(user.id);
      return {
        OR: [
          { recipientRole: "branch_manager", branchId: branch?.id ?? -1 },
          { complainantId: user.id },
        ],
      };
    }
    default: // rider, customer — only their own
      return { complainantId: user.id };
  }
}

/** True if a user is allowed to change status / reply as the recipient side. */
export async function isComplaintHandler(
  user: User,
  complaint: { recipientRole: string; branchId: number | null },
): Promise<boolean> {
  if (user.role === "super_admin") return true;
  if (user.role !== complaint.recipientRole) return false;
  if (user.role === "branch_manager") {
    const branch = await branchForManager(user.id);
    return branch?.id === complaint.branchId;
  }
  return true;
}

export async function createComplaint(input: {
  complainantId: number;
  recipientRole: string;
  branchId?: number | null;
  orderId?: number | null;
  category: string;
  subject: string;
  message: string;
}) {
  if (!COMPLAINT_RECIPIENTS.includes(input.recipientRole as Role)) {
    throw validationError({ recipient_role: sk("errors.ops.recipientInvalid") });
  }
  if (!COMPLAINT_CATEGORIES.includes(input.category as (typeof COMPLAINT_CATEGORIES)[number])) {
    throw validationError({ category: sk("errors.ops.categoryInvalid") });
  }
  if (!input.subject.trim()) throw validationError({ subject: sk("errors.ops.subjectRequired") });
  if (!input.message.trim()) throw validationError({ message: sk("errors.ops.complaintMessageRequired") });

  // A branch_manager complaint must resolve to a branch. Prefer the given
  // branch (from an order), else the complainant's own branch if they are staff.
  let branchId = input.branchId ?? null;
  if (input.recipientRole === "branch_manager" && !branchId) {
    const mgrBranch = await branchForManager(input.complainantId);
    branchId = mgrBranch?.id ?? null;
  }

  const complaint = await prisma.complaint.create({
    data: {
      complainantId: input.complainantId,
      recipientRole: input.recipientRole,
      branchId,
      orderId: input.orderId ?? null,
      category: input.category,
      subject: input.subject.trim(),
      message: input.message.trim(),
    },
    include: COMPLAINT_INCLUDE,
  });

  // Notify the recipient side + Super Admin (who oversees all complaints).
  const handlers = await recipientUserIds(input.recipientRole, branchId);
  await notifyUsers(handlers, {
    type: "complaint",
    titleKey: "notifications.complaint.new.title",
    body: complaint.subject, // user-written subject — kept as typed
    link: complaintLink(complaint.id),
  });
  return complaint;
}

/** Users who should act on a complaint of this recipientRole. */
async function recipientUserIds(recipientRole: string, branchId: number | null): Promise<number[]> {
  const where: Prisma.UserWhereInput = { role: recipientRole, status: "approved", isActive: true };
  if (recipientRole === "branch_manager" && branchId) {
    where.managedBranches = { some: { id: branchId } };
  }
  const recipients = await prisma.user.findMany({ where, select: { id: true } });
  const superAdmins = await prisma.user.findMany({
    where: { role: "super_admin", isActive: true },
    select: { id: true },
  });
  return [...recipients.map((u) => u.id), ...superAdmins.map((u) => u.id)];
}

/** Every role opens complaint detail through the canonical shared route. */
function complaintLink(id: number): string {
  return `/complaints/${id}`;
}

export async function addComplaintMessage(complaintId: number, sender: User, body: string) {
  if (!body.trim()) throw validationError({ body: sk("errors.ops.messageRequired") });
  const complaint = await prisma.complaint.findUnique({ where: { id: complaintId } });
  if (!complaint) throw notFound();

  const isComplainant = complaint.complainantId === sender.id;
  const isHandler = await isComplaintHandler(sender, complaint);
  if (!isComplainant && !isHandler) throw forbidden();

  const msg = await prisma.complaintMessage.create({
    data: { complaintId, senderId: sender.id, body: body.trim() },
    include: { sender: true },
  });
  await prisma.complaint.update({ where: { id: complaintId }, data: { updatedAt: new Date() } });

  // Notify the other party.
  if (isComplainant) {
    const handlers = await recipientUserIds(complaint.recipientRole, complaint.branchId);
    await notifyUsers(handlers, {
      type: "complaint",
      titleKey: "notifications.complaint.newMessage.title",
      body: complaint.subject, // user-written subject — kept as typed
      link: complaintLink(complaint.id),
    });
  } else {
    await createNotification(complaint.complainantId, {
      type: "complaint",
      titleKey: "notifications.complaint.reply.title",
      body: complaint.subject, // user-written subject — kept as typed
      link: `/complaints/${complaint.id}`,
    });
  }
  return msg;
}

export async function changeComplaintStatus(complaintId: number, status: string, actor: User) {
  if (!COMPLAINT_STATUSES.includes(status as (typeof COMPLAINT_STATUSES)[number])) {
    throw validationError({ status: sk("errors.ops.statusInvalid") });
  }
  const complaint = await prisma.complaint.findUnique({ where: { id: complaintId } });
  if (!complaint) throw notFound();
  if (!(await isComplaintHandler(actor, complaint))) throw forbidden();

  const updated = await prisma.complaint.update({
    where: { id: complaintId },
    data: {
      status,
      assignedToId: complaint.assignedToId ?? actor.id,
    },
    include: COMPLAINT_INCLUDE,
  });
  await createNotification(complaint.complainantId, {
    type: "complaint",
    titleKey: "notifications.complaint.statusChanged.title",
    body: complaint.subject, // user-written subject — kept as typed
    link: `/complaints/${complaint.id}`,
  });
  return updated;
}
