/**
 * Script de un solo uso: recalcula DailyDriverStat (contador denormalizado de
 * orderCount/totalValue/companyTotal por día+domiciliario) directamente desde
 * ShipdayOrder, usando la fecha de Bogotá (toBogotaDateStr) como llave.
 *
 * Corrige el desfase histórico documentado en correcciones-pendientes.md (#1),
 * causado por usar antes el día UTC como llave. NO toca Driver.pendingDebt
 * (ese contador ya está correcto, confirmado por scripts/audit.ts).
 *
 * Uso:  npm run recalc-stats   (desde apps/api)
 */
import { prisma } from "../src/lib/prisma";
import { toBogotaDateStr } from "../src/lib/date-range";

const DELIVERED = ["DELIVERED", "COMPLETED"];

async function main() {
  // 1) Leer todos los pedidos entregados con domiciliario asignado.
  const orders = await prisma.shipdayOrder.findMany({
    where: { status: { in: DELIVERED }, driverId: { not: null }, deliveredAt: { not: null } },
    select: { driverId: true, branchId: true, deliveryValue: true, companyAmount: true, deliveredAt: true },
  });

  // 2) Agrupar por (fechaBogotá, driverId) → totales reales.
  type Agg = { date: string; branchId: string; driverId: string; orderCount: number; totalValue: number; companyTotal: number };
  const map = new Map<string, Agg>();
  for (const o of orders) {
    if (!o.driverId || !o.deliveredAt) continue;
    const date = toBogotaDateStr(o.deliveredAt);
    const key = `${date}__${o.driverId}`;
    const cur = map.get(key) ?? { date, branchId: o.branchId, driverId: o.driverId, orderCount: 0, totalValue: 0, companyTotal: 0 };
    cur.orderCount += 1;
    cur.totalValue += o.deliveryValue;
    cur.companyTotal += o.companyAmount;
    map.set(key, cur);
  }

  // 3) Reconstruir la tabla: borrar el cache viejo y recrearlo desde la verdad.
  const before = await prisma.dailyDriverStat.count();
  await prisma.$transaction([
    prisma.dailyDriverStat.deleteMany({}),
    ...[...map.values()].map(a =>
      prisma.dailyDriverStat.create({
        data: {
          date: a.date,
          branchId: a.branchId,
          driverId: a.driverId,
          orderCount: a.orderCount,
          totalValue: a.totalValue,
          companyTotal: a.companyTotal,
        },
      }),
    ),
  ]);

  console.log(`[recalc] Pedidos entregados procesados: ${orders.length}`);
  console.log(`[recalc] Filas DailyDriverStat: ${before} (antes) → ${map.size} (recalculadas desde la verdad)`);
  console.log("[recalc] Driver.pendingDebt NO se modificó (ya estaba correcto).");
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error("[recalc] Error:", e); process.exit(1); });
