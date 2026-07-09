/**
 * Sincronización automática periódica de todas las sucursales activas.
 *
 * Tres cadencias, todas bajo el limitador de tasa global de shipday.service (máx
 * 4 solicitudes/min, por debajo del límite real de Shipday de 5/min):
 *
 *  1. SYNC RÁPIDO (~cada 60 s): revisa SOLO el día de hoy (windowDays=0). Pocas
 *     páginas → los pedidos nuevos entran de forma constante, casi en tiempo real.
 *  2. BARRIDO DE RECUPERACIÓN (cada 20 min + al arrancar): revisa los últimos
 *     días para recuperar cualquier pedido rezagado, entregado cerca de medianoche,
 *     o perdido durante un apagón.
 *  3. RECONCILIACIÓN PROFUNDA (cada 3 h): revisa una ventana amplia para no perder
 *     los pedidos PROGRAMADOS. Shipday filtra la consulta de "ya entregados" por la
 *     fecha en que se CREÓ el pedido, no por la de entrega; un domicilio programado
 *     se crea con anticipación, así que su fecha de creación cae fuera de la ventana
 *     de "hoy" (el sync rápido nunca lo ve) y a veces fuera de la de recuperación.
 *     Esta ventana amplia garantiza que un programado, aunque se haya creado varios
 *     días antes, termine cargándose una vez se completa. persistDeliveredOrder es
 *     idempotente (dedup por shipdayOrderId), así que reprocesar no duplica nada.
 */
import { syncAllBranches } from "./branch.service";

let fastTimer: NodeJS.Timeout | null = null;
let catchUpTimer: NodeJS.Timeout | null = null;
let deepTimer: NodeJS.Timeout | null = null;

// Sync rápido: 60 s + jitter de hasta 10 s para no alinear todas las sucursales.
const FAST_BASE_MS = 60 * 1000;
const FAST_JITTER_MS = 10 * 1000;
// Barrido de recuperación: cada 20 min, mirando los últimos 3 días.
const CATCHUP_INTERVAL_MS = 20 * 60 * 1000;
const CATCHUP_WINDOW_DAYS = 3;
// Reconciliación profunda: cada 3 h, mirando 14 días atrás (por la fecha de CREACIÓN)
// para rescatar pedidos PROGRAMADOS creados con varios días de anticipación.
const DEEP_INTERVAL_MS = 3 * 60 * 60 * 1000;
const DEEP_WINDOW_DAYS = 14;

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

async function runDeepReconcile() {
  try {
    logResults("profunda", await syncAllBranches({ windowDays: DEEP_WINDOW_DAYS, forceDrivers: true }));
  } catch (err) {
    console.error("[sync-scheduler] Error en reconciliación profunda:", err);
  }
}

export function startSyncScheduler() {
  if (fastTimer) return;
  scheduleFast();
  // Primer barrido a los 30 s del arranque (recupera lo que faltara mientras estuvo apagado).
  setTimeout(runCatchUp, 30 * 1000);
  catchUpTimer = setInterval(runCatchUp, CATCHUP_INTERVAL_MS);
  // Reconciliación profunda: primera a los 2 min del arranque (rescata programados
  // creados días atrás), luego cada 3 h.
  setTimeout(runDeepReconcile, 2 * 60 * 1000);
  deepTimer = setInterval(runDeepReconcile, DEEP_INTERVAL_MS);
  console.log("[sync-scheduler] Iniciado (rápido ~60 s + recuperación 20 min + reconciliación profunda 3 h, bajo límite de Shipday)");
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
  if (deepTimer) {
    clearInterval(deepTimer);
    deepTimer = null;
  }
}
