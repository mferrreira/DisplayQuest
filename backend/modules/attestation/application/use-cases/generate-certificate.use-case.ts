/**
 * GenerateCertificateUseCase (V5-10a, DEC-75/130/170/171).
 *
 * Ordem de recusa medida (mesma família dos três use cases de relatório técnico):
 * 404 projeto → 403 gate → 400 mês → 404 membro. O gate é a PRÓPRIA pessoa OU a gestão do
 * projeto (`canActorManageCertificateDecision`, DEC-171) — o atestado é o documento do
 * estudante, ele pode gerar o próprio sem gerenciar nada.
 *
 * O mês default é o ANTERIOR à geração (DEC-171: o corpo do oficial atesta "frequência
 * integral durante o mês" — mês em curso não pode ser atestado como integral). O `now` é
 * parâmetro (regra da casa: `now` nunca sai da regra), decomposto em data civil (DEC-132).
 *
 * O byte do PDF não passa por aqui: o use case monta os campos, o adaptador devolve os
 * bytes para a rota mover ao bucket (DEC-133 — a rota move byte, o módulo guarda registro
 * e autorização). O registro é upsert pelo trio projeto × membro × mês: regenerar
 * sobrescreve (DEC-170).
 */
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
  buildAttestationFields,
  canActorManageCertificateDecision,
  certificateBlobKey,
  certificateFileName,
  civilDayOfInstant,
  monthNameLong,
  normalizeAttestationMonth,
  previousMonth,
  type AttestationMonth,
} from "@/backend/domain";

import type { CertificateRecord, CertificatesRepository } from "../ports/certificates.repository";
import type { AttestationSourcesPort } from "../ports/attestation-sources.port";
import type { AttestationPdfPort } from "../ports/attestation-pdf.port";

export const CERTIFICATE_DENIED_MESSAGE =
  "Usuário não tem permissão para gerar atestado de frequência neste projeto";

export interface GenerateCertificateCommand {
  projectId: number;
  actorId: number;
  actorRoles: string[];
  userId: number;
  /** `AAAA-MM`; ausente = mês anterior à geração (DEC-171). */
  month?: string;
  now: Date;
}

export interface GenerateCertificateResult {
  certificate: CertificateRecord;
  /** Bytes do PDF preenchido — a rota move ao bucket (DEC-133). */
  pdfBytes: Uint8Array;
}

export interface GenerateCertificatePorts {
  sources: AttestationSourcesPort;
  pdf: AttestationPdfPort;
  repository: CertificatesRepository;
}

export class GenerateCertificateUseCase {
  constructor(private readonly ports: GenerateCertificatePorts) {}

  async execute(command: GenerateCertificateCommand): Promise<GenerateCertificateResult> {
    const context = await this.ports.sources.findProjectContext(command.projectId, command.actorId);
    if (!context) {
      throw new NotFoundError("Projeto não encontrado");
    }

    const isSelf = command.actorId === command.userId;
    if (
      !isSelf &&
      !canActorManageCertificateDecision(
        command.actorId,
        command.actorRoles,
        context.leaderId,
        context.actorMembershipRoles,
      )
    ) {
      throw new ForbiddenError(CERTIFICATE_DENIED_MESSAGE);
    }

    const civilDay = civilDayOfInstant(command.now);
    // 400 do mês depois do gate e antes do 404 do membro (ordem medida).
    const month: AttestationMonth =
      command.month === undefined ? previousMonth(civilDay) : normalizeAttestationMonth(command.month);

    const member = await this.ports.sources.findMemberContext(command.projectId, command.userId);
    if (!member) {
      throw new NotFoundError("Membro não encontrado no projeto");
    }

    const activities = await this.ports.sources.listScheduleActivities(command.projectId);

    const fields = buildAttestationFields({
      project: {
        name: context.name,
        editalNumber: context.editalNumber,
        proppiNumber: context.proppiNumber,
      },
      member: {
        name: member.name,
        cpf: member.cpf,
        registrationNumber: member.registrationNumber,
        level: member.level,
        scholarshipType: member.scholarshipType,
        fundingAgency: member.fundingAgency,
        fundingAgencyOther: member.fundingAgencyOther,
      },
      membership: { categoria: member.categoria, cargaHoraria: member.cargaHoraria },
      activities,
      month,
      // Assinatura = data civil da GERAÇÃO (DEC-171); o mês de referência entra só no corpo (`data`).
      now: { dia: civilDay.slice(8, 10), mes: monthNameLong(civilDay.slice(0, 7)), ano: civilDay.slice(0, 4) },
    });

    const pdfBytes = await this.ports.pdf.renderPdf(fields);

    const certificate = await this.ports.repository.upsert({
      projectId: command.projectId,
      userId: command.userId,
      month,
      blobKey: certificateBlobKey(command.projectId, command.userId, month),
      fileName: certificateFileName(context.name, month),
      generatedBy: command.actorId,
    });

    return { certificate, pdfBytes };
  }
}
