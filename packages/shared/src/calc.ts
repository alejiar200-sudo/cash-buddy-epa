// ====== Lógica de negocio pura (fuente única compartida) ======
// El backend la usa como cálculo autoritativo (expuesto vía API) y el
// frontend la reutiliza para renderizar sin divergencias.

import type { DayData, Movement } from "./domain";
import type { CourierStatus, DayBalances, DeliveryEntry } from "./dto";

export function dayBalances(day: Pick<DayData, "initialCash" | "initialBank" | "movements">): DayBalances {
  let cash = day.initialCash;
  let bank = day.initialBank;
  for (const m of day.movements) {
    if (m.status !== "confirmed") continue;
    const d = m.type === "ingreso" ? m.amount : -m.amount;
    if (m.medium === "cash") cash += d;
    else bank += d;
  }
  return { cash, bank, total: cash + bank };
}

export function balancesAtEndOfDay(
  movements: Movement[],
  initialCash: number,
  initialBank: number,
): { cash: number; bank: number } {
  let cash = initialCash;
  let bank = initialBank;
  for (const m of movements) {
    if (m.status !== "confirmed") continue;
    const delta = m.type === "ingreso" ? m.amount : -m.amount;
    if (m.medium === "cash") cash += delta;
    else bank += delta;
  }
  return { cash, bank };
}

export function courierStatusForDay(
  day: Pick<DayData, "movements">,
  workerId: string,
): CourierStatus {
  let baseGiven = 0;
  let baseReturned = 0;
  let dCashPending = 0;
  let dCashConfirmed = 0;
  let dBankPending = 0;
  let dBankConfirmed = 0;

  for (const m of day.movements) {
    if (m.workerId !== workerId) continue;
    if (m.category === 5 && m.medium === "cash") {
      if (m.type === "egreso") baseGiven += m.amount;
      else baseReturned += m.amount;
    }
    if (m.category === 1 && m.medium === "cash") {
      if (m.status === "confirmed") dCashConfirmed += m.amount;
      else dCashPending += m.amount;
    }
    if (m.category === 2 && m.medium === "bank") {
      if (m.status === "confirmed") dBankConfirmed += m.amount;
      else dBankPending += m.amount;
    }
  }

  const totalOwed = baseGiven + dCashPending + dCashConfirmed + dBankPending + dBankConfirmed;
  const totalReturned = baseReturned + dCashConfirmed + dBankConfirmed;

  let status: CourierStatus["status"] = "idle";
  if (
    baseGiven === 0 &&
    dCashPending === 0 &&
    dCashConfirmed === 0 &&
    dBankPending === 0 &&
    dBankConfirmed === 0
  ) {
    status = "idle";
  } else if (totalReturned >= totalOwed && totalOwed > 0) {
    status = "ok";
  } else if (totalReturned === 0) {
    status = "debt";
  } else {
    status = "partial";
  }

  return {
    workerId,
    baseGiven,
    baseReturned,
    deliveriesCashPending: dCashPending,
    deliveriesCashConfirmed: dCashConfirmed,
    deliveriesBankPending: dBankPending,
    deliveriesBankConfirmed: dBankConfirmed,
    status,
    totalOwed,
    totalReturned,
  };
}

export function deliveriesForDay(
  day: Pick<DayData, "movements">,
  workerId: string,
): DeliveryEntry[] {
  return day.movements
    .filter((m) => m.workerId === workerId && m.kind === "delivery")
    .map((m) => {
      const comm = day.movements.find((c) => c.kind === "commission" && c.deliveryId === m.id);
      return {
        movement: m,
        value: m.amount,
        commission: comm?.amount ?? 0,
        received: m.status === "confirmed",
      };
    });
}
