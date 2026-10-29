/**
 * V5-9 (DEC-70/139/167) — regras puras do relatório técnico, congeladas ANTES do código
 * (PLAN §7). O que fica preso aqui:
 *   1. O par é projeto × tipo, e o tipo é lista fechada de três valores (DEC-70).
 *   2. Gate de escrita (DEC-139 "gestão/líder"): líder do projeto OU a ACL medida do
 *      projeto (`canActorManageProjectDecision` — membership vence; sem membership, o
 *      global MANAGE_USERS). O líder entra explícito: ele pode ser líder sem membership
 *      de gestor, e o global sem membership que gerencia a grade também edita relatório.
 *   3. A linha de checkbox do DOCX é binária (medido no oficial: "( ) Relatório Final
 *      (  ) Relatório Parcial"): `parcial` marca Parcial; `tecnico-final` e `final`
 *      marcam Final — o nome carrega "final" e o oficial não tem terceira caixa.
 */
import { describe, expect, it } from "vitest";

import {
  TECHNICAL_REPORT_TYPES,
  canActorManageTechnicalReportDecision,
  isTechnicalReportType,
  technicalReportCheckbox,
} from "@/backend/domain";

describe("relatório técnico — regras puras (V5-9, DEC-70/139)", () => {
  describe("vocabulário de tipo (DEC-70)", () => {
    it("são exatamente os três tipos do dono", () => {
      expect(TECHNICAL_REPORT_TYPES).toEqual(["parcial", "tecnico-final", "final"]);
    });

    it("fora da lista não é tipo", () => {
      expect(isTechnicalReportType("parcial")).toBe(true);
      expect(isTechnicalReportType("mensal")).toBe(false);
      expect(isTechnicalReportType("")).toBe(false);
    });
  });

  describe("gate de escrita: gestão OU líder (DEC-139)", () => {
    it("o líder edita mesmo sem membership", () => {
      expect(canActorManageTechnicalReportDecision(7, [], 7, null)).toBe(true);
    });

    it("o líder edita mesmo com membership de voluntário", () => {
      expect(canActorManageTechnicalReportDecision(7, [], 7, ["VOLUNTARIO"])).toBe(true);
    });

    it("membership de gestor edita", () => {
      expect(canActorManageTechnicalReportDecision(8, [], 7, ["GERENTE_PROJETO"])).toBe(true);
    });

    it("membership de voluntário não edita — o quirk da ACL (membership vence)", () => {
      // COORDENADOR global com membership [VOLUNTARIO] não gerencia (quirk congelado).
      expect(
        canActorManageTechnicalReportDecision(8, ["COORDENADOR"], 7, ["VOLUNTARIO"]),
      ).toBe(false);
    });

    it("sem membership, o global MANAGE_USERS edita", () => {
      expect(canActorManageTechnicalReportDecision(8, ["COORDENADOR"], 7, null)).toBe(true);
      expect(canActorManageTechnicalReportDecision(8, ["GERENTE"], 7, null)).toBe(true);
      // ADMIN não tem MANAGE_USERS (matriz congelada em permissions.ts) — o fallback
      // global da ACL é COORDENADOR/GERENTE, e o ADMIN global sem membership não gerencia
      // o projeto (mesma decisão medida que governa a grade do cronograma).
      expect(canActorManageTechnicalReportDecision(8, ["ADMIN"], 7, null)).toBe(false);
    });

    it("outsider sem papel e sem membership não edita", () => {
      expect(canActorManageTechnicalReportDecision(8, ["PESQUISADOR"], 7, null)).toBe(false);
      expect(canActorManageTechnicalReportDecision(8, [], 7, null)).toBe(false);
    });
  });

  describe("linha de checkbox do DOCX (DEC-167, medida no oficial)", () => {
    it("parcial marca a caixa Parcial", () => {
      expect(technicalReportCheckbox("parcial")).toBe("parcial");
    });

    it("tecnico-final e final marcam a caixa Final — o oficial não tem terceira caixa", () => {
      expect(technicalReportCheckbox("tecnico-final")).toBe("final");
      expect(technicalReportCheckbox("final")).toBe("final");
    });
  });
});
