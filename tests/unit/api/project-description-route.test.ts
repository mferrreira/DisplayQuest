// @vitest-environment node
/**
 * S06 (plan-v21, R9/DEC-261) — `PUT /api/projects/[id]/description`.
 *
 * Rota dedicada: o gate R9 é do use case — gestão da ACL **ou** membro com situação ATIVA.
 * Membro INATIVO e não-membro recebem 403; a escrita completa do wizard continua só da gestão
 * (`PUT /api/projects/[id]` não muda aqui). Os 400 são da regra de descrição, não da rota.
 *
 * Mesma costura dos lotes de entregável: módulo REAL sobre portas falsas. O fake de
 * membership devolve `findActiveMembership` — o método novo do port é exercitado de propósito,
 * porque é ele que decide o membro ATIVO.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createIdentityAccessModule } from "@/backend/modules/identity-access"
import { createProjectManagementModule } from "@/backend/modules/project-management"
import type { Role } from "@/backend/domain"
import type { ProjectActorsPort } from "@/backend/modules/project-management/application/ports/project-actors.port"
import type { ProjectManagementMembershipPort } from "@/backend/modules/project-management/application/ports/project-membership.repository"
import type { ProjectRecord, ProjectRepositoryPort } from "@/backend/modules/project-management/application/ports/project.repository"

const mocks = vi.hoisted(() => ({
  session: null as null | { id: number; email: string; name: string; roles: string[]; status: string },
  projects: new Map<number, ProjectRecord>(),
  requests: [] as Array<{ record: ProjectRecord }>,
}))

// Atores: 1 gerencia pelo papel global, 3 gerencia pela membership, 4 é membro ATIVO,
// 5 é membro INATIVO, 6 não é membro.
const ACTOR_ROLES: Record<number, string[]> = {
  1: ["COORDENADOR"],
  3: ["VOLUNTARIO"],
  4: ["VOLUNTARIO"],
  5: ["VOLUNTARIO"],
  6: ["VOLUNTARIO"],
}
const MEMBERSHIPS: Record<string, { id: number; roles: Role[] }> = {
  "10:3": { id: 30, roles: ["GERENTE_PROJETO"] },
  "10:4": { id: 40, roles: ["VOLUNTARIO"] },
  "10:5": { id: 50, roles: ["VOLUNTARIO"] },
}
const ACTIVE: Record<string, boolean> = {
  "10:4": true,
  "10:5": false,
}

function projectRow(id = 10): ProjectRecord {
  return {
    id,
    name: "Projeto",
    description: "Descrição antiga",
    createdAt: "2026-10-01T12:00:00.000Z",
    createdBy: 1,
    leaderId: 2,
    status: "active",
    links: null,
    points: 0,
    logoKey: null,
    bannerKey: null,
  }
}

function notUsed(name: string) {
  return async () => {
    throw new Error(`porta não deveria ser exercitada por este arquivo: ${name}`)
  }
}

vi.mock("@/backend/composition/root", () => {
  const projects: ProjectRepositoryPort = {
    findAll: notUsed("projects.findAll"),
    findByLeaderId: notUsed("projects.findByLeaderId"),
    async findById(id) {
      return mocks.projects.get(id) ?? null
    },
    create: notUsed("projects.create"),
    createWithCronograma: notUsed("projects.createWithCronograma"),
    async update(record) {
      mocks.requests.push({ record })
      return record
    },
    delete: notUsed("projects.delete"),
    incrementPoints: notUsed("projects.incrementPoints"),
  }

  const memberships: ProjectManagementMembershipPort = {
    async findMembership(projectId, userId) {
      return MEMBERSHIPS[`${projectId}:${userId}`] ?? null
    },
    async findActiveMembership(projectId, userId) {
      return ACTIVE[`${projectId}:${userId}`] && MEMBERSHIPS[`${projectId}:${userId}`]
        ? MEMBERSHIPS[`${projectId}:${userId}`]
        : null
    },
    createMembership: notUsed("memberships.createMembership"),
    updateMembershipRoles: notUsed("memberships.updateMembershipRoles"),
    listMembersWithUser: notUsed("memberships.listMembersWithUser"),
    listActiveMemberUserIds: notUsed("memberships.listActiveMemberUserIds"),
  }

  const actors: ProjectActorsPort = {
    async findActor(userId) {
      const roles = ACTOR_ROLES[userId]
      return roles ? { id: userId, roles } : null
    },
  }

  return {
    getBackendComposition: () => ({
      identityAccess: createIdentityAccessModule(),
      projectManagement: createProjectManagementModule({
        ports: {
          projects,
          memberships,
          actors,
          hours: notUsed("hours") as never,
          deliverables: notUsed("deliverables") as never,
          attachments: notUsed("attachments") as never,
          projectDeliverableFiles: notUsed("projectDeliverableFiles") as never,
          cronograma: notUsed("cronograma") as never,
          activityFiles: notUsed("activityFiles") as never,
          tasks: notUsed("tasks") as never,
          economyTasks: notUsed("economyTasks") as never,
          activityAwards: notUsed("activityAwards") as never,
          overdueScan: notUsed("overdueScan") as never,
          overdueNotifier: notUsed("overdueNotifier") as never,
          completionRequests: notUsed("completionRequests") as never,
          completionRequestNotifier: notUsed("completionRequestNotifier") as never,
        },
      }),
    }),
  }
})

vi.mock("@/lib/auth/server-auth", () => ({
  requireAuth: async () =>
    mocks.session === null
      ? {
          user: null,
          error: new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401 }),
        }
      : { user: mocks.session },
}))

import { PUT as UPDATE_DESCRIPTION } from "@/app/api/projects/[id]/description/route"

function login(roles: string[], id: number) {
  mocks.session = { id, email: "user@lab.com", name: "Usuário", roles, status: "active" }
}

function context<T extends Record<string, string>>(params: T) {
  return { params: Promise.resolve(params) }
}

function jsonRequest(method: string, path: string, body: unknown) {
  return new Request(new URL(path, "http://localhost:3000"), {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

const read = async (response: Response) => await response.json()

beforeEach(() => {
  mocks.session = null
  mocks.projects = new Map<number, ProjectRecord>([[10, projectRow(10)]])
  mocks.requests = []
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("PUT de descrição do projeto", () => {
  it("gestão da ACL salva: 200 com a descrição nova", async () => {
    login(["COORDENADOR"], 1)
    const response = await UPDATE_DESCRIPTION(jsonRequest("PUT", "/api/projects/10/description", { description: "**novo corpo**" }), context({ id: "10" }))
    expect(response.status).toBe(200)
    expect((await read(response)).project.description).toBe("**novo corpo**")
    expect(mocks.requests[0].record.description).toBe("**novo corpo**")
  })

  it("membro ATIVO salva: 200", async () => {
    login(["VOLUNTARIO"], 4)
    const response = await UPDATE_DESCRIPTION(jsonRequest("PUT", "/api/projects/10/description", { description: "texto do membro" }), context({ id: "10" }))
    expect(response.status).toBe(200)
    expect((await read(response)).project.description).toBe("texto do membro")
  })

  it("membro INATIVO: 403, nada escrito", async () => {
    login(["VOLUNTARIO"], 5)
    const response = await UPDATE_DESCRIPTION(jsonRequest("PUT", "/api/projects/10/description", { description: "x" }), context({ id: "10" }))
    expect(response.status).toBe(403)
    expect(mocks.requests).toEqual([])
  })

  it("não-membro: 403, nada escrito", async () => {
    login(["VOLUNTARIO"], 6)
    const response = await UPDATE_DESCRIPTION(jsonRequest("PUT", "/api/projects/10/description", { description: "x" }), context({ id: "10" }))
    expect(response.status).toBe(403)
    expect(mocks.requests).toEqual([])
  })

  it("descrição acima de 500: 400 com a frase congelada", async () => {
    login(["COORDENADOR"], 1)
    const response = await UPDATE_DESCRIPTION(jsonRequest("PUT", "/api/projects/10/description", { description: "a".repeat(501) }), context({ id: "10" }))
    expect(response.status).toBe(400)
    expect((await read(response)).error).toBe("Descrição do projeto não pode ter mais de 500 caracteres")
    expect(mocks.requests).toEqual([])
  })

  it("descrição não-string: 400", async () => {
    login(["COORDENADOR"], 1)
    const response = await UPDATE_DESCRIPTION(jsonRequest("PUT", "/api/projects/10/description", { description: 42 }), context({ id: "10" }))
    expect(response.status).toBe(400)
    expect(mocks.requests).toEqual([])
  })

  it("descrição nula limpa a linha", async () => {
    login(["COORDENADOR"], 1)
    const response = await UPDATE_DESCRIPTION(jsonRequest("PUT", "/api/projects/10/description", { description: null }), context({ id: "10" }))
    expect(response.status).toBe(200)
    expect((await read(response)).project.description).toBeNull()
    expect(mocks.requests[0].record.description).toBeNull()
  })

  it("projeto inexistente: 404 antes do gate", async () => {
    login(["COORDENADOR"], 1)
    const response = await UPDATE_DESCRIPTION(jsonRequest("PUT", "/api/projects/99/description", { description: "x" }), context({ id: "99" }))
    expect(response.status).toBe(404)
    expect(mocks.requests).toEqual([])
  })

  it("sem sessão: 401", async () => {
    const response = await UPDATE_DESCRIPTION(jsonRequest("PUT", "/api/projects/10/description", { description: "x" }), context({ id: "10" }))
    expect(response.status).toBe(401)
  })
})
