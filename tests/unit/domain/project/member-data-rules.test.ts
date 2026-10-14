/**
 * V5-4b (DEC-69/140/149) — as regras puras do vínculo, congeladas antes da wiring.
 *
 * O que esta guarda segura:
 *   1. `categoria` é lista fechada derivada do AcroForm medido (`is_bolsista` / `is_voluntario`),
 *      aceita a grafia de tela com acento e recusa o que não está nela — inclusive "MEMBRO", que
 *      o rascunho do plano citava e o dono não escolheu (DEC-149).
 *   2. `situacao` nunca é nula: ausente/vazio é ATIVO, e valor escrito errado é recusado (o
 *      sentido é oposto, tolerar seria inverter o estado).
 *   3. `cargaHoraria` é a carga contratada, não `users.weekHours` (DEC-140): aceita fracionário,
 *      recusa zero, negativo, não-número e o absurdo acima de uma semana.
 *   4. `dataEntrada` é data civil (DEC-132): o ISO que o `<input type="date">` devolve vira o dia
 *      do laboratório, e texto sem leitura é recusado nomeando o campo em vez de virar null.
 *   5. Chave ausente no corpo não apaga dado.
 */
import { describe, expect, it } from "vitest";

import {
  ValidationError,
  DEFAULT_MEMBER_SITUATION,
  MEMBER_CARGO_MESSAGE,
  MEMBER_CATEGORY_MESSAGE,
  MEMBER_CATEGORIES,
  MEMBER_ENTRY_DATE_MESSAGE,
  MEMBER_LATTES_MESSAGE,
  MEMBER_SITUATION_MESSAGE,
  MEMBER_SITUATIONS,
  applyMemberProfileFields,
  emptyMemberProfile,
  normalizeMemberCargaHoraria,
  normalizeMemberCategory,
  normalizeMemberEntryDate,
  normalizeMemberLattes,
  normalizeMemberSituation,
} from "@/backend/domain";

describe("categoria do vínculo — lista fechada derivada do AcroForm (DEC-149)", () => {
  it("a lista é exatamente a dos dois checkboxes medidos", () => {
    expect(MEMBER_CATEGORIES).toEqual(["BOLSISTA", "VOLUNTARIO"]);
  });

  it("a grafia de tela vira token, com ou sem acento", () => {
    expect(normalizeMemberCategory("Bolsista")).toBe("BOLSISTA");
    expect(normalizeMemberCategory("voluntário")).toBe("VOLUNTARIO");
    expect(normalizeMemberCategory("Voluntario")).toBe("VOLUNTARIO");
    expect(normalizeMemberCategory("bolsista")).toBe("BOLSISTA");
  });

  it("ausente, null e vazio são `null`: categoria não declarada não é categoria inventada", () => {
    expect(normalizeMemberCategory(undefined)).toBeNull();
    expect(normalizeMemberCategory(null)).toBeNull();
    expect(normalizeMemberCategory("   ")).toBeNull();
  });

  it("recusa valor fora da lista nomeando o campo", () => {
    expect(() => normalizeMemberCategory("MEMBRO")).toThrow(MEMBER_CATEGORY_MESSAGE);
    expect(() => normalizeMemberCategory("BOLSA")).toThrow(ValidationError);
  });
});

describe("situação do vínculo — nunca nula (DEC-149)", () => {
  it("a lista é ATIVO/INATIVO e o default é ATIVO", () => {
    expect(MEMBER_SITUATIONS).toEqual(["ATIVO", "INATIVO"]);
    expect(DEFAULT_MEMBER_SITUATION).toBe("ATIVO");
  });

  it("ausente, null e vazio viram ATIVO", () => {
    expect(normalizeMemberSituation(undefined)).toBe("ATIVO");
    expect(normalizeMemberSituation(null)).toBe("ATIVO");
    expect(normalizeMemberSituation("")).toBe("ATIVO");
  });

  it("a grafia de tela vira token", () => {
    expect(normalizeMemberSituation("Inativo")).toBe("INATIVO");
    expect(normalizeMemberSituation("inativo")).toBe("INATIVO");
    expect(normalizeMemberSituation("Ativo")).toBe("ATIVO");
  });

  it("valor errado é recusado: inverter o estado por tolerância seria pior que um 400", () => {
    expect(() => normalizeMemberSituation("inactiva")).toThrow(MEMBER_SITUATION_MESSAGE);
    expect(() => normalizeMemberSituation("afastado")).toThrow(MEMBER_SITUATION_MESSAGE);
  });
});

