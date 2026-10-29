/**
 * TechnicalReportGenerationPort — leitura do projeto e dos membros ATIVOS para a geração
 * do DOCX (V5-9b, DEC-139/167).
 *
 * Adaptador próprio do módulo de reporting sobre `projects`, `users` e `project_members`
 * (RG-04 — mesmo desenho do `TechnicalReportAccessPort`). Nenhum cálculo aqui: período,
 * datas, rótulos e comandos são decididos pelas funções puras do domínio.
 *
 * Membros da geração (DEC-167): só o vínculo com `situacao = ATIVO` entra. O bloco
 * "Identificação do Estudante" descreve quem está no projeto hoje — quem saiu não recebe
 * documento, e a saída continua sendo apagar a linha (DEC-149).
 */
export interface TechnicalReportProjectContext {
  projectId: number;
  name: string;
  createdAt: string;
  startDate: string | null;
  endDate: string | null;
  proppiNumber: string | null;
  leaderId: number | null;
  /** Nome do líder (`projects.leaderId` → `users.name`); nulo quando o projeto não tem líder. */
  leaderName: string | null;
}

export interface TechnicalReportMemberRow {
  userId: number;
  name: string;
  course: string | null;
  scholarshipType: string | null;
  fundingAgency: string | null;
  fundingAgencyOther: string | null;
}

export interface TechnicalReportGenerationPort {
  findProjectContext(projectId: number): Promise<TechnicalReportProjectContext | null>;
  listActiveMembers(projectId: number): Promise<TechnicalReportMemberRow[]>;
}
