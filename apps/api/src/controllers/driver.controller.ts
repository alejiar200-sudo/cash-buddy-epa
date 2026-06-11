import type { Request, Response } from "express";
import * as svc from "../services/driver.service";
import { getActor } from "../lib/actor";

export async function list(req: Request, res: Response) {
  const branchId = req.query.branchId as string | undefined;
  res.json(await svc.listDrivers(branchId));
}

export async function detail(req: Request, res: Response) {
  res.json(await svc.getDriverDetail(req.params.id));
}

export async function statement(req: Request, res: Response) {
  res.json(await svc.getDriverStatement(req.params.id));
}

export async function registerPayment(req: Request, res: Response) {
  const { amount, medium, notes } = req.body;
  res.status(201).json(await svc.registerPayment(req.params.id, Number(amount), medium, notes, getActor(req)));
}

export async function ordersToday(req: Request, res: Response) {
  const branchId = (req.query.branchId as string | undefined) || undefined;
  res.json(await svc.getOrdersToday(branchId));
}
