/**
 * Cliente HTTP para la API oficial de Shipday.
 * Auth: Authorization: Basic <apiKey>  (la key va cruda, sin base64)
 *
 * IMPORTANTE: La API requiere al menos ?pageSize=N para devolver pedidos.
 * Sin parámetros de paginación, siempre devuelve [].
 */

const BASE_URL = "https://api.shipday.com";

export interface ShipdayDriver {
  id: number;
  name: string;
  phoneNumber?: string;
  email?: string;
  isActive?: boolean;
}

export interface ShipdayOrder {
  orderId: number | string;
  orderNumber?: string;
  orderStatus?: {
    incomplete?: boolean;
    accepted?: boolean;
    orderState?: string;  // "STARTED" | "DELIVERED" | "COMPLETED" | "FAILED" | ...
  };
  assignedCarrierId?: number;
  assignedCarrier?: {
    id?: number;
    name?: string;
    phoneNumber?: string;
  };
  customer?: {
    name?: string;
    address?: string;
    phoneNumber?: string;
  };
  costing?: {
    totalCost?: number;
    deliveryFee?: number;
    tip?: number;
  };
  activityLog?: {
    placementTime?: string;
    deliveryTime?: string;        // fecha real de entrega
    expectedDeliveryTime?: string;
  };
  restaurant?: {
    name?: string;
    address?: string;
  };
  deliveryInstruction?: string;
}

const DELIVERED_STATES = new Set(["DELIVERED", "COMPLETED", "delivered", "completed"]);

async function shipdayFetch<T>(apiKey: string, path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      Authorization: `Basic ${apiKey}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (res.status === 401 || res.status === 403) {
      throw new Error(`API Key de Shipday inválida o sin permisos (${res.status}).`);
    }
    throw new Error(`Shipday API error ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export async function getDrivers(apiKey: string): Promise<ShipdayDriver[]> {
  const data = await shipdayFetch<ShipdayDriver[] | { carriers?: ShipdayDriver[] }>(apiKey, "/carriers");
  if (Array.isArray(data)) return data;
  return (data as { carriers?: ShipdayDriver[] }).carriers ?? [];
}

export async function getAllOrders(apiKey: string, pageSize = 200): Promise<ShipdayOrder[]> {
  // La API de Shipday REQUIERE parámetros de paginación para retornar pedidos del dashboard.
  // Sin parámetros siempre devuelve [].
  const data = await shipdayFetch<ShipdayOrder[]>(apiKey, `/orders?pageSize=${pageSize}`);
  return Array.isArray(data) ? data : [];
}

export async function getDeliveredOrders(apiKey: string): Promise<ShipdayOrder[]> {
  const all = await getAllOrders(apiKey);
  return all.filter(o => {
    const state = o.orderStatus?.orderState ?? "";
    return DELIVERED_STATES.has(state);
  });
}

export function getOrderDeliveryValue(order: ShipdayOrder): number {
  return Math.round(order.costing?.deliveryFee ?? order.costing?.totalCost ?? 0);
}

export function getOrderCarrierId(order: ShipdayOrder): string | null {
  const id = order.assignedCarrierId ?? order.assignedCarrier?.id;
  return id ? String(id) : null;
}

export function getOrderDeliveredAt(order: ShipdayOrder): Date {
  const t = order.activityLog?.deliveryTime;
  return t ? new Date(t) : new Date();
}

export async function testConnection(apiKey: string): Promise<{ ok: boolean; message: string; driverCount?: number }> {
  try {
    const drivers = await getDrivers(apiKey);
    return {
      ok: true,
      message: `Conexión exitosa con Shipday (${drivers.length} domiciliarios)`,
      driverCount: drivers.length,
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}
