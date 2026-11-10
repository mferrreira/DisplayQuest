import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ASSET = join(import.meta.dirname === "scripts" ? ".." : ".", "templates", "atestado-html", "blank.html");

// Cada troca tem `expected`: um oficial trocado quebra a derivação nomeando o campo,
// em vez de marcar menos placeholders em silêncio (mesma regra do template de relatório, V5-1a).
const REPLACEMENTS = [
  { name: "data", from: "m&ecirc;s &nbsp;de &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp;, demonstrando", to: "m&ecirc;s &nbsp;de {{data}}, demonstrando" },
  { name: "titulo", from: "T&Iacute;TULO DO PROJETO: </span>", to: "T&Iacute;TULO DO PROJETO: {{titulo}}</span>" },
  { name: "edital", from: "EDITAL: </span>", to: "EDITAL: {{edital}}</span>" },
  { name: "orientador", from: "ORIENTADOR(A): Joselice Ferreira Lima </span>", to: "ORIENTADOR(A): {{orientador}}</span>" },
  { name: "nome", from: "NOME COMPLETO: </span>", to: "NOME COMPLETO: {{nome}}</span>" },
  { name: "cpf", from: "CPF: </span>", to: "CPF: {{cpf}}</span>" },
  { name: "matricula", from: "MATR&Iacute;CULA: </span>", to: "MATR&Iacute;CULA: {{matricula}}</span>" },
  { name: "se_bolsista", from: "SE BOLSISTA: </span>", to: "SE BOLSISTA: {{se_bolsista}}</span>" },
  { name: "signature", from: "Janu&aacute;ria, &nbsp; &nbsp; de &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp;de &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; .</span>", to: "Janu&aacute;ria, {{dia}} de {{mes}} de {{ano}}.</span>" },
  { name: "desc", from: "per&iacute;odo indicado.</span></p></td></tr><tr class=\"c17\"><td class=\"c86\" colspan=\"1\" rowspan=\"1\"><p class=\"c6\"><span class=\"c4\"></span></p><p class=\"c6\"><span class=\"c4\"></span></p><p class=\"c6\"><span class=\"c4\"></span></p><p class=\"c6\"><span class=\"c4\"></span></p><p class=\"c6\"><span class=\"c4\"></span></p><p class=\"c6\"><span class=\"c4\"></span></p>", to: "per&iacute;odo indicado.</span></p></td></tr><tr class=\"c17\"><td class=\"c86\" colspan=\"1\" rowspan=\"1\"><p class=\"c6\"><span class=\"c4\">{{desc}}</span></p>" },
];

// Rótulo -> chave do mapa de campos. A caixa seguinte ao rótulo vira placeholder do X.
const BOXES = [
  ["M&eacute;dio", "nivel_medio"],
  ["P&oacute;s-Gradua&ccedil;&atilde;o", "nivel_pos-graduacao"],
  ["Gradua&ccedil;&atilde;o", "nivel_graduacao"],
  ["8 h", "carga_8"],
  ["20 h", "carga_20"],
  ["Hor&aacute;rio Adaptado para", "horas_adaptada"],
  ["Bolsista", "is_bolsista"],
  ["Volunt&aacute;rio(a) (sem bolsa)", "is_voluntario"],
  ["PIBIC", "is_pibic"],
  ["PIBIC-Jr/EM", "is_pibic-jr"],
  ["PIBIC-AF", "is_pibic-af"],
  ["PIBITI", "is_pibiti"],
  ["PIBITI-Jr", "is_pibiti-jr"],
  ["BTP", "is_btp"],
  ["Mestrado", "is_mestrado"],
  ["Doutorado", "is_doutorado"],
  ["P&oacute;s-Doc", "is_pos-doc"],
  ["IFNMG", "is_ifnmg"],
  ["CNPq", "is_cnpq"],
  ["FAPEMIG", "is_fapemig"],
  ["OUTRA", "is_outra"],
  ["N&atilde;o Iniciado", "status_nao-iniciado"],
  ["Atrasado", "status_atrasado"],
  ["Como Previsto", "status_como-previsto"],
  ["Adiantado", "status_adiantado"],
  ["Conclu&iacute;do", "status_concluido"],
];

function main() {
  const html = readFileSync(process.argv[2] ?? ASSET, "utf8");
  let out = html;

  for (const { name, from, to } of REPLACEMENTS) {
    const i = out.indexOf(from);
    if (i < 0) throw new Error(`template HTML: campo "${name}" não encontrado no oficial`);
    if (out.indexOf(from, i + 1) >= 0) throw new Error(`template HTML: campo "${name}" aparece mais de uma vez`);
    out = out.slice(0, i) + to + out.slice(i + from.length);
  }

  for (const [label, key] of BOXES) {
    // O rótulo pode aparecer no cabeçalho do mesmo nome (ex.: "Graduação" na Diretoria);
    // a caixa é a primeira `[ ... ]` a curta distância do rótulo.
    let li = 0;
    let boxStart = -1;
    let boxEnd = -1;
    for (;;) {
      li = out.indexOf(label, li);
      if (li < 0) throw new Error(`template HTML: rótulo "${label}" não encontrado`);
      // O rótulo pode estar embutido no cabeçalho ("Pós-Graduação" na Diretoria).
      const spanStart = out.lastIndexOf(">", li) + 1;
      const spanEnd = out.indexOf("<", li);
      const span = out.slice(spanStart, spanEnd);
      const inHeader = /Inova&ccedil;&atilde;o|Diretoria|Reitoria|Campus|Secretaria|Minist&eacute;rio|Instituto Federal/.test(span);
      const bs = out.indexOf("[", li + label.length, li + label.length + 200);
      const be = bs >= 0 ? out.indexOf("]", bs) : -1;
      if (!inHeader && bs >= 0 && be >= 0) { boxStart = bs; boxEnd = be; break; }
      li += label.length;
    }
    out = out.slice(0, boxStart) + `[ {{X_${key}}} ]` + out.slice(boxEnd + 1);
  }

  const dest = process.argv[3] ?? join(process.cwd(), "templates", "atestado-frequencia.template.html");
  writeFileSync(dest, out);
  console.log(`template derivado: ${dest} (${out.length} bytes, ${REPLACEMENTS.length} campos, ${BOXES.length} caixas)`);
}

main();
