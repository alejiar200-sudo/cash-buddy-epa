import { prisma } from "../lib/prisma";
import { notFound } from "../lib/errors";

export async function listClients(activeOnly = false) {
  return prisma.client.findMany({
    where: activeOnly ? { active: true } : undefined,
    include: {
      debts: {
        where: { paid: false },
        orderBy: { createdAt: "desc" },
      },
    },
    orderBy: { name: "asc" },
  });
}

export async function getClient(id: string) {
  const c = await prisma.client.findUnique({
    where: { id },
    include: {
      debts: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!c) throw notFound("Cliente no encontrado");
  return c;
}

export async function createClient(data: {
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  initialDebt?: number;
  initialDebtDescription?: string;
}) {
  const { initialDebt, initialDebtDescription, ...clientData } = data;

  const client = await prisma.client.create({ data: clientData });

  // Si hay deuda inicial, registrarla y reflejarla en el saldo
  if (initialDebt && initialDebt > 0) {
    await prisma.$transaction([
      prisma.clientDebt.create({
        data: {
          clientId: client.id,
          description: initialDebtDescription?.trim() || "Deuda inicial",
          amount: Math.round(initialDebt),
        },
      }),
      prisma.client.update({
        where: { id: client.id },
        data: { pendingDebt: { increment: Math.round(initialDebt) } },
      }),
    ]);
  }

  return prisma.client.findUnique({
    where: { id: client.id },
    include: { debts: { where: { paid: false }, orderBy: { createdAt: "desc" } } },
  });
}

export async function updateClient(id: string, data: Partial<{
  name: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  active: boolean;
}>) {
  return prisma.client.update({ where: { id }, data });
}

export async function addDebt(clientId: string, description: string, amount: number, date?: string, actor?: { id?: string | null; name?: string | null }) {
  const [debt] = await prisma.$transaction([
    prisma.clientDebt.create({
      data: { clientId, description, amount, createdBy: actor?.id ?? null, createdByName: actor?.name ?? null, ...(date ? { createdAt: new Date(date + "T12:00:00") } : {}) },
    }),
    prisma.client.update({
      where: { id: clientId },
      data: { pendingDebt: { increment: amount } },
    }),
  ]);
  return debt;
}

export async function payDebt(debtId: string, paidAmount?: number) {
  const debt = await prisma.clientDebt.findUnique({ where: { id: debtId } });
  if (!debt) throw notFound("Deuda no encontrada");
  if (debt.paid) throw new Error("Esta deuda ya fue pagada");

  const actual = paidAmount ?? debt.amount;
  await prisma.$transaction([
    prisma.clientDebt.update({
      where: { id: debtId },
      data: { paid: true, paidAt: new Date(), paidAmount: actual },
    }),
    prisma.client.update({
      where: { id: debt.clientId },
      data: { pendingDebt: { decrement: debt.amount } },
    }),
  ]);
  return { ok: true };
}

/**
 * Registra un abono parcial al saldo total del cliente.
 * Se aplica sobre las deudas pendientes más antiguas primero (FIFO).
 * Si `payAll` es true, liquida toda la deuda pendiente.
 */
export async function registerClientPayment(
  clientId: string,
  amount: number,
  payAll = false,
  medium: "cash" | "bank" = "cash",
  opts?: { cashAmount?: number; bankAmount?: number; actor?: { id?: string | null; name?: string | null } },
) {
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) throw notFound("Cliente no encontrado");

  const totalPending = client.pendingDebt;
  if (totalPending <= 0) throw new Error("El cliente no tiene deuda pendiente");

  // Movimiento mixto (#3): efectivo + transferencia en un mismo abono.
  const cashIn = Math.round(opts?.cashAmount ?? 0);
  const bankIn = Math.round(opts?.bankAmount ?? 0);
  const isMixed = cashIn > 0 && bankIn > 0;
  const requested = isMixed ? cashIn + bankIn : (payAll ? totalPending : Math.round(amount));

  let toApply = payAll ? totalPending : Math.min(requested, totalPending);
  if (toApply <= 0) throw new Error("El monto del abono debe ser mayor a 0");

  // Bolsas de medio de pago para repartir en FIFO.
  let cashPool = isMixed ? cashIn : (medium === "cash" ? toApply : 0);
  let bankPool = isMixed ? bankIn : (medium === "bank" ? toApply : 0);

  const debts = await prisma.clientDebt.findMany({
    where: { clientId, paid: false },
    orderBy: { createdAt: "asc" },
  });

  const applied = toApply;
  const ops: ReturnType<typeof prisma.clientDebt.update>[] = [];

  for (const debt of debts) {
    if (toApply <= 0) break;
    const remaining = debt.amount - (debt.paidAmount ?? 0);
    const apply = Math.min(toApply, remaining);
    // Reparte este tramo entre efectivo y banco según las bolsas disponibles.
    const cashPart = Math.min(apply, cashPool);
    const bankPart = apply - cashPart;
    cashPool -= cashPart;
    bankPool -= bankPart;
    const newPaid = (debt.paidAmount ?? 0) + apply;
    const fullyPaid = newPaid >= debt.amount;
    ops.push(
      prisma.clientDebt.update({
        where: { id: debt.id },
        data: {
          paidAmount: newPaid,
          paid: fullyPaid,
          paidAt: fullyPaid ? new Date() : null,
          paidBy: opts?.actor?.id ?? null,
          paidByName: opts?.actor?.name ?? null,
          ...(cashPart > 0 ? { paidCash: { increment: cashPart } } : {}),
          ...(bankPart > 0 ? { paidBank: { increment: bankPart } } : {}),
        },
      }),
    );
    toApply -= apply;
  }

  await prisma.$transaction([
    ...ops,
    prisma.client.update({
      where: { id: clientId },
      data: { pendingDebt: { decrement: applied } },
    }),
  ]);

  return { applied, remaining: totalPending - applied };
}

export async function getDebtors() {
  return prisma.client.findMany({
    where: { pendingDebt: { gt: 0 }, active: true },
    include: { debts: { where: { paid: false }, orderBy: { createdAt: "asc" } } },
    orderBy: { pendingDebt: "desc" },
  });
}

export async function deleteClient(id: string) {
  await prisma.client.delete({ where: { id } });
}
