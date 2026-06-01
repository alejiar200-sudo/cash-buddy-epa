/**
 * Sincronización automática periódica de todas las sucursales activas.
 * Se ejecuta cada 30 minutos como fallback cuando los webhooks no están disponibles.
 */
import { syncAllBranches } from "./branch.service";

let timer: NodeJS.Timeout | null = null;

const INTERVAL_MS = 5 * 60 * 1000; // 5 min

export function startSyncScheduler() {
  if (timer) return;
  timer = setInterval(async () => {
    try {
      const results = await syncAllBranches();
      const ok = results.filter(r => r.ok).length;
      console.log(`[sync-scheduler] ${ok}/${results.length} sucursales sincronizadas`);
    } catch (err) {
      console.error("[sync-scheduler] Error:", err);
    }
  }, INTERVAL_MS);
  console.log("[sync-scheduler] Iniciado (cada 5 min)");
}

export function stopSyncScheduler() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
