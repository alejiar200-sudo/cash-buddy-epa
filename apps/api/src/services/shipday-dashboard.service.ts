import { prisma } from "../lib/prisma";
import * as bankSvc from "./bank-transaction.service";
import * as shiftSvc from "./shift-close.service";

// IMPORTANTE: usar Z (UTC) para que el rango sea consistente con la página de pedidos
// que parsea "2026-06-05" como UTC midnight. Sin Z en Bogotá (UTC-5), se adelantaría 5h.
function dateRange(date: string) {
  return {
    gte: new Date(date + "T00:00:00.000Z"),
    lte: new Date(date + "T23:59:59.999Z"),
  };
}

function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  // UTC dates: start = primer día del mes 00:00Z, end = último día 23:59:59Z
  const start = new Date(`${y}-${String(m).padStart(2, "0")}-01T00:00:00.000Z`);
  const lastDay = new Date(y, m, 0).getDate();
  const end = new Date(`${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}T23:59:59.999Z`);
  return { gte: start, lte: end };
}

export async function getDashboardFull(branchId?: string) {
  const today = new Date().toISOString().slice(0, 10);
  const todayRange = dateRange(today);

  const [shipday, todayShifts, bankSummary, topClientDebtors, expectedBalances] = await Promise.all([
    getDashboard(branchId),
    shiftSvc.getShiftsForDate(today),
    bankSvc.summary(today, today),
    prisma.client.findMany({
      where: { pendingDebt: { gt: 0 }, active: true },
      orderBy: { pendingDebt: "desc" },
      take: 3,
      select: { id: true, name: true, phone: true, pendingDebt: true },
    }),
    // Calcular saldos esperados en caja y banco a partir de hoy
    getExpectedBalances(today, todayRange),
  ]);

  const shiftsMap = { AM: false, PM: false, close: false } as Record<string, boolean>;
  for (const s of todayShifts) { shiftsMap[s.shift] = true; }

  return {
    ...shipday,
    caja: {
      shifts: todayShifts,
      shiftsStatus: { AM: shiftsMap.AM, PM: shiftsMap.PM, close: shiftsMap.close },
      bankToday: bankSummary,
      expectedCash: expectedBalances.cash,
      expectedBank: expectedBalances.bank,
    },
    topClientDebtors,
  };
}

/**
 * Calcula el efectivo y banco ESPERADOS para una fecha (YYYY-MM-DD),
 * usado por los cierres de turno automáticos (#6). El usuario solo verifica.
 */
export async function getExpectedBalancesForDate(date: string) {
  const gte = new Date(date + "T00:00:00.000Z");
  const lte = new Date(date + "T23:59:59.999Z");
  return getExpectedBalances(date, { gte, lte });
}

async function getExpectedBalances(today: string, todayRange: { gte: Date; lte: Date }) {
  // ANCLA = ÚLTIMO CIERRE: un cierre de mes es un punto de reinicio. El período
  // actual arranca con el capital definido en ese cierre y va sumando TODOS los
  // flujos registrados DESPUÉS del mes cerrado. Si no hay cierres, arranca con el
  // capital configurado (Settings) desde el inicio del mes calendario.
  const settings = await prisma.settings.findUnique({ where: { id: "singleton" } });
  const lastClose = await prisma.monthlyClose.findFirst({
    where: { branchId: null },
    orderBy: { month: "desc" },
  });

  let baseCash: number;
  let baseBank: number;
  let periodStartStr: string;
  if (lastClose) {
    baseCash = lastClose.initialCash ?? settings?.initialCash ?? 0;
    baseBank = lastClose.initialBank ?? settings?.initialBank ?? 0;
    // El nuevo período empieza el primer día del mes SIGUIENTE al cerrado.
    const [y, m] = lastClose.month.split("-").map(Number);
    const next = new Date(Date.UTC(y, m, 1)); // m = mes siguiente (0-based +1)
    periodStartStr = next.toISOString().slice(0, 10);
  } else {
    baseCash = settings?.initialCash ?? 0;
    baseBank = settings?.initialBank ?? 0;
    periodStartStr = today.slice(0, 7) + "-01";
  }
  const cumRange = { gte: new Date(periodStartStr + "T00:00:00.000Z"), lte: todayRange.lte };

  const [movements, bankTxs, convs, driverPayments, bases, clientPays] = await Promise.all([
    // Movimientos de caja desde el inicio del período hasta la fecha (string YYYY-MM-DD)
    prisma.movement.findMany({ where: { date: { gte: periodStartStr, lte: today }, status: "confirmed" }, select: { type: true, medium: true, amount: true } }),
    prisma.bankTransaction.findMany({ where: { date: cumRange }, select: { type: true, medium: true, amount: true } }),
    prisma.conversion.findMany({ where: { date: cumRange }, select: { type: true, amount: true } }),
    prisma.driverPayment.findMany({ where: { date: cumRange }, select: { medium: true, amount: true } }),
    prisma.baseTransaction.findMany({ where: { date: cumRange }, select: { type: true, cashAmount: true, bankAmount: true, amount: true } }),
    prisma.clientDebt.findMany({ where: { paidAt: cumRange }, select: { paidCash: true, paidBank: true } }),
  ]);

  // Gastos/nómina del sistema original (solo confirmados)
  for (const m of movements) {
    const sign = m.type === "ingreso" ? 1 : -1;
    if (m.medium === "cash") baseCash += sign * m.amount;
    else baseBank += sign * m.amount;
  }
  // Banco: ahora cada movimiento tiene medio (efectivo/transferencia)
  for (const t of bankTxs) {
    const sign = t.type === "ingreso" ? 1 : -1;
    if (t.medium === "cash") baseCash += sign * t.amount;
    else baseBank += sign * t.amount;
  }
  // Conversiones antiguas (compatibilidad histórica)
  for (const c of convs) {
    if (c.type === "banco_a_efectivo") { baseBank -= c.amount; baseCash += c.amount; }
    else { baseCash -= c.amount; baseBank += c.amount; }
  }
  // Pagos de comisión de domiciliarios: dinero que entra
  for (const p of driverPayments) {
    if (p.medium === "cash") baseCash += p.amount;
    else baseBank += p.amount;
  }
  // Bases: split efectivo/transferencia. Entrega sale, devolución vuelve.
  for (const b of bases) {
    const cash = b.cashAmount || (b.bankAmount ? 0 : b.amount); // fallback a efectivo si no hay split
    const bank = b.bankAmount;
    if (b.type === "entrega") { baseCash -= cash; baseBank -= bank; }
    else { baseCash += cash; baseBank += bank; }
  }
  // Cobros de deudas de clientes: según el medio del abono
  for (const cp of clientPays) {
    baseCash += cp.paidCash;
    baseBank += cp.paidBank;
  }

  return { cash: baseCash, bank: baseBank };
}

