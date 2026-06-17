import { prisma } from "../lib/prisma";
import { badRequest, notFound } from "../lib/errors";
import { bogotaDayRange, todayBogota } from "../lib/date-range";

const DELIVERED_FILTER = { in: ["DELIVERED", "COMPLETED"] };

function formatCOP(n: number): string {
  return "$" + Math.round(n).toLocaleString("es-CO");
}

export async function listDrivers(branchId?: string) {
  const where = branchId ? { branchId } : {};
  return prisma.driver.findMany({
    where,
    include: { branch: { select: { id: true, name: true } } },
    orderBy: { name: "asc" },
  });
}

export async function getDriverDetail(id: string) {
  const driver = await prisma.driver.findUnique({
    where: { id },
    include: {
      branch: { select: { id: true, name: true } },
      bases: { orderBy: { date: "desc" }, take: 50 },
      payments: { orderBy: { date: "desc" }, take: 50 },
      orders: { where: { status: DELIVERED_FILTER }, orderBy: { deliveredAt: "desc" }, take: 100 },
      dailyStats: { orderBy: { date: "desc" }, take: 30 },
    },
  });
  if (!driver) throw notFound("Domiciliario no encontrado");
  return driver;
}

export async function registerPayment(driverId: string, amount: number, medium: "cash" | "bank", notes?: string, actor?: { id?: string | null; name?: string | null }) {
  if (!amount || amount <= 0) throw badRequest("Monto inválido");
  if (medium !== "cash" && medium !== "bank") throw badRequest("Medio de pago inválido (cash o bank)");
  const driver = await prisma.driver.findUnique({ where: { id: driverId } });
  if (!driver) throw notFound("Domiciliario no encontrado");

  // Saldo de base pendiente vía aggregate (no carga todas las filas)
  const [givenAgg, paidAgg] = await Promise.all([
    prisma.baseTransaction.aggregate({ where: { driverId, type: "entrega" }, _sum: { amount: true } }),
    prisma.baseTransaction.aggregate({ where: { driverId, type: "pago" }, _sum: { amount: true } }),
  ]);
  const basesGiven = givenAgg._sum.amount ?? 0;
  const basesPaid = paidAgg._sum.amount ?? 0;
  const basePending = Math.max(0, basesGiven - basesPaid);

  // Asignación: primero a base, el resto a comisión
  const baseAlloc = Math.min(amount, basePending);
  const commissionAlloc = amount - baseAlloc;

  // IMPORTANTE: el dinero del domiciliario ENTRA a la empresa.
  //  - La parte de base se registra UNA sola vez como BaseTransaction "pago" (devolución).
  //  - La parte de comisión se registra como DriverPayment (solo el monto de comisión).
  // Así no se duplica el movimiento ni aparece un egreso fantasma.
  let payment = null as Awaited<ReturnType<typeof prisma.driverPayment.create>> | null;

  await prisma.$transaction(async (tx) => {
    // Devolución de base (dinero que regresa a la empresa)
    if (baseAlloc > 0) {
      await tx.baseTransaction.create({
        data: {
          driverId,
          branchId: driver.branchId,
          amount: baseAlloc,
          type: "pago",
          notes: `Devolución de base (${medium === "cash" ? "efectivo" : "transferencia"})${notes ? ` · ${notes}` : ""}`,
          createdBy: actor?.id ?? null,
          createdByName: actor?.name ?? null,
        },
      });
    }

    // Pago de comisión (solo la parte que NO es base)
    if (commissionAlloc > 0) {
      payment = await tx.driverPayment.create({
        data: {
          driverId,
          branchId: driver.branchId,
          amount: commissionAlloc,
          medium,
          notes: `Pago de comisión${notes ? ` · ${notes}` : ""}`,
          createdBy: actor?.id ?? null,
          createdByName: actor?.name ?? null,
        },
      });
    }

    // La deuda total baja por el monto completo (base + comisión)
    await tx.driver.update({
      where: { id: driverId },
      data: { pendingDebt: { decrement: amount } },
    });
  });

  return { payment, baseAlloc, commissionAlloc, basePendingBefore: basePending };
}

