import type {
  CommissionRow,
  CourierStatus,
  DeliveryEntry,
  PayrollSummary,
} from "@cash-buddy/shared";
import { prisma } from "../lib/prisma";
import { courierStatusForDay, deliveriesForDay } from "./calc";
import { toDayData } from "./mappers";

async function loadDay(date: string) {
  const day = await prisma.day.findUnique({
    where: { date },
    include: { movements: { orderBy: { createdAt: "asc" } } },
  });
  return day ? toDayData(day) : null;
}

export async function courierStatusesForDay(date: string): Promise<CourierStatus[]> {
  const day = await loadDay(date);
  const workers = await prisma.worker.findMany({ where: { role: "domiciliario" } });
  if (!day) {
    return workers.map((w) => courierStatusForDay({ movements: [] }, w.id));
  }
  return workers.map((w) => courierStatusForDay(day, w.id));
}

export async function courierStatusForWorker(
  date: string,
  workerId: string,
): Promise<CourierStatus> {
  const day = await loadDay(date);
  return courierStatusForDay(day ?? { movements: [] }, workerId);
}

export async function courierDeliveries(date: string, workerId: string): Promise<DeliveryEntry[]> {
  const day = await loadDay(date);
  if (!day) return [];
  return deliveriesForDay(day, workerId);
}

export async function commissionsForWorker(
  workerId: string,
  monthPrefix?: string,
): Promise<CommissionRow[]> {
  const movements = await prisma.movement.findMany({
    where: {
      workerId,
      kind: "commission",
      ...(monthPrefix ? { date: { startsWith: monthPrefix } } : {}),
    },
    orderBy: { date: "desc" },
  });
  return movements.map((m) => ({
    id: m.id,
    date: m.date,
    deliveryValue: m.deliveryValue ?? 0,
    commission: m.amount,
    status: m.status,
    medium: m.medium,
  }));
}

export async function fixedPayrollForWorker(
  workerId: string,
  monthPrefix: string,
): Promise<PayrollSummary> {
  const all = await prisma.movement.findMany({
    where: {
      workerId,
      date: { startsWith: monthPrefix },
      category: { in: [15, 18] },
    },
    orderBy: { date: "asc" },
  });
  const movements = all.filter((m) => m.kind !== "commission");
  let pending = 0;
  let paid = 0;
  const payments = movements.map((m) => {
    if (m.status === "confirmed") paid += m.amount;
    else pending += m.amount;
    return {
      id: m.id,
      date: m.date,
      amount: m.amount,
      medium: m.medium,
      status: m.status,
      concept: m.description,
    };
  });
  return { payments, pending, paid };
}
