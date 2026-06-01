/**
 * Cliente fetch para los endpoints Shipday del backend.
 */

function getToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("cashbuddy.token");
}

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

// ─── Branches ────────────────────────────────────────────────────────────────

export const getBranches = () => apiFetch<Branch[]>("/branches");
export const createBranch = (data: BranchInput) =>
  apiFetch<Branch>("/branches", { method: "POST", body: JSON.stringify(data) });
export const updateBranch = (id: string, data: Partial<BranchInput> & { active?: boolean }) =>
  apiFetch<Branch>(`/branches/${id}`, { method: "PATCH", body: JSON.stringify(data) });
export const deleteBranch = (id: string) =>
  apiFetch<void>(`/branches/${id}`, { method: "DELETE" });
export const testConnection = (id: string) =>
  apiFetch<{ ok: boolean; message: string }>(`/branches/${id}/test-connection`, { method: "POST" });
export const syncBranch = (id: string) =>
  apiFetch<{ drivers: number; orders: number }>(`/branches/${id}/sync`, { method: "POST" });
export const syncAll = () =>
  apiFetch<SyncResult[]>("/branches/sync-all", { method: "POST" });

// ─── Drivers ─────────────────────────────────────────────────────────────────

export const getDrivers = (branchId?: string) =>
  apiFetch<Driver[]>(`/sd/drivers${branchId ? `?branchId=${branchId}` : ""}`);
export const getDriverDetail = (id: string) => apiFetch<DriverDetail>(`/sd/drivers/${id}`);
export const getDriverStatement = (id: string) => apiFetch<DriverStatement>(`/sd/drivers/${id}/statement`);
export const registerPayment = (id: string, amount: number, notes?: string) =>
  apiFetch(`/sd/drivers/${id}/payment`, { method: "POST", body: JSON.stringify({ amount, notes }) });

// ─── Bases ────────────────────────────────────────────────────────────────────

export const getBases = (params?: { branchId?: string; driverId?: string }) => {
  const q = new URLSearchParams(Object.entries(params ?? {}).filter(([, v]) => v) as [string, string][]);
  return apiFetch<BaseTransaction[]>(`/sd/bases${q.toString() ? "?" + q : ""}`);
};
export const giveBase = (driverId: string, amount: number, notes?: string) =>
  apiFetch(`/sd/bases/${driverId}/give`, { method: "POST", body: JSON.stringify({ amount, notes }) });
export const payBase = (driverId: string, amount: number, notes?: string) =>
  apiFetch(`/sd/bases/${driverId}/pay`, { method: "POST", body: JSON.stringify({ amount, notes }) });
export const getBaseSummary = (driverId: string) => apiFetch<BaseSummary>(`/sd/bases/${driverId}/summary`);

// ─── Conversions ──────────────────────────────────────────────────────────────

export const getConversions = (params?: { branchId?: string; from?: string; to?: string }) => {
  const q = new URLSearchParams(Object.entries(params ?? {}).filter(([, v]) => v) as [string, string][]);
  return apiFetch<Conversion[]>(`/sd/conversions${q.toString() ? "?" + q : ""}`);
};
export const createConversion = (data: ConversionInput) =>
  apiFetch<Conversion>("/sd/conversions", { method: "POST", body: JSON.stringify(data) });
export const deleteConversion = (id: string) =>
  apiFetch<void>(`/sd/conversions/${id}`, { method: "DELETE" });

// ─── Dashboard ────────────────────────────────────────────────────────────────

export const getDashboard = (branchId?: string) =>
  apiFetch<DashboardData>(`/sd/dashboard${branchId ? `?branchId=${branchId}` : ""}`);
export const getDailyStats = (date: string, branchId?: string) =>
  apiFetch<DailyStat[]>(`/sd/dashboard/daily/${date}${branchId ? `?branchId=${branchId}` : ""}`);
export const getDebtsDashboard = (branchId?: string) =>
  apiFetch<DriverDebt[]>(`/sd/dashboard/debts${branchId ? `?branchId=${branchId}` : ""}`);
export const getOrdersByBranch = (branchId: string, from?: string, to?: string) => {
  const q = new URLSearchParams(Object.entries({ from, to }).filter(([, v]) => v) as [string, string][]);
  return apiFetch<Order[]>(`/sd/dashboard/orders/${branchId}${q.toString() ? "?" + q : ""}`);
};

// ─── Orders ───────────────────────────────────────────────────────────────────

