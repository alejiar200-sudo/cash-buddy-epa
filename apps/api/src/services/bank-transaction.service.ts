import { prisma } from "../lib/prisma";
import { bogotaOpenRange } from "../lib/date-range";

export async function list(params?: { type?: "ingreso" | "egreso"; from?: string; to?: string }) {
  const where: Record<string, unknown> = {};
  if (params?.type) where.type = params.type;
  const dateRange = bogotaOpenRange(params?.from, params?.to);
  if (dateRange) where.date = dateRange;
  return prisma.bankTransaction.findMany({
    where,
    orderBy: { date: "desc" },
  });
}

export async function create(data: {
  type: "ingreso" | "egreso";
  medium?: "cash" | "bank";
  amount: number;
  // Movimientos mixtos (#3): si se envían, se reparte el monto en efectivo + banco.
  cashAmount?: number;
  bankAmount?: number;
  description: string;
  reference?: string;
  driverId?: string;
  date?: string;
  createdBy?: string | null;
  createdByName?: string | null;
  // Si se registra como contraparte de otro movimiento, su id va aquí para enlazarlos.
  pairWith?: string;
  // Marca explícita: este movimiento NO requiere contraparte (es independiente).
  noCounterpart?: boolean;
}) {
  let driverName: string | undefined;
  if (data.driverId) {
    const driver = await prisma.driver.findUnique({ where: { id: data.driverId } });
    driverName = driver?.name;
  }
  const when = data.date ? new Date(data.date) : new Date();

  // Enlace explícito de contraparte: comparten un pairId. Así, salida ↔ retorno se
  // cuadran sin depender de coincidencias de monto.
  let pairId: string | undefined;
  if (data.pairWith) {
    const original = await prisma.bankTransaction.findUnique({ where: { id: data.pairWith } });
    if (original) {
      pairId = original.pairId ?? `pair_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      if (!original.pairId) {
        // Marcar también la(s) fila(s) del original (puede ser mixto con groupId).
        if (original.groupId) await prisma.bankTransaction.updateMany({ where: { groupId: original.groupId }, data: { pairId } });
        else await prisma.bankTransaction.update({ where: { id: original.id }, data: { pairId } });
      }
    }
  }

  const base = {
    type: data.type,
    description: data.description,
    reference: data.reference,
    driverId: data.driverId,
    driverName,
    date: when,
    createdBy: data.createdBy ?? null,
    createdByName: data.createdByName ?? null,
    pairId,
    noCounterpart: data.noCounterpart === true,
  };

  const cash = Math.round(data.cashAmount ?? 0);
  const bank = Math.round(data.bankAmount ?? 0);

  // Movimiento MIXTO: parte efectivo + parte transferencia → dos registros enlazados
  // por un groupId compartido para que la UI los muestre como UN solo movimiento.
  if (cash > 0 && bank > 0) {
    const groupId = `mix_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const [a, b] = await prisma.$transaction([
      prisma.bankTransaction.create({ data: { ...base, medium: "cash", amount: cash, groupId } }),
      prisma.bankTransaction.create({ data: { ...base, medium: "bank", amount: bank, groupId } }),
    ]);
    return { mixed: true, parts: [a, b] };
  }

  // Movimiento simple (un solo medio).
  const medium = data.medium === "cash" ? "cash" : "bank";
  const amount = (cash + bank) || data.amount;
  return prisma.bankTransaction.create({ data: { ...base, medium, amount } });
}

export async function remove(id: string) {
  const tx = await prisma.bankTransaction.findUnique({ where: { id } });
  if (tx?.groupId) {
    // Movimiento mixto: eliminar ambas mitades enlazadas.
    await prisma.bankTransaction.deleteMany({ where: { groupId: tx.groupId } });
    return;
  }
  await prisma.bankTransaction.delete({ where: { id } });
}

export async function summary(from?: string, to?: string) {
  const dateWhere = bogotaOpenRange(from, to);

  const [ingresosAgg, egresosAgg, count] = await Promise.all([
    prisma.bankTransaction.aggregate({
      where: { type: "ingreso", ...(dateWhere ? { date: dateWhere } : {}) },
      _sum: { amount: true },
    }),
    prisma.bankTransaction.aggregate({
      where: { type: "egreso", ...(dateWhere ? { date: dateWhere } : {}) },
      _sum: { amount: true },
    }),
    prisma.bankTransaction.count({
      where: dateWhere ? { date: dateWhere } : undefined,
    }),
  ]);

  const ingresos = ingresosAgg._sum.amount ?? 0;
  const egresos = egresosAgg._sum.amount ?? 0;
  return { ingresos, egresos, balance: ingresos - egresos, count };
}
