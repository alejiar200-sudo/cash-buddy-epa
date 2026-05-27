import type { Day as PrismaDay, Movement as PrismaMovement, Worker as PrismaWorker } from "@prisma/client";
import type { Arqueo, CategoryCode, DayData, Movement, Worker } from "@cash-buddy/shared";

export function toMovement(m: PrismaMovement): Movement {
  return {
    id: m.id,
    date: m.date,
    time: m.time,
    category: m.category as CategoryCode,
    type: m.type,
    medium: m.medium,
    amount: m.amount,
    status: m.status,
    workerId: m.workerId,
    description: m.description,
    group: m.group,
    kind: m.kind,
    deliveryId: m.deliveryId,
    deliveryValue: m.deliveryValue,
  };
}

export function toWorker(w: PrismaWorker): Worker {
  return {
    id: w.id,
    name: w.name,
    role: w.role,
    active: w.active,
    color: w.color,
  };
}

export function toDayData(d: PrismaDay & { movements: PrismaMovement[] }): DayData {
  return {
    date: d.date,
    initialCash: d.initialCash,
    initialBank: d.initialBank,
    movements: d.movements.map(toMovement),
    arqueoAM: (d.arqueoAM as Arqueo | null) ?? null,
    arqueoPM: (d.arqueoPM as Arqueo | null) ?? null,
    arqueoClose: (d.arqueoClose as Arqueo | null) ?? null,
  };
}
