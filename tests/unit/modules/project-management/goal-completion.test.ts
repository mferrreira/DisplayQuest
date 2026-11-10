// @vitest-environment node
/**
 * S05 (plan-v21, DEC-260) — meta marcável como cumprida pela gestão.
 *
 * O uso prova a ordem medida do use case: projeto 404 -> gate de gestão 403 -> meta 404 (id
 * de outro projeto NÃO é "achei e marquei") -> corpo. Marcar grava `completedAt` (o `now` que
 * o comando traz, nunca `new Date()` solto) e `completedBy` = ator. Desmarcar zera os dois —
 * o cumprimento é estado da linha, não log: a linha diz "cumprida" só enquanto está marcada.
 */
import { describe, expect, it } from "vitest"

import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/backend/domain"
import { MarkGoalCompletionUseCase } from "@/backend/modules/project-management/application/use-cases/mark-goal-completion.use-case"

import type { ProjectActorsPort } from "@/backend/modules/project-management/application/ports/project-actors.port"
import type { ProjectCronogramaPort, ProjectGoalRecord } from "@/backend/modules/project-management/application/ports/project-cronograma.repository"
import type { ProjectManagementMembershipPort } from "@/backend/modules/project-management/application/ports/project-membership.repository"
import type { ProjectRecord, ProjectRepositoryPort } from "@/backend/modules/project-management/application/ports/project.repository"

const NOT_NOW = new Date("2026-11-09T18:00:00.000Z")

function goal(id: number, projectId: number, completedAt: string | null, completedBy: number | null): ProjectGoalRecord {
  return { id, projectId, order: 1, target: null, description: "Publicar artigo", createdAt: "2026-10-01T12:00:00.000Z", completedAt, completedBy }
}

function build(params: {
  goals: ProjectGoalRecord[]
  managed?: boolean
  written?: Array<{ id: number; completedAt: string | null; completedBy: number | null }>
}) {
  const goalRows = [...params.goals]
  const projects: ProjectRepositoryPort = {
    findById: async (id) => (id === 10 ? ({ id, name: "P", description: null, createdAt: "2026-10-01T12:00:00.000Z", createdBy: 1, leaderId: 1, status: "active", links: null, points: 0, logoKey: null, bannerKey: null } as ProjectRecord) : null),
    findAll: async () => [],
    findByLeaderId: async () => [],
    create: async () => null as never,
    createWithCronograma: async () => null as never,
    update: async () => null as never,
    delete: async () => undefined,
    incrementPoints: async () => 0,
  }
  const memberships: ProjectManagementMembershipPort = {
    findMembership: async () => null,
    findActiveMembership: async () => null,
    createMembership: async () => null as never,
    updateMembershipRoles: async () => undefined,
    listMembersWithUser: async () => [],
    listActiveMemberUserIds: async () => [],
  }
  const actors: ProjectActorsPort = {
    findActor: async (id) => ({ id, roles: ["VOLUNTARIO"] }),
  }
  const cronograma: ProjectCronogramaPort = {
    listGoals: async () => goalRows,
    findGoalById: async (id) => goalRows.find((row) => row.id === id) ?? null,
    createGoal: async () => null as never,
    updateGoal: async (id, fields) => {
      const row = goalRows.find((item) => item.id === id)!
      const merged = { ...row, ...fields }
      goalRows[goalRows.indexOf(row)] = merged
      params.written?.push({ id, completedAt: merged.completedAt, completedBy: merged.completedBy })
      return merged
    },
    deleteGoal: async () => undefined,
    listActivities: async () => [],
    listAllActivities: async () => [],
    findActivityById: async () => null,
    createActivity: async () => null as never,
    updateActivity: async () => null as never,
    requestActivity: async () => null as never,
    approveActivity: async () => null as never,
    deleteActivity: async () => undefined,
  }
  // Gerência vem da função de gestão real com membership de gestor do projeto.
  if (params.managed) {
    memberships.findMembership = async () => ({ id: 30, roles: ["GERENTE_PROJETO"] })
  }
  return new MarkGoalCompletionUseCase({ projects, memberships, actors, cronograma })
}

describe("marcar meta como cumprida", () => {
  it("gestão marca: completedAt = now ISO, completedBy = ator", async () => {
    const written: Array<{ id: number; completedAt: string | null; completedBy: number | null }> = []
    const useCase = build({ goals: [goal(301, 10, null, null)], managed: true, written })
    const goalRow = await useCase.execute({ projectId: 10, goalId: 301, actorId: 5, completed: true, now: NOT_NOW })
    expect(goalRow.completedAt).toBe("2026-11-09T18:00:00.000Z")
    expect(goalRow.completedBy).toBe(5)
    expect(written[0]).toEqual({ id: 301, completedAt: "2026-11-09T18:00:00.000Z", completedBy: 5 })
  })

  it("desmarcar zera os dois campos", async () => {
    const written: Array<{ id: number; completedAt: string | null; completedBy: number | null }> = []
    const useCase = build({ goals: [goal(301, 10, "2026-11-01T12:00:00.000Z", 5)], managed: true, written })
    const goalRow = await useCase.execute({ projectId: 10, goalId: 301, actorId: 5, completed: false, now: NOT_NOW })
    expect(goalRow.completedAt).toBeNull()
    expect(goalRow.completedBy).toBeNull()
    expect(written[0]).toEqual({ id: 301, completedAt: null, completedBy: null })
  })

  it("sem gestão: 403, nada escrito", async () => {
    const written: Array<{ id: number; completedAt: string | null; completedBy: number | null }> = []
    const useCase = build({ goals: [goal(301, 10, null, null)], managed: false, written })
    await expect(useCase.execute({ projectId: 10, goalId: 301, actorId: 5, completed: true, now: NOT_NOW })).rejects.toThrow(ForbiddenError)
    expect(written).toEqual([])
  })

  it("meta de outro projeto: 404", async () => {
    const useCase = build({ goals: [goal(302, 11, null, null)], managed: true })
    await expect(useCase.execute({ projectId: 10, goalId: 302, actorId: 5, completed: true, now: NOT_NOW })).rejects.toThrow(NotFoundError)
  })

  it("projeto inexistente: 404 antes de tudo", async () => {
    const useCase = build({ goals: [goal(301, 10, null, null)], managed: true })
    await expect(useCase.execute({ projectId: 99, goalId: 301, actorId: 5, completed: true, now: NOT_NOW })).rejects.toThrow(NotFoundError)
  })

  it("corpo com completed não-booleano: 400, nada escrito", async () => {
    const written: Array<{ id: number; completedAt: string | null; completedBy: number | null }> = []
    const useCase = build({ goals: [goal(301, 10, null, null)], managed: true, written })
    await expect(useCase.execute({ projectId: 10, goalId: 301, actorId: 5, completed: "true", now: NOT_NOW })).rejects.toThrow(ValidationError)
    expect(written).toEqual([])
  })
})
