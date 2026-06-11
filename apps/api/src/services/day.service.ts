import type { Arqueo, DayData } from "@cash-buddy/shared";
import { prisma } from "../lib/prisma";
import { balancesAtEndOfDay } from "./calc";
import { toDayData, toMovement } from "./mappers";
import { getSettings } from "./settings.service";

// Garantiza que exista el registro del día, arrastrando saldos del día previo.
// Equivale a ensureDay() del store original.
export async function ensureDay(date: string): Promise<DayData> {
  const existing = await prisma.day.findUnique({
    where: { date },
    include: { movements: { orderBy: { createdAt: "asc" } } },
  });
  if (existing) return toDayData(existing);

  const settings = await getSettings();
  let initialCash = settings.initialCash;
  let initialBank = settings.initialBank;

  // Buscar el día previo más reciente con datos.
  const prev = await prisma.day.findFirst({
    where: { date: { lt: date } },
    orderBy: { date: "desc" },
    include: { movements: true },
  });
  if (prev) {
    const bal = balancesAtEndOfDay(
      prev.movements.map(toMovement),
      prev.initialCash,
      prev.initialBank,
    );
    initialCash = bal.cash;
    initialBank = bal.bank;
  }

  const created = await prisma.day.create({
    data: { date, initialCash, initialBank },
    include: { movements: true },
  });
  return toDayData(created);
}

/**
 * Saldo de apertura (efectivo y banco) para una fecha, ACUMULANDO desde el día
 * previo. El mes arranca con el capital inicial (Settings) y cada día abre con el
 * cierre del día anterior; el dinero se va sumando, no se reinicia diariamente.
 */
export async function getOpeningBalance(date: string): Promise<{ cash: number; bank: number }> {
  // Si el día ya existe, su initialCash/Bank ya es el arrastre.
  const existing = await prisma.day.findUnique({ where: { date } });
  if (existing) return { cash: existing.initialCash, bank: existing.initialBank };

  // Si no existe, calcular desde el último día previo con datos.
  const prev = await prisma.day.findFirst({
    where: { date: { lt: date } },
    orderBy: { date: "desc" },
    include: { movements: true },
  });
  if (prev) {
    const bal = balancesAtEndOfDay(prev.movements.map(toMovement), prev.initialCash, prev.initialBank);
    return { cash: bal.cash, bank: bal.bank };
  }

  // No hay historial: usar el capital inicial configurado.
  const settings = await getSettings();
  return { cash: settings.initialCash, bank: settings.initialBank };
}

export async function getDay(date: string): Promise<DayData> {
  const day = await prisma.day.findUnique({
    where: { date },
    include: { movements: { orderBy: { createdAt: "asc" } } },
  });
  if (day) return toDayData(day);
  // No persiste si no existe: devuelve un día efímero con saldos por defecto.
  return ensureDay(date);
}

export async function listDays(): Promise<DayData[]> {
  // Acota a los últimos ~90 días para no inflar memoria con todo el histórico
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const days = await prisma.day.findMany({
    where: { date: { gte: cutoffStr } },
    orderBy: { date: "asc" },
    include: { movements: { orderBy: { createdAt: "asc" } } },
  });
  return days.map(toDayData);
}

export async function updateArqueo(
  date: string,
  slot: "AM" | "PM" | "close",
  arqueo: Arqueo,
): Promise<DayData> {
  await ensureDay(date);
  const field = slot === "AM" ? "arqueoAM" : slot === "PM" ? "arqueoPM" : "arqueoClose";
  const updated = await prisma.day.update({
    where: { date },
    data: { [field]: arqueo },
    include: { movements: { orderBy: { createdAt: "asc" } } },
  });
  return toDayData(updated);
}
