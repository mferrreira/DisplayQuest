/**
 * plan-v13 S02 — o card "Descrição" da página do projeto renderiza markdown (regra 2).
 *
 * Mocks copiados da costura medida em `project-detail-page.test.tsx` /
 * `project-detail-header.test.tsx`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import ProjectDetailPage from "@/app/(dashboard)/dashboard/projetos/[id]/page";

const mocks = vi.hoisted(() => ({
  auth: { user: null as any, loading: false },
  task: { tasks: [] as any[], createTask: vi.fn() },
  users: [] as any[],
  getById: vi.fn(),
  getMembers: vi.fn(),
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useParams: () => ({ id: "14" }), useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/contexts/auth-context", () => ({ useAuth: () => mocks.auth }));
vi.mock("@/contexts/task-context", () => ({ useTask: () => mocks.task }));
vi.mock("@/contexts/user-context", () => ({ useUser: () => ({ users: mocks.users }) }));
vi.mock("@/contexts/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/lib/api/endpoints/projects", () => ({ projectsApi: { getById: mocks.getById, members: mocks.getMembers } }));
vi.mock("@/components/features/project-media-header", () => ({ ProjectMediaHeader: () => null }));
vi.mock("@/components/features/project-deliverables-panel", () => ({ ProjectDeliverablesPanel: () => null }));
vi.mock("@/components/features/project-attachments-panel", () => ({ ProjectAttachmentsPanel: () => null }));
vi.mock("@/components/features/project-cronograma-panel", () => ({ ProjectCronogramaPanel: () => null }));
vi.mock("@/components/features/project-technical-reports-panel", () => ({ ProjectTechnicalReportsPanel: () => null }));
vi.mock("@/components/features/project-certificates-panel", () => ({ ProjectCertificatesPanel: () => null }));
vi.mock("@/components/features/project-hours-stats", () => ({ ProjectHoursStats: () => null }));
vi.mock("@/components/features/project-leader-logs", () => ({ ProjectLeaderLogs: () => null }));
vi.mock("@/components/features/project-reports-panel", () => ({ ProjectReportsPanel: () => null }));
vi.mock("@/components/features/project-members-management", () => ({ ProjectMembersManagement: () => null }));
vi.mock("@/components/features/project-time-progress", () => ({ ProjectTimeProgress: () => null }));
vi.mock("@/components/features/project-dialog", () => ({ ProjectDialog: () => null }));
vi.mock("@/components/features/task-dialog", () => ({ TaskDialog: () => null }));
vi.mock("@/components/features/backlog-dialog", () => ({ BacklogDialog: () => null }));

const project = {
  id: 14,
  name: "Pesquisa em IA",
  description: "**negrito** e [Site do lab](https://lab.com)",
  createdAt: "2026-01-05T12:00:00.000Z",
  createdBy: 9,
  leaderId: 7,
  status: "active",
  startDate: "2026-01-01",
  endDate: "2026-12-31",
  links: [],
} as any;

function setup(overrides: Record<string, unknown> = {}) {
  mocks.auth.user = { id: 7, name: "Lia", roles: ["COORDENADOR"] };
  mocks.auth.loading = false;
  mocks.task.tasks = [];
  mocks.users = [{ id: 9, name: "Coordenação" }];
  mocks.getById.mockResolvedValue({ project: { ...project, ...overrides } });
  mocks.getMembers.mockResolvedValue({ members: [] });
  render(<ProjectDetailPage />);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("card Descrição em markdown", () => {
  it("renderiza negrito e link com rel noopener", async () => {
    setup();

    expect(await screen.findByText("Descrição")).toBeVisible();
    expect(screen.getByText("negrito")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Site do lab" });
    expect(link).toHaveAttribute("href", "https://lab.com");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("HTML cru aparece como texto, não como elemento", async () => {
    setup({ description: "<b>cru</b> e https://lab.com" });

    expect(await screen.findByText("Descrição")).toBeVisible();
    // `<b>` aparece como texto literal; nada de <b> interpretado.
    expect(screen.getByText(/<b>cru<\/b>/)).toBeInTheDocument();
  });

  it("sem descrição o card não renderiza", async () => {
    setup({ description: null });

    expect(await screen.findByRole("heading", { name: "Pesquisa em IA" })).toBeVisible();
    expect(screen.queryByText("Descrição")).not.toBeInTheDocument();
  });
});
