// @vitest-environment node
/**
 * plan-v13 S04 — `GET /api/projects/cronograma`: a leitura agregada das atividades de
 * cronograma de TODOS os projetos (regra 7 do MODELO.md).
 *
 * O que este arquivo congela:
 *   1. A leitura é aberta ao autenticado (DEC-136): sem filtro de membership, sem gate.
 *   2. A resposta traz as linhas de todos os projetos, com os campos que a tela dos gráficos
 *      consome: id, projectId, order, status, firstMonth, lastMonth. Nada de regra derivada
 *      na rota — a janela e o recorte são da tela (S05).
 *   3. Sem sessão -> 401.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createProjectManagementModule } from "@/backend/modules/project-management";
import type {
  ActivityRequestFields,
  NewProjectActivityInput,
  NewProjectGoalInput,
  ProjectActivityRecord,
  ProjectActivityUpdateFields,
  ProjectCronogramaPort,
  ProjectGoalRecord,
  ProjectGoalUpdateFields,
} from "@/backend/modules/project-management/application/ports/project-cronograma.repository";
import type { ProjectRepositoryPort } from "@/backend/modules/project-management/application/ports/project.repository";
import type { ProjectActorsPort } from "@/backend/modules/project-management/application/ports/project-actors.port";
import type { ProjectAttachmentsPort } from "@/backend/modules/project-management/application/ports/project-attachments.repository";
import type { ProjectDeliverablesPort } from "@/backend/modules/project-management/application/ports/project-deliverables.repository";
import type { ProjectHoursPort } from "@/backend/modules/project-management/application/ports/project-hours.port";
import type { ProjectManagementMembershipPort } from "@/backend/modules/project-management/application/ports/project-membership.repository";

type Session = { id: number; email: string; name: string; roles: string[]; status: string };

const mocks = vi.hoisted(() => ({
  session: null as null | Session,
}));

function activityRow(id: number, projectId: number, overrides: Partial<ProjectActivityRecord> = {}): ProjectActivityRecord {
  return {
    id,
    projectId,
    order: id,
    description: "Codificação",
    responsibleId: null,
    firstMonth: "2026-04",
    lastMonth: "2026-06",
    status: "OPEN",
    requestedBy: null,
    requestedAt: null,
    approvedBy: null,
    approvedAt: null,
    overdueNotifiedAt: null,
    createdAt: "2026-03-01T00:00:00.000Z",
    updatedAt: "2026-03-01T00:00:00.000Z",
    ...overrides,
  };
}

function notUsed(name: string) {
  return async () => {
    throw new Error(`porta não deveria ser exercitada por este arquivo: ${name}`);
  };
}

vi.mock("@/backend/composition/root", () => {
  const projects: ProjectRepositoryPort = {
    findAll: notUsed("projects.findAll"),
    findByLeaderId: notUsed("projects.findByLeaderId"),
    findById: notUsed("projects.findById"),
    create: notUsed("projects.create"),
    createWithCronograma: notUsed("projects.createWithCronograma"),
    update: notUsed("projects.update"),
    delete: notUsed("projects.delete"),
    incrementPoints: notUsed("projects.incrementPoints"),
  };

  const memberships: ProjectManagementMembershipPort = {
    findMembership: notUsed("memberships.findMembership"),
    createMembership: notUsed("memberships.createMembership"),
    updateMembershipRoles: notUsed("memberships.updateMembershipRoles"),
    listMembersWithUser: notUsed("memberships.listMembersWithUser"),
    listActiveMemberUserIds: notUsed("memberships.listActiveMemberUserIds"),
  };

  const actors: ProjectActorsPort = {
    async findActor(userId: number) {
      return userId === 4 ? { id: userId, roles: ["VOLUNTARIO"] as never } : null;
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
    async listAllActivities() {
      return [
        activityRow(30, 10),
        activityRow(31, 10, { status: "COMPLETION_REQUESTED" }),
        activityRow(32, 11, { firstMonth: "2026-01", lastMonth: "2026-02", status: "DONE" }),
      ];
    },
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
        ports: { projects, memberships, actors, hours, deliverables, attachments, cronograma },
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

import { GET } from "@/app/api/projects/cronograma/route";

const volunteer: Session = { id: 4, email: "ana@lab.com", name: "Ana", roles: ["VOLUNTARIO"], status: "active" };

beforeEach(() => {
  mocks.session = volunteer;
});

describe("GET /api/projects/cronograma — a leitura agregada", () => {
  it("devolve as linhas de todos os projetos ao autenticado, sem gate de gestão", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.activities.map((row: { projectId: number }) => row.projectId)).toEqual([10, 10, 11]);
    const first = body.activities[0];
    expect(Object.keys(first).sort()).toEqual(["firstMonth", "id", "lastMonth", "order", "projectId", "status"]);
    expect(first.status).toBe("OPEN");
    expect(body.activities[1].status).toBe("COMPLETION_REQUESTED");
    expect(body.activities[2].status).toBe("DONE");
  });

  it("sem sessão -> 401", async () => {
    mocks.session = null;

    const response = await GET();
    expect(response.status).toBe(401);
  });
});
