import { prisma } from "../lib/prisma";
import { notFound, badRequest } from "../lib/errors";

export async function listBases(branchId?: string, driverId?: string) {
  const where: Record<string, unknown> = {};
  if (branchId) where.branchId = branchId;
  if (driverId) where.driverId = driverId;
  return prisma.baseTransaction.findMany({
    where,
    include: {
      driver: { select: { id: true, name: true } },
      branch: { select: { id: true, name: true } },
    },
    orderBy: { date: "desc" },
  });
}

// Acepta split efectivo/transferencia combinable. amount = cash + bank.
export async function giveBase(driverId: string, input: { cashAmount?: number; bankAmount?: number; amount?: number; notes?: string; createdBy?: string | null; createdByName?: string | null }) {
  const driver = await prisma.driver.findUnique({ where: { id: driverId } });
  if (!driver) throw notFound("Domiciliario no encontrado");
  const cashAmount = Math.round(input.cashAmount ?? 0);
  const bankAmount = Math.round(input.bankAmount ?? 0);
  const amount = (cashAmount + bankAmount) || Math.round(input.amount ?? 0);
  if (amount <= 0) throw badRequest("El monto debe ser mayor a 0");

  const [tx] = await prisma.$transaction([
    prisma.baseTransaction.create({
      data: { driverId, branchId: driver.branchId, amount, cashAmount, bankAmount, type: "entrega", notes: input.notes, createdBy: input.createdBy ?? null, createdByName: input.createdByName ?? null },
    }),
    prisma.driver.update({
      where: { id: driverId },
      data: { pendingDebt: { increment: amount } },
    }),
  ]);
  return tx;
}

export async function payBase(driverId: string, input: { cashAmount?: number; bankAmount?: number; amount?: number; notes?: string; createdBy?: string | null; createdByName?: string | null }) {
  const driver = await prisma.driver.findUnique({ where: { id: driverId } });
  if (!driver) throw notFound("Domiciliario no encontrado");
  const cashAmount = Math.round(input.cashAmount ?? 0);
  const bankAmount = Math.round(input.bankAmount ?? 0);
  const amount = (cashAmount + bankAmount) || Math.round(input.amount ?? 0);
  if (amount <= 0) throw badRequest("El monto debe ser mayor a 0");

  const [tx] = await prisma.$transaction([
    prisma.baseTransaction.create({
      data: { driverId, branchId: driver.branchId, amount, cashAmount, bankAmount, type: "pago", notes: input.notes, createdBy: input.createdBy ?? null, createdByName: input.createdByName ?? null },
    }),
    prisma.driver.update({
      where: { id: driverId },
      data: { pendingDebt: { decrement: amount } },
    }),
  ]);
  return tx;
}

export async function getBaseSummary(driverId: string) {
  const driver = await prisma.driver.findUnique({ where: { id: driverId } });
  if (!driver) throw notFound("Domiciliario no encontrado");

  const bases = await prisma.baseTransaction.findMany({
    where: { driverId },
    orderBy: { date: "asc" },
  });

  const given = bases.filter(b => b.type === "entrega").reduce((s, b) => s + b.amount, 0);
  const paid = bases.filter(b => b.type === "pago").reduce((s, b) => s + b.amount, 0);

  return { given, paid, pending: given - paid, history: bases };
}
