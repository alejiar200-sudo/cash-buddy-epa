-- AlterTable
ALTER TABLE "BankTransaction" ADD COLUMN     "pairId" TEXT;

-- CreateIndex
CREATE INDEX "BankTransaction_pairId_idx" ON "BankTransaction"("pairId");
