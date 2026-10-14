import { describe, expect, it } from "vitest";

import {
  FUNDING_AGENCIES,
  FUNDING_AGENCY_LABELS,
  SCHOLARSHIP_TYPES,
  USER_LEVELS,
  canActorReadUserCpf,
  maskCpf,
  normalizeCpf,
  normalizeFundingAgency,
  normalizePersonEnum,
  normalizePersonText,
  normalizeScholarshipType,
  normalizeUserLevel,
  systemActor,
  userActor,
} from "@/backend/domain";

/**
 * V5-4a (DEC-138/DEC-140) — as regras puras dos dados de pessoa.
 *
 * O que este arquivo segura: as listas fechadas derivadas dos campos medidos no AcroForm, a
 * recusa de valor desconhecido (modalidade errada muda o checkbox do atestado), o CPF com
 * dígitos verificadores conferidos e a leitura restrita do CPF.
 */

describe("listas fechadas derivadas do AcroForm medido", () => {
  it("nível tem os três valores dos checkboxes nivel_*", () => {
    expect(USER_LEVELS).toEqual(["MEDIO", "GRADUACAO", "POS_GRADUACAO"]);
  });

  it("modalidade cobre os dez checkboxes is_* do formulário oficial", () => {
    expect(SCHOLARSHIP_TYPES).toEqual([
      "PIBIC",
      "PIBIC_JR",
      "PIBIC_AF",
      "PIBITI",
      "PIBITI_JR",
      "BTP",
      "MESTRADO",
      "DOUTORADO",
      "POS_DOC",
      "VOLUNTARIO",
    ]);
  });

  it("fomento tem as três agências do formulário, e OUTRA abre o texto livre", () => {
    expect(FUNDING_AGENCIES).toEqual(["CNPQ", "FAPEMIG", "OUTRA"]);
    expect(FUNDING_AGENCY_LABELS.CNPQ).toBe("CNPq");
  });
});

describe("normalizePersonEnum", () => {
  it("aceita a grafia de tela e devolve o token", () => {
    expect(normalizePersonEnum("PIBIC Jr", SCHOLARSHIP_TYPES, "Modalidade de IC inválida")).toBe(
      "PIBIC_JR",
    );
    expect(normalizePersonEnum("pos-doc", SCHOLARSHIP_TYPES, "Modalidade de IC inválida")).toBe(
      "POS_DOC",
    );
    expect(normalizePersonEnum("  graduacao  ", USER_LEVELS, "Nível inválido")).toBe("GRADUACAO");
  });

  it("recusa valor fora da lista nomeando o problema", () => {
    expect(() => normalizePersonEnum("ICV", SCHOLARSHIP_TYPES, "Modalidade de IC inválida")).toThrow(
      "Modalidade de IC inválida",
    );
    expect(() => normalizePersonEnum("bolsista", USER_LEVELS, "Nível inválido")).toThrow(
      "Nível inválido",
    );
  });

  it("ausente, null e vazio viram null — sem dado é coluna nula", () => {
    expect(normalizePersonEnum(undefined, SCHOLARSHIP_TYPES, "Modalidade de IC inválida")).toBeNull();
    expect(normalizePersonEnum(null, SCHOLARSHIP_TYPES, "Modalidade de IC inválida")).toBeNull();
    expect(normalizePersonEnum("   ", SCHOLARSHIP_TYPES, "Modalidade de IC inválida")).toBeNull();
  });
});

describe("regras de campo de pessoa", () => {
  it("modalidade, fomento e nível têm mensagem própria congelada", () => {
    expect(normalizeScholarshipType("PIBITI-Jr")).toBe("PIBITI_JR");
    expect(normalizeFundingAgency("cnpq")).toBe("CNPQ");
    // O rótulo de tela é aceito porque vem da mesma mesa que o token (USER_LEVEL_LABELS).
    expect(normalizeUserLevel("Médio")).toBe("MEDIO");
    expect(normalizeUserLevel("Pós-graduação")).toBe("POS_GRADUACAO");
    expect(() => normalizeUserLevel("medio1")).toThrow("Nível inválido");
    expect(() => normalizeFundingAgency("CAPES")).toThrow("Instituição de fomento inválida");
  });

  it("texto livre é aparado, e vazio vira null", () => {
    expect(normalizePersonText("course", "  Sistemas de Informação  ")).toBe("Sistemas de Informação");
    expect(normalizePersonText("course", "")).toBeNull();
    expect(normalizePersonText("registrationNumber", null)).toBeNull();
  });

  it("texto acima do teto é recusado nomeando o campo e o teto", () => {
    expect(() => normalizePersonText("registrationNumber", "M".repeat(41))).toThrow(
      "Matrícula deve ter no máximo 40 caracteres",
    );
    expect(() => normalizePersonText("fundingAgencyOther", "F".repeat(81))).toThrow(
      "Instituição de fomento deve ter no máximo 80 caracteres",
    );
  });
});

describe("CPF", () => {
  it("confere os dois dígitos verificadores e guarda só os dígitos", () => {
    expect(normalizeCpf("529.982.247-25")).toBe("52998224725");
    expect(normalizeCpf("52998224725")).toBe("52998224725");
    expect(normalizeCpf("  529 982 247 - 25  ")).toBe("52998224725");
  });

  it("recusa comprimento errado, dígito verificador errado e o caso degenerado", () => {
    expect(() => normalizeCpf("529.982.247-2")).toThrow("CPF inválido");
    expect(() => normalizeCpf("529.982.247-26")).toThrow("CPF inválido");
    expect(() => normalizeCpf("11111111111")).toThrow("CPF inválido");
    expect(() => normalizeCpf("abc")).toThrow("CPF inválido");
  });

  it("ausente e vazio viram null", () => {
    expect(normalizeCpf(null)).toBeNull();
    expect(normalizeCpf(undefined)).toBeNull();
    expect(normalizeCpf("")).toBeNull();
  });

  it("mascara para exibição e devolve null quando não há CPF", () => {
    expect(maskCpf("52998224725")).toBe("529.982.247-25");
    expect(maskCpf(null)).toBeNull();
    expect(maskCpf(undefined)).toBeNull();
    expect(maskCpf("123")).toBeNull();
  });
});

describe("quem lê o CPF (DEC-138)", () => {
  it("a própria pessoa lê", () => {
    expect(canActorReadUserCpf(userActor(7, ["VOLUNTARIO"]), 7)).toBe(true);
  });

  it("quem gerencia contas lê o CPF de qualquer pessoa", () => {
    expect(canActorReadUserCpf(userActor(1, ["COORDENADOR"]), 7)).toBe(true);
    expect(canActorReadUserCpf(userActor(2, ["GERENTE"]), 7)).toBe(true);
  });

  it("papéis de gestão de projeto não leem CPF de terceiro", () => {
    expect(canActorReadUserCpf(userActor(3, ["GERENTE_PROJETO"]), 7)).toBe(false);
    expect(canActorReadUserCpf(userActor(4, ["VOLUNTARIO"]), 7)).toBe(false);
    expect(canActorReadUserCpf(userActor(5, []), 7)).toBe(false);
  });

  it("rotina sem pessoa lê, porque o documento (V5-10) precisa do campo", () => {
    expect(canActorReadUserCpf(systemActor("NIGHTLY_SWEEP"), 7)).toBe(true);
  });
});
