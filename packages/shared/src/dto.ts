import type {
  Arqueo,
  CategoryCode,
  Medium,
  Movement,
  MovementKind,
  MovementStatus,
  MovementType,
  Role,
} from "./domain";

// ====== DTOs de entrada (requests) ======

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
}

export interface AuthResponse {
  token: string;
  user: { id: string; email: string; name: string; role: "admin" | "user" };
}

export interface CreateMovementRequest {
  date: string;
  category: CategoryCode;
  type: MovementType;
  medium: Medium;
  amount: number;
  workerId?: string | null;
  description?: string | null;
  status?: MovementStatus;
  time?: string;
  group?: string | null;
  kind?: MovementKind | null;
  deliveryId?: string | null;
  deliveryValue?: number | null;
}

export type UpdateMovementRequest = Partial<CreateMovementRequest>;

export interface CreateWorkerRequest {
  name: string;
  role: Role;
  active: boolean;
  color?: string;
}

export type UpdateWorkerRequest = Partial<CreateWorkerRequest>;

export interface UpdateSettingsRequest {
  companyName?: string;
  brandName?: string;
  logoData?: string | null;
  termsAcceptedAt?: string | null;
  initialCash?: number;
  initialBank?: number;
  setupComplete?: boolean;
  commissionPercent?: number;
}

export interface UpdateArqueoRequest {
  slot: "AM" | "PM" | "close";
  arqueo: Arqueo;
}

// ====== DTOs derivados (responses calculadas en el backend) ======

export interface DayBalances {
  cash: number;
  bank: number;
  total: number;
}

export interface CourierStatus {
  workerId: string;
  baseGiven: number;
  baseReturned: number;
  deliveriesCashPending: number;
  deliveriesCashConfirmed: number;
  deliveriesBankPending: number;
  deliveriesBankConfirmed: number;
  status: "ok" | "debt" | "partial" | "idle";
  totalOwed: number;
  totalReturned: number;
}

export interface DeliveryEntry {
  movement: Movement;
  value: number;
  commission: number;
  received: boolean;
}

export interface CommissionRow {
  id: string;
  date: string;
  deliveryValue: number;
  commission: number;
  status: MovementStatus;
  medium: Medium;
}

export interface PayrollPayment {
  id: string;
  date: string;
  amount: number;
  medium: Medium;
  status: MovementStatus;
  concept?: string | null;
}

export interface PayrollSummary {
  payments: PayrollPayment[];
  pending: number;
  paid: number;
}
