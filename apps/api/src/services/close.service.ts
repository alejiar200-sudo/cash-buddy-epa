import { prisma } from "../lib/prisma";
import { conflict } from "../lib/errors";

function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  return { gte: new Date(y, m - 1, 1), lte: new Date(y, m, 0, 23, 59, 59) };
}

export async function closeMonth(month: string, branchId?: string) {
  const existing = await prisma.monthlyClose.findUnique({
    where: { month_branchId: { month, branchId: branchId ?? null } },
  });
  if (existing) throw conflict(`Ya existe un cierre para ${month}`);

  const range = monthRange(month);
  const orderWhere = branchId
    ? { branchId, deliveredAt: range }
    : { deliveredAt: range };
  const baseWhere = branchId ? { branchId, date: range } : { date: range };
  const convWhere = branchId ? { branchId, date: range } : { date: range };

  const [orders, bases, conversions] = await Promise.all([
    prisma.shipdayOrder.findMany({
      where: orderWhere,
      include: { driver: { select: { id: true, name: true } }, branch: { select: { id: true, name: true } } },
    }),
    prisma.baseTransaction.findMany({ where: baseWhere }),
    prisma.conversion.findMany({ where: convWhere }),
  ]);

  const totalOrders = orders.length;
  const totalValue = orders.reduce((s, o) => s + o.deliveryValue, 0);
  const companyTotal = orders.reduce((s, o) => s + o.companyAmount, 0);
  const basesGiven = bases.filter(b => b.type === "entrega").reduce((s, b) => s + b.amount, 0);
  const basesPaid = bases.filter(b => b.type === "pago").reduce((s, b) => s + b.amount, 0);

  const conversionsSummary = {
    banco_a_efectivo: conversions.filter(c => c.type === "banco_a_efectivo").reduce((s, c) => s + c.amount, 0),
    efectivo_a_banco: conversions.filter(c => c.type === "efectivo_a_banco").reduce((s, c) => s + c.amount, 0),
    count: conversions.length,
  };

  // Build per-driver snapshot
  const driverMap = new Map<string, { name: string; orders: number; value: number; company: number }>();
  for (const o of orders) {
    if (!o.driverId) continue;
    const cur = driverMap.get(o.driverId) ?? { name: o.driver?.name ?? "?", orders: 0, value: 0, company: 0 };
    cur.orders++;
    cur.value += o.deliveryValue;
    cur.company += o.companyAmount;
    driverMap.set(o.driverId, cur);
  }

  const snapshot = {
    drivers: Object.fromEntries(driverMap),
    orders: orders.map(o => ({
      id: o.id,
      orderNumber: o.orderNumber,
      driver: o.driver?.name ?? null,
      branch: o.branch?.name ?? null,
      value: o.deliveryValue,
      company: o.companyAmount,
      deliveredAt: o.deliveredAt,
    })),
  };

  return prisma.monthlyClose.create({
    data: {
      branchId: branchId ?? null,
      month,
      totalOrders,
      totalValue,
      companyTotal,
      basesGiven,
      basesPaid,
      basesPending: basesGiven - basesPaid,
      conversions: conversionsSummary,
      snapshot,
    },
  });
}

export async function listCloses(branchId?: string) {
  const where = branchId ? { branchId } : {};
  return prisma.monthlyClose.findMany({
    where,
    include: { branch: { select: { id: true, name: true } } },
    orderBy: { month: "desc" },
  });
}

export async function getClose(id: string) {
  return prisma.monthlyClose.findUnique({
    where: { id },
    include: { branch: { select: { id: true, name: true } } },
  });
}
