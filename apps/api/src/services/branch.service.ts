import { prisma } from "../lib/prisma";
import { encryptApiKey, decryptApiKey, DecryptError } from "../lib/crypto";
import * as shipday from "./shipday.service";
import { notFound, conflict } from "../lib/errors";
import { toBogotaDateStr, todayBogota } from "../lib/date-range";

// ─── Cache de settings (evita 1 query por cada orden sincronizada) ────────────
let _settingsCache: { shipdayCommission: number } | null = null;
let _settingsCacheAt = 0;
const SETTINGS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

async function getCachedCommission(): Promise<number> {
  const now = Date.now();
  if (_settingsCache && now - _settingsCacheAt < SETTINGS_CACHE_TTL_MS) {
    return _settingsCache.shipdayCommission;
  }
  const s = await prisma.settings.findUnique({ where: { id: "singleton" } });
  _settingsCache = { shipdayCommission: s?.shipdayCommission ?? 30 };
  _settingsCacheAt = now;
  return _settingsCache.shipdayCommission;
}

export interface BranchInput {
  name: string;
  address?: string;
  phone?: string;
  apiKey: string;
}

function sanitize(b: { id: string; name: string; address: string | null; phone: string | null; active: boolean; syncStatus: string; syncMessage: string | null; lastSyncAt: Date | null; createdAt: Date; updatedAt: Date }) {
  return { ...b, apiKey: "***" };
}

export async function listBranches() {
  const rows = await prisma.branch.findMany({ orderBy: { createdAt: "asc" } });
  return rows.map(sanitize);
}

export async function getBranch(id: string) {
  const row = await prisma.branch.findUnique({ where: { id } });
  if (!row) throw notFound("Sucursal no encontrada");
  return sanitize(row);
}

export async function createBranch(input: BranchInput) {
  const exists = await prisma.branch.findFirst({ where: { name: input.name } });
  if (exists) throw conflict("Ya existe una sucursal con ese nombre");
  const row = await prisma.branch.create({
    data: {
      name: input.name,
      address: input.address,
      phone: input.phone,
      apiKeyEnc: encryptApiKey(input.apiKey),
    },
  });
  return sanitize(row);
}

export async function updateBranch(id: string, input: Partial<BranchInput> & { active?: boolean }) {
  const exists = await prisma.branch.findUnique({ where: { id } });
  if (!exists) throw notFound("Sucursal no encontrada");
  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.address !== undefined) data.address = input.address;
  if (input.phone !== undefined) data.phone = input.phone;
  if (input.active !== undefined) data.active = input.active;
  if (input.apiKey !== undefined) data.apiKeyEnc = encryptApiKey(input.apiKey);
  const row = await prisma.branch.update({ where: { id }, data });
  return sanitize(row);
}

export async function deleteBranch(id: string) {
  const exists = await prisma.branch.findUnique({ where: { id } });
  if (!exists) throw notFound("Sucursal no encontrada");
  await prisma.branch.delete({ where: { id } });
}

export async function testBranchConnection(id: string) {
  const branch = await prisma.branch.findUnique({ where: { id } });
  if (!branch) throw notFound("Sucursal no encontrada");
  const apiKey = decryptApiKey(branch.apiKeyEnc);
  const result = await shipday.testConnection(apiKey);
  await prisma.branch.update({
    where: { id },
    data: {
      syncStatus: result.ok ? "ok" : "error",
      syncMessage: result.message,
    },
  });
  return result;
}

// Caché en memoria de pedidos vistos como activos (pre-entrega), por sucursal.
// Cuando desaparecen del feed activo → se asumen entregados y se registran.
interface ActiveOrderSnapshot {
  shipdayOrderId: string;
  driverShipdayId: string | null;
  deliveryValue: number;
  orderNumber: string | null;
  customerName: string | null;
  customerAddress: string | null;
  raw: object;
}
const activeOrdersByBranch = new Map<string, Map<string, ActiveOrderSnapshot>>();

