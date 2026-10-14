// @vitest-environment node
import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"

import { PDFDocument } from "@cantoo/pdf-lib"
import JSZip from "jszip"
import { listCommands } from "docx-templates"
import { describe, expect, it } from "vitest"

import {
  buildTaggedDocx,
  CMD_DELIMITER,
  DOC_PATH,
  extractText,
  tagDocumentXml,
} from "../../../scripts/tag-report-template.mjs"

import { REPORT_SECTIONS } from "@/backend/domain"

// V5-1a/DEC-128: os templates oficiais viram asset versionado em templates/ e a cópia
// marcada é derivada por scripts/tag-report-template.mjs. Este arquivo é o guarda de deriva:
// se o oficial trocar sem re-derivar (ou a cópia for editada à mão), ele falha e diz o que
// mudou. Mesmo padrão de user-status-vocabulary/user-delete-schema-drift.

const ROOT = path.resolve(__dirname, "..", "..", "..")
const OFFICIAL_DOCX = path.join(ROOT, "templates", "relatorio-tecnico.docx")
const TAGGED_DOCX = path.join(ROOT, "templates", "relatorio-tecnico.tagged.docx")
const OFFICIAL_PDF = path.join(ROOT, "templates", "atestado-frequencia.pdf")

const sha256 = (file: string) => createHash("sha256").update(fs.readFileSync(file)).digest("hex")

// `listCommands` (e `createReport`) declaram `template: ArrayBuffer`, não `Buffer`. Buffer
// funciona em tempo de execução, mas o tipo é estreito: copia os bytes para um ArrayBuffer
// exato. O V5-9 vai esbarrar nisso ao preencher.
const asArrayBuffer = (file: string): ArrayBuffer =>
  new Uint8Array(fs.readFileSync(file)).buffer as ArrayBuffer

// Medidos em 2026-10-13 (V5-1a). O sha do oficial é o que ancora a procedência: o dono
// mantém o arquivo em docs/Projeto/ (gitignored) e a cópia de trabalho em templates/.
const SHA_OFICIAL_DOCX = "70a81240a7de5a661f280b89f2270b3bfb3f1c67048c92882b19e10ce3841f75"
const SHA_OFICIAL_PDF = "ecba85390adbeaf6559652febea281d7c18ea535c0a94dbfff77d615f9b41757"

// 42 campos, na ordem do arquivo. A DEC-130 registrou "39 campos" — a contagem estava
// errada; medido com @cantoo/pdf-lib em 2026-10-13 são 16 campos de texto + 26 checkboxes.
// Nomes com hífen (`status_nao-iniciado`) só existem no PDF: o pdf-lib os preenche por
// nome literal, sem parsing de expressão.
const ACROFORM_FIELDS = [
  "data",
  "edital",
  "titulo",
  "coorientador",
  "nome",
  "CPF",
  "matricula",
  "nivel_medio",
  "nivel_graduacao",
  "nivel_pos-graduacao",
  "carga_8",
  "carga_20",
  "carga_adaptada",
  "horas_adaptada",
  "is_bolsista",
  "se_bolsista",
  "is_pibic",
  "is_pibic-jr",
  "is_pibic-af",
  "is_pibiti",
  "is_pibiti-jr",
  "is_btp",
  "is_mestrado",
  "is_doutorado",
  "is_pos-doc",
  "is_ifnmg",
  "is_cnpq",
  "is_fapemig",
  "is_outra",
  "is_voluntario",
  "atividades_1",
  "agencia_outra",
  "status_nao-iniciado",
  "atividade_2",
  "status_atrasado",
  "status_como-previsto",
  "status_adiantado",
  "status_concluido",
  "justificativa",
  "dia",
  "mes",
  "ano",
]

// 17 comandos, na ordem em que aparecem no documento (13 do V5-1a + linha_tipo + as 3
// tabelas do V5-9b — DEC-167/168). Este conjunto é o contrato que o preenchimento escreve;
// mexer nele exige atualizar o adaptador docx junto. A linha de tipo vem ANTES do período
// e as tabelas vêm antes da "Data" final — medido no texto do oficial.
const TAGGED_COMMANDS = [
  "linha_tipo",
  "periodo_inicio",
  "periodo_fim",
  "titulo",
  "proppi",
  "coordenador",
  "projeto_inicio",
  "projeto_termino",
  "orientador",
  "estudante_nome",
  "estudante_curso",
  "modalidade",
  "instituicao_fomento",
  "tabela_descricao",
  "tabela_resultados",
  "tabela_comentarios",
  "data_relatorio",
]

const readOfficialDocumentXml = async () => {
  const zip = await JSZip.loadAsync(fs.readFileSync(OFFICIAL_DOCX))
  return zip.file(DOC_PATH)!.async("string") as Promise<string>
}

const readTaggedDocumentXml = async () => {
  const zip = await JSZip.loadAsync(fs.readFileSync(TAGGED_DOCX))
  return zip.file(DOC_PATH)!.async("string") as Promise<string>
}

describe("templates oficiais — procedência (V5-1a/DEC-128)", () => {
  it("o DOCX oficial está byte-intacto na cópia de trabalho", () => {
    expect(sha256(OFFICIAL_DOCX)).toBe(SHA_OFICIAL_DOCX)
  })

  it("o PDF oficial está byte-intacto na cópia de trabalho", () => {
    expect(sha256(OFFICIAL_PDF)).toBe(SHA_OFICIAL_PDF)
  })
})

