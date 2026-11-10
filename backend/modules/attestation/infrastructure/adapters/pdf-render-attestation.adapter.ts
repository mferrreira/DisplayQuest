import { readFileSync } from "node:fs";
import path from "node:path";

import fontkit from "@cantoo/fontkit";
import { grayscale, PDFDocument, PDFFont, PDFPage } from "@cantoo/pdf-lib";

import type { AttestationPdfPort } from "../../application/ports/attestation-pdf.port";

const ATTESTADO_FONT_PATH = path.join(process.cwd(), "assets", "fonts", "LiberationSerif-Regular.ttf");
const ATTESTADO_IMAGE_PATH = path.join(process.cwd(), "templates", "atestado-html", "images", "image1.png");

// Geometria medida na renderização fiel do `resultado-esperado.docx` (LibreOffice, A4).
// As posições de texto são a ARESTA SUPERIOR do span medido; `y()` devolve a baseline em
// coordenada PDF (origem embaixo), com a descida medida da fonte por corpo.
const HEIGHT = 841.9;
const WIDTH = 595.3;
const LEFT = 48.5;
const RIGHT = 555.8;
const DESCENDER = 0.2164;

const HEADER_LINES = [
  "Ministério da Educação",
  "Secretaria de Educação Profissional e Tecnológica",
  "Instituto Federal do Norte de Minas Gerais",
  "Pró-Reitoria de Pesquisa, Pós-Graduação e Inovação",
  "Diretoria de Pesquisa, Pós-Graduação e Inovação – Campus Januária",
];

const DESC_LABEL = "Descreva as atividades do(a) estudante no projeto durante o período indicado.";

function y(top: number, size: number): number {
  return HEIGHT - top + size * DESCENDER;
}

function centerArgs(font: PDFFont, text: string, size: number, top: number, cx: number = WIDTH / 2) {
  return { x: cx - font.widthOfTextAtSize(text, size) / 2, y: y(top, size), size, font };
}

function wrap(font: PDFFont, text: string, size: number, width: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= width) current = candidate;
    else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function box(key: string, fields: Record<string, string | boolean>): string {
  return fields[key] ? "X" : "";
}

/**
 * plan-v22 S05 (Método C, R8): reconstrói o atestado em pdf-lib, página a página, na geometria
 * medida do referencial. O adaptador desenha todas as peças: cabeçalho, título, corpo, as duas
 * tabelas com fundo cinza nas linhas de cabeçalho, as caixas [X], a descrição, a tabela de
 * situação, a linha de data, as assinaturas e o rodapé.
 */
export class PdfRenderAttestationAdapter implements AttestationPdfPort {
  constructor(
    private readonly fontPath: string = ATTESTADO_FONT_PATH,
    private readonly imagePath: string = ATTESTADO_IMAGE_PATH,
  ) {}

  async renderPdf(fields: Record<string, string | boolean>): Promise<Uint8Array> {
    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);
    const font = await doc.embedFont(readFileSync(this.fontPath));

    const p1 = doc.addPage([WIDTH, HEIGHT]);
    const p2 = doc.addPage([WIDTH, HEIGHT]);

    this.header(p1, font);
    this.header(p2, font);

    p1.drawText("ANEXO IV", centerArgs(font, "ANEXO IV", 14, 189.9));
    p1.drawText("ATESTADO DE FREQUÊNCIA DE BOLSISTA/VOLUNTÁRIO", centerArgs(font, "ATESTADO DE FREQUÊNCIA DE BOLSISTA/VOLUNTÁRIO", 14, 235.9));

    const data = String(fields.data ?? "");
    const body = [
      "Atesto, para os fins de comprovação de frequência ou carga horária de atuação para recebimento de",
      "bolsa, que o(a) estudante abaixo relacionado(a), obteve frequência integral durante o mês de",
      `${data}, demonstrando desempenho satisfatório no cumprimento de suas atividades referentes`,
      "ao projeto indicado.",
    ];
    const bodyTops = [277.3, 291.1, 304.9, 318.7];
    body.forEach((line, i) => p1.drawText(line, { x: 50, y: y(bodyTops[i], 12), size: 12, font }));

    this.projectTable(p1, font, fields);
    this.studentTable(p1, font, fields);

    p1.drawText("DESCRIÇÃO SUCINTA DAS ATIVIDADES", centerArgs(font, "DESCRIÇÃO SUCINTA DAS ATIVIDADES", 8, 748.4));
    p1.drawText(DESC_LABEL, centerArgs(font, DESC_LABEL, 8, 758.1));

    const desc = fields.atividade_2;
    if (typeof desc === "string" && desc) {
      const lines = wrap(font, desc, 8, RIGHT - LEFT);
      lines.forEach((line, i) => p2.drawText(line, { x: LEFT, y: y(37.7 + i * 9.2, 8), size: 8, font }));
    }

    this.statusTable(p2, font, fields);

