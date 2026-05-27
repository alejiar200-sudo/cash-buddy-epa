import type { NextFunction, Request, Response } from "express";
import { HttpError } from "../lib/errors";

export function notFoundHandler(req: Request, res: Response, next: NextFunction) {
  if (req.path.startsWith("/api")) {
    return res.status(404).json({ error: "Ruta no encontrada" });
  }
  next();
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, details: err.details });
  }
  console.error("[error]", err);
  res.status(500).json({ error: "Error interno del servidor" });
}

// Envuelve handlers async para propagar errores al errorHandler.
export function asyncHandler<T extends (req: Request, res: Response, next: NextFunction) => Promise<unknown>>(
  fn: T,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
