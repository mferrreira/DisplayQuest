// @vitest-environment node
/**
 * plan-v13 S01 — `projects.subtitle` na borda HTTP (regras 1 do MODELO.md).
 *
 * O que este arquivo congela:
 *   1. `POST /api/projects` aceita `subtitle` aparado, e string vazia vira `null` — a criação
 *      com subtítulo vazio é a criação de antes.
 *   2. `PUT /api/projects/[id]` escreve o subtítulo pelo mesmo caminho de `name`, pelo corpo,
 *      pela mesma autorização de gestão do projeto.
 *   3. Teto de 200 caracteres, recusado com a mensagem nomeando o campo, nos dois caminhos.
 *
 * Padrão B6-2a: módulo REAL sobre portas falsas. Só sessão entra como duplo. O gate, a
 * normalização e a validação são os de produção.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { createProjectManagementModule } from "@/backend/modules/project-management";
import type {
  NewProjectInput,
  ProjectRecord,
  ProjectRepositoryPort,
} from "@/backend/modules/project-management/application/ports/project.repository";
import type {
  NewProjectActivityInput,
  NewProjectGoalInput,
  ActivityRequestFields,
  ProjectActivityRecord,
  ProjectActivityUpdateFields,
  ProjectCronogramaPort,
  ProjectGoalRecord,
  ProjectGoalUpdateFields,
} from "@/backend/modules/project-management/application/ports/project-cronograma.repository";
import type { ProjectActorsPort } from "@/backend/modules/project-management/application/ports/project-actors.port";
import type { ProjectAttachmentsPort } from "@/backend/modules/project-management/application/ports/project-attachments.repository";
import type { ProjectDeliverablesPort } from "@/backend/modules/project-management/application/ports/project-deliverables.repository";
import type { ProjectHoursPort } from "@/backend/modules/project-management/application/ports/project-hours.port";
import type { ProjectManagementMembershipPort } from "@/backend/modules/project-management/application/ports/project-membership.repository";

type Session = { id: number; email: string; name: string; roles: string[]; status: string };

const PROJECT = 10;

const mocks = vi.hoisted(() => ({
  session: null as null | Session,
  createdInput: null as null | NewProjectInput,
  updatedRecord: null as null | ProjectRecord,
}));

function projectRow(overrides: Partial<ProjectRecord> = {}): ProjectRecord {
  return {
    id: PROJECT,
    name: "Display Quest",
    description: null,
    subtitle: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    createdBy: 4,
    leaderId: 7,
    status: "active",
    links: null,
    startDate: null,
    endDate: null,
    editalNumber: null,
    processNumber: null,
    proppiNumber: null,
    points: 0,
    logoKey: null,
    bannerKey: null,
    ...overrides,
  };
}

function notUsed(name: string) {
  return async () => {
    throw new Error(`porta não deveria ser exercitada por este arquivo: ${name}`);
  };
}

vi.mock("@/backend/composition/root", () => {
  // Nada é avaliado aqui (hoisting/TDZ). As funções só executam quando a rota chama.
  const projectsPort: ProjectRepositoryPort = {
    findAll: notUsed("projects.findAll"),
    findByLeaderId: notUsed("projects.findByLeaderId"),
    async findById(id: number) {
      return id === PROJECT ? projectRow() : null;
    },
    async create(input: NewProjectInput) {
      mocks.createdInput = input;
      return { ...projectRow(), ...input, id: 55, points: 0 };
    },
    createWithCronograma: notUsed("projects.createWithCronograma"),
    async update(record: ProjectRecord) {
      mocks.updatedRecord = record;
      return record;
    },
    delete: notUsed("projects.delete"),
    incrementPoints: notUsed("projects.incrementPoints"),
  };

  const memberships: ProjectManagementMembershipPort = {
    async findMembership(projectId: number, userId: number) {
      if (projectId !== PROJECT) return null;
      return userId === 4 ? { id: 99, roles: ["GERENTE_PROJETO"] as never } : null;
    },
    async findActiveMembership() { return null },
    async createMembership() {},
    updateMembershipRoles: notUsed("memberships.updateMembershipRoles"),
    listMembersWithUser: notUsed("memberships.listMembersWithUser"),
    listActiveMemberUserIds: notUsed("memberships.listActiveMemberUserIds"),
  };

  const actors: ProjectActorsPort = {
    async findActor(userId: number) {
      return userId === 4 ? { id: userId, roles: ["COORDENADOR"] as never } : null;
    },
  };

  const cronograma: ProjectCronogramaPort = {
    listGoals: notUsed("cronograma.listGoals"),
    findGoalById: notUsed("cronograma.findGoalById"),
    createGoal: notUsed("cronograma.createGoal"),
    updateGoal: notUsed("cronograma.updateGoal"),
    deleteGoal: notUsed("cronograma.deleteGoal"),
    listActivities: notUsed("cronograma.listActivities"),
    findActivityById: notUsed("cronograma.findActivityById"),
    createActivity: notUsed("cronograma.createActivity"),
    updateActivity: notUsed("cronograma.updateActivity"),
    requestActivity: notUsed("cronograma.requestActivity"),
    deleteActivity: notUsed("cronograma.deleteActivity"),
    approveActivity: notUsed("cronograma.approveActivity"),
    listAllActivities: notUsed("cronograma.listAllActivities"),
  };

  const hours: ProjectHoursPort = { sumCompletedSeconds: notUsed("hours.sumCompletedSeconds") };
  const deliverables: ProjectDeliverablesPort = {
    listByProjectId: notUsed("deliverables.listByProjectId"),
    findById: notUsed("deliverables.findById"),
    create: notUsed("deliverables.create"),
    update: notUsed("deliverables.update"),
    delete: notUsed("deliverables.delete"),
  };
  const attachments: ProjectAttachmentsPort = {
    listByProjectId: notUsed("attachments.listByProjectId"),
    findById: notUsed("attachments.findById"),
    create: notUsed("attachments.create"),
    delete: notUsed("attachments.delete"),
  };

  return {
    getBackendComposition: () => ({
      projectManagement: createProjectManagementModule({
        ports: { projects: projectsPort, memberships, actors, hours, deliverables, attachments, cronograma },
      }),
    }),
  };
});

vi.mock("@/lib/auth/server-auth", () => ({
  requireAuth: async () =>
    mocks.session === null
      ? {
          user: null,
          error: new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401 }),
        }
      : { user: mocks.session },
}));

import { POST as createProjectRoute } from "@/app/api/projects/route";
import { PUT as updateProjectRoute } from "@/app/api/projects/[id]/route";

const params = <T extends Record<string, string>>(value: T) => ({ params: Promise.resolve(value) });

const coordinator: Session = { id: 4, email: "coord@lab.com", name: "Coordenador", roles: ["COORDENADOR"], status: "active" };

function request(method: string, path: string, body?: Record<string, unknown>) {
  return new NextRequest(`http://localhost:3001${path}`, { method, body: body ? JSON.stringify(body) : undefined });
}

const tooLong = "x".repeat(201);

beforeEach(() => {
  mocks.session = coordinator;
  mocks.createdInput = null;
  mocks.updatedRecord = null;
});

describe("POST /api/projects — subtítulo na criação", () => {
  it("grava o subtítulo aparado no registro criado", async () => {
    const response = await createProjectRoute(request("POST", "/api/projects", {
      name: "Pesquisa em IA",
      subtitle: "  estudo de IA aplicada  ",
    }));

    expect(response.status).toBe(201);
    expect(mocks.createdInput!.subtitle).toBe("estudo de IA aplicada");
  });

  it("subtítulo vazio vira null — a criação sem subtítulo é a criação de antes", async () => {
    const response = await createProjectRoute(request("POST", "/api/projects", {
      name: "Pesquisa em IA",
      subtitle: "   ",
    }));

    expect(response.status).toBe(201);
    expect(mocks.createdInput!.subtitle).toBeNull();
  });

  it("subtítulo acima do teto de 200 é recusado nomeando o campo", async () => {
    const response = await createProjectRoute(request("POST", "/api/projects", {
      name: "Pesquisa em IA",
      subtitle: tooLong,
    }));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("Subtítulo do projeto não pode ter mais de 200 caracteres");
    expect(mocks.createdInput).toBeNull();
  });
});

describe("PUT /api/projects/[id] — subtítulo na edição", () => {
  it("escreve o subtítulo pelo MESMO caminho dos campos de cadastro", async () => {
    const response = await updateProjectRoute(request("PUT", "/api/projects/10", {
      subtitle: "novo subtítulo",
    }), params({ id: "10" }));

    expect(response.status).toBe(200);
    expect(mocks.updatedRecord!.subtitle).toBe("novo subtítulo");
    // A garantia de "nada é gravado a meias": o corpo que só fala de subtítulo não toca `name`.
    expect(mocks.updatedRecord!.name).toBe("Display Quest");
  });

  it("subtítulo acima do teto de 200 é recusado, e a escrita não roda", async () => {
    const response = await updateProjectRoute(request("PUT", "/api/projects/10", {
      subtitle: tooLong,
    }), params({ id: "10" }));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("Subtítulo do projeto não pode ter mais de 200 caracteres");
    expect(mocks.updatedRecord).toBeNull();
  });
});
