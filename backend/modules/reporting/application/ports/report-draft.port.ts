/**
 * ReportDraftPort — o gerador do rascunho de IA (V5-9c, DEC-139/152).
 *
 * O domínio constrói o prompt (`buildTechnicalReportDraftPrompt`) e esta porta só
 * transporta texto: o adaptador OpenAI-compatible vive em `infrastructure/adapters/`
 * e é injetável — a suíte de unit roda SEM IA no ar (mesma regra do bucket, DEC-101).
 */
export interface ReportDraftPort {
  generateDraft(prompt: string): Promise<string>;
}