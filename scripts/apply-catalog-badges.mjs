#!/usr/bin/env node
/**
 * scripts/apply-catalog-badges.mjs — plan-v15 S09 (R5).
 *
 * Aplica `prisma/cataloga-badges.sql` (50 INSERT idempotentes por slug) no banco apontado
 * por DATABASE_URL. O script e o executor da instalacao: 5432, 5433 e deploy rodam o MESMO
 * arquivo, `npm run db:catalogo-badges`. Nao concede badge a ninguem — so a tabela `badges`
 * e tocada. Re-run: ON CONFLICT DO NOTHING, zero linhas novas.
 *
 * Statements separados por `;`; cada um roda por $executeRawUnsafe (o arquivo nao tem
 * multi-statement por instrucao). A leitura de contagem e so informativa.
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const CATALOG_PATH = join(dirname(fileURLToPath(import.meta.url)), "..", "prisma", "cataloga-badges.sql");

export function readCatalogStatements(sqlPath = CATALOG_PATH) {
  // Remove as linhas de comentário ANTES de dividir por `;`: a cabeça do arquivo tem `;`
  // dentro de comentário, e split primeiro produz um fragmento de prosa como statement.
  const sql = readFileSync(sqlPath, "utf8")
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
  return sql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export async function applyCatalog(prisma, sqlPath = CATALOG_PATH) {
  const statements = readCatalogStatements(sqlPath);
  let inserted = 0;
  for (const stmt of statements) {
    inserted += await prisma.$executeRawUnsafe(stmt);
  }
  const badges = await prisma.badges.count();
  const userBadges = await prisma.user_badges.count();
  return { statements: statements.length, inserted, badges, userBadges };
}

if (process.argv[1] && process.argv[1].endsWith("apply-catalog-badges.mjs")) {
  const prisma = new PrismaClient();
  const r = await applyCatalog(prisma);
  console.log(
    `[catalogo] ${r.statements} instrucoes aplicadas; ${r.inserted} linha(s) inseridas; ` +
      `badges na base: ${r.badges}; user_badges: ${r.userBadges} (instalacao nao concede badge)`,
  );
  await prisma.$disconnect();
}
