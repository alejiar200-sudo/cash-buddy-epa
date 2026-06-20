import { prisma } from "../lib/prisma";
import { conflict } from "../lib/errors";

export interface Denominations {
  bills: { value: number; qty: number }[];
  coins: { value: number; qty: number }[];
}

function sumDenominations(d: Denominations) {
  const bills = d.bills.reduce((s, b) => s + b.value * b.qty, 0);
  const coins = d.coins.reduce((s, c) => s + c.value * c.qty, 0);
  return bills + coins;
}

export async function getShiftsForDate(date: string) {
  return prisma.shiftClose.findMany({ where: { date }, orderBy: { closedAt: "asc" } });
}

export async function getShift(date: string, shift: "AM" | "PM" | "close") {
  return prisma.shiftClose.findUnique({ where: { date_shift: { date, shift } } });
}

export async function registerShift(data: {
  date: string;
  shift: "AM" | "PM" | "close";
  receivedBy?: string;
  handedBy?: string;
  denominations: Denominations;
  expectedAmount: number;
  // Conciliación de banco (opcional). bankCounted = saldo real que ingresa el
  // operador; bankExpected lo decide el SERVIDOR (igual que el efectivo) para que
  // no se pueda alterar. Si bankCounted no viene, no se concilia banco (queda null).
  bankCounted?: number | null;
  bankExpected?: number | null;
  notes?: string;
  createdBy?: string | null;
  createdByName?: string | null;
}) {
  const totalCounted = sumDenominations(data.denominations);
  const difference = totalCounted - data.expectedAmount;

  // Banco: solo se concilia si el operador ingresó un saldo real (bankCounted).
  const hasBank = data.bankCounted != null;
  const bankExpected = hasBank ? Math.round(data.bankExpected ?? 0) : null;
  const bankCounted = hasBank ? Math.round(data.bankCounted!) : null;
  const bankDifference = hasBank ? (bankCounted! - (bankExpected ?? 0)) : null;

  // #9 — Un cierre ya registrado queda bloqueado. Para corregirlo hay que pasar por
  // el flujo de EditRequest (autorización administrativa), no sobrescribirlo aquí.
  const existing = await prisma.shiftClose.findUnique({
    where: { date_shift: { date: data.date, shift: data.shift } },
  });
  if (existing?.locked) {
    throw conflict(
      `El cierre de ${data.shift} del ${data.date} ya está registrado y bloqueado. ` +
      "Solicita una edición autorizada para modificarlo.",
    );
  }

  return prisma.shiftClose.upsert({
    where: { date_shift: { date: data.date, shift: data.shift } },
    update: {
      receivedBy: data.receivedBy,
      handedBy: data.handedBy,
      denominations: data.denominations as object,
      totalCounted,
      totalExpected: data.expectedAmount,
      difference,
      bankCounted,
      bankExpected,
      bankDifference,
      notes: data.notes,
      closedAt: new Date(),
      locked: true,
    },
    create: {
      date: data.date,
      shift: data.shift,
      receivedBy: data.receivedBy,
      handedBy: data.handedBy,
      denominations: data.denominations as object,
      totalCounted,
      totalExpected: data.expectedAmount,
      difference,
      bankCounted,
      bankExpected,
      bankDifference,
      notes: data.notes,
      createdBy: data.createdBy ?? null,
      createdByName: data.createdByName ?? null,
    },
  });
}

export async function deleteShift(id: string) {
  await prisma.shiftClose.delete({ where: { id } });
  return { ok: true };
}

export async function listShifts(from?: string, to?: string) {
  return prisma.shiftClose.findMany({
    where: {
      ...(from ? { date: { gte: from } } : {}),
      ...(to ? { date: { lte: to } } : {}),
    },
    orderBy: [{ date: "desc" }, { closedAt: "desc" }],
  });
}
