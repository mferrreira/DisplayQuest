-- S02 (plan-v21) — arquivos de entregável: o binário mora no bucket (`blobKey` é a chave), o
-- registro guarda o metadado. `uploadedBy` é RESTRICT de propósito (DEC-134/162): o arquivo é dado
-- do projeto, não de quem subiu — excluir a pessoa não pode apagar o que o projeto entregou.

-- CreateTable
CREATE TABLE "project_deliverable_files" (
    "id" SERIAL NOT NULL,
    "deliverableId" INTEGER NOT NULL,
    "blobKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "uploadedBy" INTEGER NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_deliverable_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "project_deliverable_files_blobKey_key" ON "project_deliverable_files"("blobKey");

-- CreateIndex
CREATE INDEX "project_deliverable_files_deliverableId_idx" ON "project_deliverable_files"("deliverableId");

-- AddForeignKey
ALTER TABLE "project_deliverable_files" ADD CONSTRAINT "project_deliverable_files_deliverableId_fkey" FOREIGN KEY ("deliverableId") REFERENCES "project_deliverables"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_deliverable_files" ADD CONSTRAINT "project_deliverable_files_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
