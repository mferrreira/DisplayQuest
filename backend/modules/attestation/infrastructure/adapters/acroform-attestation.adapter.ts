import { readFileSync } from "node:fs";
import path from "node:path";

import { PDFCheckBox, PDFDocument, PDFTextField, StandardFonts } from "@cantoo/pdf-lib";

import type { AttestationPdfPort } from "../../application/ports/attestation-pdf.port";

/**
 * AcroFormAttestationAdapter — preenche o AcroForm oficial do atestado (V5-10a, DEC-130).
 *
 * O template é a autoridade da formatação (regra 14 do plano): o adaptador carrega o asset
 * `templates/atestado-frequencia.pdf`, escreve SOMENTE nos 42 nomes que receberam valor
 * (texto → `setText`, checkbox → `check`), atualiza aparências com Times e ACHATA o arquivo
 * entregue (`flatten`) — o PDF que sai do sistema não é um formulário editável. Nenhum
 * estilo, nenhum campo novo, nenhum texto estático tocado.
 *
 * O caminho do asset sai de `process.cwd()`, não do módulo: o bundle `standalone` do Next
 * não preserva a posição original dos arquivos, e os três ambientes medidos têm o cwd na
 * raiz — vitest (raiz do repo), `next dev` (raiz do repo) e o container (`WORKDIR /app`,
 * com `templates/` copiados pelo Dockerfile antes do `chown`). O construtor aceita caminho
 * explícito para o teste apontar para o asset versionado sem depender de cwd.
 */
export const ATTESTADO_TEMPLATE_PATH = path.join(process.cwd(), "templates", "atestado-frequencia.pdf");

export class AcroFormAttestationAdapter implements AttestationPdfPort {
  constructor(private readonly templatePath: string = ATTESTADO_TEMPLATE_PATH) {}

  async renderPdf(fields: Record<string, string | boolean>): Promise<Uint8Array> {
    const doc = await PDFDocument.load(readFileSync(this.templatePath));
    const form = doc.getForm();
    // Gotcha medido: no fork @cantoo o nome é `TimesRoman` (no `pdf-lib` antigo era `Times`).
    const times = await doc.embedFont(StandardFonts.TimesRoman);

    for (const field of form.getFields()) {
      const value = fields[field.getName()];
      if (value === undefined) continue;
      if (field instanceof PDFCheckBox) {
        if (value === true) field.check();
      } else if (field instanceof PDFTextField) {
        field.setText(String(value));
      }
    }

    form.updateFieldAppearances(times);
    form.flatten();
    return doc.save();
  }
}
