-- CreateEnum
CREATE TYPE "BankTxType" AS ENUM ('ingreso', 'egreso');

-- CreateEnum
CREATE TYPE "ShiftSlot" AS ENUM ('AM', 'PM', 'close');

-- AlterTable
ALTER TABLE "MonthlyClose" ADD COLUMN     "initialBank" INTEGER,
ADD COLUMN     "initialCash" INTEGER;

-- AlterTable
ALTER TABLE "Movement" ADD COLUMN     "taxAmount" INTEGER;

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "pendingDebt" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientDebt" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "paid" BOOLEAN NOT NULL DEFAULT false,
    "paidAt" TIMESTAMP(3),
    "paidAmount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientDebt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankTransaction" (
    "id" TEXT NOT NULL,
    "type" "BankTxType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "reference" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShiftClose" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "shift" "ShiftSlot" NOT NULL,
    "receivedBy" TEXT,
    "handedBy" TEXT,
    "denominations" JSONB NOT NULL,
    "totalCounted" INTEGER NOT NULL,
    "totalExpected" INTEGER NOT NULL,
    "difference" INTEGER NOT NULL,
    "notes" TEXT,
    "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShiftClose_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClientDebt_clientId_idx" ON "ClientDebt"("clientId");

-- CreateIndex
CREATE INDEX "ClientDebt_paid_idx" ON "ClientDebt"("paid");

-- CreateIndex
CREATE INDEX "BankTransaction_date_idx" ON "BankTransaction"("date");

-- CreateIndex
CREATE INDEX "BankTransaction_type_idx" ON "BankTransaction"("type");

-- CreateIndex
CREATE INDEX "ShiftClose_date_idx" ON "ShiftClose"("date");

-- CreateIndex
CREATE UNIQUE INDEX "ShiftClose_date_shift_key" ON "ShiftClose"("date", "shift");

-- AddForeignKey
ALTER TABLE "ClientDebt" ADD CONSTRAINT "ClientDebt_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
