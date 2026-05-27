import path from "node:path";
import fs from "node:fs";
import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import compression from "compression";
import { apiRouter } from "./routes";
import { errorHandler, notFoundHandler } from "./middlewares/error";

export interface CreateServerOptions {
  // Carpeta del frontend estático (build export de Next). Si se indica, se sirve.
  webDir?: string;
}

export function createServer(options: CreateServerOptions = {}): Express {
  const app = express();

  app.use(
    helmet({
      // Permite servir el frontend embebido y llamadas a la API en la misma red.
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(cors());
  app.use(compression());
  app.use(express.json({ limit: "2mb" }));
  app.use(morgan(process.env.NODE_ENV === "production" ? "tiny" : "dev"));

  // API
  app.use("/api", apiRouter);

  // Frontend estático (modelo host: un solo puerto sirve API + UI)
  const webDir = options.webDir;
  if (webDir && fs.existsSync(webDir)) {
    app.use(express.static(webDir));
    // Fallback SPA: cualquier ruta no-API devuelve index.html
    app.get(/^(?!\/api).*/, (_req, res, next) => {
      const indexHtml = path.join(webDir, "index.html");
      if (fs.existsSync(indexHtml)) return res.sendFile(indexHtml);
      next();
    });
  }

  // 404 para rutas /api no encontradas y manejo de errores
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
