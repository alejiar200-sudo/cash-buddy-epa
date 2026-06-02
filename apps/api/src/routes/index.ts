import { Router } from "express";
import { requireAdmin, requireAuth } from "../middlewares/auth";
import { asyncHandler } from "../middlewares/error";
import { validate } from "../middlewares/validate";
import * as auth from "../controllers/auth.controller";
import * as settings from "../controllers/settings.controller";
import * as workers from "../controllers/worker.controller";
import * as days from "../controllers/day.controller";
import * as movements from "../controllers/movement.controller";
import * as reports from "../controllers/reports.controller";
import * as admin from "../controllers/admin.controller";
import * as branch from "../controllers/branch.controller";
import * as driver from "../controllers/driver.controller";
import * as base from "../controllers/base.controller";
import * as conversion from "../controllers/conversion.controller";
import * as sdDashboard from "../controllers/shipday-dashboard.controller";
import * as close from "../controllers/close.controller";
import * as webhook from "../controllers/webhook.controller";
import * as order from "../controllers/order.controller";
import {
  createMovementSchema,
  createWorkerSchema,
  loginSchema,
  registerSchema,
  updateArqueoSchema,
  updateMovementSchema,
  updateSettingsSchema,
  updateWorkerSchema,
} from "../validators/schemas";

export const apiRouter = Router();

apiRouter.get("/health", (_req, res) => res.json({ ok: true }));

// ─── Auth ─────────────────────────────────────────────────────────────────────
apiRouter.post("/auth/login", validate(loginSchema), asyncHandler(auth.login));
apiRouter.post("/auth/register", validate(registerSchema), asyncHandler(auth.register));
apiRouter.get("/auth/me", requireAuth, asyncHandler(auth.me));

// ─── Webhooks Shipday (no requieren auth — vienen de Shipday) ─────────────────
apiRouter.post("/webhooks/shipday/:branchId", asyncHandler(webhook.shipdayWebhook));

// ─── A partir de aquí, todo requiere autenticación ───────────────────────────
apiRouter.use(requireAuth);

// ─── Settings ─────────────────────────────────────────────────────────────────
apiRouter.get("/settings", asyncHandler(settings.get));
apiRouter.patch("/settings", validate(updateSettingsSchema), asyncHandler(settings.update));

// ─── Workers (sistema original) ───────────────────────────────────────────────
apiRouter.get("/workers", asyncHandler(workers.list));
apiRouter.post("/workers", validate(createWorkerSchema), asyncHandler(workers.create));
apiRouter.patch("/workers/:id", validate(updateWorkerSchema), asyncHandler(workers.update));
apiRouter.delete("/workers/:id", asyncHandler(workers.remove));

// ─── Days / Arqueos ───────────────────────────────────────────────────────────
apiRouter.get("/days", asyncHandler(days.list));
apiRouter.get("/days/:date", asyncHandler(days.get));
apiRouter.put("/days/:date/arqueo", validate(updateArqueoSchema), asyncHandler(days.updateArqueo));

// ─── Movements ────────────────────────────────────────────────────────────────
apiRouter.get("/movements", asyncHandler(movements.list));
apiRouter.post("/movements", validate(createMovementSchema), asyncHandler(movements.create));
apiRouter.patch("/movements/:id", validate(updateMovementSchema), asyncHandler(movements.update));
apiRouter.delete("/movements/:id", asyncHandler(movements.remove));

// ─── Reports (sistema original) ───────────────────────────────────────────────
apiRouter.get("/reports/couriers/:date", asyncHandler(reports.couriersByDay));
apiRouter.get("/reports/couriers/:date/:workerId", asyncHandler(reports.courierByWorker));
apiRouter.get("/reports/couriers/:date/:workerId/deliveries", asyncHandler(reports.courierDeliveries));
apiRouter.get("/reports/commissions/:workerId", asyncHandler(reports.commissions));
apiRouter.get("/reports/payroll/:workerId", asyncHandler(reports.payroll));

// ─── Admin ────────────────────────────────────────────────────────────────────
apiRouter.post("/admin/reset", requireAdmin, asyncHandler(admin.reset));

// ─── Sucursales ───────────────────────────────────────────────────────────────
apiRouter.get("/branches", asyncHandler(branch.list));
apiRouter.get("/branches/:id", asyncHandler(branch.get));
apiRouter.post("/branches", asyncHandler(branch.create));
apiRouter.patch("/branches/:id", asyncHandler(branch.update));
apiRouter.delete("/branches/:id", requireAdmin, asyncHandler(branch.remove));
apiRouter.post("/branches/:id/test-connection", asyncHandler(branch.testConnection));
apiRouter.post("/branches/:id/sync", asyncHandler(branch.sync));
apiRouter.post("/branches/sync-all", asyncHandler(branch.syncAll));

// ─── Domiciliarios Shipday ────────────────────────────────────────────────────
apiRouter.get("/sd/drivers", asyncHandler(driver.list));
apiRouter.get("/sd/orders/today", asyncHandler(driver.ordersToday));
apiRouter.get("/sd/drivers/:id", asyncHandler(driver.detail));
apiRouter.get("/sd/drivers/:id/statement", asyncHandler(driver.statement));
apiRouter.post("/sd/drivers/:id/payment", asyncHandler(driver.registerPayment));

// ─── Bases ────────────────────────────────────────────────────────────────────
apiRouter.get("/sd/bases", asyncHandler(base.list));
apiRouter.post("/sd/bases/:driverId/give", asyncHandler(base.give));
apiRouter.post("/sd/bases/:driverId/pay", asyncHandler(base.pay));
apiRouter.get("/sd/bases/:driverId/summary", asyncHandler(base.summary));

// ─── Conversiones ─────────────────────────────────────────────────────────────
apiRouter.get("/sd/conversions", asyncHandler(conversion.list));
apiRouter.post("/sd/conversions", asyncHandler(conversion.create));
apiRouter.delete("/sd/conversions/:id", asyncHandler(conversion.remove));

// ─── Dashboard Shipday ────────────────────────────────────────────────────────
apiRouter.get("/sd/dashboard", asyncHandler(sdDashboard.dashboard));
apiRouter.get("/sd/dashboard/daily/:date", asyncHandler(sdDashboard.dailyStats));
apiRouter.get("/sd/dashboard/debts", asyncHandler(sdDashboard.debtsDashboard));
apiRouter.get("/sd/dashboard/orders/:branchId", asyncHandler(sdDashboard.ordersByBranch));

// ─── Pedidos ──────────────────────────────────────────────────────────────────
apiRouter.post("/sd/orders/manual", asyncHandler(order.manualCreate));

// ─── Cierres mensuales ────────────────────────────────────────────────────────
apiRouter.get("/sd/closes", asyncHandler(close.list));
apiRouter.post("/sd/closes", asyncHandler(close.close));
apiRouter.get("/sd/closes/:id", asyncHandler(close.get));
apiRouter.get("/sd/closes/export/:month", asyncHandler(close.exportExcel));
