// @vitest-environment node
/**
 * plan-v22 S05 (R8) — o adaptador `pdf-lib` reconstrói o atestado na geometria medida do
 * referencial. O que este arquivo congela é o byte entregue, não o código: 2 páginas, as peças
 * em texto, a imagem do cabeçalho, as linhas de tabela, as caixas de checkbox e os valores.
 *
 * Gotcha medido: `PDFDocument.create()` é assíncrono no fork `@cantoo/pdf-lib` e `page.draw()`
 * não existe — texto entra em `drawText(text, options)`, imagem em `drawImage` e cor de linha em
 * `grayscale()`. A fonte é embutida pelo `fontkit`, não pelo `StandardFonts`.
 */
import path from "node:path";
import { PDFDocument, PDFPage } from "@cantoo/pdf-lib";
import { describe, expect, it } from "vitest";

import { PdfRenderAttestationAdapter } from "@/backend/modules/attestation/infrastructure/adapters/pdf-render-attestation.adapter";

const FONT_PATH = path.resolve(process.cwd(), "assets/fonts/LiberationSerif-Regular.ttf");
const IMAGE_PATH = path.resolve(process.cwd(), "templates/atestado-html/images/image1.png");

const SAMPLE = {
  titulo: "Estratégias para o Aprendizado e Resgate da Cultura Xakriabá Através de Jogos digitais",
  edital: "241/2026",
  orientador: "Joselice Ferreira Lima",
  nome: "Eleissa Oliveira Pinheiro",
  CPF: "135.900.156-59",
  matricula: "192201",
  nivel_graduacao: true,
  carga_20: true,
  is_bolsista: true,
  se_bolsista: "BAT-DI-SUP",
  is_ifnmg: true,
  ["status_como-previsto"]: true,
  data: "Novembro/2026",
  dia: "10",
  mes: "Novembro",
  ano: "2026",
  atividade_2: "Zerou o jogo xakrilíngua e fez um relatório sobre as funcionalidades do jogo.",
};

const adapter = new PdfRenderAttestationAdapter(FONT_PATH, IMAGE_PATH);

async function render(fields: Record<string, string | boolean> = SAMPLE) {
  const bytes = await adapter.renderPdf(fields);
  return PDFDocument.load(bytes);
}

function textAssets(page: PDFPage) {
  return page.extractContents().filter((asset) => asset.kind === "text");
}

function graphicsAssets(page: PDFPage) {
  return page.extractContents().filter((asset) => asset.kind === "graphics");
}

function imageAssets(page: PDFPage) {
  return page.extractContents().filter((asset) => asset.kind === "image");
}

function textOf(asset: ReturnType<typeof textAssets>[number]): string {
  return asset.kind === "text" ? asset.getText() : "";
}

function findText(page: PDFPage, needle: string) {
  const clean = (s: string) => s.replace(/\s+/g, " ").trim();
  return textAssets(page).filter((asset) => clean(textOf(asset)).includes(needle));
}

function horizontalLines(page: PDFPage) {
  return graphicsAssets(page).filter((asset) => asset.kind === "graphics" && asset.width > 40 && asset.height < 2.5);
}

function inTextArea(asset: { kind: "text"; x: number; y: number; fontSize: number }) {
  const size = asset.fontSize;
  return asset.x >= 28 && asset.x + size <= 568 && asset.y - size >= 18 && asset.y + size <= 824;
}

