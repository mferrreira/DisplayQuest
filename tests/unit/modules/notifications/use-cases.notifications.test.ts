// @vitest-environment node
/**
 * OND1-B2 — use case / domain unit tests with PURE FAKES (PLAN §4 layer 3).
 *
 * No prisma seam here: the ports are faked directly. Each rule branch moved out of the
 * gateway in R2 has its own test (recipient normalization, audience semantics, empty-recipient
 * policy, typed validation errors).
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
import type {
  NotificationItem,
  PublishNotificationEventCommand,
  PublishNotificationEventResult,
} from "@/backend/modules/notifications/application/contracts";
import type { NotificationsGateway } from "@/backend/modules/notifications/application/ports/notifications.gateway";
import type { ActiveUserDirectory } from "@/backend/modules/notifications/application/ports/notification.repository";

class FakeGateway implements NotificationsGateway {
  publishCalls: PublishNotificationEventCommand[] = [];
  listCalls: Array<{ userId: number; unreadOnly?: boolean }> = [];
  unreadCountCalls: number[] = [];
  markCalls: Array<{ userId: number; notificationId: number }> = [];
  markAllCalls: number[] = [];
  deleteCalls: Array<{ userId: number; notificationId: number }> = [];

  publishResult: PublishNotificationEventResult = { createdCount: 1, recipients: [1] };
  listResult: NotificationItem[] = [];
  unreadCountResult = 0;
  markResult = true;
  markAllResult = 0;
  deleteResult = true;

  async publishEvent(command: PublishNotificationEventCommand): Promise<PublishNotificationEventResult> {
    this.publishCalls.push(command);
    return this.publishResult;
  }
  async listUserNotifications(userId: number, unreadOnly = false): Promise<NotificationItem[]> {
    this.listCalls.push({ userId, unreadOnly });
    return this.listResult;
  }
  async getUnreadCount(userId: number): Promise<number> {
    this.unreadCountCalls.push(userId);
    return this.unreadCountResult;
  }
  async markAsRead(userId: number, notificationId: number): Promise<boolean> {
    this.markCalls.push({ userId, notificationId });
    return this.markResult;
  }
  async markAllAsRead(userId: number): Promise<number> {
    this.markAllCalls.push(userId);
    return this.markAllResult;
  }
  async deleteUserNotification(userId: number, notificationId: number): Promise<boolean> {
    this.deleteCalls.push({ userId, notificationId });
    return this.deleteResult;
  }
}

class FakeDirectory implements ActiveUserDirectory {
  constructor(public activeIds: number[] = []) {}
  async listActiveUserIds(): Promise<number[]> {
    return [...this.activeIds];
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
  let gateway: FakeGateway;
  let directory: FakeDirectory;
  let useCase: PublishNotificationEventUseCase;

  beforeEach(() => {
    gateway = new FakeGateway();
    directory = new FakeDirectory([1, 3]);
    useCase = new PublishNotificationEventUseCase(gateway, directory);
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

  it("empty title -> ValidationError (400) with the golden message, no gateway call", async () => {
    await expect(
      useCase.execute({ ...systemCommand, title: "" }),
    ).rejects.toThrow("Título é obrigatório");
    const error = await useCase.execute({ ...systemCommand, title: "" }).catch((e) => e);
    expect(isDomainError(error)).toBe(true);
    expect(error).toBeInstanceOf(ValidationError);
    expect(error.status).toBe(400);
    expect(gateway.publishCalls).toHaveLength(0);
  });

  it("empty message -> ValidationError with the golden message", async () => {
    const error = await useCase.execute({ ...systemCommand, message: " " }).catch((e) => e);
    expect(error).toBeInstanceOf(ValidationError);
    expect(error.message).toBe("Mensagem é obrigatória");
    expect(gateway.publishCalls).toHaveLength(0);
  });

  it("USER_IDS with empty list -> ValidationError with the golden message", async () => {
    const error = await useCase
      .execute({ ...systemCommand, audience: { mode: "USER_IDS", userIds: [] } })
      .catch((e) => e);
    expect(error).toBeInstanceOf(ValidationError);
    expect(error.message).toBe("Nenhum destinatário informado");
    expect(gateway.publishCalls).toHaveLength(0);
  });

  it("normalizes USER_IDS recipients BEFORE the gateway (dedupe + filter)", async () => {
    const result = await useCase.execute({
      ...systemCommand,
      audience: { mode: "USER_IDS", userIds: [2, 2, 3, 0, -1, 2.5] },
    });

    expect(gateway.publishCalls).toHaveLength(1);
    expect(gateway.publishCalls[0].audience).toEqual({ mode: "USER_IDS", userIds: [2, 3] });
    expect(result).toEqual(gateway.publishResult);
  });

  it("USER_IDS with only invalid ids -> { 0, [] } short-circuit, no gateway call", async () => {
    const result = await useCase.execute({
      ...systemCommand,
      audience: { mode: "USER_IDS", userIds: [0, -1] },
    });

    expect(result).toEqual({ createdCount: 0, recipients: [] });
    expect(gateway.publishCalls).toHaveLength(0);
  });

  it("ALL_ACTIVE_USERS is resolved via the directory port and converted to normalized USER_IDS", async () => {
    directory.activeIds = [5, 5, 6];
    const result = await useCase.execute({
      ...systemCommand,
      audience: { mode: "ALL_ACTIVE_USERS" },
    });

    expect(gateway.publishCalls).toHaveLength(1);
    expect(gateway.publishCalls[0].audience).toEqual({ mode: "USER_IDS", userIds: [5, 6] });
    expect(result).toEqual(gateway.publishResult);
  });

  it("ALL_ACTIVE_USERS with no active users -> { 0, [] } short-circuit, no gateway call", async () => {
    directory.activeIds = [];
    const result = await useCase.execute({ ...systemCommand, audience: { mode: "ALL_ACTIVE_USERS" } });

    expect(result).toEqual({ createdCount: 0, recipients: [] });
    expect(gateway.publishCalls).toHaveLength(0);
  });

  it("passes the rest of the command through untouched", async () => {
    await useCase.execute({
      ...systemCommand,
      data: { a: 1 },
      triggeredByUserId: 99,
    });

    expect(gateway.publishCalls[0].eventType).toBe("TASK_DONE");
    expect(gateway.publishCalls[0].title).toBe("Titulo");
    expect(gateway.publishCalls[0].message).toBe("Mensagem");
    expect(gateway.publishCalls[0].data).toEqual({ a: 1 });
    expect(gateway.publishCalls[0].triggeredByUserId).toBe(99);
  });
});

describe("pass-through use cases — ownership scope is in the signature (R2)", () => {
  let gateway: FakeGateway;
  beforeEach(() => {
    gateway = new FakeGateway();
  });

  it("listUserNotifications forwards (userId, unreadOnly), default false", async () => {
    gateway.listResult = [{ id: 1 } as NotificationItem];
    const useCase = new ListUserNotificationsUseCase(gateway);

    expect(await useCase.execute(7)).toEqual(gateway.listResult);
    expect(gateway.listCalls).toEqual([{ userId: 7, unreadOnly: false }]);

    await useCase.execute(7, true);
    expect(gateway.listCalls[1]).toEqual({ userId: 7, unreadOnly: true });
  });

  it("getUnreadCount forwards userId", async () => {
    gateway.unreadCountResult = 3;
    const useCase = new GetUnreadCountUseCase(gateway);
    expect(await useCase.execute(7)).toBe(3);
    expect(gateway.unreadCountCalls).toEqual([7]);
  });

  it("markAsRead forwards (userId, notificationId)", async () => {
    const useCase = new MarkNotificationAsReadUseCase(gateway);
    expect(await useCase.execute(7, 1)).toBe(true);
    expect(gateway.markCalls).toEqual([{ userId: 7, notificationId: 1 }]);
  });

  it("markAllAsRead forwards userId", async () => {
    gateway.markAllResult = 2;
    const useCase = new MarkAllNotificationsAsReadUseCase(gateway);
    expect(await useCase.execute(7)).toBe(2);
    expect(gateway.markAllCalls).toEqual([7]);
  });

  it("deleteUserNotification forwards (userId, notificationId)", async () => {
    gateway.deleteResult = false;
    const useCase = new DeleteUserNotificationUseCase(gateway);
    expect(await useCase.execute(7, 1)).toBe(false);
    expect(gateway.deleteCalls).toEqual([{ userId: 7, notificationId: 1 }]);
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
  it("usuário SEM a permissão leva ForbiddenError e não chega ao gateway", async () => {
    const gateway = new FakeGateway();
    const useCase = new PublishNotificationEventUseCase(gateway, new FakeDirectory([1, 3]));
    const error = await useCase
      .execute({ ...systemCommand, actor: userActor(["VOLUNTARIO"]) })
      .catch((e) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("Sem permissão para criar notificações");
    expect(gateway.publishCalls).toEqual([]);
  });

  it("COORDENADOR e GERENTE publicam", async () => {
    for (const roles of [["COORDENADOR"], ["GERENTE"]]) {
      const gateway = new FakeGateway();
      const useCase = new PublishNotificationEventUseCase(gateway, new FakeDirectory([1, 3]));
      const result = await useCase.execute({ ...systemCommand, actor: userActor(roles) });
      expect(result.createdCount).toBe(1);
      expect(gateway.publishCalls).toHaveLength(1);
    }
  });

  it("o gate vem ANTES da validação de título: sem permissão e título vazio é 403, não 400", async () => {
    // A ordem é contrato medido: a rota checava permissão antes de parsear o corpo, e o
    // `assertCanPublishEvent` da rota existe por causa disso (ver o use case dele).
    const gateway = new FakeGateway();
    const useCase = new PublishNotificationEventUseCase(gateway, new FakeDirectory([1, 3]));
    const error = await useCase
      .execute({ ...systemCommand, title: "", actor: userActor(["VOLUNTARIO"]) })
      .catch((e) => e);
    expect(error.message).toBe("Sem permissão para criar notificações");
  });

  it("o systemActor dos publishers internos publica — é o que impede o laboratório de emudecer", async () => {
    // Sem este caso, o gate quebraria a notificação de issue do laboratório e a de relatório
    // enviado, que são justamente os dois chamadores sem pessoa (DEC-54).
    const gateway = new FakeGateway();
    const useCase = new PublishNotificationEventUseCase(gateway, new FakeDirectory([1, 3]));
    const result = await useCase.execute({ ...systemCommand, actor: systemActor("SYSTEM_EVENT") });
    expect(result.createdCount).toBe(1);
    expect(gateway.publishCalls[0].eventType).toBe("TASK_DONE");
  });
});
