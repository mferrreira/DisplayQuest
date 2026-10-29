-- CreateTable
CREATE TABLE "board_month_closes" (
    "id" SERIAL NOT NULL,
    "month" TEXT NOT NULL,
    "track" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3) NOT NULL,
    "triggeredBy" TEXT NOT NULL,
    "peopleCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "board_month_closes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "month_history" (
    "id" SERIAL NOT NULL,
    "closeId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "userName" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "track" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "month_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "board_month_closes_month_idx" ON "board_month_closes"("month");

-- CreateIndex
CREATE UNIQUE INDEX "board_month_closes_month_track_key" ON "board_month_closes"("month", "track");

-- CreateIndex
CREATE INDEX "month_history_month_track_position_idx" ON "month_history"("month", "track", "position");

-- CreateIndex
CREATE UNIQUE INDEX "month_history_userId_month_track_key" ON "month_history"("userId", "month", "track");

-- AddForeignKey
ALTER TABLE "month_history" ADD CONSTRAINT "month_history_closeId_fkey" FOREIGN KEY ("closeId") REFERENCES "board_month_closes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "month_history" ADD CONSTRAINT "month_history_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

