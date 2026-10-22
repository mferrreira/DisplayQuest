import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
vi.mock("@/components/features/project-media-header", () => ({ ProjectMediaHeader: ({ canManage }: any) => <div data-testid="media-header" data-can-manage={String(canManage)} /> }));
vi.mock("@/components/features/project-deliverables-panel", () => ({ ProjectDeliverablesPanel: ({ canManage }: any) => <div data-testid="deliverables" data-can-manage={String(canManage)} /> }));
vi.mock("@/components/features/project-attachments-panel", () => ({ ProjectAttachmentsPanel: ({ canManage }: any) => <div data-testid="attachments" data-can-manage={String(canManage)} /> }));
vi.mock("@/components/features/project-cronograma-panel", () => ({ ProjectCronogramaPanel: ({ canManage }: any) => <div data-testid="cronograma" data-can-manage={String(canManage)} /> }));
vi.mock("@/components/features/project-technical-reports-panel", () => ({ ProjectTechnicalReportsPanel: ({ canManage }: any) => <div data-testid="technical-reports" data-can-manage={String(canManage)} /> }));
vi.mock("@/components/features/project-certificates-panel", () => ({ ProjectCertificatesPanel: ({ canManage }: any) => <div data-testid="certificates" data-can-manage={String(canManage)} /> }));
vi.mock("@/components/features/project-hours-stats", () => ({ ProjectHoursStats: () => <div>Horas do projeto</div> }));
vi.mock("@/components/features/project-leader-logs", () => ({ ProjectLeaderLogs: () => <div>Logs do líder</div> }));
vi.mock("@/components/features/project-reports-panel", () => ({ ProjectReportsPanel: () => <div>Relatórios do projeto</div> }));
vi.mock("@/components/features/project-members-management", () => ({ ProjectMembersManagement: () => <div>Gestão de membros</div> }));
vi.mock("@/components/features/project-time-progress", () => ({ ProjectTimeProgress: () => null }));
vi.mock("@/components/features/project-dialog", () => ({ ProjectDialog: () => null }));
vi.mock("@/components/features/task-dialog", () => ({ TaskDialog: () => null }));
vi.mock("@/components/features/backlog-dialog", () => ({ BacklogDialog: () => null }));

const project = {
  id: 14,
  name: "Pesquisa em IA",
  description: "Projeto de pesquisa",
  createdAt: "2026-01-05T12:00:00.000Z",
  createdBy: 9,
  leaderId: 7,
  status: "active",
  startDate: "2026-01-01",
  endDate: "2026-12-31",
  editalNumber: "ED-14",
  processNumber: "PROC-14",
  proppiNumber: "PROPPI-14",
  links: [],
} as any;

function setup(roles: string[], leaderId: number | null = 99) {
  const user = userEvent.setup();
  mocks.auth.user = { id: 7, name: "Lia", roles };
  mocks.getById.mockResolvedValue({ project: { ...project, leaderId } });
  mocks.getMembers.mockResolvedValue({ members: [{ id: 1, projectId: 14, userId: 7, userName: "Lia", roles: ["PESQUISADOR"], situacao: "ATIVO" }] });
  render(<ProjectDetailPage />);
  return user;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.loading = false;
  mocks.task.tasks = [];
  mocks.users = [{ id: 9, name: "Coordenação" }, { id: 7, name: "Lia" }];
});

describe("project detail route", () => {
  it("loads the project and member list once and exposes the five reference tabs", async () => {
    setup(["COORDENADOR"]);
    expect(await screen.findByRole("heading", { name: "Pesquisa em IA" })).toBeVisible();
    for (const name of ["Visão geral", "Tarefas", "Membros", "Arquivos", "Configurações"]) {
      expect(screen.getByRole("tab", { name })).toBeVisible();
    }
    expect(screen.getByText("Descrição")).toBeVisible();
    expect(screen.getByText("Dados do projeto")).toBeVisible();
    expect(screen.getByText("Informações do Projeto")).toBeVisible();
    await waitFor(() => {
      expect(mocks.getById).toHaveBeenCalledTimes(1);
      expect(mocks.getMembers).toHaveBeenCalledTimes(1);
    });
  });

  it("preserves task and file access for the same roles as the dialog", async () => {
    const user = setup(["PESQUISADOR"], 7);
    expect(await screen.findByRole("heading", { name: "Pesquisa em IA" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Editar" })).not.toBeInTheDocument();
    expect(screen.getByTestId("media-header")).toHaveAttribute("data-can-manage", "true");
    await user.click(screen.getByRole("tab", { name: "Tarefas" }));
    expect(screen.getByRole("button", { name: "Criar Primeira Tarefa" })).toBeVisible();
    await user.click(screen.getByRole("tab", { name: "Arquivos" }));
    expect(screen.getByTestId("attachments")).toHaveAttribute("data-can-manage", "true");
    expect(screen.getByText("Relatórios do projeto")).toBeVisible();
    await user.click(screen.getByRole("tab", { name: "Configurações" }));
    expect(screen.getByText("Logs do líder")).toBeVisible();
  });

  it("hides management controls from a non-leader volunteer", async () => {
    const user = setup(["VOLUNTARIO"], 99);
    expect(await screen.findByRole("heading", { name: "Pesquisa em IA" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Editar" })).not.toBeInTheDocument();
    expect(screen.getByTestId("media-header")).toHaveAttribute("data-can-manage", "false");
    await user.click(screen.getByRole("tab", { name: "Tarefas" }));
    expect(screen.queryByRole("button", { name: "Criar Primeira Tarefa" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Membros" }));
    expect(screen.queryByText("Gestão de membros")).not.toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Arquivos" }));
    expect(screen.queryByText("Relatórios do projeto")).not.toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Configurações" }));
    expect(screen.queryByText("Logs do líder")).not.toBeInTheDocument();
  });
});
