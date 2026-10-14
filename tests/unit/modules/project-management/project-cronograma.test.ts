/**
 * V5-5 (DEC-100/126/127/151) — os use cases do cronograma sobre portas falsas.
 *
 * O que este arquivo prova é o que a rota não pode provar sozinha: a ORDEM das decisões
 * (404 do projeto, depois 403 da gestão, depois 400 do corpo), o corpo parcial que não apaga o
 * que não foi mandado, e a garantia do wizard de que linha inválida não deixa projeto nascido.
 *
 * Os duplos devolvem CÓPIA na leitura (medido no V5-3 e no V5-4a: devolver o objeto vivo faz a
 * falha do update parecer sucesso) e registram o que foi escrito, porque "nada foi gravado" é
 * asserção deste arquivo, não detalhe.
 */
import { beforeEach, describe, expect, it } from "vitest";

import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
  userActor,
} from "@/backend/domain";
import type {
  NewProjectInput,
  NewProjectCronogramaSeed,
  ProjectRecord,
  ProjectRepositoryPort,
} from "@/backend/modules/project-management/application/ports/project.repository";
import type {
  NewProjectActivityInput,
  NewProjectGoalInput,
  ProjectActivityRecord,
  ProjectCronogramaPort,
  ProjectGoalRecord,
} from "@/backend/modules/project-management/application/ports/project-cronograma.repository";
import type { ProjectManagementMembershipPort } from "@/backend/modules/project-management/application/ports/project-membership.repository";
import type { ProjectActorsPort } from "@/backend/modules/project-management/application/ports/project-actors.port";
import { CreateProjectUseCase } from "@/backend/modules/project-management/application/use-cases/create-project.use-case";
import { ListProjectCronogramaUseCase } from "@/backend/modules/project-management/application/use-cases/list-project-cronograma.use-case";
import { CreateProjectGoalUseCase } from "@/backend/modules/project-management/application/use-cases/create-project-goal.use-case";
import { UpdateProjectGoalUseCase } from "@/backend/modules/project-management/application/use-cases/update-project-goal.use-case";
import { DeleteProjectGoalUseCase } from "@/backend/modules/project-management/application/use-cases/delete-project-goal.use-case";
import { CreateProjectActivityUseCase } from "@/backend/modules/project-management/application/use-cases/create-project-activity.use-case";
import { UpdateProjectActivityUseCase } from "@/backend/modules/project-management/application/use-cases/update-project-activity.use-case";
import { DeleteProjectActivityUseCase } from "@/backend/modules/project-management/application/use-cases/delete-project-activity.use-case";

const PROJECT = 10;
const ACTOR = 4;

