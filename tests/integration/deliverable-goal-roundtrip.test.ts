// @vitest-environment node
/**
 * S04 (plan-v21, DEC-259) — G4 roundtrip do vínculo entregável↔meta contra o banco de teste
 * ISOLADO (127.0.0.1:5433 — DEC-10/BLOCKER-02; nunca 5432).
 *
 * O que a escrita real de Prisma tem que provar, e nenhum teste de fake prova:
 *   1. `goalId` do mesmo projeto é gravado na linha.
 *   2. Meta de OUTRO projeto é recusada pelo domínio ANTES de escrever.
 *   3. A FK é SetNull: apagar a meta deixa o entregável VIVO com `goalId` nulo — a linha do
 *      entregável não é parte da meta (meta é plano, entregável é o que se entrega), e o
 *      cadastro do projeto não pode sumir junto com o plano.
 *   4. Tirar a meta (`goalId: null`) é escrita legítima.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { prisma } from "@/lib/database/prisma"
import { NotFoundError, ValidationError, userActor } from "@/backend/domain"
import { createProjectManagementModule } from "@/backend/modules/project-management"

const projectModule = createProjectManagementModule()

const stamp = Date.now()
let coordId = 0
let volunteerId = 0
let projectId = 0
let otherProjectId = 0
let goalId = 0
let otherGoalId = 0
let deliverableId = 0

describe("G4 roundtrip — vínculo entregável ↔ meta (isolated test DB)", () => {
  beforeAll(async () => {
    const coord = await prisma.users.create({
      data: {
        name: `S04 Coord ${stamp}`,
        email: `s04-coord-${stamp}@test.local`,
        password: "g4-dummy-hash",
        status: "active",
        roles: ["COORDENADOR"],
      },
      select: { id: true },
    })
    const volunteer = await prisma.users.create({
      data: {
        name: `S04 Voluntário ${stamp}`,
        email: `s04-vol-${stamp}@test.local`,
        password: "g4-dummy-hash",
        status: "active",
        roles: ["VOLUNTARIO"],
      },
      select: { id: true },
    })
    coordId = coord.id
    volunteerId = volunteer.id

    const project = await projectModule.createProject({
      actor: userActor(coordId, ["COORDENADOR"]),
      actorId: coordId,
      data: {
        name: `S04 Project ${stamp}`,
        description: "roundtrip",
        status: "active" as never,
        leaderId: coordId,
        links: null,
      },
      volunteerIds: [volunteerId],
    })
    projectId = project.id!

    const other = await projectModule.createProject({
      actor: userActor(coordId, ["COORDENADOR"]),
      actorId: coordId,
      data: {
        name: `S04 Outro Project ${stamp}`,
        description: "roundtrip",
        status: "active" as never,
        leaderId: coordId,
        links: null,
      },
      volunteerIds: [volunteerId],
    })
    otherProjectId = other.id!
  })

  afterAll(async () => {
    for (const id of [projectId, otherProjectId]) {
      if (id) {
        await prisma.project_members.deleteMany({ where: { projectId: id } })
        await prisma.projects.delete({ where: { id } })
      }
    }
    for (const id of [coordId, volunteerId]) {
      if (id) await prisma.users.delete({ where: { id } })
    }
  })

  it("meta do mesmo projeto entra na linha, com meta normal", async () => {
    const goal = await projectModule.createProjectGoal({
      projectId,
      actorId: coordId,
      description: "Dois artigos submetidos",
      target: 2,
    })
    goalId = goal.id!

    const deliverable = await projectModule.createProjectDeliverable({
      projectId,
      actorId: coordId,
      name: "Relatório parcial",
      quantity: 1,
      goalId,
    })
    deliverableId = deliverable.id!

    expect(deliverable.goalId).toBe(goalId)
    const row = await prisma.project_deliverables.findUnique({ where: { id: deliverableId } })
    expect(row?.goalId).toBe(goalId)
  })

  it("meta de OUTRO projeto é recusada antes de escrever", async () => {
    const otherGoal = await projectModule.createProjectGoal({
      projectId: otherProjectId,
      actorId: coordId,
      description: "Meta vizinha",
      target: null,
    })
    otherGoalId = otherGoal.id!

    await expect(
      projectModule.createProjectDeliverable({
        projectId,
        actorId: coordId,
        name: "Entregável com meta vizinha",
        quantity: 1,
        goalId: otherGoalId,
      })
    ).rejects.toThrow(ValidationError)

    const rows = await prisma.project_deliverables.findMany({
      where: { projectId, name: "Entregável com meta vizinha" },
    })
    expect(rows).toEqual([])
  })

  it("meta inexistente é recusada com a mesma frase", async () => {
    await expect(
      projectModule.createProjectDeliverable({
        projectId,
        actorId: coordId,
        name: "Entregável com meta fantasma",
        quantity: 1,
        goalId: 999999,
      })
    ).rejects.toThrow("Meta não pertence a este projeto")
  })

  it("tirar a meta é escrita legítima", async () => {
    const updated = await projectModule.updateProjectDeliverable({
      projectId,
      deliverableId,
      actorId: coordId,
      goalId: null,
    })
    expect(updated.goalId).toBeNull()
    const row = await prisma.project_deliverables.findUnique({ where: { id: deliverableId } })
    expect(row?.goalId).toBeNull()
  })

  it("apagar a meta deixa o entregável vivo sem meta (SetNull, não cascade)", async () => {
    const updated = await projectModule.updateProjectDeliverable({
      projectId,
      deliverableId,
      actorId: coordId,
      goalId,
    })
    expect(updated.goalId).toBe(goalId)

    await projectModule.deleteProjectGoal({ projectId, goalId, actorId: coordId })

    const row = await prisma.project_deliverables.findUnique({ where: { id: deliverableId } })
    expect(row).not.toBeNull() // a linha do entregável sobreviveu à meta
    expect(row?.goalId).toBeNull() // e ficou sem meta
    expect(await prisma.project_goals.findUnique({ where: { id: goalId } })).toBeNull()
  })

  it("meta de entregável de outro projeto continua fora do alcance", async () => {
    const otherDeliverable = await projectModule.createProjectDeliverable({
      projectId: otherProjectId,
      actorId: coordId,
      name: "Entregável vizinho",
      quantity: 1,
    })
    await expect(
      projectModule.updateProjectDeliverable({
        projectId,
        deliverableId: otherDeliverable.id!,
        actorId: coordId,
        goalId,
      })
    ).rejects.toThrow(NotFoundError)
  })
})
