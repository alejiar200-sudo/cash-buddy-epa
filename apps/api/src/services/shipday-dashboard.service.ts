import { prisma } from "../lib/prisma";

function dateRange(date: string) {
  return { gte: new Date(date + "T00:00:00"), lte: new Date(date + "T23:59:59") };
}

function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 0, 23, 59, 59);
  return { gte: start, lte: end };
}

export async function getDashboard(branchId?: string) {
  const today = new Date().toISOString().slice(0, 10);
  const month = today.slice(0, 7);

  const branchWhere = branchId ? { branchId } : {};

  const [
    totalDrivers,
    activeDrivers,
    todayStats,
    monthStats,
    pendingDebts,
    recentOrders,
    branches,
  ] = await Promise.all([
    prisma.driver.count({ where: { ...branchWhere } }),
    prisma.driver.count({ where: { ...branchWhere, active: true } }),
    prisma.dailyDriverStat.aggregate({
      where: { ...branchWhere, date: today },
      _sum: { orderCount: true, totalValue: true, companyTotal: true },
    }),
    prisma.shipdayOrder.aggregate({
      where: { ...branchWhere, deliveredAt: monthRange(month) },
      _sum: { deliveryValue: true, companyAmount: true },
      _count: { id: true },
    }),
    prisma.driver.aggregate({
      where: { ...branchWhere, pendingDebt: { gt: 0 } },
      _sum: { pendingDebt: true },
      _count: { id: true },
    }),
    prisma.shipdayOrder.findMany({
      where: branchWhere,
      orderBy: { createdAt: "desc" },
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
      orders: todayStats._sum.orderCount ?? 0,
      value: todayStats._sum.totalValue ?? 0,
      company: todayStats._sum.companyTotal ?? 0,
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
  return prisma.driver.findMany({
    where,
    include: {
      branch: { select: { id: true, name: true } },
      orders: { orderBy: { deliveredAt: "desc" }, take: 5 },
      bases: { where: { type: "entrega" } },
    },
    orderBy: { pendingDebt: "desc" },
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
  });
}
