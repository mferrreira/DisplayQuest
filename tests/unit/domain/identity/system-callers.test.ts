// @vitest-environment node
/**
 * DEC-54 (D4, B6-2b) — os CHAMADORES DE SISTEMA do módulo de notificações.
 *
 * `PublishNotificationEventUseCase` passou a exigir `actor` e a checar MANAGE_NOTIFICATIONS. Ele
 * tem, além da rota HTTP, três famílias de chamadores que não são uma pessoa:
 *
 *   1. `NotificationsLabPublisher`    — issue do laboratório (raised / assigned)
 *   2. `NotificationsReportPublisher` — relatório enviado
 *   3. os 3 use cases de task-management: TASK_REVIEW_REQUEST / APPROVED / REJECTED
 *
 * Este arquivo existe porque a consequência de errar aqui é silenciosa e só de produção: um
 * desses chamadores que pare de declarar o ator de sistema leva 403 na face interna e o
 * laboratório deixa de notificar issue, o relatório deixa de notificar envio, a revisão de tarefa
 * deixa de avisar. Nenhum teste de rota pega isso, porque nenhuma rota os exercita — no teste G4
 * (`tasks-roundtrip.test.ts`) os eventos passam pelo módulo real e o ator errado apareceria como
 * notificação faltando, não como falha.
 *
 * Nenhum desses adapters tinha teste antes (medido: `grep` em `tests/` não achava
 * `NotificationsLabPublisher` nem `NotificationsReportPublisher`). Os payloads continuam cobertos
 * pelos goldens 8.1; o que não tinha cobertura era o ator.
 *
 * O `actor` é conferido pelo CONTEÚDO (`kind: "system"` + `reason`), não por `toBe` de identidade
 * de objeto: o motivo é o que torna o bypass auditável, e comparar a construção inteira fixaria um
 * detalhe de implementação em vez do contrato.
 */
import { describe, expect, it } from "vitest";

import { NotificationsLabPublisher } from "@/backend/modules/lab-operations/infrastructure/adapters/notifications-lab-publisher";
import type { LabEventPublishSink } from "@/backend/modules/lab-operations/infrastructure/adapters/notifications-lab-publisher";
import { NotificationsReportPublisher } from "@/backend/modules/reporting/infrastructure/publishers/notifications-report-publisher";
import type { ReportSubmittedEventSink } from "@/backend/modules/reporting/infrastructure/publishers/notifications-report-publisher";
import { ApproveTaskUseCase } from "@/backend/modules/task-management/application/use-cases/approve-task.use-case";
import { RejectTaskUseCase } from "@/backend/modules/task-management/application/use-cases/reject-task.use-case";
import { UpdateTaskUseCase } from "@/backend/modules/task-management/application/use-cases/update-task.use-case";
import type { TaskNotificationEvent } from "@/backend/modules/task-management/application/ports/task-notifications.port";

/** O contrato do bypass: sistema, e o motivo que o identifica na auditoria. */
function expectSystemActor(actor: unknown) {
  expect(actor).toMatchObject({ kind: "system", reason: "SYSTEM_EVENT" });
}

function recordingSink() {
  const calls: TaskNotificationEvent[] = [];
  return {
    calls,
    publishEvent: async (event: TaskNotificationEvent) => {
      calls.push(event);
      return {};
    },
  };
}

describe("NotificationsLabPublisher", () => {
  it("issue raised: systemActor e payload congelado (golden 8.1)", async () => {
    const sink = recordingSink();
    await new NotificationsLabPublisher(sink).publishIssueRaised({
      issueId: 12,
      title: "Monitor fora do ar",
      priority: "ALTA",
      reporterId: 5,
      recipientIds: [7, 8],
    });

    expect(sink.calls).toHaveLength(1);
    expect(sink.calls[0]).toMatchObject({
      eventType: "LAB_ISSUE_RAISED",
      title: "Nova issue do laboratório",
      message: 'A issue "Monitor fora do ar" foi reportada e precisa de acompanhamento.',
      audience: { mode: "USER_IDS", userIds: [7, 8] },
      triggeredByUserId: 5,
    });
    expectSystemActor(sink.calls[0].actor);
  });

  it("issue assigned: systemActor e SEM triggeredByUserId (a atribuição não tem autor)", async () => {
    const sink = recordingSink();
    await new NotificationsLabPublisher(sink).publishIssueAssigned({
      issueId: 12,
      title: "Monitor fora do ar",
      priority: "ALTA",
      assigneeId: 9,
    });

    expect(sink.calls[0]).toMatchObject({
      eventType: "LAB_ISSUE_ASSIGNED",
      message: 'Você foi designado para resolver a issue "Monitor fora do ar".',
      audience: { mode: "USER_IDS", userIds: [9] },
    });
    expect(sink.calls[0].triggeredByUserId).toBeUndefined();
    expectSystemActor(sink.calls[0].actor);
  });
});

describe("NotificationsReportPublisher", () => {
  it("relatório enviado: systemActor e público congelado", async () => {
    const sink = recordingSink();
    await new NotificationsReportPublisher(sink as unknown as ReportSubmittedEventSink).publishSubmitted({
      reportId: 3,
      projectId: 2,
      label: "2026-10",
      projectName: "DisplayQuest",
      userIds: [4, 5],
      authorId: 1,
    } as never);

    expect(sink.calls).toHaveLength(1);
    expect(sink.calls[0]).toMatchObject({
      audience: { mode: "USER_IDS", userIds: [4, 5] },
      triggeredByUserId: 1,
    });
    expectSystemActor(sink.calls[0].actor);
  });
});

