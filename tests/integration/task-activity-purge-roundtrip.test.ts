// @vitest-environment node
/**
 * V6-11k (pedido do dono) — G4 roundtrip da LIMPEZA do feed de atividade contra o banco de
 * teste ISOLADO (127.0.0.1:5433, nunca 5432).
 *
 * O dono foi explicito: DELETE no banco nao admite erro. Entao a medicao contra Prisma real
 * prova o ESCOPO, que e a trava da operacao:
 *
 *   - linha de tarefa (entityType "task") ANTERIOR ao corte  -> apagada;
 *   - linha de tarefa de HOJE                                -> preservada;
 *   - GAMIFICATION_AWARD (entityType "USER") antiga          -> PRESERVADA (a idempotencia de
 *     premiacao LE essas linhas; apagar faria premiar duas vezes);
 *   - LAB_NOTICE antigo                                      -> PRESERVADO (e o quadro de avisos,
 *     nao um log).
 *
 * A tabela `history` e compartilhada pelas tres familias; este arquivo e onde o filtro estreito
 * do adapter aparece como comportamento, e nao como comentario.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/database/prisma";
import { startOfCivilDayInstant } from "@/backend/domain";
import { createPrismaTaskActivityPort } from "@/backend/modules/task-management/infrastructure/adapters/prisma-task-activity";

const stamp = Date.now();
let userId = 0;
const createdHistoryIds: number[] = [];

const OLD = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000); // 3 dias atras: sempre antes do corte
const NOW = new Date();

describe("G4 roundtrip — limpeza do feed de atividade (isolated test DB)", () => {
  beforeAll(async () => {
    const user = await prisma.users.create({
      data: {
        name: `G4 Purge ${stamp}`,
        email: `g4-purge-${stamp}@test.local`,
        password: "g4-dummy-hash",
        status: "active",
        roles: ["VOLUNTARIO"],
      },
      select: { id: true },
    });
    userId = user.id;

    const rows = await Promise.all([
      prisma.history.create({
        data: { entityType: "task", entityId: 1, action: "CREATE", performedBy: userId, description: `purge-task-old-${stamp}`, performedAt: OLD },
      }),
      prisma.history.create({
        data: { entityType: "task", entityId: 1, action: "MOVE", performedBy: userId, description: `purge-task-today-${stamp}`, performedAt: NOW },
      }),
      prisma.history.create({
        data: { entityType: "USER", entityId: userId, action: "GAMIFICATION_AWARD", performedBy: userId, description: `purge-award-old-${stamp}`, performedAt: OLD },
      }),
      prisma.history.create({
        data: { entityType: "LAB_NOTICE", entityId: 0, action: "CREATE", performedBy: userId, description: `purge-notice-old-${stamp}`, performedAt: OLD },
      }),
    ]);
    createdHistoryIds.push(...rows.map((row) => row.id));
  });

  afterAll(async () => {
    // Limpa o que sobrou (as linhas preservadas) — o banco de teste nao acumula fixture.
    await prisma.history.deleteMany({ where: { id: { in: createdHistoryIds } } });
    await prisma.users.deleteMany({ where: { id: userId } });
  });

  it("apaga so a tarefa anterior ao corte; tarefa de hoje, premiacao e aviso sobrevivem", async () => {
    const port = createPrismaTaskActivityPort();
    const cutoff = startOfCivilDayInstant(new Date());

    const removed = await port.purgeOlderThan(cutoff);

    expect(removed).toBeGreaterThanOrEqual(1);

    const survivors = await prisma.history.findMany({
      where: { id: { in: createdHistoryIds } },
      select: { id: true, description: true },
    });
    const descriptions = survivors.map((row) => row.description);

    expect(descriptions).toContain(`purge-task-today-${stamp}`);
    expect(descriptions).toContain(`purge-award-old-${stamp}`);
    expect(descriptions).toContain(`purge-notice-old-${stamp}`);
    expect(descriptions).not.toContain(`purge-task-old-${stamp}`);
  });
});
