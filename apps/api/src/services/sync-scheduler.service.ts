/**
 * Sincronización automática periódica de todas las sucursales activas.
 * Se ejecuta cada 30 minutos como fallback cuando los webhooks no están disponibles.
 */
import { syncAllBranches } from "./branch.service";

let timer: NodeJS.Timeout | null = null;

// 60 s + jitter de hasta 10 s para no saturar la API de Shipday si hay varias sucursales.
const BASE_INTERVAL_MS = 60 * 1000;
const JITTER_MS = 10 * 1000;

function nextInterval() {
  return BASE_INTERVAL_MS + Math.floor(Math.random() * JITTER_MS);
}

function scheduleNext() {
  timer = setTimeout(async () => {
    try {
      const results = await syncAllBranches();
      const newOrders = results.reduce((s, r) => s + (r.ok && (r as Record<string, unknown>).orders ? (r as Record<string, unknown>).orders as number : 0), 0);
      const failed = results.filter(r => !r.ok);
      if (newOrders > 0) console.log(`[sync-scheduler] +${newOrders} pedido(s) entregado(s)`);
      if (failed.length > 0) console.warn(`[sync-scheduler] ${failed.length} sucursal(es) con error`);
    } catch (err) {
      console.error("[sync-scheduler] Error:", err);
    } finally {
      scheduleNext(); // re-schedule with new jitter
    }
  }, nextInterval());
}

export function startSyncScheduler() {
  if (timer) return;
  scheduleNext();
  console.log("[sync-scheduler] Iniciado (cada ~60 s con jitter)");
}

export function stopSyncScheduler() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}
