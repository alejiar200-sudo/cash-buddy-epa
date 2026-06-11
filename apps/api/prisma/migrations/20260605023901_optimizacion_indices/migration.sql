-- CreateIndex
CREATE INDEX "ClientDebt_clientId_paid_idx" ON "ClientDebt"("clientId", "paid");

-- CreateIndex
CREATE INDEX "DailyDriverStat_date_branchId_idx" ON "DailyDriverStat"("date", "branchId");

-- CreateIndex
CREATE INDEX "Movement_date_status_idx" ON "Movement"("date", "status");

-- CreateIndex
CREATE INDEX "ShipdayOrder_branchId_status_idx" ON "ShipdayOrder"("branchId", "status");
