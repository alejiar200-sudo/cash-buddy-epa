import type { CategoryCode } from "./domain";

export const CATEGORY_LABEL: Record<CategoryCode, string> = {
  1: "Domicilios efectivo",
  2: "Domicilios banco",
  3: "Gasto efectivo",
  4: "Gasto banco",
  5: "Base efectivo",
  6: "Base banco",
  7: "Ingreso efectivo (conv)",
  8: "Salida banco",
  9: "Salida efectivo (conv)",
  10: "Ingreso banco (conv)",
  11: "Salida temporal efectivo",
  12: "Salida temporal banco",
  13: "Ingreso pendiente efectivo",
  14: "Ingreso pendiente banco",
  15: "Nómina efectivo",
  18: "Nómina banco",
};
