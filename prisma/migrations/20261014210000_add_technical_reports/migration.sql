-- V5-9 (DEC-70/139/167): relatorio tecnico por projeto x tipo.
-- CreateTable
CREATE TABLE "technical_reports" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "technical_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "technical_reports_projectId_type_key" ON "technical_reports"("projectId", "type");

-- AddForeignKey
ALTER TABLE "technical_reports" ADD CONSTRAINT "technical_reports_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

