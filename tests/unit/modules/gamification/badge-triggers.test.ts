/**
 * plan-v15 S11 (R4) — os episódios novos disparam recompilação de badges.
 *
 * O que este arquivo trava, use case por use case, com portas falsas que registram as
 * chamadas de `recompute(userId)`:
 *  - compra → recompute do comprador;
 *  - atestado gerado → recompute do membro do vínculo;
 *  - issue resolvida → recompute do RESPONSÁVEL da issue (assigneeId), não do resolvedor;
 *    issue sem responsável não dispara;
 *  - evento de lab criado → recompute do autor; responsabilidade finalizada → recompute do
 *    laboratorista da linha;
 *  - subtask CONCLUÍDA → recompute do marcador; desmarcar não dispara;
 *  - relatório semanal upsert → recompute do autor do relatório;
 *  - fechamento de mês → recompute de cada pessoa que recebeu linha; mês já fechado não
 *    dispara nada;
 *  - campo de perfil gravado → recompute da pessoa.
 */
import { describe, expect, it, vi } from "vitest";

import { userActor } from "@/backend/domain";
import { CreatePurchaseUseCase } from "@/backend/modules/store/application/use-cases/purchase.use-cases";
import { ResolveIssueUseCase } from "@/backend/modules/lab-operations/application/use-cases/issue.use-cases";
import { CreateLabEventUseCase } from "@/backend/modules/lab-operations/application/use-cases/lab-event.use-cases";
import { EndResponsibilityUseCase } from "@/backend/modules/lab-operations/application/use-cases/responsibility.use-cases";
import { UpdateTaskSubtaskUseCase } from "@/backend/modules/task-management/application/use-cases/update-task-subtask.use-case";
import { UpsertWeeklyReportUseCase } from "@/backend/modules/reporting/application/use-cases/upsert-weekly-report.use-case";
import { GenerateCertificateUseCase } from "@/backend/modules/attestation/application/use-cases/generate-certificate.use-case";
import { CloseBoardMonthUseCase } from "@/backend/modules/gamification/application/use-cases/close-board-month.use-case";
import { UpdateUserUseCase } from "@/backend/modules/user-management/application/use-cases/update-user.use-case";

const actor = userActor(42, []);

