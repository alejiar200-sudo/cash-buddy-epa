import type { Request, Response } from "express";
import * as closeSvc from "../services/close.service";
import * as excelSvc from "../services/excel.service";
import { getActor } from "../lib/actor";

export async function close(req: Request, res: Response) {
  const { month, branchId, initialCash, initialBank } = req.body;
  res.status(201).json(await closeSvc.closeMonth(month, branchId, initialCash, initialBank, getActor(req)));
}

export async function list(req: Request, res: Response) {
  const branchId = req.query.branchId as string | undefined;
  res.json(await closeSvc.listCloses(branchId));
}

export async function report(req: Request, res: Response) {
  const branchId = req.query.branchId as string | undefined;
  res.json(await closeSvc.getMonthlyReport(req.params.month, branchId));
}

/** #5 — proyección del capital físico a dejar según capital objetivo. */
export async function projection(req: Request, res: Response) {
  const branchId = req.query.branchId as string | undefined;
  const targetCash = Number(req.query.targetCash ?? 0);
  const targetBank = Number(req.query.targetBank ?? 0);
  res.json(await closeSvc.getMonthCloseProjection(req.params.month, targetCash, targetBank, branchId));
}

export async function get(req: Request, res: Response) {
  const result = await closeSvc.getClose(req.params.id);
  if (!result) return res.status(404).json({ error: "Cierre no encontrado" });
  res.json(result);
}

export async function exportExcel(req: Request, res: Response) {
  const { month } = req.params;
  const branchId = req.query.branchId as string | undefined;
  const buffer = await excelSvc.buildMonthlyExcel(month, branchId);
  const filename = `cashbuddy-${month}${branchId ? "-" + branchId.slice(0, 8) : ""}.xlsx`;
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(buffer);
}
