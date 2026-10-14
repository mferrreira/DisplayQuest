/**
 * TechnicalReportDocumentPort — o renderizador do DOCX oficial preenchido
 * (V5-9b, DEC-129/133).
 *
 * O adaptador vive em `infrastructure/adapters/` atrás desta porta; o domínio produz os
 * comandos (strings) e o adaptador devolve bytes. O bucket NÃO mora aqui: quem move byte
 * é a rota, pelo seam `lib/storage/blob-store.ts` (DEC-133) — o módulo renderiza em
 * memória e devolve os bytes à rota.
 */
export interface TechnicalReportDocumentPort {
  /** `commands` são os 17 códigos da cópia marcada (DEC-167/168). */
  render(commands: Record<string, string>): Promise<Uint8Array>;
}
