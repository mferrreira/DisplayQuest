/**
 * B6-3 (D4) — o gate MANAGE_PROJECTS de POST /api/projects desceu para CreateProjectUseCase.
 * A caraterização (rota) exerce o `assertCanCreateProject` ANTES do parse; este arquivo fixa o
 * RECHECK dentro do próprio use case — a defesa dos chamadores que não passam pela rota (o
 * composition root expõe createProject ao project-membership e a futuros chamadores).
 *
 * Ordem congelada (medida na rota legado): gate ANTES da validação de entrada — um payload
 * inválido para quem não pode criar é 403, não 400. Mensagem própria da rota preservada:
 * "Sem permissão para criar projeto" (não o default "Acesso negado").
 */
import { describe, expect, it } from "vitest";

import { ForbiddenError, userActor, ValidationError } from "@/backend/domain";
import { CreateProjectUseCase } from "@/backend/modules/project-management/application/use-cases/create-project.use-case";

const DENIED = "Sem permissão para criar projeto";

function makeModule() {
  const projectsDb: Array<Record<string, unknown>> = [];
  const useCase = new CreateProjectUseCase({
    projects: {
      async create(input: Record<string, unknown>) {
        const created = { id: 1 + projectsDb.length, createdAt: new Date().toISOString(), ...input };
        projectsDb.push(created);
        return created as never;
      },
    } as never,
    memberships: {
      async findMembership() {
        return null;
      },
      async createMembership() {},
      async updateMembershipRoles() {},
    } as never,
  });
  return { useCase, projectsDb };
}

describe("CreateProjectUseCase — gate MANAGE_PROJECTS com recheck próprio (B6-3)", () => {
  it("VOLUNTARIO criando recebe 403 com a mensagem própria, e nada é escrito", async () => {
    const { useCase, projectsDb } = makeModule();
    await expect(
      useCase.execute({
        actor: userActor(1, ["VOLUNTARIO"]),
        actorId: 1,
        data: { name: "Projeto", status: "active" as never },
      }),
    ).rejects.toThrow(DENIED);
    expect(projectsDb).toEqual([]);
  });

  it("gate vem ANTES da validação: payload inválido para quem não pode é 403, não 400", async () => {
    const { useCase } = makeModule();
    await expect(
      useCase.execute({
        actor: userActor(1, ["VOLUNTARIO"]),
        actorId: 1,
        data: { name: "", status: "invalido" } as never,
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it("COORDENADOR/GERENTE/GERENTE_PROJETO criam; ADMIN NÃO (a matriz MANAGE_PROJECTS medida)", async () => {
    for (const roles of [["COORDENADOR"], ["GERENTE"], ["GERENTE_PROJETO"]]) {
      const { useCase, projectsDb } = makeModule();
      const project = await useCase.execute({
        actor: userActor(10, roles),
        actorId: 10,
        data: { name: "Projeto", status: "active" as never },
      });
      expect(project.id).toBe(1);
      expect(projectsDb).toHaveLength(1);
    }
    // ADMIN não consta de PERMISSIONS.MANAGE_PROJECTS — a matriz é a fonte, não o nome do papel.
    const { useCase, projectsDb } = makeModule();
    await expect(
      useCase.execute({ actor: userActor(11, ["ADMIN"]), actorId: 11, data: { name: "P", status: "active" as never } }),
    ).rejects.toThrow(DENIED);
    expect(projectsDb).toEqual([]);
  });

  it("passado o gate, a validação de entrada continua com a mensagem legada 'Dados inválidos: ...'", async () => {
    const { useCase, projectsDb } = makeModule();
    await expect(
      useCase.execute({
        actor: userActor(10, ["COORDENADOR"]),
        actorId: 10,
        data: { name: "", status: "active" as never } as never,
      }),
    ).rejects.toThrow(ValidationError);
    expect(projectsDb).toEqual([]);
  });
});