describe("carga horária contratada — dado do vínculo, não users.weekHours (DEC-140)", () => {
  it("aceita inteiro, string de formulário e fracionário", () => {
    expect(normalizeMemberCargaHoraria(8)).toBe(8);
    expect(normalizeMemberCargaHoraria("20")).toBe(20);
    expect(normalizeMemberCargaHoraria(7.5)).toBe(7.5);
  });

  it("arredonda a centésimos, a precisão que o documento imprime", () => {
    expect(normalizeMemberCargaHoraria(7.444)).toBe(7.44);
    expect(normalizeMemberCargaHoraria(19.999)).toBe(20);
  });

  it("null e string vazia são `null`: o atestado então não assinala carga", () => {
    expect(normalizeMemberCargaHoraria(null)).toBeNull();
    expect(normalizeMemberCargaHoraria(undefined)).toBeNull();
    expect(normalizeMemberCargaHoraria("  ")).toBeNull();
  });

  it("recusa zero, negativo, não-número e o absurdo acima de uma semana", () => {
    for (const value of [0, -5, "oito", Number.NaN, 169, 1000]) {
      expect(() => normalizeMemberCargaHoraria(value)).toThrow(MEMBER_CARGO_MESSAGE);
    }
  });

  it("o teto é uma semana (168 h) e é aceito", () => {
    expect(normalizeMemberCargaHoraria(168)).toBe(168);
  });
});

describe("Lattes — texto com teto, como os campos de pessoa (DEC-147)", () => {
  it("apara e devolve o texto", () => {
    expect(normalizeMemberLattes("  lattes.cnpq.br/1234567890123456  ")).toBe(
      "lattes.cnpq.br/1234567890123456",
    );
  });

  it("ausente e vazio são null", () => {
    expect(normalizeMemberLattes(null)).toBeNull();
    expect(normalizeMemberLattes("   ")).toBeNull();
  });

  it("acima do teto é recusado nomeando o campo", () => {
    expect(() => normalizeMemberLattes("x".repeat(121))).toThrow(MEMBER_LATTES_MESSAGE);
  });
});

describe("data de entrada — data civil (DEC-132)", () => {
  it("YYYY-MM-DD passa como está", () => {
    expect(normalizeMemberEntryDate("2026-02-01")).toBe("2026-02-01");
  });

  it("o ISO que o <input type=\"date\"> devolve vira o dia do laboratório", () => {
    expect(normalizeMemberEntryDate("2026-10-14T02:00:00.000Z")).toBe("2026-10-13");
  });

  it("dia inexistente e texto sem leitura são recusados nomeando o campo", () => {
    expect(() => normalizeMemberEntryDate("2026-02-30")).toThrow(MEMBER_ENTRY_DATE_MESSAGE);
    expect(() => normalizeMemberEntryDate("01/02/2026")).toThrow(MEMBER_ENTRY_DATE_MESSAGE);
  });

  it("ausente e vazio são null", () => {
    expect(normalizeMemberEntryDate(null)).toBeNull();
    expect(normalizeMemberEntryDate("")).toBeNull();
  });
});

describe("applyMemberProfileFields — só o que veio no corpo é escrito", () => {
  it("o vínculo novo tem situação e nenhum dado", () => {
    expect(emptyMemberProfile()).toEqual({
      lattes: null,
      cargaHoraria: null,
      categoria: null,
      situacao: "ATIVO",
      dataEntrada: null,
    });
  });

  it("normaliza os cinco campos na escrita", () => {
    const next = applyMemberProfileFields(emptyMemberProfile(), {
      lattes: "  1234567890123456  ",
      cargaHoraria: "20",
      categoria: "Bolsista",
      situacao: "Inativo",
      dataEntrada: "2026-02-01",
    });

    expect(next).toEqual({
      lattes: "1234567890123456",
      cargaHoraria: 20,
      categoria: "BOLSISTA",
      situacao: "INATIVO",
      dataEntrada: "2026-02-01",
    });
  });

  it("chave ausente não apaga o que já está gravado", () => {
    const filled = applyMemberProfileFields(emptyMemberProfile(), {
      categoria: "VOLUNTARIO",
      cargaHoraria: 8,
    });
    const untouched = applyMemberProfileFields(filled, { lattes: "novo" });

    expect(untouched.categoria).toBe("VOLUNTARIO");
    expect(untouched.cargaHoraria).toBe(8);
    expect(untouched.lattes).toBe("novo");
  });

  it("string vazia é limpar: existe caminho para tirar uma carga declarada", () => {
    const filled = applyMemberProfileFields(emptyMemberProfile(), { cargaHoraria: 8, categoria: "BOLSISTA" });
    const cleared = applyMemberProfileFields(filled, { cargaHoraria: "", categoria: "" });

    expect(cleared.cargaHoraria).toBeNull();
    expect(cleared.categoria).toBeNull();
    // limpar categoria não limpa situação: a coluna não tem estado sem valor.
    expect(cleared.situacao).toBe("ATIVO");
  });

  it("recusa o corpo inválido antes de o chamador gravar — e a garantia é do chamador, não daqui", () => {
    // Medido escrevendo este teste: a função muta campo a campo, então um corpo com a metade
    // errada deixa a outra metade mutada NO OBJETO. O que garante "nada é gravado a meias" é o
    // use case: ele recebe cópia do registro e só chama `update` depois desta função retornar.
    // Congelado aqui para ninguém reconstruir a garantia no lugar errado (prova em
    // `member-profile.test.ts`).
    const target = emptyMemberProfile();
    expect(() =>
      applyMemberProfileFields(target, { cargaHoraria: 8, categoria: "MEMBRO" }),
    ).toThrow(MEMBER_CATEGORY_MESSAGE);
    expect(target.categoria).toBeNull();
  });
});
