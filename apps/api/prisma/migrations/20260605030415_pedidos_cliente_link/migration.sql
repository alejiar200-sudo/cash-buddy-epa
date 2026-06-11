-- AlterTable
ALTER TABLE "ShipdayOrder" ADD COLUMN     "addToClientDebt" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "clientId" TEXT;

-- AddForeignKey
ALTER TABLE "ShipdayOrder" ADD CONSTRAINT "ShipdayOrder_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
