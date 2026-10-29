/**
 * TechnicalReportsRepository — persistência do relatório técnico (V5-9, DEC-70/139).
 *
 * O par (projectId, type) é único no schema (`@@unique`): o upsert é o "um registro
 * editável por par" da DEC-70. O adaptador devolve ISO-strings nos timestamps — mesmo
 * shape dos outros adapters do módulo (DEC-12: nenhum reshape de payload).
 */
export interface TechnicalReportRecord {
  id: number;
  projectId: number;
  type: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface TechnicalReportsRepository {
  listByProject(projectId: number): Promise<TechnicalReportRecord[]>;
  findByProjectAndType(projectId: number, type: string): Promise<TechnicalReportRecord | null>;
  upsert(projectId: number, type: string, content: string): Promise<TechnicalReportRecord>;
}
