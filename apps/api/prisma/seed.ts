import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { env } from "../src/config/env";

const prisma = new PrismaClient();

const PALETTE = [
  "#00E676", "#00B0FF", "#FFB300", "#FF7043", "#AB47BC",
  "#26C6DA", "#EC407A", "#9CCC65", "#FFCA28", "#5C6BC0",
  "#FF5252", "#66BB6A", "#42A5F5", "#FFA726",
];

const DEFAULT_WORKERS = [
  "Norberto", "Yirelmi", "Zenider", "Luis", "Pablo", "Edgar", "Andrey",
  "Eliecer", "Miguel", "Yanca", "Eduardo", "Alejandro", "Moisés", "Victor",
];

async function main() {
  // Settings (singleton)
  await prisma.settings.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });

  // Usuario administrador inicial
  const adminEmail = env.admin.email.toLowerCase();
  const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!existingAdmin) {
    const passwordHash = await bcrypt.hash(env.admin.password, 10);
    await prisma.user.create({
      data: { email: adminEmail, name: env.admin.name, passwordHash, role: "admin" },
    });
    console.log(`✓ Admin creado: ${adminEmail} / ${env.admin.password}`);
  } else {
    console.log(`• Admin ya existe: ${adminEmail}`);
  }

  // Domiciliarios por defecto (solo si no hay trabajadores)
  const workerCount = await prisma.worker.count();
  if (workerCount === 0) {
    await prisma.worker.createMany({
      data: DEFAULT_WORKERS.map((name, i) => ({
        name,
        role: "domiciliario" as const,
        active: true,
        color: PALETTE[i % PALETTE.length],
      })),
    });
    console.log(`✓ ${DEFAULT_WORKERS.length} domiciliarios creados`);
  } else {
    console.log(`• Ya existen ${workerCount} trabajadores, no se crean por defecto`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
