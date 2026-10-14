-- CreateTable
CREATE TABLE "project_activity_files" (
    "id" SERIAL NOT NULL,
    "activityId" INTEGER NOT NULL,
    "blobKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "uploadedBy" INTEGER NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_activity_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "project_activity_files_blobKey_key" ON "project_activity_files"("blobKey");

-- CreateIndex
CREATE INDEX "project_activity_files_activityId_idx" ON "project_activity_files"("activityId");

-- AddForeignKey
ALTER TABLE "project_activity_files" ADD CONSTRAINT "project_activity_files_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "project_activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_activity_files" ADD CONSTRAINT "project_activity_files_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