describe("atestado de frequência — inventário do AcroForm (V5-1a/DEC-130)", () => {
  it("tem extensão .pdf e carrega como AcroForm", async () => {
    const doc = await PDFDocument.load(fs.readFileSync(OFFICIAL_PDF))
    expect(doc.getForm().getFields().length).toBeGreaterThan(0)
  })

  it("mantém os 42 nomes de campo, na ordem medida", async () => {
    const doc = await PDFDocument.load(fs.readFileSync(OFFICIAL_PDF))
    const names = doc.getForm().getFields().map((field) => field.getName())
    // Falha nomeando o que mudou, em vez de só dizer que a contagem difere.
    expect(names).toEqual(ACROFORM_FIELDS)
  })
})

describe("relatório técnico — cópia marcada (V5-1a/DEC-129)", () => {
  it("a cópia marcada é exatamente o que o script deriva do oficial", async () => {
    const derived = tagDocumentXml(await readOfficialDocumentXml())
    expect(await readTaggedDocumentXml()).toBe(derived)
  })

  it("não sobra branco literal fora dos comandos", async () => {
    const text = extractText(await readTaggedDocumentXml())
    expect(text.replace(/\{\{[^{}]*\}\}/g, "")).not.toContain("_")
  })

  it("não carrega os dados de exemplo do oficial", async () => {
    const text = extractText(await readTaggedDocumentXml())
    expect(text).not.toContain("Guilherme de Araújo Carneiro")
    expect(text).not.toContain("Bel em Sistemas de Informação")
  })

  it("os rótulos de seção do domínio são os rótulos medidos no oficial (DEC-168, fonte única)", async () => {
    // O cortador do corpo (splitReportBody) e o prompt da IA consomem REPORT_SECTIONS.
    // Se o oficial trocar de rótulo, o cortador passa a casar contra texto que não existe
    // mais — o guarda falha aqui, nomeando a seção, antes de o documento sair errado.
    const officialText = extractText(await readOfficialDocumentXml())
    for (const section of REPORT_SECTIONS) {
      expect(officialText).toContain(section.officialLabel)
    }
    // A linha de tipo literal também está ancorada na marcação (DEC-167).
    expect(officialText).toContain("( ) Relatório Final (  ) Relatório Parcial")
  })

  it("a derivação é determinística (nenhuma entrada do zip sai com a data do run)", async () => {
    // O .docx oficial não tem entrada de diretório para `word/`: o jszip sintetiza uma no
    // load com `new Date()`. Sem normalizar as datas, o arquivo muda a cada run (medido: dois
    // runs 3 s afastados davam sha256 diferentes) e o commit vira ruído. A checagem olha a
    // data de cada entrada, em vez de comparar dois runs — não depende de timing, e o
    // timestamp DOS tem resolução de 2 s, então comparar dois runs seguidos dá falso positivo.
    const { buffer, referenceDate } = await buildTaggedDocx()
    const rebuilt = await JSZip.loadAsync(buffer)
    const drifted: string[] = []
    rebuilt.forEach((entryPath, entry) => {
      if (entry.date && entry.date.getTime() !== referenceDate.getTime()) {
        drifted.push(`${entryPath} = ${entry.date.toISOString()}`)
      }
    })
    expect(drifted).toEqual([])
  })

  it("o listCommands() do docx-templates vê os 17 comandos, como INS", async () => {
    // O default do docx-templates é `+++` e `['{','}']` NÃO aceita chave dupla: com o par
    // errado o inventário vem vazio ou quebrado. O par certo é o que CMD_DELIMITER exporta.
    const commands = await listCommands(asArrayBuffer(TAGGED_DOCX), CMD_DELIMITER)
    expect(commands.map((c: { type: string }) => c.type)).toEqual(TAGGED_COMMANDS.map(() => "INS"))
    expect(commands.map((c: { code: string }) => c.code)).toEqual(TAGGED_COMMANDS)
  })

  it("com o delimitador errado o inventário não enxerga os comandos", async () => {
    // Guarda da armadilha: registra que o par errado falha, para ninguém "consertar" o
    // CMD_DELIMITER de volta para ['{','}'] achando que é equivalente.
    const wrong = await listCommands(asArrayBuffer(TAGGED_DOCX), ["{", "}"])
    expect(wrong.map((c: { code: string }) => c.code)).not.toEqual(TAGGED_COMMANDS)
  })
})

// O guarda só vale se falhar quando deve. Estes casos mexem no XML do oficial de propósito
// (por mutação) e provam que a derivação quebra alto em vez de marcar menos campos.
describe("o guarda de deriva falha quando o oficial muda", () => {
  it("quebra quando um branco esperado some", async () => {
    const xml = (await readOfficialDocumentXml()).replace(
      "Título: ______________________________________________",
      "Título:",
    )
    expect(() => tagDocumentXml(xml)).toThrow(/título: esperava 1/)
  })

  it("quebra quando um branco de data se repete", async () => {
    const xml = (await readOfficialDocumentXml()).replace(
      "Data ______/______/________",
      "Data ______/______/________Data ______/______/________",
    )
    expect(() => tagDocumentXml(xml)).toThrow(/data do relatório: esperava 1/)
  })

  it("quebra quando aparece um branco que nenhum padrão cobre", async () => {
    const xml = (await readOfficialDocumentXml()).replace(
      "</w:body>",
      "<w:p><w:r><w:t>__</w:t></w:r></w:p></w:body>",
    )
    expect(() => tagDocumentXml(xml)).toThrow(/sobrou branco literal/)
  })
})
