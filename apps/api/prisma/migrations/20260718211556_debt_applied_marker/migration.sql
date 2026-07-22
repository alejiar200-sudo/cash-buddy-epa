-- DropForeignKey
ALTER TABLE "BaseTransaction" DROP CONSTRAINT "BaseTransaction_bankTransactionId_fkey";

-- DropForeignKey
ALTER TABLE "DriverPayment" DROP CONSTRAINT "DriverPayment_bankTransactionId_fkey";

-- AlterTable
ALTER TABLE "BankTransaction" ADD COLUMN     "debtApplied" INTEGER NOT NULL DEFAULT 0;

-- Backfill: marcar los movimientos históricos que SÍ redujeron la deuda de un
-- domiciliario, para que al eliminarlos se revierta el monto correcto.
--
-- Un BankTransaction solo recibe driverId por tres vías:
--   registerPayment    -> noCounterpart = true,  reduce la posición neta en `amount`
--   applyBankToDriver  -> noCounterpart = true,  reduce la posición neta en `amount`
--   payCredit          -> noCounterpart = false, NO reduce deuda (paga un crédito)
-- Los wizards de la UI nunca envían driverId. Por eso (driverId IS NOT NULL AND
-- noCounterpart) identifica exactamente los movimientos que aplicaron deuda, y en
-- los tres casos el monto aplicado es `amount` completo (lo que exceda la deuda
-- quedó como crédito, y la posición neta baja igual).
UPDATE "BankTransaction"
SET "debtApplied" = "amount"
WHERE "driverId" IS NOT NULL AND "noCounterpart" = true;

-- AddForeignKey
ALTER TABLE "BaseTransaction" ADD CONSTRAINT "BaseTransaction_bankTransactionId_fkey" FOREIGN KEY ("bankTransactionId") REFERENCES "BankTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverPayment" ADD CONSTRAINT "DriverPayment_bankTransactionId_fkey" FOREIGN KEY ("bankTransactionId") REFERENCES "BankTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
