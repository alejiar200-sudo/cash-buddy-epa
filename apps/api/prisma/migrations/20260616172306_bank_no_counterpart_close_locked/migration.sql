-- AlterTable
ALTER TABLE "BankTransaction" ADD COLUMN     "noCounterpart" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "MonthlyClose" ADD COLUMN     "locked" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "ShiftClose" ADD COLUMN     "locked" BOOLEAN NOT NULL DEFAULT true;
