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

export async function sync(req: Request, res: Response) {
  res.json(await svc.syncBranch(req.params.id));
}

export async function syncAll(_req: Request, res: Response) {
  res.json(await svc.syncAllBranches());
}
