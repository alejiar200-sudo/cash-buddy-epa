import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs"],
  platform: "node",
  target: "node20",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  // @prisma/client tiene un engine nativo y NO se puede bundlear: queda
  // external y se copia como extraResources al .exe. Todo lo demás se
  // bundlea para que el ejecutable empaquetado no dependa de node_modules.
  external: ["@prisma/client", ".prisma/client"],
  noExternal: [
    "@cash-buddy/shared",
    "bcryptjs",
    "compression",
    "cors",
    "dotenv",
    "express",
    "helmet",
    "jsonwebtoken",
    "morgan",
    "zod",
  ],
});
