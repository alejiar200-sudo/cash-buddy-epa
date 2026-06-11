-- AlterTable
ALTER TABLE "BankTransaction" ADD COLUMN     "medium" "Medium" NOT NULL DEFAULT 'bank';

-- AlterTable
ALTER TABLE "BaseTransaction" ADD COLUMN     "bankAmount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "cashAmount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "ClientDebt" ADD COLUMN     "paidBank" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "paidCash" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "MonthlyClose" ADD COLUMN     "clientDebtBalance" INTEGER,
ADD COLUMN     "netProfit" INTEGER,
ADD COLUMN     "profitability" DOUBLE PRECISION,
ADD COLUMN     "totalExpenses" INTEGER,
ADD COLUMN     "totalPayroll" INTEGER,
ADD COLUMN     "totalSales" INTEGER,
ADD COLUMN     "transferDiff" INTEGER;

-- AlterTable
ALTER TABLE "Movement" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedBy" TEXT,
ADD COLUMN     "createdBy" TEXT;

-- CreateIndex
CREATE INDEX "BaseTransaction_driverId_type_idx" ON "BaseTransaction"("driverId", "type");

-- CreateIndex
CREATE INDEX "Driver_pendingDebt_idx" ON "Driver"("pendingDebt");

-- CreateIndex
CREATE INDEX "Movement_status_idx" ON "Movement"("status");
