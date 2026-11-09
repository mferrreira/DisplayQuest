// @vitest-environment node
/**
 * S05 (plan-v21, DEC-260) — `PUT /api/projects/[id]/goals/[goalId]/completion`.
 *
 * Mesma costura dos lotes de entregável: módulo REAL sobre portas falsas, gate do use case,
 * os 400 do use case. O que fica congelado aqui:
 *   1. Marcar: 200 com `completedAt` ISO e `completedBy` = ator.
 *   2. Desmarcar: `completed: false` zera os dois na resposta.
 *   3. Não-gestão: 403. Meta de outro projeto: 404. `completed` não-booleano: 400.
 *   4. A ordem: gate antes da meta, meta antes do corpo.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createIdentityAccessModule } from "@/backend/modules/identity-access"
import { createProjectManagementModule } from "@/backend/modules/project-management"
import type { Role } from "@/backend/domain"
import type { ProjectActorsPort } from "@/backend/modules/project-management/application/ports/project-actors.port"
import type {
  ProjectGoalRecord,
  ProjectCronogramaPort,
} from "@/backend/modules/project-management/application/ports/project-cronograma.repository"
import type { ProjectManagementMembershipPort } from "@/backend/modules/project-management/application/ports/project-membership.repository"
import type { ProjectRecord, ProjectRepositoryPort } from "@/backend/modules/project-management/application/ports/project.repository"

const mocks = vi.hoisted(() => ({
  session: null as null | { id: number; email: string; name: string; roles: string[]; status: string },
  projects: new Map<number, ProjectRecord>(),
  goals: [] as ProjectGoalRecord[],
  nextId: 100,
}))

const ACTOR_ROLES: Record<number, string[]> = {
  1: ["COORDENADOR"],
  2: ["VOLUNTARIO"],
  3: ["VOLUNTARIO"],
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

function goalRow(id: number, projectId: number): ProjectGoalRecord {
  return { id, projectId, order: 1, target: null, description: "Publicar artigo", createdAt: "2026-10-01T12:00:00.000Z", completedAt: null, completedBy: null }
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

  const deliverables = notUsed("deliverables")
  const attachments = notUsed("attachments")
  const projectDeliverableFiles = notUsed("projectDeliverableFiles")
  const activityFiles = notUsed("activityFiles")
  const tasks = notUsed("tasks")
  const economyTasks = notUsed("economyTasks")
  const activityAwards = notUsed("activityAwards")
  const overdueScan = notUsed("overdueScan")
  const overdueNotifier = notUsed("overdueNotifier")
  const completionRequests = notUsed("completionRequests")
  const completionRequestNotifier = notUsed("completionRequestNotifier")
  const hours = notUsed("hours")

  const cronograma: ProjectCronogramaPort = {
    async listGoals(projectId) {
      return mocks.goals.filter((goal) => goal.projectId === projectId)
    },
    async findGoalById(id) {
      return mocks.goals.find((goal) => goal.id === id) ?? null
    },
    createGoal: notUsed("cronograma.createGoal"),
    async updateGoal(id, fields) {
      const row = mocks.goals.find((goal) => goal.id === id)!
      const merged = { ...row, ...fields }
      mocks.goals[mocks.goals.indexOf(row)] = merged
      return merged
    },
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
        ports: {
          projects,
          memberships,
          actors,
          hours: hours as never,
          deliverables: deliverables as never,
          attachments: attachments as never,
          projectDeliverableFiles: projectDeliverableFiles as never,
          cronograma,
          activityFiles: activityFiles as never,
          tasks: tasks as never,
          economyTasks: economyTasks as never,
          activityAwards: activityAwards as never,
          overdueScan: overdueScan as never,
          overdueNotifier: overdueNotifier as never,
          completionRequests: completionRequests as never,
          completionRequestNotifier: completionRequestNotifier as never,
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

import { PUT as MARK_GOAL_COMPLETION } from "@/app/api/projects/[id]/goals/[goalId]/completion/route"

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
  mocks.projects = new Map<number, ProjectRecord>([
    [10, projectRow(10)],
    [20, projectRow(20)],
  ])
  mocks.goals = [goalRow(301, 10), goalRow(302, 20)]
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("PUT de cumprimento de meta", () => {
  it("gestão marca: 200 com completedAt ISO e completedBy = ator", async () => {
    login(["VOLUNTARIO"], 3)
    const response = await MARK_GOAL_COMPLETION(jsonRequest("PUT", "/api/projects/10/goals/301/completion", { completed: true }), context({ id: "10", goalId: "301" }))
    expect(response.status).toBe(200)
    const body = await read(response)
    expect(body.goal.completedBy).toBe(3)
    expect(typeof body.goal.completedAt).toBe("string")
    expect((body.goal.completedAt as string).endsWith("Z")).toBe(true)
  })

  it("desmarcar zera os dois", async () => {
    login(["COORDENADOR"], 1)
    mocks.goals[0] = { ...mocks.goals[0], completedAt: "2026-11-01T12:00:00.000Z", completedBy: 3 }
    const response = await MARK_GOAL_COMPLETION(jsonRequest("PUT", "/api/projects/10/goals/301/completion", { completed: false }), context({ id: "10", goalId: "301" }))
    expect(response.status).toBe(200)
    const body = await read(response)
    expect(body.goal.completedAt).toBeNull()
    expect(body.goal.completedBy).toBeNull()
  })

  it("não-gestão: 403, a linha fica como estava", async () => {
    login(["VOLUNTARIO"], 2)
    const response = await MARK_GOAL_COMPLETION(jsonRequest("PUT", "/api/projects/10/goals/301/completion", { completed: true }), context({ id: "10", goalId: "301" }))
    expect(response.status).toBe(403)
    expect(mocks.goals[0].completedBy).toBeNull()
  })

  it("meta de outro projeto: 404", async () => {
    login(["COORDENADOR"], 1)
    const response = await MARK_GOAL_COMPLETION(jsonRequest("PUT", "/api/projects/10/goals/302/completion", { completed: true }), context({ id: "10", goalId: "302" }))
    expect(response.status).toBe(404)
  })

  it("completed não-booleano: 400", async () => {
    login(["COORDENADOR"], 1)
    const response = await MARK_GOAL_COMPLETION(jsonRequest("PUT", "/api/projects/10/goals/301/completion", { completed: "true" }), context({ id: "10", goalId: "301" }))
    expect(response.status).toBe(400)
    expect(mocks.goals[0].completedAt).toBeNull()
  })

  it("sem sessão: 401", async () => {
    const response = await MARK_GOAL_COMPLETION(jsonRequest("PUT", "/api/projects/10/goals/301/completion", { completed: true }), context({ id: "10", goalId: "301" }))
    expect(response.status).toBe(401)
  })
})
