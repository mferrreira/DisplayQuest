/**
 * GetCertificateFileUseCase (V5-10a, DEC-171).
 *
 * O download obedece ao MESMO par da geração: a PRÓPRIA pessoa OU a gestão do projeto.
 * O atestado carrega o CPF do membro (a folha oficial exige o campo — DEC-171), e é por
 * isso que a leitura do ARQUIVO não é a leitura aberta da lista: o gate decide antes de a
 * rota tocar o bucket. Id de certificado que não pertence ao projeto é 404 (o par
 * (projeto, id) é a chave — id forjado em outro projeto não acha objeto, mesmo desenho do
 * download do DOCX, DEC-167).
 */
import { ForbiddenError, NotFoundError, canActorManageCertificateDecision } from "@/backend/domain";

import type { CertificateRecord, CertificatesRepository } from "../ports/certificates.repository";
import type { AttestationSourcesPort } from "../ports/attestation-sources.port";

export const CERTIFICATE_FILE_DENIED_MESSAGE =
  "Usuário não tem permissão para acessar o atestado deste projeto";

export interface GetCertificateFilePorts {
  sources: AttestationSourcesPort;
  repository: CertificatesRepository;
}

export class GetCertificateFileUseCase {
  constructor(private readonly ports: GetCertificateFilePorts) {}

  async execute(command: {
    projectId: number;
    certificateId: number;
    actorId: number;
    actorRoles: string[];
  }): Promise<{ certificate: CertificateRecord }> {
    const context = await this.ports.sources.findProjectContext(command.projectId, command.actorId);
    if (!context) {
      throw new NotFoundError("Projeto não encontrado");
    }

    const certificate = await this.ports.repository.findById(command.projectId, command.certificateId);
    if (!certificate) {
      throw new NotFoundError("Atestado não encontrado");
    }

    const isSelf = command.actorId === certificate.userId;
    if (
      !isSelf &&
      !canActorManageCertificateDecision(
        command.actorId,
        command.actorRoles,
        context.leaderId,
        context.actorMembershipRoles,
      )
    ) {
      throw new ForbiddenError(CERTIFICATE_FILE_DENIED_MESSAGE);
    }

    return { certificate };
  }
}
