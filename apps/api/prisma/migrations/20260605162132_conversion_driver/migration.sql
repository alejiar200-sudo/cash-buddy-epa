-- AlterTable
ALTER TABLE "Conversion" ADD COLUMN     "driverId" TEXT,
ADD COLUMN     "driverName" TEXT;

-- CreateIndex
CREATE INDEX "Conversion_driverId_idx" ON "Conversion"("driverId");
