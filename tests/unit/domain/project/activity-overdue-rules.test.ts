/**
 * V5-8 (DEC-64) — regras puras do atraso de atividade, congeladas ANTES do código
 * (PLAN §7). O que fica preso aqui:
 *   1. Atraso é dia civil DEPOIS do prazo: o prazo é `activityPeriod().periodoFim`
 *      (derivado, nunca gravado — DEC-132). O próprio dia do prazo ainda é dentro do
 *      período; só o dia seguinte é atraso.
 *   2. A frase da notificação é literal congelada, com a data como `dd/mm/aaaa` por
 *      substring — nunca `new Date` em texto (lição DEC-132).
 *   3. Destinatários: líder primeiro, depois coordenadores/gerentes globais,
 *      deduplicado — o líder que também é coordenador recebe UMA notificação.
 *   4. O tipo e o título da notificação são vocabulário do domínio, não da UI.
 */
import { describe, expect, it } from "vitest";

import {
  ACTIVITY_OVERDUE_NOTIFICATION_TYPE,
  ACTIVITY_OVERDUE_TITLE,
  activityOverdueMessage,
  isActivityOverdue,
  overdueNotificationRecipients,
} from "@/backend/domain";

describe("atraso de atividade (V5-8, DEC-64)", () => {
  describe("isActivityOverdue", () => {
    it("vence no dia seguinte ao último dia do último mês marcado", () => {
      // out→out/2026: prazo 31/10/2026.
      expect(isActivityOverdue({ firstMonth: "2026-10", lastMonth: "2026-10" }, "2026-11-01")).toBe(true);
    });

    it("o próprio dia do prazo ainda é dentro do período", () => {
      expect(isActivityOverdue({ firstMonth: "2026-10", lastMonth: "2026-10" }, "2026-10-31")).toBe(false);
    });

    it("antes do prazo não é atraso", () => {
      expect(isActivityOverdue({ firstMonth: "2026-10", lastMonth: "2026-10" }, "2026-10-30")).toBe(false);
    });

    it("o prazo é o último dia do mês, inclusive fevereiro", () => {
      // nov/2026→fev/2027: prazo 28/02/2027.
      const activity = { firstMonth: "2026-11", lastMonth: "2027-02" };
      expect(isActivityOverdue(activity, "2027-02-28")).toBe(false);
      expect(isActivityOverdue(activity, "2027-03-01")).toBe(true);
    });
  });

  describe("vocabulário e frase da notificação", () => {
    it("tipo e título são do domínio", () => {
      expect(ACTIVITY_OVERDUE_NOTIFICATION_TYPE).toBe("ACTIVITY_OVERDUE");
      expect(ACTIVITY_OVERDUE_TITLE).toBe("Atividade atrasada");
    });

    it("a mensagem nomeia atividade, projeto e prazo em dd/mm/aaaa", () => {
      expect(
        activityOverdueMessage("Pesquisa em IA", "Coleta de dados", "2026-10-31"),
      ).toBe(
        'A atividade "Coleta de dados" do projeto "Pesquisa em IA" venceu em 31/10/2026 e ainda não foi concluída.',
      );
    });
  });

  describe("overdueNotificationRecipients", () => {
    it("líder primeiro, gestores globais depois, sem duplicata", () => {
      expect(overdueNotificationRecipients(5, [2, 5, 9])).toEqual([5, 2, 9]);
    });

    it("sem líder: só os gestores globais", () => {
      expect(overdueNotificationRecipients(null, [2, 9])).toEqual([2, 9]);
    });

    it("valores não-inteiros e não-positivos saem da lista", () => {
      expect(overdueNotificationRecipients(0, [2, -3, 9])).toEqual([2, 9]);
    });

    it("sem líder e sem gestores: ninguém", () => {
      expect(overdueNotificationRecipients(null, [])).toEqual([]);
    });
  });
});
