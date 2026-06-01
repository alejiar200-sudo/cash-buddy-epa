import { prisma } from "../lib/prisma";
import { encryptApiKey, decryptApiKey } from "../lib/crypto";
import * as shipday from "./shipday.service";
import { notFound, conflict } from "../lib/errors";

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

export async function syncBranch(id: string): Promise<{ drivers: number; orders: number }> {
  const branch = await prisma.branch.findUnique({ where: { id } });
  if (!branch) throw notFound("Sucursal no encontrada");
  const apiKey = decryptApiKey(branch.apiKeyEnc);

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

    // 2. Sync orders — estrategia dual:
    //    A) Pedidos activos: capturar mientras están en progreso (STARTED, etc.)
    //    B) Pedidos completados: Shipday los elimina de la API al completarlos,
    //       por eso los marcamos como completados cuando desaparecen del API activo.
    const allActiveOrders = await shipday.getAllOrders(apiKey);
    const commissionPercent = await getCommissionPercent();
    const activeIds = new Set(allActiveOrders.map(o => String(o.orderId)));

    // B) Detectar pedidos que antes estaban activos y ahora desaparecieron → completados
    const pendingInDb = await prisma.shipdayOrder.findMany({
      where: { branchId: id, status: { in: ["STARTED", "ACCEPTED", "ASSIGNED", "PICKED_UP", "IN_PROGRESS"] } },
    });
    for (const dbOrder of pendingInDb) {
      if (!activeIds.has(dbOrder.shipdayOrderId)) {
        // Desapareció del API activo → se completó
        await prisma.shipdayOrder.update({
          where: { id: dbOrder.id },
          data: { status: "DELIVERED", deliveredAt: new Date() },
        });
        // Calcular deuda si aún no se calculó (companyAmount > 0 y driver asignado)
        if (dbOrder.driverId && dbOrder.companyAmount > 0) {
          await prisma.driver.update({
            where: { id: dbOrder.driverId },
            data: { pendingDebt: { increment: dbOrder.companyAmount } },
          });
          const dateStr = new Date().toISOString().slice(0, 10);
          await prisma.dailyDriverStat.upsert({
            where: { date_driverId: { date: dateStr, driverId: dbOrder.driverId } },
            create: { date: dateStr, branchId: id, driverId: dbOrder.driverId, orderCount: 1, totalValue: dbOrder.deliveryValue, companyTotal: dbOrder.companyAmount },
            update: { orderCount: { increment: 1 }, totalValue: { increment: dbOrder.deliveryValue }, companyTotal: { increment: dbOrder.companyAmount } },
          });
        }
        ordersCount++;
      }
    }

    // A) Registrar pedidos activos nuevos (para detectar su finalización en el próximo sync)
    for (const so of allActiveOrders) {
      const orderId = String(so.orderId);
      const existing = await prisma.shipdayOrder.findUnique({ where: { shipdayOrderId: orderId } });
      if (existing) continue;

      const deliveryValue = shipday.getOrderDeliveryValue(so);
      const companyAmount = Math.round(deliveryValue * (commissionPercent / 100));

      let driverId: string | null = null;
      const carrierId = shipday.getOrderCarrierId(so);
      if (carrierId) {
        const driver = await prisma.driver.findUnique({
          where: { shipdayDriverId_branchId: { shipdayDriverId: carrierId, branchId: id } },
        });
        driverId = driver?.id ?? null;
      }

      const currentState = so.orderStatus?.orderState ?? "STARTED";
      const isDelivered = ["DELIVERED", "COMPLETED"].includes(currentState);

      const order = await prisma.shipdayOrder.create({
        data: {
          shipdayOrderId: orderId,
          branchId: id,
          driverId,
          orderNumber: so.orderNumber ?? null,
          deliveryValue,
          companyAmount,
          customerName: so.customer?.name ?? null,
          customerAddress: so.customer?.address ?? null,
          status: currentState,
          deliveredAt: isDelivered ? shipday.getOrderDeliveredAt(so) : null,
          rawData: so as object,
        },
      });

      // Si ya llega como DELIVERED directamente, acumular deuda inmediatamente
      if (isDelivered && driverId && companyAmount > 0) {
        await prisma.driver.update({
          where: { id: driverId },
          data: { pendingDebt: { increment: companyAmount } },
        });
        const dateStr = (order.deliveredAt ?? new Date()).toISOString().slice(0, 10);
        await prisma.dailyDriverStat.upsert({
          where: { date_driverId: { date: dateStr, driverId } },
          create: { date: dateStr, branchId: id, driverId, orderCount: 1, totalValue: deliveryValue, companyTotal: companyAmount },
          update: { orderCount: { increment: 1 }, totalValue: { increment: deliveryValue }, companyTotal: { increment: companyAmount } },
        });
        ordersCount++;
      }
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
