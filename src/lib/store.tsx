import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { todayISO, uid, nowTime } from "./format";

export type Role = "domiciliario" | "administrativo";

export interface Worker {
  id: string;
  name: string;
  role: Role;
  active: boolean;
  color: string;
}

/**
 * Category codes (internal):
 *  1 Domicilios Efectivo (ing) | 2 Domicilios Banco (ing)
 *  3 Gasto Efectivo (egr)      | 4 Gasto Banco (egr)
 *  5 Base Efectivo             | 6 Base Banco
 *  7 Ingreso efectivo (conv)   | 8 Salidas Banco
 *  9 Salida efectivo (conv)    | 10 Ingreso Banco (conv)
 * 11 Salida Temporal Efectivo  | 12 Salida Temporal Banco
 * 13 Ingreso Pendiente Ef.     | 14 Ingreso Pendiente Banco
 * 15 Nomina Efectivo           | 18 Nomina Banco
 */
export type CategoryCode = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 18;

export type Medium = "cash" | "bank";
export type MovementType = "ingreso" | "egreso";
export type MovementStatus = "pending" | "confirmed";

export interface Movement {
  id: string;
  date: string;            // YYYY-MM-DD
  time: string;            // HH:mm
  category: CategoryCode;
  type: MovementType;
  medium: Medium;
  amount: number;
  workerId?: string;
  description?: string;
  status: MovementStatus;  // pending counts only when confirmed
  // For courier flow we link delivery movements to base
  group?: string;          // groups related entries (base + delivery + return)
}

export interface Arqueo {
  bills?: number;
  coins?: number;
  bank?: number;
}

export interface DayData {
  date: string;
  initialCash: number;
  initialBank: number;
  movements: Movement[];
  arqueoAM?: Arqueo;
  arqueoPM?: Arqueo;
  arqueoClose?: Arqueo;
}

export interface Settings {
  companyName: string;
  initialCash: number;
  initialBank: number;
  setupComplete: boolean;
}

export interface AppState {
  settings: Settings;
  workers: Worker[];
  days: Record<string, DayData>;
}

const STORAGE_KEY = "epa.v1";

const PALETTE = [
  "#00E676", "#00B0FF", "#FFB300", "#FF7043", "#AB47BC",
  "#26C6DA", "#EC407A", "#9CCC65", "#FFCA28", "#5C6BC0",
  "#FF5252", "#66BB6A", "#42A5F5", "#FFA726",
];

const DEFAULT_WORKERS = [
  "Norberto","Yirelmi","Zenider","Luis","Pablo","Edgar","Andrey",
  "Eliecer","Miguel","Yanca","Eduardo","Alejandro","Moisés","Victor",
];

function defaultState(): AppState {
  return {
    settings: {
      companyName: "Epa",
      initialCash: 300000,
      initialBank: 103130,
      setupComplete: false,
    },
    workers: DEFAULT_WORKERS.map((name, i) => ({
      id: uid(),
      name,
      role: "domiciliario",
      active: true,
      color: PALETTE[i % PALETTE.length],
    })),
    days: {},
  };
}

interface Ctx {
  state: AppState;
  setState: (updater: (s: AppState) => AppState) => void;
  getDay: (date: string) => DayData;
  ensureDay: (date: string) => void;
  addMovement: (date: string, m: Omit<Movement, "id" | "date" | "time" | "status"> & { status?: MovementStatus; time?: string }) => Movement;
  updateMovement: (date: string, id: string, patch: Partial<Movement>) => void;
  deleteMovement: (date: string, id: string) => void;
  addWorker: (w: Omit<Worker, "id" | "color"> & { color?: string }) => void;
  updateWorker: (id: string, patch: Partial<Worker>) => void;
  resetAll: () => void;
}

const StoreCtx = createContext<Ctx | null>(null);

function load(): AppState {
  if (typeof window === "undefined") return defaultState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    return JSON.parse(raw) as AppState;
  } catch {
    return defaultState();
  }
}

