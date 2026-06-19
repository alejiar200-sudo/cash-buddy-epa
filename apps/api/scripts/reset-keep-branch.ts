/**
 * Reset operativo CONSERVANDO sucursales (con su API Key), usuarios y configuración.
 *
 * Conserva: User (contraseñas), Settings, Branch (apiKeyEnc intacta).
 * Borra: todo lo operativo (pedidos, domiciliarios, pagos, bases, deudas, banco,
 *        movimientos, cierres, días, trabajadores, stats, notas, solicitudes).
 * Deja cada sucursal con ordersSince = HOY (Bogotá) para que, al reiniciar el
 * backend, solo se carguen los pedidos de HOY en adelante.
 *
 * NO llama a Shipday: es puro trabajo de base de datos. La carga de los pedidos
 * de hoy la hace el backend (ya con el código corregido) al reiniciarse.
 *
 * Uso: npx tsx scripts/reset-keep-branch.ts
 */
import { prisma } from "../src/lib/prisma";

function todayBogotaDate(): Date {
  const ymd = new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
  return new Date(`${ymd}T00:00:00.000-05:00`);
}

async function main() {
  console.log("=== RESET CONSERVANDO SUCURSALES + USUARIOS ===\n");

  const branchesBefore = await prisma.branch.findMany({ select: { id: true, name: true, apiKeyEnc: true } });
  console.log(`Sucursales a CONSERVAR (con su API Key): ${branchesBefore.length}`);
  for (const b of branchesBefore) console.log(`   • ${b.name} (${b.id}) — apiKey ${b.apiKeyEnc ? "presente ✓" : "VACÍA ⚠"}`);
  const users = await prisma.user.count();
  console.log(`Usuarios a CONSERVAR: ${users}\n`);

  // Borrado en orden de dependencias (hijos antes que padres), SIN tocar Branch.
  const steps: [string, () => Promise<unknown>][] = [
    ["ClientDebt", () => prisma.clientDebt.deleteMany({})],
    ["Client", () => prisma.client.deleteMany({})],
    ["DailyDriverStat", () => prisma.dailyDriverStat.deleteMany({})],
    ["DriverPayment", () => prisma.driverPayment.deleteMany({})],
    ["BaseTransaction", () => prisma.baseTransaction.deleteMany({})],
    ["ShipdayOrder", () => prisma.shipdayOrder.deleteMany({})],
    ["Driver", () => prisma.driver.deleteMany({})],
    ["ShiftClose", () => prisma.shiftClose.deleteMany({})],
    ["BankTransaction", () => prisma.bankTransaction.deleteMany({})],
    ["MonthlyClose", () => prisma.monthlyClose.deleteMany({})],
    ["Conversion", () => prisma.conversion.deleteMany({})],
    ["EditRequest", () => prisma.editRequest.deleteMany({})],
    ["FieldNote", () => prisma.fieldNote.deleteMany({})],
    ["Movement", () => prisma.movement.deleteMany({})],
    ["Day", () => prisma.day.deleteMany({})],
    ["Worker", () => prisma.worker.deleteMany({})],
  ];
  for (const [name, fn] of steps) {
    const r = (await fn()) as { count?: number };
    console.log(`  ✓ ${name} borrado (${r.count ?? 0})`);
  }

  // Dejar cada sucursal lista para cargar SOLO desde hoy.
  const since = todayBogotaDate();
  const upd = await prisma.branch.updateMany({
    data: { ordersSince: since, syncStatus: "never", syncMessage: null, lastSyncAt: null },
  });
  console.log(`\n  ✓ ${upd.count} sucursal(es) con ordersSince = ${since.toISOString()} (hoy 00:00 Bogotá)`);

  console.log("  ✓ Branch CONSERVADO (API Key intacta)");
  console.log("  ✓ Settings CONSERVADO");
  console.log(`  ✓ Users CONSERVADOS: ${users}`);
  console.log("\n✅ Base limpia. Reinicia el backend: cargará automáticamente los pedidos de HOY.");
}

main()
  .catch((e) => { console.error("ERROR:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
