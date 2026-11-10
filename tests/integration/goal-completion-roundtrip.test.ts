// @vitest-environment node
/**
 * S05 (plan-v21, DEC-260) — G4 roundtrip do cumprimento de meta contra o banco de teste
 * ISOLADO (127.0.0.1:5433; nunca 5432).
 *
 * O que a escrita real tem que provar, e nenhum fake prova:
 *   1. Marcar grava `completedAt` (instantâneo) e `completedBy` na coluna.
 *   2. Desmarcar zera as duas colunas — o cumprimento é estado da linha, não log.
 *   3. `completedBy` é SetNull (espelho `approvedBy` do cronograma, DEC-155): apagar a pessoa
 *      que marcou não apaga a meta, e a linha fica cumprida sem marcador.
 *   4. Não-gestão é recusado; meta de outro projeto é 404.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { prisma } from "@/lib/database/prisma"
import { ForbiddenError, NotFoundError, userActor } from "@/backend/domain"
import { createProjectManagementModule } from "@/backend/modules/project-management"

const projectModule = createProjectManagementModule()

const stamp = Date.now()
let coordId = 0
let markerId = 0
let projectId = 0
let otherProjectId = 0
let goalId = 0
let otherGoalId = 0

describe("G4 roundtrip — cumprimento de meta (isolated test DB)", () => {
  beforeAll(async () => {
    const coord = await prisma.users.create({
      data: {
        name: `S05 Coord ${stamp}`,
        email: `s05-coord-${stamp}@test.local`,
        password: "g4-dummy-hash",
        status: "active",
        roles: ["COORDENADOR"],
      },
      select: { id: true },
    })
    const marker = await prisma.users.create({
      data: {
        name: `S05 Marcador ${stamp}`,
        email: `s05-marker-${stamp}@test.local`,
        password: "g4-dummy-hash",
        status: "active",
        roles: ["VOLUNTARIO"],
      },
      select: { id: true },
    })
    coordId = coord.id
    markerId = marker.id

    const project = await projectModule.createProject({
      actor: userActor(coordId, ["COORDENADOR"]),
      actorId: coordId,
      data: {
        name: `S05 Project ${stamp}`,
        description: "roundtrip",
        status: "active" as never,
        leaderId: coordId,
        links: null,
      },
      volunteerIds: [],
    })
    projectId = project.id!

    const other = await projectModule.createProject({
      actor: userActor(coordId, ["COORDENADOR"]),
      actorId: coordId,
      data: {
        name: `S05 Outro Project ${stamp}`,
        description: "roundtrip",
        status: "active" as never,
        leaderId: coordId,
        links: null,
      },
      volunteerIds: [],
    })
    otherProjectId = other.id!

    // O marcador é gestão DO PROJETO pela membership — a mesma autoridade que a tela usa.
    await prisma.project_members.create({
      data: { projectId, userId: markerId, roles: ["GERENTE_PROJETO"] },
    })
  })

  afterAll(async () => {
    for (const id of [projectId, otherProjectId]) {
      if (id) {
        await prisma.project_members.deleteMany({ where: { projectId: id } })
        await prisma.projects.delete({ where: { id } })
      }
    }
    for (const id of [coordId, markerId]) {
      if (id) await prisma.users.deleteMany({ where: { id } })
    }
  })

  it("marcar grava completedAt e completedBy na coluna", async () => {
    const goal = await projectModule.createProjectGoal({
      projectId,
      actorId: coordId,
      description: `Meta S05 ${stamp}`,
      target: 1,
    })
    goalId = goal.id!

    const marked = await projectModule.markGoalCompletion({
      projectId,
      goalId,
      actorId: coordId,
      completed: true,
      now: new Date("2026-11-09T18:00:00.000Z"),
    })
    expect(marked.completedAt).toBe("2026-11-09T18:00:00.000Z")
    expect(marked.completedBy).toBe(coordId)

    const row = await prisma.project_goals.findUnique({ where: { id: goalId } })
    expect(row?.completedAt?.toISOString()).toBe("2026-11-09T18:00:00.000Z")
    expect(row?.completedBy).toBe(coordId)
  })

  it("desmarcar zera as duas colunas", async () => {
    const unmarked = await projectModule.markGoalCompletion({
      projectId,
      goalId,
      actorId: coordId,
      completed: false,
      now: new Date("2026-11-10T12:00:00.000Z"),
    })
    expect(unmarked.completedAt).toBeNull()
    expect(unmarked.completedBy).toBeNull()

    const row = await prisma.project_goals.findUnique({ where: { id: goalId } })
    expect(row?.completedAt).toBeNull()
    expect(row?.completedBy).toBeNull()
  })

  it("não-gestão é recusada antes de escrever", async () => {
    const outsider = await prisma.users.create({
      data: {
        name: `S05 Estranho ${stamp}`,
        email: `s05-outsider-${stamp}@test.local`,
        password: "g4-dummy-hash",
        status: "active",
        roles: ["VOLUNTARIO"],
      },
      select: { id: true },
    })
    await expect(
      projectModule.markGoalCompletion({
        projectId,
        goalId,
        actorId: outsider.id,
        completed: true,
        now: new Date("2026-11-10T12:00:00.000Z"),
      })
    ).rejects.toThrow(ForbiddenError)
    const row = await prisma.project_goals.findUnique({ where: { id: goalId } })
    expect(row?.completedBy).toBeNull()
    await prisma.users.delete({ where: { id: outsider.id } })
  })

  it("meta de outro projeto é 404", async () => {
    const otherGoal = await projectModule.createProjectGoal({
      projectId: otherProjectId,
      actorId: coordId,
      description: `Meta vizinha S05 ${stamp}`,
      target: null,
    })
    otherGoalId = otherGoal.id!
    await expect(
      projectModule.markGoalCompletion({
        projectId,
        goalId: otherGoalId,
        actorId: coordId,
        completed: true,
        now: new Date("2026-11-10T12:00:00.000Z"),
      })
    ).rejects.toThrow(NotFoundError)
  })

  it("completedBy é SetNull: a meta sobrevive sem marcador quando a pessoa sai", async () => {
    const marked = await projectModule.markGoalCompletion({
      projectId,
      goalId,
      actorId: markerId,
      completed: true,
      now: new Date("2026-11-09T18:00:00.000Z"),
    })
    expect(marked.completedBy).toBe(markerId)

    await prisma.users.delete({ where: { id: markerId } })

    const row = await prisma.project_goals.findUnique({ where: { id: goalId } })
    expect(row).not.toBeNull()
    expect(row?.completedAt?.toISOString()).toBe("2026-11-09T18:00:00.000Z")
    expect(row?.completedBy).toBeNull()
  })
})
