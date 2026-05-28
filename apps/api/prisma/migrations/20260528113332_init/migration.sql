-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('admin', 'user');

-- CreateEnum
CREATE TYPE "WorkerRole" AS ENUM ('domiciliario', 'administrativo');

-- CreateEnum
CREATE TYPE "MovementType" AS ENUM ('ingreso', 'egreso');

-- CreateEnum
CREATE TYPE "Medium" AS ENUM ('cash', 'bank');

-- CreateEnum
CREATE TYPE "MovementStatus" AS ENUM ('pending', 'confirmed');

-- CreateEnum
CREATE TYPE "MovementKind" AS ENUM ('commission', 'delivery');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'user',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Settings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "companyName" TEXT NOT NULL DEFAULT 'Epa',
    "initialCash" INTEGER NOT NULL DEFAULT 300000,
    "initialBank" INTEGER NOT NULL DEFAULT 103130,
    "setupComplete" BOOLEAN NOT NULL DEFAULT false,
    "commissionPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Worker" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "WorkerRole" NOT NULL DEFAULT 'domiciliario',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "color" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Worker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Day" (
    "date" TEXT NOT NULL,
    "initialCash" INTEGER NOT NULL,
    "initialBank" INTEGER NOT NULL,
    "arqueoAM" JSONB,
    "arqueoPM" JSONB,
    "arqueoClose" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Day_pkey" PRIMARY KEY ("date")
);

-- CreateTable
CREATE TABLE "Movement" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "time" TEXT NOT NULL,
    "category" INTEGER NOT NULL,
    "type" "MovementType" NOT NULL,
    "medium" "Medium" NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" "MovementStatus" NOT NULL DEFAULT 'confirmed',
    "description" TEXT,
    "group" TEXT,
    "kind" "MovementKind",
    "deliveryId" TEXT,
    "deliveryValue" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "workerId" TEXT,

    CONSTRAINT "Movement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Movement_date_idx" ON "Movement"("date");

-- CreateIndex
CREATE INDEX "Movement_workerId_idx" ON "Movement"("workerId");

-- CreateIndex
CREATE INDEX "Movement_kind_idx" ON "Movement"("kind");

-- AddForeignKey
ALTER TABLE "Movement" ADD CONSTRAINT "Movement_date_fkey" FOREIGN KEY ("date") REFERENCES "Day"("date") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Movement" ADD CONSTRAINT "Movement_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE SET NULL ON UPDATE CASCADE;
