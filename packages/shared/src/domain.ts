// ====== Tipos del dominio Cash Buddy EPA ======
// Compartidos entre el backend (Express) y el frontend (Next.js).

export type Role = "domiciliario" | "administrativo";

export type UserRole = "admin" | "user";

export interface Worker {
  id: string;
  name: string;
  role: Role;
  active: boolean;
  color: string;
}

/**
 * Códigos de categoría (internos):
 *  1 Domicilios Efectivo (ing) | 2 Domicilios Banco (ing)
 *  3 Gasto Efectivo (egr)      | 4 Gasto Banco (egr)
 *  5 Base Efectivo             | 6 Base Banco
 *  7 Ingreso efectivo (conv)   | 8 Salidas Banco
 *  9 Salida efectivo (conv)    | 10 Ingreso Banco (conv)
 * 11 Salida Temporal Efectivo  | 12 Salida Temporal Banco
 * 13 Ingreso Pendiente Ef.     | 14 Ingreso Pendiente Banco
 * 15 Nomina Efectivo           | 18 Nomina Banco
 */
export type CategoryCode =
  | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 18;

export type Medium = "cash" | "bank";
export type MovementType = "ingreso" | "egreso";
export type MovementStatus = "pending" | "confirmed";
export type MovementKind = "commission" | "delivery";

export interface Movement {
  id: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  category: CategoryCode;
  type: MovementType;
  medium: Medium;
  amount: number;
  workerId?: string | null;
  description?: string | null;
  status: MovementStatus;
  group?: string | null;
  kind?: MovementKind | null;
  deliveryId?: string | null;
  deliveryValue?: number | null;
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
  arqueoAM?: Arqueo | null;
  arqueoPM?: Arqueo | null;
  arqueoClose?: Arqueo | null;
}

export interface Settings {
  companyName: string;
  initialCash: number;
  initialBank: number;
  setupComplete: boolean;
  commissionPercent: number;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}
