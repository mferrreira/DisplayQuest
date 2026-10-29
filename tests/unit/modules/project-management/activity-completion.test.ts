/**
 * V5-7a (DEC-76/99/162) — os use cases do fluxo de conclusão de atividade sobre portas falsas.
 *
 * O que a rota não pode provar sozinha, e este arquivo prova: a ORDEM das recusas (404 do
 * projeto, 403 do gate, 404 da atividade, 409 do status, 400 da trava, 400 da prova), o gate
 * da DEC-76 (líder OU membership de gestor — o global sem membership NÃO pede), e a garantia
 * de que recusa não grava nada: status continua OPEN, nenhuma linha escrita.
 *
 * Os duplos devolvem CÓPIA na leitura (medido no V5-3/V5-4a: devolver o objeto vivo faz a
 * falha parecer sucesso) e registram o que foi escrito.
 */
import { beforeEach, describe, expect, it } from "vitest";

import {
  ACTIVITY_NO_PROOF_MESSAGE,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/backend/domain";
import type {
  ProjectRecord,
  ProjectRepositoryPort,
} from "@/backend/modules/project-management/application/ports/project.repository";
import type {
  ProjectActivityRecord,
  ProjectCronogramaPort,
} from "@/backend/modules/project-management/application/ports/project-cronograma.repository";
import type {
  ActivityFileRecord,
  ProjectActivityFilesPort,
} from "@/backend/modules/project-management/application/ports/project-activity-files.repository";
import type { ActivityTasksPort } from "@/backend/modules/project-management/application/ports/activity-tasks.port";
import type { ProjectManagementMembershipPort } from "@/backend/modules/project-management/application/ports/project-membership.repository";
import type { ActivityOverdueScanPort } from "@/backend/modules/project-management/application/ports/activity-overdue-scan.port";
import type {
  ActivityCompletionRequestNotifierPort,
  CompletionRequestNotification,
} from "@/backend/modules/project-management/application/ports/activity-completion-request-notifier.port";
import type { ActorRef } from "@/backend/domain";
import { AddActivityFileUseCase } from "@/backend/modules/project-management/application/use-cases/add-activity-file.use-case";
import { AssertCanRequestActivityCompletionUseCase } from "@/backend/modules/project-management/application/use-cases/assert-can-request-activity-completion.use-case";
import { GetActivityFileUseCase } from "@/backend/modules/project-management/application/use-cases/get-activity-file.use-case";
import { ListActivityFilesUseCase } from "@/backend/modules/project-management/application/use-cases/list-activity-files.use-case";
import { RemoveActivityFileUseCase } from "@/backend/modules/project-management/application/use-cases/remove-activity-file.use-case";
import { RequestActivityCompletionUseCase } from "@/backend/modules/project-management/application/use-cases/request-activity-completion.use-case";

const PROJECT = 10;
const ACTOR = 4;
const NOW = new Date("2026-10-14T12:00:00.000Z");

function projectRow(overrides: Partial<ProjectRecord> = {}): ProjectRecord {
  return {
    id: PROJECT,
    name: "Pesquisa em IA",
    description: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    createdBy: ACTOR,
    leaderId: ACTOR,
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

function activityRow(id: number, overrides: Partial<ProjectActivityRecord> = {}): ProjectActivityRecord {
  return {
    id,
    projectId: PROJECT,
    order: id,
    description: "Coleta de dados",
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

function fileRow(id: number, overrides: Partial<ActivityFileRecord> = {}): ActivityFileRecord {
  return {
    id,
    activityId: 1,
    blobKey: `projects/${PROJECT}/activities/1/files/${id}.pdf`,
    name: "relatorio-parcial.pdf",
    contentType: "application/pdf",
    size: 20_000,
    uploadedBy: ACTOR,
    uploadedAt: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

class Fakes {
  projects = new Map<number, ProjectRecord>([[PROJECT, projectRow()]]);
  activities = new Map<number, ProjectActivityRecord>([[1, activityRow(1)]]);
  files = new Map<number, ActivityFileRecord>();
  /** Tarefas ABERTAS por atividade — a conta da trava DEC-99. */
  openTasksByActivity = new Map<number, number>();
  /** Papéis da membership do ator; `null` é "sem membership". */
  actorMembershipRoles: string[] | null = null;
  requestWrites: Array<{ id: number; status: string; requestedBy: number; requestedAt: string }> = [];
  fileWrites: ActivityFileRecord[] = [];
  fileDeletes: number[] = [];
  /** Fix 4: papéis globais de gestão ATIVOS devolvidos pelo scan. Default vazio → publicação não roda. */
  globalManagerIds: number[] = [];
  /** Fix 4: `true` faz o notificador lançar — o quirk congelado de falha de publicação. */
  notifierThrows = false;
  /** Fix 4: notificações de solicitação capturadas pelo duplo do notificador. */
  publishedRequests: Array<{ notification: CompletionRequestNotification; actor: ActorRef }> = [];
  nextFileId = 100;

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
      async create() {
        throw new Error("create não deveria rodar neste arquivo");
      },
      async createWithCronograma() {
        throw new Error("createWithCronograma não deveria rodar neste arquivo");
      },
      async update() {
        throw new Error("update não deveria rodar neste arquivo");
      },
      async delete() {
        throw new Error("delete não deveria rodar neste arquivo");
      },
      async incrementPoints() {
        throw new Error("incrementPoints não deveria rodar neste arquivo");
      },
    };
  }

  cronogramaPort(): ProjectCronogramaPort {
    const self = this;
    return {
      async listGoals() {
        return [];
      },
      async findGoalById() {
        return null;
      },
      async createGoal() {
        throw new Error("goal não deveria rodar neste arquivo");
      },
      async updateGoal() {
        throw new Error("goal não deveria rodar neste arquivo");
      },
      async deleteGoal() {
        throw new Error("goal não deveria rodar neste arquivo");
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
      async createActivity() {
        throw new Error("createActivity não deveria rodar neste arquivo");
      },
      async updateActivity() {
        throw new Error("updateActivity não deveria rodar neste arquivo");
      },
      async requestActivity(id, fields) {
        self.requestWrites.push({
          id,
          status: fields.status,
          requestedBy: fields.requestedBy,
          requestedAt: fields.requestedAt.toISOString(),
        });
        const current = self.activities.get(id);
        if (!current) throw new Error("atividade ausente no duplo");
        const next = {
          ...current,
          status: fields.status,
          requestedBy: fields.requestedBy,
          requestedAt: fields.requestedAt.toISOString(),
        };
        self.activities.set(id, next);
        return { ...next };
      },
      async deleteActivity() {
        throw new Error("deleteActivity não deveria rodar neste arquivo");
      },
      async approveActivity() {
        throw new Error("approveActivity não deveria rodar neste arquivo");
      },
    };
  }

  filesPort(): ProjectActivityFilesPort {
    const self = this;
    return {
      async listByActivity(activityId) {
        return [...self.files.values()]
          .filter((row) => row.activityId === activityId)
          .map((row) => ({ ...row }));
      },
      async findById(id) {
        const row = self.files.get(id);
        return row ? { ...row } : null;
      },
      async countByActivity(activityId) {
        return [...self.files.values()].filter((row) => row.activityId === activityId).length;
      },
      async create(input) {
        const row = fileRow(self.nextFileId++, { ...input, uploadedAt: "2026-10-14T00:00:00.000Z" });
        self.files.set(row.id, row);
        self.fileWrites.push({ ...row });
        return { ...row };
      },
      async delete(id) {
        self.fileDeletes.push(id);
        self.files.delete(id);
      },
    };
  }

  tasksPort(): ActivityTasksPort {
    const self = this;
    return {
      async countOpenByActivity(activityId) {
        return self.openTasksByActivity.get(activityId) ?? 0;
      },
    };
  }

  membershipPort(): ProjectManagementMembershipPort {
    const self = this;
    return {
      async findMembership(projectId, userId) {
        if (projectId !== PROJECT || userId !== ACTOR || self.actorMembershipRoles === null) return null;
        return { id: 50, roles: self.actorMembershipRoles as never };
      },
      async createMembership() {
        throw new Error("createMembership não deveria rodar neste arquivo");
      },
      async updateMembershipRoles() {
        throw new Error("updateMembershipRoles não deveria rodar neste arquivo");
      },
      async listMembersWithUser() {
        return [];
      },
      async listActiveMemberUserIds() {
        throw new Error("listActiveMemberUserIds não deveria rodar neste arquivo");
      },
    };
  }

  requestUseCase(): RequestActivityCompletionUseCase {
    return new RequestActivityCompletionUseCase({
      projects: this.projectPort(),
      cronograma: this.cronogramaPort(),
      files: this.filesPort(),
      tasks: this.tasksPort(),
      memberships: this.membershipPort(),
      scan: this.scanPort(),
      notifier: this.notifierPort(),
    });
  }

  /** Fix 4: papéis globais de gestão ATIVOS. Por default vazio — a publicação não roda nos testes de gate. */
  scanPort(): ActivityOverdueScanPort {
    const self = this;
    return {
      async listGlobalManagerUserIds() {
        return self.globalManagerIds;
      },
      async listNotificationCandidates() {
        return [];
      },
      async markOverdueNotified() {
        return 0;
      },
    };
  }

  /** Fix 4: captura a notificação publicada pelo use case (não publica de verdade). */
  notifierPort(): ActivityCompletionRequestNotifierPort {
    const self = this;
    return {
      async publishRequest(notification, actor) {
        if (self.notifierThrows) throw new Error("notificação indisponível");
        self.publishedRequests.push({ notification, actor });
      },
    };
  }

  addFileUseCase(): AddActivityFileUseCase {
    return new AddActivityFileUseCase({
      projects: this.projectPort(),
      cronograma: this.cronogramaPort(),
      files: this.filesPort(),
      memberships: this.membershipPort(),
    });
  }

  removeFileUseCase(): RemoveActivityFileUseCase {
    return new RemoveActivityFileUseCase({
      projects: this.projectPort(),
      cronograma: this.cronogramaPort(),
      files: this.filesPort(),
      memberships: this.membershipPort(),
    });
  }

  listFilesUseCase(): ListActivityFilesUseCase {
    return new ListActivityFilesUseCase({
      projects: this.projectPort(),
      cronograma: this.cronogramaPort(),
      files: this.filesPort(),
    });
  }

  getFileUseCase(): GetActivityFileUseCase {
    return new GetActivityFileUseCase({
      projects: this.projectPort(),
      cronograma: this.cronogramaPort(),
      files: this.filesPort(),
    });
  }

  assertUseCase(): AssertCanRequestActivityCompletionUseCase {
    return new AssertCanRequestActivityCompletionUseCase({
      projects: this.projectPort(),
      cronograma: this.cronogramaPort(),
      memberships: this.membershipPort(),
    });
  }
}

describe("RequestActivityCompletionUseCase (V5-7a, DEC-76/99/162)", () => {
  let fakes: Fakes;

  beforeEach(() => {
    fakes = new Fakes();
    // O caminho feliz precisa de prova (DEC-162) e nenhuma tarefa aberta (DEC-99).
    fakes.files.set(77, fileRow(77));
  });

  it("líder solicita de OPEN: status, quem pediu e quando entram juntos", async () => {
    const activity = await fakes.requestUseCase().execute({
      projectId: PROJECT,
      activityId: 1,
      actorId: ACTOR,
      now: NOW,
    });

    expect(activity.status).toBe("COMPLETION_REQUESTED");
    expect(activity.requestedBy).toBe(ACTOR);
    expect(activity.requestedAt).toBe(NOW.toISOString());
    expect(fakes.requestWrites).toHaveLength(1);
    // Fix 4: sem gestão global ATIVA, nenhuma notificação sai — a publicação não roda.
    expect(fakes.publishedRequests).toHaveLength(0);
  });

  it("solicitação notifica a gestão global ATIVA com atividade e projeto, ator de sistema", async () => {
    fakes.globalManagerIds = [1, 2, 3];

    await fakes.requestUseCase().execute({ projectId: PROJECT, activityId: 1, actorId: ACTOR, now: NOW });

    expect(fakes.publishedRequests).toHaveLength(1);
    const { notification, actor } = fakes.publishedRequests[0];
    expect(notification.userIds).toEqual([1, 2, 3]);
    expect(notification.title).toBe("Conclusão de atividade solicitada");
    expect(notification.message).toContain("Coleta de dados");
    expect(notification.message).toContain("Pesquisa em IA");
    expect(actor.kind).toBe("system");
  });

  it("notificação não sai antes da escrita: recusa da prova não publica", async () => {
    fakes.globalManagerIds = [1, 2];
    fakes.files.clear();

    await expect(
      fakes.requestUseCase().execute({ projectId: PROJECT, activityId: 1, actorId: ACTOR, now: NOW }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(fakes.publishedRequests).toHaveLength(0);
    expect(fakes.requestWrites).toHaveLength(0);
  });

  it("falha do notificador não derruba a solicitação: a atividade fica COMPLETION_REQUESTED", async () => {
    fakes.globalManagerIds = [1];
    fakes.notifierThrows = true;

    const activity = await fakes.requestUseCase().execute({
      projectId: PROJECT,
      activityId: 1,
      actorId: ACTOR,
      now: NOW,
    });
    expect(activity.status).toBe("COMPLETION_REQUESTED");
    expect(fakes.requestWrites).toHaveLength(1);
    expect(fakes.publishedRequests).toHaveLength(0);
  });

  it("membership de gestor que não é líder também pede (DEC-76)", async () => {
    fakes.projects.set(PROJECT, projectRow({ leaderId: 99 }));
    fakes.actorMembershipRoles = ["GERENTE_PROJETO"];

    const activity = await fakes.requestUseCase().execute({
      projectId: PROJECT,
      activityId: 1,
      actorId: ACTOR,
      now: NOW,
    });
    expect(activity.status).toBe("COMPLETION_REQUESTED");
  });

  it("sem membership e sem ser líder não pede — nem COORDENADOR global (quem aprova é o global, DEC-77)", async () => {
    fakes.projects.set(PROJECT, projectRow({ leaderId: 99 }));

    await expect(
      fakes.requestUseCase().execute({ projectId: PROJECT, activityId: 1, actorId: ACTOR, now: NOW }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(fakes.requestWrites).toHaveLength(0);
    expect(fakes.activities.get(1)!.status).toBe("OPEN");
  });

  it("membership sem papel de gestor não pede", async () => {
    fakes.projects.set(PROJECT, projectRow({ leaderId: 99 }));
    fakes.actorMembershipRoles = ["VOLUNTARIO"];

    await expect(
      fakes.requestUseCase().execute({ projectId: PROJECT, activityId: 1, actorId: ACTOR, now: NOW }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("atividade de outro projeto é 404, não convite", async () => {
    fakes.activities.set(2, activityRow(2, { projectId: 999 }));

    await expect(
      fakes.requestUseCase().execute({ projectId: PROJECT, activityId: 2, actorId: ACTOR, now: NOW }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("solicitar duas vezes é 409 com a frase do status (idempotência DEC-162)", async () => {
    await fakes.requestUseCase().execute({ projectId: PROJECT, activityId: 1, actorId: ACTOR, now: NOW });

    const error = await fakes
      .requestUseCase()
      .execute({ projectId: PROJECT, activityId: 1, actorId: ACTOR, now: NOW })
      .catch((e) => e);
    expect(error).toBeInstanceOf(ConflictError);
    expect((error as ConflictError).message).toBe("A conclusão desta atividade já foi solicitada");
    expect(fakes.requestWrites).toHaveLength(1);
  });

  it("atividade DONE responde 409 com a frase própria", async () => {
    fakes.activities.set(1, activityRow(1, { status: "DONE" }));

    const error = await fakes
      .requestUseCase()
      .execute({ projectId: PROJECT, activityId: 1, actorId: ACTOR, now: NOW })
      .catch((e) => e);
    expect(error).toBeInstanceOf(ConflictError);
    expect((error as ConflictError).message).toBe("Esta atividade já foi concluída");
  });

  it("trava DEC-99: tarefa aberta na atividade é 400 dizendo quantas", async () => {
    fakes.openTasksByActivity.set(1, 2);

    const error = await fakes
      .requestUseCase()
      .execute({ projectId: PROJECT, activityId: 1, actorId: ACTOR, now: NOW })
      .catch((e) => e);
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).message).toBe(
      "Conclua as 2 tarefas da atividade antes de solicitar a conclusão",
    );
    expect(fakes.requestWrites).toHaveLength(0);
    expect(fakes.activities.get(1)!.status).toBe("OPEN");
  });

  it("trava DEC-99 no singular quando resta uma", async () => {
    fakes.openTasksByActivity.set(1, 1);

    await expect(
      fakes.requestUseCase().execute({ projectId: PROJECT, activityId: 1, actorId: ACTOR, now: NOW }),
    ).rejects.toThrow("Conclua a tarefa restante da atividade antes de solicitar a conclusão");
  });

  it("exigência de prova (DEC-162): zero arquivos é 400 e a atividade fica OPEN", async () => {
    fakes.files.clear();

    const error = await fakes
      .requestUseCase()
      .execute({ projectId: PROJECT, activityId: 1, actorId: ACTOR, now: NOW })
      .catch((e) => e);
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).message).toBe(ACTIVITY_NO_PROOF_MESSAGE);
    expect(fakes.requestWrites).toHaveLength(0);
    expect(fakes.activities.get(1)!.status).toBe("OPEN");
  });

  it("a ordem é status antes da trava: DONE com tarefa aberta responde 409, não 400", async () => {
    fakes.activities.set(1, activityRow(1, { status: "DONE" }));
    fakes.openTasksByActivity.set(1, 3);

    await expect(
      fakes.requestUseCase().execute({ projectId: PROJECT, activityId: 1, actorId: ACTOR, now: NOW }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("a ordem é trava antes de prova: tarefa aberta sem arquivo responde pela trava", async () => {
    fakes.files.clear();
    fakes.openTasksByActivity.set(1, 1);

    await expect(
      fakes.requestUseCase().execute({ projectId: PROJECT, activityId: 1, actorId: ACTOR, now: NOW }),
    ).rejects.toThrow("Conclua a tarefa restante da atividade");
  });

  it("projeto ausente é 404 antes do gate", async () => {
    await expect(
      fakes.requestUseCase().execute({ projectId: 999, activityId: 1, actorId: ACTOR, now: NOW }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("provas da atividade (V5-7a, DEC-133/162)", () => {
  let fakes: Fakes;

  beforeEach(() => {
    fakes = new Fakes();
  });

  it("quem pode pedir anexa prova, e o registro carrega quem subiu", async () => {
    const proof = await fakes.addFileUseCase().execute({
      projectId: PROJECT,
      activityId: 1,
      actorId: ACTOR,
      blobKey: "projects/10/activities/1/files/abc.pdf",
      name: "ata da reuniao.pdf",
      contentType: "application/pdf",
      size: 1234,
    });

    expect(proof.uploadedBy).toBe(ACTOR);
    expect(proof.activityId).toBe(1);
    expect(fakes.fileWrites).toHaveLength(1);
  });

  it("quem não pode pedir não anexa", async () => {
    fakes.projects.set(PROJECT, projectRow({ leaderId: 99 }));

    await expect(
      fakes.addFileUseCase().execute({
        projectId: PROJECT,
        activityId: 1,
        actorId: ACTOR,
        blobKey: "k",
        name: "x.pdf",
        contentType: "application/pdf",
        size: 1,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(fakes.fileWrites).toHaveLength(0);
  });

  it("prova de atividade de outro projeto é 404", async () => {
    fakes.activities.set(2, activityRow(2, { projectId: 999 }));

    await expect(
      fakes.addFileUseCase().execute({
        projectId: PROJECT,
        activityId: 2,
        actorId: ACTOR,
        blobKey: "k",
        name: "x.pdf",
        contentType: "application/pdf",
        size: 1,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("metadado inválido (nome vazio) é 400 pela validação do anexo, reusada", async () => {
    await expect(
      fakes.addFileUseCase().execute({
        projectId: PROJECT,
        activityId: 1,
        actorId: ACTOR,
        blobKey: "k",
        name: "   ",
        contentType: "application/pdf",
        size: 10,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(fakes.fileWrites).toHaveLength(0);
  });

  it("apagar prova apaga o registro; prova de outra atividade é 404", async () => {
    fakes.files.set(77, fileRow(77));

    const removed = await fakes.removeFileUseCase().execute({
      projectId: PROJECT,
      activityId: 1,
      fileId: 77,
      actorId: ACTOR,
    });
    expect(removed.id).toBe(77);
    expect(fakes.fileDeletes).toEqual([77]);

    fakes.files.set(78, fileRow(78, { activityId: 2 }));
    await expect(
      fakes.removeFileUseCase().execute({ projectId: PROJECT, activityId: 1, fileId: 78, actorId: ACTOR }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("leitura de prova é do autenticado (DEC-127): sem membership e sem ser líder, lista chega", async () => {
    fakes.projects.set(PROJECT, projectRow({ leaderId: 99 }));
    fakes.files.set(77, fileRow(77));

    const files = await fakes.listFilesUseCase().execute({ projectId: PROJECT, activityId: 1, actorId: 42 });
    expect(files).toHaveLength(1);
  });

  it("listar atividade de outro projeto é 404", async () => {
    fakes.activities.set(2, activityRow(2, { projectId: 999 }));

    await expect(
      fakes.listFilesUseCase().execute({ projectId: PROJECT, activityId: 2, actorId: ACTOR }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("o binário (getActivityFile) só entrega arquivo daquela atividade", async () => {
    fakes.files.set(77, fileRow(77));

    await expect(
      fakes.getFileUseCase().execute({ projectId: PROJECT, activityId: 1, fileId: 77, actorId: ACTOR }),
    ).resolves.toMatchObject({ id: 77 });

    await expect(
      fakes.getFileUseCase().execute({ projectId: PROJECT, activityId: 1, fileId: 999, actorId: ACTOR }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("AssertCanRequestActivityCompletionUseCase (gate antes do corpo, DEC-54/133)", () => {
  let fakes: Fakes;

  beforeEach(() => {
    fakes = new Fakes();
  });

  it("quem não pode pedir leva 403 sem o corpo ser lido", async () => {
    fakes.projects.set(PROJECT, projectRow({ leaderId: 99 }));

    await expect(
      fakes.assertUseCase().execute({ projectId: PROJECT, activityId: 1, actorId: ACTOR }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("atividade inexistente é 404 — escrever objeto para etapa que não existe deixaria órfão no bucket", async () => {
    await expect(
      fakes.assertUseCase().execute({ projectId: PROJECT, activityId: 999, actorId: ACTOR }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("líder passa", async () => {
    await expect(
      fakes.assertUseCase().execute({ projectId: PROJECT, activityId: 1, actorId: ACTOR }),
    ).resolves.toBeUndefined();
  });
});
