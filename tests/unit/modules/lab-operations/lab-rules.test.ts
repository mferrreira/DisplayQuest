/**
 * OND8-B2 — testes das regras puras do lab (backend/domain/lab/*-rules.ts).
 * Mensagens legadas verbatim (contrato do contract test OND8-B3).
 */
import { describe, expect, it } from "vitest";

import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/backend/domain";

import {
  assertCanReopen,
  assertCanStartProgress,
  assertCanStartResponsibility,
  assertLabEntryAccess,
  assertNoActiveResponsibility,
  assertNotClosed,
  assertNotEnded,
  assertTargetUserExists,
  assertUserCanCreateLabEvent,
  assertUserCanCreateLabNotice,
  computeAssignPatch,
  computeClosePatch,
  computeEndPatch,
  computeIssueUpdateFields,
  computeLabEventUpdateFields,
  computeNotesPatch,
  computePausePatch,
  computeReopenPatch,
  computeResolvePatch,
  computeResumePatch,
  computeUnassignPatch,
  decideCanEndResponsibility,
  decideLabEntryAccess,
  getHighestRolePriority,
  matchesIssueSearch,
  mergeLaboratoryScheduleUpdate,
  mergeUserScheduleUpdate,
  normalizeIssueCreate,
  normalizeLabNoticeNote,
  resolveIssueListFilter,
  validateLabEventCreate,
  validateResponsibilityCreate,
  validateScheduleFields,
  validateUserScheduleSlot,
} from "@/backend/domain";

// ================= ISSUES =================

describe("normalizeIssueCreate", () => {
  it("QUIRK-8L2: status FORÇADO open apesar do gateway pedir in_progress", () => {
    const created = normalizeIssueCreate({ title: " T ", description: " D ", reporterId: 5 });
    expect(created).toEqual({
      title: "T",
      description: "D",
      status: "open",
      priority: "medium",
      category: null,
      reporterId: 5,
      assigneeId: null,
    });
  });

  it("validações legadas verbatim (ordem title -> description -> reporter -> priority)", () => {
    expect(() => normalizeIssueCreate({ title: "  ", description: "d", reporterId: 1 })).toThrow("Título do issue é obrigatório");
    expect(() => normalizeIssueCreate({ title: "t", description: " ", reporterId: 1 })).toThrow("Descrição do issue é obrigatória");
    expect(() => normalizeIssueCreate({ title: "t", description: "d", reporterId: 0 })).toThrow("Reporter do issue é obrigatório");
    expect(() => normalizeIssueCreate({ title: "t", description: "d", reporterId: 1.5 })).toThrow("Reporter do issue é obrigatório");
    expect(() => normalizeIssueCreate({ title: "t", description: "d", reporterId: 1, priority: "urgente" })).toThrow("Prioridade inválida");
  });

  it("assigneeId: undefined/null => null; valor => Number", () => {
    expect(normalizeIssueCreate({ title: "t", description: "d", reporterId: 1, assigneeId: null }).assigneeId).toBeNull();
    expect(normalizeIssueCreate({ title: "t", description: "d", reporterId: 1, assigneeId: "7" }).assigneeId).toBe(7);
    expect(normalizeIssueCreate({ title: "t", description: "d", reporterId: 1, category: "c" }).category).toBe("c");
  });
});

describe("computeIssueUpdateFields", () => {
  it("merge parcial; QUIRK-8L4: priority arbitrary passa sem validação (enum do Prisma decide)", () => {
    expect(computeIssueUpdateFields({})).toEqual({});
    expect(computeIssueUpdateFields({ title: " n ", category: "" })).toEqual({ title: "n", category: null });
    expect(computeIssueUpdateFields({ priority: "urgente" })).toEqual({ priority: "urgente" });
    expect(() => computeIssueUpdateFields({ title: " " })).toThrow("Título do issue é obrigatório");
    expect(() => computeIssueUpdateFields({ description: " " })).toThrow("Descrição do issue é obrigatória");
  });
});

