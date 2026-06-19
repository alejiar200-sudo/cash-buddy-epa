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

  // El monto esperado lo decide el SERVIDOR (no el cliente) para que ningún
  // trabajador pueda alterarlo. SIEMPRE es el efectivo ESPERADO EN VIVO de la
  // fecha = apertura + TODOS los movimientos de efectivo confirmados hasta el
  // momento (bases, pagos, gastos, conversiones…). Es el "valor oficial" de la
  // caja en ese instante, igual para AM, PM y cierre.
  //
  // Antes el PM se comparaba contra lo CONTADO en la mañana (un valor estático),
  // ignorando los movimientos de efectivo de la tarde y mostrando un descuadre
  // falso igual a esos movimientos (p. ej. −$179.000 por bases entregadas después
  // del cierre AM, aunque la caja estuviera perfecta).
  const expectedAmount = (await getExpectedBalancesForDate(date)).cash;

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
