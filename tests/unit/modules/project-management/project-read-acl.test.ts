/**
 * V5-2a (DEC-127) — a LEITURA de projeto é do autenticado.
 *
 * O plano media duas ACLs diferentes antes do batch: a lista filtrava por MANAGE_TASKS e o
 * detalhe por MANAGE_PROJECTS, e o resultado visível era o COLABORADOR recebendo o projeto na
 * lista e levando "Acesso negado ao projeto" ao abrir. Este arquivo fixa a regra nova na
 * autoridade (o domínio) e nos use cases que a consultam, e fixa junto o que NÃO mudou: a
 * gestão continua na ACL congelada, com o quirk do membership mandando quando existe.
 *
 * Os testes de leitura também provam o custo: a decisão não consulta membership nem
 * líder/criador, então as portas de leitura não recebem esses acessos (`ProjectActorsPort`
 * encolheu junto).
 */
import { describe, expect, it } from "vitest";

import {
  ForbiddenError,
  NotFoundError,
  canActorAccessProjectDecision,
  canActorManageProjectDecision,
} from "@/backend/domain";
import { GetProjectForActorUseCase } from "@/backend/modules/project-management/application/use-cases/get-project-for-actor.use-case";
import { GetProjectVolunteersUseCase } from "@/backend/modules/project-management/application/use-cases/get-project-volunteers.use-case";
import { ListProjectDeliverablesUseCase } from "@/backend/modules/project-management/application/use-cases/list-project-deliverables.use-case";
import { ListProjectsForActorUseCase } from "@/backend/modules/project-management/application/use-cases/list-projects-for-actor.use-case";
import type { ProjectCompletionRequestsPort } from "@/backend/modules/project-management/application/ports/project-completion-requests.port";
import { AssertCanManageProjectUseCase } from "@/backend/modules/project-management/application/use-cases/assert-can-manage-project.use-case";
import { ListProjectMembersUseCase } from "@/backend/modules/project-membership/application/use-cases/list-project-members.use-case";

const DENIED = "Acesso negado ao projeto";
const NO_MANAGE = "Usuário não tem permissão para gerenciar este projeto";

const PROJECTS = [
  { id: 10, name: "Pesquisa em IA", createdAt: "2026-09-22T12:00:00.000Z", createdBy: 2, leaderId: 2, status: "active" },
  { id: 11, name: "Laboratório", createdAt: "2026-09-20T12:00:00.000Z", createdBy: 3, leaderId: null, status: "active" },
];

/** Fake da porta de projetos que REGISTRA o que foi lido — é como os testes provam que a
 *  leitura aberta não virou três queries por ator. */
function projectsPort() {
  const calls: string[] = [];
  const port = {
    async findAll() {
      calls.push("findAll");
      return PROJECTS as never;
    },
    async findById(id: number) {
      calls.push(`findById:${id}`);
      return PROJECTS.find((p) => p.id === id) as never;
    },
    async findByLeaderId(leaderId: number) {
      calls.push(`findByLeaderId:${leaderId}`);
      return PROJECTS.filter((p) => p.leaderId === leaderId) as never;
    },
  };
  return { port: port as never, calls };
}

function deliverablesPort() {
  const calls: string[] = [];
  const port = {
    async listByProjectId(projectId: number) {
      calls.push(`listByProjectId:${projectId}`);
      return [{ id: 101, projectId, name: "Relatório parcial", quantity: 2 }] as never;
    },
  };
  return { port: port as never, calls };
}

