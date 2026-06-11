-- AlterTable
ALTER TABLE "BankTransaction" ADD COLUMN     "driverId" TEXT,
ADD COLUMN     "driverName" TEXT;

-- CreateIndex
CREATE INDEX "BankTransaction_driverId_idx" ON "BankTransaction"("driverId");
