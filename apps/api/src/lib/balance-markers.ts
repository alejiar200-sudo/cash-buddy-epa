/**
 * Marcadores de registros que NO deben sumar/restar al saldo de caja/banco.
 *
 * Cuando se "descuenta de la deuda de un domiciliario usando un movimiento
 * bancario" (applyBankToDriver), el dinero YA entró a la empresa mediante el
 * BankTransaction original. Para dejar constancia en el historial del domiciliario
 * se crea además un DriverPayment (parte comisión) y/o un BaseTransaction "pago"
 * (parte base). Esos registros sirven para la DEUDA, pero NO son una segunda
 * entrada de dinero: contarlos otra vez en el saldo lo infla (doble conteo).
 *
 * Estos registros llevan estas notas exactas, y el cálculo de saldo esperado
 * (getExpectedBalances) los excluye. Centralizado aquí para que el origen y la
 * exclusión nunca se desincronicen.
 */
export const BANK_LINKED_PAYMENT_NOTE = "Pago vía movimiento bancario";
export const BANK_LINKED_BASE_PREFIX = "Pago vía banco (";

export function bankLinkedBaseNote(medium: "cash" | "bank"): string {
  return `${BANK_LINKED_BASE_PREFIX}${medium === "cash" ? "efectivo" : "transferencia"})`;
}

// Detección por PREFIJO (no igualdad exacta): si alguien agrega un detalle al
// final de la nota (p. ej. un ajuste), el registro NO debe dejar de excluirse del
// saldo y reaparecer como doble conteo. El prefijo lo pone solo este flujo.
export function isBankLinkedPaymentNote(notes?: string | null): boolean {
  return !!notes && notes.startsWith(BANK_LINKED_PAYMENT_NOTE);
}

export function isBankLinkedBaseNote(notes?: string | null): boolean {
  return !!notes && notes.startsWith(BANK_LINKED_BASE_PREFIX);
}
