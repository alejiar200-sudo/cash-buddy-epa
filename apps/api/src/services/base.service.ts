import { prisma } from "../lib/prisma";
import { notFound, badRequest } from "../lib/errors";
import { applyDebtDelta } from "./driver.service";
import { bogotaOpenRange } from "../lib/date-range";

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

  let cashAmount: number;
  let bankAmount: number;
  let newAmount: number;

  if (input.cashAmount != null || input.bankAmount != null) {
    cashAmount = Math.round(input.cashAmount ?? base.cashAmount);
    bankAmount = Math.round(input.bankAmount ?? base.bankAmount);
    newAmount = cashAmount + bankAmount;
  } else if (input.amount != null) {
    // Solo se editó el total: reescalar cashAmount/bankAmount proporcionalmente para
    // que sigan sumando el nuevo total (si no, el saldo de banco/efectivo, que usa
    // cashAmount/bankAmount y no amount, queda desincronizado del valor corregido).
    newAmount = Math.round(input.amount);
    const oldTotal = base.cashAmount + base.bankAmount;
    if (oldTotal > 0) {
      bankAmount = Math.round(base.bankAmount * (newAmount / oldTotal));
      cashAmount = newAmount - bankAmount;
    } else {
      cashAmount = newAmount;
      bankAmount = 0;
    }
  } else {
    cashAmount = base.cashAmount;
    bankAmount = base.bankAmount;
    newAmount = base.amount;
  }

  if (newAmount <= 0) throw badRequest("El monto debe ser mayor a 0");
  const delta = newAmount - base.amount;
  const sign = base.type === "entrega" ? 1 : -1; // entrega suma deuda; pago resta
  await prisma.$transaction([
    prisma.driver.update({ where: { id: base.driverId }, data: { pendingDebt: { increment: sign * delta } } }),
    prisma.baseTransaction.update({ where: { id }, data: { amount: newAmount, cashAmount, bankAmount, ...(input.notes != null ? { notes: input.notes } : {}) } }),
  ]);
  return { ok: true };
}

export async function listBases(branchId?: string, driverId?: string, from?: string, to?: string) {
  const where: Record<string, unknown> = {};
  if (branchId) where.branchId = branchId;
  if (driverId) where.driverId = driverId;
  const dateWhere = bogotaOpenRange(from, to);
  if (dateWhere) where.date = dateWhere;
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
