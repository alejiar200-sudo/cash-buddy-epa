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

// ---- Auth ----
apiRouter.post("/auth/login", validate(loginSchema), asyncHandler(auth.login));
apiRouter.post("/auth/register", validate(registerSchema), asyncHandler(auth.register));
apiRouter.get("/auth/me", requireAuth, asyncHandler(auth.me));

// ---- A partir de aquí, todo requiere autenticación ----
apiRouter.use(requireAuth);

// ---- Settings ----
apiRouter.get("/settings", asyncHandler(settings.get));
apiRouter.patch("/settings", validate(updateSettingsSchema), asyncHandler(settings.update));

// ---- Workers ----
apiRouter.get("/workers", asyncHandler(workers.list));
apiRouter.post("/workers", validate(createWorkerSchema), asyncHandler(workers.create));
apiRouter.patch("/workers/:id", validate(updateWorkerSchema), asyncHandler(workers.update));
apiRouter.delete("/workers/:id", asyncHandler(workers.remove));

// ---- Days / Arqueos ----
apiRouter.get("/days", asyncHandler(days.list));
apiRouter.get("/days/:date", asyncHandler(days.get));
apiRouter.put("/days/:date/arqueo", validate(updateArqueoSchema), asyncHandler(days.updateArqueo));

// ---- Movements ----
apiRouter.get("/movements", asyncHandler(movements.list));
apiRouter.post("/movements", validate(createMovementSchema), asyncHandler(movements.create));
apiRouter.patch("/movements/:id", validate(updateMovementSchema), asyncHandler(movements.update));
apiRouter.delete("/movements/:id", asyncHandler(movements.remove));

// ---- Reports (derivados) ----
apiRouter.get("/reports/couriers/:date", asyncHandler(reports.couriersByDay));
apiRouter.get("/reports/couriers/:date/:workerId", asyncHandler(reports.courierByWorker));
apiRouter.get("/reports/couriers/:date/:workerId/deliveries", asyncHandler(reports.courierDeliveries));
apiRouter.get("/reports/commissions/:workerId", asyncHandler(reports.commissions));
apiRouter.get("/reports/payroll/:workerId", asyncHandler(reports.payroll));

// ---- Admin ----
apiRouter.post("/admin/reset", requireAdmin, asyncHandler(admin.reset));
