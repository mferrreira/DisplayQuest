/**
 * TechnicalReportAccessPort — leitura do projeto para o gate do relatório técnico
 * (V5-9, DEC-139/167).
 *
 * O módulo de reporting NÃO importa repositório do módulo de projeto (RG-04): ele lê
 * `projects` e `project_members` por adaptador próprio, mesmo desenho medido do
 * `ReportingDirectory` (que já lê `isProjectLeader`) e do `ProjectHoursPort` do lado
 * do projeto. `membershipRoles: null` = sem vínculo — o quirk da ACL (membership vence;
 * sem membership decide o global MANAGE_USERS) é decidido pela regra pura do domínio,
 * não aqui.
 */
export interface TechnicalReportProjectAccess {
  projectId: number;
  leaderId: number | null;
  membershipRoles: string[] | null;
}

export interface TechnicalReportAccessPort {
  /**
   * `null` no retorno = projeto ausente (o use case responde 404 antes do gate).
   * `actorId: null` = caminho de leitura: a membership não é resolvida (leitura aberta,
   * regra 13 do plano) e `membershipRoles` sai `null` sem consulta.
   */
  findProjectAccess(
    projectId: number,
    actorId: number | null,
  ): Promise<TechnicalReportProjectAccess | null>;
}
