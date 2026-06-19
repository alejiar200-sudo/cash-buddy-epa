import { prisma } from "../lib/prisma";
import { notFound, badRequest } from "../lib/errors";
import { applyDebtDelta } from "./driver.service";

// Eliminar una base (admin directo): revierte el efecto en la deuda del domiciliario.
export async function removeBase(id: string) {
  const base = await prisma.baseTransaction.findUnique({ where: { id } });
  if (!base) throw notFound("Base no encontrada");
  const sign = base.type === "entrega" ? -1 : 1; // entrega subió deuda → al borrar baja
  await prisma.$transaction([
    prisma.driver.update({ where: { id: base.driverId }, data: { pendingDebt: { increment: sign * base.amount } } }),
    prisma.baseTransaction.delete({ where: { id } }),
  ]);
  return { ok: true };
}

// Editar el monto de una base (admin directo): ajusta la deuda por la diferencia.
export async function editBase(id: string, input: { cashAmount?: number; bankAmount?: number; amount?: number; notes?: string }) {
  const base = await prisma.baseTransaction.findUnique({ where: { id } });
  if (!base) throw notFound("Base no encontrada");
  const cashAmount = Math.round(input.cashAmount ?? base.cashAmount);
  const bankAmount = Math.round(input.bankAmount ?? base.bankAmount);
  const newAmount = (cashAmount + bankAmount) || Math.round(input.amount ?? base.amount);
  if (newAmount <= 0) throw badRequest("El monto debe ser mayor a 0");
  const delta = newAmount - base.amount;
  const sign = base.type === "entrega" ? 1 : -1; // entrega suma deuda; pago resta
  await prisma.$transaction([
    prisma.driver.update({ where: { id: base.driverId }, data: { pendingDebt: { increment: sign * delta } } }),
    prisma.baseTransaction.update({ where: { id }, data: { amount: newAmount, cashAmount, bankAmount, ...(input.notes != null ? { notes: input.notes } : {}) } }),
  ]);
  return { ok: true };
}

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

  const tx = await prisma.$transaction(async (txc) => {
    const created = await txc.baseTransaction.create({
      data: { driverId, branchId: driver.branchId, amount, cashAmount, bankAmount, type: "entrega", notes: input.notes, createdBy: input.createdBy ?? null, createdByName: input.createdByName ?? null },
    });
    // Entregar base aumenta lo que debe, neteando contra cualquier crédito a favor.
    await applyDebtDelta(txc, driverId, amount);
    return created;
  });
  return tx;
}

export async function payBase(driverId: string, input: { cashAmount?: number; bankAmount?: number; amount?: number; notes?: string; createdBy?: string | null; createdByName?: string | null }) {
  const driver = await prisma.driver.findUnique({ where: { id: driverId } });
  if (!driver) throw notFound("Domiciliario no encontrado");
  const cashAmount = Math.round(input.cashAmount ?? 0);
  const bankAmount = Math.round(input.bankAmount ?? 0);
  const amount = (cashAmount + bankAmount) || Math.round(input.amount ?? 0);
  if (amount <= 0) throw badRequest("El monto debe ser mayor a 0");

  const tx = await prisma.$transaction(async (txc) => {
    const created = await txc.baseTransaction.create({
      data: { driverId, branchId: driver.branchId, amount, cashAmount, bankAmount, type: "pago", notes: input.notes, createdBy: input.createdBy ?? null, createdByName: input.createdByName ?? null },
    });
    // Devolver base reduce la deuda; si excede, queda como crédito (no deuda negativa).
    await applyDebtDelta(txc, driverId, -amount);
    return created;
  });
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
