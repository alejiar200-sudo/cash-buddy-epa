import type { Request, Response } from "express";
import * as settingsService from "../services/settings.service";

export async function get(_req: Request, res: Response) {
  res.json(await settingsService.getSettings());
}

export async function update(req: Request, res: Response) {
  res.json(await settingsService.updateSettings(req.body));
}
