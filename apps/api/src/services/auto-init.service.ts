// Auto-inicialización del backend al primer arranque del .exe en un PC nuevo:
// 1) Si el esquema no existe, aplica la migración SQL de Prisma.
// 2) Si no hay settings, los crea con valores por defecto.
// 3) Si no hay usuarios, crea el admin con ADMIN_EMAIL/ADMIN_PASSWORD del .env.
// (Ya NO se siembran trabajadores por defecto: los domiciliarios vienen de Shipday.)
// Idempotente: seguro de ejecutar en cada arranque.

import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import { env } from "../config/env";

function findMigrationSql(): string | null {
  // En el .exe: resources/api/prisma/migrations/<ts>_init/migration.sql
  // En dev:    apps/api/prisma/migrations/<ts>_init/migration.sql
  const candidates = [
    path.join(__dirname, "..", "..", "prisma", "migrations"),
    path.join(__dirname, "..", "prisma", "migrations"),
    path.join(process.cwd(), "prisma", "migrations"),
  ];
  for (const dir of candidates) {
    if (!fs.existsSync(dir)) continue;
    const subs = fs
      .readdirSync(dir)
      .filter((s) => fs.statSync(path.join(dir, s)).isDirectory())
      .sort();
    for (const sub of subs) {
      const sql = path.join(dir, sub, "migration.sql");
      if (fs.existsSync(sql)) return fs.readFileSync(sql, "utf8");
    }
  }
  return null;
}

async function schemaExists(): Promise<boolean> {
  try {
    await prisma.$queryRawUnsafe('SELECT 1 FROM "User" LIMIT 1');
    return true;
  } catch {
    return false;
  }
}

async function applySchema() {
  const sql = findMigrationSql();
  if (!sql) {
    console.error("[init] migration.sql no encontrado");
    return;
  }
  // Prisma envía cada query como prepared statement (1 sentencia por llamada),
  // así que dividimos el SQL en sentencias y las ejecutamos una a una.
  // Las migraciones que genera Prisma terminan cada sentencia con ";\n".
  const statements = sql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  for (const stmt of statements) {
    await prisma.$executeRawUnsafe(stmt);
  }
  console.log(`[init] ✓ Esquema creado (${statements.length} sentencias)`);
}

export async function autoInit(): Promise<void> {
  try {
    if (!(await schemaExists())) {
      console.log("[init] Esquema no encontrado, aplicando migración inicial...");
      await applySchema();
    }

    // Settings singleton
    await prisma.settings.upsert({
      where: { id: "singleton" },
      update: {},
      create: { id: "singleton" },
    });

    // Admin
    const userCount = await prisma.user.count();
    if (userCount === 0) {
      const passwordHash = await bcrypt.hash(env.admin.password, 10);
      await prisma.user.create({
        data: {
          email: env.admin.email.toLowerCase(),
          name: env.admin.name,
          passwordHash,
          role: "admin",
        },
      });
      console.log(`[init] ✓ Admin creado: ${env.admin.email}`);
    }

    // NOTA: ya NO se siembran trabajadores por defecto. Los domiciliarios reales
    // se cargan desde Shipday (modelo Driver, apartado "Domiciliarios"). La tabla
    // Worker ("Trabajadores") queda vacía y solo se llena con lo que cree la sede.
  } catch (err) {
    console.error("[init] Error en auto-inicialización:", err);
    throw err;
  }
}
