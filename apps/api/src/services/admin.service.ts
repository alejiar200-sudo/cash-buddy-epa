import { prisma } from "../lib/prisma";

// Reinicia los datos operativos: borra movimientos y días, y marca la
// configuración como no completada (vuelve al asistente de bienvenida).
// No borra usuarios ni trabajadores.
export async function resetAll(): Promise<void> {
  await prisma.$transaction([
    prisma.movement.deleteMany({}),
    prisma.day.deleteMany({}),
    prisma.settings.upsert({
      where: { id: "singleton" },
      update: { setupComplete: false },
      create: { id: "singleton", setupComplete: false },
    }),
  ]);
}
