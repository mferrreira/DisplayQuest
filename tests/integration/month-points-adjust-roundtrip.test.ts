// @vitest-environment node
/**
 * plan-v9 S05 (MODELO §6, CA12; ADR-006/DEC-228) — o ajuste do placar do mês contra o banco de
 * teste isolado (127.0.0.1:5433; nunca 5432).
 *
 * Wiring real: `createGamificationModule()` sobre os adaptadores Prisma, sem duplo. É aqui que
 * a transação do adaptador existe de verdade; nenhum teste de dupla exercita o re-ler do
 * `previous` nem o `history.create`.
 *
 * O que este arquivo não provaria com um duplo:
 *  - o `set` com negativo muda `users.currentMonthPoints` e escreve a linha de auditoria com
 *    o de→para, o `performedBy` e o mês na descrição — TUDO na mesma transação;
 *  - o `add` com chão em 0 contra dado real (Math.max mordendo no banco);
 *  - o `remove` insuficiente NÃO escreve nada: a coluna e a fila de auditoria ficam como
 *    estavam (a recusa da regra pura morre antes de qualquer escrita);
 *  - `month_history` intocada (a imutabilidade do mês fechado é estrutural: o ajuste só tem
 *    coluna para o mês corrente).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/database/prisma";
import { createGamificationModule } from "@/backend/modules/gamification";
import { userActor, systemActor } from "@/backend/domain";
import { MONTH_ADJUST_HISTORY_ACTION, MONTH_ADJUST_INSUFFICIENT_MESSAGE, monthAdjustDescription } from "@/backend/domain/gamification";

const gamification = createGamificationModule();

const RUN_INSTANT = new Date("2026-10-20T12:00:00.000Z");
const MONTH = "2026-10";
const LABEL = "outubro de 2026";

const stamp = Date.now();
const EMAIL_TAG = `v9-mes-${stamp}`;
const ids: number[] = [];
let managerId = 0;
let targetId = 0;

async function monthPoints(userId: number): Promise<number> {
  const row = await prisma.users.findUnique({ where: { id: userId }, select: { currentMonthPoints: true } });
  return row?.currentMonthPoints ?? -1;
}

async function auditRows(userId: number) {
  return prisma.history.findMany({
    where: { action: MONTH_ADJUST_HISTORY_ACTION, entityId: userId },
    orderBy: { id: "asc" },
  });
}

describe("G4 roundtrip — ajuste do placar do mês (isolated test DB)", () => {
  beforeAll(async () => {
    // Deixa trás da corrida anterior, se alguma caiu no meio: o usuário é RESTRICT por performedBy,
    // então a fila de auditoria sai primeiro.
    const leftovers = await prisma.users.findMany({
      where: { email: { contains: "v9-mes-" } },
      select: { id: true },
    });
    if (leftovers.length > 0) {
      const leftoverIds = leftovers.map((row) => row.id);
      await prisma.history.deleteMany({ where: { action: MONTH_ADJUST_HISTORY_ACTION, entityId: { in: leftoverIds } } });
      await prisma.history.deleteMany({ where: { action: MONTH_ADJUST_HISTORY_ACTION, performedBy: { in: leftoverIds } } });
      await prisma.users.deleteMany({ where: { id: { in: leftoverIds } } });
    }

    const manager = await prisma.users.create({
      data: {
        name: "V9 Mes Gestor",
        email: `${EMAIL_TAG}-gestor@test.local`,
        password: "g4-dummy-hash",
        status: "active",
        roles: ["COORDENADOR"],
      },
      select: { id: true },
    });
    const target = await prisma.users.create({
      data: {
        name: "V9 Mes Alvo",
        email: `${EMAIL_TAG}-alvo@test.local`,
        password: "g4-dummy-hash",
        status: "active",
        roles: ["VOLUNTARIO"],
      },
      select: { id: true },
    });
    managerId = manager.id;
    targetId = target.id;
    ids.push(managerId, targetId);
  });

  afterAll(async () => {
    // Ordem importa: a fila de auditoria é RESTRICT para ambos os usuários, e o alvo é o entityId.
    await prisma.history.deleteMany({ where: { action: MONTH_ADJUST_HISTORY_ACTION, entityId: { in: ids } } });
    await prisma.history.deleteMany({ where: { action: MONTH_ADJUST_HISTORY_ACTION, performedBy: { in: ids } } });
    await prisma.users.deleteMany({ where: { id: { in: ids } } });
  });

  const manager = () => userActor(managerId, ["COORDENADOR"]);

  it("o `set` com negativo atravessa a transação: coluna e auditoria saem juntas, com o de→para", async () => {
    let before = await monthPoints(targetId);
    if (before !== 0) {
      throw new Error(`Alvo deveria nascer com placar 0, veio ${before}`);
    }

    const result = await gamification.adjustMonthPoints({
      actor: manager(),
      userId: targetId,
      action: "set",
      points: -15,
      now: RUN_INSTANT,
    });

    expect(result).toEqual({
      userId: targetId,
      month: MONTH,
      monthLabel: LABEL,
      action: "set",
      previous: 0,
      current: -15,
    });
    expect(await monthPoints(targetId)).toBe(-15);

    const rows = await auditRows(targetId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      entityType: "USER",
      entityId: targetId,
      action: MONTH_ADJUST_HISTORY_ACTION,
      performedBy: managerId,
      description: monthAdjustDescription(MONTH),
    });
    expect(rows[0]?.oldValues).toEqual({ currentMonthPoints: 0 });
    expect(rows[0]?.newValues).toEqual({ currentMonthPoints: -15 });
    expect(rows[0]?.metadata).toEqual({ domain: "gamification", action: "set", points: -15, month: MONTH });
  });

  it("o `add` com chão em 0 morde no banco: -15 + 3 somadas termina em 0, não em -12", async () => {
    const result = await gamification.adjustMonthPoints({
      actor: manager(),
      userId: targetId,
      action: "add",
      points: 3,
      now: RUN_INSTANT,
    });
    // Estado do teste anterior: -15. A soma crua daria -12; o Math.max da regra de chão em 0
    // escreve 0 — aritmética real, a mesma transação de coluna e auditoria.
    expect(result).toMatchObject({ previous: -15, current: 0 });
    expect(await monthPoints(targetId)).toBe(0);
  });

  it("o `remove` insuficiente escreve NADA: coluna e fila de auditoria ficam como estavam", async () => {
    const before = await auditRows(targetId);

    const error = await gamification
      .adjustMonthPoints({ actor: manager(), userId: targetId, action: "remove", points: 10, now: RUN_INSTANT })
      .catch((e) => e);

    expect(String(error?.message)).toBe(MONTH_ADJUST_INSUFFICIENT_MESSAGE);
    expect(await monthPoints(targetId)).toBe(0);
    expect(await auditRows(targetId)).toHaveLength(before.length);
  });

  it("o `remove` suficiente registra o de→para e a coluna desce", async () => {
    await gamification.adjustMonthPoints({ actor: manager(), userId: targetId, action: "set", points: 40, now: RUN_INSTANT });

    const result = await gamification.adjustMonthPoints({
      actor: manager(),
      userId: targetId,
      action: "remove",
      points: 15,
      now: RUN_INSTANT,
    });
    expect(result).toEqual({
      userId: targetId,
      month: MONTH,
      monthLabel: LABEL,
      action: "remove",
      previous: 40,
      current: 25,
    });
    expect(await monthPoints(targetId)).toBe(25);

    const rows = await auditRows(targetId);
    expect(rows).toHaveLength(4);
    expect(rows[3]?.oldValues).toEqual({ currentMonthPoints: 40 });
    expect(rows[3]?.newValues).toEqual({ currentMonthPoints: 25 });
  });

  it("pessoa inexistente é NotFoundError e nenhuma linha nasce", async () => {
    const before = await prisma.history.count({ where: { action: MONTH_ADJUST_HISTORY_ACTION } });

    const error = await gamification
      .adjustMonthPoints({ actor: manager(), userId: 999999999, action: "set", points: 1, now: RUN_INSTANT })
      .catch((e) => e);

    expect(String(error?.message)).toBe("Usuário não encontrado");
    expect(await prisma.history.count({ where: { action: MONTH_ADJUST_HISTORY_ACTION } })).toBe(before);
  });

  it("ator de sistema é recusado antes de ler o banco: performedBy nunca é fantasma", async () => {
    const before = await prisma.history.count({ where: { action: MONTH_ADJUST_HISTORY_ACTION } });

    const error = await gamification
      .adjustMonthPoints({
        actor: systemActor("NIGHTLY_SWEEP" as never),
        userId: targetId,
        action: "set",
        points: 1,
        now: RUN_INSTANT,
      })
      .catch((e) => e);

    expect(String(error?.message)).toBe("O ajuste do placar do mês precisa de uma pessoa responsável.");
    expect(await monthPoints(targetId)).toBe(25);
    expect(await prisma.history.count({ where: { action: MONTH_ADJUST_HISTORY_ACTION } })).toBe(before);
  });

  it("o VOLUNTARIO não ajusta nem a si: gate REAL no módulo real, nada escrito", async () => {
    const before = await auditRows(targetId);

    const error = await gamification
      .adjustMonthPoints({ actor: userActor(targetId, ["VOLUNTARIO"]), userId: targetId, action: "set", points: 1, now: RUN_INSTANT })
      .catch((e) => e);

    expect(String(error?.message)).toBe("Apenas coordenadores e gerentes podem ajustar o placar do mês");
    expect(await monthPoints(targetId)).toBe(25);
    expect(await auditRows(targetId)).toHaveLength(before.length);
  });

  it("month_history ficou intocada: o ajuste só tem coluna para o mês corrente (mês fechado imutável)", async () => {
    expect(await prisma.month_history.count({ where: { userId: { in: ids } } })).toBe(0);
  });
});
