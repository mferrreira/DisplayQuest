/**
 * V5-9c (DEC-139/152/168) — regras puras do rascunho de IA, congeladas ANTES do código.
 *
 * O prompt é construído no domínio (função pura, testável) e a IA é uma porta: nenhum
 * teste de unit toca rede. O que fica preso aqui:
 *   1. O prompt exige as TRÊS linhas de cabeçalho do oficial na forma da chave curta
 *      (`REPORT_SECTIONS` — fonte única, DEC-168): o texto que a IA devolve é o mesmo
 *      que `splitReportBody` vai cortar no V5-9b. Prompt e cortador falam a mesma tabela
 *      porque consomem a mesma constante.
 *   2. A regra de honestidade (juiz 3, DEC-168): a IA escreve só o que consegue ancorar
 *      nas três fontes e deixa seção VAZIA sem evidência — o rascunho nasce de logs,
 *      tarefas e cronograma, material que descreve atividade, não resultado; inventar
 *      "publicações e patentes" é o modo de falha do documento oficial.
 *   3. As três fontes do plano: logs de sessão (`work_sessions`), tarefas do projeto e
 *      atividades do cronograma — a janela é o período do relatório (DEC-167).
 */
import { describe, expect, it } from "vitest";

import { buildTechnicalReportDraftPrompt } from "@/backend/domain";

const input = {
  project: { name: "IA no campo", proppiNumber: "PROPPI-2026-017", leaderName: "Profa. Ana Souza" },
  type: "parcial" as const,
  period: { periodoInicio: "2026-03-01", periodoFim: "2026-10-14" },
  sessions: [
    { date: "2026-05-10", userName: "Bento Lima", activity: "Revisão bibliográfica", durationHours: 3.5, location: "Laboratório 2" },
  ],
  tasks: [
    { title: "Montar o dataset", status: "done", completedAt: "2026-06-02", points: 15 },
    { title: "Escrever a introdução", status: "in-progress", completedAt: null, points: 10 },
  ],
  activities: [
    { description: "Levantamento bibliográfico", firstMonth: "2026-03", lastMonth: "2026-05", status: "DONE", evidenceCount: 2 },
  ],
};

describe("prompt do rascunho de IA (V5-9c, DEC-139/168)", () => {
  it("exige as três chaves de seção na ordem canônica — o mesmo vocabulário do cortador", () => {
    const prompt = buildTechnicalReportDraftPrompt(input);
    const keys = ["Descrição das Atividades", "Principais Resultados", "Comentários Adicionais"];
    for (const key of keys) {
      expect(prompt).toContain(key);
    }
    // ordem canônica no prompt (a mesma do oficial e do splitReportBody)
    const positions = keys.map((key) => prompt.indexOf(key));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it("traz a regra de honestidade: só o que tem âncora nas fontes, seção vazia sem evidência", () => {
    const prompt = buildTechnicalReportDraftPrompt(input);
    expect(prompt).toContain("não invente");
    expect(prompt).toContain("vazia");
  });

  it("descreve o projeto, o tipo e o período do relatório (DEC-167)", () => {
    const prompt = buildTechnicalReportDraftPrompt(input);
    expect(prompt).toContain("IA no campo");
    expect(prompt).toContain("PROPPI-2026-017");
    expect(prompt).toContain("Profa. Ana Souza");
    expect(prompt).toContain("parcial");
    expect(prompt).toContain("2026-03-01");
    expect(prompt).toContain("2026-10-14");
  });

  it("enumera as três fontes com seus dados — a IA ancora no que recebeu", () => {
    const prompt = buildTechnicalReportDraftPrompt(input);
    // sessão
    expect(prompt).toContain("Revisão bibliográfica");
    expect(prompt).toContain("Bento Lima");
    expect(prompt).toContain("2026-05-10");
    // tarefas: concluída e em andamento, com pontos
    expect(prompt).toContain("Montar o dataset");
    expect(prompt).toContain("15");
    expect(prompt).toContain("Escrever a introdução");
    // cronograma: mês e status
    expect(prompt).toContain("Levantamento bibliográfico");
    expect(prompt).toContain("2026-03");
    expect(prompt).toContain("2026-05");
  });

  it("fonte vazia é declarada vazia — 'sem registros' no prompt, nunca silêncio que a IA preenche", () => {
    const prompt = buildTechnicalReportDraftPrompt({
      ...input,
      sessions: [],
      tasks: [],
      activities: [],
    });
    expect(prompt).toContain("sem registros");
  });

  it("pede texto puro em português, sem markdown de cabeçalho além das três linhas", () => {
    const prompt = buildTechnicalReportDraftPrompt(input);
    expect(prompt).toContain("texto puro");
    expect(prompt).toContain("português");
  });

  it("o Final segue RECITAL/IFNMG e deixa lacunas científicas explícitas", () => {
    const prompt = buildTechnicalReportDraftPrompt({ ...input, type: "final" });
    for (const section of ["Título (português)", "Título (English)", "Resumo", "Abstract", "Palavras-chave", "Keywords", "1 Introdução", "2 Referencial teórico", "3 Metodologia", "4 Resultados e discussão", "5 Conclusão", "Referências"]) {
      expect(prompt).toContain(section);
    }
    expect(prompt).toContain("ABNT NBR 6022:2018");
    expect(prompt).toContain("[COMPLEMENTAÇÃO DA AUTORIA:");
    expect(prompt).toContain("Não crie referências");
  });
});
