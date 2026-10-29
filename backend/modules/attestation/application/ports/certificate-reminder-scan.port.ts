/**
 * CertificateReminderScanPort — leitura do lembrete mensal de frequência (V5-10b, DEC-72).
 *
 * `listProjectsForReminder` entrega os projetos com pelo menos um membro ATIVO — sem
 * vínculo ativo não há atestado a gerar, e o lembrete não notifica projeto vazio.
 * `listGlobalManagerUserIds` lê `users` por adaptador próprio do módulo (RG-04: o módulo
 * não importa repositório de outro módulo), só ATIVOS (DEC-55).
 */
export interface CertificateReminderProject {
  projectId: number;
  projectName: string;
  leaderId: number | null;
}

export interface CertificateReminderScanPort {
  listProjectsForReminder(): Promise<CertificateReminderProject[]>;
  listGlobalManagerUserIds(): Promise<number[]>;
}
