/**
 * AttestationPdfPort — o PDF do atestado (V5-10a, DEC-130; plan-v22 S06, ADR-001).
 *
 * O domínio monta os campos (`buildAttestationFields`); o adaptador pdf-lib reconstrói as
 * duas páginas na geometria do referencial e devolve o byte entregue. Nenhuma AcroForm no
 * arquivo: o que sai do sistema é o documento fechado.
 */
export interface AttestationPdfPort {
  renderPdf(fields: Record<string, string | boolean>): Promise<Uint8Array>;
}
