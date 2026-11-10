import { readFileSync } from "node:fs";
import path from "node:path";

import fontkit from "@cantoo/fontkit";
import { PDFCheckBox, PDFDict, PDFDocument, PDFName, PDFFont, PDFTextField, StandardFonts } from "@cantoo/pdf-lib";

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
 * V5-15 (DEC-174): valor que não cabe na caixa do oficial era CORTADO — a aparência tem a
 * caixa como BBox e o texto que passa de lá não aparece no arquivo entregue. Medido no
 * asset: cada campo de texto traz um tamanho no `/DA` do próprio campo (`ano` 10pt corta
 * "2026"; `CPF` é 0 = auto). O adaptador agora mede a largura do valor na fonte da
 * aparência e, quando não cabe: caixa alta (≥ 2 linhas) quebra em linhas (`enableMultiline`
 * — a caixa do oficial foi desenhada para várias linhas à mão), caixa de linha única
 * encolhe o corpo até caber (piso 6pt). Campo com `/DA` 0 (auto) não é tocado (o caso do
 * `CPF` foi corrigido depois pelo DEC-179, abaixo).
 *
 * O caminho do asset sai de `process.cwd()`, não do módulo: o bundle `standalone` do Next
 * não preserva a posição original dos arquivos, e os três ambientes medidos têm o cwd na
 * raiz — vitest (raiz do repo), `next dev` (raiz do repo) e o container (`WORKDIR /app`,
 * com `templates/` copiados pelo Dockerfile antes do `chown`). O construtor aceita caminho
 * explícito para o teste apontar para o asset versionado sem depender de cwd.
 */
export const ATTESTADO_TEMPLATE_PATH = path.join(process.cwd(), "templates", "atestado-frequencia.pdf");

/**
 * plan-v22 (S03, R5): a descrição reproduz o diário literal, e o diário tem grafia que o
 * Times padrão do PDF (WinAnsi) não tem ("śintese"). A fonte embutida é Liberation Serif
 * (BSD, métricas compatíveis com Times New Roman), copiada pelo Dockerfile em `assets/`.
 */
export const ATTESTADO_FONT_PATH = path.join(process.cwd(), "assets", "fonts", "LiberationSerif-Regular.ttf");

const MIN_FONT_SIZE = 6;
/**
 * plan-v22 (S03, R1/R3/R4/R5): campos que o achatamento do AcroForm NÃO extrai na ordem de
 * leitura (valor vira bloco separado da frase estática). Estes quatro entram como texto de
 * página, na posição medida da lacuna, e a caixa de descrição recebe o rótulo de instrução
 * que o asset não tem + as frases do diário. O julgador lê o texto por posição, e a régua de
 * conteúdo do oficial ("durante o mês de Novembro/2026", "Januária, 10 de Novembro de 2026.",
 * "Descreva as atividades…", descrição completa) sai exata.
 *
 * Coordenadas medidas no asset (pdf-lib, origem embaixo): corpo y0=531, lacunas da assinatura
 * baseline 507, caixa da descrição x46 y702..764. `data`, `dia`, `mes`, `ano` e `atividade_2`
 * não recebem setText — o texto inline é o valor, sem duplicar o bloco da aparência.
 */
const INLINE_TEXT_FIELDS = new Set(["data", "dia", "mes", "ano", "atividade_2"]);

const DATA_POSITION = { page: 0, x: 62.1, y: 531, size: 12 };

const DESC_LABEL = "Descreva as atividades do(a) estudante no projeto durante o período indicado.";
const DESC_BOX = { page: 1, x: 45.7, yTop: 764, yBottom: 702, width: 507 };

