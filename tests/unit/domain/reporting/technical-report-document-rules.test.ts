/**
 * V5-9b (DEC-129/167/168) — regras puras do documento DOCX, congeladas ANTES do código.
 *
 * O que fica preso aqui:
 *   1. O corpo do relatório é UM texto (DEC-139) distribuído nas 3 tabelas do oficial
 *      pelas linhas de cabeçalho (DEC-168 — três juízes Big Pickle unânimes): casamento
 *      pela LINHA INTEIRA normalizada (rótulo oficial ou chave curta), preâmbulo vai na
 *      Descrição, cabeçalho duplicado concatena na MESMA tabela, ordem dos cabeçalhos não
 *      muda a tabela de destino, e sem cabeçalho o texto inteiro vai na Descrição — o
 *      ramo degenerado é o "tudo na tabela 1", nunca um erro nem texto inventado.
 *   2. A linha de checkbox é o literal medido do oficial, com os espaços do oficial:
 *      "( ) Relatório Final (  ) Relatório Parcial" — a caixa marcada recebe "x".
 *   3. O período do relatório é o do projeto cortado na data de geração: início é
 *      `startDate` (fallback `createdAt`), fim é min(`endDate`, hoje). Datas civis
 *      (DEC-132): aritmética por comparação de `YYYY-MM-DD`, exibição por substring.
 *   4. Os rótulos de modalidade/fomento vêm das MESMAS tabelas de `person-data-rules`
 *      que a tela de perfil usa (lição DEC-96: nenhum vocabulário paralelo).
 */
import { describe, expect, it } from "vitest";

import {
  REPORT_SECTIONS,
  buildTechnicalReportCommands,
  formatDocumentCivilDay,
  splitReportBody,
  technicalReportCheckboxLine,
  technicalReportDocumentPeriod,
  technicalReportFileKey,
  technicalReportFileName,
} from "@/backend/domain";

