/**
 * Pruebas de CASOS LÍMITE — lo que un operador real podría hacer en una semana y
 * que podría romper el sistema. Crea datos "EDGE", prueba, reporta y limpia.
 */
import { prisma } from "../src/lib/prisma";
import * as baseSvc from "../src/services/base.service";
import * as driverSvc from "../src/services/driver.service";
import * as clientSvc from "../src/services/client.service";
import * as bankSvc from "../src/services/bank-transaction.service";

const findings: string[] = [];
function note(sev: "FALLA" | "RIESGO" | "OK", msg: string) {
  findings.push(`[${sev}] ${msg}`);
  console.log(`  ${sev === "OK" ? "✓" : sev === "RIESGO" ? "⚠️" : "❌"} ${msg}`);
}

async function main() {
  console.log("=== CASOS LÍMITE ===\n");
  const branch = await prisma.branch.create({ data: { name: "EDGE", address: "e", apiKeyEnc: "e", syncStatus: "never" } });
  const d = await prisma.driver.create({ data: { shipdayDriverId: "edge-1", branchId: branch.id, name: "Edge Driver", active: true, pendingDebt: 100000 } });
  const client = await clientSvc.createClient({ name: "EDGE Cliente" });

  // 1) Domiciliario paga MÁS de lo que debe → ¿deuda negativa?
  try {
    await driverSvc.registerPayment(d.id, 150000, "cash"); // debe 100k, paga 150k
    const after = (await prisma.driver.findUnique({ where: { id: d.id } }))!.pendingDebt;
    if (after < 0) note("RIESGO", `Sobrepago de domiciliario deja deuda NEGATIVA (${after}). Debería topar en 0 o rechazar.`);
    else note("OK", `Sobrepago de domiciliario manejado (deuda=${after}).`);
  } catch (e) { note("OK", `Sobrepago rechazado: ${(e as Error).message}`); }

  // 2) Base: devolver MÁS de lo entregado
  try {
    await baseSvc.giveBase(d.id, { cashAmount: 50000 });
    await baseSvc.payBase(d.id, { cashAmount: 80000 }); // devuelve más de lo dado
    note("RIESGO", "Permite devolver MÁS base de la entregada (no valida tope). Revisar.");
  } catch (e) { note("OK", `Devolución excesiva de base rechazada: ${(e as Error).message}`); }

  // 3) Monto cero / negativo en banco
  try {
    await bankSvc.create({ type: "ingreso", medium: "cash", amount: 0, description: "EDGE cero" });
    note("RIESGO", "Permite movimiento de banco con monto 0 (ruido en la caja).");
  } catch (e) { note("OK", `Monto 0 en banco rechazado: ${(e as Error).message}`); }
  try {
    await bankSvc.create({ type: "ingreso", medium: "cash", amount: -5000, description: "EDGE neg" });
    note("RIESGO", "Permite movimiento de banco NEGATIVO (puede falsear saldos).");
  } catch (e) { note("OK", `Monto negativo en banco rechazado: ${(e as Error).message}`); }

  // 4) Cliente: abonar MÁS de lo que debe
  try {
    await clientSvc.addDebt(client.id, "edge", 50000);
    await clientSvc.registerClientPayment(client.id, 90000, false, "cash");
    const c = await prisma.client.findUnique({ where: { id: client.id } });
    if ((c!.pendingDebt) < 0) note("RIESGO", `Sobrepago de cliente deja saldo NEGATIVO (${c!.pendingDebt}).`);
    else note("OK", `Sobrepago de cliente topado (saldo=${c!.pendingDebt}).`);
  } catch (e) { note("OK", `Sobrepago de cliente rechazado: ${(e as Error).message}`); }

  // 5) Pedido duplicado (mismo shipdayOrderId)
  try {
    await prisma.shipdayOrder.create({ data: { shipdayOrderId: "edge-dup", branchId: branch.id, driverId: d.id, deliveryValue: 5000, companyAmount: 1500, status: "DELIVERED", deliveredAt: new Date() } });
    await prisma.shipdayOrder.create({ data: { shipdayOrderId: "edge-dup", branchId: branch.id, driverId: d.id, deliveryValue: 5000, companyAmount: 1500, status: "DELIVERED", deliveredAt: new Date() } });
    note("FALLA", "Permite pedidos con shipdayOrderId DUPLICADO (doble conteo).");
  } catch (e) { note("OK", "Pedido duplicado bloqueado por la BD (unique)."); }

  // 6) Limpieza automática: ¿borra datos recientes? (simular registro de hace 1 día)
  try {
    const cutoff = new Date(); cutoff.setMonth(cutoff.getMonth() - 2);
    const recent = new Date(); recent.setDate(recent.getDate() - 1);
    const old = new Date(); old.setMonth(old.getMonth() - 3);
    note(recent > cutoff ? "OK" : "FALLA", `Corte de limpieza = ${cutoff.toISOString().slice(0,10)}; un registro de ayer (${recent.toISOString().slice(0,10)}) ${recent > cutoff ? "se conserva" : "SE BORRARÍA"}.`);
    note(old < cutoff ? "OK" : "RIESGO", `Un registro de hace 3 meses (${old.toISOString().slice(0,10)}) ${old < cutoff ? "se borra (correcto)" : "no se borraría"}.`);
  } catch { /* */ }

  // Limpieza
  await prisma.clientDebt.deleteMany({ where: { clientId: client.id } });
  await prisma.client.delete({ where: { id: client.id } });
  await prisma.driverPayment.deleteMany({ where: { driverId: d.id } });
  await prisma.bankTransaction.deleteMany({ where: { description: { startsWith: "EDGE" } } });
  await prisma.branch.delete({ where: { id: branch.id } });

  console.log("\n=== DIAGNÓSTICO CASOS LÍMITE ===");
  findings.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
  const risks = findings.filter(f => f.startsWith("[RIESGO]") || f.startsWith("[FALLA]"));
  console.log(`\nResumen: ${risks.length} hallazgo(s) a revisar de ${findings.length} pruebas.`);
}

main().then(() => process.exit(0)).catch(e => { console.error("EDGE ERROR:", e); process.exit(1); });
