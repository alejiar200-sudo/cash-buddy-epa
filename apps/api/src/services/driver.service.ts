import { prisma } from "../lib/prisma";
import { badRequest, notFound } from "../lib/errors";

const DELIVERED_FILTER = { in: ["DELIVERED", "COMPLETED"] };

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

export async function registerPayment(driverId: string, amount: number, medium: "cash" | "bank", notes?: string) {
  if (!amount || amount <= 0) throw badRequest("Monto inválido");
  if (medium !== "cash" && medium !== "bank") throw badRequest("Medio de pago inválido (cash o bank)");
  const driver = await prisma.driver.findUnique({ where: { id: driverId } });
  if (!driver) throw notFound("Domiciliario no encontrado");

  // Calcular saldo de base pendiente para este domiciliario
  const bases = await prisma.baseTransaction.findMany({ where: { driverId } });
  const basesGiven = bases.filter(b => b.type === "entrega").reduce((s, b) => s + b.amount, 0);
  const basesPaid = bases.filter(b => b.type === "pago").reduce((s, b) => s + b.amount, 0);
  const basePending = Math.max(0, basesGiven - basesPaid);

  // Asignación: primero a base, el resto a comisión
  const baseAlloc = Math.min(amount, basePending);
  const commissionAlloc = amount - baseAlloc;

  const ops = [] as Parameters<typeof prisma.$transaction>[0];

  if (baseAlloc > 0) {
    ops.push(
      prisma.baseTransaction.create({
        data: {
          driverId,
          branchId: driver.branchId,
          amount: baseAlloc,
          type: "pago",
          notes: `Pago asignado a base (medio: ${medium === "cash" ? "efectivo" : "transferencia"})${notes ? ` · ${notes}` : ""}`,
        },
      }),
    );
  }

  // Siempre registramos el DriverPayment con el monto total para mantener el
  // historial completo con el medio de pago real elegido.
  ops.push(
    prisma.driverPayment.create({
      data: {
        driverId,
        branchId: driver.branchId,
        amount,
        medium,
        notes:
          baseAlloc > 0 && commissionAlloc > 0
            ? `Asignado: base ${baseAlloc}, comisión ${commissionAlloc}${notes ? ` · ${notes}` : ""}`
            : baseAlloc > 0
              ? `Aplicado totalmente a base${notes ? ` · ${notes}` : ""}`
              : notes ?? null,
      },
    }),
  );

  ops.push(
    prisma.driver.update({
      where: { id: driverId },
      data: { pendingDebt: { decrement: amount } },
    }),
  );

  const results = await prisma.$transaction(ops);
  const payment = results[results.length - 2]; // el DriverPayment está antes del update
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

export async function getOrdersToday(branchId?: string) {
  // Ventana del día calculada en la zona horaria local del servidor para evitar
  // que pedidos de la noche queden fuera por el offset UTC.
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  const where: Record<string, unknown> = {
    status: DELIVERED_FILTER,
    deliveredAt: { gte: start, lte: end },
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
