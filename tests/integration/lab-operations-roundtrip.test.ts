// @vitest-environment node
/**
 * OND8-B4 — G4 roundtrip smoke of the LAB-OPERATIONS module against the ISOLATED test DB
 * (127.0.0.1:5433 — DEC-10/BLOCKER-02; never 5432).
 *
 * Wiring NOVA end-to-end com Prisma real (nenhum mock nos repositorios): os 6 adapters
 * finos + PrismaLabDirectory + use cases + regras puras. O publisher de issues e injetado
 * como fake pela PORTA LOCAL (DEC-21) para nao tocar o modulo de notificacoes.
 *
 * Fluxo: issues (create + notify LAB_ISSUE_RAISED/ASSIGNED pela porta, filtros 8L3,
 * transicoes + guards ConflictError) -> lab events (janela de dia local, escada de acesso
 * 8L9, delete) -> notices em `history` (8L1) -> laboratory schedules (gate de papel,
 * update 8L12) -> responsibilities (gate de papel, ativa GLOBAL 8L10, pause/resume 8L15,
 * end/notes/delete) -> user schedules (leitura aberta, escrita MANAGE_USERS, replace cru
 * 8L13).
 *
 * Cleanup em afterAll: issues, lab_events, history LAB_NOTICE, laboratory_schedules,
 * lab_responsibilities, user_schedules, users seedados (stamp). beforeAll remove
 * responsabilidades ativas remanescentes de runs anteriores (so o DB de teste).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/database/prisma";
import { ConflictError, ForbiddenError, NotFoundError, userActor, ValidationError } from "@/backend/domain";
import { createLabOperationsModule } from "@/backend/modules/lab-operations";
import type { LabIssuePublisherPort } from "@/backend/modules/lab-operations/application/ports/lab-issue-publisher.port";

const published: any[] = []
const publisher: LabIssuePublisherPort = {
  async publishIssueRaised(event: any) {
    published.push({ type: "raised", ...event })
  },
  async publishIssueAssigned(event: any) {
    published.push({ type: "assigned", ...event })
  },
}

const lab = createLabOperationsModule({ ports: { publisher } })

const stamp = Date.now()
let labUserId = 0
let gerenteUserId = 0
let voluntarioUserId = 0

// B6-6 (D4): os comandos de issue/responsabilidade/grade carregam ActorRef. O ator do dono nos
// testes de fluxo: LABORATORISTA (sem MANAGE_USERS — as mutacoes passam pelo papel de reporter).
const labActor = () => userActor(labUserId, ["LABORATORISTA"]);
let issueId = 0
let eventId = 0
let noticeId = 0
let labScheduleId = 0
let responsibilityId = 0
let userScheduleId = 0

describe("G4 roundtrip — lab-operations (isolated test DB)", () => {
  beforeAll(async () => {
    await prisma.lab_responsibilities.deleteMany({ where: { endTime: null } })

    const labUser = await prisma.users.create({
      data: {
        name: `G8 Lab ${stamp}`,
        email: `g8-lab-user-${stamp}@test.local`,
        password: "g4-dummy-hash",
        status: "active",
        roles: ["LABORATORISTA"],
      },
      select: { id: true },
    })
    const gerente = await prisma.users.create({
      data: {
        name: `G8 Gerente ${stamp}`,
        email: `g8-lab-gerente-${stamp}@test.local`,
        password: "g4-dummy-hash",
        status: "active",
        roles: ["GERENTE"],
      },
      select: { id: true },
    })
    const voluntario = await prisma.users.create({
      data: {
        name: `G8 Vol ${stamp}`,
        email: `g8-lab-vol-${stamp}@test.local`,
        password: "g4-dummy-hash",
        status: "active",
        roles: ["VOLUNTARIO"],
      },
      select: { id: true },
    })
    labUserId = labUser.id
    gerenteUserId = gerente.id
    voluntarioUserId = voluntario.id
  });

  afterAll(async () => {
    const userIds = [labUserId, gerenteUserId, voluntarioUserId]
    await prisma.issues.deleteMany({ where: { OR: [{ reporterId: { in: userIds } }, { assigneeId: { in: userIds } }] } });
    await prisma.lab_events.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.history.deleteMany({ where: { entityType: "LAB_NOTICE", performedBy: { in: userIds } } });
    await prisma.laboratory_schedules.deleteMany({ where: { id: labScheduleId } });
    await prisma.lab_responsibilities.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user_schedules.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.users.deleteMany({ where: { id: { in: userIds } } });
  });

  it("issues: create + notify pela porta local (8L8) + filtros 8L3 + transicoes guardadas", async () => {
    published.length = 0

    const issue = await lab.createIssue({
      title: ` G8 impressora ${stamp} `,
      description: "papel atolado",
      reporterId: labUserId,
      priority: "high",
      category: "equipamento",
    })
    issueId = issue.id as number
    expect(issue).toMatchObject({ title: `G8 impressora ${stamp}`, status: "open", priority: "high" }) // 8L2
    expect(published.some((e) => e.type === "raised" && e.issueId === issueId)).toBe(true)

    const listed = await lab.listIssues({ status: "open", search: `IMPRESSORA ${stamp}` })
    expect(listed.some((i) => i.id === issueId)).toBe(true)

    const updated = await lab.updateIssue({ actor: labActor(), issueId, data: { category: "maquinas" } })
    expect(updated.category).toBe("maquinas")
    await expect(lab.updateIssue({ actor: labActor(), issueId, data: { priority: "urgente" } })).rejects.toThrow(/priority|Invalid/); // 8L4 enum real

    // B6-6 (D4): gate medido — terceiro (nem reporter nem assignee) e barrado no use case.
    await expect(lab.updateIssue({ actor: userActor(999999, ["VOLUNTARIO"]), issueId, data: { category: "x" } })).rejects.toThrow(ForbiddenError)

    const assigned = await lab.assignIssue({ actor: labActor(), issueId, assigneeId: voluntarioUserId })
    expect(assigned).toMatchObject({ assigneeId: voluntarioUserId, status: "in_progress" }) // 8L6
    expect(published.some((e) => e.type === "assigned" && e.issueId === issueId)).toBe(true)

    // B6-6 (D4): assignee NAO reatribui (medido no gate legado de assign: MANAGE_USERS OU reporter)
    await expect(lab.assignIssue({ actor: userActor(voluntarioUserId, ["VOLUNTARIO"]), issueId, assigneeId: labUserId })).rejects.toThrow(ForbiddenError)

    const resolved = await lab.resolveIssue({ actor: labActor(), issueId, resolution: "troquei o papel" })
    expect(resolved.status).toBe("resolved")
    expect(resolved.resolvedAt).toBeInstanceOf(Date)

    const closed = await lab.closeIssue({ actor: labActor(), issueId })
    expect(closed.status).toBe("closed")

    const reopened = await lab.reopenIssue({ actor: labActor(), issueId })
    expect(reopened).toMatchObject({ status: "open", resolvedAt: null })

    await expect(lab.resolveIssue({ actor: labActor(), issueId, resolution: "   " })).rejects.toThrow(ValidationError)
    await lab.closeIssue({ actor: labActor(), issueId }) // open -> closed
    await expect(lab.closeIssue({ actor: labActor(), issueId })).rejects.toThrow(ConflictError) // ja esta fechado
    await lab.reopenIssue({ actor: labActor(), issueId }) // closed -> open
    await expect(lab.reopenIssue({ actor: labActor(), issueId })).rejects.toThrow(ConflictError) // nao esta fechado
    await expect(lab.assignIssue({ actor: labActor(), issueId, assigneeId: 999999 })).rejects.toThrow(NotFoundError)
    await expect(lab.getIssue(999999)).resolves.toBeNull()
  });

  it("lab events: janela de dia local + escada de acesso 8L9 + delete", async () => {
    const event = await lab.createLabEvent({
      userId: gerenteUserId,
      userName: `G8 Gerente ${stamp}`,
      date: new Date(),
      note: "reuniao de laboratorio",
    })
    eventId = event.id as number

    const byDate = await lab.listLabEventsByDate(new Date())
    expect(byDate.some((e) => e.id === eventId)).toBe(true)

    // LABORATORISTA (prioridade 3) nao pode editar evento de GERENTE (5)
    await expect(
      lab.updateLabEvent({ eventId, actorUserId: labUserId, actorRoles: ["LABORATORISTA"], note: "x" }),
    ).rejects.toThrow(/permissão/)
    // dono pode
    const updated = await lab.updateLabEvent({
      eventId,
      actorUserId: gerenteUserId,
      actorRoles: ["GERENTE"],
      note: "reuniao atualizada",
    })
    expect(updated.note).toBe("reuniao atualizada")
    // ator inexistente
    await expect(
      lab.updateLabEvent({ eventId, actorUserId: 999999, actorRoles: ["GERENTE"], note: "x" }),
    ).rejects.toThrow(NotFoundError)
    await expect(
      lab.updateLabEvent({ eventId: 999999, actorUserId: gerenteUserId, actorRoles: ["GERENTE"], note: "x" }),
    ).rejects.toThrow(NotFoundError)

    await lab.deleteLabEvent({ eventId, actorUserId: gerenteUserId, actorRoles: ["GERENTE"] })
    await expect(
      lab.deleteLabEvent({ eventId, actorUserId: gerenteUserId, actorRoles: ["GERENTE"] }),
    ).rejects.toThrow(NotFoundError)
  });

  it("notices: persistem em history (8L1) + acesso por prioridade + delete", async () => {
    const notice = await lab.createLabNotice({ userId: gerenteUserId, userName: `G8 Gerente ${stamp}`, note: " aviso do gerente " })
    noticeId = notice.id as number
    expect(notice).toMatchObject({ userId: gerenteUserId, userName: `G8 Gerente ${stamp}`, note: "aviso do gerente" })

    const notices = await lab.listLabNotices()
    expect(notices.some((n) => n.id === noticeId)).toBe(true)

    // LABORATORISTA (3) nao apaga aviso de GERENTE (5)
    await expect(lab.deleteLabNotice({ noticeId, actorUserId: labUserId, actorRoles: ["LABORATORISTA"] })).rejects.toThrow(/permissão/)
    await lab.deleteLabNotice({ noticeId, actorUserId: gerenteUserId, actorRoles: ["GERENTE"] })
    await expect(lab.deleteLabNotice({ noticeId, actorUserId: gerenteUserId, actorRoles: ["GERENTE"] })).rejects.toThrow(NotFoundError)
  });

  it("laboratory schedules: gate de papel + update parcial 8L12 + delete", async () => {
    await expect(
      lab.createLaboratorySchedule({ dayOfWeek: 1, startTime: "08:00", endTime: "12:00", userId: voluntarioUserId }),
    ).rejects.toThrow(/permissão/)

    const schedule = await lab.createLaboratorySchedule({
      dayOfWeek: 1,
      startTime: "08:00",
      endTime: "12:00",
      notes: "manha",
      userId: labUserId,
    })
    labScheduleId = schedule.id as number

    const updated = await lab.updateLaboratorySchedule(labScheduleId, { dayOfWeek: 5, notes: "", userId: labUserId })
    expect(updated.dayOfWeek).toBe(1) // 8L12: dayOfWeek ignorado no update
    expect(updated.notes).toBe("manha") // 8L12: notes "" -> undefined -> Prisma pula e PRESERVA

    await expect(
      lab.updateLaboratorySchedule(labScheduleId, { startTime: "25:00", userId: labUserId }),
    ).rejects.toThrow(ValidationError)
    await expect(lab.updateLaboratorySchedule(999999, { startTime: "09:00", userId: labUserId })).rejects.toThrow(NotFoundError)

    await lab.deleteLaboratorySchedule({ scheduleId: labScheduleId, userId: labUserId })
    expect(await lab.listLaboratorySchedules().then((s) => s.some((x) => x.id === labScheduleId))).toBe(false)
  });

  it("responsibilities: gate de papel + ativa GLOBAL 8L10 + pause/resume 8L15 + end/notes/delete", async () => {
    // B6-6 (D4): o gate de papel (antes ensureAnyRole na rota) e do StartResponsibilityUseCase
    // com a mensagem congelada da rota; o gate do DELETE idem.
    await expect(lab.startResponsibility({ actor: userActor(voluntarioUserId, ["VOLUNTARIO"]), actorName: "Vol" })).rejects.toThrow(/permissão/)

    const resp = await lab.startResponsibility({ actor: userActor(labUserId, ["LABORATORISTA"]), actorName: `G8 Lab ${stamp}`, notes: "manha" })
    responsibilityId = resp.id as number
    expect(resp).toMatchObject({ userId: labUserId, endTime: null, totalPausedMs: 0 })
    expect(resp.startTime).toBeInstanceOf(Date)

    // ativa GLOBAL bloqueia outro usuario
    await expect(lab.startResponsibility({ actor: userActor(gerenteUserId, ["GERENTE"]), actorName: "Ger" })).rejects.toThrow(ConflictError)

    const paused = await lab.pauseResponsibilityForUser({ actor: userActor(labUserId, ["LABORATORISTA"]), userId: labUserId })
    expect(paused?.pausedAt).toBeInstanceOf(Date)
    const resumed = await lab.resumeResponsibilityForUser({ actor: userActor(labUserId, ["LABORATORISTA"]), userId: labUserId })
    expect(resumed?.pausedAt).toBeNull()
    expect((resumed?.totalPausedMs ?? -1)).toBeGreaterThanOrEqual(0)

    // B6-6 (D4): pessoa so pausa a PROPRIA responsabilidade (guarda de self no use case).
    await expect(
      lab.pauseResponsibilityForUser({ actor: userActor(gerenteUserId, ["GERENTE"]), userId: labUserId }),
    ).rejects.toThrow(ForbiddenError)

    expect(await lab.canEndResponsibility(voluntarioUserId, responsibilityId)).toBe(false)
    expect(await lab.canEndResponsibility(labUserId, responsibilityId)).toBe(true)

    await expect(lab.updateResponsibilityNotes({ actor: userActor(voluntarioUserId, ["VOLUNTARIO"]), responsibilityId, notes: "x" })).rejects.toThrow(ForbiddenError)
    const noted = await lab.updateResponsibilityNotes({ actor: userActor(labUserId, ["LABORATORISTA"]), responsibilityId, notes: "  editado  " })
    expect(noted.notes).toBe("editado")
    const cleared = await lab.updateResponsibilityNotes({ actor: userActor(labUserId, ["LABORATORISTA"]), responsibilityId, notes: "   " })
    expect(cleared.notes).toBeNull() // trim -> null (legado)

    const ended = await lab.endResponsibility({ actor: userActor(labUserId, ["LABORATORISTA"]), responsibilityId })
    expect(ended.endTime).toBeInstanceOf(Date)
    expect(ended.notes).toBeNull() // notes falsy preserva as existentes (8L11)
    await expect(lab.endResponsibility({ actor: userActor(labUserId, ["LABORATORISTA"]), responsibilityId })).rejects.toThrow(ConflictError)
    // B6-6 (D4): quirk medido da ordem — canEnd ANTES do lookup: responsabilidade ausente e 403
    // (canEnd false para null), nao 404. O NotFoundError do end so dispara em corrida interna.
    await expect(lab.endResponsibility({ actor: userActor(labUserId, ["LABORATORISTA"]), responsibilityId: 999999 })).rejects.toThrow(ForbiddenError)
    await expect(lab.deleteResponsibility({ actor: userActor(gerenteUserId, ["GERENTE"]), responsibilityId: 999999 })).rejects.toThrow(NotFoundError)
    // gate de papel do DELETE (antes ensureAnyRole na rota): VOLUNTARIO e barrado antes do lookup
    await expect(lab.deleteResponsibility({ actor: userActor(voluntarioUserId, ["VOLUNTARIO"]), responsibilityId })).rejects.toThrow(ForbiddenError)
  });

  it("user schedules: leitura aberta + escrita MANAGE_USERS (GERENTE) + replace cru 8L13", async () => {
    await expect(
      lab.createUserSchedule({ actor: userActor(voluntarioUserId, ["VOLUNTARIO"]), targetUserId: voluntarioUserId, dayOfWeek: 1, startTime: "08:00", endTime: "12:00" }),
    ).rejects.toThrow(ForbiddenError) // "Acesso negado" (sem MANAGE_USERS)

    const slot = await lab.createUserSchedule({
      actor: userActor(gerenteUserId, ["GERENTE"]),
      targetUserId: voluntarioUserId,
      dayOfWeek: 1,
      startTime: "08:00",
      endTime: "12:00",
    })
    userScheduleId = slot.id as number

    // leitura aberta: voluntario ve os proprios horarios sem MANAGE_USERS
    const own = await lab.listUserSchedules({ actor: userActor(voluntarioUserId, ["VOLUNTARIO"]) })
    expect(own.some((s) => s.id === userScheduleId)).toBe(true)

    const updated = await lab.updateUserSchedule({
      actor: userActor(gerenteUserId, ["GERENTE"]),
      scheduleId: userScheduleId,
      dayOfWeek: 5,
      endTime: "13:00",
    })
    expect(updated.endTime).toBe("13:00") // 8L13: dayOfWeek ignorado

    const replaced = await lab.replaceUserSchedules({
      actor: userActor(gerenteUserId, ["GERENTE"]),
      targetUserId: voluntarioUserId,
      slots: [
        { dayOfWeek: 9, startTime: "99:99", endTime: "aa" }, // cru — sem validacao (8L13)
        { dayOfWeek: 4, startTime: "10:00", endTime: "16:00" },
      ],
    })
    expect(replaced).toHaveLength(2)
    expect(replaced.some((s) => s.dayOfWeek === 9 && s.startTime === "99:99")).toBe(true)
    await expect(lab.getUserSchedule(userScheduleId)).resolves.toBeNull() // replace apagou o slot original

    await lab.deleteUserSchedule({ actor: userActor(gerenteUserId, ["GERENTE"]), scheduleId: replaced[0].id as number })
    await expect(lab.getUserSchedule(replaced[0].id as number)).resolves.toBeNull()
  });
});
