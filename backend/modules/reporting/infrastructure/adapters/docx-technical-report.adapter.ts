import fs from "node:fs"
import { createReport } from "docx-templates"
import type { TechnicalReportDocumentPort } from "@/backend/modules/reporting/application/ports/technical-report-document.port"
import {
  CMD_DELIMITER,
  TARGET_PATH,
} from "../../../../../scripts/tag-report-template.mjs"

/**
 * DocxTechnicalReportAdapter — preenche a CÓPIA MARCADA do template oficial com
 * docx-templates (V5-9b, DEC-129).
 *
 * O delimitador é importado do script que deriva a cópia (`CMD_DELIMITER`), não
 * reescrito aqui: DEC-129 mediu que o default `+++` não vê os comandos `{{campo}}`
 * e o par `['{','}']` quebra a chave dupla. Uma fonte, o guarda de deriva confere a
 * cópia; este adaptador confere o par.
 *
 * `UserOptions.template` é `Uint8Array` (medido em `types.d.ts` — o `ArrayBuffer`
 * medido no V5-1a é do `listCommands`, outra função). `processLineBreaks` é o
 * mecanismo do plano para o texto puro multi-linha nas tabelas. A biblioteca escapa
 * XML nos valores; o adaptador não toca `w:rPr`/`styles.xml`/`sectPr` — quem escreve
 * estilo é o oficial (guarda semântico no teste do adaptador).
 *
 * O template é lido UMA vez por instância (o composition root constrói o módulo uma
 * vez; o arquivo é asset de leitura, DEC-128).
 */
export class DocxTechnicalReportAdapter implements TechnicalReportDocumentPort {
  private templatePromise: Promise<Buffer> | null = null

  private template(): Promise<Buffer> {
    if (!this.templatePromise) {
      this.templatePromise = (async () => fs.readFileSync(TARGET_PATH))()
    }
    return this.templatePromise
  }

  async render(commands: Record<string, string>): Promise<Uint8Array> {
    // `UserOptions.template` é `Uint8Array` (medido em types.d.ts; o `ArrayBuffer` do
    // V5-1a é do `listCommands`, função diferente). Buffer é Uint8Array: entra direto.
    return await createReport({
      template: await this.template(),
      cmdDelimiter: CMD_DELIMITER,
      data: commands,
      processLineBreaks: true,
    })
  }
}
