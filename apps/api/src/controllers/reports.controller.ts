import type { Request, Response } from "express";
import * as reports from "../services/reports.service";

export async function couriersByDay(req: Request, res: Response) {
  res.json(await reports.courierStatusesForDay(req.params.date));
}

export async function courierByWorker(req: Request, res: Response) {
  res.json(await reports.courierStatusForWorker(req.params.date, req.params.workerId));
}

export async function courierDeliveries(req: Request, res: Response) {
  res.json(await reports.courierDeliveries(req.params.date, req.params.workerId));
}

export async function commissions(req: Request, res: Response) {
  const month = typeof req.query.month === "string" ? req.query.month : undefined;
  res.json(await reports.commissionsForWorker(req.params.workerId, month));
}

export async function payroll(req: Request, res: Response) {
  const month = typeof req.query.month === "string" ? req.query.month : "";
  res.json(await reports.fixedPayrollForWorker(req.params.workerId, month));
}
