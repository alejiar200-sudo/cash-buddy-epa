/**
 * Recalcula la deuda/crédito de cada domiciliario desde sus registros (verdad
 * única), corrigiendo estados donde deuda y crédito quedaron ambos positivos por
 * no netear (bug histórico). Es el mismo cálculo canónico que usa startOrdersFromToday:
 *   neto = comisión(pedidos) + basesEntregadas − basesDevueltas − pagos
 *   pendingDebt = max(0, neto)   creditAmount = max(0, −neto)
 *
 * No toca pedidos, pagos ni bases: solo el saldo derivado del domiciliario.
 *
 * Uso: npx tsx scripts/recalc-debts.ts
 */
import { prisma } from "../src/lib/prisma";

const money = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");

async function main() {
  const drivers = await prisma.driver.findMany({ select: { id: true, name: true, pendingDebt: true, creditAmount: true } });
  console.log(`Recalculando ${drivers.length} domiciliarios...\n`);
  let changed = 0;
  for (const d of drivers) {
    const [ord, baseGiven, basePaid, pay] = await Promise.all([
      prisma.shipdayOrder.aggregate({ where: { driverId: d.id }, _sum: { companyAmount: true } }),
      prisma.baseTransaction.aggregate({ where: { driverId: d.id, type: "entrega" }, _sum: { amount: true } }),
      prisma.baseTransaction.aggregate({ where: { driverId: d.id, type: "pago" }, _sum: { amount: true } }),
      prisma.driverPayment.aggregate({ where: { driverId: d.id }, _sum: { amount: true } }),
    ]);
    const net = (ord._sum.companyAmount ?? 0) + (baseGiven._sum.amount ?? 0) - (basePaid._sum.amount ?? 0) - (pay._sum.amount ?? 0);
    const newDebt = net > 0 ? net : 0;
    const newCredit = net < 0 ? -net : 0;
    if (newDebt !== d.pendingDebt || newCredit !== (d.creditAmount ?? 0)) {
      await prisma.driver.update({
        where: { id: d.id },
        data: { pendingDebt: newDebt, creditAmount: newCredit, creditMedium: newCredit > 0 ? undefined : null },
      });
      console.log(`  ↻ ${d.name}: deuda ${money(d.pendingDebt)}→${money(newDebt)} | crédito ${money(d.creditAmount ?? 0)}→${money(newCredit)}`);
      changed++;
    }
  }
  console.log(`\n✅ Listo. ${changed} domiciliario(s) corregido(s).`);
}

main().catch((e) => { console.error("ERROR:", e); process.exit(1); }).finally(() => prisma.$disconnect());
