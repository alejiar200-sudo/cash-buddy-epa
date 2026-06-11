import type { Request, Response } from "express";
import * as settingsService from "../services/settings.service";

export async function get(_req: Request, res: Response) {
  res.json(await settingsService.getSettings());
}

export async function update(req: Request, res: Response) {
  res.json(await settingsService.updateSettings(req.body));
}

// Branding público (sin auth) — para la pantalla de login
export async function branding(_req: Request, res: Response) {
  const s = await settingsService.getSettings();
  res.json({ companyName: s.companyName, brandName: s.brandName ?? "Cash Buddy", logoData: s.logoData ?? null });
}