describe("resolveIssueListFilter (QUIRK-8L3)", () => {
  it("precedência mutuamente exclusiva; query vazia => all", () => {
    expect(resolveIssueListFilter({ status: "open", priority: "high" })).toEqual({ by: "status", value: "open" });
    expect(resolveIssueListFilter({ priority: "high", category: "c" })).toEqual({ by: "priority", value: "high" });
    expect(resolveIssueListFilter({ category: "c", reporterId: 1 })).toEqual({ by: "category", value: "c" });
    expect(resolveIssueListFilter({ reporterId: 1, assigneeId: 2 })).toEqual({ by: "reporterId", value: 1 });
    expect(resolveIssueListFilter({ assigneeId: 2, search: "x" })).toEqual({ by: "assigneeId", value: 2 });
    expect(resolveIssueListFilter({ search: " x " })).toEqual({ by: "search", term: "x" });
    expect(resolveIssueListFilter({})).toEqual({ by: "all" });
    expect(resolveIssueListFilter({ status: "", priority: "" })).toEqual({ by: "all" });
    expect(resolveIssueListFilter()).toEqual({ by: "all" });
  });
});

describe("matchesIssueSearch", () => {
  it("title/description/category, case-insensitive, substring", () => {
    const issue = { title: "Impressora", description: "papel atolado", category: "equipamento" };
    expect(matchesIssueSearch(issue, "impressora")).toBe(true);
    expect(matchesIssueSearch(issue, "ATOLADO")).toBe(true);
    expect(matchesIssueSearch(issue, "equipamento")).toBe(true);
    expect(matchesIssueSearch(issue, "rede")).toBe(false);
    expect(matchesIssueSearch({ title: "a", description: "b", category: null }, "c")).toBe(false);
  });
});

describe("transições de issue", () => {
  it("guards legadas verbatim", () => {
    expect(() => assertCanStartProgress("in_progress")).toThrow(ConflictError);
    expect(() => assertCanStartProgress("in_progress")).toThrow("Apenas issues abertos podem ser iniciados");
    expect(() => assertNotClosed("closed")).toThrow("Issue já está fechado");
    expect(() => assertCanReopen("open")).toThrow("Apenas issues fechados podem ser reabertos");
  });

  it("QUIRK-8L5: resolution validada mas descartada; resolvedAt = now", () => {
    const now = new Date("2026-09-16T12:00:00.000Z");
    const patch = computeResolvePatch("in_progress", "troquei o papel", now);
    expect(patch).toEqual({ status: "resolved", resolvedAt: now });
    expect((patch as Record<string, unknown>).resolution).toBeUndefined();
    expect(() => computeResolvePatch("in_progress", "   ", now)).toThrow("Descrição da resolução é obrigatória");
    expect(() => computeResolvePatch("closed", undefined, now)).toThrow("Issue já está fechado");
    expect(computeResolvePatch("resolved", undefined, now).status).toBe("resolved"); // re-resolve idempotente
  });

  it("QUIRK-8L6/8L7: assign força in_progress; unassign força open; close/reopen patches", () => {
    expect(computeAssignPatch(9)).toEqual({ assigneeId: 9, status: "in_progress" });
    expect(computeUnassignPatch()).toEqual({ assigneeId: null, status: "open" });
    expect(computeClosePatch()).toEqual({ status: "closed" });
    expect(computeReopenPatch()).toEqual({ status: "open", resolvedAt: null });
  });
});

// ================= ACESSO =================

