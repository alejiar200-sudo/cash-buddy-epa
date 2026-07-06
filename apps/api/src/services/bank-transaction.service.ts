import { prisma } from "../lib/prisma";
import { bogotaOpenRange } from "../lib/date-range";
import { badRequest } from "../lib/errors";
import { BANK_LINKED_PAYMENT_NOTE, BANK_LINKED_BASE_PREFIX } from "../lib/balance-markers";

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
  // Punto 4 — bloquear montos inválidos (0 o negativos) que falsean los saldos.
  const cashIn0 = Math.round(data.cashAmount ?? 0);
  const bankIn0 = Math.round(data.bankAmount ?? 0);
  const totalIn = (cashIn0 + bankIn0) || Math.round(data.amount ?? 0);
  if (!Number.isFinite(totalIn) || totalIn <= 0) {
    throw badRequest("El monto debe ser mayor a 0.");
  }
  if (cashIn0 < 0 || bankIn0 < 0) {
    throw badRequest("Los montos no pueden ser negativos.");
  }

  let driverName: string | undefined;
  if (data.driverId) {
    const driver = await prisma.driver.findUnique({ where: { id: data.driverId } });
    driverName = driver?.name;
  }
  // Fecha del movimiento. Defensa: NINGÚN movimiento puede quedar fechado en el
  // futuro (eso lo sacaría del "esperado de hoy" y el dinero parecería no existir).
  // Si por una zona horaria mal calculada en el cliente llega una fecha futura, se
  // ajusta a "ahora". El back-dating al pasado sí se respeta (corrección manual).
  const now = new Date();
  let when = data.date ? new Date(data.date) : now;
  if (Number.isNaN(when.getTime()) || when.getTime() > now.getTime()) when = now;

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
  const original = await prisma.bankTransaction.findUnique({ where: { id } });
  if (!original) return;
  // Movimiento mixto: hay que revertir/eliminar ambas mitades enlazadas.
  const rows = original.groupId
    ? await prisma.bankTransaction.findMany({ where: { groupId: original.groupId } })
    : [original];

  await prisma.$transaction(async (tx) => {
    for (const row of rows) {
      // Si este movimiento se usó para descontar la deuda de un domiciliario
      // (noCounterpart + driverId, vía applyBankToDriver), hay que revertir esa
      // deuda y limpiar los registros contables subsidiarios que se crearon junto
      // a él — igual que hace edit-request.service.ts al aprobar una eliminación.
      if (row.driverId && row.noCounterpart && row.type === "ingreso") {
        await tx.driver.update({
          where: { id: row.driverId },
          data: { pendingDebt: { increment: row.amount } },
        });
        // Búsqueda por ID (bankTransactionId), sin ambigüedad. Se mantiene un
        // respaldo por ventana de fecha ±5s SOLO para registros viejos creados
        // antes de que existiera el enlace directo (bankTransactionId=null) —
        // antes ESTA era la única forma de buscarlos y fallaba si el
        // BankTransaction tenía una fecha distinta a "ahora" (p. ej. backdateado),
        // dejando "pagos" huérfanos que inflaban base pagada sin bajar la deuda.
        const window = { gte: new Date(row.date.getTime() - 5000), lte: new Date(row.date.getTime() + 5000) };
        await tx.baseTransaction.deleteMany({
          where: {
            driverId: row.driverId,
            type: "pago",
            notes: { startsWith: BANK_LINKED_BASE_PREFIX },
            OR: [{ bankTransactionId: row.id }, { bankTransactionId: null, date: window }],
          },
        });
        await tx.driverPayment.deleteMany({
          where: {
            driverId: row.driverId,
            notes: { startsWith: BANK_LINKED_PAYMENT_NOTE },
            OR: [{ bankTransactionId: row.id }, { bankTransactionId: null, date: window }],
          },
        });
      }
    }
    if (original.groupId) {
      await tx.bankTransaction.deleteMany({ where: { groupId: original.groupId } });
    } else {
      await tx.bankTransaction.delete({ where: { id } });
    }
  });
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