const MEMBERS = [
  {
    id: 1,
    projectId: 10,
    userId: 4,
    roles: ["VOLUNTARIO"],
    joinedAt: new Date("2026-09-22T12:00:00.000Z"),
    // V5-4b (DEC-149): os campos do vínculo entram no record lido pelo adapter. O cast `as never`
    // esconde o tipo, então um campo novo aqui apareceria como `undefined` na view, não como erro.
    lattes: null,
    cargaHoraria: null,
    categoria: null,
    situacao: "ATIVO",
    dataEntrada: "2026-09-22",
    user: { id: 4, name: "Ana", email: "ana@test.local", avatar: null, points: 10, completedTasks: 1 },
  },
  {
    id: 2,
    projectId: 10,
    userId: 9,
    roles: ["GERENTE_PROJETO"],
    joinedAt: new Date("2026-09-21T12:00:00.000Z"),
    lattes: null,
    cargaHoraria: null,
    categoria: null,
    situacao: "ATIVO",
    dataEntrada: "2026-09-21",
    user: { id: 9, name: "Beto", email: "beto@test.local", avatar: null, points: 20, completedTasks: 2 },
  },
];

function membershipsPort(members: typeof MEMBERS, membershipRoles: string[] | null = null) {
  return {
    // `as never` de propósito (padrão da casa para porta parcial): só os métodos exercitados
    // existem, e o que não deveria ser chamado não é.
    port: {
      async findMembership() {
        return membershipRoles === null ? null : { id: 99, roles: membershipRoles as never };
      },
      async listMembersWithUser() {
        return members as never;
      },
    } as never,
    calls: [] as string[],
  };
}

describe("canActorAccessProjectDecision — a política de leitura (V5-2a, DEC-127)", () => {
  it("existe ator, existe leitura: papel não entra na conta", () => {
    for (const actorId of [1, 4, 9, 999]) {
      expect(canActorAccessProjectDecision(actorId)).toBe(true);
    }
  });

  it("não há ator, não há leitura: id zero, negativo, fracionário e NaN recusados", () => {
    for (const actorId of [0, -3, 4.5, Number.NaN]) {
      expect(canActorAccessProjectDecision(actorId)).toBe(false);
    }
  });

  it("a decisão tem UM parâmetro: papel e membership saíram da assinatura junto com a regra antiga", () => {
    // Guarda estrutural: a regra velha recebia (roles, id, membershipExists, projeto). Voltar a
    // passar papel por aqui seria a ACL antiga voltando em silêncio.
    expect(canActorAccessProjectDecision.length).toBe(1);
  });
});

const completionPort: ProjectCompletionRequestsPort = {
  async listProjectIdsWithRequests() {
    return [];
  },
};

describe("ListProjectsForActorUseCase — a lista não depende do ator", () => {
  it("VOLUNTARIO sem membership recebe TODOS os projetos", async () => {
    const { port, calls } = projectsPort();
    const useCase = new ListProjectsForActorUseCase({ projects: port, completionRequests: completionPort });

    const list = await useCase.execute({ actorId: 4, actorRoles: ["VOLUNTARIO"] });
    expect(list.map((p) => p.id)).toEqual([10, 11]);
    // A regra antiga fazia três leituras por ator (membro ∪ criado ∪ liderado) e dedup.
    expect(calls).toEqual(["findAll"]);
  });

  it("COORDENADOR e VOLUNTARIO recebem a MESMA lista", async () => {
    const { port } = projectsPort();
    const useCase = new ListProjectsForActorUseCase({ projects: port, completionRequests: completionPort });

    const asCoord = await useCase.execute({ actorId: 1, actorRoles: ["COORDENADOR"] });
    const asVoluntario = await useCase.execute({ actorId: 4, actorRoles: ["VOLUNTARIO"] });
    expect(asVoluntario.map((p) => p.id)).toEqual(asCoord.map((p) => p.id));
  });

  it("sem ator a lista recusa com a mensagem congelada, não devolve lista vazia", async () => {
    const { port, calls } = projectsPort();
    const useCase = new ListProjectsForActorUseCase({ projects: port, completionRequests: completionPort });

    await expect(useCase.execute({ actorId: 0, actorRoles: [] })).rejects.toThrow(DENIED);
    expect(calls).toEqual([]);
  });

  it("a lista marca por projeto se ele tem conclusão solicitada (fix 4, projeção)", async () => {
    const { port } = projectsPort();
    const flagged: ProjectCompletionRequestsPort = {
      async listProjectIdsWithRequests() {
        return [10];
      },
    };
    const useCase = new ListProjectsForActorUseCase({ projects: port, completionRequests: flagged });

    const list = await useCase.execute({ actorId: 4, actorRoles: ["VOLUNTARIO"] });
    const byId = new Map(list.map((p) => [p.id, p]));
    expect(byId.get(10)?.completionRequested).toBe(true);
    expect(byId.get(11)?.completionRequested).toBe(false);
  });
});