describe("lab access (QUIRK-8L9)", () => {
  it("tabela de prioridade legada verbatim", () => {
    expect(getHighestRolePriority(["GERENTE"])).toBe(5);
    expect(getHighestRolePriority(["COORDENADOR"])).toBe(4);
    expect(getHighestRolePriority(["LABORATORISTA"])).toBe(3);
    expect(getHighestRolePriority(["GERENTE_PROJETO", "PESQUISADOR"])).toBe(2);
    expect(getHighestRolePriority(["COLABORADOR", "VOLUNTARIO"])).toBe(1);
    expect(getHighestRolePriority(["INVENTADO"])).toBe(0);
    expect(getHighestRolePriority([])).toBe(0);
  });

  it("dono ok; sem papel => no-role; prioridade igual/menor => priority; maior => ok", () => {
    expect(decideLabEntryAccess({ actorUserId: 1, actorRoles: ["VOLUNTARIO"], targetUserId: 1, targetRoles: ["GERENTE"] })).toEqual({ allowed: true });
    expect(decideLabEntryAccess({ actorUserId: 2, actorRoles: ["VOLUNTARIO"], targetUserId: 1, targetRoles: ["VOLUNTARIO"] })).toEqual({ allowed: false, reason: "no-role" });
    expect(decideLabEntryAccess({ actorUserId: 2, actorRoles: ["LABORATORISTA"], targetUserId: 1, targetRoles: ["GERENTE"] })).toEqual({ allowed: false, reason: "priority" });
    expect(decideLabEntryAccess({ actorUserId: 2, actorRoles: ["LABORATORISTA"], targetUserId: 1, targetRoles: ["LABORATORISTA"] })).toEqual({ allowed: false, reason: "priority" });
    expect(decideLabEntryAccess({ actorUserId: 2, actorRoles: ["LABORATORISTA"], targetUserId: 1, targetRoles: ["VOLUNTARIO"] })).toEqual({ allowed: true });
  });

  it("mensagens verbatim por ação/entidade", () => {
    expect(() => assertLabEntryAccess({ allowed: false, reason: "no-role" }, "editar", "evento")).toThrow(
      "Usuário não tem permissão para editar este evento",
    );
    expect(() => assertLabEntryAccess({ allowed: false, reason: "priority" }, "editar", "evento")).toThrow(
      "Usuário não tem permissão para editar eventos deste perfil",
    );
    expect(() => assertLabEntryAccess({ allowed: false, reason: "no-role" }, "remover", "aviso")).toThrow(
      "Usuário não tem permissão para remover este aviso",
    );
    expect(() => assertLabEntryAccess({ allowed: false, reason: "priority" }, "remover", "aviso")).toThrow(
      "Usuário não tem permissão para remover avisos deste perfil",
    );
    expect(() => assertLabEntryAccess({ allowed: true }, "remover", "aviso")).not.toThrow();
  });

  it("usuário do recurso inexistente", () => {
    expect(() => assertTargetUserExists(null, "evento")).toThrow(NotFoundError);
    expect(() => assertTargetUserExists(null, "evento")).toThrow("Usuário do evento não encontrado");
    expect(() => assertTargetUserExists(null, "aviso")).toThrow("Usuário do aviso não encontrado");
  });
});

// ================= LAB EVENT / NOTICE =================

describe("lab event rules", () => {
  it("create: erros acumulados 'Dados inválidos: ' na ordem userId -> userName -> date -> note", () => {
    expect(() => validateLabEventCreate({})).toThrow(
      "Dados inválidos: ID do usuário é obrigatório, Nome do usuário é obrigatório, Data do evento inválida, Nota do evento é obrigatória",
    );
    expect(() => validateLabEventCreate({ userId: 1, userName: " ", date: new Date("nope"), note: "n" })).toThrow(
      "Dados inválidos: Nome do usuário é obrigatório, Data do evento inválida",
    );
    expect(() => validateLabEventCreate({ userId: 1, userName: "u", date: new Date("2026-09-15T12:00:00.000Z"), note: "  " })).toThrow(
      "Dados inválidos: Nota do evento é obrigatória",
    );
    expect(() => validateLabEventCreate({ userId: 1, userName: "u", date: new Date("2026-09-15T12:00:00.000Z"), note: "ok" })).not.toThrow();
  });

  it("guardas de criação (usuário ativo)", () => {
    expect(() => assertUserCanCreateLabEvent(null)).toThrow("Usuário não encontrado");
    // DEC-95: os status aqui são os que o sistema escreve (`entities/user.ts:31`). Antes este
    // teste usava `inactive`, um valor que nenhuma rota produz — a guarda passava verde contra
    // um estado impossível. O que a regra checa é `status !== "active"`, então os três reais
    // bloqueiam.
    expect(() => assertUserCanCreateLabEvent({ status: "suspended" })).toThrow("Usuário não tem permissão para criar eventos");
    expect(() => assertUserCanCreateLabEvent({ status: "pending" })).toThrow("Usuário não tem permissão para criar eventos");
    expect(() => assertUserCanCreateLabEvent({ status: "rejected" })).toThrow("Usuário não tem permissão para criar eventos");
    expect(() => assertUserCanCreateLabNotice({ status: "suspended" })).toThrow("Usuário não tem permissão para criar avisos");
    expect(() => assertUserCanCreateLabEvent({ status: "active" })).not.toThrow();
  });

  it("update: validação solta sem prefixo", () => {
    expect(computeLabEventUpdateFields({})).toEqual({});
    expect(computeLabEventUpdateFields({ note: " n " })).toEqual({ note: "n" });
    expect(() => computeLabEventUpdateFields({ date: new Date("nope") })).toThrow("Data do evento inválida");
    expect(() => computeLabEventUpdateFields({ note: "  " })).toThrow("Nota do evento é obrigatória");
  });

  it("notice: note trim não-vazio", () => {
    expect(normalizeLabNoticeNote("  aviso  ")).toBe("aviso");
    expect(() => normalizeLabNoticeNote("   ")).toThrow(ValidationError);
    expect(() => normalizeLabNoticeNote("   ")).toThrow("Aviso é obrigatório");
  });
});

