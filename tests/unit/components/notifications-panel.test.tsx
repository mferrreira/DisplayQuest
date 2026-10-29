/**
 * V5-8 (DEC-64) — destaque de prioridade no painel de notificações.
 *
 * O painel é o lugar do destaque (DEC-64: "in-app COM PRIORIDADE ... destaque no painel").
 * Congelado aqui: a notificação prioritária ganha o selo "Urgente" (lida ou não-lida) e a
 * não-prioritária não. O hook é mockado na fronteira do feature — o painel decide só a
 * partir do campo `priority` que chega da lista.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Notification } from "@/entities/notification";

const notificationsMock = vi.hoisted(() => ({
  current: [] as Notification[],
  unreadCount: 0,
  markAsRead: null as null | ((id: number) => Promise<void>),
}));

vi.mock("@/features/notifications", () => ({
  useNotifications: () => ({
    notifications: notificationsMock.current,
    unreadCount: notificationsMock.unreadCount,
    loading: false,
    error: null,
    markAsRead: (id: number) => notificationsMock.markAsRead!(id),
    markAllAsRead: async () => undefined,
    deleteNotification: async () => undefined,
  }),
}));

import { NotificationsPanel } from "@/components/ui/notifications-panel";

function notification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: 1,
    userId: 4,
    type: "ACTIVITY_OVERDUE",
    title: "Atividade atrasada",
    message:
      'A atividade "Coleta de dados" do projeto "Pesquisa em IA" venceu em 31/10/2026 e ainda não foi concluída.',
    data: null,
    read: false,
    priority: true,
    createdAt: "2026-11-05T11:00:00.000Z",
    readAt: null,
    ...overrides,
  };
}

async function openPanel(user: ReturnType<typeof userEvent.setup>) {
  render(<NotificationsPanel />);
  await user.click(screen.getByRole("button", { name: /notifica/i }));
}

beforeEach(() => {
  notificationsMock.current = [];
  notificationsMock.unreadCount = 0;
  notificationsMock.markAsRead = vi.fn(async () => undefined);
});

describe("destaque de prioridade no painel (V5-8, DEC-64)", () => {
  it("a notificação prioritária ganha o selo 'Urgente'; a comum não", async () => {
    const user = userEvent.setup({ delay: null });
    notificationsMock.current = [
      notification(),
      notification({
        id: 2,
        type: "TASK_APPROVED",
        title: "Tarefa aprovada",
        message: "Sua tarefa foi aprovada.",
        priority: false,
      }),
    ];
    notificationsMock.unreadCount = 2;

    await openPanel(user);

    expect(await screen.findByText("Atividade atrasada")).toBeInTheDocument();
    expect(screen.getByText("Tarefa aprovada")).toBeInTheDocument();
    // Um único selo no painel — só a prioritária.
    const selos = screen.getAllByText("Urgente");
    expect(selos).toHaveLength(1);
  });

  it("prioritária lida continua com o selo", async () => {
    const user = userEvent.setup({ delay: null });
    notificationsMock.current = [
      notification({ read: true, readAt: "2026-11-05T12:00:00.000Z" }),
    ];
    notificationsMock.unreadCount = 0;

    await openPanel(user);

    expect(await screen.findByText("Urgente")).toBeInTheDocument();
  });

  it("sem notificação prioritária, nenhum selo", async () => {
    const user = userEvent.setup({ delay: null });
    notificationsMock.current = [
      notification({ type: "TASK_APPROVED", title: "Tarefa aprovada", priority: false }),
    ];
    notificationsMock.unreadCount = 1;

    await openPanel(user);

    expect(await screen.findByText("Tarefa aprovada")).toBeInTheDocument();
    expect(screen.queryByText("Urgente")).not.toBeInTheDocument();
  });
});