describe("GetProjectForActorUseCase — o detalhe abre para quem não tem relação", () => {
  it("outsider (sem membership, sem papel) lê o detalhe", async () => {
    const { port, calls } = projectsPort();
    const useCase = new GetProjectForActorUseCase({ projects: port });

    const project = await useCase.execute({ projectId: 10, actorId: 77, actorRoles: ["VOLUNTARIO"] });
    expect(project.id).toBe(10);
    // A decisão não consulta tabela: uma leitura só.
    expect(calls).toEqual(["findById:10"]);
  });

  it("projeto inexistente continua 404 com a mensagem congelada", async () => {
    const { port } = projectsPort();
    const useCase = new GetProjectForActorUseCase({ projects: port });

    await expect(useCase.execute({ projectId: 999, actorId: 1, actorRoles: ["COORDENADOR"] })).rejects.toThrow(
      NotFoundError,
    );
  });

  it("sem ator o detalhe responde 403 com a mensagem congelada", async () => {
    const { port } = projectsPort();
    const useCase = new GetProjectForActorUseCase({ projects: port });

    await expect(useCase.execute({ projectId: 10, actorId: 0, actorRoles: ["COORDENADOR"] })).rejects.toThrow(
      ForbiddenError,
    );
  });
});

describe("leitura das partes do projeto herda a decisão (entregáveis)", () => {
  it("outsider lê os entregáveis do projeto", async () => {
    const { port: projects } = projectsPort();
    const { port: deliverables, calls } = deliverablesPort();
    const useCase = new ListProjectDeliverablesUseCase({ projects, deliverables });

    const rows = await useCase.execute({ projectId: 10, actorId: 77, actorRoles: ["VOLUNTARIO"] });
    expect(rows.map((d) => d.id)).toEqual([101]);
    expect(calls).toEqual(["listByProjectId:10"]);
  });

  it("projeto inexistente responde 404 antes de qualquer leitura de entregável", async () => {
    const { port: projects } = projectsPort();
    const { port: deliverables, calls } = deliverablesPort();
    const useCase = new ListProjectDeliverablesUseCase({ projects, deliverables });

    await expect(useCase.execute({ projectId: 999, actorId: 1, actorRoles: ["COORDENADOR"] })).rejects.toThrow(
      "Projeto não encontrado",
    );
    expect(calls).toEqual([]);
  });
});

describe("GetProjectVolunteersUseCase — o card de horas por pessoa é leitura (DEC-127)", () => {
  function makeUseCase() {
    const { port: memberships } = membershipsPort(MEMBERS);
    return new GetProjectVolunteersUseCase({
      memberships,
      hours: {
        async sumCompletedSeconds() {
          return 5500;
        },
      } as never,
    });
  }

  it("quem não gerencia o projeto lê a agregação", async () => {
    const result = await makeUseCase().execute({ projectId: 10, actorId: 77, actorRoles: ["VOLUNTARIO"] });
    // Audiência congelada: só VOLUNTARIO/COLABORADOR.
    expect(result.volunteers.map((v) => v.id)).toEqual([4]);
    expect(result.stats.totalVolunteers).toBe(1);
  });

  it("sem ator: 403 com a mensagem congelada", async () => {
    await expect(makeUseCase().execute({ projectId: 10, actorId: 0, actorRoles: [] })).rejects.toThrow(DENIED);
  });
});

