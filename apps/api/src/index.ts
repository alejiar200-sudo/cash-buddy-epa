// Fija la zona horaria del proceso a Bogotá ANTES de cualquier otro import.
// Salvaguarda adicional: aunque los servicios usan helpers explícitos de
// apps/api/src/lib/date-range.ts, esto evita que cualquier `new Date()` local
// que quede suelto (hoy o en el futuro) se calcule en la TZ del sistema operativo.
process.env.TZ = "America/Bogota";

import path from "node:path";
import fs from "node:fs";
import { env } from "./config/env";
import { createServer } from "./server";
import { prisma } from "./lib/prisma";
import { autoInit } from "./services/auto-init.service";
import { startSyncScheduler } from "./services/sync-scheduler.service";
import { scheduleOrderCleanup } from "./services/order-cleanup.service";

// Resuelve la carpeta del frontend estático.
// 1) WEB_DIR explícito  2) apps/web/out relativo al monorepo
function resolveWebDir(): string | undefined {
  if (env.webDir && fs.existsSync(env.webDir)) return env.webDir;
  const candidate = path.resolve(process.cwd(), "../web/out");
  if (fs.existsSync(candidate)) return candidate;
  const candidate2 = path.resolve(__dirname, "../../web/out");
  if (fs.existsSync(candidate2)) return candidate2;
  return undefined;
}

async function main() {
  // Auto-inicialización idempotente: en un PC nuevo aplica el esquema y crea
  // admin + domiciliarios por defecto si la BD está vacía.
  await autoInit();

  const webDir = resolveWebDir();
  const app = createServer({ webDir });

  const server = app.listen(env.port, env.host, () => {
    console.log(`\n  Cash Buddy EPA API`);
    console.log(`  ➜ Local:   http://localhost:${env.port}`);
    console.log(`  ➜ Red:     http://${env.host}:${env.port}  (accesible vía Tailscale)`);
    if (webDir) console.log(`  ➜ Frontend servido desde: ${webDir}`);
    else console.log(`  ⚠ Frontend estático no encontrado (solo API). Ejecuta el build de web.`);
  });

  startSyncScheduler();
  scheduleOrderCleanup();

  const shutdown = async () => {
    console.log("\n  Cerrando servidor...");
    server.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("Error al iniciar el servidor:", err);
  process.exit(1);
});
