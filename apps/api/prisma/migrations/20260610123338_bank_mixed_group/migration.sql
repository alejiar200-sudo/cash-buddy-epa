-- AlterTable
ALTER TABLE "BankTransaction" ADD COLUMN     "groupId" TEXT;

-- CreateIndex
CREATE INDEX "BankTransaction_groupId_idx" ON "BankTransaction"("groupId");
