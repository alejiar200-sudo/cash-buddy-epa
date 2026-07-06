-- AlterTable
ALTER TABLE "BaseTransaction" ADD COLUMN     "bankTransactionId" TEXT;

-- AlterTable
ALTER TABLE "DriverPayment" ADD COLUMN     "bankTransactionId" TEXT;

-- CreateIndex
CREATE INDEX "BaseTransaction_bankTransactionId_idx" ON "BaseTransaction"("bankTransactionId");

-- CreateIndex
CREATE INDEX "DriverPayment_bankTransactionId_idx" ON "DriverPayment"("bankTransactionId");

-- AddForeignKey
ALTER TABLE "BaseTransaction" ADD CONSTRAINT "BaseTransaction_bankTransactionId_fkey" FOREIGN KEY ("bankTransactionId") REFERENCES "BankTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverPayment" ADD CONSTRAINT "DriverPayment_bankTransactionId_fkey" FOREIGN KEY ("bankTransactionId") REFERENCES "BankTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
