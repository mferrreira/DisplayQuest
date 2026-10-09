// @vitest-environment node
/**
 * OND1-B2 — use case / domain unit tests with PURE FAKES (PLAN §4 layer 3).
 *
 * No prisma seam here: the ports are faked directly. Each rule branch moved out of the
 * gateway in R2 has its own test (recipient normalization, audience semantics, empty-recipient
 * policy, typed validation errors).
 *
 * B10 · D8 (DEC-125): a fachada `NotificationsGateway` saiu do modulo — os use cases falam com
 * a porta fina `NotificationRepository`. O duplo abaixo e o repository; as assercoes de
 * publicacao agora olham as LINHAS entregues a `createMany` (o que de verdade chega ao banco),
 * nao um comando intermediario.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  isDomainError,
  normalizeUserIdAudience,
  systemActor,
  userActor,
  ValidationError,
} from "@/backend/domain";
import { PublishNotificationEventUseCase } from "@/backend/modules/notifications/application/use-cases/publish-notification-event.use-case";
import { ListUserNotificationsUseCase } from "@/backend/modules/notifications/application/use-cases/list-user-notifications.use-case";
import { GetUnreadCountUseCase } from "@/backend/modules/notifications/application/use-cases/get-unread-count.use-case";
import { MarkNotificationAsReadUseCase } from "@/backend/modules/notifications/application/use-cases/mark-notification-as-read.use-case";
import { MarkAllNotificationsAsReadUseCase } from "@/backend/modules/notifications/application/use-cases/mark-all-notifications-as-read.use-case";
import { DeleteUserNotificationUseCase } from "@/backend/modules/notifications/application/use-cases/delete-user-notification.use-case";
import type { PublishNotificationEventCommand } from "@/backend/modules/notifications/application/contracts";
import type {
  CreateNotificationRow,
  NotificationRepository,
} from "@/backend/modules/notifications/application/ports/notification.repository";
import type { Notification } from "@/backend/domain";

class FakeRepository implements NotificationRepository {
  createManyCalls: CreateNotificationRow[][] = [];
  listCalls: Array<{ userId: number; unreadOnly?: boolean }> = [];
  unreadCountCalls: number[] = [];
  markCalls: Array<{ userId: number; notificationId: number; readAt: Date }> = [];
  markAllCalls: Array<{ userId: number; readAt: Date }> = [];
  deleteCalls: Array<{ userId: number; notificationId: number }> = [];
  activeIds: number[] = [];

  listResult: Notification[] = [];
  unreadCountResult = 0;
  markResult = 1;
  markAllResult = 0;
  deleteResult = 1;

  async listActiveUserIds(): Promise<number[]> {
    return [...this.activeIds];
  }
  async createMany(rows: CreateNotificationRow[]): Promise<number> {
    this.createManyCalls.push(rows);
    return rows.length;
  }
  async listByUser(userId: number, options?: { unreadOnly?: boolean }): Promise<Notification[]> {
    this.listCalls.push({ userId, unreadOnly: options?.unreadOnly });
    return this.listResult;
  }
  async countUnread(userId: number): Promise<number> {
    this.unreadCountCalls.push(userId);
    return this.unreadCountResult;
  }
  async markRead(userId: number, notificationId: number, readAt: Date): Promise<number> {
    this.markCalls.push({ userId, notificationId, readAt });
    return this.markResult;
  }
  async markAllRead(userId: number, readAt: Date): Promise<number> {
    this.markAllCalls.push({ userId, readAt });
    return this.markAllResult;
  }
  async remove(userId: number, notificationId: number): Promise<number> {
    this.deleteCalls.push({ userId, notificationId });
    return this.deleteResult;
  }
}

describe("domain rule — normalizeUserIdAudience (moved out of the gateway in R2)", () => {
  it("dedupes keeping first-seen order", () => {
    expect(normalizeUserIdAudience([2, 2, 3])).toEqual([2, 3]);
  });

  it("filters non-integers and non-positive ids", () => {
    expect(normalizeUserIdAudience([0, -1, 2.5, NaN, 4, 7])).toEqual([4, 7]);
  });

  it("empty in -> empty out", () => {
    expect(normalizeUserIdAudience([])).toEqual([]);
  });
});

describe("PublishNotificationEventUseCase — rules owned by the use case (R2)", () => {
  let repository: FakeRepository;
  let useCase: PublishNotificationEventUseCase;

  beforeEach(() => {
    repository = new FakeRepository();
    repository.activeIds = [1, 3];
    useCase = new PublishNotificationEventUseCase(repository);
  });

  /**
   * D4/B6-2b (DEC-54): o ator entrou no comando. Estes testes exercitam as regras de publicação
   * (validação, audiência, normalização) com um ator de sistema, porque o caminho HTTP é coberto em
   * `tests/unit/api/notification-authorization.test.ts` e a autorização em si em
   * `tests/unit/domain/identity/system-actor.test.ts`. O gate do use case tem um teste próprio no
   * fim deste arquivo.
   */
  const baseCommand: PublishNotificationEventCommand = {
    eventType: "TASK_DONE",
    title: "Titulo",
    message: "Mensagem",
    audience: { mode: "USER_IDS", userIds: [2] },
    actor: systemActor("SYSTEM_EVENT"),
  };

  it("empty title -> ValidationError (400) with the golden message, no repository call", async () => {
    await expect(
      useCase.execute({ ...systemCommand, title: "" }),
    ).rejects.toThrow("Título é obrigatório");
    const error = await useCase.execute({ ...systemCommand, title: "" }).catch((e) => e);
    expect(isDomainError(error)).toBe(true);
    expect(error).toBeInstanceOf(ValidationError);
    expect(error.status).toBe(400);
    expect(repository.createManyCalls).toHaveLength(0);
  });

  it("empty message -> ValidationError with the golden message", async () => {
    const error = await useCase.execute({ ...systemCommand, message: " " }).catch((e) => e);
    expect(error).toBeInstanceOf(ValidationError);
    expect(error.message).toBe("Mensagem é obrigatória");
    expect(repository.createManyCalls).toHaveLength(0);
  });

  it("USER_IDS with empty list -> ValidationError with the golden message", async () => {
    const error = await useCase
      .execute({ ...systemCommand, audience: { mode: "USER_IDS", userIds: [] } })
      .catch((e) => e);
    expect(error).toBeInstanceOf(ValidationError);
    expect(error.message).toBe("Nenhum destinatário informado");
    expect(repository.createManyCalls).toHaveLength(0);
  });

  it("normalizes USER_IDS recipients BEFORE the repository (dedupe + filter)", async () => {
    const result = await useCase.execute({
      ...systemCommand,
      audience: { mode: "USER_IDS", userIds: [2, 2, 3, 0, -1, 2.5] },
    });

    expect(repository.createManyCalls).toHaveLength(1);
    expect(repository.createManyCalls[0].map((row) => row.userId)).toEqual([2, 3]);
    expect(result).toEqual({ createdCount: 2, recipients: [2, 3] });
  });

  it("USER_IDS with only invalid ids -> { 0, [] } short-circuit, no repository call", async () => {
    const result = await useCase.execute({
      ...systemCommand,
      audience: { mode: "USER_IDS", userIds: [0, -1] },
    });

    expect(result).toEqual({ createdCount: 0, recipients: [] });
    expect(repository.createManyCalls).toHaveLength(0);
  });

  it("ALL_ACTIVE_USERS is resolved via the repository and converted to normalized recipients", async () => {
    repository.activeIds = [5, 5, 6];
    const result = await useCase.execute({
      ...systemCommand,
      audience: { mode: "ALL_ACTIVE_USERS" },
    });

    expect(repository.createManyCalls).toHaveLength(1);
    expect(repository.createManyCalls[0].map((row) => row.userId)).toEqual([5, 6]);
    expect(result).toEqual({ createdCount: 2, recipients: [5, 6] });
  });

  it("ALL_ACTIVE_USERS with no active users -> { 0, [] } short-circuit, no repository call", async () => {
    repository.activeIds = [];
    const result = await useCase.execute({ ...systemCommand, audience: { mode: "ALL_ACTIVE_USERS" } });

    expect(result).toEqual({ createdCount: 0, recipients: [] });
    expect(repository.createManyCalls).toHaveLength(0);
  });

  it("encodes the row envelope exactly as the old gateway adapter did (D8)", async () => {
    await useCase.execute({
      ...systemCommand,
      data: { a: 1 },
      triggeredByUserId: 99,
    });

    const [row] = repository.createManyCalls[0];
    expect(row.type).toBe("TASK_DONE");
    expect(row.title).toBe("Titulo");
    expect(row.message).toBe("Mensagem");
    // O envelope e a String gravada na coluna `data` — undefined vira null, objeto vira JSON.
    expect(row.data).toBe(JSON.stringify({ a: 1 }));

    const [plain] = await (async () => {
      repository.createManyCalls = [];
      await useCase.execute({ ...systemCommand });
      return repository.createManyCalls[0];
    })();
    expect(plain.data).toBeNull();
  });
});