describe("ListProjectMembersUseCase — quem participa não precisa ser membro para ver quem participa", () => {
  function makeUseCase() {
    const { port: memberships } = membershipsPort(MEMBERS);
    return new ListProjectMembersUseCase({
      memberships,
      hours: {
        async sumCompletedSecondsByUser() {
          return [] as never;
        },
      } as never,
    });
  }

  it("outsider lê a lista de membros", async () => {
    const members = await makeUseCase().execute({ projectId: 10, actorUserId: 77, actorRoles: ["VOLUNTARIO"] });
    expect(members.map((m) => m.userId)).toEqual([4, 9]);
  });

  it("sem ator: 403 com a mensagem congelada", async () => {
    await expect(makeUseCase().execute({ projectId: 10, actorUserId: 0, actorRoles: [] })).rejects.toThrow(DENIED);
  });
});

describe("gestão continua na ACL congelada (regressão da DEC-127)", () => {
  it("quirk do membership: quando o membership existe, SÓ os papéis dele decidem", () => {
    // COORDENADOR global não salva quem é membro sem papel de gestão — é o quirk congelado desde
    // OND5-B1 (project-management.gateway.ts:159-169), e a DEC-127 não o tocou.
    expect(canActorManageProjectDecision(["VOLUNTARIO"], ["COORDENADOR"])).toBe(false);
    expect(canActorManageProjectDecision(["COLABORADOR"], ["GERENTE"])).toBe(false);
    // Papéis de membership que gerenciam: COORDENADOR, GERENTE, GERENTE_PROJETO.
    expect(canActorManageProjectDecision(["COORDENADOR"], null)).toBe(true);
    expect(canActorManageProjectDecision(["GERENTE_PROJETO"], null)).toBe(true);
    expect(canActorManageProjectDecision(["VOLUNTARIO"], null)).toBe(false);
    // Sem membership, o papel global MANAGE_USERS decide.
    expect(canActorManageProjectDecision(null, ["COORDENADOR"])).toBe(true);
    expect(canActorManageProjectDecision(null, ["VOLUNTARIO"])).toBe(false);
    expect(canActorManageProjectDecision(null, null)).toBe(false);
  });

  it("outsider que lê não gerencia: AssertCanManageProjectUseCase continua 403", async () => {
    const { port: projects } = projectsPort();
    const { port: memberships } = membershipsPort(MEMBERS, null);
    const useCase = new AssertCanManageProjectUseCase({
      projects,
      memberships,
      actors: { async findActor() { return null; } } as never,
    });

    await expect(useCase.execute({ projectId: 10, actorId: 77 })).rejects.toThrow(NO_MANAGE);
  });

  it("membro VOLUNTARIO lê e não gerencia (a trava de escrita do V5-2c continua)", async () => {
    const { port: projects } = projectsPort();
    const { port: memberships } = membershipsPort(MEMBERS, ["VOLUNTARIO"]);
    const useCase = new AssertCanManageProjectUseCase({
      projects,
      memberships,
      actors: { async findActor() { return { id: 4, roles: ["VOLUNTARIO"] }; } } as never,
    });

    await expect(useCase.execute({ projectId: 10, actorId: 4 })).rejects.toThrow(NO_MANAGE);
  });

  it("membro GERENTE_PROJETO gerencia", async () => {
    const { port: projects } = projectsPort();
    const { port: memberships } = membershipsPort(MEMBERS, ["GERENTE_PROJETO"]);
    const useCase = new AssertCanManageProjectUseCase({
      projects,
      memberships,
      actors: { async findActor() { return { id: 9, roles: [] }; } } as never,
    });

    await expect(useCase.execute({ projectId: 10, actorId: 9 })).resolves.toEqual({ projectId: 10 });
  });
});
