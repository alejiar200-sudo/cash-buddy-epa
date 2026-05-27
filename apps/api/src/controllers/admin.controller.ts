import type { Request, Response } from "express";
import * as adminService from "../services/admin.service";

export async function reset(_req: Request, res: Response) {
  await adminService.resetAll();
  res.status(204).end();
}