function projectRow(overrides: Partial<ProjectRecord> = {}): ProjectRecord {
  return {
    id: PROJECT,
    name: "Display Quest",
    description: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    createdBy: ACTOR,
    leaderId: null,
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

class Fakes {
  projects = new Map<number, ProjectRecord>([[PROJECT, projectRow()]]);
  goals = new Map<number, ProjectGoalRecord>();
  activities = new Map<number, ProjectActivityRecord>();
  /** Papéis da membership do ator no projeto; `null` é "sem membership" (a ACL global decide). */
  actorMembershipRoles: string[] | null = null;
  memberIds = new Set<number>([ACTOR, 7]);
  goalWrites: Array<{ id?: number; input?: NewProjectGoalInput; fields?: Record<string, unknown> }> = [];
  activityWrites: Array<{ id?: number; input?: NewProjectActivityInput; fields?: Record<string, unknown> }> = [];
  deletes: string[] = [];
  simpleCreateCalls = 0;
  wizardCalls: Array<{ input: NewProjectInput; seed: NewProjectCronogramaSeed }> = [];
  membershipCalls: Array<{ userId: number; roles: string[] }> = [];
  nextId = 100;

  projectPort(): ProjectRepositoryPort {
    const self = this;
    return {
      async findAll() {
        return [...self.projects.values()].map((row) => ({ ...row }));
      },
      async findByLeaderId() {
        return [];
      },
      async findById(id) {
        const row = self.projects.get(id);
        return row ? { ...row } : null;
      },
      async create(input) {
        self.simpleCreateCalls += 1;
        const id = self.nextId++;
        const row = projectRow({ ...input, id, points: 0 });
        self.projects.set(id, row);
        return { ...row };
      },
      async createWithCronograma(input, seed) {
        self.wizardCalls.push({ input, seed });
        const id = self.nextId++;
        const goalIds = seed.goals.map((goal) => {
          const goalId = self.nextId++;
          self.goals.set(goalId, goalRow(goalId, { projectId: id, ...goal }));
          return goalId;
        });
        const activityIds = seed.activities.map((activity) => {
          const activityId = self.nextId++;
          self.activities.set(activityId, activityRow(activityId, { projectId: id, ...activity }));
          return activityId;
        });
        const row = projectRow({ ...input, id, points: 0 });
        self.projects.set(id, row);
        return { project: { ...row }, goalIds, activityIds };
      },
      async update(record) {
        const next = { ...record };
        self.projects.set(next.id ?? -1, next);
        return { ...next };
      },
      async delete(id) {
        self.projects.delete(id);
      },
    };
  }

  cronogramaPort(): ProjectCronogramaPort {
    const self = this;
    return {
      async listGoals(projectId) {
        return [...self.goals.values()]
          .filter((row) => row.projectId === projectId)
          .map((row) => ({ ...row }));
      },
      async findGoalById(id) {
        const row = self.goals.get(id);
        return row ? { ...row } : null;
      },
      async createGoal(input) {
        self.goalWrites.push({ input });
        const id = self.nextId++;
        const row = goalRow(id, input);
        self.goals.set(id, row);
        return { ...row };
      },
      async updateGoal(id, fields) {
        self.goalWrites.push({ id, fields: { ...fields } });
        const current = self.goals.get(id);
        if (!current) throw new Error("meta ausente no duplo");
        const next = { ...current, ...fields };
        self.goals.set(id, next);
        return { ...next };
      },
      async deleteGoal(id) {
        self.deletes.push(`goal:${id}`);
        self.goals.delete(id);
      },
      async listActivities(projectId) {
        return [...self.activities.values()]
          .filter((row) => row.projectId === projectId)
          .map((row) => ({ ...row }));
      },
      async findActivityById(id) {
        const row = self.activities.get(id);
        return row ? { ...row } : null;
      },
      async createActivity(input) {
        self.activityWrites.push({ input });
        const id = self.nextId++;
        const row = activityRow(id, input);
        self.activities.set(id, row);
        return { ...row };
      },
      async updateActivity(id, fields) {
        self.activityWrites.push({ id, fields: { ...fields } });
        const current = self.activities.get(id);
        if (!current) throw new Error("atividade ausente no duplo");
        const next = { ...current, ...fields };
        self.activities.set(id, next);
        return { ...next };
      },
      async deleteActivity(id) {
        self.deletes.push(`activity:${id}`);
        self.activities.delete(id);
      },
    };
  }

  membershipPort(): ProjectManagementMembershipPort {
    const self = this;
    return {
      async findMembership(projectId, userId) {
        if (projectId !== PROJECT) return null;
        if (userId === ACTOR) {
          return self.actorMembershipRoles === null ? null : { id: 99, roles: self.actorMembershipRoles as never };
        }
        return self.memberIds.has(userId) ? { id: 98, roles: ["VOLUNTARIO"] as never } : null;
      },
      async createMembership(input) {
        self.membershipCalls.push({ userId: input.userId, roles: input.roles });
        self.memberIds.add(input.userId);
      },
      async updateMembershipRoles() {},
      async listMembersWithUser() {
        return [];
      },
    };
  }

  actorsPort(): ProjectActorsPort {
    return {
      async findActor(id) {
        // Sem membership: o ator do caso é COORDENADOR global, que gerencia pelo papel global.
        return id === ACTOR ? { id, roles: ["COORDENADOR"] as never } : null;
      },
    };
  }
}

let fakes: Fakes;

beforeEach(() => {
  fakes = new Fakes();
  fakes.goals.set(20, goalRow(20, { order: 1, description: "Revisar a literatura" }));
  fakes.goals.set(21, goalRow(21, { order: 2, target: 2, description: "Publicar artigo" }));
  fakes.activities.set(30, activityRow(30, { order: 1, firstMonth: "2026-04", lastMonth: "2026-06" }));
  fakes.activities.set(31, activityRow(31, { order: 2, firstMonth: "2026-07", lastMonth: "2026-08" }));
});

function cronogramaDeps() {
  return { projects: fakes.projectPort(), cronograma: fakes.cronogramaPort() };
}

function writeDeps() {
  return {
    projects: fakes.projectPort(),
    cronograma: fakes.cronogramaPort(),
    memberships: fakes.membershipPort(),
    actors: fakes.actorsPort(),
  };
}

describe("ListProjectCronogramaUseCase — a leitura que a aba consome", () => {
  it("projeto inexistente é 404", async () => {
    const useCase = new ListProjectCronogramaUseCase(cronogramaDeps());

    await expect(useCase.execute({ projectId: 999, today: "2026-10-14" })).rejects.toThrow(NotFoundError);
  });

  it("as colunas são o período do projeto e cada linha vem com período, recompensa e vigência", async () => {
    const useCase = new ListProjectCronogramaUseCase(cronogramaDeps());

    const result = await useCase.execute({ projectId: PROJECT, today: "2026-05-20" });

    expect(result.months).toEqual(["2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08"]);
    expect(result.goals.map((goal) => goal.id)).toEqual([20, 21]);

    const [first, second] = result.activities;
    expect(first.months).toEqual(["2026-04", "2026-05", "2026-06"]);
    expect(first.periodoInicio).toBe("2026-04-01");
    expect(first.periodoFim).toBe("2026-06-30");
    expect(first.reward).toBe(300);
    expect(first.current).toBe(true);

    expect(second.reward).toBe(200);
    expect(second.current).toBe(false);
  });

  it("o período derivado não é lido do banco: o record não tem essas colunas", async () => {
    const useCase = new ListProjectCronogramaUseCase(cronogramaDeps());

    const result = await useCase.execute({ projectId: PROJECT, today: "2026-10-14" });

    expect(Object.keys(result.activities[0])).not.toContain("periodo");
    expect(result.activities[0].firstMonth).toBe("2026-04");
  });
});

describe("metas — criar, editar parcial e apagar", () => {
  it("a ordem é atribuída pelo servidor: a próxima livre", async () => {
    const useCase = new CreateProjectGoalUseCase(writeDeps());

    const goal = await useCase.execute({
      projectId: PROJECT,
      actorId: ACTOR,
      description: "  Implantar no laboratório  ",
      target: "3",
    });

    expect(goal.order).toBe(3);
    expect(goal.description).toBe("Implantar no laboratório");
    expect(goal.target).toBe(3);
  });

  it("projeto inexistente é 404 antes de qualquer outra decisão", async () => {
    const useCase = new CreateProjectGoalUseCase(writeDeps());

    await expect(
      useCase.execute({ projectId: 999, actorId: ACTOR, description: "" }),
    ).rejects.toThrow(NotFoundError);
    expect(fakes.goalWrites).toEqual([]);
  });

  it("quem não gerencia o projeto recebe 403, e o 403 vem antes do 400 do corpo inválido", async () => {
    fakes.actorMembershipRoles = ["VOLUNTARIO"];
    const useCase = new CreateProjectGoalUseCase(writeDeps());

    await expect(
      useCase.execute({ projectId: PROJECT, actorId: ACTOR, description: "" }),
    ).rejects.toThrow(ForbiddenError);
    expect(fakes.goalWrites).toEqual([]);
  });

  it("meta numérica inválida é 400 nomeado, e nada é gravado", async () => {
    const useCase = new CreateProjectGoalUseCase(writeDeps());

    await expect(
      useCase.execute({ projectId: PROJECT, actorId: ACTOR, description: "Publicar", target: "muitas" }),
    ).rejects.toThrow(ValidationError);
    expect(fakes.goalWrites).toEqual([]);
  });

  it("PATCH parcial: chave ausente não apaga, e corpo vazio não grava nada", async () => {
    const useCase = new UpdateProjectGoalUseCase(writeDeps());

    const updated = await useCase.execute({
      projectId: PROJECT,
      goalId: 21,
      actorId: ACTOR,
      description: "Publicar artigo em periódico",
    });

    expect(updated.description).toBe("Publicar artigo em periódico");
    expect(updated.target).toBe(2);
    expect(fakes.goalWrites[0]?.fields).toEqual({ description: "Publicar artigo em periódico" });

    const untouched = await useCase.execute({ projectId: PROJECT, goalId: 21, actorId: ACTOR });
    expect(untouched.id).toBe(21);
    expect(fakes.goalWrites).toHaveLength(1);
  });

  it("`target: null` apaga o número; `target` ausente deixa como está — os dois são diferentes", async () => {
    const useCase = new UpdateProjectGoalUseCase(writeDeps());

    const cleared = await useCase.execute({
      projectId: PROJECT,
      goalId: 21,
      actorId: ACTOR,
      target: null,
    });

    expect(cleared.target).toBeNull();
    expect(cleared.description).toBe("Publicar artigo");
  });

  it("meta de outro projeto não é encontrada por id: apagar é escopado no projeto", async () => {
    fakes.goals.set(22, goalRow(22, { projectId: 11 }));
    const useCase = new DeleteProjectGoalUseCase(writeDeps());

    await expect(useCase.execute({ projectId: PROJECT, goalId: 22, actorId: ACTOR })).rejects.toThrow(
      NotFoundError,
    );
    expect(fakes.deletes).toEqual([]);
  });

  it("apagar a meta do projeto funciona", async () => {
    const useCase = new DeleteProjectGoalUseCase(writeDeps());

    const result = await useCase.execute({ projectId: PROJECT, goalId: 20, actorId: ACTOR });

    expect(result).toEqual({ deleted: true, goalId: 20 });
    expect(fakes.deletes).toEqual(["goal:20"]);
  });
});

describe("atividades — a linha da grade", () => {
  it("cria com a ordem livre e o intervalo marcado", async () => {
    const useCase = new CreateProjectActivityUseCase(writeDeps());

    const activity = await useCase.execute({
      projectId: PROJECT,
      actorId: ACTOR,
      description: "Implantação",
      firstMonth: "2026-09",
      lastMonth: "2026-10",
      responsibleId: "7",
    });

    expect(activity.order).toBe(3);
    expect(activity.firstMonth).toBe("2026-09");
    expect(activity.lastMonth).toBe("2026-10");
    expect(activity.responsibleId).toBe(7);
  });

  it("intervalo invertido é recusado antes de escrever", async () => {
    const useCase = new CreateProjectActivityUseCase(writeDeps());

    await expect(
      useCase.execute({
        projectId: PROJECT,
        actorId: ACTOR,
        description: "Implantação",
        firstMonth: "2026-10",
        lastMonth: "2026-09",
      }),
    ).rejects.toThrow("O cronograma da atividade não pode terminar antes de começar");
    expect(fakes.activityWrites).toEqual([]);
  });

  it("responsável precisa participar do projeto", async () => {
    const useCase = new CreateProjectActivityUseCase(writeDeps());

    await expect(
      useCase.execute({
        projectId: PROJECT,
        actorId: ACTOR,
        description: "Implantação",
        firstMonth: "2026-09",
        lastMonth: "2026-10",
        responsibleId: 999,
      }),
    ).rejects.toThrow("Responsável da atividade precisa participar do projeto");
    expect(fakes.activityWrites).toEqual([]);
  });

  it("sem gestão é 403, antes do 400 do corpo", async () => {
    fakes.actorMembershipRoles = ["VOLUNTARIO"];
    const useCase = new CreateProjectActivityUseCase(writeDeps());

    await expect(
      useCase.execute({
        projectId: PROJECT,
        actorId: ACTOR,
        description: "",
        firstMonth: "banana",
        lastMonth: "2026-10",
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it("PATCH de mês mescla com o gravado: estender o fim manda só `lastMonth`", async () => {
    const useCase = new UpdateProjectActivityUseCase(writeDeps());

    const updated = await useCase.execute({
      projectId: PROJECT,
      activityId: 30,
      actorId: ACTOR,
      lastMonth: "2026-07",
    });

    expect(updated.firstMonth).toBe("2026-04");
    expect(updated.lastMonth).toBe("2026-07");
    expect(fakes.activityWrites[0]?.fields).toEqual({ firstMonth: "2026-04", lastMonth: "2026-07" });
  });

  it("PATCH não escreve status: as duas fases do DEC-76 têm caminho próprio", async () => {
    const useCase = new UpdateProjectActivityUseCase(writeDeps());
    // O corpo chega como chega do mundo: com chave que a API não aceita.
    const body = { projectId: PROJECT, activityId: 30, actorId: ACTOR, status: "DONE" };

    const updated = await useCase.execute(body as Parameters<UpdateProjectActivityUseCase["execute"]>[0]);

    expect(updated.status).toBe("OPEN");
    expect(fakes.activityWrites).toEqual([]);
  });

  it("responsável pode ser removido com `null`, e mesclar mês inválido é recusado", async () => {
    fakes.activities.set(30, activityRow(30, { responsibleId: 7 }));
    const useCase = new UpdateProjectActivityUseCase(writeDeps());

    const cleared = await useCase.execute({
      projectId: PROJECT,
      activityId: 30,
      actorId: ACTOR,
      responsibleId: null,
    });
    expect(cleared.responsibleId).toBeNull();

    await expect(
      useCase.execute({ projectId: PROJECT, activityId: 30, actorId: ACTOR, firstMonth: "2027-01" }),
    ).rejects.toThrow("O cronograma da atividade não pode terminar antes de começar");
  });

  it("apagar a atividade não apaga nada mais", async () => {
    const useCase = new DeleteProjectActivityUseCase(writeDeps());

    const result = await useCase.execute({ projectId: PROJECT, activityId: 31, actorId: ACTOR });

    expect(result).toEqual({ deleted: true, activityId: 31 });
    expect(fakes.deletes).toEqual(["activity:31"]);
  });
});

describe("wizard da criação (DEC-100, regra 9) — o passo opcional", () => {
  function createCommand(extra: Record<string, unknown> = {}) {
    return {
      actor: userActor(ACTOR, ["COORDENADOR"]),
      actorId: ACTOR,
      data: {
        name: "Novo projeto",
        description: "",
        status: "active" as never,
        leaderId: 7,
        links: [],
        startDate: "2026-03-01",
        endDate: "2026-08-31",
      },
      volunteerIds: [8],
      ...extra,
    };
  }

  it("sem cronograma é exatamente a criação simples de antes", async () => {
    const useCase = new CreateProjectUseCase({
      projects: fakes.projectPort(),
      memberships: fakes.membershipPort(),
    });

    const project = await useCase.execute(createCommand());

    expect(project.id).toBeTruthy();
    expect(fakes.simpleCreateCalls).toBe(1);
    expect(fakes.wizardCalls).toEqual([]);
  });

  it("cronograma vazio é o mesmo que pular o passo", async () => {
    const useCase = new CreateProjectUseCase({
      projects: fakes.projectPort(),
      memberships: fakes.membershipPort(),
    });

    await useCase.execute(createCommand({ cronograma: { goals: [], activities: [] } }));

    expect(fakes.simpleCreateCalls).toBe(1);
    expect(fakes.wizardCalls).toEqual([]);
  });

  it("com cronograma, a escrita é uma só e a ordem é atribuída na ordem das linhas", async () => {
    const useCase = new CreateProjectUseCase({
      projects: fakes.projectPort(),
      memberships: fakes.membershipPort(),
    });

    await useCase.execute(
      createCommand({
        cronograma: {
          goals: [{ description: "Revisar a literatura" }, { description: "Publicar artigo", target: "2" }],
          activities: [
            { description: "Revisão", firstMonth: "2026-03", lastMonth: "2026-04" },
            { description: "Codificação", firstMonth: "2026-05", lastMonth: "2026-08", responsibleId: 8 },
          ],
        },
      }),
    );

    expect(fakes.simpleCreateCalls).toBe(0);
    expect(fakes.wizardCalls).toHaveLength(1);

    const seed = fakes.wizardCalls[0].seed;
    expect(seed.goals.map((goal) => goal.order)).toEqual([1, 2]);
    expect(seed.activities.map((activity) => activity.order)).toEqual([1, 2]);
    // O voluntário do passo de equipe pode ser responsável: a participação está nascendo junto.
    expect(seed.activities[1].responsibleId).toBe(8);
  }, 10000);

  it("linha inválida não deixa projeto nascido: nada é escrito", async () => {
    const useCase = new CreateProjectUseCase({
      projects: fakes.projectPort(),
      memberships: fakes.membershipPort(),
    });

    await expect(
      useCase.execute(
        createCommand({
          cronograma: { activities: [{ description: "Codificação", firstMonth: "2026-08", lastMonth: "2026-03" }] },
        }),
      ),
    ).rejects.toThrow("O cronograma da atividade não pode terminar antes de começar");

    expect(fakes.simpleCreateCalls).toBe(0);
    expect(fakes.wizardCalls).toEqual([]);
    expect(fakes.membershipCalls).toEqual([]);
  });

  it("responsável que não entra no projeto é recusado na criação", async () => {
    const useCase = new CreateProjectUseCase({
      projects: fakes.projectPort(),
      memberships: fakes.membershipPort(),
    });

    await expect(
      useCase.execute(
        createCommand({
          cronograma: {
            activities: [{ description: "Codificação", firstMonth: "2026-03", lastMonth: "2026-04", responsibleId: 555 }],
          },
        }),
      ),
    ).rejects.toThrow("Responsável da atividade precisa participar do projeto");
    expect(fakes.wizardCalls).toEqual([]);
  });

  it("o líder e os voluntários do passo de equipe continuam entrando como antes", async () => {
    const useCase = new CreateProjectUseCase({
      projects: fakes.projectPort(),
      memberships: fakes.membershipPort(),
    });

    await useCase.execute(
      createCommand({ cronograma: { goals: [{ description: "Revisar a literatura" }] } }),
    );

    expect(fakes.membershipCalls).toEqual([
      { userId: ACTOR, roles: ["GERENTE_PROJETO"] },
      { userId: 7, roles: ["GERENTE_PROJETO"] },
      { userId: 8, roles: ["VOLUNTARIO"] },
    ]);
  });
});
