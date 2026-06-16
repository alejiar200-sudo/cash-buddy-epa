/**
 * Auditoría de integridad — solo lectura, no corrige nada automáticamente.
 *
 * Compara los saldos denormalizados (Driver.pendingDebt, Client.pendingDebt)
 * contra la suma real de los movimientos que los componen, y detecta
 * duplicados/huérfanos típicos de los problemas reportados (pedidos que no
 * cuadran, deudas que no bajaron, contabilidad desviada).
 *
 * Uso: npm run audit   (desde apps/api)
 */
import { prisma } from "../src/lib/prisma";

async function auditDrivers() {
  console.log("\n=== Domiciliarios: pendingDebt vs. movimientos reales ===");
  const drivers = await prisma.driver.findMany({ select: { id: true, name: true, pendingDebt: true } });
  let mismatches = 0;

  for (const d of drivers) {
    const [ordersAgg, baseGivenAgg, basePaidAgg, paymentsAgg] = await Promise.all([
      prisma.shipdayOrder.aggregate({ where: { driverId: d.id, status: { in: ["DELIVERED", "COMPLETED"] } }, _sum: { companyAmount: true } }),
      prisma.baseTransaction.aggregate({ where: { driverId: d.id, type: "entrega" }, _sum: { amount: true } }),
      prisma.baseTransaction.aggregate({ where: { driverId: d.id, type: "pago" }, _sum: { amount: true } }),
      prisma.driverPayment.aggregate({ where: { driverId: d.id }, _sum: { amount: true } }),
    ]);
    const commission = ordersAgg._sum.companyAmount ?? 0;
    const baseGiven = baseGivenAgg._sum.amount ?? 0;
    const basePaid = basePaidAgg._sum.amount ?? 0;
    const payments = paymentsAgg._sum.amount ?? 0;
    const expected = commission + baseGiven - basePaid - payments;

    if (expected !== d.pendingDebt) {
      mismatches++;
      console.log(
        `  ✗ ${d.name} (${d.id}): pendingDebt=${d.pendingDebt} vs esperado=${expected} ` +
        `(comisión=${commission} + base_entregada=${baseGiven} - base_pagada=${basePaid} - pagos=${payments}) ` +
        `→ diferencia ${d.pendingDebt - expected}`,
      );
    }
  }
  console.log(mismatches === 0 ? "  ✓ Todos los domiciliarios cuadran." : `  ${mismatches} domiciliario(s) con descuadre.`);
}

async function auditClients() {
  console.log("\n=== Clientes: pendingDebt vs. ClientDebt pendientes ===");
  const clients = await prisma.client.findMany({ select: { id: true, name: true, pendingDebt: true } });
  let mismatches = 0;

  for (const c of clients) {
    const debts = await prisma.clientDebt.findMany({ where: { clientId: c.id } });
    const expected = debts.reduce((s, d) => s + (d.amount - (d.paidAmount ?? 0)), 0);
    if (expected !== c.pendingDebt) {
      mismatches++;
      console.log(`  ✗ ${c.name} (${c.id}): pendingDebt=${c.pendingDebt} vs esperado=${expected} → diferencia ${c.pendingDebt - expected}`);
    }
  }
  console.log(mismatches === 0 ? "  ✓ Todos los clientes cuadran." : `  ${mismatches} cliente(s) con descuadre.`);
}

async function auditDuplicateOrders() {
  console.log("\n=== Pedidos: shipdayOrderId duplicados ===");
  const dups = await prisma.$queryRawUnsafe<{ shipdayOrderId: string; count: bigint }[]>(
    `SELECT "shipdayOrderId", COUNT(*) as count FROM "ShipdayOrder" GROUP BY "shipdayOrderId" HAVING COUNT(*) > 1`,
  );
  if (dups.length === 0) console.log("  ✓ Sin duplicados.");
  else for (const d of dups) console.log(`  ✗ shipdayOrderId=${d.shipdayOrderId} aparece ${d.count} veces`);
}

async function auditOrphanStats() {
  console.log("\n=== Pedidos entregados con domiciliario sin reflejo en DailyDriverStat ===");
  const orders = await prisma.shipdayOrder.findMany({
    where: { status: { in: ["DELIVERED", "COMPLETED"] }, driverId: { not: null } },
    select: { driverId: true, deliveredAt: true },
  });
  const byKey = new Map<string, number>();
  for (const o of orders) {
    if (!o.driverId || !o.deliveredAt) continue;
    const dateStr = o.deliveredAt.toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
    const key = `${dateStr}__${o.driverId}`;
    byKey.set(key, (byKey.get(key) ?? 0) + 1);
  }
  let missing = 0;
  for (const [key, count] of byKey) {
    const [date, driverId] = key.split("__");
    const stat = await prisma.dailyDriverStat.findUnique({ where: { date_driverId: { date, driverId } } });
    if (!stat || stat.orderCount < count) {
      missing++;
      console.log(`  ✗ driverId=${driverId} fecha=${date}: ${count} pedido(s) entregados pero DailyDriverStat.orderCount=${stat?.orderCount ?? 0}`);
    }
  }
  console.log(missing === 0 ? "  ✓ Sin huérfanos." : `  ${missing} combinación(es) día+domiciliario con huérfanos.`);
}

async function main() {
  await auditDrivers();
  await auditClients();
  await auditDuplicateOrders();
  await auditOrphanStats();
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
