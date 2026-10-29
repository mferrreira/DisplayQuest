import { prisma } from "@/lib/database/prisma";

import type {
  CertificateRecord,
  CertificatesRepository,
} from "../../application/ports/certificates.repository";

/**
 * PrismaCertificates — o registro do atestado (V5-10a, DEC-75/170).
 *
 * `upsert` pela chave única do trio (projectId, userId, month): regenerar o mesmo mês
 * sobrescreve a linha, e a chave do bucket é derivada do mesmo trio — o objeto velho é
 * substituído na escrita da rota (DEC-170, mesmo desenho da capa do projeto, DEC-135).
 */
export class PrismaCertificatesRepository implements CertificatesRepository {
  async upsert(input: {
    projectId: number;
    userId: number;
    month: string;
    blobKey: string;
    fileName: string;
    generatedBy: number;
  }): Promise<CertificateRecord> {
    return prisma.certificates.upsert({
      where: {
        projectId_userId_month: {
          projectId: input.projectId,
          userId: input.userId,
          month: input.month,
        },
      },
      create: {
        projectId: input.projectId,
        userId: input.userId,
        month: input.month,
        blobKey: input.blobKey,
        fileName: input.fileName,
        generatedBy: input.generatedBy,
      },
      update: {
        blobKey: input.blobKey,
        fileName: input.fileName,
        generatedBy: input.generatedBy,
      },
    });
  }

  async findByProject(projectId: number): Promise<CertificateRecord[]> {
    return prisma.certificates.findMany({
      where: { projectId },
      orderBy: [{ month: "desc" }, { id: "asc" }],
    });
  }

  async findById(projectId: number, certificateId: number): Promise<CertificateRecord | null> {
    // O par (projeto, id) é a chave: id de outro projeto devolve null e a rota responde
    // 404 — mesmo desenho do download do DOCX (DEC-167).
    return prisma.certificates.findFirst({ where: { id: certificateId, projectId } });
  }
}
