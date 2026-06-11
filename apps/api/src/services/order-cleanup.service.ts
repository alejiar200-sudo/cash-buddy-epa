import { prisma } from "../lib/prisma";

/**
 * Elimina datos históricos de más de 2 meses para mantener el sistema liviano.
 *
 * SE ELIMINA (histórico transaccional):
 *   - ShipdayOrder (pedidos entregados)
 *   - Movement (movimientos de caja)
 *   - BankTransaction (transacciones bancarias)
 *   - DriverPayment (pagos a domiciliarios)
 *   - BaseTransaction (bases entregadas/cobradas)
 *   - ClientDebt pagadas (deudas ya saldadas)
 *   - DailyDriverStat (estadísticas diarias)
 *   - ShiftClose (cierres de turno)
 *   - Conversion (conversiones efectivo↔banco)
 *
 * NO SE ELIMINA (datos maestros permanentes):
 *   - Driver, Worker, Client, Branch, User, Settings
 *   - MonthlyClose (cierres mensuales — archivo histórico)
 *   - ClientDebt pendientes (deudas sin pagar)
 */
export async function deleteOldData(): Promise<Record<string, number>> {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 2);
  cutoff.setHours(0, 0, 0, 0);

  const [
    orders,
    movements,
    bankTxs,
    driverPayments,
    baseTxs,
    clientDebts,
    dailyStats,
    shiftCloses,
    conversions,
  ] = await Promise.all([
    prisma.shipdayOrder.deleteMany({ where: { createdAt: { lt: cutoff } } }),
    prisma.movement.deleteMany({ where: { createdAt: { lt: cutoff } } }),
    prisma.bankTransaction.deleteMany({ where: { createdAt: { lt: cutoff } } }),
    prisma.driverPayment.deleteMany({ where: { date: { lt: cutoff } } }),
    prisma.baseTransaction.deleteMany({ where: { date: { lt: cutoff } } }),
    // Solo deudas ya pagadas — las pendientes se conservan
    prisma.clientDebt.deleteMany({ where: { paid: true, paidAt: { lt: cutoff } } }),
    prisma.dailyDriverStat.deleteMany({
      where: {
        date: { lt: cutoff.toISOString().slice(0, 10) }
      }
    }),
    prisma.shiftClose.deleteMany({
      where: {
        date: { lt: cutoff.toISOString().slice(0, 10) }
      }
    }),
    prisma.conversion.deleteMany({ where: { date: { lt: cutoff } } }),
  ]);

  return {
    orders: orders.count,
    movements: movements.count,
    bankTransactions: bankTxs.count,
    driverPayments: driverPayments.count,
    baseTransactions: baseTxs.count,
    clientDebts: clientDebts.count,
    dailyStats: dailyStats.count,
    shiftCloses: shiftCloses.count,
    conversions: conversions.count,
  };
}

export function scheduleOrderCleanup() {
  // Ejecutar al inicio
  runCleanup();

  // Ejecutar cada 24 horas
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  setInterval(runCleanup, MS_PER_DAY);
}

function runCleanup() {
  deleteOldData()
    .then(counts => {
      const total = Object.values(counts).reduce((s, n) => s + n, 0);
      if (total > 0) {
        const parts = Object.entries(counts)
          .filter(([, n]) => n > 0)
          .map(([k, n]) => `${n} ${k}`)
          .join(", ");
        console.log(`[cleanup] Eliminados: ${parts}`);
      }
    })
    .catch(err => console.error("[cleanup] Error:", err));
}
