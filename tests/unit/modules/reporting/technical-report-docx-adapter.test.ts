// @vitest-environment node
/**
 * V5-9b (DEC-129) — o adaptador DOCX REAL contra a cópia marcada do template oficial.
 *
 * O guarda central do DEC-129: **o sistema nunca escreve estilo**. A prova é por
 * entrada do zip: colapsado o espaço entre tags (o docx-templates re-serializa com
 * indentação — medido na execução), cada parte além do `word/document.xml` é idêntica
 * à da cópia marcada. Se o adaptador (ou uma versão futura do docx-templates) mexer em
 * `styles.xml`, tema, fontes ou sectPr, este teste falha nomeando a entrada.
 *
 * Também congelado: o delimitador importado do script (`CMD_DELIMITER`) vê os 17
 * comandos (o default `+++` não veria — armadilha medida no V5-1a); `processLineBreaks`
 * é o mecanismo do texto puro multi-linha nas tabelas; a biblioteca escapa XML nos
 * valores (nome com `&` não abre um run novo no documento).
 */
import fs from "node:fs";

import { describe, expect, it } from "vitest";
import JSZip from "jszip";

import { DocxTechnicalReportAdapter } from "@/backend/modules/reporting/infrastructure/adapters/docx-technical-report.adapter";
import { buildTechnicalReportCommands } from "@/backend/domain";
import {
  DOC_PATH,
  TARGET_PATH,
  extractText,
} from "../../../../scripts/tag-report-template.mjs";

/**
 * Fato medido na execução do V5-9b (2026-10-14): o docx-templates RE-SERIALIZA as
 * partes XML que reescreve — CRLF vira LF e indentação é inserida entre tags
 * (`styles.xml` cresce 12264 → 14856 bytes SEM mudar conteúdo). A identidade byte a
 * byte vale para a cópia marcada (o script de tag preserva bytes); para o documento
 * GERADO a invariant honesta do DEC-129 é SEMÂNTICA: colapsado o espaço entre tags,
 * cada parte é idêntica à da cópia marcada. Texto real dentro de `<w:t>` não é
 * colapsado — só o vão de puro espaço entre `>` e `<`.
 */
const normalizeXml = (xml: string) =>
  xml.replace(/\r\n/g, "\n").replace(/>\s+</g, "><").trim();

async function zipEntries(source: Uint8Array): Promise<Map<string, Uint8Array>> {
  const zip = await JSZip.loadAsync(source);
  const entries = new Map<string, Uint8Array>();
  for (const entry of Object.values(zip.files)) {
    if (entry.dir) continue;
    entries.set(entry.name, new Uint8Array(await entry.async("uint8array")));
  }
  return entries;
}

const commands = buildTechnicalReportCommands({
  project: {
    name: "IA no campo",
    createdAt: "2026-02-01",
    startDate: "2026-03-01",
    endDate: "2026-12-31",
    proppiNumber: "PROPPI-2026-017",
    leaderName: "Profa. Ana Souza",
  },
  member: {
    name: "Ana & Bia",
    course: "Sistemas de Informação",
    scholarshipType: "PIBIC_JR",
    fundingAgency: "OUTRA",
    fundingAgencyOther: "CAPES",
  },
  type: "parcial",
  content: [
    "Descrição das Atividades",
    "Etapa 1 concluída.",
    "Segunda linha da descrição.",
    "Principais Resultados",
    "Artigo submetido.",
  ].join("\n"),
  now: "2026-10-14",
});

describe("DocxTechnicalReportAdapter — o oficial preenchido (V5-9b, DEC-129)", () => {
  it("renderiza a cópia marcada e NÃO muda o significado de nenhuma entrada além do document.xml", async () => {
    const adapter = new DocxTechnicalReportAdapter();
    const rendered = await adapter.render(commands);

    const templateEntries = await zipEntries(fs.readFileSync(TARGET_PATH));
    const outputEntries = await zipEntries(rendered);

    expect([...outputEntries.keys()].sort()).toEqual([...templateEntries.keys()].sort());

    const changed: string[] = [];
    for (const [name, bytes] of templateEntries) {
      if (name === DOC_PATH) continue;
      const before = normalizeXml(new TextDecoder().decode(bytes));
      const after = normalizeXml(new TextDecoder().decode(outputEntries.get(name)!));
      if (before !== after) {
        changed.push(name);
      }
    }
    // styles.xml, tema, fontes, settings, sectPr — conteúdo idêntico; só a re-serialização
    // do docx-templates (espaço entre tags) muda bytes, e isso não é estilo escrito.
    expect(changed).toEqual([]);
  });

  it("os 17 comandos viram texto: identificação, linha de tipo marcada e tabelas", async () => {
    const adapter = new DocxTechnicalReportAdapter();
    const rendered = await adapter.render(commands);
    const zip = await JSZip.loadAsync(rendered);
    const text = extractText(await zip.file(DOC_PATH)!.async("string"));

    expect(text).toContain("( ) Relatório Final ( x ) Relatório Parcial");
    expect(text).toContain("IA no campo");
    expect(text).toContain("PROPPI-2026-017");
    expect(text).toContain("Profa. Ana Souza");
    expect(text).toContain("Sistemas de Informação");
    expect(text).toContain("PIBIC Jr");
    expect(text).toContain("CAPES");
    expect(text).toContain("14/10/2026");
    expect(text).toContain("Etapa 1 concluída.");
    expect(text).toContain("Artigo submetido.");
    // nenhum comando sobrevive cru
    expect(text).not.toContain("{{");
    // seção sem corpo fica vazia — sem placeholder
    expect(text).not.toContain("Nenhuma observação");
  });

  it("texto multi-linha nas tabelas usa quebra de linha do oficial, não run novo com estilo", async () => {
    const adapter = new DocxTechnicalReportAdapter();
    const rendered = await adapter.render(commands);
    const zip = await JSZip.loadAsync(rendered);
    const xml = await zip.file(DOC_PATH)!.async("string");

    // processLineBreaks: "Etapa 1 concluída.\nSegunda linha..." vira <w:br/> dentro do
    // mesmo run — o run continua sem rPr de fonte (herda o que o oficial herda).
    expect(xml).toContain("Etapa 1 concluída.");
    expect(xml).toContain("<w:br/>");
    expect(xml).toContain("Segunda linha da descrição.");
  });

  it("valor com caractere XML é escapado — nome de pessoa não injeta run", async () => {
    const adapter = new DocxTechnicalReportAdapter();
    const rendered = await adapter.render(commands);
    const zip = await JSZip.loadAsync(rendered);
    const xml = await zip.file(DOC_PATH)!.async("string");
    const text = extractText(xml);

    expect(xml).toContain("Ana &amp; Bia");
    expect(text).toContain("Ana & Bia");
    expect(xml).not.toContain("<w:t>Ana & Bia</w:t>");
  });
});