function save(s: AppState) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {}
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, _setState] = useState<AppState>(() => defaultState());
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    _setState(load());
    setHydrated(true);
  }, []);

  useEffect(() => { if (hydrated) save(state); }, [state, hydrated]);

  const setState: Ctx["setState"] = (updater) => _setState((s) => updater(s));

  function previousDayDate(date: string): string | null {
    const dates = Object.keys(state.days).filter((d) => d < date).sort();
    return dates.length ? dates[dates.length - 1] : null;
  }

  function balancesAtEndOfDay(date: string, s: AppState): { cash: number; bank: number } {
    const day = s.days[date];
    if (!day) return { cash: 0, bank: 0 };
    let cash = day.initialCash;
    let bank = day.initialBank;
    for (const m of day.movements) {
      if (m.status !== "confirmed") continue;
      const delta = m.type === "ingreso" ? m.amount : -m.amount;
      if (m.medium === "cash") cash += delta;
      else bank += delta;
    }
    return { cash, bank };
  }

  function ensureDay(date: string) {
    _setState((s) => {
      if (s.days[date]) return s;
      // find latest prior day
      const priorDates = Object.keys(s.days).filter((d) => d < date).sort();
      let initialCash = s.settings.initialCash;
      let initialBank = s.settings.initialBank;
      if (priorDates.length) {
        const prev = priorDates[priorDates.length - 1];
        const bal = balancesAtEndOfDay(prev, s);
        initialCash = bal.cash;
        initialBank = bal.bank;
      }
      return {
        ...s,
        days: { ...s.days, [date]: { date, initialCash, initialBank, movements: [] } },
      };
    });
  }

  const getDay: Ctx["getDay"] = (date) => {
    return state.days[date] ?? { date, initialCash: state.settings.initialCash, initialBank: state.settings.initialBank, movements: [] };
  };

  const addMovement: Ctx["addMovement"] = (date, m) => {
    const mv: Movement = {
      id: uid(),
      date,
      time: m.time ?? nowTime(),
      status: m.status ?? "confirmed",
      category: m.category,
      type: m.type,
      medium: m.medium,
      amount: m.amount,
      workerId: m.workerId,
      description: m.description,
      group: m.group,
    };
    _setState((s) => {
      const day = s.days[date] ?? { date, initialCash: s.settings.initialCash, initialBank: s.settings.initialBank, movements: [] };
      return { ...s, days: { ...s.days, [date]: { ...day, movements: [...day.movements, mv] } } };
    });
    return mv;
  };

  const updateMovement: Ctx["updateMovement"] = (date, id, patch) => {
    _setState((s) => {
      const day = s.days[date];
      if (!day) return s;
      return {
        ...s,
        days: { ...s.days, [date]: { ...day, movements: day.movements.map((m) => m.id === id ? { ...m, ...patch } : m) } },
      };
    });
  };

  const deleteMovement: Ctx["deleteMovement"] = (date, id) => {
    _setState((s) => {
      const day = s.days[date];
      if (!day) return s;
      return { ...s, days: { ...s.days, [date]: { ...day, movements: day.movements.filter((m) => m.id !== id) } } };
    });
  };

  const addWorker: Ctx["addWorker"] = (w) => {
    _setState((s) => ({
      ...s,
      workers: [...s.workers, { id: uid(), name: w.name, role: w.role, active: w.active, color: w.color ?? PALETTE[s.workers.length % PALETTE.length] }],
    }));
  };

  const updateWorker: Ctx["updateWorker"] = (id, patch) => {
    _setState((s) => ({ ...s, workers: s.workers.map((w) => w.id === id ? { ...w, ...patch } : w) }));
  };

  const resetAll = () => { _setState(defaultState()); };

  const value = useMemo<Ctx>(() => ({
    state, setState, getDay, ensureDay, addMovement, updateMovement, deleteMovement, addWorker, updateWorker, resetAll,
  }), [state]);

  // touch unused vars to avoid TS warnings
  void previousDayDate;

  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreCtx);
  if (!ctx) throw new Error("useStore must be used inside StoreProvider");
  return ctx;
}

// ----- Derived helpers -----

export function dayBalances(day: DayData) {
  let cash = day.initialCash;
  let bank = day.initialBank;
  for (const m of day.movements) {
    if (m.status !== "confirmed") continue;
    const d = m.type === "ingreso" ? m.amount : -m.amount;
    if (m.medium === "cash") cash += d; else bank += d;
  }
  return { cash, bank, total: cash + bank };
}

export interface CourierStatus {
  workerId: string;
  baseGiven: number;          // total cash base entregada hoy (cat 5 egreso cash, confirmed)
  baseReturned: number;       // base devuelta (cat 5 ingreso cash, confirmed)
  deliveriesCashPending: number;
  deliveriesCashConfirmed: number;
  deliveriesBankPending: number;
  deliveriesBankConfirmed: number;
  status: "ok" | "debt" | "partial" | "idle";
  totalOwed: number;          // base + deliveries
  totalReturned: number;      // base returned + deliveries confirmed
}

export function courierStatusForDay(day: DayData, workerId: string): CourierStatus {
  let baseGiven = 0, baseReturned = 0;
  let dCashPending = 0, dCashConfirmed = 0, dBankPending = 0, dBankConfirmed = 0;
  for (const m of day.movements) {
    if (m.workerId !== workerId) continue;
    if (m.category === 5 && m.medium === "cash") {
      if (m.type === "egreso") baseGiven += m.amount;          // we give base => cash out
      else baseReturned += m.amount;                            // courier returns base
    }
    if (m.category === 1 && m.medium === "cash") {
      if (m.status === "confirmed") dCashConfirmed += m.amount; else dCashPending += m.amount;
    }
    if (m.category === 2 && m.medium === "bank") {
      if (m.status === "confirmed") dBankConfirmed += m.amount; else dBankPending += m.amount;
    }
  }
  const totalOwed = baseGiven + dCashPending + dCashConfirmed + dBankPending + dBankConfirmed;
  const totalReturned = baseReturned + dCashConfirmed + dBankConfirmed;

  let status: CourierStatus["status"] = "idle";
  if (baseGiven === 0 && dCashPending === 0 && dCashConfirmed === 0 && dBankPending === 0 && dBankConfirmed === 0) {
    status = "idle";
  } else if (totalReturned >= totalOwed && totalOwed > 0) {
    status = "ok";
  } else if (totalReturned === 0) {
    status = "debt";
  } else {
    status = "partial";
  }
  return {
    workerId, baseGiven, baseReturned,
    deliveriesCashPending: dCashPending, deliveriesCashConfirmed: dCashConfirmed,
    deliveriesBankPending: dBankPending, deliveriesBankConfirmed: dBankConfirmed,
    status, totalOwed, totalReturned,
  };
}

export const CATEGORY_LABEL: Record<CategoryCode, string> = {
  1: "Domicilios efectivo",
  2: "Domicilios banco",
  3: "Gasto efectivo",
  4: "Gasto banco",
  5: "Base efectivo",
  6: "Base banco",
  7: "Ingreso efectivo (conv)",
  8: "Salida banco",
  9: "Salida efectivo (conv)",
  10: "Ingreso banco (conv)",
  11: "Salida temporal efectivo",
  12: "Salida temporal banco",
  13: "Ingreso pendiente efectivo",
  14: "Ingreso pendiente banco",
  15: "Nómina efectivo",
  18: "Nómina banco",
};