export async function getDriverStatement(id: string) {
  const driver = await prisma.driver.findUnique({ where: { id } });
  if (!driver) throw notFound("Domiciliario no encontrado");

  const [orders, bases, payments, stats] = await Promise.all([
    prisma.shipdayOrder.findMany({ where: { driverId: id, status: DELIVERED_FILTER }, orderBy: { deliveredAt: "desc" } }),
    prisma.baseTransaction.findMany({ where: { driverId: id }, orderBy: { date: "desc" } }),
    prisma.driverPayment.findMany({ where: { driverId: id }, orderBy: { date: "desc" } }),
    prisma.dailyDriverStat.findMany({ where: { driverId: id }, orderBy: { date: "desc" }, take: 30 }),
  ]);

  const totalOrders = orders.length;
  const totalValue = orders.reduce((s, o) => s + o.deliveryValue, 0);
  const totalCompany = orders.reduce((s, o) => s + o.companyAmount, 0);
  const totalBasesGiven = bases.filter(b => b.type === "entrega").reduce((s, b) => s + b.amount, 0);
  const totalBasesPaid = bases.filter(b => b.type === "pago").reduce((s, b) => s + b.amount, 0);
  const totalPaid = payments.reduce((s, p) => s + p.amount, 0);

  return {
    driver,
    totalOrders,
    totalValue,
    totalCompany,
    totalBasesGiven,
    totalBasesPaid,
    totalPaid,
    pendingDebt: driver.pendingDebt,
    orders,
    bases,
    payments,
    stats,
  };
}

