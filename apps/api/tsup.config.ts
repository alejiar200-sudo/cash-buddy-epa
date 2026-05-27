import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs"],
  platform: "node",
  target: "node20",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  // Prisma client carga binarios del engine en runtime; no se puede bundlear.
  external: ["@prisma/client", ".prisma/client"],
  noExternal: ["@cash-buddy/shared"],
});
