// @vitest-environment node
/**
 * plan-v8 V8-5 (DEC-215/216/222 + ASK-V8-24) — G4 roundtrip do ajuste manual do painel sobre as
 * DUAS trilhas, contra o banco de teste isolado (127.0.0.1:5433 — DEC-10/BLOCKER-02; nunca 5432).
 *
 * Por que isto é um roundtrip e não um teste de use case (ASK-V8-24 foi respondida com "cada
 * ajuste com linha de `history`"): a promessa tem três partes e só o banco prova as três juntas —
 *   1. o saldo cai na COLUNA da trilha declarada (`points` para pontos, `coins` para moeda) e a
 *      outra trilha fica intacta, quando as duas colunas são `Int` e o `tsc` aceitaria a errada;
 *   2. a linha de auditoria existe, com trilha na coluna `track`, o ANTES e o DEPOIS lidos dentro
 *      do MESMO $transaction, e assinada pela pessoa que ajustou (`performedBy` é FK de `users`);
 *   3. a linha do ajuste é de OUTRA família do award (`action` TRACK_ADJUSTMENT), então a
 *      idempotência de premiação (`hasAward` por descrição) continua cega a ela — e uma reexecução
 *      do painel não vira credit e nem bloqueia credit futuro.
 *
 * O módulo é o real, exatamente como o composition root o monta (sem portas injetadas): o ledger
 * aqui é o adaptador Prisma, que é justamente o que se quer exercitar.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { COINS_GAMIFICATION_TRACK, POINTS_GAMIFICATION_TRACK, ValidationError, userActor } from "@/backend/domain";
import { createUserManagementModule } from "@/backend/modules/user-management";
import { prisma } from "@/lib/database/prisma";

const userModule = createUserManagementModule();
const stamp = Date.now();
const createdUserIds: number[] = [];
let targetId = 0;
let managerId = 0;

/**
 * `action` é a família da linha (TRACK_ADJUSTMENT) e `adjustmentAction` é a ação do ajuste, gravada
 * em `newValues` — as duas não podem ocupar a mesma chave no filtro, senão a segunda sobrescreve a
 * primeira e a consulta devolve vazio.
 */
function adjustmentRows(filter: { track?: string; adjustmentAction?: string } = {}) {
  return prisma.history.findMany({
    where: {
      action: "TRACK_ADJUSTMENT",
      entityId: targetId,
      ...(filter.track ? { track: filter.track } : {}),
      ...(filter.adjustmentAction ? { newValues: { path: ["action"], equals: filter.adjustmentAction } } : {}),
    },
    select: { entityType: true, entityId: true, performedBy: true, track: true, description: true, oldValues: true, newValues: true, metadata: true },
    orderBy: { id: "asc" },
  });
}

async function balances(id: number) {
  const user = await prisma.users.findUnique({ where: { id }, select: { points: true, coins: true } });
  if (!user) throw new Error(`usuário ${id} sumiu do banco de teste`);
  return user;
}