// ================= SCHEDULES =================

describe("schedule rules", () => {
  it("validateScheduleFields: ordem dos erros legada; comparação NaN nunca dispara", () => {
    expect(() => validateScheduleFields({ dayOfWeek: 7, startTime: "08:00", endTime: "12:00" })).toThrow(
      "Dados inválidos: Dia da semana inválido",
    );
    expect(() => validateScheduleFields({ dayOfWeek: 1, startTime: "25:00", endTime: "07:00" })).toThrow(
      "Dados inválidos: Horário de início inválido, Horário de início deve ser anterior ao fim",
    );
    expect(() => validateScheduleFields({ dayOfWeek: 1, startTime: "12:00", endTime: "12:00" })).toThrow(
      "Horário de início deve ser anterior ao fim",
    );
    expect(() => validateScheduleFields({ dayOfWeek: -1, startTime: "", endTime: "" })).toThrow(
      "Dados inválidos: Dia da semana inválido, Horário de início inválido, Horário de fim inválido",
    );
    expect(() => validateScheduleFields({ dayOfWeek: 6, startTime: "08:00", endTime: "12:00" })).not.toThrow();
  });

  it("validateUserScheduleSlot: + ID do usuário", () => {
    expect(() => validateUserScheduleSlot({ userId: 0, dayOfWeek: 1, startTime: "08:00", endTime: "12:00" })).toThrow(
      "Dados inválidos: ID do usuário é obrigatório",
    );
    expect(() => validateUserScheduleSlot({ userId: 1, dayOfWeek: 7, startTime: "12:00", endTime: "08:00" })).toThrow(
      "Dados inválidos: Dia da semana inválido, Horário de início deve ser anterior ao fim",
    );
  });

  it("QUIRK-8L12: merge do lab ignora dayOfWeek e notes '' nunca limpa a coluna", () => {
    const existing = { startTime: "08:00", endTime: "12:00", notes: "manha" };

    const merged = mergeLaboratoryScheduleUpdate(existing, { dayOfWeek: 5, startTime: "09:00", notes: "" });
    expect(merged).toEqual({ changed: true, startTime: "09:00", endTime: "12:00", notes: undefined });

    expect(mergeLaboratoryScheduleUpdate(existing, { dayOfWeek: 5 })).toEqual({ changed: false });
    expect(mergeLaboratoryScheduleUpdate(existing, { notes: "nova" }).notes).toBe("nova");
  });

  it("QUIRK-8L13: merge do user schedule ignora dayOfWeek", () => {
    const existing = { startTime: "08:00", endTime: "12:00" };
    expect(mergeUserScheduleUpdate(existing, { dayOfWeek: 5, endTime: "18:00" })).toEqual({
      changed: true,
      startTime: "08:00",
      endTime: "18:00",
    });
    expect(mergeUserScheduleUpdate(existing, { dayOfWeek: 5 })).toEqual({ changed: false });
  });
});

// ================= RESPONSIBILITIES =================

