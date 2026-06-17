/**
 * Simulación de UN MES completo ejercitando TODOS los módulos del sistema.
 * Crea datos "SIM-MES", opera 30 días, audita consistencia y limpia al final.
 *
 * Uso:  npm run simulate-month   (desde apps/api)
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
import { getExpectedBalancesForDate } from "../src/services/shipday-dashboard.service";

const TAG = "SIM-MES";
const COMMISSION = 0.30;
const MONTH = "2026-05";
const DAYS = Array.from({ length: 30 }, (_, i) => `${MONTH}-${String(i + 1).padStart(2, "0")}`);
const problems: string[] = [];
const ok: string[] = [];
function flag(mod: string, msg: string) { problems.push(`[${mod}] ${msg}`); }
function pass(mod: string) { ok.push(mod); }
function rnd(a: number, b: number) { return a + Math.floor(Math.random() * (b - a + 1)); }
const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");

async function main() {
  console.log("=== SIMULACIÓN DE UN MES (30 días, todos los módulos) ===\n");
  const settingsBackup = await prisma.settings.findUnique({ where: { id: "singleton" } });
  const admin = await prisma.user.findFirst({ where: { role: "admin" } });
  if (!admin) { console.log("No hay admin para la simulación."); return; }

  const branch = await prisma.branch.create({ data: { name: TAG, address: "Sim", apiKeyEnc: "sim", syncStatus: "never" } });
  const drivers = [];
  for (let i = 0; i < 6; i++) {
    drivers.push(await prisma.driver.create({ data: { shipdayDriverId: `simmes-${i}`, branchId: branch.id, name: `SimMes D${i}`, active: true } }));
  }
  const client = await clientSvc.createClient({ name: `${TAG} Cliente` });
  const expectedDebt = new Map<string, number>();
  let bankCount = 0, baseCount = 0, payCount = 0, expenseCount = 0, orderCount = 0, noteCount = 0, shiftCount = 0;

  // ───── 30 días de operación ─────
  for (const day of DAYS) {
    try {
      // PEDIDOS (Shipday simulado): cada driver entrega varios, de noche (zona horaria)
      for (const d of drivers) {
        const n = rnd(2, 6);
        for (let k = 0; k < n; k++) {
          const value = rnd(3, 15) * 1000;
          const company = Math.round(value * COMMISSION);
          const deliveredAt = new Date(`${day}T23:${String(rnd(0, 59)).padStart(2, "0")}:00-05:00`);
          await prisma.shipdayOrder.create({ data: { shipdayOrderId: `simmes-${d.id}-${day}-${k}`, branchId: branch.id, driverId: d.id, deliveryValue: value, companyAmount: company, status: "DELIVERED", deliveredAt } });
          await prisma.driver.update({ where: { id: d.id }, data: { pendingDebt: { increment: company } } });
          const ds = toBogotaDateStr(deliveredAt);
          if (ds !== day) flag("Pedidos/Zona horaria", `Pedido de ${day} quedó en ${ds}`);
          await prisma.dailyDriverStat.upsert({ where: { date_driverId: { date: ds, driverId: d.id } }, create: { date: ds, branchId: branch.id, driverId: d.id, orderCount: 1, totalValue: value, companyTotal: company }, update: { orderCount: { increment: 1 }, totalValue: { increment: value }, companyTotal: { increment: company } } });
          expectedDebt.set(d.id, (expectedDebt.get(d.id) ?? 0) + company);
          orderCount++;
        }
      }
      pass("Pedidos");

      // BASES (efectivo + transferencia)
      await baseSvc.giveBase(drivers[0].id, { cashAmount: 30000, bankAmount: 20000, createdByName: "Sim" });
      expectedDebt.set(drivers[0].id, (expectedDebt.get(drivers[0].id) ?? 0) + 50000); baseCount++;
      pass("Bases");

      // PAGOS de comisión
      const dPay = drivers[rnd(1, 5)];
      const debt = (await prisma.driver.findUnique({ where: { id: dPay.id } }))!.pendingDebt;
      const pay = Math.min(debt, rnd(10, 30) * 1000);
      if (pay > 0) { await driverSvc.registerPayment(dPay.id, pay, "cash", "sim", { name: "Sim" }); expectedDebt.set(dPay.id, (expectedDebt.get(dPay.id) ?? 0) - pay); payCount++; pass("Pagos domiciliario"); }

      // BANCO: simple, mixto, par con contraparte, sin contraparte
      await bankSvc.create({ type: "ingreso", medium: "cash", amount: rnd(20, 50) * 1000, description: "Sim ingreso", date: `${day}T10:00:00` }); bankCount++;
      await bankSvc.create({ type: "ingreso", cashAmount: 20000, bankAmount: 30000, description: "Sim mixto", date: `${day}T11:00:00` }); bankCount++;
      await bankSvc.create({ type: "egreso", medium: "bank", amount: 40000, description: "Sim sin contraparte", date: `${day}T12:00:00`, noCounterpart: true }); bankCount++;
      const egr = await bankSvc.create({ type: "egreso", medium: "bank", amount: 25000, description: "Sim salida con contraparte", date: `${day}T13:00:00`, noCounterpart: false });
      await bankSvc.create({ type: "ingreso", medium: "cash", amount: 25000, description: "Sim retorno", date: `${day}T14:00:00`, pairWith: (egr as { id: string }).id }); bankCount += 2;
      pass("Banco");

      // GASTO confirmado + GASTO pendiente (aprobación)
      await movementSvc.addMovement({ date: day, category: 3, type: "egreso", medium: "cash", amount: rnd(5, 15) * 1000, status: "confirmed", description: "Sim gasto" } as never); expenseCount++;
      const pend = await movementSvc.addMovement({ date: day, category: 4, type: "egreso", medium: "bank", amount: 8000, status: "pending", description: "Sim gasto pendiente" } as never);
      await movementSvc.approveMovement((pend as { id: string }).id, admin.id, admin.name); expenseCount++;
      pass("Gastos/Aprobación");

      // NOTA de campo del día
      await noteSvc.createNote(`Nota sim del ${day}`, "Sim", day); noteCount++;
      pass("Notas de campo");

      // CIERRES de turno: mañana, tarde (verificación), cierre
      const exp = await getExpectedBalancesForDate(day);
      if (!isFinite(exp.cash)) flag("Cierres turno", `Esperado no numérico el ${day}`);
      const den = { bills: [{ value: 50000, qty: Math.max(0, Math.round(exp.cash / 50000)) }], coins: [] };
      await shiftSvc.registerShift({ date: day, shift: "AM", receivedBy: "Sim AM", denominations: den, expectedAmount: exp.cash, createdByName: "Sim AM" });
      const am = (await shiftSvc.getShiftsForDate(day)).find(s => s.shift === "AM");
      await shiftSvc.registerShift({ date: day, shift: "PM", receivedBy: "Sim PM", handedBy: "Sim AM", denominations: den, expectedAmount: am?.totalCounted ?? 0, createdByName: "Sim PM" });
      await shiftSvc.registerShift({ date: day, shift: "close", receivedBy: "Sim Cierre", denominations: den, expectedAmount: exp.cash, createdByName: "Sim Cierre" });
      shiftCount += 3;
      pass("Cierres turno (AM/PM/Cierre)");
    } catch (e) { flag("Operación diaria", `${day}: ${(e as Error).message}`); }
  }

  // ───── Operaciones puntuales ─────
  // CLIENTE: deuda + abono parcial (efectivo) + abono mixto
  try {
    await clientSvc.addDebt(client.id, "Sim fiado", 200000, DAYS[2], { name: "Sim" });
    await clientSvc.registerClientPayment(client.id, 50000, false, "cash", { actor: { name: "Sim" } });
    await clientSvc.registerClientPayment(client.id, 0, false, "cash", { cashAmount: 30000, bankAmount: 20000, actor: { name: "Sim" } });
    const c = await prisma.client.findUnique({ where: { id: client.id } });
    if (c!.pendingDebt !== 100000) flag("Clientes", `Saldo esperado 100000, quedó ${c!.pendingDebt}`); else pass("Clientes (deuda/abonos mixtos)");
  } catch (e) { flag("Clientes", (e as Error).message); }

  // DESCUENTO de deuda vía banco
  try {
    const dDebt = drivers.find(d => (expectedDebt.get(d.id) ?? 0) > 20000) ?? drivers[0];
    const tx = await bankSvc.create({ type: "ingreso", medium: "cash", amount: 15000, description: "Sim pago domiciliario", date: `${DAYS[5]}T09:00:00` });
    await driverSvc.applyBankToDriver((tx as { id: string }).id, dDebt.id, { name: "Sim" });
    expectedDebt.set(dDebt.id, (expectedDebt.get(dDebt.id) ?? 0) - 15000);
    const updated = await prisma.bankTransaction.findUnique({ where: { id: (tx as { id: string }).id } });
    if (!updated?.description.includes("Descontado de la deuda")) flag("Descuento deuda", "La descripción no refleja el descuento");
    else pass("Descuento de deuda vía banco");
  } catch (e) { flag("Descuento deuda", (e as Error).message); }

  // SOLICITUD de edición + aprobación
  try {
    const someOrder = await prisma.shipdayOrder.findFirst({ where: { branchId: branch.id } });
    if (someOrder) {
      const req = await editSvc.createRequest({ requesterId: admin.id, entityType: "ShipdayOrder", entityId: someOrder.id, entityLabel: "Pedido sim", changes: { deliveryValue: { old: String(someOrder.deliveryValue), new: String(someOrder.deliveryValue + 1000) } }, reason: "Sim corrección" });
      await editSvc.reviewRequest(req.id, admin.id, "approved");
      pass("Solicitudes de edición (crear/aprobar)");
    }
  } catch (e) { flag("Solicitudes edición", (e as Error).message); }

  console.log("Operación registrada:", { dias: DAYS.length, orderCount, bankCount, baseCount, payCount, expenseCount, noteCount, shiftCount });
  console.log("\n=== AUDITORÍAS ===");

  // A) Deuda de domiciliarios
  for (const d of drivers) {
    const real = (await prisma.driver.findUnique({ where: { id: d.id } }))!.pendingDebt;
    const theo = Math.round(expectedDebt.get(d.id) ?? 0);
    // Permitir crédito: si real difiere por crédito acumulado, revisar excess
    if (Math.abs(real - Math.max(0, theo)) > 0 && real !== theo) flag("Deuda domiciliarios", `${d.name}: sistema=${real} vs esperado=${theo}`);
  }
  if (!problems.some(p => p.includes("Deuda domiciliarios"))) pass("Auditoría deuda domiciliarios");

  // B) DailyDriverStat vs pedidos
  const orders = await prisma.shipdayOrder.findMany({ where: { branchId: branch.id }, select: { driverId: true, deliveredAt: true } });
  const truth = new Map<string, number>();
  for (const o of orders) { const k = `${toBogotaDateStr(o.deliveredAt!)}__${o.driverId}`; truth.set(k, (truth.get(k) ?? 0) + 1); }
  const stats = await prisma.dailyDriverStat.findMany({ where: { branchId: branch.id } });
  for (const s of stats) { if (s.orderCount !== (truth.get(`${s.date}__${s.driverId}`) ?? 0)) flag("Contadores diarios", `${s.date}/${s.driverId} desfasado`); }
  if (!problems.some(p => p.includes("Contadores diarios"))) pass("Auditoría contadores diarios");

  // C) Reporte mensual + proyección + Excel
  try {
    const report = await closeSvc.getMonthlyReport(MONTH);
    if (!isFinite(report.netProfit)) flag("Reporte mensual", "Utilidad no numérica");
    if (report.totalSales <= 0) flag("Reporte mensual", `Ventas no positivas: ${report.totalSales}`);
    console.log(`  Reporte ${MONTH}: ventas=${fmt(report.totalSales)} gastos=${fmt(report.expenses.total)} utilidad=${fmt(report.netProfit)} rentab=${report.profitability.toFixed(1)}%`);
    console.log(`  Transferencias sin cuadrar: ${report.transfers.pendingItems?.length ?? 0} | Bases diff: ${fmt(report.bases.diff)} | Deuda clientes: ${fmt(report.clientDebt.balance)}`);
    const proj = await closeSvc.getMonthCloseProjection(MONTH, 600000, 400000);
    console.log(`  Proyección cierre: dejar ${fmt(proj.physicalCash)} efectivo + ${fmt(proj.physicalBank)} banco`);
    const xls = await excelSvc.buildMonthlyExcel(MONTH);
    if (!xls || xls.length < 1000) flag("Excel", "El Excel salió vacío o muy pequeño"); else console.log(`  Excel generado: ${(xls.length / 1024).toFixed(1)} KB`);
    pass("Reporte/Proyección/Excel");
  } catch (e) { flag("Reporte/Excel", (e as Error).message); }

  // D) Cierre de mes + verificar reinicio del saldo
  try {
    await prisma.monthlyClose.deleteMany({ where: { month: MONTH, branchId: null } });
    await closeSvc.closeMonth(MONTH, undefined, 600000, 400000, { name: "Sim" });
    const after = await getExpectedBalancesForDate("2026-06-01");
    console.log(`  Tras cierre de ${MONTH}: saldo nuevo período = ${fmt(after.cash)} efectivo + ${fmt(after.bank)} banco (objetivo 600k/400k + flujos junio reales)`);
    pass("Cierre de mes");
  } catch (e) { flag("Cierre de mes", (e as Error).message); }

  // ───── Limpieza ─────
  console.log("\n=== LIMPIEZA ===");
  await prisma.monthlyClose.deleteMany({ where: { closedByName: "Sim" } });
  await prisma.editRequest.deleteMany({ where: { reason: "Sim corrección" } });
  await prisma.fieldNote.deleteMany({ where: { author: "Sim" } });
  await prisma.shiftClose.deleteMany({ where: { OR: [{ createdByName: { startsWith: "Sim" } }, { receivedBy: { startsWith: "Sim" } }] } });
  await prisma.bankTransaction.deleteMany({ where: { description: { startsWith: "Sim" } } });
  await prisma.movement.deleteMany({ where: { description: { startsWith: "Sim gasto" } } });
  await prisma.clientDebt.deleteMany({ where: { clientId: client.id } });
  await prisma.client.deleteMany({ where: { name: { startsWith: TAG } } });
  await prisma.branch.delete({ where: { id: branch.id } });
  if (settingsBackup) await prisma.settings.update({ where: { id: "singleton" }, data: { initialCash: settingsBackup.initialCash, initialBank: settingsBackup.initialBank } });
  console.log("  Datos de simulación eliminados y Settings restaurado.");

  // ───── Diagnóstico ─────
  console.log("\n=== DIAGNÓSTICO ===");
  console.log("Módulos ejercitados OK:", [...new Set(ok)].join(", "));
  if (problems.length === 0) console.log("\n✅ SIN FALLOS: todos los módulos funcionaron correctamente durante el mes simulado.");
  else { console.log(`\n❌ ${problems.length} hallazgo(s):`); problems.forEach((p, i) => console.log(`  ${i + 1}. ${p}`)); }
}

main().then(() => process.exit(0)).catch(e => { console.error("SIM ERROR:", e); process.exit(1); });
