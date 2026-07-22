/**
 * ⚠️ OBSOLETO — NO EJECUTAR. Este script CORROMPE el saldo de los domiciliarios.
 *
 * Su fórmula (neto = comisión + basesEntregadas − basesDevueltas − pagos) quedó
 * desactualizada cuando se introdujo el pago de deuda vía movimiento bancario
 * (debtApplied) y los registros "bank-linked":
 *   - Resta TODOS los `driverPayment` y las `baseTransaction` tipo "pago", incluidas
 *     las bank-linked, que son contabilidad interna de un BankTransaction ya contado
 *     en `debtApplied`. Resultado: DOBLE conteo (resta el mismo pago dos veces).
 *   - Ignora `debtApplied` y los egresos (pago de crédito), así que además resucita
 *     créditos ya pagados.
 * Correr esto hoy dejaría a casi todos los domiciliarios con un crédito/deuda falso
 * (verificado: en los datos actuales daría descuadres de decenas de miles por persona).
 *
 * La forma correcta de mantener el saldo NO es un recompute masivo, sino que cada
 * escritura netee el delta con `applyDebtDelta()` (driver.service.ts). Un recompute
 * fiable tendría que replicar TODA la semántica de BankTransaction (debtApplied,
 * egresos, contrapartes, splits) — por eso este atajo por fórmula no sirve.
 *
 * Se deja el código como referencia histórica, pero aborta antes de tocar nada.
 */
import { prisma } from "../src/lib/prisma";

const money = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");

async function main() {
  throw new Error(
    "recalc-debts.ts está OBSOLETO y corrompe saldos (doble conteo de pagos bank-linked, " +
    "ignora debtApplied/egresos). No lo ejecutes. Ver el comentario de cabecera."
  );
  // eslint-disable-next-line no-unreachable
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
