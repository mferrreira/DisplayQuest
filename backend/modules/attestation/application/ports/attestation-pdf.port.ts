/**
 * AttestationPdfPort — o preenchimento do AcroForm oficial (V5-10a, DEC-130).
 *
 * O domínio monta os campos (`buildAttestationFields`); o adaptador só escreve no PDF:
 * carrega o asset `templates/atestado-frequencia.pdf`, preenche SOMENTE os nomes que
 * receberam valor, atualiza aparências com Times e achata (`flatten`) o arquivo entregue.
 * O template oficial é a autoridade da formatação (regra 14 do plano): o adaptador não
 * desenha nada, não toca texto estático, não cria campo.
 */
export interface AttestationPdfPort {
  renderPdf(fields: Record<string, string | boolean>): Promise<Uint8Array>;
}
