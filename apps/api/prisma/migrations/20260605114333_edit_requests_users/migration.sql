-- CreateEnum
CREATE TYPE "EditRequestStatus" AS ENUM ('pending', 'approved', 'rejected');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "EditRequest" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "entityLabel" TEXT NOT NULL,
    "changes" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "EditRequestStatus" NOT NULL DEFAULT 'pending',
    "reviewerId" TEXT,
    "reviewNotes" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EditRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EditRequest_status_idx" ON "EditRequest"("status");

-- CreateIndex
CREATE INDEX "EditRequest_requesterId_idx" ON "EditRequest"("requesterId");

-- AddForeignKey
ALTER TABLE "EditRequest" ADD CONSTRAINT "EditRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EditRequest" ADD CONSTRAINT "EditRequest_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