describe("responsibility rules", () => {
  it("gate de papel + ativa global", () => {
    expect(() => assertCanStartResponsibility(null)).toThrow(NotFoundError);
    expect(() => assertCanStartResponsibility(null)).toThrow("Usuário não encontrado");
    expect(() => assertCanStartResponsibility({ roles: ["VOLUNTARIO"] })).toThrow(
      "Usuário não tem permissão para iniciar responsabilidades",
    );
    expect(() => assertCanStartResponsibility({ roles: ["LABORATORISTA"] })).not.toThrow();

    expect(() => assertNoActiveResponsibility({ userId: 1 })).toThrow(ConflictError);
    expect(() => assertNoActiveResponsibility({ userId: 1 })).toThrow(
      "Já existe uma responsabilidade ativa. Finalize a responsabilidade atual antes de iniciar uma nova.",
    );
    expect(() => assertNoActiveResponsibility(null)).not.toThrow();
  });

  it("decideCanEndResponsibility: dono true; papel lab true p/ terceiros; desconhecidos false", () => {
    const resp = { userId: 1 };
    expect(decideCanEndResponsibility({ actor: { roles: ["VOLUNTARIO"] }, responsibility: resp, actorUserId: 1 })).toBe(true);
    expect(decideCanEndResponsibility({ actor: { roles: ["VOLUNTARIO"] }, responsibility: resp, actorUserId: 2 })).toBe(false);
    expect(decideCanEndResponsibility({ actor: { roles: ["COORDENADOR"] }, responsibility: resp, actorUserId: 2 })).toBe(true);
    expect(decideCanEndResponsibility({ actor: null, responsibility: resp, actorUserId: 2 })).toBe(false);
    expect(decideCanEndResponsibility({ actor: { roles: ["GERENTE"] }, responsibility: null, actorUserId: 2 })).toBe(false);
  });

  it("QUIRK-8L11: end — notes falsy preserva; já finalizada bloqueia; fim deve ser > início", () => {
    const startTime = new Date("2026-09-16T12:00:00.000Z");
    const now = new Date("2026-09-16T13:00:00.000Z");

    expect(computeEndPatch({ startTime, notes: "originais" }, undefined, now)).toEqual({ endTime: now, notes: "originais" });
    expect(computeEndPatch({ startTime, notes: "originais" }, "", now)).toEqual({ endTime: now, notes: "originais" });
    expect(computeEndPatch({ startTime, notes: "originais" }, "novas", now)).toEqual({ endTime: now, notes: "novas" });

    expect(() => computeEndPatch({ startTime, endTime: now }, undefined, now)).toThrow("Responsabilidade já foi finalizada");
    expect(() => computeEndPatch({ startTime }, undefined, startTime)).toThrow(
      "Dados inválidos: Horário de fim deve ser posterior ao início",
    );
  });

  it("notes patch: trim, vazio => null", () => {
    expect(computeNotesPatch("  ").notes).toBeNull();
    expect(computeNotesPatch(" n ").notes).toBe("n");
  });

  it("QUIRK-8L15: pause no-op quando já pausada; resume dobra trecho em totalPausedMs", () => {
    const t0 = new Date("2026-09-16T12:00:00.000Z");
    const t5 = new Date("2026-09-16T12:00:05.000Z");

    expect(computePausePatch({ pausedAt: null }, t0)).toEqual({ pausedAt: t0 });
    expect(computePausePatch({ pausedAt: t0 }, t5)).toBeNull();

    expect(computeResumePatch({ pausedAt: t0, totalPausedMs: 1000 }, t5)).toEqual({ pausedAt: null, totalPausedMs: 6000 });
    expect(computeResumePatch({ pausedAt: null, totalPausedMs: 0 }, t5)).toBeNull();
  });

  it("validateResponsibilityCreate: ordem verbatim", () => {
    expect(() => validateResponsibilityCreate({})).toThrow(
      "Dados inválidos: ID do usuário é obrigatório, Nome do usuário é obrigatório, Horário de início inválido",
    );
    expect(() =>
      validateResponsibilityCreate({
        userId: 1,
        userName: "u",
        startTime: new Date("2026-09-16T12:00:00.000Z"),
        endTime: new Date("2026-09-16T11:00:00.000Z"),
      }),
    ).toThrow("Horário de fim deve ser posterior ao início");
  });
});
