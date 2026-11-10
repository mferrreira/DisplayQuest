// @vitest-environment node
/**
 * S06 (plan-v21, R9/DEC-261) — G4 roundtrip da porta de descrição contra o banco de teste
 * ISOLADO (127.0.0.1:5433; nunca 5432).
 *
 * O que a escrita real tem que provar, e nenhum fake prova: a situação do vínculo decide.
 *   1. Membro com `situacao = ATIVO` escreve a descrição.
 *   2. Membro com `situacao = INATIVO` é recusado com a MESMA frase de autoridade — e a
 *      descrição não muda. (O fake da rota não exercita o `situacao` do adapter Prisma.)
 *   3. Não-membro sem gestão é recusado.
 *   4. Gestão da ACL escreve, e `null` limpa a linha.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { prisma } from "@/lib/database/prisma"
import { ForbiddenError, userActor } from "@/backend/domain"
import { createProjectManagementModule } from "@/backend/modules/project-management"

const projectModule = createProjectManagementModule()

const stamp = Date.now()
let coordId = 0
let activeId = 0
let inactiveId = 0
let outsiderId = 0
let projectId = 0

describe("G4 roundtrip — porta de descrição (isolated test DB)", () => {
  beforeAll(async () => {
    const users = await Promise.all(
      [
        { name: `S06 Coord ${stamp}`, roles: ["COORDENADOR"] },
        { name: `S06 Ativo ${stamp}`, roles: ["VOLUNTARIO"] },
        { name: `S06 Inativo ${stamp}`, roles: ["VOLUNTARIO"] },
        { name: `S06 Estranho ${stamp}`, roles: ["VOLUNTARIO"] },
      ].map((u) =>
        prisma.users.create({
          data: {
            name: u.name,
            email: `${u.name.toLowerCase().replace(/\s+/g, "-")}@test.local`,
            password: "g4-dummy-hash",
            status: "active",
            roles: u.roles as never,
          },
          select: { id: true },
        }),
      ),
    )
    coordId = users[0].id
    activeId = users[1].id
    inactiveId = users[2].id
    outsiderId = users[3].id

    const project = await projectModule.createProject({
      actor: userActor(coordId, ["COORDENADOR"]),
      actorId: coordId,
      data: {
        name: `S06 Project ${stamp}`,
        description: "descrição inicial",
        status: "active" as never,
        leaderId: coordId,
        links: null,
      },
      volunteerIds: [],
    })
    projectId = project.id!

    await prisma.project_members.create({
      data: { projectId, userId: activeId, roles: ["VOLUNTARIO"], situacao: "ATIVO", joinedAt: new Date(), dataEntrada: new Date().toISOString().slice(0, 10) },
    })
    await prisma.project_members.create({
      data: { projectId, userId: inactiveId, roles: ["VOLUNTARIO"], situacao: "INATIVO", joinedAt: new Date(), dataEntrada: new Date().toISOString().slice(0, 10) },
    })
  })

  afterAll(async () => {
    await prisma.project_members.deleteMany({ where: { projectId } })
    await prisma.projects.deleteMany({ where: { id: projectId } })
    await prisma.users.deleteMany({ where: { id: { in: [coordId, activeId, inactiveId, outsiderId] } } })
  })

  async function readDescription() {
    const row = await prisma.projects.findUnique({ where: { id: projectId }, select: { description: true } })
    return row?.description ?? null
  }

  it("membro ATIVO escreve a descrição pela porta da gestão do projeto", async () => {
    await projectModule.updateProjectDescription({
      projectId,
      actorId: activeId,
      description: "novo corpo do membro ativo",
    })
    expect(await readDescription()).toBe("novo corpo do membro ativo")
  })

  it("membro INATIVO é recusado com a frase de autoridade, e nada muda", async () => {
    await expect(
      projectModule.updateProjectDescription({ projectId, actorId: inactiveId, description: "corpo do inativo" }),
    ).rejects.toThrow(ForbiddenError)
    expect(await readDescription()).toBe("novo corpo do membro ativo")
  })

  it("não-membro sem gestão é recusado", async () => {
    await expect(
      projectModule.updateProjectDescription({ projectId, actorId: outsiderId, description: "corpo do estranho" }),
    ).rejects.toThrow(ForbiddenError)
    expect(await readDescription()).toBe("novo corpo do membro ativo")
  })

  it("gestão da ACL escreve, e null limpa a linha", async () => {
    await projectModule.updateProjectDescription({ projectId, actorId: coordId, description: "corpo da gestão" })
    expect(await readDescription()).toBe("corpo da gestão")
    await projectModule.updateProjectDescription({ projectId, actorId: coordId, description: null })
    expect(await readDescription()).toBeNull()
  })
})