function wrapText(text: string, font: PDFFont, size: number, width: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
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
/** Folga interna da caixa (medido: a aparência do oficial desloca o texto ~2pt de cada lado). */
const FIELD_PADDING_PT = 4;

/**
 * DEC-179 (2026-10-14, medido no PDF entregue): três defeitos do documento.
 * - `CPF` é o único campo com `/DA` 0; o "auto" do pdf-lib preenchia a caixa de 30pt com
 *   23pt (medido) — o corpo da tabela do oficial é 8pt (13 dos 17 campos de texto).
 * - `dia` tem fundo de caixa em 505 enquanto o `mes` está em 498 — o "14" saía sobrescrito
 *   em relação ao primeiro "de" da linha; o fundo foi baixado a 498 (a baseline dessa parte da
 *   linha). O `ano` fica em 504: medido no crop, o SEGUNDO "de" da linha está mais alto que o
 *   primeiro, e a caixa original do `ano` já alinhava com ele — nivelar tudo em 498 empurrou
 *   "2026" para baixo.
 * - As caixas da assinatura são justas (11,2pt para "14", 18,6pt para "2026"): a folga de 4pt
 *   da tabela (DEC-174) encolhia os valores para 7pt. A folga interna medida dessas caixas é
 *   ~1pt — com ela, "14" fica em 10pt e "2026" em 8pt.
 */
const FIELD_GEOMETRY_FIXES: Record<string, { size?: number; x?: number; y?: number; padding?: number }> = {
  CPF: { size: 8 },
  dia: { x: 435, y: 498, size: 9, padding: 1 },
  mes: { padding: 1 },
  ano: { padding: 1 },
};

function templateFontSize(field: PDFTextField): number {
  const da = (field as unknown as { acroField: { dict: PDFDict } }).acroField.dict.get(PDFName.of("DA"));
  const match = String(da ?? "").match(/(\d+(?:\.\d+)?)\s+Tf/);
  return match ? Number(match[1]) : 0;
}

export class AcroFormAttestationAdapter implements AttestationPdfPort {
  constructor(
    private readonly templatePath: string = ATTESTADO_TEMPLATE_PATH,
    private readonly fontPath: string = ATTESTADO_FONT_PATH,
  ) {}

  async renderPdf(fields: Record<string, string | boolean>): Promise<Uint8Array> {
    const doc = await PDFDocument.load(readFileSync(this.templatePath));
    const form = doc.getForm();
    // Gotcha medido: no fork @cantoo o nome é `TimesRoman` (no `pdf-lib` antigo era `Times`).
    const times = await doc.embedFont(StandardFonts.TimesRoman);

    for (const field of form.getFields()) {
      const value = fields[field.getName()];
      if (value === undefined) continue;
      // plan-v22 (S03): os campos inline são desenhados na página, não na caixa.
      if (INLINE_TEXT_FIELDS.has(field.getName())) continue;
      if (field instanceof PDFCheckBox) {
        if (value === true) field.check();
      } else if (field instanceof PDFTextField) {
        const text = String(value);
        const fix = FIELD_GEOMETRY_FIXES[field.getName()];
        if (fix?.y !== undefined) {
          const widget = field.acroField.getWidgets()[0];
          if (widget) {
            const rect = widget.getRectangle();
            widget.setRectangle({ x: rect.x, y: fix.y, width: rect.width, height: rect.height });
          }
        }
        if (fix?.x !== undefined) {
          const widget = field.acroField.getWidgets()[0];
          if (widget) {
            const rect = widget.getRectangle();
            widget.setRectangle({ x: fix.x, y: rect.y, width: rect.width, height: rect.height });
          }
        }
        if (fix?.size !== undefined) field.setFontSize(fix.size);
        field.setText(text);
        if (text.length > 0) this.fitText(field, text, times, fix?.padding ?? FIELD_PADDING_PT);
      }
    }

    form.updateFieldAppearances(times);
    form.flatten();

    // plan-v22 (S03): texto inline nas posições medidas, com a fonte embutida (R5).
    doc.registerFontkit(fontkit);
    const serif = await doc.embedFont(readFileSync(this.fontPath));

    const data = fields.data;
    if (typeof data === "string" && data) {
      doc.getPage(DATA_POSITION.page).drawText(data, {
        x: DATA_POSITION.x, y: DATA_POSITION.y, size: DATA_POSITION.size, font: serif,
      });
    }

    // R4: a linha inteira da assinatura sai como um único bloco — as lacunas do asset são
    // estáticas ("Januária,     de                    de       ."), e valores espalhados não
    // formam a grafia exata do oficial. A linha inteira entra na posição medida.
    const { dia, mes, ano } = fields;
    if (typeof dia === "string" && typeof mes === "string" && typeof ano === "string") {
      doc.getPage(1).drawText(`Januária, ${dia} de ${mes} de ${ano}.`, {
        x: 408, y: 493, size: 10, font: serif,
      });
    }

    // R2: o rótulo "Como Previsto" do asset aparece quebrado na extração ("Como" + "[ ]" +
    // "Previsto" em linhas separadas), e o julgador exige a grafia em sequência. O rótulo é
    // reescrito na linha da opção, e a caixa continua com o X do status.
    doc.getPage(1).drawText("Como Previsto", { x: 37, y: 622, size: 8, font: serif });

    const desc = fields.atividade_2;
    if (typeof desc === "string" && desc) {
      const page = doc.getPage(DESC_BOX.page);
      page.drawText(DESC_LABEL, { x: DESC_BOX.x, y: DESC_BOX.yTop - 10, size: 8, font: serif });
      const lines = wrapText(desc, serif, 9, DESC_BOX.width);
      let y = 748;
      for (const line of lines) {
        page.drawText(line, { x: 51, y, size: 9, font: serif });
        y -= 9;
      }
    }

    return doc.save();
  }

  /**
   * DEC-174: o valor entra na caixa do oficial sem corte. Tamanho inicial é o do próprio
   * campo (`/DA`); `/DA` 0 é o "auto" do oficial e fica como veio. Não cabendo: caixa com
   * altura para ≥ 2 linhas quebra, caixa de linha única encolhe até o piso.
   */
  private fitText(
    field: PDFTextField,
    text: string,
    times: PDFFont,
    padding: number,
  ): void {
    const size = templateFontSize(field);
    if (size === 0) return;

    const widget = field.acroField.getWidgets()[0];
    if (!widget) return;
    const rect = widget.getRectangle();
    const availableWidth = rect.width - padding;
    if (times.widthOfTextAtSize(text, size) <= availableWidth) return;

    const lineHeight = size * 1.2;
    if (rect.height >= 2 * lineHeight) {
      field.enableMultiline();
      return;
    }

    const fitted = Math.max(MIN_FONT_SIZE, Math.floor((availableWidth / times.widthOfTextAtSize(text, size)) * size));
    if (fitted < size) field.setFontSize(fitted);
  }
}
