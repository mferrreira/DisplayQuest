// @vitest-environment node
/**
 * plan-v15 S09 (R5, CA3) — o catálogo SQL instala no banco de teste isolado 5433 (nunca
 * na 5432), pelo MESMO executor do `npm run db:catalogo-badges`.
 *
 * O que este arquivo prova:
 *  - o arquivo tem exatamente 50 statements;
 *  - depois da aplicação, as 50 slugs do catálogo existem no banco, com criteria v2
 *    parseável e effect nulo/passiva lidos da coluna JSON;
 *  - instalação não concede badge: `user_badges` não muda;
 *  - re-run: zero linhas inseridas (ON CONFLICT DO NOTHING), as 50 slugs seguem presentes.
 *
 * O escopo é o CONJUNTO DE SLUGS do arquivo, não a contagem global: `db:test:setup` instala
 * o catálogo de forma permanente na 5433, e o teste tem que ser verde com o catálogo já
 * presente (baseline 50) e com ele ausente (baseline 0). Cleanup deleta as slugs do
 * catálogo e nada mais — os badges do seed (slug nulo) ficam intactos.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { applyCatalog } from "../../scripts/apply-catalog-badges.mjs";

const prisma = new PrismaClient();

// As slugs vêm do próprio arquivo — a guarda de vocabulário congela a forma das linhas.
const SLUGS = (readFileSync("prisma/cataloga-badges.sql", "utf8")
  .match(/, '([a-z0-9]+(?:-[a-z0-9]+)*)', (?:NULL|'[^']*'::jsonb), true/g) ?? [])
  .map((m) => /'([a-z0-9-]+)'/.exec(m)![1]);

let baselineUserBadges = 0;

beforeAll(async () => {
  baselineUserBadges = await prisma.user_badges.count();
});

afterAll(async () => {
  // Deleta as slugs do catálogo. Badges de seed (slug nulo) não são tocados; nenhum
  // user_badges aponta para eles (a instalação não concede).
  await prisma.badges.deleteMany({ where: { slug: { in: SLUGS } } });
  await prisma.$disconnect();
});

describe("catálogo de 50 badges instala idempotente (5433)", () => {
  it("o arquivo tem exatamente 50 statements com as 50 slugs do catálogo", () => {
    expect(SLUGS.length).toBe(50);
    expect(new Set(SLUGS).size).toBe(50);
  });

  it("depois da aplicação, as 50 slugs existem no banco com criteria v2 e effect válido, sem conceder a ninguém", async () => {
    const r = await applyCatalog(prisma);
    expect(r.statements).toBe(50);

    const rows = await prisma.badges.findMany({ where: { slug: { in: SLUGS } }, orderBy: { slug: "asc" } });
    expect(rows.length).toBe(50);
    expect(rows.map((row) => row.slug).sort()).toEqual([...SLUGS].sort());

    for (const row of rows) {
      const criteria = row.criteria as { version: number; clauses: Array<{ metric: string; op: string; value: number }> };
      expect(criteria.version).toBe(2);
      expect(criteria.clauses.length).toBeGreaterThanOrEqual(1);
      for (const cl of criteria.clauses) {
        expect(cl.op).toBe(">=");
        expect(cl.value).toBeGreaterThanOrEqual(1);
      }
      if (row.effect !== null) {
        const e = row.effect as { kind: string; pct: number };
        expect(["bonus", "penaltyReduction"]).toContain(e.kind);
        expect(e.pct).toBeGreaterThan(0);
        expect(e.pct).toBeLessThanOrEqual(1);
      }
    }

    expect(await prisma.user_badges.count()).toBe(baselineUserBadges);
  });

  it("re-run: zero linhas inseridas, as 50 slugs seguem presentes", async () => {
    const r = await applyCatalog(prisma);
    expect(r.inserted).toBe(0);
    const present = await prisma.badges.count({ where: { slug: { in: SLUGS } } });
    expect(present).toBe(50);
    expect(r.userBadges).toBe(baselineUserBadges);
  });
});
