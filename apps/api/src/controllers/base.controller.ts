import type { Request, Response } from "express";
import * as svc from "../services/base.service";

export async function list(req: Request, res: Response) {
  const { branchId, driverId } = req.query as Record<string, string>;
  res.json(await svc.listBases(branchId, driverId));
}

export async function give(req: Request, res: Response) {
  const { amount, notes } = req.body;
  res.status(201).json(await svc.giveBase(req.params.driverId, amount, notes));
}

export async function pay(req: Request, res: Response) {
  const { amount, notes } = req.body;
  res.status(201).json(await svc.payBase(req.params.driverId, amount, notes));
}

export async function summary(req: Request, res: Response) {
  res.json(await svc.getBaseSummary(req.params.driverId));
}
