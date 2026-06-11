import { prisma } from "../lib/prisma";

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
  notes?: string;
  createdBy?: string | null;
  createdByName?: string | null;
}) {
  const totalCounted = sumDenominations(data.denominations);
  const difference = totalCounted - data.expectedAmount;

  return prisma.shiftClose.upsert({
    where: { date_shift: { date: data.date, shift: data.shift } },
    update: {
      receivedBy: data.receivedBy,
      handedBy: data.handedBy,
      denominations: data.denominations as object,
      totalCounted,
      totalExpected: data.expectedAmount,
      difference,
      notes: data.notes,
      closedAt: new Date(),
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
      notes: data.notes,
      createdBy: data.createdBy ?? null,
      createdByName: data.createdByName ?? null,
    },
  });
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
