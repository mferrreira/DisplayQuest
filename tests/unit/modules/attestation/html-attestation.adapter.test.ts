// @vitest-environment node
/**
 * plan-v22 S04 (Método B) — o preenchimento do HTML do atestado, provado no texto que sai do
 * `fillHtml`, sem Chromium no ar.
 *
 * Medido: o template tem 31 placeholders (`{{chave}}`). Os campos de texto são a grafia do
 * HTML (`nome`, `data`, `dia`...); os campos de checkbox têm prefixo `X_` e viram "X" quando o
 * valor é verdadeiro. `fillHtml` traduz `{{cpf}}` para `fields.CPF` e `{{desc}}` para
 * `fields.atividade_2` (KEY_MAP) — as chaves do `buildAttestationFields` não são a grafia do
 * template. Placeholder que sobra é erro, não campo em branco: a honestidade da DEC-168.
 */
import path from "node:path";

import { describe, expect, it } from "vitest";

import { HtmlAttestationAdapter } from "@/backend/modules/attestation/infrastructure/adapters/html-attestation.adapter";

const TEMPLATE_PATH = path.resolve(__dirname, "../../../../templates/atestado-frequencia.template.html");

const adapter = new HtmlAttestationAdapter(TEMPLATE_PATH);

const ALL_FIELDS: Record<string, string | boolean> = {
  titulo: "Estratégias para o Aprendizado",
  edital: "PROPPI 2026",
  nome: "Bento Lima",
  CPF: "123.456.789-01",
  matricula: "20261001",
  nivel_graduacao: true,
  carga_20: true,
  is_bolsista: true,
  is_pibic: true,
  is_cnpq: true,
  status_adiantado: true,
  atividades_1: "Coleta de dados",
  atividade_2: "Revisão da literatura",
  data: "Novembro/2026",
  dia: "10",
  mes: "Novembro",
  ano: "2026",
  orientador: "Ana Souza",
  se_bolsista: "PIBIC",
};

describe("HtmlAttestationAdapter.fillHtml (plan-v22 S04, Método B)", () => {
  it("campo de texto recebe valor na grafia do template", () => {
    const html = adapter.fillHtml(ALL_FIELDS);
    expect(html).toContain("Bento Lima");
    expect(html).toContain("Estratégias para o Aprendizado");
    expect(html).toContain("Ana Souza");
    expect(html).toContain("Novembro/2026");
    expect(html).toContain("10");
    expect(html).toContain("Novembro");
    expect(html).toContain("2026");
    expect(html).toContain("PROPPI 2026");
    expect(html).toContain("20261001");
    expect(html).toContain("PIBIC");
  });

  it("KEY_MAP: {{cpf}} vem da chave CPF e {{desc}} vem da chave atividade_2", () => {
    const html = adapter.fillHtml(ALL_FIELDS);
    expect(html).toContain("123.456.789-01");
    expect(html).toContain("Revisão da literatura");
    // o `nome` não sai em CPF nem `atividade_2` em desc — cada chave tem um lugar
    expect(html).not.toContain("{{cpf}}");
    expect(html).not.toContain("{{desc}}");
  });

  it("checkbox marcado vira X dentro da caixa [  ]; desmarcado deixa a caixa vazia", () => {
    const html = adapter.fillHtml(ALL_FIELDS);
    expect((html.match(/\[ X \]/g) ?? []).length).toBe(6);
    expect(html).toContain("Gradua&ccedil;&atilde;o [ X ]");
    expect(html).toContain("Bolsista [ X ]");
    const onlyOne = adapter.fillHtml({ is_pibic: true });
    expect((onlyOne.match(/\[ X \]/g) ?? []).length).toBe(1);
    expect(onlyOne).toContain("PIBIC [ X ]");
    expect(onlyOne).toContain("Doutorado [  ]");
  });

  it("todo placeholder do template tem chave no vocabulário de campos", () => {
    const html = adapter.fillHtml(ALL_FIELDS);
    expect(html).not.toMatch(/\{\{[a-zA-Z0-9_-]+\}\}/);
    expect(html).not.toContain("{{cpf}}");
    expect(html).not.toContain("{{desc}}");
  });
});
