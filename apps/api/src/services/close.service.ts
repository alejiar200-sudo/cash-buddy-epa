import { prisma } from "../lib/prisma";
import { conflict } from "../lib/errors";
import { bogotaMonthRange as monthRange } from "../lib/date-range";

/**
 * Reporte mensual con la lógica del Excel.
 * Total Ventas = comisión de la empresa (companyAmount de pedidos del mes).
 * Indicadores que deben cuadrar devuelven el valor exacto y el detalle del descuadre.
 */
export async function getMonthlyReport(month: string, branchId?: string) {
  const range = monthRange(month);
  const monthPrefix = month; // "YYYY-MM"
  const orderWhere = branchId
    ? { branchId, status: { in: ["DELIVERED", "COMPLETED"] }, deliveredAt: range }
    : { status: { in: ["DELIVERED", "COMPLETED"] }, deliveredAt: range };
  const baseWhere = branchId ? { branchId, date: range } : { date: range };

  const [
    ventasAgg,
    gastosEfAgg, gastosBkAgg,
    nominaEfAgg, nominaBkAgg,
    basesGivenAgg, basesPaidAgg,
    bankIngAgg, bankEgrAgg,
    debtsGenAgg, debtsPaidAgg,
    driversWithBase,
    clientsWithDebt,
  ] = await Promise.all([
    prisma.shipdayOrder.aggregate({ where: orderWhere, _sum: { companyAmount: true } }),
    prisma.movement.aggregate({ where: { category: 3, status: "confirmed", date: { startsWith: monthPrefix } }, _sum: { amount: true } }),
    prisma.movement.aggregate({ where: { category: 4, status: "confirmed", date: { startsWith: monthPrefix } }, _sum: { amount: true } }),
    prisma.movement.aggregate({ where: { category: 15, status: "confirmed", date: { startsWith: monthPrefix } }, _sum: { amount: true } }),
    prisma.movement.aggregate({ where: { category: { in: [16, 18] }, status: "confirmed", date: { startsWith: monthPrefix } }, _sum: { amount: true } }),
    prisma.baseTransaction.aggregate({ where: { ...baseWhere, type: "entrega" }, _sum: { amount: true } }),
    prisma.baseTransaction.aggregate({ where: { ...baseWhere, type: "pago" }, _sum: { amount: true } }),
    // Solo movimientos que NECESITAN contraparte (noCounterpart=false) y AÚN no están
    // cuadrados (pairId=null). Los marcados "sin contraparte" son correctos y NO entran;
    // los ya enlazados a su contraparte tampoco. (Se excluyen los asignados a domiciliario.)
    prisma.bankTransaction.aggregate({ where: { type: "ingreso", date: range, driverId: null, noCounterpart: false, pairId: null }, _sum: { amount: true } }),
    prisma.bankTransaction.aggregate({ where: { type: "egreso", date: range, driverId: null, noCounterpart: false, pairId: null }, _sum: { amount: true } }),
    prisma.clientDebt.aggregate({ where: { createdAt: range }, _sum: { amount: true } }),
    prisma.clientDebt.aggregate({ where: { paidAt: range }, _sum: { paidAmount: true } }),
    // Saldo de BASE por domiciliario (entrega − pago), NO la deuda total (que incluye comisiones de domicilios)
    prisma.baseTransaction.groupBy({
      by: ["driverId", "type"],
      _sum: { amount: true },
      where: branchId ? { branchId } : {},
    }),
    prisma.client.findMany({ where: { pendingDebt: { gt: 0 } }, select: { id: true, name: true, pendingDebt: true }, orderBy: { pendingDebt: "desc" }, take: 20 }),
  ]);

  // Calcular saldo de base pendiente por domiciliario (solo bases, sin comisiones)
  const baseBalanceByDriver = new Map<string, number>();
  for (const row of driversWithBase) {
    const cur = baseBalanceByDriver.get(row.driverId) ?? 0;
    const amt = row._sum.amount ?? 0;
    baseBalanceByDriver.set(row.driverId, cur + (row.type === "entrega" ? amt : -amt));
  }
  const driverIdsWithBase = [...baseBalanceByDriver.entries()].filter(([, bal]) => bal > 0).map(([id]) => id);
  const driverNames = driverIdsWithBase.length
    ? await prisma.driver.findMany({ where: { id: { in: driverIdsWithBase } }, select: { id: true, name: true } })
    : [];
  const pendingBaseDrivers = driverNames
    .map(d => ({ id: d.id, name: d.name, pendingDebt: baseBalanceByDriver.get(d.id) ?? 0 }))
    .sort((a, b) => b.pendingDebt - a.pendingDebt)
    .slice(0, 20);

  // COMISIONES: deuda del domiciliario que NO es base (la comisión que deben por domicilios)
  const driversWithDebt = await prisma.driver.findMany({
    where: { pendingDebt: { gt: 0 }, ...(branchId ? { branchId } : {}) },
    select: { id: true, name: true, pendingDebt: true },
  });
  const pendingCommissionDrivers = driversWithDebt
    .map(d => ({ id: d.id, name: d.name, pendingDebt: d.pendingDebt - Math.max(0, baseBalanceByDriver.get(d.id) ?? 0) }))
    .filter(d => d.pendingDebt > 0)
    .sort((a, b) => b.pendingDebt - a.pendingDebt)
    .slice(0, 20);
  const commissionPending = pendingCommissionDrivers.reduce((s, d) => s + d.pendingDebt, 0);

  const gastosEf = gastosEfAgg._sum.amount ?? 0;
  const gastosBk = gastosBkAgg._sum.amount ?? 0;
  const nominaEf = nominaEfAgg._sum.amount ?? 0;
  const nominaBk = nominaBkAgg._sum.amount ?? 0;
  const basesGiven = basesGivenAgg._sum.amount ?? 0;
  const basesPaid = basesPaidAgg._sum.amount ?? 0;
  const bankIng = bankIngAgg._sum.amount ?? 0;
  const bankEgr = bankEgrAgg._sum.amount ?? 0;
  const debtsGen = debtsGenAgg._sum.amount ?? 0;
  const debtsPaid = debtsPaidAgg._sum.paidAmount ?? 0;

  // Movimientos que necesitan contraparte y aún no se han cuadrado (para el detalle del reporte).
  const pendingTransferMovs = await prisma.bankTransaction.findMany({
    where: { date: range, driverId: null, noCounterpart: false, pairId: null },
    select: { id: true, type: true, amount: true, description: true },
    orderBy: { date: "desc" }, take: 20,
  });
  const transferPendingItems = pendingTransferMovs.map(m => ({
    id: m.id,
    name: `${m.type === "ingreso" ? "📥" : "📤"} ${m.description || (m.type === "ingreso" ? "Ingreso" : "Salida")}`,
    pendingDebt: m.amount,
  }));

  const totalSales = ventasAgg._sum.companyAmount ?? 0;
  const totalExpenses = gastosEf + gastosBk;
  const totalPayroll = nominaEf + nominaBk;
  const basesDiff = basesGiven - basesPaid;          // esperado 0
  const transferDiff = bankIng - bankEgr;            // esperado 0
  const clientDebtBalance = debtsGen - debtsPaid;    // esperado 0
  const netProfit = totalSales - totalExpenses - totalPayroll;
  const profitability = totalSales > 0 ? (netProfit / totalSales) * 100 : 0;

  return {
    month,
    totalSales,
    expenses: { cash: gastosEf, bank: gastosBk, total: totalExpenses },
    payroll: { cash: nominaEf, bank: nominaBk, total: totalPayroll },
    bases: { given: basesGiven, returned: basesPaid, diff: basesDiff, ok: basesDiff === 0, pendingDrivers: pendingBaseDrivers },
    commission: { pending: commissionPending, ok: commissionPending === 0, pendingDrivers: pendingCommissionDrivers },
    transfers: { ingresos: bankIng, egresos: bankEgr, diff: transferDiff, ok: pendingTransferMovs.length === 0, pendingItems: transferPendingItems },
    clientDebt: { generated: debtsGen, paid: debtsPaid, balance: clientDebtBalance, ok: clientDebtBalance === 0, pendingClients: clientsWithDebt },
    netProfit,
    profitability,
  };
}

