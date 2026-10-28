/**
 * AttestationSourcesPort — a leitura que o atestado precisa (V5-10a, DEC-138/140/149).
 *
 * Adaptador próprio do módulo (RG-04, mesmo desenho do `TechnicalReportGenerationPort`):
 * contexto do projeto (nome, edital, PROPPI, líder, membership do ator para o gate),
 * dados do membro (os campos de pessoa da DEC-138 + os do vínculo da DEC-149) e as
 * atividades do cronograma que cruzam o mês de referência.
 */
import type { AttestationActivityRow } from "@/backend/domain";

export interface CertificateProjectContext {
  projectId: number;
  name: string;
  editalNumber: string | null;
  proppiNumber: string | null;
  leaderId: number | null;
  /** Papéis da membership do ATOR naquele projeto (null = sem membership). */
  actorMembershipRoles: string[] | null;
}

export interface CertificateMemberContext {
  userId: number;
  name: string;
  cpf: string | null;
  registrationNumber: string | null;
  level: string | null;
  scholarshipType: string | null;
  fundingAgency: string | null;
  fundingAgencyOther: string | null;
  /** Do vínculo (DEC-149); nulo quando o membro é o líder sem membership. */
  categoria: string | null;
  cargaHoraria: number | null;
}

export interface AttestationSessionLogRow {
  activity: string | null;
  note: string | null;
  endTime: string;
}

export interface AttestationSourcesPort {
  /** `actorId` nulo quando o chamador não tem gate (listagem): `actorMembershipRoles` sai nulo. */
  findProjectContext(projectId: number, actorId: number | null): Promise<CertificateProjectContext | null>;
  findMemberContext(projectId: number, userId: number): Promise<CertificateMemberContext | null>;
  /** Cronograma INTEIRO do projeto, na ordem da grade — o corpo filtra o cruza com o mês,
   * a situação do projeto olha o plano todo (contrato congelado em `attestation-rules.test.ts`). */
  listScheduleActivities(projectId: number): Promise<AttestationActivityRow[]>;
  /** Sessões concluídas do membro no mês; independente da existência de tasks. */
  listCompletedSessionLogs(projectId: number, userId: number, month: string): Promise<AttestationSessionLogRow[]>;
}
