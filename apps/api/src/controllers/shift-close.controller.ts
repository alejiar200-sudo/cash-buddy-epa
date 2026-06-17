import type { Request, Response } from "express";
import * as svc from "../services/shift-close.service";
import { getExpectedBalancesForDate } from "../services/shipday-dashboard.service";
import { getActor } from "../lib/actor";

export async function getForDate(req: Request, res: Response) {
  res.json(await svc.getShiftsForDate(req.params.date));
}

/** #6 — efectivo y banco esperados calculados automáticamente para la fecha. */
export async function expectedForDate(req: Request, res: Response) {
  const { cash, bank } = await getExpectedBalancesForDate(req.params.date);
  res.json({ date: req.params.date, expectedCash: cash, expectedBank: bank });
}

export async function register(req: Request, res: Response) {
  const actor = getActor(req);
  const date: string = req.body.date;
  const shift: string = req.body.shift;

  // El monto esperado lo decide el SERVIDOR (no el cliente) para que ningún
  // trabajador pueda alterarlo:
  //  - MAÑANA (AM): efectivo esperado calculado de los movimientos del sistema.
  //  - TARDE (PM): es una verificación → el esperado es lo que dejó/contó la mañana.
  let expectedAmount: number;
  if (shift === "PM") {
    const shifts = await svc.getShiftsForDate(date);
    const am = shifts.find(s => s.shift === "AM");
    expectedAmount = am ? am.totalCounted : (await getExpectedBalancesForDate(date)).cash;
  } else {
    expectedAmount = (await getExpectedBalancesForDate(date)).cash;
  }

  res.status(201).json(await svc.registerShift({
    ...req.body,
    expectedAmount,
    createdBy: actor.id,
    createdByName: actor.name,
  }));
}

export async function list(req: Request, res: Response) {
  const { from, to } = req.query as Record<string, string>;
  res.json(await svc.listShifts(from, to));
}

export async function remove(req: Request, res: Response) {
  res.json(await svc.deleteShift(req.params.id));
}