/**
 * #5 — Recálculo del capital físico a dejar para el próximo mes.
 * El usuario define el capital OBJETIVO (efectivo + banco). Si hay diferencias
 * pendientes o deudas, el dinero físico real a dejar es menor, porque esa plata
 * sigue registrada como pendiente. El operador no tiene que calcularlo a mano.
 */
export async function getMonthCloseProjection(
  month: string,
  targetCash: number,
  targetBank: number,
  branchId?: string,
) {
  const report = await getMonthlyReport(month, branchId);

  const tCash = Math.round(targetCash);
  const tBank = Math.round(targetBank);
  const targetCapital = tCash + tBank;

  // Diferencias pendientes que deben cuadrar (esperado 0 cada una).
  const basesDiff = report.bases.diff;
  const transferDiff = report.transfers.diff;
  const commissionPending = report.commission.pending;
  const pendingDiffs = basesDiff + transferDiff + commissionPending;

  // Deudas de clientes pendientes.
  const pendingDebts = report.clientDebt.balance;

  // Atribución del faltante por medio:
  //  - Banco: diferencias de transferencias (movimientos bancarios sin contraparte).
  //  - Efectivo: bases pendientes + comisiones + deudas de clientes (plata física que
  //    drivers/clientes aún tienen y no está en la caja).
  const bankShortfall = transferDiff;
  const cashShortfall = basesDiff + commissionPending + pendingDebts;

  // Capital FÍSICO a dejar, separado por medio.
  const physicalCash = tCash - cashShortfall;
  const physicalBank = tBank - bankShortfall;
  const physicalToLeave = physicalCash + physicalBank;

  return {
    month,
    targetCash: tCash,
    targetBank: tBank,
    targetCapital,
    pending: {
      basesDiff,
      transferDiff,
      commissionPending,
      totalDiffs: pendingDiffs,
      clientDebts: pendingDebts,
      cashShortfall,
      bankShortfall,
      total: pendingDiffs + pendingDebts,
    },
    // Lo que realmente debe quedar físicamente para arrancar el próximo mes:
    physicalCash,
    physicalBank,
    physicalToLeave,
    explanation:
      `Objetivo: ${tCash} efectivo + ${tBank} banco = ${targetCapital}. ` +
      `Falta en efectivo ${cashShortfall} (bases ${basesDiff} + comisiones ${commissionPending} + deudas ${pendingDebts}) ` +
      `y en banco ${bankShortfall} (transferencias). ` +
      `Dejar físicamente: ${physicalCash} en efectivo y ${physicalBank} en banco = ${physicalToLeave}.`,
    report,
  };
}

