import type { Request, Response } from "express";
import * as svc from "../services/edit-request.service";

export async function list(req: Request, res: Response) {
  const status = req.query.status as "pending" | "approved" | "rejected" | undefined;
  res.json(await svc.listRequests(status));
}

export async function countPending(_req: Request, res: Response) {
  res.json({ count: await svc.countPending() });
}

export async function create(req: Request, res: Response) {
  const requesterId = req.user!.sub;
  const { entityType, entityId, entityLabel, changes, reason, requestType } = req.body;
  res.status(201).json(await svc.createRequest({
    requesterId, entityType, entityId, entityLabel, changes: changes ?? {}, reason, requestType,
  }));
}

export async function recalcOrders(_req: Request, res: Response) {
  res.json(await svc.recalcAllOrders());
}

export async function review(req: Request, res: Response) {
  const reviewerId = req.user!.sub;
  const { action, notes } = req.body;
  res.json(await svc.reviewRequest(req.params.id, reviewerId, action, notes));
}
