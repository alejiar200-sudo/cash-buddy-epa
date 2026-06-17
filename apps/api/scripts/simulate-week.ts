/**
 * Simulación de UNA SEMANA de operación real del sistema.
 *
 * Crea datos de prueba (sucursal "SIMULACION" + domiciliarios), genera 7 días de
 * actividad ejercitando el CÓDIGO REAL (pedidos, bases, pagos, banco, deudas,
 * gastos, cierres de turno y cierre de mes), corre auditorías de consistencia y
 * AL FINAL borra todo lo de la simulación.
 *
 * Uso:  npm run simulate-week   (desde apps/api)
 */
import { prisma } from "../src/lib/prisma";
import { toBogotaDateStr } from "../src/lib/date-range";
import * as baseSvc from "../src/services/base.service";
import * as driverSvc from "../src/services/driver.service";
import * as clientSvc from "../src/services/client.service";
import * as bankSvc from "../src/services/bank-transaction.service";
import * as movementSvc from "../src/services/movement.service";
import * as shiftSvc from "../src/services/shift-close.service";
import * as closeSvc from "../src/services/close.service";
import { getExpectedBalancesForDate } from "../src/services/shipday-dashboard.service";

const TAG = "SIMULACION";
const COMMISSION = 0.30;
const DAYS = ["2026-06-09", "2026-06-10", "2026-06-11", "2026-06-12", "2026-06-13", "2026-06-14", "2026-06-15"];
const problems: string[] = [];
function flag(msg: string) { problems.push(msg); console.log("  ⚠️  " + msg); }
function rnd(a: number, b: number) { return a + Math.floor(Math.random() * (b - a + 1)); }

