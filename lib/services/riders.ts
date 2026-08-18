import "server-only";
import type { RiderDutyLog, RiderProfile } from "@prisma/client";

import { prisma } from "@/lib/db";
import { sk, validationError } from "@/lib/http/errors";
import { midnight } from "@/lib/utils/dates";

/** Super Admin assigns (or clears) a rider's home branch. */
export async function assignRiderBranch(input: {
  riderId: number;
  branchId: number | null;
}): Promise<RiderProfile> {
  const { riderId, branchId } = input;
  if (branchId !== null) {
    const branch = await prisma.branch.findFirst({ where: { id: branchId, isActive: true } });
    if (!branch) throw validationError({ branch_id: sk("errors.money.branchNotFoundOrClosed") });
  }
  return prisma.riderProfile.upsert({
    where: { userId: riderId },
    create: { userId: riderId, assignedBranchId: branchId },
    update: { assignedBranchId: branchId },
  });
}

/** Start today's duty. One duty log per rider per day (DB-enforced). */
export async function clockIn(input: {
  riderId: number;
  branchId?: number | null;
}): Promise<RiderDutyLog> {
  const { riderId } = input;
  let branchId = input.branchId ?? null;

  if (branchId === null) {
    const profile = await prisma.riderProfile.findUnique({
      where: { userId: riderId },
      include: { assignedBranch: true },
    });
    const branch = profile?.assignedBranch;
    if (!branch || !branch.isActive) {
      throw validationError({ branch_id: sk("errors.money.selectBranchNoneAssigned") });
    }
    branchId = branch.id;
  } else {
    const branch = await prisma.branch.findFirst({ where: { id: branchId, isActive: true } });
    if (!branch) throw validationError({ branch_id: sk("errors.money.branchNotFoundOrClosed") });
  }

  const existing = await prisma.riderDutyLog.findUnique({
    where: { riderId_date: { riderId, date: midnight() } },
  });
  if (existing) {
    throw validationError({ detail: sk("errors.money.dutyAlreadyStarted") });
  }

  return prisma.riderDutyLog.create({
    data: { riderId, branchId, date: midnight(), clockIn: new Date() },
  });
}

/** End today's duty. Requires an open clock-in. */
export async function clockOut(riderId: number): Promise<RiderDutyLog> {
  const log = await prisma.riderDutyLog.findUnique({
    where: { riderId_date: { riderId, date: midnight() } },
  });
  if (!log) {
    throw validationError({ detail: sk("errors.money.noDutyLogToday") });
  }
  if (log.clockOut) {
    throw validationError({ detail: sk("errors.money.dutyAlreadyEnded") });
  }
  return prisma.riderDutyLog.update({ where: { id: log.id }, data: { clockOut: new Date() } });
}