export async function syncBranch(id: string): Promise<{ drivers: number; orders: number }> {
  const branch = await prisma.branch.findUnique({ where: { id } });
  if (!branch) throw notFound("Sucursal no encontrada");

  let apiKey: string;
  try {
    apiKey = decryptApiKey(branch.apiKeyEnc);
  } catch (err) {
    // Error de descifrado: marcar estado claro y accionable (no silencioso).
    const msg = err instanceof DecryptError
      ? err.message
      : "Error al leer la API Key. Vuelve a guardarla en la sucursal.";
    await prisma.branch.update({
      where: { id },
      data: { syncStatus: "error", syncMessage: msg },
    });
    throw err;
  }

  let driversCount = 0;
  let ordersCount = 0;

  try {
    // 1. Sync drivers
    const shipdayDrivers = await shipday.getDrivers(apiKey);
    for (const sd of shipdayDrivers) {
      await prisma.driver.upsert({
        where: { shipdayDriverId_branchId: { shipdayDriverId: String(sd.id), branchId: id } },
        create: {
          shipdayDriverId: String(sd.id),
          branchId: id,
          name: sd.name,
          phone: sd.phoneNumber ?? null,
          email: sd.email ?? null,
          active: sd.isActive !== false,
        },
        update: {
          name: sd.name,
          phone: sd.phoneNumber ?? null,
          email: sd.email ?? null,
          active: sd.isActive !== false,
        },
      });
      driversCount++;
    }

    // 2. Pedidos — se leen los COMPLETADOS reales desde Shipday (POST /orders/query
    //    con orderStatus=ALREADY_DELIVERED), NO se infiere la entrega por desaparición.
    //    Los pedidos cancelados/eliminados NO aparecen en "completados", así que no
    //    se pueden contar como entregados por error. Se persiste cada completado nuevo
    //    (persistDeliveredOrder ignora los que ya existen) y se acumula la deuda.
    const commissionPercent = await getCachedCommission();

    // Ventana: últimos 7 días (Bogotá). Así, si el sistema estuvo apagado varios
    // días, al encender reconoce automáticamente los completados que falten y los
    // añade (la reconciliación diaria es natural: cada sync revisa esta ventana).
    const to = todayBogota();
    const fromDate = new Date(to + "T00:00:00.000-05:00");
    fromDate.setDate(fromDate.getDate() - 6);
    const from = toBogotaDateStr(fromDate);

    const completed = await shipday.getCompletedOrders(apiKey, from, to);
    for (const co of completed) {
      const orderId = String(co.orderId);
      const created = await persistDeliveredOrder(id, orderId, {
        deliveryValue: shipday.getCompletedDeliveryValue(co),
        driverShipdayId: shipday.getCompletedCarrierId(co),
        orderNumber: co.orderNumber ?? null,
        customerName: co.delivery?.name ?? null,
        customerAddress: co.delivery?.address ?? null,
        deliveredAt: shipday.getCompletedDeliveredAt(co),
        commissionPercent,
        raw: co as object,
      });
      if (created) ordersCount++;
    }

    await prisma.branch.update({
      where: { id },
      data: { syncStatus: "ok", syncMessage: null, lastSyncAt: new Date() },
    });
  } catch (err) {
    await prisma.branch.update({
      where: { id },
      data: { syncStatus: "error", syncMessage: err instanceof Error ? err.message : String(err) },
    });
    throw err;
  }

  return { drivers: driversCount, orders: ordersCount };
}

interface DeliveredPayload {
  deliveryValue: number;
  driverShipdayId: string | null;
  orderNumber: string | null;
  customerName: string | null;
  customerAddress: string | null;
  deliveredAt: Date;
  commissionPercent: number;
  raw: object;
}

