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
  // El monto esperado SIEMPRE lo calcula el servidor (efectivo del sistema para la
  // fecha). Se ignora cualquier valor enviado por el cliente para que ningún
  // trabajador pueda alterar cuánto efectivo debería haber.
  const date: string = req.body.date;
  const { cash } = await getExpectedBalancesForDate(date);
  res.status(201).json(await svc.registerShift({
    ...req.body,
    expectedAmount: cash,
    createdBy: actor.id,
    createdByName: actor.name,
  }));
}

export async function list(req: Request, res: Response) {
  const { from, to } = req.query as Record<string, string>;
  res.json(await svc.listShifts(from, to));
}