export const createManualOrder = (data: {
  branchId: string;
  driverId?: string;
  deliveryValue: number;
  orderNumber?: string;
  customerName?: string;
  notes?: string;
}) => apiFetch<Order>("/sd/orders/manual", { method: "POST", body: JSON.stringify(data) });

// ─── Closes ───────────────────────────────────────────────────────────────────

export const getCloses = (branchId?: string) =>
  apiFetch<MonthlyClose[]>(`/sd/closes${branchId ? `?branchId=${branchId}` : ""}`);
export const createClose = (month: string, branchId?: string) =>
  apiFetch<MonthlyClose>("/sd/closes", { method: "POST", body: JSON.stringify({ month, branchId }) });
export const exportExcel = async (month: string, branchId?: string) => {
  const token = getToken();
  const q = branchId ? `?branchId=${branchId}` : "";
  const res = await fetch(`/api/sd/closes/export/${month}${q}`, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  if (!res.ok) throw new Error("Error al generar Excel");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `cashbuddy-${month}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Branch {
  id: string;
  name: string;
  address?: string;
  phone?: string;
  active: boolean;
  syncStatus: "ok" | "error" | "never";
  syncMessage?: string;
  lastSyncAt?: string;
  createdAt: string;
}

export interface BranchInput {
  name: string;
  address?: string;
  phone?: string;
  apiKey: string;
}

export interface SyncResult {
  branchId: string;
  name: string;
  ok: boolean;
  drivers?: number;
  orders?: number;
  error?: string;
}

export interface Driver {
  id: string;
  shipdayDriverId: string;
  branchId: string;
  name: string;
  phone?: string;
  active: boolean;
  pendingDebt: number;
  branch: { id: string; name: string };
  createdAt: string;
}

export interface DriverDetail extends Driver {
  orders: Order[];
  bases: BaseTransaction[];
  payments: Payment[];
  dailyStats: DailyStat[];
}

export interface DriverStatement {
  driver: Driver;
  totalOrders: number;
  totalValue: number;
  totalCompany: number;
  totalBasesGiven: number;
  totalBasesPaid: number;
  totalPaid: number;
  pendingDebt: number;
  orders: Order[];
  bases: BaseTransaction[];
  payments: Payment[];
  stats: DailyStat[];
}

export interface Order {
  id: string;
  shipdayOrderId: string;
  branchId: string;
  driverId?: string;
  orderNumber?: string;
  deliveryValue: number;
  companyAmount: number;
  customerName?: string;
  customerAddress?: string;
  status: string;
  deliveredAt?: string;
  driver?: { id: string; name: string };
  branch?: { id: string; name: string };
}

export interface BaseTransaction {
  id: string;
  branchId: string;
  driverId: string;
  amount: number;
  type: "entrega" | "pago";
  notes?: string;
  date: string;
  driver?: { id: string; name: string };
  branch?: { id: string; name: string };
}

export interface Payment {
  id: string;
  driverId: string;
  amount: number;
  notes?: string;
  date: string;
}

export interface BaseSummary {
  given: number;
  paid: number;
  pending: number;
  history: BaseTransaction[];
}

export interface ConversionInput {
  branchId: string;
  amount: number;
  type: "banco_a_efectivo" | "efectivo_a_banco";
  notes?: string;
  date?: string;
}

export interface Conversion {
  id: string;
  branchId: string;
  amount: number;
  type: "banco_a_efectivo" | "efectivo_a_banco";
  notes?: string;
  date: string;
  branch?: { id: string; name: string };
}

export interface DashboardData {
  today: { orders: number; value: number; company: number };
  month: { orders: number; value: number; company: number };
  drivers: { total: number; active: number };
  debts: { totalAmount: number; driverCount: number };
  recentOrders: Order[];
  branches: { id: string; name: string; syncStatus: string; lastSyncAt?: string }[];
}

export interface DailyStat {
  id: string;
  date: string;
  branchId: string;
  driverId: string;
  orderCount: number;
  totalValue: number;
  companyTotal: number;
  driver?: { id: string; name: string };
  branch?: { id: string; name: string };
}

export interface DriverDebt {
  id: string;
  name: string;
  pendingDebt: number;
  branch: { id: string; name: string };
}

export interface MonthlyClose {
  id: string;
  branchId?: string;
  month: string;
  totalOrders: number;
  totalValue: number;
  companyTotal: number;
  basesGiven: number;
  basesPaid: number;
  basesPending: number;
  conversions: unknown;
  closedAt: string;
  branch?: { id: string; name: string };
}