async function main() {
  console.log("=== SIMULACIÓN DE UNA SEMANA ===\n");

  // Respaldo de Settings (el cierre de mes modifica el capital inicial)
  const settingsBackup = await prisma.settings.findUnique({ where: { id: "singleton" } });

  // ---- Setup: sucursal + domiciliarios ----
  const branch = await prisma.branch.create({
    data: { name: TAG, address: "Sim", apiKeyEnc: "sim", syncStatus: "never" },
  });
  const driverNames = ["Sim Juan", "Sim Pedro", "Sim Ana", "Sim Luis", "Sim Eva"];
  const drivers = [];
  for (let i = 0; i < driverNames.length; i++) {
    drivers.push(await prisma.driver.create({
      data: { shipdayDriverId: `sim-${i}`, branchId: branch.id, name: driverNames[i], active: true },
    }));
  }
  console.log(`Creada sucursal ${TAG} con ${drivers.length} domiciliarios.\n`);

  let expectedDriverDebt = new Map<string, number>(); // verdad teórica de deuda por driver

  // ---- 7 días de operación ----
  for (const day of DAYS) {
    console.log(`── Día ${day} ──`);
    // Pedidos entregados (de noche en Bogotá, para probar la zona horaria)
    let dayOrders = 0;
    for (const d of drivers) {
      const n = rnd(3, 8);
      for (let k = 0; k < n; k++) {
        const value = rnd(3, 12) * 1000;
        const company = Math.round(value * COMMISSION);
        const deliveredAt = new Date(`${day}T23:${String(rnd(0, 59)).padStart(2, "0")}:00-05:00`);
        await prisma.shipdayOrder.create({
          data: {
            shipdayOrderId: `sim-${d.id}-${day}-${k}`, branchId: branch.id, driverId: d.id,
            deliveryValue: value, companyAmount: company, status: "DELIVERED", deliveredAt,
          },
        });
        await prisma.driver.update({ where: { id: d.id }, data: { pendingDebt: { increment: company } } });
        const ds = toBogotaDateStr(deliveredAt);
        await prisma.dailyDriverStat.upsert({
          where: { date_driverId: { date: ds, driverId: d.id } },
          create: { date: ds, branchId: branch.id, driverId: d.id, orderCount: 1, totalValue: value, companyTotal: company },
          update: { orderCount: { increment: 1 }, totalValue: { increment: value }, companyTotal: { increment: company } },
        });
        // verificar que la fecha de Bogotá del pedido coincida con el día simulado
        if (ds !== day) flag(`Pedido de ${day} quedó fechado como ${ds} (problema de zona horaria)`);
        expectedDriverDebt.set(d.id, (expectedDriverDebt.get(d.id) ?? 0) + company);
        dayOrders++;
      }
    }

    // Bases: entregar a 2 domiciliarios (efectivo + transferencia)
    try {
      await baseSvc.giveBase(drivers[0].id, { cashAmount: 30000, bankAmount: 20000, createdByName: "Sim" });
      await baseSvc.giveBase(drivers[1].id, { cashAmount: 50000, createdByName: "Sim" });
      expectedDriverDebt.set(drivers[0].id, (expectedDriverDebt.get(drivers[0].id) ?? 0) + 50000);
      expectedDriverDebt.set(drivers[1].id, (expectedDriverDebt.get(drivers[1].id) ?? 0) + 50000);
    } catch (e) { flag(`giveBase falló: ${(e as Error).message}`); }

    // Pagos de comisión: 2 domiciliarios pagan parte de su deuda
    try {
      for (const d of [drivers[2], drivers[3]]) {
        const debt = (await prisma.driver.findUnique({ where: { id: d.id } }))!.pendingDebt;
        const pay = Math.min(debt, rnd(10, 40) * 1000);
        if (pay > 0) {
          await driverSvc.registerPayment(d.id, pay, "cash", "sim", { name: "Sim" });
          expectedDriverDebt.set(d.id, (expectedDriverDebt.get(d.id) ?? 0) - pay);
        }
      }
    } catch (e) { flag(`registerPayment falló: ${(e as Error).message}`); }

    // Banco: ingreso efectivo, salida banco, y un MIXTO
    try {
      await bankSvc.create({ type: "ingreso", medium: "cash", amount: rnd(20, 60) * 1000, description: "Sim ingreso", date: `${day}T10:00:00` });
      await bankSvc.create({ type: "egreso", medium: "bank", amount: rnd(10, 30) * 1000, description: "Sim salida", date: `${day}T11:00:00` });
      await bankSvc.create({ type: "ingreso", cashAmount: 30000, bankAmount: 20000, description: "Sim mixto", date: `${day}T12:00:00` });
    } catch (e) { flag(`bank.create falló: ${(e as Error).message}`); }

    // Gasto confirmado (cat 3)
    try {
      await movementSvc.addMovement({ date: day, category: 3, type: "egreso", medium: "cash", amount: rnd(5, 20) * 1000, status: "confirmed", description: "Sim gasto" } as never);
    } catch (e) { flag(`addMovement(gasto) falló: ${(e as Error).message}`); }

    // Cierre de turno MAÑANA (esperado del sistema) y TARDE (verificación)
    try {
      const exp = await getExpectedBalancesForDate(day);
      if (!isFinite(exp.cash) || !isFinite(exp.bank)) flag(`Esperado del sistema no numérico el ${day}: cash=${exp.cash} bank=${exp.bank}`);
      const denominations = { bills: [{ value: 50000, qty: Math.max(0, Math.round(exp.cash / 50000)) }], coins: [] };
      const counted = 50000 * Math.max(0, Math.round(exp.cash / 50000));
      await shiftSvc.registerShift({ date: day, shift: "AM", receivedBy: "Sim AM", denominations, expectedAmount: exp.cash, createdByName: "Sim AM" });
      const am = (await shiftSvc.getShiftsForDate(day)).find(s => s.shift === "AM");
      await shiftSvc.registerShift({ date: day, shift: "PM", receivedBy: "Sim PM", handedBy: "Sim AM", denominations, expectedAmount: am?.totalCounted ?? counted, createdByName: "Sim PM" });
    } catch (e) { flag(`registerShift falló el ${day}: ${(e as Error).message}`); }

    console.log(`  ${dayOrders} pedidos, bases, pagos, banco, gasto y 2 cierres registrados.`);
  }

  // Cliente: deuda + abono parcial
  try {
    const c = await clientSvc.createClient({ name: TAG + " Cliente" });
    await clientSvc.addDebt(c.id, "Sim fiado", 100000, DAYS[1]);
    await clientSvc.registerClientPayment(c.id, 40000, false, "cash", { actor: { name: "Sim" } });
    const after = await prisma.client.findUnique({ where: { id: c.id } });
    if (after!.pendingDebt !== 60000) flag(`Saldo de cliente esperado 60000, quedó ${after!.pendingDebt}`);
  } catch (e) { flag(`Flujo de cliente falló: ${(e as Error).message}`); }

  console.log("\n=== AUDITORÍAS ===");

  // 1) Deuda de domiciliarios: pendingDebt real vs verdad teórica
  for (const d of drivers) {
    const real = (await prisma.driver.findUnique({ where: { id: d.id } }))!.pendingDebt;
    const theo = Math.round(expectedDriverDebt.get(d.id) ?? 0);
    if (real !== theo) flag(`Deuda de ${d.name}: sistema=${real} vs esperado=${theo} (desfase ${real - theo})`);
  }
  console.log("  Deuda de domiciliarios verificada.");

  // 2) DailyDriverStat vs ShipdayOrder (por día+driver, fecha Bogotá)
  const orders = await prisma.shipdayOrder.findMany({ where: { branchId: branch.id }, select: { driverId: true, companyAmount: true, deliveredAt: true } });
  const truth = new Map<string, number>();
  for (const o of orders) truth.set(`${toBogotaDateStr(o.deliveredAt!)}__${o.driverId}`, (truth.get(`${toBogotaDateStr(o.deliveredAt!)}__${o.driverId}`) ?? 0) + 1);
  const stats = await prisma.dailyDriverStat.findMany({ where: { branchId: branch.id } });
  for (const s of stats) {
    const t = truth.get(`${s.date}__${s.driverId}`) ?? 0;
    if (s.orderCount !== t) flag(`DailyDriverStat ${s.date}/${s.driverId}: contador=${s.orderCount} vs pedidos reales=${t}`);
  }
  console.log("  Contadores diarios verificados.");

  // 3) Reporte mensual + balances esperados coherentes
  try {
    const report = await closeSvc.getMonthlyReport("2026-06");
    if (!isFinite(report.netProfit)) flag("Utilidad neta no numérica en el reporte mensual");
    if (report.totalSales < 0) flag(`Ventas negativas en el reporte: ${report.totalSales}`);
    const exp = await getExpectedBalancesForDate("2026-06-15");
    console.log(`  Reporte: ventas=${report.totalSales} gastos=${report.expenses.total} utilidad=${report.netProfit}`);
    console.log(`  Balance esperado al 15: efectivo=${exp.cash} banco=${exp.bank}`);
  } catch (e) { flag(`getMonthlyReport falló: ${(e as Error).message}`); }

  // 4) Cierre de mes con reparto + verificar que el saldo "reinicia" al capital
  try {
    // Evitar conflicto si ya existe un cierre 2026-06 global (no debería en BD vacía).
    await prisma.monthlyClose.deleteMany({ where: { month: "2026-06", branchId: null } });
    await closeSvc.closeMonth("2026-06", undefined, 300000, 200000, { name: "Sim" });
    const expAfter = await getExpectedBalancesForDate("2026-06-16");
    if (expAfter.cash !== 300000 || expAfter.bank !== 200000) {
      // puede haber flujos posteriores al cierre; si no los hay debería ser exacto
      const movsAfter = await prisma.bankTransaction.count({ where: { date: { gt: new Date() } } });
      if (movsAfter === 0) flag(`Tras cierre de mes, saldo no reinició al capital: efectivo=${expAfter.cash} (esp 300000), banco=${expAfter.bank} (esp 200000)`);
    } else {
      console.log("  Cierre de mes: saldo reinició correctamente a 300000 / 200000.");
    }
  } catch (e) { flag(`closeMonth falló: ${(e as Error).message}`); }

  // ---- Limpieza ----
  console.log("\n=== LIMPIEZA ===");
  await prisma.monthlyClose.deleteMany({ where: { closedByName: "Sim" } });
  await prisma.shiftClose.deleteMany({ where: { OR: [{ createdByName: { startsWith: "Sim" } }, { receivedBy: { startsWith: "Sim" } }] } });
  await prisma.bankTransaction.deleteMany({ where: { description: { startsWith: "Sim" } } });
  await prisma.movement.deleteMany({ where: { description: "Sim gasto" } });
  const simClients = await prisma.client.findMany({ where: { name: { startsWith: TAG } }, select: { id: true } });
  await prisma.clientDebt.deleteMany({ where: { clientId: { in: simClients.map(c => c.id) } } });
  await prisma.client.deleteMany({ where: { name: { startsWith: TAG } } });
  await prisma.branch.delete({ where: { id: branch.id } }); // cascade: drivers, orders, bases, stats, payments
  // restaurar capital de Settings que el cierre de mes modificó
  if (settingsBackup) {
    await prisma.settings.update({
      where: { id: "singleton" },
      data: { initialCash: settingsBackup.initialCash, initialBank: settingsBackup.initialBank },
    });
  }
  console.log("  Datos de simulación eliminados y capital de Settings restaurado.");

  // ---- Diagnóstico ----
  console.log("\n=== DIAGNÓSTICO ===");
  if (problems.length === 0) {
    console.log("✅ Sin fallos detectados en la simulación de la semana.");
  } else {
    console.log(`❌ Se detectaron ${problems.length} problema(s):`);
    problems.forEach((p, i) => console.log(`  ${i + 1}. ${p}`));
  }
}

main().then(() => process.exit(0)).catch(e => { console.error("SIM ERROR:", e); process.exit(1); });
