import "server-only";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { haversineKm } from "@/lib/services/geo";

/** Set a rider online/offline. Going offline stops location updates. */
export async function setRiderOnline(riderId: number, online: boolean) {
  return prisma.riderProfile.update({
    where: { userId: riderId },
    data: { isOnline: online, lastPingAt: online ? new Date() : undefined },
  });
}

/**
 * Record a live location ping while online: updates the current position and
 * appends a route point (skipping near-duplicate points < ~10m to limit noise).
 */
export async function pushRiderLocation(
  riderId: number,
  lat: number,
  lng: number,
  accuracy?: number | null,
  orderId?: number | null,
) {
  const profile = await prisma.riderProfile.findUnique({ where: { userId: riderId } });
  const last = await prisma.riderRoutePoint.findFirst({
    where: { riderId },
    orderBy: { recordedAt: "desc" },
  });

  const movedEnough =
    !last || haversineKm({ lat: Number(last.lat), lng: Number(last.lng) }, { lat, lng }) > 0.01;

  await prisma.riderProfile.update({
    where: { userId: riderId },
    data: {
      currentLat: new Prisma.Decimal(lat.toFixed(7)),
      currentLng: new Prisma.Decimal(lng.toFixed(7)),
      currentAccuracy: accuracy != null && Number.isFinite(accuracy) ? new Prisma.Decimal(Number(accuracy).toFixed(2)) : null,
      lastPingAt: new Date(),
      isOnline: true,
    },
  });

  if (movedEnough) {
    await prisma.riderRoutePoint.create({
      data: {
        riderId,
        lat: new Prisma.Decimal(lat.toFixed(7)),
        lng: new Prisma.Decimal(lng.toFixed(7)),
        orderId: orderId ?? null,
      },
    });
  }
  return profile;
}

/** Total travelled distance (km) over a rider's route points since `since`. */
export async function riderTravelDistanceKm(riderId: number, since?: Date): Promise<number> {
  const points = await prisma.riderRoutePoint.findMany({
    where: { riderId, ...(since ? { recordedAt: { gte: since } } : {}) },
    orderBy: { recordedAt: "asc" },
    select: { lat: true, lng: true },
  });
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += haversineKm(
      { lat: Number(points[i - 1].lat), lng: Number(points[i - 1].lng) },
      { lat: Number(points[i].lat), lng: Number(points[i].lng) },
    );
  }
  return Math.round(total * 100) / 100;
}
