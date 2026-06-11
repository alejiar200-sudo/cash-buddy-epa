import type { Request, Response } from "express";
import * as svc from "../services/user.service";

export async function list(_req: Request, res: Response) {
  res.json(await svc.listUsers());
}

export async function create(req: Request, res: Response) {
  res.status(201).json(await svc.createUser(req.body));
}

export async function update(req: Request, res: Response) {
  res.json(await svc.updateUser(req.params.id, req.body));
}

export async function remove(req: Request, res: Response) {
  await svc.deleteUser(req.params.id);
  res.json({ ok: true });
}
