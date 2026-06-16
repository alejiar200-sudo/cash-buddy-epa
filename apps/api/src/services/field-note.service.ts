import { prisma } from "../lib/prisma";
import { todayBogota } from "../lib/date-range";

function today(): string {
  return todayBogota();
}

/** Lista notas. Si se pasa `date` (YYYY-MM-DD) filtra solo las de ese día. */
export async function listNotes(date?: string) {
  return prisma.fieldNote.findMany({
    where: date ? { date } : undefined,
    orderBy: { createdAt: "desc" },
  });
}

export async function createNote(content: string, author?: string | null, date?: string) {
  return prisma.fieldNote.create({
    data: { content, author: author ?? null, date: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : today() },
  });
}

export async function updateNote(id: string, content: string) {
  return prisma.fieldNote.update({ where: { id }, data: { content } });
}

export async function deleteNote(id: string) {
  await prisma.fieldNote.delete({ where: { id } });
}
