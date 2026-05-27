import type { NextFunction, Request, Response } from "express";
import { ZodError, type ZodSchema } from "zod";
import { badRequest } from "../lib/errors";

type Source = "body" | "query" | "params";

export function validate(schema: ZodSchema, source: Source = "body") {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      const parsed = schema.parse(req[source]);
      // Reemplaza con los datos validados/normalizados.
      Reflect.set(req, source, parsed);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        return next(badRequest("Datos inválidos", err.flatten()));
      }
      next(err);
    }
  };
}
