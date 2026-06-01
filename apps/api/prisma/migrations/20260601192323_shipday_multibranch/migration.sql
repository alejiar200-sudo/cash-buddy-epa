-- CreateEnum
CREATE TYPE "BaseType" AS ENUM ('entrega', 'pago');

-- CreateEnum
CREATE TYPE "ConversionType" AS ENUM ('banco_a_efectivo', 'efectivo_a_banco');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('ok', 'error', 'never');

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "shipdayCommission" DOUBLE PRECISION NOT NULL DEFAULT 30;

-- CreateTable
CREATE TABLE "Branch" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "apiKeyEnc" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "syncStatus" "SyncStatus" NOT NULL DEFAULT 'never',
    "syncMessage" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Driver" (
    "id" TEXT NOT NULL,
    "shipdayDriverId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "pendingDebt" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Driver_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipdayOrder" (
    "id" TEXT NOT NULL,
    "shipdayOrderId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "driverId" TEXT,
    "orderNumber" TEXT,
    "deliveryValue" INTEGER NOT NULL DEFAULT 0,
    "companyAmount" INTEGER NOT NULL DEFAULT 0,
    "customerName" TEXT,
    "customerAddress" TEXT,
    "status" TEXT NOT NULL,
    "deliveredAt" TIMESTAMP(3),
    "rawData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShipdayOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BaseTransaction" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "type" "BaseType" NOT NULL,
    "notes" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BaseTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DriverPayment" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "notes" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DriverPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversion" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "type" "ConversionType" NOT NULL,
    "notes" TEXT,
    "userId" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Conversion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyDriverStat" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "orderCount" INTEGER NOT NULL DEFAULT 0,
    "totalValue" INTEGER NOT NULL DEFAULT 0,
    "companyTotal" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DailyDriverStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonthlyClose" (
    "id" TEXT NOT NULL,
    "branchId" TEXT,
    "month" TEXT NOT NULL,
    "totalOrders" INTEGER NOT NULL,
    "totalValue" INTEGER NOT NULL,
    "companyTotal" INTEGER NOT NULL,
    "basesGiven" INTEGER NOT NULL,
    "basesPaid" INTEGER NOT NULL,
    "basesPending" INTEGER NOT NULL,
    "conversions" JSONB NOT NULL,
    "snapshot" JSONB NOT NULL,
    "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MonthlyClose_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Driver_branchId_idx" ON "Driver"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "Driver_shipdayDriverId_branchId_key" ON "Driver"("shipdayDriverId", "branchId");

-- CreateIndex
CREATE UNIQUE INDEX "ShipdayOrder_shipdayOrderId_key" ON "ShipdayOrder"("shipdayOrderId");

-- CreateIndex
CREATE INDEX "ShipdayOrder_branchId_idx" ON "ShipdayOrder"("branchId");

-- CreateIndex
CREATE INDEX "ShipdayOrder_driverId_idx" ON "ShipdayOrder"("driverId");

-- CreateIndex
CREATE INDEX "ShipdayOrder_deliveredAt_idx" ON "ShipdayOrder"("deliveredAt");

-- CreateIndex
CREATE INDEX "ShipdayOrder_status_idx" ON "ShipdayOrder"("status");

-- CreateIndex
CREATE INDEX "BaseTransaction_branchId_idx" ON "BaseTransaction"("branchId");

-- CreateIndex
CREATE INDEX "BaseTransaction_driverId_idx" ON "BaseTransaction"("driverId");

-- CreateIndex
CREATE INDEX "BaseTransaction_date_idx" ON "BaseTransaction"("date");

-- CreateIndex
CREATE INDEX "DriverPayment_driverId_idx" ON "DriverPayment"("driverId");

-- CreateIndex
CREATE INDEX "DriverPayment_branchId_idx" ON "DriverPayment"("branchId");

-- CreateIndex
CREATE INDEX "Conversion_branchId_idx" ON "Conversion"("branchId");

-- CreateIndex
CREATE INDEX "Conversion_date_idx" ON "Conversion"("date");

-- CreateIndex
CREATE INDEX "DailyDriverStat_branchId_idx" ON "DailyDriverStat"("branchId");

-- CreateIndex
CREATE INDEX "DailyDriverStat_date_idx" ON "DailyDriverStat"("date");

-- CreateIndex
CREATE UNIQUE INDEX "DailyDriverStat_date_driverId_key" ON "DailyDriverStat"("date", "driverId");

-- CreateIndex
CREATE INDEX "MonthlyClose_month_idx" ON "MonthlyClose"("month");

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyClose_month_branchId_key" ON "MonthlyClose"("month", "branchId");

-- AddForeignKey
ALTER TABLE "Driver" ADD CONSTRAINT "Driver_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipdayOrder" ADD CONSTRAINT "ShipdayOrder_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipdayOrder" ADD CONSTRAINT "ShipdayOrder_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BaseTransaction" ADD CONSTRAINT "BaseTransaction_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BaseTransaction" ADD CONSTRAINT "BaseTransaction_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverPayment" ADD CONSTRAINT "DriverPayment_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversion" ADD CONSTRAINT "Conversion_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyDriverStat" ADD CONSTRAINT "DailyDriverStat_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyDriverStat" ADD CONSTRAINT "DailyDriverStat_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyClose" ADD CONSTRAINT "MonthlyClose_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
