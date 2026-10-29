/**
 * CertificatesRepository — o registro do atestado (V5-10a, DEC-75/170).
 *
 * A linha é o registro; o PDF mora no bucket com chave derivada. Sem status próprio
 * (DEC-75). `upsert` é o caminho único: regenerar o mesmo mês sobrescreve a linha e o
 * objeto do bucket (chave estável, DEC-170).
 */
export interface CertificateRecord {
  id: number;
  projectId: number;
  userId: number;
  /** Mês de referência `AAAA-MM` (DEC-171). */
  month: string;
  blobKey: string;
  fileName: string;
  generatedBy: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CertificatesRepository {
  upsert(input: {
    projectId: number;
    userId: number;
    month: string;
    blobKey: string;
    fileName: string;
    generatedBy: number;
  }): Promise<CertificateRecord>;
  findByProject(projectId: number): Promise<CertificateRecord[]>;
  findById(projectId: number, certificateId: number): Promise<CertificateRecord | null>;
}
