import type { Request, Response } from "express";
import * as movementService from "../services/movement.service";

export async function list(req: Request, res: Response) {
  const date = typeof req.query.date === "string" ? req.query.date : undefined;
  res.json(await movementService.listMovements(date));
}

export async function create(req: Request, res: Response) {
  res.status(201).json(await movementService.addMovement(req.body));
}

export async function update(req: Request, res: Response) {
  res.json(await movementService.updateMovement(req.params.id, req.body));
}

export async function remove(req: Request, res: Response) {
  await movementService.deleteMovement(req.params.id);
  res.status(204).end();
}