async function persistDeliveredOrder(branchId: string, shipdayOrderId: string, p: DeliveredPayload): Promise<boolean> {
  const existing = await prisma.shipdayOrder.findUnique({ where: { shipdayOrderId } });
  if (existing) return false;

  const companyAmount = Math.round(p.deliveryValue * (p.commissionPercent / 100));
  let driverId: string | null = null;
  if (p.driverShipdayId) {
    const d = await prisma.driver.findUnique({
      where: { shipdayDriverId_branchId: { shipdayDriverId: p.driverShipdayId, branchId } },
    });
    driverId = d?.id ?? null;
  }

  const dateStr = toBogotaDateStr(p.deliveredAt);

  // Todas las escrituras en una sola transacción — previene datos inconsistentes en crash
  await prisma.$transaction(async (tx) => {
    await tx.shipdayOrder.create({
      data: {
        shipdayOrderId,
        branchId,
        driverId,
        orderNumber: p.orderNumber,
        deliveryValue: p.deliveryValue,
        companyAmount,
        customerName: p.customerName,
        customerAddress: p.customerAddress,
        status: "DELIVERED",
        deliveredAt: p.deliveredAt,
        rawData: p.raw,
      },
    });

    if (driverId && companyAmount > 0) {
      await tx.driver.update({
        where: { id: driverId },
        data: { pendingDebt: { increment: companyAmount } },
      });
      await tx.dailyDriverStat.upsert({
        where: { date_driverId: { date: dateStr, driverId } },
        create: { date: dateStr, branchId, driverId, orderCount: 1, totalValue: p.deliveryValue, companyTotal: companyAmount },
        update: { orderCount: { increment: 1 }, totalValue: { increment: p.deliveryValue }, companyTotal: { increment: companyAmount } },
      });
    }
  });

  return true;
}

async function getCommissionPercent(): Promise<number> {
  const settings = await prisma.settings.findUnique({ where: { id: "singleton" } });
  return settings?.shipdayCommission ?? 30;
}

/**
 * Reconciliación administrativa: recorre el historial paginado completo de Shipday
 * (no solo el feed de "activos") para un rango de fechas y persiste cualquier pedido
 * DELIVERED/COMPLETED que falte en la BD. Corrige backlog perdido por la limitación
 * de paginación de getAllOrders (ver shipday.service.ts) — por ejemplo, pedidos del
 * día anterior que nunca se sincronizaron porque la cuenta ya tenía muchos pedidos
 * históricos.
 */
export async function reconcileBranch(id: string, from: string, to: string): Promise<{ checked: number; created: number }> {
  const branch = await prisma.branch.findUnique({ where: { id } });
  if (!branch) throw notFound("Sucursal no encontrada");

  const apiKey = decryptApiKey(branch.apiKeyEnc);
  const commissionPercent = await getCachedCommission();
  const delivered = await shipday.getDeliveredOrdersInRange(apiKey, from, to);

  let created = 0;
  for (const so of delivered) {
    const orderId = String(so.orderId);
    const ok = await persistDeliveredOrder(id, orderId, {
      deliveryValue: shipday.getOrderDeliveryValue(so),
      driverShipdayId: shipday.getOrderCarrierId(so),
      orderNumber: so.orderNumber ?? null,
      customerName: so.customer?.name ?? null,
      customerAddress: so.customer?.address ?? null,
      deliveredAt: shipday.getOrderDeliveredAt(so),
      commissionPercent,
      raw: so as object,
    });
    if (ok) created++;
  }

  return { checked: delivered.length, created };
}

export async function syncAllBranches() {
  const branches = await prisma.branch.findMany({ where: { active: true } });
  const results = [];
  for (const b of branches) {
    try {
      const r = await syncBranch(b.id);
      results.push({ branchId: b.id, name: b.name, ...r, ok: true });
    } catch (err) {
      results.push({ branchId: b.id, name: b.name, ok: false, error: String(err) });
    }
  }
  return results;
}
