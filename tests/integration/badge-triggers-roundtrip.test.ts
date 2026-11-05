/**
 * plan-v15 S11 (R4) — roundtrip G4: os episódios concedem badges sem tarefa.
 *
 * Contra o Prisma real (5433): compra, atestado, issue resolvida e fechamento de mês rodam
 * pelos use cases reais com o recompute real do módulo de gamificação. O usuário não tem
 * tarefa nenhuma — as métricas saem dos episódios. Cada badge de critério v2 do episódio é
 * concedido na hora do episódio, sem tarefa e sem fechamento de semana.
 */
// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/database/prisma";
import { userActor } from "@/backend/domain";
import { createGamificationModule } from "@/backend/modules/gamification";
import { createStoreModule } from "@/backend/modules/store";
import { createAttestationModule } from "@/backend/modules/attestation";
import { ResolveIssueUseCase } from "@/backend/modules/lab-operations/application/use-cases/issue.use-cases";
import { PrismaIssueRepository } from "@/backend/modules/lab-operations/infrastructure/repositories/prisma-issue.repository";
import { CloseBoardMonthUseCase } from "@/backend/modules/gamification/application/use-cases/close-board-month.use-case";
import { createPrismaBoardMonthClosePort } from "@/backend/modules/gamification/infrastructure/repositories/prisma-board-month-close.port";

const stamp = Date.now();
const SLUGS = {
  compra: `rt-compra-${stamp}`,
  issue: `rt-issue-${stamp}`,
  mes: `rt-mes-${stamp}`,
  atestado: `rt-atestado-${stamp}`,
};

let userId = 0;
let projectId = 0;
const badgeIds: Record<string, number> = {};
const gamification = createGamificationModule();
const recompute = { recompute: async (uid: number) => { await gamification.evaluateUserBadges(uid); } };

function hasBadge(userId: number, slug: string) {
  return prisma.user_badges.count({ where: { userId, badge: { slug } } });
}

beforeAll(async () => {
  const user = await prisma.users.create({
    data: {
      name: `RT S11 ${stamp}`,
      email: `rt-s11-${stamp}@example.com`,
      status: "active",
      roles: [],
      points: 200,
      currentMonthPoints: 100,
    },
  });
  userId = user.id;
  const project = await prisma.projects.create({
    data: {
      name: `RT S11 ${stamp}`,
      createdAt: "2026-10-01",
      createdBy: userId,
      status: "ativo",
    },
  });
  projectId = project.id;
  await prisma.project_members.create({
    data: { projectId, userId, roles: [], categoria: "VOLUNTARIO", situacao: "ATIVO", cargaHoraria: 8 },
  });

  const criteria = (metricId: string) => ({ version: 2, clauses: [{ metric: metricId, op: ">=", value: 1 }] });
  for (const [key, slug] of Object.entries(SLUGS)) {
    const badge = await prisma.badges.create({
      data: {
        name: `RT ${key} ${stamp}`,
        description: `badge roundtrip S11 ${key}`,
        icon: "Star",
        color: "#22c55e",
        category: "milestone",
        criteria: criteria(key === "compra" ? "purchases_count" : key === "issue" ? "issues_resolved" : key === "mes" ? "months_active" : "certificates_generated"),
        slug,
        isActive: true,
      },
    });
    badgeIds[key] = badge.id;
  }
});

afterAll(async () => {
  await prisma.user_badges.deleteMany({ where: { userId } });
  await prisma.month_history.deleteMany({ where: { month: "2099-06" } });
  await prisma.board_month_closes.deleteMany({ where: { month: "2099-06", track: "MONTH_POINTS" } });
  await prisma.certificates.deleteMany({ where: { userId } });
  await prisma.issues.deleteMany({ where: { reporterId: userId } });
  await prisma.purchases.deleteMany({ where: { userId } });
  await prisma.rewards.deleteMany({ where: { name: `RT recompensa ${stamp}` } });
  await prisma.project_members.deleteMany({ where: { userId } });
  await prisma.projects.deleteMany({ where: { id: projectId } });
  await prisma.badges.deleteMany({ where: { slug: { in: Object.values(SLUGS) } } });
  await prisma.users.deleteMany({ where: { id: userId } });
  await prisma.$disconnect();
});

describe("episódios concedem badges sem tarefa (Prisma real)", () => {
  it("compra concede o badge de compras", async () => {
    const reward = await prisma.rewards.create({ data: { name: `RT recompensa ${stamp}`, price: 10, available: true } });
    const store = createStoreModule({ ports: { recompute } });
    await store.createPurchase({ actor: userActor(userId, []), data: { userId, rewardId: reward.id } });
    expect(await hasBadge(userId, SLUGS.compra)).toBe(1);
    // o preço da compra é o da tabela, sem passiva equipada
    const purchase = await prisma.purchases.findFirst({ where: { userId, rewardId: reward.id } });
    expect(purchase?.price).toBe(10);
  });

  it("atestado gerado concede o badge de atestados", async () => {
    const attestation = createAttestationModule({ ports: { recompute } });
    const result = await attestation.generateCertificate({
      projectId,
      actorId: userId,
      actorRoles: [],
      userId,
      month: "2026-10",
      now: new Date("2026-11-05T12:00:00Z"),
    });
    expect(result.pdfBytes.length).toBeGreaterThan(0);
    expect(await hasBadge(userId, SLUGS.atestado)).toBe(1);
  });

  it("issue resolvida concede o badge ao responsável (assignee), não a quem resolve", async () => {
    const issue = await prisma.issues.create({
      data: { title: `RT issue ${stamp}`, description: "roundtrip", reporterId: userId, assigneeId: userId, status: "open" },
    });
    const useCase = new ResolveIssueUseCase(new PrismaIssueRepository(), recompute);
    await useCase.execute({ actor: userActor(userId, []), issueId: issue.id, resolution: "resolvido no roundtrip" });
    expect(await hasBadge(userId, SLUGS.issue)).toBe(1);
  });

  it("fechamento de mês concede o badge de meses ativos a cada pessoa da linha", async () => {
    const useCase = new CloseBoardMonthUseCase(createPrismaBoardMonthClosePort(), {
      execute: async (uid: number) => gamification.evaluateUserBadges(uid),
    } as never);
    const result = await useCase.execute({ actor: userActor(userId, ["COORDENADOR"]), now: new Date("2099-07-01T03:00:00Z") });
    expect(result.closed).toBe(true);
    expect(await hasBadge(userId, SLUGS.mes)).toBe(1);
  });
});
