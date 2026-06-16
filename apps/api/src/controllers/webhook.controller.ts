import type { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { toBogotaDateStr } from "../lib/date-range";

const DELIVERED_STATUSES = new Set(["DELIVERED", "COMPLETED", "Delivered", "Completed"]);

const WEBHOOK_TOKEN = process.env.WEBHOOK_TOKEN ?? "cashbuddy-epa-2026";

export async function shipdayWebhook(req: Request, res: Response) {
  const { branchId } = req.params;

  // Verificar token si Shipday lo envía como header o query param
  const token = req.headers["x-shipday-token"] ?? req.headers["authorization"] ?? req.query.token;
  if (WEBHOOK_TOKEN && token && token !== WEBHOOK_TOKEN && token !== `Bearer ${WEBHOOK_TOKEN}`) {
    return res.status(401).json({ error: "Token inválido" });
  }

  const body = req.body;
  // Shipday webhook payload varies — handle both single order and array
  const orders: unknown[] = Array.isArray(body) ? body : [body];

  let processed = 0;
  for (const raw of orders) {
    const o = raw as Record<string, unknown>;
    const orderId = String(o.orderId ?? o.id ?? "");
    const statusObj = o.orderStatus as Record<string, unknown> | undefined;
    const statusRaw = String(statusObj?.orderState ?? o.orderStatus ?? o.status ?? "");

    if (!orderId || !DELIVERED_STATUSES.has(statusRaw)) continue;

    const existing = await prisma.shipdayOrder.findUnique({ where: { shipdayOrderId: orderId } });
    if (existing) continue;

    const settings = await prisma.settings.findUnique({ where: { id: "singleton" } });
    const commissionPercent = settings?.shipdayCommission ?? 30;

    const costing = (o.costing ?? {}) as Record<string, unknown>;
    const customer = (o.customer ?? {}) as Record<string, unknown>;
    const activityLog = (o.activityLog ?? {}) as Record<string, unknown>;

    const deliveryValue = Math.round(Number(costing.deliveryFee ?? costing.totalCost ?? 0));
    const companyAmount = Math.round(deliveryValue * (commissionPercent / 100));

    let driverId: string | null = null;
    const carrierId = o.assignedCarrierId ?? (o.assignedCarrier as Record<string, unknown> | undefined)?.id;
    if (carrierId) {
      const driver = await prisma.driver.findUnique({
        where: { shipdayDriverId_branchId: { shipdayDriverId: String(carrierId), branchId } },
      });
      driverId = driver?.id ?? null;
    }

    const order = await prisma.shipdayOrder.create({
      data: {
        shipdayOrderId: orderId,
        branchId,
        driverId,
        orderNumber: String(o.orderNumber ?? ""),
        deliveryValue,
        companyAmount,
        customerName: String(customer.name ?? ""),
        customerAddress: String(customer.address ?? ""),
        status: statusRaw,
        deliveredAt: activityLog.deliveryTime ? new Date(String(activityLog.deliveryTime)) : new Date(),
        rawData: o,
      },
    });

    if (driverId && companyAmount > 0) {
      await prisma.driver.update({ where: { id: driverId }, data: { pendingDebt: { increment: companyAmount } } });
      const dateStr = toBogotaDateStr(order.deliveredAt ?? new Date());
      await prisma.dailyDriverStat.upsert({
        where: { date_driverId: { date: dateStr, driverId } },
        create: { date: dateStr, branchId, driverId, orderCount: 1, totalValue: deliveryValue, companyTotal: companyAmount },
        update: { orderCount: { increment: 1 }, totalValue: { increment: deliveryValue }, companyTotal: { increment: companyAmount } },
      });
    }

    processed++;
  }

  res.json({ ok: true, processed });
}
