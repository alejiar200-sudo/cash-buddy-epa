/**
 * Sincronización automática periódica de todas las sucursales activas.
 *
 * Dos cadencias, ambas bajo el limitador de tasa global de shipday.service (máx
 * 4 solicitudes/min, por debajo del límite real de Shipday de 5/min):
 *
 *  1. SYNC RÁPIDO (~cada 60 s): revisa SOLO el día de hoy (windowDays=0). Pocas
 *     páginas → los pedidos nuevos entran de forma constante, casi en tiempo real.
 *  2. BARRIDO DE RECUPERACIÓN (cada 20 min + al arrancar): revisa los últimos
 *     días (windowDays) para recuperar cualquier pedido rezagado, entregado cerca
 *     de medianoche, o perdido durante un apagón. Así NO se pierde ningún pedido
 *     y no hay que revisar a mano cuáles cargaron y cuáles no.
 */
import { syncAllBranches } from "./branch.service";

let fastTimer: NodeJS.Timeout | null = null;
let catchUpTimer: NodeJS.Timeout | null = null;

// Sync rápido: 60 s + jitter de hasta 10 s para no alinear todas las sucursales.
const FAST_BASE_MS = 60 * 1000;
const FAST_JITTER_MS = 10 * 1000;
// Barrido de recuperación: cada 20 min, mirando los últimos 2 días.
const CATCHUP_INTERVAL_MS = 20 * 60 * 1000;
const CATCHUP_WINDOW_DAYS = 2;

function fastInterval() {
  return FAST_BASE_MS + Math.floor(Math.random() * FAST_JITTER_MS);
}

function logResults(label: string, results: Awaited<ReturnType<typeof syncAllBranches>>) {
  const newOrders = results.reduce((s, r) => s + (r.ok && typeof (r as Record<string, unknown>).orders === "number" ? ((r as Record<string, unknown>).orders as number) : 0), 0);
  if (newOrders > 0) console.log(`[sync-scheduler] ${label}: +${newOrders} pedido(s) entregado(s)`);
  // Mostrar el mensaje de error REAL (antes solo se decía "1 sucursal con error"
  // y la causa —p. ej. el rate limit— quedaba oculta). Así un fallo nunca pasa
  // desapercibido en los logs.
  for (const r of results) {
    if (!r.ok) console.error(`[sync-scheduler] ${label}: sucursal "${r.name}" falló → ${(r as { error?: string }).error ?? "error desconocido"}`);
  }
}

function scheduleFast() {
  fastTimer = setTimeout(async () => {
    try {
      logResults("rápido", await syncAllBranches({ windowDays: 0 }));
    } catch (err) {
      console.error("[sync-scheduler] Error en sync rápido:", err);
    } finally {
      scheduleFast();
    }
  }, fastInterval());
}

async function runCatchUp() {
  try {
    logResults("recuperación", await syncAllBranches({ windowDays: CATCHUP_WINDOW_DAYS, forceDrivers: true }));
  } catch (err) {
    console.error("[sync-scheduler] Error en barrido de recuperación:", err);
  }
}

export function startSyncScheduler() {
  if (fastTimer) return;
  scheduleFast();
  // Primer barrido a los 30 s del arranque (recupera lo que faltara mientras estuvo apagado).
  setTimeout(runCatchUp, 30 * 1000);
  catchUpTimer = setInterval(runCatchUp, CATCHUP_INTERVAL_MS);
  console.log("[sync-scheduler] Iniciado (sync rápido ~60 s + recuperación cada 20 min, bajo límite de Shipday)");
}

export function stopSyncScheduler() {
  if (fastTimer) {
    clearTimeout(fastTimer);
    fastTimer = null;
  }
  if (catchUpTimer) {
    clearInterval(catchUpTimer);
    catchUpTimer = null;
  }
}
