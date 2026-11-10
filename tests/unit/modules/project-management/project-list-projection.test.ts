/**
 * S06 (plan-v21, DEC-261) — a projeção `isMemberActive` da lista de projetos.
 *
 * Por que existe: o ícone "Editar descrição X" do card obedece a esta coluna derivada. Ela é
 * derivada do vínculo, não do papel: ATIVO vale, INATIVO não vale, e `isMember` continua true
 * para os dois (histórico de leitura intacto, DEC-149). O `tsc` não protege contra o esquecido
 * de filtrar por situação, e a rota de lista não exercita o `situacao` do fake.
 */
import { describe, expect, it } from "vitest"

import { ListProjectsForActorUseCase } from "@/backend/modules/project-management/application/use-cases/list-projects-for-actor.use-case"

const MEMBERS = [
  { userId: 4, roles: ["VOLUNTARIO"], situacao: "ATIVO", user: null },
  { userId: 5, roles: ["VOLUNTARIO"], situacao: "INATIVO", user: null },
]

function project(overrides: Record<string, unknown> = {}) {
  return {
    id: 7,
    name: "Alpha",
    description: null,
    createdAt: "2026-01-01T12:00:00.000Z",
    createdBy: 1,
    leaderId: 1,
    status: "active",
    links: [],
    members: MEMBERS,
    ...overrides,
  }
}

describe("projeção isMemberActive da lista (DEC-261)", () => {
  it("membro ATIVO: as duas projeções são true", async () => {
    const useCase = new ListProjectsForActorUseCase({
      projects: { findAll: async () => [project()] } as never,
      completionRequests: { listProjectIdsWithRequests: async () => [] } as never,
    })
    const rows = await useCase.execute({ actorId: 4, actorRoles: ["VOLUNTARIO"] as never })
    expect(rows[0].isMember).toBe(true)
    expect(rows[0].isMemberActive).toBe(true)
  })

  it("membro INATIVO: `isMember` continua true, `isMemberActive` é false", async () => {
    const useCase = new ListProjectsForActorUseCase({
      projects: { findAll: async () => [project()] } as never,
      completionRequests: { listProjectIdsWithRequests: async () => [] } as never,
    })
    const rows = await useCase.execute({ actorId: 5, actorRoles: ["VOLUNTARIO"] as never })
    expect(rows[0].isMember).toBe(true)
    expect(rows[0].isMemberActive).toBe(false)
  })

  it("não-membro: as duas são false, e projeto sem membros também", async () => {
    const useCase = new ListProjectsForActorUseCase({
      projects: { findAll: async () => [project(), project({ members: undefined })] } as never,
      completionRequests: { listProjectIdsWithRequests: async () => [] } as never,
    })
    const rows = await useCase.execute({ actorId: 6, actorRoles: ["VOLUNTARIO"] as never })
    expect(rows[0].isMember).toBe(false)
    expect(rows[0].isMemberActive).toBe(false)
    expect(rows[1].isMemberActive).toBe(false)
  })
})
