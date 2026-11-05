/**
 * plan-v15 S09 (R5/R1/R3/R8, CA11) — guarda de vocabulário do catálogo SQL.
 *
 * Por que este arquivo existe: o catálogo vive em `prisma/cataloga-badges.sql`, texto SQL,
 * e NADA no tsc lê esse texto. Uma métrica fora do registro, um slug duplicado, uma
 * categoria fora do enum, um efeito fora de `{kind, pct}` ou um INSERT em `user_badges`
 * (conceder badge na instalação) entram no banco em silêncio no primeiro
 * `npm run db:catalogo-badges`. A guarda congela as 50 linhas contra o registro do domínio.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { METRIC_IDS } from "@/backend/domain";

const SQL_PATH = "prisma/cataloga-badges.sql";

const STATEMENT_RE =
  /^INSERT INTO badges \(([^)]*)\) SELECT '([^']*)', '([^']*)', '([^']*)', '([^']*)', '([^']*)', '([^']+)'::jsonb, '([^']+)', (NULL|'[^']*'::jsonb), true, \(SELECT id FROM users WHERE 'COORDENADOR' = ANY\(roles\) ORDER BY id LIMIT 1\) ON CONFLICT \(slug\) DO NOTHING$/;

interface Row {
  columns: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  category: string;
  criteria: unknown;
  slug: string;
  effect: unknown;
}

function parseRows(): Row[] {
  // As linhas de comentário saem ANTES do split por `;` — a cabeça do arquivo tem `;`
  // dentro de comentário, e split primeiro produziria prosa como statement.
  const sql = readFileSync(SQL_PATH, "utf8")
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
  const statements = sql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const rows: Row[] = [];
  for (const stmt of statements) {
    const m = STATEMENT_RE.exec(stmt);
    if (!m) throw new Error(`statement não reconhecido (50 linhas devem ter a forma da guarda):\n${stmt.slice(0, 120)}…`);
    rows.push({
      columns: m[1],
      name: m[2],
      description: m[3],
      icon: m[4],
      color: m[5],
      category: m[6],
      criteria: JSON.parse(m[7]),
      slug: m[8],
      effect: m[9] === "NULL" ? null : JSON.parse(m[9].replace(/::jsonb$/, "").replace(/^'(.*)'$/, "$1")),
    });
  }
  return rows;
}

const CATEGORIES = new Set(["achievement", "milestone", "special", "social"]);
const EFFECT_KINDS = new Set(["bonus", "penaltyReduction"]);

describe("catálogo SQL dos 50 badges (prisma/cataloga-badges.sql)", () => {
  const rows = parseRows();

  it("são exatamente 50 linhas, todas na forma da guarda", () => {
    expect(rows).toHaveLength(50);
  });

  it("todas as linhas declaram os mesmos 10 colunas (sem coluna duplicada)", () => {
    const cols = 'name, description, icon, color, category, criteria, slug, effect, "isActive", "createdBy"';
    for (const r of rows) expect(r.columns).toBe(cols);
  });

  it("slugs são únicos, minúsculos, kebab-case, não vazios", () => {
    const slugs = rows.map((r) => r.slug);
    expect(new Set(slugs).size).toBe(50);
    for (const s of slugs) {
      expect(s).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it("categoria é do enum BadgeCategory", () => {
    for (const r of rows) expect(CATEGORIES.has(r.category)).toBe(true);
  });

  it("criteria é v2 estrito: métrica do registro, op >=, value inteiro >= 1", () => {
    for (const r of rows) {
      const c = r.criteria as { version: number; clauses: Array<{ metric: string; op: string; value: number }> };
      expect(c.version).toBe(2);
      expect(c.clauses.length).toBeGreaterThanOrEqual(1);
      for (const cl of c.clauses) {
        expect(METRIC_IDS.includes(cl.metric as any)).toBe(true);
        expect(cl.op).toBe(">=");
        expect(Number.isInteger(cl.value)).toBe(true);
        expect(cl.value).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it("os 35 ids do registro de métricas são todos medidos pelo catálogo", () => {
    const used = new Set(rows.flatMap((r) => (r.criteria as any).clauses.map((c: any) => c.metric)));
    expect(METRIC_IDS.length).toBe(35);
    for (const id of METRIC_IDS) {
      expect(used.has(id)).toBe(true);
    }
    for (const m of used) expect(METRIC_IDS.includes(m as any)).toBe(true);
  });

  it("effect é nulo ou passiva do formato {kind, pct} com pct em (0, 1]", () => {
    for (const r of rows) {
      if (r.effect === null) continue;
      const e = r.effect as { kind: string; pct: number };
      expect(EFFECT_KINDS.has(e.kind)).toBe(true);
      expect(e.pct).toBeGreaterThan(0);
      expect(e.pct).toBeLessThanOrEqual(1);
    }
  });

  it("a instalação não concede badge a ninguém: nenhum INSERT em user_badges no arquivo", () => {
    const sql = readFileSync(SQL_PATH, "utf8");
    expect(sql).not.toMatch(/INSERT INTO\s+user_badges/i);
    expect(sql).not.toMatch(/INSERT INTO\s+badges[^;]*user_badges/i);
  });

  it("os 2 badges do seed têm criteria v2 (CA11, lidos do seed.dev.ts)", () => {
    const seed = readFileSync("prisma/seed.dev.ts", "utf8");
    const v2 = seed.match(/criteria: \{ version: 2, clauses: \[[^\]]*\]\s*\}/g) ?? [];
    expect(v2.length).toBe(2);
    for (const c of v2) {
      const metric = /metric: "([a-z_]+)"/.exec(c)?.[1];
      expect(METRIC_IDS.includes(metric as any)).toBe(true);
    }
  });
});
