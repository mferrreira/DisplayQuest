/**
 * ListCertificatesUseCase (V5-10a, DEC-127/136).
 *
 * A lista é leitura aberta do autenticado — filho de projeto, herda a leitura aberta
 * (regra 13 do plano). O que sai daqui é METADADO (mês, nome de arquivo, quem gerou):
 * o CPF está no PDF, e o PDF só sai pela rota gateada do `GetCertificateFileUseCase`.
 * O 404 de projeto existe porque a lista precisa saber se o projeto é real.
 */
import { NotFoundError } from "@/backend/domain";

import type { CertificateRecord, CertificatesRepository } from "../ports/certificates.repository";
import type { AttestationSourcesPort } from "../ports/attestation-sources.port";

export interface ListCertificatesPorts {
  sources: AttestationSourcesPort;
  repository: CertificatesRepository;
}

export class ListCertificatesUseCase {
  constructor(private readonly ports: ListCertificatesPorts) {}

  async execute(command: { projectId: number }): Promise<CertificateRecord[]> {
    const context = await this.ports.sources.findProjectContext(command.projectId, null);
    if (!context) {
      throw new NotFoundError("Projeto não encontrado");
    }
    return this.ports.repository.findByProject(command.projectId);
  }
}
