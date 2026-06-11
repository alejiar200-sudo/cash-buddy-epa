import type { Request, Response } from "express";
import { getUnifiedMovements } from "../services/unified-movements.service";

export async function list(req: Request, res: Response) {
  const { from, to, limit } = req.query as Record<string, string>;
  const data = await getUnifiedMovements({
    from,
    to,
    limit: limit ? parseInt(limit) : undefined,
  });
  res.json(data);
}
