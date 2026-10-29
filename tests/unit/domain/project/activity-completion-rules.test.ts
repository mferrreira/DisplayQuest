import { describe, expect, it } from "vitest";
import {
  ACTIVITY_COMPLETION_REQUEST_TITLE,
  ACTIVITY_NO_PROOF_MESSAGE,
  activityCompletionRequestMessage,
  activityOpenTasksMessage,
  activityRequestConflictMessage,
  canActorRequestActivityCompletionDecision,
  completionRequestRecipients,
  isActivityRequestable,
  projectActivityFilePrefix,
} from "@/backend/domain";

/**
 * V5-7a (DEC-76/99/162): as regras puras do fluxo de concluir atividade, congeladas antes do
 * código que as consome (PLAN §7). O gate de pedir é o par literal da DEC-76 — líder OU
 * membership de gestor — e papel global sem membership NÃO entra na conta: o global é o lado
 * que aprova (DEC-77), não o que pede.
 */
describe("regras de conclusão de atividade (V5-7a)", () => {
  describe("gate de solicitar (DEC-76)", () => {
    it("o líder do projeto pede", () => {
      expect(canActorRequestActivityCompletionDecision(7, 7, null)).toBe(true);
    });

    it("membership com papel de gestor pede, inclusive GERENTE_PROJETO", () => {
      expect(canActorRequestActivityCompletionDecision(7, 3, ["GERENTE_PROJETO"])).toBe(true);
      expect(canActorRequestActivityCompletionDecision(7, 3, ["COORDENADOR"])).toBe(true);
      expect(canActorRequestActivityCompletionDecision(7, 3, ["GERENTE"])).toBe(true);
    });

    it("membership sem papel de gestor não pede — nem quem é o líder por fora", () => {
      expect(canActorRequestActivityCompletionDecision(7, 3, ["VOLUNTARIO"])).toBe(false);
      expect(canActorRequestActivityCompletionDecision(7, 3, [])).toBe(false);
    });

    it("sem membership e sem ser líder não pede (papel global não entra: quem aprova é o global, DEC-77)", () => {
      expect(canActorRequestActivityCompletionDecision(7, null, null)).toBe(false);
      expect(canActorRequestActivityCompletionDecision(7, 3, null)).toBe(false);
    });
  });

  describe("transição de solicitar (DEC-76/162)", () => {
    it("só OPEN aceita a solicitação", () => {
      expect(isActivityRequestable("OPEN")).toBe(true);
      expect(isActivityRequestable("COMPLETION_REQUESTED")).toBe(false);
      expect(isActivityRequestable("DONE")).toBe(false);
    });

    it("a frase do 409 é por status", () => {
      expect(activityRequestConflictMessage("COMPLETION_REQUESTED")).toBe(
        "A conclusão desta atividade já foi solicitada",
      );
      expect(activityRequestConflictMessage("DONE")).toBe("Esta atividade já foi concluída");
    });
  });

  describe("trava DEC-99: tarefa pendente na atividade", () => {
    it("diz quantas tarefas faltam, no singular quando é uma", () => {
      expect(activityOpenTasksMessage(1)).toBe(
        "Conclua a tarefa restante da atividade antes de solicitar a conclusão",
      );
      expect(activityOpenTasksMessage(2)).toBe(
        "Conclua as 2 tarefas da atividade antes de solicitar a conclusão",
      );
    });
  });

  describe("exigência de prova (DEC-162)", () => {
    it("a frase é congelada — rota, mock e tela dizem exatamente esta", () => {
      expect(ACTIVITY_NO_PROOF_MESSAGE).toBe(
        "Anexe pelo menos uma prova antes de solicitar a conclusão",
      );
    });
  });

  describe("prefixo da prova no bucket (DEC-157)", () => {
    it("a chave pertence à linha do cronograma, não ao projeto solto", () => {
      expect(projectActivityFilePrefix(9, 42)).toBe("projects/9/activities/42/files");
    });

    it("id sem forma recusa nomeando o lado, antes de montar chave", () => {
      expect(() => projectActivityFilePrefix(0, 42)).toThrow(/projeto inválido/);
      expect(() => projectActivityFilePrefix(9, 0)).toThrow(/atividade inválida/);
    });
  });

  describe("notificação da solicitação de conclusão (fix 4)", () => {
    it("a mensagem carrega atividade e projeto, na frase congelada", () => {
      expect(ACTIVITY_COMPLETION_REQUEST_TITLE).toBe("Conclusão de atividade solicitada");
      const msg = activityCompletionRequestMessage("Pesquisa em IA", "Coleta de dados");
      expect(msg).toContain("Coleta de dados");
      expect(msg).toContain("Pesquisa em IA");
    });

    it("audiência é a gestão global, deduplicada e filtrada por id positivo", () => {
      expect(completionRequestRecipients([1, 2, 2, 0, -3, 5])).toEqual([1, 2, 5]);
    });

    it("lista vazia não produz destinatário", () => {
      expect(completionRequestRecipients([])).toEqual([]);
    });
  });
});
