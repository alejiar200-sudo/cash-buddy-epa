/**
 * Rangos de fecha consistentes en zona horaria de Bogotá (UTC-05:00, sin horario
 * de verano). Toda construcción de "el día X" o "el mes X" en timestamps DateTime
 * debe pasar por aquí — antes había mezcla de límites en "Z" (UTC) y hora local del
 * proceso, lo que hacía que un mismo pedido/movimiento cayera en días distintos
 * según qué reporte lo consultara.
 */

const BOGOTA_OFFSET = "-05:00";

export function bogotaDayRange(date: string): { gte: Date; lte: Date } {
  return {
    gte: new Date(`${date}T00:00:00.000${BOGOTA_OFFSET}`),
    lte: new Date(`${date}T23:59:59.999${BOGOTA_OFFSET}`),
  };
}

export function bogotaMonthRange(month: string): { gte: Date; lte: Date } {
  const [y, m] = month.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return {
    gte: new Date(`${month}-01T00:00:00.000${BOGOTA_OFFSET}`),
    lte: new Date(`${month}-${String(lastDay).padStart(2, "0")}T23:59:59.999${BOGOTA_OFFSET}`),
  };
}

/** Para rangos abiertos (from/to opcionales) usados en filtros de listados. */
export function bogotaOpenRange(from?: string, to?: string): { gte?: Date; lte?: Date } | undefined {
  if (!from && !to) return undefined;
  return {
    ...(from ? { gte: new Date(`${from}T00:00:00.000${BOGOTA_OFFSET}`) } : {}),
    ...(to ? { lte: new Date(`${to}T23:59:59.999${BOGOTA_OFFSET}`) } : {}),
  };
}

/** "YYYY-MM-DD" de hoy en Bogotá, sin depender de la zona horaria del proceso Node. */
export function todayBogota(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" }); // en-CA -> YYYY-MM-DD
}

/**
 * "YYYY-MM-DD" del día calendario en Bogotá al que corresponde un timestamp.
 * Reemplaza el patrón `d.toISOString().slice(0, 10)` (que da el día en UTC y
 * desplaza 5h las entregas/movimientos de la noche al día calendario siguiente).
 */
export function toBogotaDateStr(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
}
