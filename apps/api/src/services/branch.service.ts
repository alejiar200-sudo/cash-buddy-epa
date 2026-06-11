import { prisma } from "../lib/prisma";
import { encryptApiKey, decryptApiKey, DecryptError } from "../lib/crypto";
import * as shipday from "./shipday.service";
import { notFound, conflict } from "../lib/errors";

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

    // 2. Pedidos — solo guardamos en BD los DELIVERED/COMPLETED.
    //    Los activos quedan en caché en memoria; cuando desaparecen del feed,
    //    asumimos entrega y recién ahí se persiste el pedido + se acumula deuda.
    const allActiveOrders = await shipday.getAllOrders(apiKey);
    const commissionPercent = await getCachedCommission();
    const previousActive = activeOrdersByBranch.get(id) ?? new Map<string, ActiveOrderSnapshot>();
    const nextActive = new Map<string, ActiveOrderSnapshot>();

    // a) Procesar feed actual: separar DELIVERED (persistir) vs activos (cachear).
    const seenIds = new Set<string>();
    for (const so of allActiveOrders) {
      const orderId = String(so.orderId);
      seenIds.add(orderId);
      const currentState = so.orderStatus?.orderState ?? "STARTED";
      const isDelivered = ["DELIVERED", "COMPLETED"].includes(currentState);

      if (isDelivered) {
        const created = await persistDeliveredOrder(id, orderId, {
          deliveryValue: shipday.getOrderDeliveryValue(so),
          driverShipdayId: shipday.getOrderCarrierId(so),
          orderNumber: so.orderNumber ?? null,
          customerName: so.customer?.name ?? null,
          customerAddress: so.customer?.address ?? null,
          deliveredAt: shipday.getOrderDeliveredAt(so),
          commissionPercent,
          raw: so as object,
        });
        if (created) ordersCount++;
      } else {
        nextActive.set(orderId, {
          shipdayOrderId: orderId,
          driverShipdayId: shipday.getOrderCarrierId(so),
          deliveryValue: shipday.getOrderDeliveryValue(so),
          orderNumber: so.orderNumber ?? null,
          customerName: so.customer?.name ?? null,
          customerAddress: so.customer?.address ?? null,
          raw: so as object,
        });
      }
    }

    // b) Pedidos que estaban activos en memoria y ya no aparecen → asumir entregados.
    for (const [orderId, snap] of previousActive) {
      if (seenIds.has(orderId)) continue;
      const created = await persistDeliveredOrder(id, orderId, {
        deliveryValue: snap.deliveryValue,
        driverShipdayId: snap.driverShipdayId,
        orderNumber: snap.orderNumber,
        customerName: snap.customerName,
        customerAddress: snap.customerAddress,
        deliveredAt: new Date(),
        commissionPercent,
        raw: snap.raw,
      });
      if (created) ordersCount++;
    }

    // c) Fallback: pedidos guardados en BD con estado activo (de versiones previas
    //    o reinicios) que ya no aparecen en el feed → flip a DELIVERED y acumular deuda.
    const orphanActive = await prisma.shipdayOrder.findMany({
      where: { branchId: id, status: { in: ["STARTED", "ACCEPTED", "ASSIGNED", "PICKED_UP", "IN_PROGRESS"] } },
    });
    for (const dbOrder of orphanActive) {
      if (seenIds.has(dbOrder.shipdayOrderId)) continue;
      const now = new Date();
      await prisma.shipdayOrder.update({
        where: { id: dbOrder.id },
        data: { status: "DELIVERED", deliveredAt: now },
      });
      if (dbOrder.driverId && dbOrder.companyAmount > 0) {
        await prisma.driver.update({
          where: { id: dbOrder.driverId },
          data: { pendingDebt: { increment: dbOrder.companyAmount } },
        });
        const dateStr = now.toISOString().slice(0, 10);
        await prisma.dailyDriverStat.upsert({
          where: { date_driverId: { date: dateStr, driverId: dbOrder.driverId } },
          create: { date: dateStr, branchId: id, driverId: dbOrder.driverId, orderCount: 1, totalValue: dbOrder.deliveryValue, companyTotal: dbOrder.companyAmount },
          update: { orderCount: { increment: 1 }, totalValue: { increment: dbOrder.deliveryValue }, companyTotal: { increment: dbOrder.companyAmount } },
        });
      }
      ordersCount++;
    }

    activeOrdersByBranch.set(id, nextActive);

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

  const dateStr = p.deliveredAt.toISOString().slice(0, 10);

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