export async function applyBankToDriver(
  bankTxId: string,
  driverId: string,
  actor?: { id?: string | null; name?: string | null }
) {
  const [bankTx, driver] = await Promise.all([
    prisma.bankTransaction.findUnique({ where: { id: bankTxId } }),
    prisma.driver.findUnique({ where: { id: driverId } }),
  ]);
  if (!bankTx) throw notFound("Movimiento bancario no encontrado");
  if (!driver) throw notFound("Domiciliario no encontrado");

  const amount = bankTx.amount;
  const medium = (bankTx.medium ?? "bank") as "cash" | "bank";
  const previousDebt = driver.pendingDebt;
  const previousCredit = driver.creditAmount ?? 0;

  // Si el domiciliario ya tiene crédito (empresa le debe), sumar al crédito
  if (previousDebt <= 0 && previousCredit > 0) {
    const newCredit = previousCredit + amount;
    await prisma.$transaction([
      prisma.driver.update({
        where: { id: driverId },
        data: { creditAmount: newCredit, creditMedium: medium },
      }),
      prisma.bankTransaction.update({
        where: { id: bankTxId },
        data: {
          driverId,
          driverName: driver.name,
          description: `${bankTx.description} · Abonado al crédito de ${driver.name} (${formatCOP(amount)})`,
        },
      }),
    ]);
    return { applied: amount, previousDebt: 0, newDebt: 0, creditAmount: newCredit, creditMedium: medium, excess: newCredit };
  }

  // Caso normal: descontar del pendingDebt
  const applied = Math.min(amount, previousDebt);
  const excess = amount - previousDebt; // positivo = empresa queda debiendo

  await prisma.$transaction(async (tx) => {
    // Registrar el pago para que quede en el historial del domiciliario
    const [givenAgg, paidAgg] = await Promise.all([
      tx.baseTransaction.aggregate({ where: { driverId, type: "entrega" }, _sum: { amount: true } }),
      tx.baseTransaction.aggregate({ where: { driverId, type: "pago" }, _sum: { amount: true } }),
    ]);
    const basePending = Math.max(0, (givenAgg._sum.amount ?? 0) - (paidAgg._sum.amount ?? 0));
    const baseAlloc = Math.min(applied, basePending);
    const commissionAlloc = applied - baseAlloc;

    if (baseAlloc > 0) {
      await tx.baseTransaction.create({
        data: {
          driverId,
          branchId: driver.branchId,
          amount: baseAlloc,
          type: "pago",
          notes: `Pago vía banco (${medium === "cash" ? "efectivo" : "transferencia"})`,
          createdBy: actor?.id ?? null,
          createdByName: actor?.name ?? null,
        },
      });
    }
    if (commissionAlloc > 0) {
      await tx.driverPayment.create({
        data: {
          driverId,
          branchId: driver.branchId,
          amount: commissionAlloc,
          medium,
          notes: "Pago vía movimiento bancario",
          createdBy: actor?.id ?? null,
          createdByName: actor?.name ?? null,
        },
      });
    }

    const newDebt = Math.max(0, previousDebt - amount);
    const newCredit = excess > 0 ? excess : 0;

    await tx.driver.update({
      where: { id: driverId },
      data: {
        pendingDebt: newDebt,
        creditAmount: newCredit,
        creditMedium: newCredit > 0 ? medium : null,
      },
    });

    // Dejar escrito en la descripción del movimiento QUÉ se descontó y a quién.
    const partes: string[] = [];
    if (baseAlloc > 0) partes.push(`base ${formatCOP(baseAlloc)}`);
    if (commissionAlloc > 0) partes.push(`comisión ${formatCOP(commissionAlloc)}`);
    const detalle = partes.length ? `: ${partes.join(" + ")}` : "";
    const sobrante = excess > 0 ? ` · sobrante a crédito ${formatCOP(excess)}` : "";
    await tx.bankTransaction.update({
      where: { id: bankTxId },
      data: {
        driverId,
        driverName: driver.name,
        description: `${bankTx.description} · Descontado de la deuda de ${driver.name}${detalle}${sobrante}`,
      },
    });
  });

  const newDebt = Math.max(0, previousDebt - amount);
  const creditAmount = excess > 0 ? excess : 0;
  return { applied, previousDebt, newDebt, creditAmount, creditMedium: creditAmount > 0 ? medium : null, excess };
}

export async function payCredit(
  driverId: string,
  medium: "cash" | "bank",
  actor?: { id?: string | null; name?: string | null }
) {
  const driver = await prisma.driver.findUnique({ where: { id: driverId } });
  if (!driver) throw notFound("Domiciliario no encontrado");
  const creditAmount = driver.creditAmount ?? 0;
  if (creditAmount <= 0) throw badRequest("Este domiciliario no tiene crédito pendiente");

  await prisma.$transaction(async (tx) => {
    // Egreso de la empresa hacia el domiciliario
    await tx.bankTransaction.create({
      data: {
        type: "egreso",
        medium,
        amount: creditAmount,
        description: `Pago a domiciliario ${driver.name}`,
        driverId,
        driverName: driver.name,
        createdBy: actor?.id ?? null,
        createdByName: actor?.name ?? null,
      },
    });
    // Cerrar el crédito
    await tx.driver.update({
      where: { id: driverId },
      data: { creditAmount: 0, creditMedium: null },
    });
  });

  return { paid: creditAmount, medium, driverName: driver.name };
}

export async function getOrdersToday(branchId?: string) {
  // Ventana del día en zona Bogotá, sin depender de la TZ del proceso Node.
  const { gte, lte } = bogotaDayRange(todayBogota());
  const where: Record<string, unknown> = {
    status: DELIVERED_FILTER,
    deliveredAt: { gte, lte },
  };
  if (branchId) where.branchId = branchId;
  return prisma.shipdayOrder.findMany({
    where,
    include: {
      driver: { select: { id: true, name: true } },
      branch: { select: { id: true, name: true } },
    },
    orderBy: { deliveredAt: "desc" },
  });
}
