#!/usr/bin/env node
/**
 * Deriva `templates/relatorio-tecnico.tagged.docx` a partir do template oficial
 * (`templates/relatorio-tecnico.docx`), que fica byte-intacto.
 *
 * Por que existe: o relatório técnico é entregue em DOCX preenchido a partir do template
 * OFICIAL (DEC-129). O oficial tem os campos em branco escritos como sublinhados literais.
 * Para o docx-templates preencher, esses sublinhados precisam virar comandos, e a troca tem
 * que acontecer DENTRO do mesmo run: cada branco mora num único `<w:r>` de Times New Roman
 * 12 e o `rPr` do run não é tocado, então fonte/tamanho/margem do oficial permanecem.
 *
 * A cópia marcada nunca é editada à mão: rode `npm run templates:tag` (ou este script) e
 * commite o resultado. `tests/unit/scripts/report-templates-drift.test.ts` falha se a cópia
 * divergir do que este script deriva do oficial.
 *
 * Delimitador: o plano escreve os comandos como `{{campo}}`, e isso só funciona passando
 * `cmdDelimiter: ['{{', '}}']`. O default do docx-templates é `+++` e `['{', '}']` NÃO aceita
 * chave dupla (medido: vira dois comandos vazios). Quem chamar `createReport`/`listCommands`
 * precisa passar o mesmo par — exportado aqui como `CMD_DELIMITER`.
 */

import fs from "node:fs"
import path from "node:path"
import process from "node:process"
import { fileURLToPath, pathToFileURL } from "node:url"

import JSZip from "jszip"

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, "..")

export const DOC_PATH = "word/document.xml"
/** @type {[string, string]} */
export const CMD_DELIMITER = ["{{", "}}"]
export const SOURCE_PATH = path.join(ROOT, "templates", "relatorio-tecnico.docx")
export const TARGET_PATH = path.join(ROOT, "templates", "relatorio-tecnico.tagged.docx")

/**
 * Brancos do oficial e o comando que entra no lugar.
 *
 * - `pattern`: casado no XML de `word/document.xml`.
 * - `tokens`: um comando por ocorrência, na ordem em que aparecem.
 * - `expected`: quantas ocorrências o oficial tem. Se o arquivo oficial mudar, a contagem
 *   falha alto em vez de marcar menos campos em silêncio.
 *
 * Ordem importa: os brancos de data aparecem dentro de outros brancos de data, então os
 * padrões ancorados por rótulo rodam antes do genérico `_+/_+/_+` que sobra (o "Término").
 */
