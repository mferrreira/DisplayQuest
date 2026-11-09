// @vitest-environment node
/**
 * S02 (plan-v21) — G4 roundtrip de arquivos de entregável contra o banco de teste ISOLADO
 * (127.0.0.1:5433 — DEC-10/BLOCKER-02; nunca 5432).
 *
 * O bucket não entra aqui: a rota move o byte, o módulo guarda o metadado (DEC-133), e os
 * roundtrips rodam sem bucket no ar. Este arquivo prova a escrita real de Prisma:
 *   addProjectDeliverableFile (gate de gestão, metadado gravado, chave livre) ->
 *   listProjectDeliverableFiles aberta ao autenticado ->
 *   getProjectDeliverableFile: id de fora do entregável é 404 ->
 *   FK bloqueante: `uploadedBy` RESTRICT — apagar a pessoa que subiu RECUSA, o arquivo é dado
 *   do projeto (19ª bloqueante, DEC-134/162) ->
 *   cascade: apagar o entregável leva os arquivos (a linha é parte dele).
 *
 * Só as linhas criadas por este arquivo saem no afterAll.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { prisma } from "@/lib/database/prisma"
import { NotFoundError, ValidationError } from "@/backend/domain"
import { userActor } from "@/backend/domain"
import { createProjectManagementModule } from "@/backend/modules/project-management"
import { createPrismaUserRepository } from "@/backend/modules/user-management/infrastructure/repositories/prisma-user.repository"

const projectModule = createProjectManagementModule()
const users = createPrismaUserRepository()

const stamp = Date.now()
let coordId = 0
let volunteerId = 0
let projectId = 0
let otherProjectId = 0
let deliverableId = 0
let otherDeliverableId = 0
let fileId = 0

describe("G4 roundtrip — arquivos de entregável (isolated test DB)", () => {
  beforeAll(async () => {
    const coord = await prisma.users.create({
      data: {
        name: `S02 Coord ${stamp}`,
        email: `s02-coord-${stamp}@test.local`,
        password: "g4-dummy-hash",
        status: "active",
        roles: ["COORDENADOR"],
      },
      select: { id: true },
    })
    const volunteer = await prisma.users.create({
      data: {
        name: `S02 Voluntário ${stamp}`,
        email: `s02-vol-${stamp}@test.local`,
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
        name: `S02 Project ${stamp}`,
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
        name: `S02 Outro Project ${stamp}`,
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

  it("addProjectDeliverableFile: gravado sobre o entregável, com a chave que a rota deu", async () => {
    const deliverable = await projectModule.createProjectDeliverable({
      projectId,
      actorId: coordId,
      name: "GDD do laboratório",
      quantity: 1,
    })
    deliverableId = deliverable.id!

    const created = await projectModule.addProjectDeliverableFile({
      projectId,
      deliverableId,
      actorId: coordId,
      blobKey: `projects/${projectId}/deliverables/${deliverableId}/files/gdd-${stamp}.pdf`,
      name: "  GDD.pdf  ",
      contentType: "application/pdf",
      size: 2048,
    })
    fileId = created.id!

    expect(created).toMatchObject({
      deliverableId,
      name: "GDD.pdf", // a mesma normalização de nome do anexo: aparado na escrita
      contentType: "application/pdf",
      size: 2048,
      uploadedBy: coordId,
    })

    const row = await prisma.project_deliverable_files.findUnique({ where: { id: fileId } })
    expect(row?.blobKey).toBe(`projects/${projectId}/deliverables/${deliverableId}/files/gdd-${stamp}.pdf`)
  })

  it("nome vazio é recusado pelo domínio antes de escrever", async () => {
    await expect(
      projectModule.addProjectDeliverableFile({
        projectId,
        deliverableId,
        actorId: coordId,
        blobKey: "projects/1/deliverables/1/files/x.pdf",
        name: "   ",
        contentType: "application/pdf",
        size: 1,
      }),
    ).rejects.toThrow(ValidationError)
    expect(await prisma.project_deliverable_files.count({ where: { deliverableId } })).toBe(1)
  })

  it("lista é aberta ao autenticado, na ordem mais recente primeiro", async () => {
    const second = await projectModule.addProjectDeliverableFile({
      projectId,
      deliverableId,
      actorId: coordId,
      blobKey: `projects/${projectId}/deliverables/${deliverableId}/files/ata-${stamp}.pdf`,
      name: "ata.pdf",
      contentType: "application/pdf",
      size: 1024,
    })

    const files = await projectModule.listProjectDeliverableFiles({
      projectId,
      deliverableId,
      actorId: volunteerId,
      actorRoles: ["VOLUNTARIO"],
    })
    expect(files.map((file) => file.id)).toEqual([second.id, fileId])
    expect(files[1].name).toBe("GDD.pdf")
    // A leitura aberta inclui o blobKey: o painel precisa do número, não do caminho.
    expect(files[0].blobKey).toContain(`/deliverables/${deliverableId}/files/`)
  })

  it("getProjectDeliverableFile: id de fora do entregável é 404", async () => {
    const other = await projectModule.createProjectDeliverable({
      projectId: otherProjectId,
      actorId: coordId,
      name: "Entregável de outro projeto",
      quantity: 2,
    })
    otherDeliverableId = other.id!

    await expect(
      projectModule.getProjectDeliverableFile({
        projectId,
        deliverableId: otherDeliverableId,
        fileId,
        actorId: volunteerId,
        actorRoles: ["VOLUNTARIO"],
      }),
    ).rejects.toThrow(NotFoundError)

    const own = await projectModule.getProjectDeliverableFile({
      projectId,
      deliverableId,
      fileId,
      actorId: volunteerId,
      actorRoles: ["VOLUNTARIO"],
    })
    expect(own.id).toBe(fileId)
    expect(own.blobKey).toContain(`/deliverables/${deliverableId}/files/`)
  })

  it("getProjectDeliverableFile: arquivo de ENTREGÁVEL VIZINHO do mesmo projeto é 404", async () => {
    // O vínculo file↔entregável é a regra, não a pertença ao projeto. Sem o vínculo, ler o
    // arquivo de um entregável pelo vizinho do mesmo projeto daria sucesso.
    const sibling = await projectModule.createProjectDeliverable({
      projectId,
      actorId: coordId,
      name: "Entregável vizinho",
      quantity: 1,
    })

    await expect(
      projectModule.getProjectDeliverableFile({
        projectId,
        deliverableId: sibling.id!,
        fileId,
        actorId: volunteerId,
        actorRoles: ["VOLUNTARIO"],
      }),
    ).rejects.toThrow(NotFoundError)

    await projectModule.deleteProjectDeliverable({ projectId, deliverableId: sibling.id!, actorId: coordId })
  })

  it("FK bloqueante: apagar a pessoa que subiu o arquivo RECUSA — o arquivo é dado do projeto", async () => {
    const before = await users.countBlockingDependencies(coordId)
    expect(before).toBeGreaterThanOrEqual(1)
    await expect(prisma.users.delete({ where: { id: coordId } })).rejects.toThrow(/foreign key|P2003/i)
  })

  it("apagar o entregável leva os arquivos (cascade)", async () => {
    await projectModule.deleteProjectDeliverable({ projectId, deliverableId, actorId: coordId })
    expect(await prisma.project_deliverable_files.count({ where: { deliverableId } })).toBe(0)
    // Os arquivos do outro entregável (sem arquivos) seguem irrelevantes.
    await projectModule.deleteProjectDeliverable({ projectId: otherProjectId, deliverableId: otherDeliverableId, actorId: coordId })
    await prisma.projects.delete({ where: { id: otherProjectId } })
    otherProjectId = 0
  })
})
