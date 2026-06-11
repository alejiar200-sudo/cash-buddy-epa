import { prisma } from "../lib/prisma";
import { notFound, badRequest } from "../lib/errors";

export async function listConversions(branchId?: string, from?: string, to?: string) {
  const where: Record<string, unknown> = {};
  if (branchId) where.branchId = branchId;
  if (from || to) {
    where.date = {};
    if (from) (where.date as Record<string, unknown>).gte = new Date(from);
    if (to) (where.date as Record<string, unknown>).lte = new Date(to + "T23:59:59");
  }
  return prisma.conversion.findMany({
    where,
    include: { branch: { select: { id: true, name: true } } },
    orderBy: { date: "desc" },
  });
}

export async function createConversion(input: {
  branchId: string;
  amount: number;
  type: "banco_a_efectivo" | "efectivo_a_banco";
  notes?: string;
  userId?: string;
  userName?: string;
  driverId?: string;
  date?: string;
}) {
  const branch = await prisma.branch.findUnique({ where: { id: input.branchId } });
  if (!branch) throw notFound("Sucursal no encontrada");
  if (input.amount <= 0) throw badRequest("El monto debe ser mayor a 0");

  // El domiciliario es solo informativo: NO altera su deuda.
  let driverName: string | undefined;
  if (input.driverId) {
    const driver = await prisma.driver.findUnique({ where: { id: input.driverId } });
    driverName = driver?.name;
  }

  return prisma.conversion.create({
    data: {
      branchId: input.branchId,
      amount: input.amount,
      type: input.type,
      notes: input.notes,
      userId: input.userId,
      userName: input.userName,
      driverId: input.driverId,
      driverName,
      date: input.date ? new Date(input.date) : new Date(),
    },
    include: { branch: { select: { id: true, name: true } } },
  });
}

export async function deleteConversion(id: string) {
  const exists = await prisma.conversion.findUnique({ where: { id } });
  if (!exists) throw notFound("Conversión no encontrada");
  await prisma.conversion.delete({ where: { id } });
}
