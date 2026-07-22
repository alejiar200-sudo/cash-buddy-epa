import type { Request, Response } from "express";
import * as dayService from "../services/day.service";
import { dayBalances } from "../services/calc";

export async function get(req: Request, res: Response) {
  const day = await dayService.getDay(req.params.date);
  res.json({ ...day, balances: dayBalances(day) });
}

export async function list(_req: Request, res: Response) {
  res.json(await dayService.listDays());
}

/** Resumen detallado del día para el Historial (todas las fuentes, no solo Caja). */
export async function summary(req: Request, res: Response) {
  res.json(await dayService.getDaySummary(req.params.date));
}

/** Resúmenes de un rango de días (calendario/tabla del Historial), con saldos reales. */
export async function summaries(req: Request, res: Response) {
  const from = String(req.query.from ?? "");
  const to = String(req.query.to ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return res.status(400).json({ error: "from/to requeridos (YYYY-MM-DD)" });
  }
  res.json(await dayService.getDaySummariesRange(from, to));
}

export async function updateArqueo(req: Request, res: Response) {
  const { slot, arqueo } = req.body;
  const day = await dayService.updateArqueo(req.params.date, slot, arqueo);
  res.json({ ...day, balances: dayBalances(day) });
}
