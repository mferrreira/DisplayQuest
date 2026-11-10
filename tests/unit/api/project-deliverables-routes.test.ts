// @vitest-environment node
/**
 * S04 (plan-v21, DEC-259) — entregável sabe a que meta pertence.
 *
 * Mesma costura do lote de arquivos de entregável: o módulo é REAL sobre portas falsas, o gate
 * é do use case, e os 400 são do domínio. O que este arquivo congela:
 *   1. `goalId` do MESMO projeto entra (201); de OUTRO projeto é 400 com a frase do domínio —
 *      a regra é `deliverableGoalLinkError`, não a rota.
 *   2. `goalId` nulo é meta normal: POST sem meta e PUT tirando a meta funcionam.
 *   3. A lista devolve `goalId` — a tela do painel monta o Select com ele.
 *   4. Quem não gerencia não escreve meta: 403, e o vínculo fica como estava.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createIdentityAccessModule } from "@/backend/modules/identity-access"
import { createProjectManagementModule } from "@/backend/modules/project-management"
import type { Role } from "@/backend/domain"
import type { ProjectActorsPort } from "@/backend/modules/project-management/application/ports/project-actors.port"
import type {
  ProjectDeliverableRecord,
  ProjectDeliverablesPort,
} from "@/backend/modules/project-management/application/ports/project-deliverables.repository"
import type {
  ProjectGoalRecord,
  ProjectCronogramaPort,
} from "@/backend/modules/project-management/application/ports/project-cronograma.repository"
import type { ProjectManagementMembershipPort } from "@/backend/modules/project-management/application/ports/project-membership.repository"
import type { ProjectRecord, ProjectRepositoryPort } from "@/backend/modules/project-management/application/ports/project.repository"

const mocks = vi.hoisted(() => ({
  session: null as null | { id: number; email: string; name: string; roles: string[]; status: string },
  projects: new Map<number, ProjectRecord>(),
  deliverables: [] as Array<ProjectDeliverableRecord & { goalId: number | null }>,
  goals: [] as ProjectGoalRecord[],
  nextId: 100,
}))

// Atores do cenário (mesma régua dos anexos): 1 gerencia pelo papel global, 3 gerencia pela
// membership, 4 não gerencia nada.
const ACTOR_ROLES: Record<number, string[]> = {
  1: ["COORDENADOR"],
  2: ["VOLUNTARIO"],
  3: ["VOLUNTARIO"],
  4: ["VOLUNTARIO"],
}
const MEMBERSHIPS: Record<string, { id: number; roles: Role[] }> = {
  "10:3": { id: 30, roles: ["GERENTE_PROJETO"] },
}

function projectRow(id = 10): ProjectRecord {
  return {
    id,
    name: "Projeto",
    description: null,
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
    update: notUsed("projects.update"),
    delete: notUsed("projects.delete"),
    incrementPoints: notUsed("projects.incrementPoints"),
  }

  const memberships: ProjectManagementMembershipPort = {
    async findMembership(projectId, userId) {
      return MEMBERSHIPS[`${projectId}:${userId}`] ?? null
    },
    findActiveMembership: async () => null,
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

  const deliverables: ProjectDeliverablesPort = {
    async listByProjectId(projectId) {
      return mocks.deliverables.filter((row) => row.projectId === projectId)
    },
    async findById(id) {
      return mocks.deliverables.find((row) => row.id === id) ?? null
    },
    async create(input) {
      const row = {
        id: ++mocks.nextId,
        projectId: input.projectId,
        name: input.name,
        quantity: input.quantity,
        createdAt: "2026-11-09T12:00:00.000Z",
        goalId: (input as { goalId?: number | null }).goalId ?? null,
      }
      mocks.deliverables.push(row)
      return row
    },
    async update(id, fields) {
      const row = mocks.deliverables.find((item) => item.id === id)!
      const merged = { ...row, ...fields }
      mocks.deliverables[mocks.deliverables.indexOf(row)] = merged
      return merged
    },
    async delete(id) {
      mocks.deliverables = mocks.deliverables.filter((row) => row.id !== id)
    },
  }

  const cronograma: ProjectCronogramaPort = {
    async listGoals(projectId) {
      return mocks.goals.filter((goal) => goal.projectId === projectId)
    },
    async findGoalById(id) {
      return mocks.goals.find((goal) => goal.id === id) ?? null
    },
    createGoal: notUsed("cronograma.createGoal"),
    updateGoal: notUsed("cronograma.updateGoal"),
    deleteGoal: notUsed("cronograma.deleteGoal"),
    listActivities: notUsed("cronograma.listActivities"),
    listAllActivities: notUsed("cronograma.listAllActivities"),
    findActivityById: notUsed("cronograma.findActivityById"),
    createActivity: notUsed("cronograma.createActivity"),
    updateActivity: notUsed("cronograma.updateActivity"),
    requestActivity: notUsed("cronograma.requestActivity"),
    approveActivity: notUsed("cronograma.approveActivity"),
    deleteActivity: notUsed("cronograma.deleteActivity"),
  }

  return {
    getBackendComposition: () => ({
      identityAccess: createIdentityAccessModule(),
      projectManagement: createProjectManagementModule({
        ports: { projects, memberships, actors, deliverables, cronograma },
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

import { GET as LIST_DELIVERABLES, POST as CREATE_DELIVERABLE } from "@/app/api/projects/[id]/deliverables/route"
import { PUT as UPDATE_DELIVERABLE } from "@/app/api/projects/[id]/deliverables/[deliverableId]/route"

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

const GOAL_MESSAGE = "Meta não pertence a este projeto"

beforeEach(() => {
  mocks.session = null
  mocks.projects = new Map<number, ProjectRecord>([
    [10, projectRow(10)],
    [20, projectRow(20)],
  ])
  mocks.deliverables = [
    { id: 101, projectId: 10, name: "Relatório parcial", quantity: 1, createdAt: "2026-10-01T12:00:00.000Z", goalId: null },
    { id: 102, projectId: 20, name: "Entregável de outro projeto", quantity: 2, createdAt: "2026-10-01T12:00:00.000Z", goalId: null },
  ]
  mocks.goals = [
    { id: 201, projectId: 10, order: 1, target: 2, description: "Dois artigos", createdAt: "2026-10-01T12:00:00.000Z", completedAt: null, completedBy: null },
    { id: 202, projectId: 20, order: 1, target: null, description: "Meta de outro projeto", createdAt: "2026-10-01T12:00:00.000Z", completedAt: null, completedBy: null },
  ]
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("POST cria entregável com meta", () => {
  it("meta do mesmo projeto: 201 com goalId", async () => {
    login(["COORDENADOR"], 1)
    const response = await CREATE_DELIVERABLE(jsonRequest("POST", "/api/projects/10/deliverables", { name: "Dataset", quantity: 1, goalId: 201 }), context({ id: "10" }))
    expect(response.status).toBe(201)
    const body = await read(response)
    expect(body.deliverable.goalId).toBe(201)
  })

  it("meta de OUTRO projeto: 400 com a frase do domínio, nada criado", async () => {
    login(["COORDENADOR"], 1)
    const response = await CREATE_DELIVERABLE(jsonRequest("POST", "/api/projects/10/deliverables", { name: "Dataset", quantity: 1, goalId: 202 }), context({ id: "10" }))
    expect(response.status).toBe(400)
    expect((await read(response)).error).toBe(GOAL_MESSAGE)
    expect(mocks.deliverables.filter((row) => row.id > 102)).toEqual([])
  })

  it("meta inexistente: 400 com a mesma frase", async () => {
    login(["COORDENADOR"], 1)
    const response = await CREATE_DELIVERABLE(jsonRequest("POST", "/api/projects/10/deliverables", { name: "Dataset", quantity: 1, goalId: 999 }), context({ id: "10" }))
    expect(response.status).toBe(400)
    expect((await read(response)).error).toBe(GOAL_MESSAGE)
  })

  it("sem meta: 201 com goalId nulo", async () => {
    login(["COORDENADOR"], 1)
    const response = await CREATE_DELIVERABLE(jsonRequest("POST", "/api/projects/10/deliverables", { name: "Dataset", quantity: 1 }), context({ id: "10" }))
    expect(response.status).toBe(201)
    expect((await read(response)).deliverable.goalId).toBeNull()
  })
})

describe("PUT move ou tira a meta", () => {
  it("gerência põe a meta do projeto: 200 com goalId", async () => {
    login(["VOLUNTARIO"], 3)
    const response = await UPDATE_DELIVERABLE(jsonRequest("PUT", "/api/projects/10/deliverables/101", { goalId: 201 }), context({ id: "10", deliverableId: "101" }))
    expect(response.status).toBe(200)
    expect((await read(response)).deliverable.goalId).toBe(201)
  })

  it("tirar a meta: goalId nulo é aceito", async () => {
    login(["VOLUNTARIO"], 3)
    const response = await UPDATE_DELIVERABLE(jsonRequest("PUT", "/api/projects/10/deliverables/101", { goalId: null }), context({ id: "10", deliverableId: "101" }))
    expect(response.status).toBe(200)
    expect((await read(response)).deliverable.goalId).toBeNull()
  })

  it("meta de outro projeto: 400, o vínculo fica como estava", async () => {
    login(["VOLUNTARIO"], 3)
    const response = await UPDATE_DELIVERABLE(jsonRequest("PUT", "/api/projects/10/deliverables/101", { goalId: 202 }), context({ id: "10", deliverableId: "101" }))
    expect(response.status).toBe(400)
    expect((await read(response)).error).toBe(GOAL_MESSAGE)
    expect(mocks.deliverables.find((row) => row.id === 101)!.goalId).toBeNull()
  })

  it("quem não gerencia: 403, o vínculo fica", async () => {
    login(["VOLUNTARIO"], 4)
    const response = await UPDATE_DELIVERABLE(jsonRequest("PUT", "/api/projects/10/deliverables/101", { goalId: 201 }), context({ id: "10", deliverableId: "101" }))
    expect(response.status).toBe(403)
    expect(mocks.deliverables.find((row) => row.id === 101)!.goalId).toBeNull()
  })
})

describe("GET lista devolve goalId", () => {
  it("a lista do autenticado traz o vínculo", async () => {
    login(["VOLUNTARIO"], 4)
    mocks.deliverables[0] = { ...mocks.deliverables[0], goalId: 201 }
    const response = await LIST_DELIVERABLES(new Request("http://localhost:3000/api/projects/10/deliverables"), context({ id: "10" }))
    expect(response.status).toBe(200)
    const body = await read(response)
    expect(body.deliverables.find((d: { id: number }) => d.id === 101).goalId).toBe(201)
  })
})