describe("pass-through use cases — ownership scope is in the signature (R2)", () => {
  let repository: FakeRepository;
  beforeEach(() => {
    repository = new FakeRepository();
  });

  it("listUserNotifications forwards (userId, unreadOnly), default false", async () => {
    repository.listResult = [{ id: 1 } as Notification];
    const useCase = new ListUserNotificationsUseCase(repository);

    expect(await useCase.execute(7)).toEqual(repository.listResult);
    expect(repository.listCalls).toEqual([{ userId: 7, unreadOnly: false }]);

    await useCase.execute(7, true);
    expect(repository.listCalls[1]).toEqual({ userId: 7, unreadOnly: true });
  });

  it("getUnreadCount forwards userId", async () => {
    repository.unreadCountResult = 3;
    const useCase = new GetUnreadCountUseCase(repository);
    expect(await useCase.execute(7)).toBe(3);
    expect(repository.unreadCountCalls).toEqual([7]);
  });

  it("markAsRead forwards (userId, notificationId) and maps affected rows to boolean", async () => {
    const useCase = new MarkNotificationAsReadUseCase(repository);
    expect(await useCase.execute(7, 1)).toBe(true);
    expect(repository.markCalls).toHaveLength(1);
    expect(repository.markCalls[0].userId).toBe(7);
    expect(repository.markCalls[0].notificationId).toBe(1);
    expect(repository.markCalls[0].readAt).toBeInstanceOf(Date);

    repository.markResult = 0;
    expect(await useCase.execute(7, 2)).toBe(false);
  });

  it("markAllAsRead forwards userId with the read clock", async () => {
    repository.markAllResult = 2;
    const useCase = new MarkAllNotificationsAsReadUseCase(repository);
    expect(await useCase.execute(7)).toBe(2);
    expect(repository.markAllCalls).toHaveLength(1);
    expect(repository.markAllCalls[0].userId).toBe(7);
    expect(repository.markAllCalls[0].readAt).toBeInstanceOf(Date);
  });

  it("deleteUserNotification forwards (userId, notificationId) and maps affected rows to boolean", async () => {
    repository.deleteResult = 0;
    const useCase = new DeleteUserNotificationUseCase(repository);
    expect(await useCase.execute(7, 1)).toBe(false);
    expect(repository.deleteCalls).toEqual([{ userId: 7, notificationId: 1 }]);

    repository.deleteResult = 1;
    expect(await useCase.execute(7, 2)).toBe(true);
  });
});

