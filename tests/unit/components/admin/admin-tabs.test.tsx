/**
 * V6-9 · AC-V6-32 (RF-V6.14 R1/R2).
 *
 * Caracterização das abas do `ModernAdminPanel`: a aba `settings` (placeholder) saiu, nenhuma
 * outra saiu, e cada aba restante **diz o motivo** quando o ator não porta a chave que a governa
 * — em vez de renderizar vazio (o comportamento antigo das abas de usuários/tarefas/badges, que
 * simplesmente não renderizavam nada).
 *
 * O ator sem `DASHBOARD_ADMIN` mas com `DASHBOARD_VOLUNTEERS` (GERENTE_PROJETO) é o caso que
 * prova o gate por aba: ele entra pela porta e vê a aba de Voluntários, e as demais explicam.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";

import { ModernAdminPanel } from "@/components/admin/ModernAdminPanel";
import { ProjectProvider } from "@/contexts/project-context";
import { UserProvider } from "@/contexts/user-context";
import { WorkSessionsProvider } from "@/contexts/work-sessions-context";
import { server } from "@/tests/mocks/server";

const mocks = vi.hoisted(() => ({
  roles: ["COORDENADOR"] as string[],
  refresh: vi.fn(),
}));

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({
    user: { id: 2, name: "Quem", email: "quem@lab.com", roles: mocks.roles },
  }),
}));

vi.mock("@/contexts/task-context", () => ({
  useTask: () => ({ tasks: [], approveTask: vi.fn(), rejectTask: vi.fn(), fetchTasks: vi.fn() }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh, push: vi.fn(), replace: vi.fn() }),
}));

function renderPanel() {
  render(
    <UserProvider>
      <ProjectProvider>
        <WorkSessionsProvider>
          <ModernAdminPanel
            users={[]}
            projects={[]}
            tasks={[]}
            sessions={[]}
            stats={{ totalUsers: 0, totalProjects: 0, totalTasks: 0, activeSessions: 0 }}
          />
        </WorkSessionsProvider>
      </ProjectProvider>
    </UserProvider>,
  );
}

beforeEach(() => {
  mocks.roles = ["COORDENADOR"];
  mocks.refresh.mockClear();
  server.use(
    http.get("*/api/users/approve", () => HttpResponse.json({ pendingUsers: [] })),
    http.get("*/api/schedules", () => HttpResponse.json([])),
    http.get("*/api/tasks/global-progress", () => HttpResponse.json({ globalTasks: [] })),
    http.get("*/api/work-sessions", () => HttpResponse.json({ data: [] })),
    http.get("*/api/projects/*/volunteers", () =>
      HttpResponse.json({ volunteers: [], stats: { totalVolunteers: 0, totalHours: 0, completedTasks: 0, totalPoints: 0 } }),
    ),
  );
});

describe("as abas do painel", () => {
  it("COORDENADOR vê as abas restantes e NÃO a aba de configurações", () => {
    renderPanel();

    expect(screen.getByRole("heading", { name: "Painel Administrativo" })).toBeInTheDocument();
    for (const name of [/visão geral/i, /usuários/i, /projetos/i, /horas/i, /tarefas/i, /voluntários/i, /notificações/i, /badges/i]) {
      expect(screen.getByRole("tab", { name })).toBeInTheDocument();
    }
    expect(screen.queryByRole("tab", { name: /configurações/i })).not.toBeInTheDocument();
  });
});

describe("aba sem permissão diz o motivo (RF-V6.14 R2)", () => {
  it("GERENTE_PROJETO abre em Voluntários e as demais abas explicam a chave", async () => {
    mocks.roles = ["GERENTE_PROJETO"];
    const user = userEvent.setup({ delay: null });
    renderPanel();

    // Sem DASHBOARD_ADMIN, a aba inicial é Voluntários (a única que ele porta).
    expect(screen.getByRole("tab", { name: /voluntários/i })).toHaveAttribute("aria-selected", "true");

    await user.click(screen.getByRole("tab", { name: /usuários/i }));
    expect(await screen.findByRole("heading", { name: "Acesso Restrito" })).toBeInTheDocument();
    expect(screen.getByText(/MANAGE_USERS/)).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /visão geral/i }));
    expect(await screen.findByText(/DASHBOARD_ADMIN/)).toBeInTheDocument();
  });
});
