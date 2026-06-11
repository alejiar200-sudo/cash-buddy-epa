-- AlterTable
ALTER TABLE "BankTransaction" ADD COLUMN     "createdBy" TEXT,
ADD COLUMN     "createdByName" TEXT;

-- AlterTable
ALTER TABLE "BaseTransaction" ADD COLUMN     "createdBy" TEXT,
ADD COLUMN     "createdByName" TEXT;

-- AlterTable
ALTER TABLE "ClientDebt" ADD COLUMN     "createdBy" TEXT,
ADD COLUMN     "createdByName" TEXT,
ADD COLUMN     "paidBy" TEXT,
ADD COLUMN     "paidByName" TEXT;

-- AlterTable
ALTER TABLE "Conversion" ADD COLUMN     "userName" TEXT;

-- AlterTable
ALTER TABLE "DriverPayment" ADD COLUMN     "createdBy" TEXT,
ADD COLUMN     "createdByName" TEXT;

-- AlterTable
ALTER TABLE "MonthlyClose" ADD COLUMN     "closedBy" TEXT,
ADD COLUMN     "closedByName" TEXT;

-- AlterTable
ALTER TABLE "ShiftClose" ADD COLUMN     "createdBy" TEXT,
ADD COLUMN     "createdByName" TEXT,
ADD COLUMN     "editedAt" TIMESTAMP(3),
ADD COLUMN     "editedBy" TEXT,
ADD COLUMN     "editedByName" TEXT;