describe("episódios novos disparam recompute", () => {
  it("compra → recompute do comprador", async () => {
    const recomputeSpy = vi.fn(async () => {});
    const recompute = { recompute: recomputeSpy };
    const purchases = {
      async findUserById(userId: number) { return { id: userId, points: 1000 }; },
      async createWithPointDeduction(snapshot: { userId: number }) { return snapshot; },
    };
    const rewards = { async findById() { return { id: 3, name: "R", price: 10, available: true, stock: null }; } };
    const passives = { async bonusEffectsFor() { return []; } };
    await new CreatePurchaseUseCase(purchases as never, rewards as never, passives, recompute).execute({
      actor,
      data: { userId: 42, rewardId: 3 },
    });
    expect(recomputeSpy).toHaveBeenCalledWith(42);
  });

  it("issue resolvida → recompute do assignee, não do resolvedor; sem assignee não dispara", async () => {
    const recomputeSpy = vi.fn(async () => {});
    const recompute = { recompute: recomputeSpy };
    const issues = {
      async findById(id: number) {
        return id === 1 ? { id: 1, status: "open", assigneeId: 7 } : { id: 2, status: "open", assigneeId: null };
      },
      async update(_id: number, patch: Record<string, unknown>) { return { id: _id, ...patch }; },
    };
    const manager = userActor(1, ["COORDENADOR"]);
    await new ResolveIssueUseCase(issues as never, recompute).execute({ actor: manager, issueId: 1, resolution: "ok" });
    expect(recomputeSpy).toHaveBeenCalledWith(7);
    await new ResolveIssueUseCase(issues as never, recompute).execute({ actor: manager, issueId: 2, resolution: "ok" });
    expect(recomputeSpy).toHaveBeenCalledTimes(1);
  });

  it("evento de lab → recompute do autor", async () => {
    const recomputeSpy = vi.fn(async () => {});
    const recompute = { recompute: recomputeSpy };
    const labEvents = { async create(data: Record<string, unknown>) { return { id: 1, ...data }; } };
    const directory = { async findUserById(userId: number) { return { id: userId, roles: ["LABORATORISTA"], status: "active" }; } };
    await new CreateLabEventUseCase(labEvents as never, directory as never, recompute).execute({
      userId: 9, userName: "L", date: new Date("2026-11-01T12:00:00Z"), note: "note",
    });
    expect(recomputeSpy).toHaveBeenCalledWith(9);
  });

  it("responsabilidade finalizada → recompute do laboratorista da linha", async () => {
    const recomputeSpy = vi.fn(async () => {});
    const recompute = { recompute: recomputeSpy };
    const responsibilities = {
      async findById() { return { id: 5, userId: 9, endTime: null }; },
      async update(_id: number, patch: Record<string, unknown>) { return { id: _id, ...patch }; },
    };
    const canEnd = { async execute() { return true; } };
    await new EndResponsibilityUseCase(responsibilities as never, canEnd as never, recompute).execute({
      actor, responsibilityId: 5,
    });
    expect(recomputeSpy).toHaveBeenCalledWith(9);
  });

  it("subtask concluída → recompute do marcador; desmarcar não dispara", async () => {
    const recomputeSpy = vi.fn(async () => {});
    const recompute = { recompute: recomputeSpy };
    const deps = {
      tasks: {
        async findById(id: number) { return { id, status: "in-progress", taskVisibility: "delegated", isGlobal: false, assignedTo: 42, createdBy: 42 }; },
        async update(_id: number, t: Record<string, unknown>) { return t; },
      },
      subtasks: {
        async findById(id: number) { return { id, taskId: 1, title: "t", completed: false }; },
        async update(_id: number, patch: Record<string, unknown>) { return { id: _id, ...patch }; },
        async listByTaskId() { return [{ id: 1, taskId: 1, title: "t", completed: true }]; },
      },
      assignees: { async listUserIdsByTaskId() { return [42]; } },
      actors: { async findById(id: number) { return { id, roles: [] }; } },
      projects: { async findById() { return null; } },
      notifications: { async publishEvent() {} },
      recompute,
    };
    const useCase = new UpdateTaskSubtaskUseCase(deps as never);
    await useCase.execute({ taskId: 1, subtaskId: 1, actorId: 42, completed: true });
    expect(recomputeSpy).toHaveBeenCalledWith(42);
    recomputeSpy.mockClear();
    await useCase.execute({ taskId: 1, subtaskId: 1, actorId: 42, completed: false });
    expect(recomputeSpy).not.toHaveBeenCalled();
  });

  it("relatório semanal upsert → recompute do autor", async () => {
    const recomputeSpy = vi.fn(async () => {});
    const recompute = { recompute: recomputeSpy };
    const weeklyReports = {
      async findFirstByWindow() { return null; },
      async create(data: Record<string, unknown>) { return { id: 1, createdAt: new Date(), ...data }; },
    };
    const hoursRead = { async findCompletedWithRelations() { return []; } };
    const directory = { async findUserById(userId: number) { return { id: userId, name: "U" }; } };
    await new UpsertWeeklyReportUseCase(weeklyReports as never, hoursRead as never, directory as never, recompute).execute({
      actor, userId: 42, weekStart: "2026-11-01", weekEnd: "2026-11-07", summary: "resumo",
    });
    expect(recomputeSpy).toHaveBeenCalledWith(42);
  });

  it("atestado gerado → recompute do membro do vínculo", async () => {
    const recomputeSpy = vi.fn(async () => {});
    const recompute = { recompute: recomputeSpy };
    const ports = {
      sources: {
        async findProjectContext() { return { projectId: 1, name: "P", editalNumber: null, proppiNumber: null, leaderId: 2, actorMembershipRoles: null }; },
        async findMemberContext() { return { userId: 9, name: "M", cpf: null, registrationNumber: null, level: null, scholarshipType: null, fundingAgency: null, fundingAgencyOther: null, categoria: "VOLUNTARIO", cargaHoraria: 8 }; },
        async listScheduleActivities() { return []; },
        async listCompletedSessionLogs() { return []; },
      },
      pdf: { async renderPdf() { return new Uint8Array(1); } },
      repository: { async upsert(data: Record<string, unknown>) { return { id: 1, ...data }; } },
      recompute,
    };
    await new GenerateCertificateUseCase(ports as never).execute({
      projectId: 1, actorId: 9, actorRoles: [], userId: 9, month: "2026-10", now: new Date("2026-11-05T12:00:00Z"),
    });
    expect(recomputeSpy).toHaveBeenCalledWith(9);
  });

  it("fechamento de mês → recompute de cada pessoa com linha; mês já fechado não dispara", async () => {
    const evaluate = vi.fn(async () => []);
    const rows: Array<{ userId: number }> = [];
    const monthClose = {
      async findClosedMonth(month: string) { return month === "closed" ? { closedAt: new Date() } : null; },
      async listPeopleForClose() { return [{ id: 1, name: "A", status: "active", currentMonthPoints: 100 }, { id: 2, name: "B", status: "active", currentMonthPoints: 50 }]; },
      async writeClose(cmd: { rows: Array<{ userId: number }> }) { rows.push(...cmd.rows); },
    };
    const manager = userActor(1, ["COORDENADOR"]);
    const r = await new CloseBoardMonthUseCase(monthClose as never, { execute: evaluate } as never).execute({
      actor: manager, now: new Date("2026-12-01T03:00:00Z"),
    });
    expect(r.closed).toBe(true);
    expect(evaluate).toHaveBeenCalledWith(1);
    expect(evaluate).toHaveBeenCalledWith(2);

    const monthCloseClosed = {
      async findClosedMonth() { return { closedAt: new Date() }; },
      async listPeopleForClose() { return []; },
      async writeClose() {},
    };
    const r2 = await new CloseBoardMonthUseCase(monthCloseClosed as never, { execute: evaluate } as never).execute({
      actor: manager, now: new Date("2026-12-01T03:00:00Z"),
    });
    expect(r2.alreadyClosed).toBe(true);
    expect(evaluate).toHaveBeenCalledTimes(2);
  });

  it("campo de perfil gravado → recompute da pessoa", async () => {
    const recomputeSpy = vi.fn(async () => {});
    const recompute = { recompute: recomputeSpy };
    const repository = {
      async findById(id: number) { return { id, name: "U", email: "u@x", points: 0 }; },
      async update(u: Record<string, unknown>) { return u; },
    };
    await new UpdateUserUseCase(repository as never, recompute).execute(actor, 42, { bio: "novo perfil" });
    expect(recomputeSpy).toHaveBeenCalledWith(42);
  });
});