export async function closeMonth(month: string, branchId?: string, initialCash?: number, initialBank?: number, actor?: { id?: string | null; name?: string | null }) {
  // findFirst (no findUnique): la clave compuesta no admite branchId null en findUnique.
  const existing = await prisma.monthlyClose.findFirst({
    where: { month, branchId: branchId ?? null },
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

  // Reporte mensual con indicadores estilo Excel
  const report = await getMonthlyReport(month, branchId);

  // El capital inicial definido para el mes SIGUIENTE pasa a ser el saldo base del
  // sistema: actualiza el efectivo y banco de arranque (Settings). Así el nuevo mes
  // comienza acumulando desde esos valores.
  if (initialCash != null || initialBank != null) {
    await prisma.settings.update({
      where: { id: "singleton" },
      data: {
        ...(initialCash != null ? { initialCash } : {}),
        ...(initialBank != null ? { initialBank } : {}),
      },
    });
  }

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
      ...(initialCash != null ? { initialCash } : {}),
      ...(initialBank != null ? { initialBank } : {}),
      totalSales: report.totalSales,
      totalExpenses: report.expenses.total,
      totalPayroll: report.payroll.total,
      transferDiff: report.transfers.diff,
      clientDebtBalance: report.clientDebt.balance,
      netProfit: report.netProfit,
      profitability: report.profitability,
      closedBy: actor?.id ?? null,
      closedByName: actor?.name ?? null,
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
