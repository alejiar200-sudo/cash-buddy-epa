import type { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { badRequest, notFound } from "../lib/errors";

export async function manualCreate(req: Request, res: Response) {
  const { branchId, driverId, deliveryValue, orderNumber, customerName, notes } = req.body;
  if (!branchId || !deliveryValue) throw badRequest("branchId y deliveryValue son requeridos");

  const branch = await prisma.branch.findUnique({ where: { id: branchId } });
  if (!branch) throw notFound("Sucursal no encontrada");

  const settings = await prisma.settings.findUnique({ where: { id: "singleton" } });
  const commissionPercent = settings?.shipdayCommission ?? 30;
  const companyAmount = Math.round(deliveryValue * (commissionPercent / 100));

  const order = await prisma.shipdayOrder.create({
    data: {
      shipdayOrderId: `manual-${Date.now()}`,
      branchId,
      driverId: driverId || null,
      orderNumber: orderNumber || null,
      deliveryValue: Math.round(deliveryValue),
      companyAmount,
      customerName: customerName || null,
      status: "DELIVERED",
      deliveredAt: new Date(),
      rawData: { manual: true, notes },
    },
  });

  if (driverId && companyAmount > 0) {
    await prisma.driver.update({
      where: { id: driverId },
      data: { pendingDebt: { increment: companyAmount } },
    });
    const dateStr = new Date().toISOString().slice(0, 10);
    await prisma.dailyDriverStat.upsert({
      where: { date_driverId: { date: dateStr, driverId } },
      create: { date: dateStr, branchId, driverId, orderCount: 1, totalValue: Math.round(deliveryValue), companyTotal: companyAmount },
      update: { orderCount: { increment: 1 }, totalValue: { increment: Math.round(deliveryValue) }, companyTotal: { increment: companyAmount } },
    });
  }

  res.status(201).json({ ...order, companyAmount });
}