describe("relatório técnico — regras do documento (V5-9b, DEC-129/168)", () => {
  describe("splitReportBody — o corpo único nas 3 tabelas (DEC-168)", () => {
    it("as três seções canônicas são as do oficial, na ordem do oficial", () => {
      expect(REPORT_SECTIONS.map((s) => s.id)).toEqual(["descricao", "resultados", "comentarios"]);
      expect(REPORT_SECTIONS[0].officialLabel).toBe(
        "Descrição das Atividades Desenvolvidas pelo Estudante ( etapa/cronograma)",
      );
      expect(REPORT_SECTIONS[1].officialLabel).toBe(
        "Principais Resultados Alcançados ( publicações, patentes, participações, outros):",
      );
      expect(REPORT_SECTIONS[2].officialLabel).toBe(
        "Comentários Adicionais ( dificuldades/ observações/sugestões/ outros):",
      );
    });

    it("casa o rótulo oficial EXATO (com parênteses) e a chave curta", () => {
      const text = [
        "Descrição das Atividades Desenvolvidas pelo Estudante ( etapa/cronograma)",
        "Executamos as etapas 1 e 2.",
        "Principais Resultados",
        "Um artigo submetido.",
        "Comentários Adicionais",
        "Faltou equipamento.",
      ].join("\n");
      const body = splitReportBody(text);
      expect(body.descricao).toBe("Executamos as etapas 1 e 2.");
      expect(body.resultados).toBe("Um artigo submetido.");
      expect(body.comentarios).toBe("Faltou equipamento.");
    });

    it("sem cabeçalho nenhum, o texto inteiro vai na Descrição — o ramo degenerado honesto", () => {
      const body = splitReportBody("Escrevemos tudo de uma vez, sem divisões.");
      expect(body.descricao).toBe("Escrevemos tudo de uma vez, sem divisões.");
      expect(body.resultados).toBe("");
      expect(body.comentarios).toBe("");
    });

    it("preâmbulo antes do primeiro cabeçalho é prefixado na Descrição", () => {
      const body = splitReportBody(
        ["Resumo geral do projeto.", "Principais Resultados", "Artigo aceito."].join("\n"),
      );
      expect(body.descricao).toBe("Resumo geral do projeto.");
      expect(body.resultados).toBe("Artigo aceito.");
    });

    it("ordem dos cabeçalhos não muda a tabela de destino — o casamento é por chave", () => {
      const body = splitReportBody(
        ["Comentários Adicionais", "Sem dificuldades.", "Descrição das Atividades", "Fez tudo."].join("\n"),
      );
      expect(body.descricao).toBe("Fez tudo.");
      expect(body.resultados).toBe("");
      expect(body.comentarios).toBe("Sem dificuldades.");
    });

    it("cabeçalho duplicado concatena na MESMA tabela, em ordem de documento", () => {
      const body = splitReportBody(
        [
          "Descrição das Atividades",
          "Primeiro bloco.",
          "Principais Resultados",
          "Resultado A.",
          "Descrição das Atividades",
          "Segundo bloco.",
        ].join("\n"),
      );
      expect(body.descricao).toBe("Primeiro bloco.\n\nSegundo bloco.");
      expect(body.resultados).toBe("Resultado A.");
    });

    it("cabeçalho no meio de frase NÃO é cabeçalho — casamento é linha inteira", () => {
      const body = splitReportBody(
        ["Conforme a Descrição das Atividades, o aluno avançou.", "Principais Resultados", "Avanço."].join("\n"),
      );
      expect(body.descricao).toBe("Conforme a Descrição das Atividades, o aluno avançou.");
      expect(body.resultados).toBe("Avanço.");
    });

    it("rótulo com texto depois dele na mesma linha não é cabeçalho", () => {
      const body = splitReportBody("Descrição das Atividades: o aluno fez tudo em uma linha.");
      expect(body.descricao).toBe("Descrição das Atividades: o aluno fez tudo em uma linha.");
    });

    it("caixa alta, acento trocado, dois-pontos e espaços duplos são a mesma linha", () => {
      const body = splitReportBody(
        ["PRINCIPAIS  RESULTADOS:", "Artigo.", "comentarios adicionais", "Nada."].join("\n"),
      );
      expect(body.resultados).toBe("Artigo.");
      expect(body.comentarios).toBe("Nada.");
    });

    it("decoração de markdown no começo da linha não esconde o cabeçalho", () => {
      const body = splitReportBody(["## Principais Resultados", "Artigo.", "- Comentários Adicionais", "Nada."].join("\n"));
      expect(body.resultados).toBe("Artigo.");
      expect(body.comentarios).toBe("Nada.");
    });

    it("cabeçalho reescrito à mão não casa — o texto continua na seção atual (perde direcionamento, não conteúdo)", () => {
      const body = splitReportBody(["Descrição das Atividades", "Fez tudo.", "Resultados", "Perdido na descricao."].join("\n"));
      expect(body.descricao).toBe("Fez tudo.\nResultados\nPerdido na descricao.");
      expect(body.resultados).toBe("");
    });

    it("seção com cabeçalho e sem corpo fica vazia — nenhuma linha fantasma", () => {
      const body = splitReportBody("Principais Resultados");
      expect(body.resultados).toBe("");
      expect(body.descricao).toBe("");
    });

    it("texto vazio devolve três vazios", () => {
      expect(splitReportBody("")).toEqual({ descricao: "", resultados: "", comentarios: "" });
    });

    it("o Final preserva títulos científicos e distribui o manuscrito nas três áreas do DOCX oficial", () => {
      const body = splitReportBody([
        "Título (português)", "Pesquisa", "Título (English)", "Research",
        "Resumo", "Resumo factual.", "Abstract", "Factual abstract.",
        "1 Introdução", "Contexto.", "2 Referencial teórico", "Literatura fornecida.",
        "3 Metodologia", "Método registrado.", "4 Resultados e discussão", "Resultado medido.",
        "5 Conclusão", "Conclusão limitada.", "Referências", "[COMPLEMENTAÇÃO DA AUTORIA: bibliografia]",
      ].join("\n"), "final");
      expect(body.descricao).toContain("Título (português)");
      expect(body.descricao).toContain("3 Metodologia");
      expect(body.resultados).toContain("4 Resultados e discussão");
      expect(body.comentarios).toContain("5 Conclusão");
      expect(body.comentarios).toContain("Referências");
    });
  });

  describe("linha de checkbox — o literal medido do oficial (DEC-167)", () => {
    it("parcial marca a segunda caixa, com os espaços do oficial preservados", () => {
      expect(technicalReportCheckboxLine("parcial")).toBe(
        "( ) Relatório Final ( X ) Relatório Parcial",
      );
    });

    it("tecnico-final e final marcam a primeira caixa", () => {
      expect(technicalReportCheckboxLine("tecnico-final")).toBe(
        "( X ) Relatório Final (  ) Relatório Parcial",
      );
      expect(technicalReportCheckboxLine("final")).toBe(
        "( X ) Relatório Final (  ) Relatório Parcial",
      );
    });
  });

  describe("período do documento — data civil cortada na geração (DEC-132)", () => {
    const project = { createdAt: "2026-02-01", startDate: "2026-03-01", endDate: "2026-12-31" };

    it("fim é hoje quando o projeto ainda não terminou", () => {
      expect(technicalReportDocumentPeriod(project, "2026-10-14")).toEqual({
        periodoInicio: "2026-03-01",
        periodoFim: "2026-10-14",
      });
    });

    it("fim é a endDate quando ela já passou — relatório atrasado não estende o período", () => {
      expect(technicalReportDocumentPeriod(project, "2027-01-20")).toEqual({
        periodoInicio: "2026-03-01",
        periodoFim: "2026-12-31",
      });
    });

    it("sem startDate o início é o createdAt do projeto", () => {
      expect(
        technicalReportDocumentPeriod(
          { createdAt: "2026-02-01", startDate: null, endDate: null },
          "2026-10-14",
        ),
      ).toEqual({ periodoInicio: "2026-02-01", periodoFim: "2026-10-14" });
    });

    it("createdAt LEGADO é instantâneo ISO completo — vira dia civil do laboratório (achado medido 2026-10-14)", () => {
      // O projeto 1 da instância real tem createdAt "2026-09-22T15:34:08.043Z" (escrito pelo
      // código antigo antes do DEC-132). Solto no período, o adaptador de sessões montava
      // `new Date("2026-09-22T15:34:08.043ZT00:00:00.000Z")` → Invalid Date → Prisma explodia
      // e a rota do rascunho respondia 502 "Servidor de IA indisponível" sem chamar a IA.
      expect(
        technicalReportDocumentPeriod(
          { createdAt: "2026-09-22T15:34:08.043Z", startDate: null, endDate: null },
          "2026-10-14",
        ),
      ).toEqual({ periodoInicio: "2026-09-22", periodoFim: "2026-10-14" });
    });

    it("endDate legada em instantâneo ISO também resolve para dia civil; ilegível conta como ausente", () => {
      expect(
        technicalReportDocumentPeriod(
          { createdAt: "2026-02-01", startDate: null, endDate: "2026-09-30T23:59:59.999Z" },
          "2026-10-14",
        ),
      ).toEqual({ periodoInicio: "2026-02-01", periodoFim: "2026-09-30" });

      // Valor sem leitura não vira Invalid Date na mão do adaptador: o período colapsa em hoje.
      expect(
        technicalReportDocumentPeriod(
          { createdAt: "não-é-data", startDate: null, endDate: "31/12/2026" },
          "2026-10-14",
        ),
      ).toEqual({ periodoInicio: "2026-10-14", periodoFim: "2026-10-14" });
    });

    it("formatDocumentCivilDay é substring, não new Date (DEC-132); valor inválido vazio vazio", () => {
      expect(formatDocumentCivilDay("2026-10-14")).toBe("14/10/2026");
      expect(formatDocumentCivilDay(null)).toBe("");
      expect(formatDocumentCivilDay("14/10/2026")).toBe("");
    });
  });

  describe("chave do arquivo no bucket (DEC-101/133)", () => {
    it("a chave é derivada do par e do membro — regenerar sobrescreve", () => {
      expect(technicalReportFileKey(3, 5, 9)).toBe("projects/3/technical-reports/5/9.docx");
    });

    it("o nome de exibição é tipo + slug ASCII do membro", () => {
      expect(technicalReportFileName("parcial", "Bento Lima")).toBe("relatorio-parcial-bento-lima.docx");
      expect(technicalReportFileName("tecnico-final", "Áçaõ Ünïcode")).toBe("relatorio-tecnico-final-acao-unicode.docx");
      expect(technicalReportFileName("final", "!!!")).toBe("relatorio-final.docx");
    });
  });

  describe("buildTechnicalReportCommands — os 17 comandos da cópia marcada", () => {
    const base = {
      project: {
        name: "IA no campo",
        createdAt: "2026-02-01",
        startDate: "2026-03-01",
        endDate: "2026-12-31",
        proppiNumber: "PROPPI-2026-017",
        leaderName: "Profa. Ana Souza",
      },
      member: {
        name: "Bento Lima",
        course: "Sistemas de Informação",
        scholarshipType: "PIBIC_JR",
        fundingAgency: "CNPQ",
        fundingAgencyOther: null,
      },
      type: "parcial" as const,
      content: ["Descrição das Atividades", "Etapa 1.", "Principais Resultados", "Artigo.", "Comentários Adicionais", "Nada."].join("\n"),
      now: "2026-10-14",
    };

    it("são exatamente os 17 comandos da cópia marcada", () => {
      const commands = buildTechnicalReportCommands(base);
      expect(Object.keys(commands).sort()).toEqual(
        [
          "coordenador",
          "data_relatorio",
          "estudante_curso",
          "estudante_nome",
          "instituicao_fomento",
          "linha_tipo",
          "modalidade",
          "orientador",
          "periodo_fim",
          "periodo_inicio",
          "proppi",
          "projeto_inicio",
          "projeto_termino",
          "tabela_comentarios",
          "tabela_descricao",
          "tabela_resultados",
          "titulo",
        ].sort(),
      );
    });

    it("os campos do projeto e do membro saem formatados em data civil", () => {
      const commands = buildTechnicalReportCommands(base);
      expect(commands.titulo).toBe("IA no campo");
      expect(commands.proppi).toBe("PROPPI-2026-017");
      expect(commands.coordenador).toBe("Profa. Ana Souza");
      expect(commands.orientador).toBe("Profa. Ana Souza");
      expect(commands.periodo_inicio).toBe("01/03/2026");
      expect(commands.periodo_fim).toBe("14/10/2026");
      expect(commands.projeto_inicio).toBe("01/03/2026");
      expect(commands.projeto_termino).toBe("31/12/2026");
      expect(commands.data_relatorio).toBe("14/10/2026");
      expect(commands.estudante_nome).toBe("Bento Lima");
      expect(commands.estudante_curso).toBe("Sistemas de Informação");
      expect(commands.modalidade).toBe("PIBIC Jr");
      expect(commands.instituicao_fomento).toBe("CNPq");
      expect(commands.linha_tipo).toBe("( ) Relatório Final ( X ) Relatório Parcial");
      expect(commands.tabela_descricao).toBe("Etapa 1.");
      expect(commands.tabela_resultados).toBe("Artigo.");
      expect(commands.tabela_comentarios).toBe("Nada.");
    });

    it("ausências viram vazio vazio — o oficial tem linha em branco, o sistema não inventa", () => {
      const commands = buildTechnicalReportCommands({
        ...base,
        project: { ...base.project, proppiNumber: null, leaderName: null, startDate: null, endDate: null },
        member: { ...base.member, scholarshipType: null, fundingAgency: null, fundingAgencyOther: null },
      });
      expect(commands.proppi).toBe("");
      expect(commands.coordenador).toBe("");
      expect(commands.orientador).toBe("");
      expect(commands.modalidade).toBe("");
      expect(commands.instituicao_fomento).toBe("");
      expect(commands.projeto_inicio).toBe("01/02/2026"); // fallback createdAt
      expect(commands.projeto_termino).toBe("");
    });

    it("token de pessoa fora da lista fechada vira linha em branco — o sistema não repassa valor desconhecido", () => {
      const commands = buildTechnicalReportCommands({
        ...base,
        member: { ...base.member, scholarshipType: "PIBIC_EXTERNO", fundingAgency: "FAPEMIG" },
      });
      expect(commands.modalidade).toBe("");
      expect(commands.instituicao_fomento).toBe("Fapemig");
    });

    it("fomento OUTRA usa o texto livre quando existe; sem texto, o rótulo 'Outra'", () => {
      const withOther = buildTechnicalReportCommands({
        ...base,
        member: { ...base.member, fundingAgency: "OUTRA", fundingAgencyOther: "CAPES" },
      });
      expect(withOther.instituicao_fomento).toBe("CAPES");
      const withoutOther = buildTechnicalReportCommands({
        ...base,
        member: { ...base.member, fundingAgency: "OUTRA", fundingAgencyOther: null },
      });
      expect(withoutOther.instituicao_fomento).toBe("Outra");
    });
  });
});
