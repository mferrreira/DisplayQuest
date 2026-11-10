import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import type { AttestationPdfPort } from "../../application/ports/attestation-pdf.port";

const TEMPLATE_PATH = join(process.cwd(), "templates", "atestado-frequencia.template.html");
const IMAGE_PATH = join(process.cwd(), "templates", "atestado-html", "images", "image1.png");

// Os nomes dos placeholders são a grafia do HTML; as chaves do mapa seguem o AcroForm
// (`CPF`, `atividade_2`). Este dicionário é a única tradução entre os dois vocabulários.
const KEY_MAP: Record<string, string> = { cpf: "CPF", desc: "atividade_2" };

// Geometria medida na saída de novembro/2026: o export do Google não declara @page, e o
// contêiner `.c32` tem `max-width:495.5pt` + padding, que encolhe as tabelas. Os valores
// abaixo reproduzem a zona medida da referência fiel (render do `resultado-esperado.docx`):
// corpo na largura do texto, tabela do projeto na largura da tabela, quebra de página antes
// da tabela de situação (para o rodapé fechar a página 1), e fundo transparente para o
// `signature-boxes` não marcar o fundo da página como retângulo pintado na faixa da data.
const PAGE_CSS =
  '@page { size: A4; margin: 22.6pt 0 0 0; }' +
  "html, body { margin: 0; } .c32 { padding: 28.4pt 44.9pt 61.8pt 44.9pt !important; max-width: 500pt !important; }" +
  "p { margin-left: 0 !important; margin-right: 0 !important; }" +
  "body, p, td, span, div, h1, h2, li { font-family: 'Liberation Serif', 'Times New Roman', serif !important; line-height: 1.15; }" +
  "table.c8:nth-of-type(5) { page-break-before: always; }" +
  ".c32, html, body { background: transparent !important; }";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * plan-v22 S04 (Método B): o layout é o export do Google Docs do oficial, preenchido por
 * placeholders, impresso pelo Chromium em A4. `fillHtml` é a única parte de texto do
 * adaptador; o resto é a impressão.
 */
export class HtmlAttestationAdapter implements AttestationPdfPort {
  constructor(
    private readonly templatePath: string = TEMPLATE_PATH,
    private readonly chromePath: string = process.env.ATESTADO_CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ) {}

  /** Substitui cada `{{chave}}` pelo valor; `X_` vira "X" quando o campo é verdadeiro. */
  fillHtml(fields: Record<string, string | boolean>): string {
    const template = readFileSync(this.templatePath, "utf8");
    const html = template.replace(/\{\{([a-zA-Z0-9_-]+)\}\}/g, (_m, name: string) => {
      const key = KEY_MAP[name] ?? name;
      if (key.startsWith("X_")) return fields[key.slice(2)] ? "X" : "";
      const value = fields[key];
      if (typeof value === "string") return escapeHtml(value);
      return "";
    });
    const leftovers = html.match(/\{\{[a-zA-Z0-9_-]+\}\}/g);
    if (leftovers) {
      throw new Error(`template HTML do atestado: placeholder sem valor: ${leftovers.join(", ")}`);
    }
    return html;
  }

  async renderPdf(fields: Record<string, string | boolean>): Promise<Uint8Array> {
    const html = this.fillHtml(fields).replace("<head>", `<head><style>${PAGE_CSS}</style>`);

    const dir = mkdtempSync(join(tmpdir(), "atestado-"));
    mkdirSync(join(dir, "images"), { recursive: true });
    writeFileSync(join(dir, "images", "image1.png"), readFileSync(IMAGE_PATH));
    const htmlPath = join(dir, "atestado.html");
    writeFileSync(htmlPath, html);
    const outPath = join(dir, "atestado.pdf");

    const result = spawnSync(this.chromePath, [
      "--headless",
      "--disable-gpu",
      "--no-sandbox",
      "--no-pdf-header-footer",
      `--print-to-pdf=${outPath}`,
      `file://${htmlPath}`,
    ], { stdio: "pipe" });
    if (result.status !== 0) {
      throw new Error(`Chromium falhou ao imprimir o atestado: ${result.stderr?.toString().slice(0, 200)}`);
    }
    return new Uint8Array(readFileSync(outPath));
  }
}
