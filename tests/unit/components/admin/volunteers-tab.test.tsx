/**
 * V6-9 · AC-V6-29/AC-V6-37 (RF-V6.12, DEC-182).
 *
 * A aba **Voluntários** mudou de casa: saiu da página de Projetos e passou a ser aba do Painel
 * Administrativo. Este teste trava as duas pontas — existe no Admin, não existe em Projetos — e
 * confirma que a aba **Dashboard** de Projetos continua no lugar (DEC-186).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";

import { ModernAdminPanel } from "@/components/admin/ModernAdminPanel";
import { UserProvider } from "@/contexts/user-context";
import { WorkSessionsProvider } from "@/contexts/work-sessions-context";
import ProjetosPage from "@/app/(dashboard)/dashboard/projetos/page";
import { server } from "@/tests/mocks/server";

const mocks = vi.hoisted(() => ({
  roles: ["COORDENADOR"] as string[],
}));

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ user: { id: 2, name: "Quem", roles: mocks.roles }, loading: false }),
}));

vi.mock("@/contexts/task-context", () => ({
  useTask: () => ({ tasks: [], approveTask: vi.fn(), rejectTask: vi.fn(), fetchTasks: vi.fn() }),
}));

vi.mock("@/contexts/user-context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/contexts/user-context")>();
  return { ...actual, useUser: () => ({ users: [] }) };
});

vi.mock("@/contexts/project-context", () => ({
  useProject: () => ({ projects: [], loading: false }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/components/features/project-list", () => ({ ProjectList: () => null }));
vi.mock("@/components/features/project-dialog", () => ({ ProjectDialog: () => null }));
vi.mock("@/components/features/project-manager-dashboard", () => ({ ProjectManagerDashboard: () => null }));
vi.mock("@/components/features/volunteers-management", () => ({ VolunteersManagement: () => null }));

beforeEach(() => {
  mocks.roles = ["COORDENADOR"];
  server.use(
    http.get("*/api/users/approve", () => HttpResponse.json({ pendingUsers: [] })),
    http.get("*/api/schedules", () => HttpResponse.json([])),
    http.get("*/api/tasks/global-progress", () => HttpResponse.json({ globalTasks: [] })),
    http.get("*/api/work-sessions", () => HttpResponse.json({ data: [] })),
  );
});

describe("a aba Voluntários tem uma casa só", () => {
  it("existe no Painel Administrativo", () => {
    render(
      <UserProvider>
        <WorkSessionsProvider>
          <ModernAdminPanel
            users={[]}
            projects={[]}
            tasks={[]}
            sessions={[]}
            stats={{ totalUsers: 0, totalProjects: 0, totalTasks: 0, activeSessions: 0 }}
          />
        </WorkSessionsProvider>
      </UserProvider>,
    );

    expect(screen.getByRole("tab", { name: /voluntários/i })).toBeInTheDocument();
  });

  it("não existe na página de Projetos, que mantém a aba Dashboard (DEC-186)", () => {
    render(<ProjetosPage />);

    expect(screen.queryByRole("tab", { name: /voluntários/i })).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /dashboard/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /lista de projetos/i })).toBeInTheDocument();
  });
});