    p2.drawText(`Januária, ${fields.dia} de ${fields.mes} de ${fields.ano}.`, { x: 402.5, y: y(241.0, 10), size: 10, font });
    p2.drawText("________________________________________________", { x: 177.8, y: y(287.2, 10), size: 10, font });
    p2.drawText("Assinatura do(a) Estudante", centerArgs(font, "Assinatura do(a) Estudante", 10, 298.7));
    p2.drawText("________________________________________________", { x: 177.8, y: y(333.4, 10), size: 10, font });
    p2.drawText("Assinatura do(a) Orientador(a)", centerArgs(font, "Assinatura do(a) Orientador(a)", 10, 344.9));

    this.footer(p2, font);

    const png = readFileSync(this.imagePath);
    const embed = await doc.embedPng(png);
    p1.drawImage(embed, { x: 265.4, y: HEIGHT - 87.1, width: 44.3, height: 44.3 });

    return doc.save();
  }

  private header(page: PDFPage, font: PDFFont) {
    const tops = [107.8, 118.1, 128.5, 138.8, 149.1];
    HEADER_LINES.forEach((line, i) => page.drawText(line, centerArgs(font, line, 8, tops[i])));
    page.drawLine({ start: { x: 49.9, y: HEIGHT - 153.2 }, end: { x: 520.2, y: HEIGHT - 153.2 }, thickness: 0.6, color: grayscale(0.5) });
  }

  private footer(page: PDFPage, font: PDFFont) {
    page.drawText("Instituto Federal do Norte de Minas Gerais - Reitoria", centerArgs(font, "Instituto Federal do Norte de Minas Gerais - Reitoria", 7, 767.8));
    page.drawText("Rua Coronel Luiz Pires, 202, Centro - Montes Claros-MG – CEP: 39.400-106", centerArgs(font, "Rua Coronel Luiz Pires, 202, Centro - Montes Claros-MG – CEP: 39.400-106", 7, 775.8));
    page.drawText("Telefone: (38) 3201-3078 - E-mail: proppi@ifnmg.edu.br", centerArgs(font, "Telefone: (38) 3201-3078 - E-mail: proppi@ifnmg.edu.br", 7, 783.8));
  }

  private projectTable(page: PDFPage, font: PDFFont, fields: Record<string, string | boolean>) {
    const tops = [331.1, 352.8, 374.5, 396.2, 417.9, 439.6];
    const lines = [
      "INFORMAÇÕES DO PROJETO",
      `EDITAL: ${fields.edital ?? ""}`,
      `TÍTULO DO PROJETO: ${fields.titulo ?? ""}`,
      `ORIENTADOR(A): ${fields.orientador ?? ""}`,
      "CO-ORIENTADOR(A): Se aplicável, devendo constar como membro da equipe executora do projeto.",
    ];

    page.drawRectangle({ x: LEFT, y: HEIGHT - 352.5, width: RIGHT - LEFT, height: 352.5 - 330.8, color: grayscale(0.65) });
    lines.forEach((line, i) => page.drawText(line, { x: LEFT + 5, y: y(tops[i] + 16, 8), size: 8, font }));

    for (const top of tops) page.drawLine({ start: { x: LEFT, y: HEIGHT - top }, end: { x: RIGHT, y: HEIGHT - top }, thickness: 0.6 });
    page.drawLine({ start: { x: LEFT, y: HEIGHT - 330.8 }, end: { x: LEFT, y: HEIGHT - 439.6 }, thickness: 0.6 });
    page.drawLine({ start: { x: RIGHT, y: HEIGHT - 330.8 }, end: { x: RIGHT, y: HEIGHT - 439.6 }, thickness: 0.6 });
  }

  private studentTable(page: PDFPage, font: PDFFont, fields: Record<string, string | boolean>) {
    const tops = [450.4, 472.1, 502.1, 531.8, 561.5, 591.2, 620.9, 663.8, 685.5, 707.2];

    page.drawRectangle({ x: LEFT, y: HEIGHT - 472.1, width: RIGHT - LEFT, height: 472.1 - 450.4, color: grayscale(0.65) });

    const rows: { top: number; parts: { x: number; text: string }[] }[] = [
      { top: 465.7, parts: [{ x: LEFT + 5, text: "DADOS DO(A) ESTUDANTE" }] },
      { top: 491.4, parts: [{ x: LEFT + 5, text: `NOME COMPLETO: ${fields.nome ?? ""}` }, { x: 385.2, text: `CPF: ${fields.CPF ?? ""}` }] },
      { top: 521.1, parts: [{ x: LEFT + 5, text: "CAMPUS: Januária" }, { x: 385.2, text: `MATRÍCULA: ${fields.matricula ?? ""}` }] },
      { top: 550.8, parts: [{ x: LEFT + 5, text: `NÍVEL:       Médio [${box("nivel_medio", fields)}]      Graduação [${box("nivel_graduacao", fields)}]      Pós-Graduação [${box("nivel_pos-graduacao", fields)}]` }] },
      { top: 580.5, parts: [{ x: LEFT + 5, text: `CARGA HORÁRIA (semanal):          8 h [${box("carga_8", fields)}]          20 h [${box("carga_20", fields)}]          Horário Adaptado para          ${fields.horas_adaptada ?? ""} h [${box("carga_adaptada", fields)}]` }] },
      { top: 610.2, parts: [{ x: LEFT + 5, text: "CARACTERIZAÇÃO:" }, { x: 170.9, text: `Bolsista [${box("is_bolsista", fields)}]` }, { x: 245.8, text: `Voluntário(a) (sem bolsa) [${box("is_voluntario", fields)}]` }] },
      { top: 635.9, parts: [{ x: LEFT + 5, text: `SE BOLSISTA: ${fields.se_bolsista ?? ""}` }] },
      { top: 657.1, parts: [{ x: LEFT + 5, text: `PIBIC [${box("is_pibic", fields)}]    PIBIC-Jr/EM [${box("is_pibic-jr", fields)}]    PIBIC-AF [${box("is_pibic-af", fields)}]    PIBITI [${box("is_pibiti", fields)}]    PIBITI-Jr [${box("is_pibiti-jr", fields)}]    BTP [${box("is_btp", fields)}]    Mestrado [${box("is_mestrado", fields)}]    Doutorado [${box("is_doutorado", fields)}]    Pós-Doc [${box("is_pos-doc", fields)}]` }] },
      { top: 678.8, parts: [{ x: LEFT + 5, text: "AGÊNCIA FINANCIADORA:" }] },
      { top: 700.5, parts: [{ x: LEFT + 5, text: `IFNMG [${box("is_ifnmg", fields)}]` }, { x: 117.7, text: `CNPq [${box("is_cnpq", fields)}]` }, { x: 197.9, text: `FAPEMIG [${box("is_fapemig", fields)}]` }, { x: 344.8, text: `OUTRA [${box("is_outra", fields)}] Especifique:` }] },
    ];

    for (const top of tops) page.drawLine({ start: { x: LEFT, y: HEIGHT - top }, end: { x: RIGHT, y: HEIGHT - top }, thickness: 0.6 });
    page.drawLine({ start: { x: LEFT, y: HEIGHT - 450.4 }, end: { x: LEFT, y: HEIGHT - 707.2 }, thickness: 0.6 });
    page.drawLine({ start: { x: RIGHT, y: HEIGHT - 450.4 }, end: { x: RIGHT, y: HEIGHT - 707.2 }, thickness: 0.6 });

    for (const row of rows) {
      for (const part of row.parts) page.drawText(part.text, { x: part.x, y: y(row.top, 8), size: 8, font });
    }
  }

  private statusTable(page: PDFPage, font: PDFFont, fields: Record<string, string | boolean>) {
    const tops = [86.7, 100.7, 119.6, 133.1, 152.0, 165.5, 179.0];

    page.drawRectangle({ x: LEFT - 2.5, y: HEIGHT - 100.4, width: 505.4, height: 100.4 - 76.7, color: grayscale(0.85) });
    page.drawRectangle({ x: LEFT - 2.5, y: HEIGHT - 100.4, width: 102.3, height: 14, color: grayscale(0.85) });
    page.drawRectangle({ x: LEFT + 99.8, y: HEIGHT - 100.4, width: 400, height: 14, color: grayscale(0.85) });

    const labelRows: { label: string; key: string; x: number }[] = [
      { label: "Não Iniciado", key: "status_nao-iniciado", x: 46 },
      { label: "Atrasado", key: "status_atrasado", x: 46 },
      { label: "Como Previsto", key: "status_como-previsto", x: 46 },
      { label: "Adiantado", key: "status_adiantado", x: 46 },
      { label: "Concluído", key: "status_concluido", x: 46 },
    ];
    const rows = [109.8, 128.7, 142.2, 161.1, 174.6];

    page.drawText("SITUAÇÃO ATUAL DO PROJETO", { x: LEFT - 2.5, y: y(86.1, 8), size: 8, font });
    page.drawText("Status", { x: 87.8, y: y(95.8, 8), size: 8, font });
    page.drawText("Justificativa", { x: 330.2, y: y(95.8, 8), size: 8, font });

    labelRows.forEach(({ label, key, x }, i) => {
      const baseline = y(rows[i], 8);
      page.drawText(label, { x, y: baseline, size: 8, font });
      page.drawText(`[${box(key, fields)}]`, { x: 112.7, y: baseline, size: 8, font });
    });

    for (const top of tops) page.drawLine({ start: { x: LEFT - 2.5, y: HEIGHT - top }, end: { x: RIGHT - 4.5, y: HEIGHT - top }, thickness: 0.6 });
    page.drawLine({ start: { x: LEFT - 2.5, y: HEIGHT - 86.4 }, end: { x: LEFT - 2.5, y: HEIGHT - 179.0 }, thickness: 0.6 });
    page.drawLine({ start: { x: 99.8, y: HEIGHT - 86.4 }, end: { x: 99.8, y: HEIGHT - 179.0 }, thickness: 0.6 });
    page.drawLine({ start: { x: RIGHT - 4.5, y: HEIGHT - 86.4 }, end: { x: RIGHT - 4.5, y: HEIGHT - 179.0 }, thickness: 0.6 });
  }
}
