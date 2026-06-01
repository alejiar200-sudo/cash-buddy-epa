import type { Request, Response } from "express";
import * as svc from "../services/shipday-dashboard.service";

export async function dashboard(req: Request, res: Response) {
  const branchId = req.query.branchId as string | undefined;
  res.json(await svc.getDashboard(branchId));
}

export async function dailyStats(req: Request, res: Response) {
  const branchId = req.query.branchId as string | undefined;
  res.json(await svc.getDailyStats(req.params.date, branchId));
}

export async function debtsDashboard(req: Request, res: Response) {
  const branchId = req.query.branchId as string | undefined;
  res.json(await svc.getDebtsDashboard(branchId));
}

export async function ordersByBranch(req: Request, res: Response) {
  const { from, to } = req.query as Record<string, string>;
  res.json(await svc.getOrdersByBranch(req.params.branchId, from, to));
}
