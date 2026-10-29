/**
 * D-1 (DEC-141, fecha GAP-05 do clean-arch) — o guarda da migration de cleanup dos status
 * pré-contrato de `tasks.status`.
 *
 * Por que um guarda para uma migration: a coluna é `TEXT` sem constraint por decisão, então
 * nada no banco impede que `pending`/`in_progress`/`completed` voltem a entrar — e o `tsc` não
 * vê SQL. O que existe de contrato é a validação, e o que existe de histórico é esta migration.
 * Ela é a peça que conserta qualquer banco restaurado de um backup anterior ao contrato (a 5432
 * de hoje já estava limpa: 36 tarefas, todas `done`, zero linhas reescritas em 2026-10-13).
 *
 * O guarda congela três coisas: os três mapeamentos, a ausência de constraint (DEC-141 diz
 * explicitamente "sem constraint na coluna") e que nenhum valor legado é usado como destino.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const MIGRATIONS_DIR = join(process.cwd(), "prisma", "migrations");

const LEGACY_TO_CONTRACT: Record<string, string> = {
  pending: "to-do",
  in_progress: "in-progress",
  completed: "done",
};

function cleanupMigration(): { name: string; sql: string } {
  const name = readdirSync(MIGRATIONS_DIR).find((dir) => /normalize_legacy_task_status/.test(dir));
  if (!name) {
    throw new Error(
      "a migration de cleanup dos status pré-contrato de tasks não existe — D-1 (DEC-141) não foi executada",
    );
  }
  return { name, sql: readFileSync(join(MIGRATIONS_DIR, name, "migration.sql"), "utf8") };
}

describe("migration de cleanup dos status pré-contrato de tasks (D-1, DEC-141)", () => {
  it("mapeia cada valor legado medido para o valor do contrato", () => {
    const { sql } = cleanupMigration();

    for (const [legacy, contract] of Object.entries(LEGACY_TO_CONTRACT)) {
      const statement = new RegExp(
        `UPDATE\\s+"tasks"\\s+SET\\s+"status"\\s*=\\s*'${contract}'\\s+WHERE\\s+"status"\\s*=\\s*'${legacy}'`,
      );
      expect(sql, `falta o mapeamento ${legacy} -> ${contract}`).toMatch(statement);
    }
  });

  it("não cria constraint na coluna (DEC-141: a lista fechada vive na validação)", () => {
    const { sql } = cleanupMigration();

    expect(sql).not.toMatch(/CHECK/i);
    expect(sql).not.toMatch(/ALTER TABLE/i);
    expect(sql).not.toMatch(/CREATE TYPE/i);
  });

  it("nenhum valor legado é destino de escrita", () => {
    const { sql } = cleanupMigration();

    for (const legacy of Object.keys(LEGACY_TO_CONTRACT)) {
      const asTarget = new RegExp(`SET\\s+"status"\\s*=\\s*'${legacy}'`);
      expect(sql, `${legacy} voltou a ser valor gravável`).not.toMatch(asTarget);
    }
  });

  it("não toca em nenhuma outra tabela", () => {
    const { sql } = cleanupMigration();
    const tables = [...sql.matchAll(/UPDATE\s+"([a-z_]+)"/g)].map((match) => match[1]);

    expect([...new Set(tables)]).toEqual(["tasks"]);
  });
});
