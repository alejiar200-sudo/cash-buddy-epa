/**
 * CORRECCIÓN DE DATOS (un solo uso) — re-fechar el cierre de turno que quedó
 * archivado en el día equivocado por el bug de fecha UTC del frontend.
 *
 * El "Cierre final" del 19-jun se registró a las 23:29 (Bogotá) → 04:29 UTC del
 * 20-jun. Como el frontend calculaba "hoy" en UTC, lo guardó con date="2026-06-20"
 * en lugar de "2026-06-19". Resultado: el 19-jun quedó sin cierre y el 20-jun
 * mostraba AM y PM como "pendientes" (los dos cierres pendientes reportados).
 *
 * Este script mueve ese cierre a la fecha que le corresponde (la del día Bogotá de
 * su closedAt). Hace backup JSON antes de tocar nada. Es reversible.
 *
 * Uso: npx tsx scripts/fix-misdated-close.ts        (simulación, no escribe)
 *      npx tsx scripts/fix-misdated-close.ts --apply (aplica los cambios)
 */
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { prisma } from "../src/lib/prisma";
import { toBogotaDateStr } from "../src/lib/date-range";

const APPLY = process.argv.includes("--apply");

async function main() {
  const shifts = await prisma.shiftClose.findMany({ orderBy: [{ date: "asc" }, { closedAt: "asc" }] });

  // Backup completo de ShiftClose antes de cualquier cambio.
  const backupDir = join(process.cwd(), "..", "..", "backups");
  mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = join(backupDir, `shiftclose-backup-${stamp}.json`);
  writeFileSync(backupPath, JSON.stringify(shifts, null, 2));
  console.log(`Backup de ShiftClose → ${backupPath}\n`);

  // Detectar cierres cuya date (string) NO coincide con el día Bogotá de su closedAt.
  const misdated = shifts.filter((s) => s.date !== toBogotaDateStr(s.closedAt));

  if (misdated.length === 0) {
    console.log("No hay cierres con fecha desfasada. Nada que corregir.");
    await prisma.$disconnect();
    return;
  }

  for (const s of misdated) {
    const correctDate = toBogotaDateStr(s.closedAt);
    console.log(`Cierre ${s.id} (${s.shift}): date=${s.date} → ${correctDate}  [closedAt=${s.closedAt.toISOString()}]`);

    // Seguridad: no pisar un cierre ya existente en la fecha/turno destino.
    const clash = await prisma.shiftClose.findUnique({
      where: { date_shift: { date: correctDate, shift: s.shift } },
    });
    if (clash && clash.id !== s.id) {
      console.log(`  ⚠️  Ya existe un cierre ${s.shift} en ${correctDate} (id=${clash.id}). Se OMITE para no duplicar. Revisar manualmente.`);
      continue;
    }

    if (APPLY) {
      await prisma.shiftClose.update({ where: { id: s.id }, data: { date: correctDate } });
      console.log(`  ✅ Re-fechado.`);
    } else {
      console.log(`  (simulación — usar --apply para escribir)`);
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
