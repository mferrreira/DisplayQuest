-- Additive-only migration (project reports + attachments).
-- NOTE: auto-generated drops of legacy gamification_* tables were removed by hand.
-- Those tables are dead artifacts of reverted migrations (never present on production DB;
-- the gamification module only uses users/history). Hygiene cleanup deferred to a
-- dedicated maintenance task -- this migration must never destroy data.
-- CreateTable
CREATE TABLE "project_reports" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "authorId" INTEGER NOT NULL,
    "periodType" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "title" TEXT,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_attachments" (
    "id" SERIAL NOT NULL,
    "reportId" INTEGER NOT NULL,
    "fileName" TEXT NOT NULL,
    "storedPath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "uploadedBy" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_reports_projectId_periodType_idx" ON "project_reports"("projectId", "periodType");

-- CreateIndex
CREATE UNIQUE INDEX "project_reports_projectId_periodType_periodStart_authorId_key" ON "project_reports"("projectId", "periodType", "periodStart", "authorId");

-- CreateIndex
CREATE INDEX "report_attachments_reportId_idx" ON "report_attachments"("reportId");

-- AddForeignKey
ALTER TABLE "project_reports" ADD CONSTRAINT "project_reports_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_reports" ADD CONSTRAINT "project_reports_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_attachments" ADD CONSTRAINT "report_attachments_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "project_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
