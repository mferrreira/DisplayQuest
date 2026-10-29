// @vitest-environment node
/**
 * V5-8 (DEC-64) — G4 roundtrip da VARREDURA DE ATRASO contra o banco de teste ISOLADO
 * (127.0.0.1:5433 — nunca a 5432).
 *
 * Wiring real, sem mocks: módulo de projeto REAL com o módulo de notificações REAL
 * injetado pela porta local `ActivityOverdueNotifierPort` (DEC-21) — o mesmo wiring do
 * composition root, montado à mão aqui. O ator é o do cron: `systemActor(OVERDUE_SCAN)`.
 *
 * O que este arquivo mede:
 *   1. atividade vencida (OPEN e COMPLETION_REQUESTED) vira notificação `priority: true`
 *      de verdade na tabela, uma linha por destinatário, tipo/título/mensagem do domínio;
 *   2. audiência medida no banco: líder + TODOS os usuários ATIVOS com papel global
 *      COORDENADOR/GERENTE — o coordenador SUSPENSO não recebe (bloqueio de status,
 *      DEC-55), e o líder que também é coordenador recebe UMA linha;
 *   3. atividade ainda no período e atividade já notificada não viram notificação;
 *   4. `overdueNotifiedAt` é escrito só para as notificadas — a guarda do "uma só":
 *      reexecutar a varredura não duplica notificação nenhuma.
 *
 * A audiência global depende do estado do banco de teste (usuários do seed), então a
 * expectativa é calculada contra o próprio banco, não hardcoded.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/database/prisma";
import { createProjectManagementModule } from "@/backend/modules/project-management";
import { createNotificationsModule } from "@/backend/modules/notifications";
import { createNotificationsActivityOverdueNotifier } from "@/backend/modules/project-management/infrastructure/adapters/notifications-activity-overdue";
import { SYSTEM_REASONS, systemActor } from "@/backend/domain";

const stamp = Date.now();
// "Hoje" do scan: 05/11/2026. Prazos: 30/09 e 31/10 vencidos; 31/12 dentro do período.
const NOW = new Date("2026-11-05T12:00:00.000Z");

const projectModule = createProjectManagementModule({
  ports: {
    overdueNotifier: createNotificationsActivityOverdueNotifier(createNotificationsModule()),
  },
});

let leaderId = 0; // líder do projeto (PESQUISADOR — não é gestor global)
let coordinatorId = 0; // COORDENADOR global ativo
let gerenteId = 0; // GERENTE global ativo
let suspendedId = 0; // COORDENADOR suspenso — fora da audiência
let projectId = 0;
let overdueOpenId = 0;
let overdueRequestedId = 0;
let inPeriodId = 0;
let alreadyNotifiedId = 0;
const createdUserIds: number[] = [];

describe("G4 roundtrip — varredura de atraso de atividade (isolated test DB)", () => {
  beforeAll(async () => {
    const specs: Array<{ name: string; roles: UserRole[]; status: "active" | "suspended" }> = [
      { name: "Lider", roles: ["PESQUISADOR"], status: "active" },
      { name: "Coord Ativo", roles: ["COORDENADOR"], status: "active" },
      { name: "Gerente Ativo", roles: ["GERENTE"], status: "active" },
      { name: "Coord Suspenso", roles: ["COORDENADOR"], status: "suspended" },
    ];
    const users = await Promise.all(
      specs.map((spec) =>
        prisma.users.create({
          data: {
            name: `G4 Atr ${spec.name} ${stamp}`,
            email: `g4-atr-${spec.name.toLowerCase().replace(/\s+/g, "-")}-${stamp}@test.local`,
            password: "g4-dummy-hash",
            status: spec.status,
            roles: spec.roles,
          },
          select: { id: true },
        }),
      ),
    );
    // Promise.all não garante ordem — pareia por e-mail, não por posição.
    const byName = new Map(users.map((u, i) => [specs[i].name, u.id]));
    leaderId = byName.get("Lider")!;
    coordinatorId = byName.get("Coord Ativo")!;
    gerenteId = byName.get("Gerente Ativo")!;
    suspendedId = byName.get("Coord Suspenso")!;
    createdUserIds.push(...users.map((u) => u.id));

    const project = await prisma.projects.create({
      // `projects.createdAt` é data civil String obrigatória (DEC-132) — sem default.
      data: { name: `G4 Atraso ${stamp}`, createdBy: coordinatorId, leaderId, createdAt: "2026-01-01", status: "active" },
      select: { id: true },
    });
    projectId = project.id;

    const activities = [
      { order: 1, description: "Etapa vencida aberta", firstMonth: "2026-09", lastMonth: "2026-09" },
      { order: 2, description: "Etapa vencida pedida", firstMonth: "2026-10", lastMonth: "2026-10", status: "COMPLETION_REQUESTED", requestedBy: coordinatorId, requestedAt: new Date("2026-11-01T12:00:00Z") },
      { order: 3, description: "Etapa dentro do período", firstMonth: "2026-11", lastMonth: "2026-12" },
      { order: 4, description: "Etapa ja notificada", firstMonth: "2026-08", lastMonth: "2026-08", overdueNotifiedAt: new Date("2026-10-01T12:00:00Z") },
    ];
    const created = await Promise.all(
      activities.map((activity) =>
        prisma.project_activities.create({
          data: { projectId, ...activity },
          select: { id: true, order: true },
        }),
      ),
    );
    const byOrder = new Map(created.map((a) => [a.order, a.id]));
    overdueOpenId = byOrder.get(1)!;
    overdueRequestedId = byOrder.get(2)!;
    inPeriodId = byOrder.get(3)!;
    alreadyNotifiedId = byOrder.get(4)!;
  });

  afterAll(async () => {
    // notifications cascadeia com o usuário; activities cascadeiam com o projeto.
    // A limpeza por `type` é a única segura: a audiência inclui gestores do seed, que
    // não estão em createdUserIds — e este arquivo é o único produtor de ACTIVITY_OVERDUE.
    await prisma.notifications.deleteMany({ where: { type: "ACTIVITY_OVERDUE" } });
    await prisma.projects.delete({ where: { id: projectId } });
    await prisma.users.deleteMany({ where: { id: { in: createdUserIds } } });
  });

  it("varredura notifica as vencidas, ignora as demais, e marca só as notificadas", async () => {
    const result = await projectModule.notifyOverdueActivities({
      actor: systemActor(SYSTEM_REASONS.OVERDUE_SCAN),
      now: NOW,
    });

    // Audiência calculada contra o próprio banco: todos os COORDENADOR/GERENTE ATIVOS.
    const globalManagers = await prisma.users.findMany({
      where: { status: "active", roles: { hasSome: ["COORDENADOR", "GERENTE"] } },
      select: { id: true },
    });
    const expectedAudience = new Set<number>([leaderId, ...globalManagers.map((u) => u.id)]);

    const rows = await prisma.notifications.findMany({
      where: { type: "ACTIVITY_OVERDUE", title: "Atividade atrasada" },
    });

    // Cada atividade vencida → uma linha por destinatário (líder + gestores ativos).
    const audienceIds = new Set(rows.map((row) => row.userId));
    expect(audienceIds.has(leaderId)).toBe(true);
    expect(audienceIds.has(coordinatorId)).toBe(true);
    expect(audienceIds.has(gerenteId)).toBe(true);
    expect(audienceIds.has(suspendedId)).toBe(false); // bloqueio de status (DEC-55)
    expect(rows).toHaveLength(expectedAudience.size * 2); // 2 atividades vencidas

    for (const row of rows) {
      expect(row.priority).toBe(true);
      expect(row.read).toBe(false);
    }
    const vencidaAberta = rows.find((row) =>
      row.message.includes('"Etapa vencida aberta"'),
    );
    expect(vencidaAberta?.message).toBe(
      'A atividade "Etapa vencida aberta" do projeto "G4 Atraso ' + stamp +
        '" venceu em 30/09/2026 e ainda não foi concluída.',
    );

    // A marca saiu só para as vencidas notificadas; a do período segue nula, e a
    // já-notificada mantém a marca original (não foi reescrita pelo scan).
    const marked = await prisma.project_activities.findMany({
      where: { id: { in: [overdueOpenId, overdueRequestedId, inPeriodId, alreadyNotifiedId] } },
      select: { id: true, overdueNotifiedAt: true },
    });
    const markById = new Map(marked.map((row) => [row.id, row.overdueNotifiedAt]));
    expect(markById.get(overdueOpenId)).not.toBeNull();
    expect(markById.get(overdueRequestedId)).not.toBeNull();
    expect(markById.get(inPeriodId)).toBeNull();
    expect(markById.get(alreadyNotifiedId)?.toISOString()).toBe(new Date("2026-10-01T12:00:00Z").toISOString());

    expect(result.notifiedActivities).toBe(2);
    expect(result.recipientsNotified).toBe(expectedAudience.size * 2);
  });

  it("reexecutar a varredura não duplica notificação nenhuma (guarda overdueNotifiedAt)", async () => {
    const before = await prisma.notifications.count({ where: { type: "ACTIVITY_OVERDUE" } });

    const result = await projectModule.notifyOverdueActivities({
      actor: systemActor(SYSTEM_REASONS.OVERDUE_SCAN),
      now: NOW,
    });

    const after = await prisma.notifications.count({ where: { type: "ACTIVITY_OVERDUE" } });
    expect(after).toBe(before);
    expect(result.notifiedActivities).toBe(0);
  });
});