describe("task-management — os três eventos de revisão", () => {
  it("reprovação publica TASK_REJECTED com systemActor", async () => {
    const notifications = recordingSink();
    const useCase = new RejectTaskUseCase(rejectDependencies(notifications));

    await useCase.execute({ taskId: 11, approverId: 5, reason: "ajuste o critério" });

    expect(notifications.calls).toHaveLength(1);
    expect(notifications.calls[0].eventType).toBe("TASK_REJECTED");
    expect(notifications.calls[0].audience).toEqual({ mode: "USER_IDS", userIds: [5] });
    expectSystemActor(notifications.calls[0].actor);
  });

  it("aprovação publica TASK_APPROVED com systemActor (o caminho deaward está aqui)", async () => {
    const notifications = recordingSink();
    const useCase = new ApproveTaskUseCase(approveDependencies(notifications));

    await useCase.execute({ taskId: 11, approverId: 4 });

    expect(notifications.calls).toHaveLength(1);
    expect(notifications.calls[0].eventType).toBe("TASK_APPROVED");
    expectSystemActor(notifications.calls[0].actor);
  });

  it("pedido de revisão publica TASK_REVIEW_REQUEST com systemActor", async () => {
    const notifications = recordingSink();
    const useCase = new UpdateTaskUseCase(updateDependencies(notifications));

    await useCase.execute({
      taskId: 11,
      actorId: 5,
      data: { status: "in-review" },
    });

    expect(notifications.calls).toHaveLength(1);
    expect(notifications.calls[0].eventType).toBe("TASK_REVIEW_REQUEST");
    expectSystemActor(notifications.calls[0].actor);
  });
});

/* ── fakes ──────────────────────────────────────────────────────────────────────────────────
 * Só as portas do caminho exercitado são duplas de verdade. As demais respondem por Proxy com
 * erro alto: um duplo que devolve `undefined` em silêncio transforma uma porta faltando em um
 * teste verde que não testou nada (a lição do `floating-session-timer` no AGENTS.md).
 */
/**
 * `attachAssignees` chama `isAvailable()` na porta e usa `listByTask`; com a task já tendo
 * assignee, os dois precisam concordar, senão `assignedTo` volta undefined e a notificação sai
 * sem destinatário.
 */
/** `TaskActorsPort` no caminho exercitado: o aprovador. */
function actorPort() {
  return { findById: async () => APPROVER };
}

function assigneesPort() {
  return {
    isAvailable: () => true,
    listUserIdsByTaskId: async () => [5],
    listTaskIdsByUserId: async () => [11],
    listUserIdsByTaskIds: async () => new Map([[11, [5]]]),
    isUserAssigned: async () => true,
    replaceAssignees: async () => undefined,
  } as never;
}

function unusedPort(name: string): never {
  return new Proxy(
    {},
    {
      get: () => async () => {
        throw new Error(`porta não deveria ser usada neste teste: ${name}`);
      },
    },
  ) as never;
}

/** A task in review — o estado que approve/reject exigem. */
const TASK: Record<string, unknown> = {
  id: 11,
  title: "Tarefa X",
  status: "in-review",
  priority: "MEDIUM",
  points: 10,
  projectId: 1,
  authorId: 5,
  assigneeIds: [5],
  dueDate: null,
  isPublic: false,
  description: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
} as never;

/** COORDENADOR aprova/reprova qualquer coisa; o ator do use case é um gerenciador de verdade. */
const APPROVER = { id: 4, name: "Coord", roles: ["COORDENADOR"], status: "active" } as never;

function rejectDependencies(notifications: unknown) {
  return {
    tasks: {
      findById: async () => TASK,
      update: async () => TASK,
    },
    assignees: assigneesPort(),
    actors: actorPort(),
    notifications,
  } as never;
}

function approveDependencies(notifications: unknown) {
  return {
    tasks: {
      findById: async () => TASK,
      update: async () => undefined,
      claimTaskIfUnclaimed: async () => ({}),
    },
    assignees: assigneesPort(),
    actors: { ...actorPort(), incrementCompletedTasks: async () => undefined },
    projects: unusedPort("projects"),
    notifications,
    awards: { awardForTaskCompletion: async () => ({}) },
  } as never;
}

function updateDependencies(notifications: unknown) {
  return {
    tasks: {
      // `isReviewRequestTransition(atual, "in-review")` só vale se o status ATUAL for outro —
      // por isso esta porta devolve a task em `to-do`, enquanto approve/reject usam a `TASK`
      // (que precisa estar em `in-review`).
      findById: async () => ({ ...TASK, status: "to-do" }),
      update: async () => TASK,
      claimTaskIfUnclaimed: async () => ({}),
      syncAssignees: async () => undefined,
    },
    assignees: assigneesPort(),
    // `usesPublicProgressBranch` chama `progress.isAvailable()` logo no primeiro passo do
    // `execute` — `false` leva o caminho normal (branch público é outro assunto, com testes
    // próprios em domain.task-rules).
    progress: { isAvailable: () => false },
    actors: actorPort(),
    projects: { findById: async () => ({ id: 1, name: "P", leaderId: 3, status: "ACTIVE" }) },
    notifications,
  } as never;
}