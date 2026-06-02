/**
 * Sincronización automática periódica de todas las sucursales activas.
 * Se ejecuta cada 30 minutos como fallback cuando los webhooks no están disponibles.
 */
import { syncAllBranches } from "./branch.service";

let timer: NodeJS.Timeout | null = null;

const INTERVAL_MS = 10 * 1000; // 10 s — feed casi en vivo

export function startSyncScheduler() {
  if (timer) return;
  timer = setInterval(async () => {
    try {
      const results = await syncAllBranches();
      // Solo loguear cuando hay novedades para no saturar la consola cada 10s.
      const newOrders = results.reduce((s, r) => s + (r.ok && r.orders ? r.orders : 0), 0);
      const failed = results.filter(r => !r.ok);
      if (newOrders > 0) console.log(`[sync-scheduler] +${newOrders} pedido(s) entregado(s)`);
      if (failed.length > 0) console.warn(`[sync-scheduler] ${failed.length} sucursal(es) con error`);
    } catch (err) {
      console.error("[sync-scheduler] Error:", err);
    }
  }, INTERVAL_MS);
  console.log("[sync-scheduler] Iniciado (cada 10 s)");
}

export function stopSyncScheduler() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
