// @vitest-environment node
/**
 * V5-5 (DEC-100/126/127/151) — o contrato HTTP do cronograma, com o MÓDULO REAL sobre portas
 * falsas (lição do B6-2a: um duplo que devolve o módulo inteiro faz a negação SUMIR do teste em
 * vez de falhar). Só sessão e banco são dobrados; gate, normalização e derivação são os de
 * produção.
 *
 * O que este arquivo congela na borda:
 *   1. A leitura é aberta (DEC-136/127): quem não gerencia vê o cronograma inteiro, com as colunas
 *      e os valores derivados.
 *   2. A escrita é a ACL do projeto, e o 403 chega ANTES do 400 do corpo inválido.
 *   3. Recompensa e período saem derivados, e o corpo que tenta mandar recompensa é ignorado —
 *      o número é calculado, não aceito (DEC-103).
 *   4. O wizard: `POST /api/projects` com `cronograma` cria as linhas; sem ele, nada muda.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { createProjectManagementModule } from "@/backend/modules/project-management";
import type {
  NewProjectCronogramaSeed,
  NewProjectInput,
  ProjectRecord,
  ProjectRepositoryPort,
} from "@/backend/modules/project-management/application/ports/project.repository";
import type {
  NewProjectActivityInput,
  NewProjectGoalInput,
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
  actorMembershipRoles: null as string[] | null,
  memberIds: new Set<number>([4, 7]),
  goals: new Map<number, ProjectGoalRecord>(),
  activities: new Map<number, ProjectActivityRecord>(),
  created: [] as Array<{ goals: number; activities: number }>,
  nextId: 100,
}));

function projectRow(overrides: Partial<ProjectRecord> = {}): ProjectRecord {
  return {
    id: PROJECT,
    name: "Display Quest",
    description: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    createdBy: 4,
    leaderId: 7,
    status: "active",
    links: null,
    startDate: "2026-03-01",
    endDate: "2026-08-31",
    editalNumber: null,
    processNumber: null,
    proppiNumber: null,
    points: 0,
    logoKey: null,
    bannerKey: null,
    ...overrides,
  };
}

function goalRow(id: number, overrides: Partial<ProjectGoalRecord> = {}): ProjectGoalRecord {
  return {
    id,
    projectId: PROJECT,
    order: id,
    target: null,
    description: "Revisar a literatura",
    createdAt: "2026-03-01T00:00:00.000Z",
    ...overrides,
  };
}

function activityRow(id: number, overrides: Partial<ProjectActivityRecord> = {}): ProjectActivityRecord {
  return {
    id,
    projectId: PROJECT,
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
  // Nada é avaliado aqui: o factory roda antes do corpo do arquivo (hoisting), e chamar
  // `projectRow()` neste momento cai em TDZ. As funções só executam quando a rota chama.
  const projectsPort: ProjectRepositoryPort = {
    async findAll() {
      return [projectRow()];
    },
    findByLeaderId: notUsed("projects.findByLeaderId"),
    async findById(id: number) {
      return id === PROJECT ? projectRow() : null;
    },
    async create(input: NewProjectInput) {
      mocks.created.push({ goals: 0, activities: 0 });
      return { ...projectRow(), ...input, id: 55, points: 0 };
    },
    async createWithCronograma(input: NewProjectInput, seed: NewProjectCronogramaSeed) {
      mocks.created.push({ goals: seed.goals.length, activities: seed.activities.length });
      for (const goal of seed.goals) {
        const id = mocks.nextId++;
        mocks.goals.set(id, goalRow(id, { projectId: 55, ...goal }));
      }
      for (const activity of seed.activities) {
        const id = mocks.nextId++;
        mocks.activities.set(id, activityRow(id, { projectId: 55, ...activity }));
      }
      return { project: { ...projectRow(), ...input, id: 55, points: 0 }, goalIds: [], activityIds: [] };
    },
    update: notUsed("projects.update"),
    delete: notUsed("projects.delete"),
  };

  const memberships: ProjectManagementMembershipPort = {
    async findMembership(projectId: number, userId: number) {
      if (projectId !== PROJECT) return null;
      if (userId === 4) {
        return mocks.actorMembershipRoles === null ? null : { id: 99, roles: mocks.actorMembershipRoles as never };
      }
      return mocks.memberIds.has(userId) ? { id: 98, roles: ["VOLUNTARIO"] as never } : null;
    },
    async createMembership() {},
    updateMembershipRoles: notUsed("memberships.updateMembershipRoles"),
    listMembersWithUser: notUsed("memberships.listMembersWithUser"),
  };

  const actors: ProjectActorsPort = {
    async findActor(userId: number) {
      return userId === 4 ? { id: userId, roles: ["COORDENADOR"] as never } : null;
    },
  };

  const cronograma: ProjectCronogramaPort = {
    async listGoals(projectId: number) {
      return [...mocks.goals.values()].filter((row) => row.projectId === projectId).map((row) => ({ ...row }));
    },
    async findGoalById(id: number) {
      const row = mocks.goals.get(id);
      return row ? { ...row } : null;
    },
    async createGoal(input: NewProjectGoalInput) {
      const id = mocks.nextId++;
      const row = goalRow(id, { ...input, id });
      mocks.goals.set(id, row);
      return { ...row };
    },
    async updateGoal(id: number, fields: ProjectGoalUpdateFields) {
      const current = mocks.goals.get(id);
      if (!current) throw new Error("meta ausente no duplo");
      const next = { ...current, ...fields };
      mocks.goals.set(id, next);
      return { ...next };
    },
    async deleteGoal(id: number) {
      mocks.goals.delete(id);
    },
    async listActivities(projectId: number) {
      return [...mocks.activities.values()]
        .filter((row) => row.projectId === projectId)
        .map((row) => ({ ...row }));
    },
    async findActivityById(id: number) {
      const row = mocks.activities.get(id);
      return row ? { ...row } : null;
    },
    async createActivity(input: NewProjectActivityInput) {
      const id = mocks.nextId++;
      const row = activityRow(id, { ...input, id });
      mocks.activities.set(id, row);
      return { ...row };
    },
    async updateActivity(id: number, fields: ProjectActivityUpdateFields) {
      const current = mocks.activities.get(id);
      if (!current) throw new Error("atividade ausente no duplo");
      const next = { ...current, ...fields };
      mocks.activities.set(id, next);
      return { ...next };
    },
    async deleteActivity(id: number) {
      mocks.activities.delete(id);
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

import { GET as readCronograma } from "@/app/api/projects/[id]/cronograma/route";
import { POST as createGoal } from "@/app/api/projects/[id]/goals/route";
import { DELETE as deleteGoal, PATCH as patchGoal } from "@/app/api/projects/[id]/goals/[goalId]/route";
import { POST as createActivity } from "@/app/api/projects/[id]/activities/route";
import { DELETE as deleteActivity, PATCH as patchActivity } from "@/app/api/projects/[id]/activities/[activityId]/route";
import { POST as createProject } from "@/app/api/projects/route";

const params = <T extends Record<string, string>>(value: T) => ({ params: Promise.resolve(value) });

const coordinator = { id: 4, email: "coord@lab.com", name: "Coordenador", roles: ["COORDENADOR"], status: "active" };
const volunteer = { id: 4, email: "ana@lab.com", name: "Ana", roles: ["VOLUNTARIO"], status: "active" };

function request(method: string, path: string, body?: Record<string, unknown>) {
  return new NextRequest(`http://localhost:3001${path}`, { method, body: body ? JSON.stringify(body) : undefined });
}

beforeEach(() => {
  mocks.session = coordinator;
  mocks.actorMembershipRoles = null;
  mocks.memberIds = new Set([4, 7]);
  mocks.nextId = 100;
  mocks.created = [];
  mocks.goals = new Map([
    [20, goalRow(20, { order: 1 })],
    [21, goalRow(21, { order: 2, target: 2, description: "Publicar artigo" })],
  ]);
  mocks.activities = new Map([
    [30, activityRow(30, { order: 1, firstMonth: "2026-04", lastMonth: "2026-06" })],
    [31, activityRow(31, { order: 2, firstMonth: "2026-07", lastMonth: "2026-08" })],
  ]);
});

describe("GET /api/projects/[id]/cronograma — a leitura da aba", () => {
  it("devolve colunas, metas e atividades com período e recompensa derivados", async () => {
    const response = await readCronograma(new Request("http://localhost:3001/api/projects/10/cronograma"), params({ id: "10" }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.cronograma.months).toEqual(["2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08"]);
    expect(body.cronograma.goals).toHaveLength(2);

    const activity = body.cronograma.activities[0];
    expect(activity.months).toEqual(["2026-04", "2026-05", "2026-06"]);
    expect(activity.periodoInicio).toBe("2026-04-01");
    expect(activity.periodoFim).toBe("2026-06-30");
    expect(activity.reward).toBe(300);
  });

  it("quem não gerencia o projeto lê o cronograma inteiro (leitura aberta, DEC-136)", async () => {
    mocks.session = volunteer;
    mocks.actorMembershipRoles = ["VOLUNTARIO"];

    const response = await readCronograma(new Request("http://localhost:3001/api/projects/10/cronograma"), params({ id: "10" }));

    expect(response.status).toBe(200);
    expect((await response.json()).cronograma.activities).toHaveLength(2);
  });

  it("id que não é id -> 400 da rota; projeto inexistente -> 404 do use case", async () => {
    const invalid = await readCronograma(new Request("http://localhost:3001/api/projects/abc/cronograma"), params({ id: "abc" }));
    expect(invalid.status).toBe(400);
    expect((await invalid.json()).error).toBe("Projeto inválido");

    const missing = await readCronograma(new Request("http://localhost:3001/api/projects/999/cronograma"), params({ id: "999" }));
    expect(missing.status).toBe(404);
  });

  it("sem sessão -> 401", async () => {
    mocks.session = null;

    const response = await readCronograma(new Request("http://localhost:3001/api/projects/10/cronograma"), params({ id: "10" }));

    expect(response.status).toBe(401);
  });
});

describe("POST /goals e PATCH/DELETE /goals/[goalId]", () => {
  it("cria a meta normalizada, com a ordem atribuída pelo servidor", async () => {
    const response = await createGoal(
      request("POST", "/api/projects/10/goals", { description: "  Implantar no laboratório  ", target: "3" }),
      params({ id: "10" }),
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.goal).toMatchObject({ description: "Implantar no laboratório", target: 3, order: 3 });
  });

  it("o 403 da gestão chega antes do 400 do corpo inválido", async () => {
    mocks.session = volunteer;
    mocks.actorMembershipRoles = ["VOLUNTARIO"];

    const response = await createGoal(request("POST", "/api/projects/10/goals", { description: "" }), params({ id: "10" }));

    expect(response.status).toBe(403);
  });

  it("meta numérica inválida -> 400 com a mensagem da regra", async () => {
    const response = await createGoal(
      request("POST", "/api/projects/10/goals", { description: "Publicar", target: "muitas" }),
      params({ id: "10" }),
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("Meta numérica");
  });

  it("PATCH parcial não apaga o que o corpo não mandou", async () => {
    const response = await patchGoal(
      request("PATCH", "/api/projects/10/goals/21", { description: "Publicar artigo em periódico" }),
      params({ id: "10", goalId: "21" }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.goal.description).toBe("Publicar artigo em periódico");
    expect(body.goal.target).toBe(2);
  });

  it("meta de outro projeto é 404, e id inválido é 400", async () => {
    mocks.goals.set(22, goalRow(22, { projectId: 11 }));

    const foreign = await deleteGoal(
      new NextRequest("http://localhost:3001/api/projects/10/goals/22", { method: "DELETE" }),
      params({ id: "10", goalId: "22" }),
    );
    expect(foreign.status).toBe(404);

    const invalid = await patchGoal(
      request("PATCH", "/api/projects/10/goals/abc", { description: "x" }),
      params({ id: "10", goalId: "abc" }),
    );
    expect(invalid.status).toBe(400);
  });

  it("DELETE apaga a meta", async () => {
    const response = await deleteGoal(
      new NextRequest("http://localhost:3001/api/projects/10/goals/20", { method: "DELETE" }),
      params({ id: "10", goalId: "20" }),
    );

    expect(response.status).toBe(200);
    expect((await response.json()).deleted).toBe(true);
    expect(mocks.goals.has(20)).toBe(false);
  });
});

describe("POST /activities e PATCH/DELETE /activities/[activityId]", () => {
  it("cria a linha marcada na grade", async () => {
    const response = await createActivity(
      request("POST", "/api/projects/10/activities", {
        description: "Implantação",
        firstMonth: "2026-09",
        lastMonth: "2026-10",
        responsibleId: 7,
      }),
      params({ id: "10" }),
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.activity).toMatchObject({
      description: "Implantação",
      firstMonth: "2026-09",
      lastMonth: "2026-10",
      responsibleId: 7,
      order: 3,
      status: "OPEN",
    });
  });

  it("intervalo invertido -> 400 nomeado; mês fora do formato -> 400", async () => {
    const inverted = await createActivity(
      request("POST", "/api/projects/10/activities", { description: "X", firstMonth: "2026-10", lastMonth: "2026-09" }),
      params({ id: "10" }),
    );
    expect(inverted.status).toBe(400);
    expect((await inverted.json()).error).toContain("não pode terminar antes de começar");

    const malformed = await createActivity(
      request("POST", "/api/projects/10/activities", { description: "X", firstMonth: "10/2026", lastMonth: "2026-11" }),
      params({ id: "10" }),
    );
    expect(malformed.status).toBe(400);
    expect((await malformed.json()).error).toContain("AAAA-MM");
  });

  it("responsável que não participa do projeto -> 400 da regra", async () => {
    const response = await createActivity(
      request("POST", "/api/projects/10/activities", {
        description: "Implantação",
        firstMonth: "2026-09",
        lastMonth: "2026-10",
        responsibleId: 999,
      }),
      params({ id: "10" }),
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("precisa participar do projeto");
  });

  it("recompensa enviada pelo corpo é ignorada: o número é calculado (DEC-103)", async () => {
    const response = await createActivity(
      request("POST", "/api/projects/10/activities", {
        description: "Implantação",
        firstMonth: "2026-09",
        lastMonth: "2026-10",
        reward: 999999,
      }),
      params({ id: "10" }),
    );

    expect(response.status).toBe(201);
    const read = await readCronograma(new Request("http://localhost:3001/api/projects/10/cronograma"), params({ id: "10" }));
    const created = (await read.json()).cronograma.activities.find((row: { description: string }) => row.description === "Implantação");
    expect(created.reward).toBe(200);
  });

  it("PATCH estende o fim mandando só `lastMonth`", async () => {
    const response = await patchActivity(
      request("PATCH", "/api/projects/10/activities/30", { lastMonth: "2026-07" }),
      params({ id: "10", activityId: "30" }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.activity.firstMonth).toBe("2026-04");
    expect(body.activity.lastMonth).toBe("2026-07");
  });

  it("PATCH não escreve status (DEC-76: as duas fases têm caminho próprio)", async () => {
    const response = await patchActivity(
      request("PATCH", "/api/projects/10/activities/30", { status: "DONE" }),
      params({ id: "10", activityId: "30" }),
    );

    expect(response.status).toBe(200);
    expect((await response.json()).activity.status).toBe("OPEN");
  });

  it("DELETE apaga a linha do cronograma", async () => {
    const response = await deleteActivity(
      new NextRequest("http://localhost:3001/api/projects/10/activities/31", { method: "DELETE" }),
      params({ id: "10", activityId: "31" }),
    );

    expect(response.status).toBe(200);
    expect(mocks.activities.has(31)).toBe(false);
  });
});

describe("POST /api/projects — o passo opcional do wizard (DEC-100)", () => {
  it("sem cronograma, a criação é a de antes", async () => {
    const response = await createProject(
      request("POST", "/api/projects", { name: "Novo projeto", status: "active" }),
    );

    expect(response.status).toBe(201);
    expect(mocks.created).toEqual([{ goals: 0, activities: 0 }]);
  });

  it("com cronograma, metas e atividades nascem junto do projeto", async () => {
    const response = await createProject(
      request("POST", "/api/projects", {
        name: "Novo projeto",
        status: "active",
        leaderId: 7,
        volunteerIds: [7],
        startDate: "2026-03-01",
        endDate: "2026-08-31",
        cronograma: {
          goals: [{ description: "Revisar a literatura" }],
          activities: [{ description: "Codificação", firstMonth: "2026-03", lastMonth: "2026-08", responsibleId: 7 }],
        },
      }),
    );

    expect(response.status).toBe(201);
    expect(mocks.created).toEqual([{ goals: 1, activities: 1 }]);

    const activity = [...mocks.activities.values()].find((row) => row.projectId === 55);
    expect(activity).toMatchObject({ firstMonth: "2026-03", lastMonth: "2026-08", responsibleId: 7, order: 1 });
  });

  it("linha de cronograma inválida não cria o projeto", async () => {
    const response = await createProject(
      request("POST", "/api/projects", {
        name: "Novo projeto",
        cronograma: { activities: [{ description: "X", firstMonth: "2026-08", lastMonth: "2026-03" }] },
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.created).toEqual([]);
  });
});
