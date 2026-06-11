import type { Request } from "express";

export interface Actor {
  id: string | null;
  name: string | null;
}

/** Extrae el usuario autenticado del request para trazabilidad. */
export function getActor(req: Request): Actor {
  const u = req.user;
  return { id: u?.sub ?? null, name: u?.name ?? u?.email ?? null };
}