describe("PdfRenderAttestationAdapter (plan-v22 S05, R8)", () => {
  it("entrega um PDF de 2 páginas sem AcroForm, com a fonte Liberation Serif embutida", async () => {
    const doc = await render();
    expect(doc.getPageCount()).toBe(2);
    expect(doc.getForm().getFields()).toHaveLength(0);
    const fonts = new Set(textAssets(doc.getPage(0)).map((asset) => asset.fontFamily));
    expect([...fonts][0]).toMatch(/^LiberationSerif-/);
  });

  it("a página 1 tem as cinco linhas do cabeçalho, o título e o corpo em Liberation Serif", async () => {
    const doc = await render();
    const page = doc.getPage(0);
    const labels = [
      "Ministério da Educação",
      "Secretaria de Educação Profissional e Tecnológica",
      "Instituto Federal do Norte de Minas Gerais",
      "Pró-Reitoria de Pesquisa, Pós-Graduação e Inovação",
      "Diretoria de Pesquisa, Pós-Graduação e Inovação – Campus Januária",
      "ANEXO IV",
      "ATESTADO DE FREQUÊNCIA DE BOLSISTA/VOLUNTÁRIO",
      "Atesto, para os fins de comprovação de frequência ou carga horária de atuação para recebimento de",
      "bolsa, que o(a) estudante abaixo relacionado(a), obteve frequência integral durante o mês de",
      "Novembro/2026, demonstrando desempenho satisfatório no cumprimento de suas atividades referentes",
      "ao projeto indicado.",
    ];
    for (const label of labels) expect(findText(page, label).length).toBeGreaterThan(0);
  });

  it("a página 1 tem as duas tabelas com valores, caixas [X] e linhas horizontais", async () => {
    const doc = await render();
    const page = doc.getPage(0);
    const labels = [
      "INFORMAÇÕES DO PROJETO",
      "EDITAL: 241/2026",
      "TÍTULO DO PROJETO:",
      "ORIENTADOR(A): Joselice Ferreira Lima",
      "CO-ORIENTADOR(A):",
      "DADOS DO(A) ESTUDANTE",
      "NOME COMPLETO: Eleissa Oliveira Pinheiro",
      "CPF: 135.900.156-59",
      "CAMPUS: Januária",
      "MATRÍCULA: 192201",
      "NÍVEL:",
      "CARGA HORÁRIA (semanal):",
      "CARACTERIZAÇÃO:",
      "SE BOLSISTA: BAT-DI-SUP",
      "AGÊNCIA FINANCIADORA:",
      "DESCRIÇÃO SUCINTA DAS ATIVIDADES",
    ];
    for (const label of labels) expect(findText(page, label).length).toBeGreaterThan(0);

    const checked = ["Graduação [X]", "20 h [X]", "Bolsista [X]", "IFNMG [X]"];
    for (const label of checked) expect(findText(page, label).length).toBeGreaterThan(0);

    expect(findText(page, "Médio []").length).toBeGreaterThan(0);
    expect(findText(page, "Pós-Graduação []").length).toBeGreaterThan(0);
    expect(findText(page, "Voluntário(a) (sem bolsa) []").length).toBeGreaterThan(0);

    expect(graphicsAssets(page).filter((a) => a.kind === "graphics" && a.width > 100 && a.height > 10).length).toBeGreaterThanOrEqual(2);
    expect(horizontalLines(page).length).toBeGreaterThanOrEqual(6);
  });

  it("a página 2 tem descrição, tabela de situação, caixa X do status, data e assinaturas", async () => {
    const doc = await render();
    const page = doc.getPage(1);
    const labels = [
      "Zerou o jogo xakrilíngua",
      "SITUAÇÃO ATUAL DO PROJETO",
      "Status",
      "Justificativa",
      "Não Iniciado",
      "Atrasado",
      "Como Previsto",
      "Adiantado",
      "Concluído",
      "Januária, 10 de Novembro de 2026.",
      "Assinatura do(a) Estudante",
      "Assinatura do(a) Orientador(a)",
    ];
    for (const label of labels) expect(findText(page, label).length).toBeGreaterThan(0);

    expect(findText(page, "Como Previsto").length).toBe(1);
    expect(findText(page, "[X]").length).toBeGreaterThan(0);
    expect(horizontalLines(page).length).toBeGreaterThanOrEqual(5);
  });

  it("a imagem do cabeçalho sai na página 1 e nenhum texto sai da área útil", async () => {
    const doc = await render();
    expect(imageAssets(doc.getPage(0)).length).toBeGreaterThanOrEqual(1);
    for (const page of doc.getPages()) {
      for (const asset of textAssets(page)) expect(inTextArea(asset)).toBe(true);
    }
  });

  it("campo sem valor não escreve texto: campo ausente deixa a caixa vazia e o valor não aparece", async () => {
    const doc = await render({ nivel_graduacao: true, CPF: "", se_bolsista: "", atividade_2: "" });
    const page = doc.getPage(0);
    expect(findText(page, "135.900.156-59").length).toBe(0);
    expect(findText(page, "BAT-DI-SUP").length).toBe(0);
    expect(findText(page, "Zerou").length).toBe(0);
    expect(findText(page, "Graduação [X]").length).toBe(1);
    expect(findText(page, "Médio []").length).toBe(1);
  });

  it("a ordem dos rótulos da tabela de situação é Não Iniciado, Atrasado, Como Previsto, Adiantado, Concluído", async () => {
    const doc = await render();
    const page = doc.getPage(1);
    const labels = ["Não Iniciado", "Atrasado", "Como Previsto", "Adiantado", "Concluído"];
    const ys = labels.map((label) => {
      const asset = findText(page, label)[0];
      expect(asset).toBeDefined();
      return asset.kind === "text" ? asset.y : Number.POSITIVE_INFINITY;
    });
    expect(ys.every((y, i) => i === 0 || y < ys[i - 1])).toBe(true);
  });
});
