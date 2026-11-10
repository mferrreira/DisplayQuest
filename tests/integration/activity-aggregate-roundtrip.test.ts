// @vitest-environment node
/**
 * plan-v13 S04 — G4 roundtrip da leitura agregada de atividades contra o banco de teste
 * ISOLADO (127.0.0.1:5433, nunca 5432).
 *
 * O que a medição contra Prisma real prova: `listAllActivities` devolve as linhas de TODOS os
 * projetos numa chamada só, com os campos que a tela dos gráficos consome. O roundtrip cria
 * dois projetos e uma atividade em cada, e a leitura agregada acha as duas.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/database/prisma";
import { createPrismaProjectCronogramaRepository } from "@/backend/modules/project-management/infrastructure/repositories/prisma-project-cronograma.repository";

const stamp = Date.now();
let projectA = 0;
let projectB = 0;
const createdActivityIds: number[] = [];

describe("G4 roundtrip — leitura agregada de atividades (isolated test DB)", () => {
  beforeAll(async () => {
    const user = await prisma.users.create({
      data: {
        name: `G4 Aggregate ${stamp}`,
        email: `g4-aggregate-${stamp}@test.local`,
        password: "g4-dummy-hash",
        status: "active",
        roles: ["VOLUNTARIO"],
      },
      select: { id: true },
    });

    const projects = await Promise.all([
      prisma.projects.create({
        data: {
          name: `G4 Projeto A ${stamp}`,
          description: null,
          createdAt: new Date().toISOString(),
          createdBy: user.id,
          status: "active",
        },
        select: { id: true },
      }),
      prisma.projects.create({
        data: {
          name: `G4 Projeto B ${stamp}`,
          description: null,
          createdAt: new Date().toISOString(),
          createdBy: user.id,
          status: "active",
        },
        select: { id: true },
      }),
    ]);
    projectA = projects[0].id;
    projectB = projects[1].id;

    const rows = await Promise.all([
      prisma.project_activities.create({
        data: {
          projectId: projectA,
          order: 1,
          description: "Atividade A",
          responsibleId: user.id,
          firstMonth: "2026-04",
          lastMonth: "2026-06",
        },
        select: { id: true },
      }),
      prisma.project_activities.create({
        data: {
          projectId: projectB,
          order: 1,
          description: "Atividade B",
          responsibleId: user.id,
          firstMonth: "2026-01",
          lastMonth: "2026-02",
          status: "DONE",
        },
        select: { id: true },
      }),
    ]);
    createdActivityIds.push(...rows.map((row) => row.id));
  });

  afterAll(async () => {
    await prisma.project_activities.deleteMany({ where: { id: { in: createdActivityIds } } });
    await prisma.projects.deleteMany({ where: { id: { in: [projectA, projectB] } } });
    await prisma.users.deleteMany({ where: { email: `g4-aggregate-${stamp}@test.local` } });
  });

  it("uma chamada devolve as atividades de todos os projetos", async () => {
    const port = createPrismaProjectCronogramaRepository();
    const rows = await port.listAllActivities();

    const mine = rows.filter((row) => row.projectId === projectA || row.projectId === projectB);
    expect(mine).toHaveLength(2);

    const a = mine.find((row) => row.projectId === projectA)!;
    expect(a.description).toBe("Atividade A");
    expect(a.status).toBe("OPEN");
    expect(a.firstMonth).toBe("2026-04");
    expect(a.lastMonth).toBe("2026-06");

    const b = mine.find((row) => row.projectId === projectB)!;
    expect(b.status).toBe("DONE");
    expect(b.order).toBe(1);
  });
});
