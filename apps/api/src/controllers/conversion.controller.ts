import type { Request, Response } from "express";
import * as svc from "../services/conversion.service";

export async function list(req: Request, res: Response) {
  const { branchId, from, to } = req.query as Record<string, string>;
  res.json(await svc.listConversions(branchId, from, to));
}

export async function create(req: Request, res: Response) {
  const userId = (req as Request & { user?: { id: string } }).user?.id;
  res.status(201).json(await svc.createConversion({ ...req.body, userId }));
}

export async function remove(req: Request, res: Response) {
  await svc.deleteConversion(req.params.id);
  res.status(204).end();
}
