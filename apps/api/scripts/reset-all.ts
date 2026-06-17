/**
 * Reset total del sistema: borra todos los datos operativos.
 * Conserva: User (con contraseñas), Settings.
 * Borra todo lo demás.
 *
 * Uso: npm run reset-all   (o: npx tsx scripts/reset-all.ts)
 */
import { prisma } from "../src/lib/prisma";

async function main() {
  console.log("=== RESET TOTAL DEL SISTEMA ===\n");

  // Orden respetando dependencias (hijos antes que padres)
  await prisma.clientDebt.deleteMany({});
  console.log("  ✓ ClientDebt");

  await prisma.client.deleteMany({});
  console.log("  ✓ Client");

  await prisma.dailyDriverStat.deleteMany({});
  console.log("  ✓ DailyDriverStat");

  await prisma.driverPayment.deleteMany({});
  console.log("  ✓ DriverPayment");

  await prisma.baseTransaction.deleteMany({});
  console.log("  ✓ BaseTransaction");

  await prisma.shipdayOrder.deleteMany({});
  console.log("  ✓ ShipdayOrder");

  await prisma.driver.deleteMany({});
  console.log("  ✓ Driver");

  await prisma.shiftClose.deleteMany({});
  console.log("  ✓ ShiftClose");

  await prisma.bankTransaction.deleteMany({});
  console.log("  ✓ BankTransaction");

  await prisma.monthlyClose.deleteMany({});
  console.log("  ✓ MonthlyClose");

  await prisma.conversion.deleteMany({});
  console.log("  ✓ Conversion");

  await prisma.editRequest.deleteMany({});
  console.log("  ✓ EditRequest");

  await prisma.fieldNote.deleteMany({});
  console.log("  ✓ FieldNote");

  await prisma.movement.deleteMany({});
  console.log("  ✓ Movement");

  await prisma.day.deleteMany({});
  console.log("  ✓ Day");

  await prisma.worker.deleteMany({});
  console.log("  ✓ Worker");

  await prisma.branch.deleteMany({});
  console.log("  ✓ Branch");

  // Settings se conserva intacto (nombre empresa, logo, etc.)
  console.log("  ✓ Settings (conservado — nombre empresa y configuración intactos)");

  // Users se conservan intactos
  const users = await prisma.user.count();
  console.log(`\n  ✓ Users conservados: ${users} usuario(s) con sus contraseñas`);

  console.log("\n✅ Sistema limpio. Listo para empezar desde cero.");
}

main()
  .catch(e => { console.error("ERROR:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