/** Base command com ator de SISTEMA — os testes de regra de publicação não são sobre autorização. */
const systemCommand: PublishNotificationEventCommand = {
  eventType: "TASK_DONE",
  title: "Titulo",
  message: "Mensagem",
  audience: { mode: "USER_IDS", userIds: [2] },
  actor: systemActor("SYSTEM_EVENT"),
};

describe("PublishNotificationEventUseCase — gate de MANAGE_NOTIFICATIONS (D4, B6-2b, DEC-54)", () => {
  it("usuário SEM a permissão leva ForbiddenError e não chega ao repository", async () => {
    const repository = new FakeRepository();
    const useCase = new PublishNotificationEventUseCase(repository);
    const error = await useCase
      .execute({ ...systemCommand, actor: userActor(42, ["VOLUNTARIO"]) })
      .catch((e) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("Sem permissão para criar notificações");
    expect(repository.createManyCalls).toEqual([]);
  });

  it("COORDENADOR e GERENTE publicam", async () => {
    for (const roles of [["COORDENADOR"], ["GERENTE"]]) {
      const repository = new FakeRepository();
      const useCase = new PublishNotificationEventUseCase(repository);
      const result = await useCase.execute({ ...systemCommand, actor: userActor(42, roles) });
      expect(result.createdCount).toBe(1);
      expect(repository.createManyCalls).toHaveLength(1);
    }
  });

  it("o gate vem ANTES da validação de título: sem permissão e título vazio é 403, não 400", async () => {
    // A ordem é contrato medido: a rota checava permissão antes de parsear o corpo, e o
    // `assertCanPublishEvent` da rota existe por causa disso (ver o use case dele).
    const repository = new FakeRepository();
    const useCase = new PublishNotificationEventUseCase(repository);
    const error = await useCase
      .execute({ ...systemCommand, title: "", actor: userActor(42, ["VOLUNTARIO"]) })
      .catch((e) => e);
    expect(error.message).toBe("Sem permissão para criar notificações");
  });

  it("o systemActor dos publishers internos publica — é o que impede o laboratório de emudecer", async () => {
    // Sem este caso, o gate quebraria a notificação de issue do laboratório e a de relatório
    // enviado, que são justamente os dois chamadores sem pessoa (DEC-54).
    const repository = new FakeRepository();
    const useCase = new PublishNotificationEventUseCase(repository);
    const result = await useCase.execute({ ...systemCommand, actor: systemActor("SYSTEM_EVENT") });
    expect(result.createdCount).toBe(1);
    expect(repository.createManyCalls[0][0].type).toBe("TASK_DONE");
  });
});
