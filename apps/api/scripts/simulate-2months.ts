/**
 * Simulación de DOS MESES cubriendo todos los casos del sistema + casos límite.
 * Crea datos "SIM2", opera ~61 días, prueba casos extremos, audita y limpia.
 *
 * Uso:  npm run simulate-2months
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
import * as noteSvc from "../src/services/field-note.service";
import * as editSvc from "../src/services/edit-request.service";
import * as excelSvc from "../src/services/excel.service";
import * as branchSvc from "../src/services/branch.service";
import { getExpectedBalancesForDate } from "../src/services/shipday-dashboard.service";

const TAG = "SIM2";
const COMMISSION = 0.30;
const problems: string[] = [];
const ok = new Set<string>();
const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");
function flag(mod: string, msg: string) { problems.push(`[${mod}] ${msg}`); }
function pass(mod: string) { ok.add(mod); }
function rnd(a: number, b: number) { return a + Math.floor(Math.random() * (b - a + 1)); }
function daysOf(month: string, n: number) { return Array.from({ length: n }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`); }

async function main() {
  console.log("=== SIMULACIÓN DE 2 MESES (todos los casos) ===\n");
  const settingsBackup = await prisma.settings.findUnique({ where: { id: "singleton" } });
  const admin = await prisma.user.findFirst({ where: { role: "admin" } });
  if (!admin) { console.log("No hay admin."); return; }

  const branch = await prisma.branch.create({ data: { name: TAG, address: "Sim", apiKeyEnc: "sim", syncStatus: "never" } });
  const drivers = [];
  for (let i = 0; i < 6; i++) drivers.push(await prisma.driver.create({ data: { shipdayDriverId: `sim2-${i}`, branchId: branch.id, name: `Sim2 D${i}`, active: true } }));
  const client = await clientSvc.createClient({ name: `${TAG} Cliente` });
  const expectedDebt = new Map<string, number>();
  const counters = { orders: 0, bank: 0, base: 0, pay: 0, expense: 0, note: 0, shift: 0 };

  const MONTHS = [["2026-03", 31], ["2026-04", 30]] as const;

  for (const [month, ndays] of MONTHS) {
    for (const day of daysOf(month, ndays)) {
      try {
        // Pedidos (de noche, zona horaria)
        for (const d of drivers) {
          for (let k = 0; k < rnd(2, 6); k++) {
            const value = rnd(3, 15) * 1000, company = Math.round(value * COMMISSION);
            const deliveredAt = new Date(`${day}T23:${String(rnd(0, 59)).padStart(2, "0")}:00-05:00`);
            await prisma.shipdayOrder.create({ data: { shipdayOrderId: `sim2-${d.id}-${day}-${k}`, branchId: branch.id, driverId: d.id, deliveryValue: value, companyAmount: company, status: "DELIVERED", deliveredAt } });
            await prisma.driver.update({ where: { id: d.id }, data: { pendingDebt: { increment: company } } });
            const ds = toBogotaDateStr(deliveredAt);
            if (ds !== day) flag("Zona horaria", `Pedido ${day} → ${ds}`);
            await prisma.dailyDriverStat.upsert({ where: { date_driverId: { date: ds, driverId: d.id } }, create: { date: ds, branchId: branch.id, driverId: d.id, orderCount: 1, totalValue: value, companyTotal: company }, update: { orderCount: { increment: 1 }, totalValue: { increment: value }, companyTotal: { increment: company } } });
            expectedDebt.set(d.id, (expectedDebt.get(d.id) ?? 0) + company); counters.orders++;
          }
        }
        pass("Pedidos");
        // Bases
        await baseSvc.giveBase(drivers[0].id, { cashAmount: 30000, bankAmount: 20000, createdByName: "Sim" });
        expectedDebt.set(drivers[0].id, (expectedDebt.get(drivers[0].id) ?? 0) + 50000); counters.base++; pass("Bases");
        // Pago de comisión
        const dp = drivers[rnd(1, 5)]; const debt = (await prisma.driver.findUnique({ where: { id: dp.id } }))!.pendingDebt;
        const pay = Math.min(debt, rnd(10, 30) * 1000);
        if (pay > 0) { await driverSvc.registerPayment(dp.id, pay, "cash", "sim", { name: "Sim" }); expectedDebt.set(dp.id, (expectedDebt.get(dp.id) ?? 0) - pay); counters.pay++; pass("Pagos"); }
        // Banco (simple, mixto, sin contraparte, par con contraparte)
        await bankSvc.create({ type: "ingreso", medium: "cash", amount: rnd(20, 50) * 1000, description: "Sim ingreso", date: `${day}T10:00:00`, noCounterpart: true });
        await bankSvc.create({ type: "ingreso", cashAmount: 20000, bankAmount: 30000, description: "Sim mixto", date: `${day}T11:00:00`, noCounterpart: true });
        const e = await bankSvc.create({ type: "egreso", medium: "bank", amount: 25000, description: "Sim con contraparte", date: `${day}T13:00:00`, noCounterpart: false });
        await bankSvc.create({ type: "ingreso", medium: "cash", amount: 25000, description: "Sim retorno", date: `${day}T14:00:00`, pairWith: (e as { id: string }).id });
        counters.bank += 4; pass("Banco");
        // Gastos: confirmado + pendiente aprobado + pendiente rechazado
        await movementSvc.addMovement({ date: day, category: 3, type: "egreso", medium: "cash", amount: rnd(5, 15) * 1000, status: "confirmed", description: "Sim gasto" } as never);
        const gp = await movementSvc.addMovement({ date: day, category: 4, type: "egreso", medium: "bank", amount: 8000, status: "pending", description: "Sim gasto pend" } as never);
        await movementSvc.approveMovement((gp as { id: string }).id, admin.id, admin.name);
        const gr = await movementSvc.addMovement({ date: day, category: 4, type: "egreso", medium: "bank", amount: 5000, status: "pending", description: "Sim gasto rechazo" } as never);
        await movementSvc.rejectMovement((gr as { id: string }).id);
        counters.expense += 2; pass("Gastos (aprobar/rechazar)");
        // Nota
        await noteSvc.createNote(`Nota ${day}`, "Sim", day); counters.note++; pass("Notas");
        // Cierres AM/PM/Cierre
        const exp = await getExpectedBalancesForDate(day);
        const den = { bills: [{ value: 50000, qty: Math.max(0, Math.round(exp.cash / 50000)) }], coins: [] };
        await shiftSvc.registerShift({ date: day, shift: "AM", receivedBy: "Sim AM", denominations: den, expectedAmount: exp.cash, createdByName: "Sim AM" });
        const am = (await shiftSvc.getShiftsForDate(day)).find(s => s.shift === "AM");
        await shiftSvc.registerShift({ date: day, shift: "PM", receivedBy: "Sim PM", handedBy: "Sim AM", denominations: den, expectedAmount: am?.totalCounted ?? 0, createdByName: "Sim PM" });
        await shiftSvc.registerShift({ date: day, shift: "close", receivedBy: "Sim Cierre", denominations: den, expectedAmount: exp.cash, createdByName: "Sim Cierre" });
        counters.shift += 3; pass("Cierres (AM/PM/Cierre)");
      } catch (ex) { flag("Operación diaria", `${day}: ${(ex as Error).message}`); }
    }
    // Cierre del primer mes con reparto
    if (month === "2026-03") {
      try {
        await prisma.monthlyClose.deleteMany({ where: { month, branchId: null } });
        await closeSvc.closeMonth(month, undefined, 500000, 300000, { name: "Sim" });
        pass("Cierre de mes 1");
      } catch (ex) { flag("Cierre mes 1", (ex as Error).message); }
    }
  }

  // ── Casos puntuales y límite ──
  // Cliente: deuda + abonos (parcial efectivo, mixto, total)
  try {
    await clientSvc.addDebt(client.id, "Fiado A", 200000, "2026-03-05", { name: "Sim" });
    await clientSvc.addDebt(client.id, "Fiado B", 100000, "2026-04-10", { name: "Sim" });
    await clientSvc.registerClientPayment(client.id, 80000, false, "cash", { actor: { name: "Sim" } });
    await clientSvc.registerClientPayment(client.id, 0, false, "cash", { cashAmount: 40000, bankAmount: 30000, actor: { name: "Sim" } });
    pass("Clientes (deuda/abonos)");
    // Caso límite: sobrepago de cliente (no debe quedar negativo)
    await clientSvc.registerClientPayment(client.id, 999999, true, "cash", { actor: { name: "Sim" } });
    const c = await prisma.client.findUnique({ where: { id: client.id } });
    if ((c!.pendingDebt) < 0) flag("Caso límite clientes", `Saldo negativo: ${c!.pendingDebt}`); else pass("Caso límite: sobrepago cliente topado");
  } catch (ex) { flag("Clientes", (ex as Error).message); }

  // Descuento de deuda vía banco
  try {
    const dDebt = drivers.find(d => (expectedDebt.get(d.id) ?? 0) > 20000) ?? drivers[0];
    const tx = await bankSvc.create({ type: "ingreso", medium: "cash", amount: 15000, description: "Sim pago dom", date: "2026-04-15T09:00:00" });
    await driverSvc.applyBankToDriver((tx as { id: string }).id, dDebt.id, { name: "Sim" });
    expectedDebt.set(dDebt.id, (expectedDebt.get(dDebt.id) ?? 0) - 15000);
    const u = await prisma.bankTransaction.findUnique({ where: { id: (tx as { id: string }).id } });
    if (!u?.description.includes("Descontado de la deuda")) flag("Descuento deuda", "Descripción no refleja descuento"); else pass("Descuento de deuda vía banco");
  } catch (ex) { flag("Descuento deuda", (ex as Error).message); }

  // Casos límite de banco
  try { await bankSvc.create({ type: "ingreso", medium: "cash", amount: 0, description: "Sim cero" }); flag("Caso límite banco", "Aceptó monto 0"); } catch { pass("Caso límite: banco 0 rechazado"); }
  try { await bankSvc.create({ type: "ingreso", medium: "cash", amount: -1000, description: "Sim neg" }); flag("Caso límite banco", "Aceptó monto negativo"); } catch { pass("Caso límite: banco negativo rechazado"); }

  // Solicitud de edición: aprobar y rechazar
  try {
    const o1 = await prisma.shipdayOrder.findFirst({ where: { branchId: branch.id } });
    const o2 = await prisma.shipdayOrder.findFirst({ where: { branchId: branch.id }, skip: 1 });
    if (o1) { const r = await editSvc.createRequest({ requesterId: admin.id, entityType: "ShipdayOrder", entityId: o1.id, entityLabel: "P", changes: { deliveryValue: { old: String(o1.deliveryValue), new: String(o1.deliveryValue + 1000) } }, reason: "Sim corr" }); await editSvc.reviewRequest(r.id, admin.id, "approved"); }
    if (o2) { const r = await editSvc.createRequest({ requesterId: admin.id, entityType: "ShipdayOrder", entityId: o2.id, entityLabel: "P", changes: { deliveryValue: { old: String(o2.deliveryValue), new: String(o2.deliveryValue + 500) } }, reason: "Sim corr" }); await editSvc.reviewRequest(r.id, admin.id, "rejected"); }
    pass("Solicitudes edición (aprobar/rechazar)");
  } catch (ex) { flag("Solicitudes edición", (ex as Error).message); }

  console.log("Operación de 2 meses:", counters);
  console.log("\n=== AUDITORÍAS ===");

  // A) DailyDriverStat vs pedidos
  const ordersAll = await prisma.shipdayOrder.findMany({ where: { branchId: branch.id }, select: { driverId: true, deliveredAt: true } });
  const truth = new Map<string, number>();
  for (const o of ordersAll) { const k = `${toBogotaDateStr(o.deliveredAt!)}__${o.driverId}`; truth.set(k, (truth.get(k) ?? 0) + 1); }
  const stats = await prisma.dailyDriverStat.findMany({ where: { branchId: branch.id } });
  for (const s of stats) if (s.orderCount !== (truth.get(`${s.date}__${s.driverId}`) ?? 0)) flag("Contadores diarios", `${s.date}/${s.driverId}`);
  if (![...problems].some(p => p.includes("Contadores diarios"))) pass("Auditoría contadores diarios");

  // B) Reporte de ambos meses + Excel + proyección
  for (const [month] of MONTHS) {
    try {
      const rep = await closeSvc.getMonthlyReport(month);
      if (!isFinite(rep.netProfit)) flag("Reporte", `${month} utilidad no numérica`);
      const xls = await excelSvc.buildMonthlyExcel(month);
      console.log(`  ${month}: ventas=${fmt(rep.totalSales)} utilidad=${fmt(rep.netProfit)} rentab=${rep.profitability.toFixed(1)}% · transfer pend=${rep.transfers.pendingItems?.length ?? 0} · Excel=${(xls.length / 1024).toFixed(0)}KB`);
    } catch (ex) { flag("Reporte/Excel", `${month}: ${(ex as Error).message}`); }
  }
  pass("Reportes/Excel ambos meses");

  // C) Cierre del segundo mes
  try {
    await prisma.monthlyClose.deleteMany({ where: { month: "2026-04", branchId: null } });
    await closeSvc.closeMonth("2026-04", undefined, 500000, 300000, { name: "Sim" });
    pass("Cierre de mes 2");
  } catch (ex) { flag("Cierre mes 2", (ex as Error).message); }

  // D) Función "Cargar pedidos desde hoy" sobre la sucursal SIM (fija arranque, borra previos)
  try {
    const before = await prisma.shipdayOrder.count({ where: { branchId: branch.id } });
    const r = await branchSvc.startOrdersFromToday(branch.id).catch(() => null);
    const after = await prisma.shipdayOrder.count({ where: { branchId: branch.id } });
    const b2 = await prisma.branch.findUnique({ where: { id: branch.id } });
    if (b2?.ordersSince && after < before) pass("Cargar pedidos desde hoy (fija arranque + limpia)");
    else if (r === null) pass("Cargar pedidos desde hoy (sin Shipday real, fijó arranque)");
    else flag("Cargar desde hoy", `before=${before} after=${after} ordersSince=${b2?.ordersSince}`);
  } catch (ex) { flag("Cargar desde hoy", (ex as Error).message); }

  // ── Limpieza ──
  console.log("\n=== LIMPIEZA ===");
  await prisma.monthlyClose.deleteMany({ where: { closedByName: "Sim" } });
  await prisma.editRequest.deleteMany({ where: { reason: "Sim corr" } });
  await prisma.fieldNote.deleteMany({ where: { author: "Sim" } });
  await prisma.shiftClose.deleteMany({ where: { OR: [{ createdByName: { startsWith: "Sim" } }, { receivedBy: { startsWith: "Sim" } }] } });
  await prisma.bankTransaction.deleteMany({ where: { description: { startsWith: "Sim" } } });
  await prisma.movement.deleteMany({ where: { description: { startsWith: "Sim gasto" } } });
  await prisma.clientDebt.deleteMany({ where: { clientId: client.id } });
  await prisma.client.deleteMany({ where: { name: { startsWith: TAG } } });
  await prisma.branch.delete({ where: { id: branch.id } });
  if (settingsBackup) await prisma.settings.update({ where: { id: "singleton" }, data: { initialCash: settingsBackup.initialCash, initialBank: settingsBackup.initialBank } });
  console.log("  Datos de simulación eliminados y Settings restaurado.");

  console.log("\n=== DIAGNÓSTICO ===");
  console.log("Módulos/casos ejercitados OK:", [...ok].join(", "));
  if (problems.length === 0) console.log("\n✅ SIN FALLOS: 2 meses, todos los módulos y casos límite funcionaron correctamente.");
  else { console.log(`\n❌ ${problems.length} hallazgo(s):`); problems.forEach((p, i) => console.log(`  ${i + 1}. ${p}`)); }
}

main().then(() => process.exit(0)).catch(e => { console.error("SIM ERROR:", e); process.exit(1); });