export async function getDashboard(branchId?: string) {
  const today = new Date().toISOString().slice(0, 10);
  const month = today.slice(0, 7);

  const branchWhere = branchId ? { branchId } : {};

  const DELIVERED_STATUS = { in: ["DELIVERED", "COMPLETED"] };

  const [
    totalDrivers,
    activeDrivers,
    todayStats,         // Ahora directo desde ShipdayOrder — mismo origen que la página de pedidos
    monthStats,
    pendingDebts,
    recentOrders,
    branches,
  ] = await Promise.all([
    prisma.driver.count({ where: { ...branchWhere } }),
    prisma.driver.count({ where: { ...branchWhere, active: true } }),
    // Usar ShipdayOrder directamente (misma fuente que /pedidos) — evita desincronización con DailyDriverStat
    prisma.shipdayOrder.aggregate({
      where: { ...branchWhere, status: DELIVERED_STATUS, deliveredAt: dateRange(today) },
      _sum: { deliveryValue: true, companyAmount: true },
      _count: { id: true },
    }),
    prisma.shipdayOrder.aggregate({
      where: { ...branchWhere, status: DELIVERED_STATUS, deliveredAt: monthRange(month) },
      _sum: { deliveryValue: true, companyAmount: true },
      _count: { id: true },
    }),
    prisma.driver.aggregate({
      where: { ...branchWhere, pendingDebt: { gt: 0 } },
      _sum: { pendingDebt: true },
      _count: { id: true },
    }),
    prisma.shipdayOrder.findMany({
      where: { ...branchWhere, status: { in: ["DELIVERED", "COMPLETED"] } },
      orderBy: { deliveredAt: "desc" },
      take: 10,
      include: {
        driver: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true } },
      },
    }),
    prisma.branch.findMany({ where: { active: true }, select: { id: true, name: true, syncStatus: true, lastSyncAt: true } }),
  ]);

  return {
    today: {
      orders: todayStats._count.id,             // conteo directo desde ShipdayOrder
      value: todayStats._sum.deliveryValue ?? 0,
      company: todayStats._sum.companyAmount ?? 0,
    },
    month: {
      orders: monthStats._count.id,
      value: monthStats._sum.deliveryValue ?? 0,
      company: monthStats._sum.companyAmount ?? 0,
    },
    drivers: { total: totalDrivers, active: activeDrivers },
    debts: {
      totalAmount: pendingDebts._sum.pendingDebt ?? 0,
      driverCount: pendingDebts._count.id,
    },
    recentOrders,
    branches,
  };
}

export async function getDailyStats(date: string, branchId?: string) {
  const where = branchId ? { date, branchId } : { date };
  return prisma.dailyDriverStat.findMany({
    where,
    include: {
      driver: { select: { id: true, name: true } },
      branch: { select: { id: true, name: true } },
    },
    orderBy: { orderCount: "desc" },
  });
}

export async function getDebtsDashboard(branchId?: string) {
  const where = branchId ? { branchId, pendingDebt: { gt: 0 } } : { pendingDebt: { gt: 0 } };
  // Límites para evitar cargar cientos de bases por driver
  return prisma.driver.findMany({
    where,
    include: {
      branch: { select: { id: true, name: true } },
      orders: { orderBy: { deliveredAt: "desc" }, take: 5 },
      bases: { where: { type: "entrega" }, orderBy: { date: "desc" }, take: 20 },
    },
    orderBy: { pendingDebt: "desc" },
    take: 100,
  });
}

const DELIVERED = { in: ["DELIVERED", "COMPLETED"] };

export async function getOrdersByBranch(branchId: string, from?: string, to?: string) {
  const where: Record<string, unknown> = { branchId, status: DELIVERED };
  if (from || to) {
    where.deliveredAt = {};
    if (from) (where.deliveredAt as Record<string, Date>).gte = new Date(from);
    if (to) (where.deliveredAt as Record<string, Date>).lte = new Date(to + "T23:59:59");
  }
  return prisma.shipdayOrder.findMany({
    where,
    include: { driver: { select: { id: true, name: true } } },
    orderBy: { deliveredAt: "desc" },
    take: 300,
  });
}