export const REPLACEMENTS = [
  {
    campo: "período do relatório",
    pattern: /De _+\/_+\/_+ a _+\/_+\/_+/,
    tokens: ["De {{periodo_inicio}} a {{periodo_fim}}"],
    expected: 1,
  },
  {
    campo: "início do projeto",
    pattern: /Duração do Projeto:Início _+\/_+\/_+/,
    tokens: ["Duração do Projeto:Início {{projeto_inicio}}"],
    expected: 1,
  },
  {
    campo: "data do relatório",
    pattern: /Data _+\/_+\/_+/,
    tokens: ["Data {{data_relatorio}}"],
    expected: 1,
  },
  { campo: "título", pattern: /Título: _+/, tokens: ["Título: {{titulo}}"], expected: 1 },
  {
    campo: "número PROPPI",
    pattern: /Nº de cadastro na PROPPI: _+/,
    tokens: ["Nº de cadastro na PROPPI: {{proppi}}"],
    expected: 1,
  },
  { campo: "coordenador", pattern: /Coordenador: _+/, tokens: ["Coordenador: {{coordenador}}"], expected: 1 },
  { campo: "orientador", pattern: /Nome: _+/, tokens: ["Nome: {{orientador}}"], expected: 1 },
  // Dados de exemplo que o dono deixou na linha do estudante (Identificação do Estudante de
  // IC). Não entram em relatório entregue: viram comando. Quantos relatórios existem por
  // projeto ancora a ASK-V5-06, mas nome de exemplo não pode sobreviver à cópia marcada.
  {
    campo: "estudante (nome)",
    pattern: /Guilherme de Araújo Carneiro/,
    tokens: ["{{estudante_nome}}"],
    expected: 1,
  },
  {
    campo: "estudante (curso)",
    pattern: /Bel em Sistemas de Informação/,
    tokens: ["{{estudante_curso}}"],
    expected: 1,
  },
  {
    campo: "modalidade e instituição de fomento",
    pattern: /(?<!_)_{8}(?!_)/,
    tokens: ["{{modalidade}}", "{{instituicao_fomento}}"],
    expected: 2,
  },
  {
    campo: "término do projeto",
    pattern: /_+\/_+\/_+/,
    tokens: ["{{projeto_termino}}"],
    expected: 1,
  },
  // V5-9b (DEC-129/167/168): a linha de tipo e as 3 tabelas de corpo, que o V5-1a deixou
  // sem marcação de propósito. A linha de tipo é um único run literal medido no oficial
  // ("( ) Relatório Final (  ) Relatório Parcial" — a primeira caixa tem UM espaço, a
  // segunda DOIS). As tabelas não têm branco sublinhado: a célula é um parágrafo vazio
  // com run vazio, e o anchor é o `w:spacing` próprio de cada célula (medido: cada um
  // ocorre UMA vez no documento inteiro). O run vazio do oficial não carrega fonte — o
  // texto preenchido herda o que o oficial herda quando o dono digita nele (docDefaults
  // Calibri 11); o script NÃO adiciona rPr, porque o sistema nunca escreve estilo (DEC-129).
  {
    campo: "linha de tipo (Final / Parcial)",
    pattern: /\( \) Relatório Final \(  \) Relatório Parcial/,
    tokens: ["{{linha_tipo}}"],
    expected: 1,
  },
  {
    campo: "tabela Descrição das Atividades",
    pattern: /<w:spacing w:after="80" w:lineRule="auto"\/><w:jc w:val="left"\/><w:rPr\/><\/w:pPr><w:r w:rsidDel="00000000" w:rsidR="00000000" w:rsidRPr="00000000"><w:rPr><w:rtl w:val="0"\/><\/w:rPr><\/w:r>/,
    tokens: [
      '<w:spacing w:after="80" w:lineRule="auto"/><w:jc w:val="left"/><w:rPr/></w:pPr><w:r w:rsidDel="00000000" w:rsidR="00000000" w:rsidRPr="00000000"><w:rPr><w:rtl w:val="0"/></w:rPr><w:t xml:space="preserve">{{tabela_descricao}}</w:t></w:r>',
    ],
    expected: 1,
  },
  {
    campo: "tabela Principais Resultados",
    pattern: /<w:spacing w:after="120" w:before="0" w:lineRule="auto"\/><w:jc w:val="both"\/><w:rPr\/><\/w:pPr><w:r w:rsidDel="00000000" w:rsidR="00000000" w:rsidRPr="00000000"><w:rPr><w:rtl w:val="0"\/><\/w:rPr><\/w:r>/,
    tokens: [
      '<w:spacing w:after="120" w:before="0" w:lineRule="auto"/><w:jc w:val="both"/><w:rPr/></w:pPr><w:r w:rsidDel="00000000" w:rsidR="00000000" w:rsidRPr="00000000"><w:rPr><w:rtl w:val="0"/></w:rPr><w:t xml:space="preserve">{{tabela_resultados}}</w:t></w:r>',
    ],
    expected: 1,
  },
  {
    campo: "tabela Comentários Adicionais",
    pattern: /<w:spacing w:after="240" w:before="0" w:lineRule="auto"\/><w:jc w:val="left"\/><w:rPr\/><\/w:pPr><w:r w:rsidDel="00000000" w:rsidR="00000000" w:rsidRPr="00000000"><w:rPr><w:rtl w:val="0"\/><\/w:rPr><\/w:r>/,
    tokens: [
      '<w:spacing w:after="240" w:before="0" w:lineRule="auto"/><w:jc w:val="left"/><w:rPr/></w:pPr><w:r w:rsidDel="00000000" w:rsidR="00000000" w:rsidRPr="00000000"><w:rPr><w:rtl w:val="0"/></w:rPr><w:t xml:space="preserve">{{tabela_comentarios}}</w:t></w:r>',
    ],
    expected: 1,
  },
]

