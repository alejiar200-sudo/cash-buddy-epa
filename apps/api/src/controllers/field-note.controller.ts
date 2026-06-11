import type { Request, Response } from "express";
import * as service from "../services/field-note.service";

export async function list(req: Request, res: Response) {
  const date = typeof req.query.date === "string" ? req.query.date : undefined;
  res.json(await service.listNotes(date));
}

export async function create(req: Request, res: Response) {
  const { content, author, date } = req.body as { content?: string; author?: string; date?: string };
  if (!content || !content.trim()) {
    return res.status(400).json({ error: "El contenido no puede estar vacío" });
  }
  res.status(201).json(await service.createNote(content.trim(), author, date));
}

export async function update(req: Request, res: Response) {
  const { content } = req.body as { content?: string };
  if (!content || !content.trim()) {
    return res.status(400).json({ error: "El contenido no puede estar vacío" });
  }
  res.json(await service.updateNote(req.params.id, content.trim()));
}

export async function remove(req: Request, res: Response) {
  await service.deleteNote(req.params.id);
  res.status(204).end();
}
