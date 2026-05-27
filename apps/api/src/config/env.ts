import "dotenv/config";

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Falta la variable de entorno requerida: ${name}`);
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 4000),
  host: process.env.HOST ?? "0.0.0.0",
  databaseUrl: required("DATABASE_URL"),
  jwtSecret: required("JWT_SECRET", "dev-insecure-secret-change-me"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
  admin: {
    email: process.env.ADMIN_EMAIL ?? "admin@cashbuddy.local",
    password: process.env.ADMIN_PASSWORD ?? "admin123",
    name: process.env.ADMIN_NAME ?? "Administrador",
  },
  // Carpeta del frontend estático (build de Next.js) a servir. Resuelta en index.ts.
  webDir: process.env.WEB_DIR ?? "",
  isProd: (process.env.NODE_ENV ?? "development") === "production",
};
