-- AlterTable
ALTER TABLE "FieldNote" ADD COLUMN     "date" TEXT NOT NULL DEFAULT '';

-- CreateIndex
CREATE INDEX "FieldNote_date_idx" ON "FieldNote"("date");
