import type { Request, Response } from "express";
import * as svc from "../services/branch.service";

export async function list(_req: Request, res: Response) {
  res.json(await svc.listBranches());
}

export async function get(req: Request, res: Response) {
  res.json(await svc.getBranch(req.params.id));
}

export async function create(req: Request, res: Response) {
  res.status(201).json(await svc.createBranch(req.body));
}

export async function update(req: Request, res: Response) {
  res.json(await svc.updateBranch(req.params.id, req.body));
}

export async function remove(req: Request, res: Response) {
  await svc.deleteBranch(req.params.id);
  res.status(204).end();
}

export async function testConnection(req: Request, res: Response) {
  res.json(await svc.testBranchConnection(req.params.id));
}

// Sync manual (admin): barrido amplio (últimos 7 días) y refresca domiciliarios,
// para recuperar de inmediato cualquier pedido que faltara. El limitador de tasa
// lo espacia solo si hace falta, sin riesgo de saturar Shipday.
export async function sync(req: Request, res: Response) {
  res.json(await svc.syncBranch(req.params.id, { windowDays: 7, forceDrivers: true }));
}

export async function syncAll(_req: Request, res: Response) {
  res.json(await svc.syncAllBranches({ windowDays: 7, forceDrivers: true }));
}

export async function startOrders(req: Request, res: Response) {
  res.json(await svc.startOrdersFromToday(req.params.id));
}

export async function reconcile(req: Request, res: Response) {
  const { from, to } = req.body as { from?: string; to?: string };
  if (!from || !to) {
    res.status(400).json({ error: "from y to (YYYY-MM-DD) son requeridos" });
    return;
  }
  res.json(await svc.reconcileBranch(req.params.id, from, to));
}
