/**
 * plan-v13 S01 — subtítulo abaixo do título na página do projeto (regra 1 do MODELO.md).
 *
 * O que entra no aceite: o cabeçalho mostra o SUBTÍTULO, não a descrição; sem subtítulo, o
 * fallback de hoje permanece. A descrição continua no card "Descrição" da aba Visão geral.
 *
 * Mocks copiados da costura medida em `features/projects/__tests__/project-detail-page.test.tsx`.
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
  description: "corpo da descrição",
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
  mocks.users = [{ id: 9, name: "Coordenação" }, { id: 7, name: "Lia" }];
  mocks.getById.mockResolvedValue({ project: { ...project, ...overrides } });
  mocks.getMembers.mockResolvedValue({ members: [] });
  render(<ProjectDetailPage />);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("subtítulo no cabeçalho da página do projeto", () => {
  it("mostra o subtítulo abaixo do título, não a descrição", async () => {
    setup({ subtitle: "Estudo de IA aplicada" });

    expect(await screen.findByRole("heading", { name: "Pesquisa em IA" })).toBeVisible();
    expect(screen.getByText("Estudo de IA aplicada")).toBeVisible();
    // A descrição não é o texto do cabeçalho: mora no card "Descrição" da aba Visão geral.
    expect(screen.getByText("Descrição")).toBeVisible();
    expect(screen.getByText("corpo da descrição")).toBeVisible();
  });

  it("sem subtítulo o cabeçalho mantém o fallback de hoje", async () => {
    setup();

    expect(await screen.findByRole("heading", { name: "Pesquisa em IA" })).toBeVisible();
    // O texto do cabeçalho é o fallback, e a descrição fica no card da aba — o texto do
    // cabeçalho só existe ali, o da descrição mora no card.
    expect(screen.getByText("Detalhes e acompanhamento do projeto")).toBeVisible();
    expect(screen.getByText("Descrição")).toBeVisible();
    expect(screen.getByText("corpo da descrição")).toBeVisible();
  });
});
