import type { Request, Response } from "express";
import * as workerService from "../services/worker.service";

export async function list(_req: Request, res: Response) {
  res.json(await workerService.listWorkers());
}

export async function create(req: Request, res: Response) {
  res.status(201).json(await workerService.createWorker(req.body));
}

export async function update(req: Request, res: Response) {
  res.json(await workerService.updateWorker(req.params.id, req.body));
}

export async function remove(req: Request, res: Response) {
  await workerService.deleteWorker(req.params.id);
  res.status(204).end();
}
