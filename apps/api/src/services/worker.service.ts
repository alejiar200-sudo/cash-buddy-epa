import type { CreateWorkerRequest, UpdateWorkerRequest, Worker } from "@cash-buddy/shared";
import { prisma } from "../lib/prisma";
import { notFound } from "../lib/errors";
import { toWorker } from "./mappers";

const PALETTE = [
  "#00E676", "#00B0FF", "#FFB300", "#FF7043", "#AB47BC",
  "#26C6DA", "#EC407A", "#9CCC65", "#FFCA28", "#5C6BC0",
  "#FF5252", "#66BB6A", "#42A5F5", "#FFA726",
];

export async function listWorkers(): Promise<Worker[]> {
  const rows = await prisma.worker.findMany({ orderBy: { createdAt: "asc" } });
  return rows.map(toWorker);
}

export async function createWorker(input: CreateWorkerRequest): Promise<Worker> {
  const count = await prisma.worker.count();
  const color = input.color ?? PALETTE[count % PALETTE.length];
  const row = await prisma.worker.create({
    data: { name: input.name, role: input.role, active: input.active, color },
  });
  return toWorker(row);
}

export async function updateWorker(id: string, patch: UpdateWorkerRequest): Promise<Worker> {
  const exists = await prisma.worker.findUnique({ where: { id } });
  if (!exists) throw notFound("Trabajador no encontrado");
  const row = await prisma.worker.update({ where: { id }, data: patch });
  return toWorker(row);
}

export async function deleteWorker(id: string): Promise<void> {
  const exists = await prisma.worker.findUnique({ where: { id } });
  if (!exists) throw notFound("Trabajador no encontrado");
  // Los movimientos asociados quedan con workerId = null (onDelete: SetNull).
  await prisma.worker.delete({ where: { id } });
}