describe("G4 roundtrip — ajuste manual de trilha (isolated test DB, 5433)", () => {
  beforeAll(async () => {
    const target = await prisma.users.create({
      data: {
        name: `V8-5 Ajustado ${stamp}`,
        email: `v8-5-ajuste-alvo-${stamp}@test.local`,
        password: "g4-dummy-hash",
        status: "active",
        roles: ["VOLUNTARIO"],
        points: 100,
        coins: 40,
      },
      select: { id: true },
    });
    // `history.performedBy` é FK para `users`: o auditor precisa ser uma pessoa que existe. É a
    // mesma regra que faz `countBlockingDependencies` contar linha de ledger (DEC-55).
    const manager = await prisma.users.create({
      data: {
        name: `V8-5 Gestor ${stamp}`,
        email: `v8-5-ajuste-gestor-${stamp}@test.local`,
        password: "g4-dummy-hash",
        status: "active",
        roles: ["COORDENADOR"],
      },
      select: { id: true },
    });
    targetId = target.id;
    managerId = manager.id;
    createdUserIds.push(targetId, managerId);
  });

  afterAll(async () => {
    // A linha de auditoria bloqueia a deleção da pessoa que a assinou (RESTRICT), então é apagada
    // antes — este arquivo criou as duas, este arquivo as remove.
    await prisma.history.deleteMany({
      where: {
        OR: [{ performedBy: { in: createdUserIds } }, { entityId: { in: createdUserIds }, entityType: "USER" }],
      },
    });
    await prisma.users.deleteMany({ where: { id: { in: createdUserIds } } });
  });

  it("ajuste de PONTOS escreve `users.points` e a linha de auditoria com trilha, antes e depois", async () => {
    const result = await userModule.adjustUserBalance({
      actor: userActor(managerId, ["COORDENADOR"]),
      userId: targetId,
      track: POINTS_GAMIFICATION_TRACK,
      action: "add",
      amount: 7,
    });

    expect((result as { points: number }).points).toBe(107);
    expect(await balances(targetId)).toEqual({ points: 107, coins: 40 });

    const rows = await adjustmentRows({ track: POINTS_GAMIFICATION_TRACK, adjustmentAction: "add" });
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row).toMatchObject({
      entityType: "USER",
      entityId: targetId,
      performedBy: managerId,
      track: POINTS_GAMIFICATION_TRACK,
      description: "GAMIFICATION:ADJUSTMENT:POINTS:add:7",
    });
    expect(row.oldValues).toEqual({ balance: 100 });
    expect(row.newValues).toEqual({ balance: 107, action: "add", amount: 7 });
    expect(row.metadata).toMatchObject({ domain: "user-management", track: POINTS_GAMIFICATION_TRACK, action: "add", actorId: managerId });
  });

  it("ajuste de MOEDA escreve `users.coins` e deixa o placar do mês onde estava (DEC-215)", async () => {
    const before = await balances(targetId);

    const result = await userModule.adjustUserBalance({
      actor: userActor(managerId, ["COORDENADOR"]),
      userId: targetId,
      track: COINS_GAMIFICATION_TRACK,
      action: "set",
      amount: 500,
    });

    expect((result as { coins: number }).coins).toBe(500);
    const after = await balances(targetId);
    expect(after).toEqual({ points: before.points, coins: 500 });

    const row = await prisma.history.findFirst({
      where: { action: "TRACK_ADJUSTMENT", entityId: targetId, track: COINS_GAMIFICATION_TRACK },
      select: { track: true, description: true, oldValues: true, newValues: true },
    });
    expect(row?.description).toBe("GAMIFICATION:ADJUSTMENT:COINS:set:500");
    expect(row?.oldValues).toEqual({ balance: 40 });
    expect(row?.newValues).toEqual({ balance: 500, action: "set", amount: 500 });
  });

  it("`remove` sem suficiência e `set` negativo na moeda não escrevem saldo nem linha", async () => {
    const before = await balances(targetId);

    await expect(
      userModule.adjustUserBalance({
        actor: userActor(managerId, ["COORDENADOR"]),
        userId: targetId,
        track: COINS_GAMIFICATION_TRACK,
        action: "remove",
        amount: 9999,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      userModule.adjustUserBalance({
        actor: userActor(managerId, ["COORDENADOR"]),
        userId: targetId,
        track: COINS_GAMIFICATION_TRACK,
        action: "remove",
        amount: 9999,
      }),
    ).rejects.toThrow("Usuário não possui moedas suficientes");
    await expect(
      userModule.adjustUserBalance({
        actor: userActor(managerId, ["COORDENADOR"]),
        userId: targetId,
        track: COINS_GAMIFICATION_TRACK,
        action: "set",
        amount: -20,
      }),
    ).rejects.toThrow("Moedas devem ser um número não negativo");

    expect(await balances(targetId)).toEqual(before);
    expect(await adjustmentRows()).toHaveLength(2); // os dois ajustes que passaram
  });

  it("a trilha pontos continua aceitando `set` negativo (DEC-60) e o negativo vai para a linha", async () => {
    const result = await userModule.adjustUserBalance({
      actor: userActor(managerId, ["COORDENADOR"]),
      userId: targetId,
      track: POINTS_GAMIFICATION_TRACK,
      action: "set",
      amount: -250,
    });

    expect((result as { points: number }).points).toBe(-250);
    expect(await balances(targetId)).toMatchObject({ points: -250 });

    const row = await prisma.history.findFirst({
      where: { action: "TRACK_ADJUSTMENT", entityId: targetId, description: "GAMIFICATION:ADJUSTMENT:POINTS:set:-250" },
      select: { track: true, newValues: true },
    });
    expect(row?.track).toBe(POINTS_GAMIFICATION_TRACK);
    expect((row?.newValues as { balance: number }).balance).toBe(-250);
  });

  it("a linha do ajuste não confunde a idempotência da premiação (famílias separadas)", async () => {
    // O `hasAward` de premiação lê (entityType USER, action GAMIFICATION_AWARD, description). Uma
    // linha de ajuste tem a MESMA forma de chave (`GAMIFICATION:...`) e o MESMO dono; se caísse na
    // mesma consulta, um ajuste manual faria um prêmio futuro ser creditado como "já creditado".
    const adjustment = await adjustmentRows({ adjustmentAction: "set" });
    expect(adjustment.length).toBeGreaterThan(0);

    const asAward = await prisma.history.count({
      where: {
        entityType: "USER",
        entityId: targetId,
        action: "GAMIFICATION_AWARD",
        description: adjustment[0].description as string,
      },
    });
    expect(asAward).toBe(0);

    // E o reverso: a varredura que apaga o feed de tarefa (entityType "task") não alcança a linha.
    const asTaskFeed = await prisma.history.count({
      where: { entityType: "task", entityId: targetId, action: "TRACK_ADJUSTMENT" },
    });
    expect(asTaskFeed).toBe(0);
  });

  it("ajuste em pessoa que não existe é 404 e não escreve nada", async () => {
    await expect(
      userModule.adjustUserBalance({
        actor: userActor(managerId, ["COORDENADOR"]),
        userId: 990000 + (stamp % 1000),
        track: COINS_GAMIFICATION_TRACK,
        action: "add",
        amount: 5,
      }),
    ).rejects.toThrow("Usuário não encontrado");
  });
});
