import type { Request, Response } from "express";
import * as svc from "../services/base.service";
import { getActor } from "../lib/actor";

export async function list(req: Request, res: Response) {
  const { branchId, driverId } = req.query as Record<string, string>;
  res.json(await svc.listBases(branchId, driverId));
}

export async function give(req: Request, res: Response) {
  const actor = getActor(req);
  res.status(201).json(await svc.giveBase(req.params.driverId, { ...req.body, createdBy: actor.id, createdByName: actor.name }));
}

export async function pay(req: Request, res: Response) {
  const actor = getActor(req);
  res.status(201).json(await svc.payBase(req.params.driverId, { ...req.body, createdBy: actor.id, createdByName: actor.name }));
}

export async function summary(req: Request, res: Response) {
  res.json(await svc.getBaseSummary(req.params.driverId));
}