/** Texto visível do documento (tags fora), para conferir invariantes. */
export function extractText(xml) {
  return xml
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
}

/** Lista de comandos esperados na cópia marcada, na ordem da tabela REPLACEMENTS. */
export function expectedCommandCodes() {
  const codes = []
  for (const rule of REPLACEMENTS) {
    for (const token of rule.tokens) {
      for (const match of token.matchAll(/\{\{([^{}]+)\}\}/g)) {
        codes.push(match[1])
      }
    }
  }
  return codes
}

/**
 * Troca os brancos literais pelos comandos. Função pura: recebe o XML do oficial, devolve o
 * XML da cópia marcada. Não escreve em disco.
 */
export function tagDocumentXml(xml) {
  let out = xml
  const problems = []

  for (const spec of REPLACEMENTS) {
    const global = new RegExp(spec.pattern.source, spec.pattern.flags.replace(/g/g, "") + "g")
    const found = out.match(global) ?? []
    if (found.length !== spec.expected) {
      problems.push(`${spec.campo}: esperava ${spec.expected} ocorrência(s), achei ${found.length}`)
      continue
    }
    let seen = 0
    out = out.replace(global, () => {
      const replacement = spec.tokens[seen] ?? spec.tokens[spec.tokens.length - 1]
      seen += 1
      return replacement
    })
  }

  if (problems.length > 0) {
    throw new Error(
      "o template oficial mudou e a marcação não acompanha:\n  - " + problems.join("\n  - "),
    )
  }

  // Invariante: fora dos comandos, nenhum branco literal sobra. (Os nomes dos comandos têm
  // `_`, então a checagem roda depois de tirar os marcadores `{{...}}`.)
  const outsideCommands = extractText(out).replace(/\{\{[^{}]*\}\}/g, "")
  if (outsideCommands.includes("_")) {
    const sample = outsideCommands.match(/.{0,40}_{1,60}.{0,40}/)?.[0] ?? ""
    throw new Error(`sobrou branco literal (_) fora de comando: ${JSON.stringify(sample)}`)
  }

  return out
}

/** Monta a cópia marcada em memória (não escreve em disco). */
export async function buildTaggedDocx({ source = SOURCE_PATH } = {}) {
  const zip = await JSZip.loadAsync(fs.readFileSync(source))
  const entry = zip.file(DOC_PATH)
  if (!entry) {
    throw new Error(`não achei ${DOC_PATH} em ${source}; isso não é um .docx`)
  }

  const tagged = tagDocumentXml(await entry.async("string"))
  zip.file(DOC_PATH, tagged)

  // Determinismo: o .docx oficial não tem entrada de diretório para `word/` — o jszip
  // sintetiza uma no load e carrega `new Date()` nela. Sem normalizar, cada run escreve um
  // zip diferente (a diferença é só o timestamp da pasta, mas o sha256 do arquivo muda e o
  // commit vira ruído). Todas as entradas recebem a data da entrada original do documento.
  const referenceDate = entry.date ?? new Date(0)
  zip.forEach((_relativePath, zipEntry) => {
    zipEntry.date = referenceDate
  })

  const buffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
    platform: "UNIX",
  })
  return { buffer, referenceDate }
}

/** Deriva e grava a cópia marcada. */
export async function deriveTaggedDocx({ source = SOURCE_PATH, target = TARGET_PATH } = {}) {
  const { buffer } = await buildTaggedDocx({ source })
  fs.writeFileSync(target, buffer)
  return { buffer, bytes: buffer.length }
}

async function main() {
  const { bytes } = await deriveTaggedDocx()
  console.log(`cópia marcada derivada: ${path.relative(ROOT, TARGET_PATH)} (${bytes} bytes)`)
  console.log(`comandos: ${expectedCommandCodes().join(", ")}`)
  console.log(`delimitador exigido no preenchimento: ['${CMD_DELIMITER[0]}', '${CMD_DELIMITER[1]}']`)
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href

if (invokedDirectly) {
  main().catch((error) => {
    console.error(error.message)
    process.exit(1)
  })
}
