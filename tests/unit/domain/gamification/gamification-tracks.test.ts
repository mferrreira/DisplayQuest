// @vitest-environment node
/**
 * plan-v8 V8-1 (DEC-211/215/216/219) — guarda do vocabulário das trilhas e do schema que as sustenta.
 *
 * Por que este arquivo existe: `history.track` é `String` SEM constraint no banco (a escolha da
 * DEC-141: vocabulário fechado no domínio, migration de linha sem travar o banco). Isso é
 * deliberado e tem um custo: o banco aceita qualquer texto, e o `tsc` só protege quem importa a
 * constante. Então a fechadura é este guarda, no mesmo espírito de
 * `user-status-vocabulary.test.ts` (DEC-95) e de `system-actor.test.ts`: regra estrutural, teste
 * estrutural, lendo o schema e fazendo grep do código de produção.
 *
 * O que está congelado aqui:
 *   - o vocabulário das trilhas e o default, que é também o default da coluna;
 *   - as três colunas novas de `users` (moeda e XP vitalícios/da temporada, default 0) e a
 *     ausência de `points` em `projects` (DEC-215) — se alguém reintroduz o saldo do projeto, o
 *     gate nomeia a linha;
 *   - `badges.effects` como JSON gravável e `user_badges.equipped` com default `false` (DEC-219:
 *     conquistado ≠ equipado, e ninguém acorda equipado);
 *   - que o autor da linha de `history` usa a constante do domínio, não um literal à parte.
 *
 * Roda em ambiente `node` porque lê arquivo do disco.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { DEFAULT_GAMIFICATION_TRACK, GAMIFICATION_TRACKS } from "@/backend/domain";

const REPO_ROOT = path.resolve(__dirname, "../../../..");
const SCHEMA_PATH = path.join(REPO_ROOT, "prisma/schema.prisma");

const schema = readFileSync(SCHEMA_PATH, "utf8");

function modelBlock(name: string): string {
  const marker = `\nmodel ${name} {`;
  const start = schema.indexOf(marker);
  if (start === -1) throw new Error(`modelo ${name} não existe no schema`);
  const end = schema.indexOf("\n}", start);
  return schema.slice(start + marker.length, end);
}

describe("guarda das trilhas da gamificação (DEC-211)", () => {
  it("o vocabulário é fechado em três trilhas e o default é POINTS", () => {
    // Pontos, moeda e XP: cada uma com ciclo próprio (reset mensal, revisão semanal de XP,
    // fechamento de temporada). Troféu não entra aqui: ele não é saldo, é `user_badges`.
    expect(GAMIFICATION_TRACKS).toEqual(["POINTS", "COINS", "XP"]);
    expect(DEFAULT_GAMIFICATION_TRACK).toBe("POINTS");
  });

  it("o default da coluna `history.track` é o default do domínio (String, sem enum)", () => {
    const history = modelBlock("history");
    // A coluna, não um comentário que cite `tracks.ts` no bloco.
    const trackLine = history.split("\n").find((line) => line.trim().startsWith("track "));
    expect(trackLine).toBeDefined();
    // String com default, como DEC-141 fez com `users.status`: a régua é o domínio, o banco não
    // trava linha antiga de reexecução nem impede a migration de catalogação.
    expect(trackLine).toContain("String");
    expect(trackLine).toContain(`@default("${DEFAULT_GAMIFICATION_TRACK}")`);
    expect(trackLine).not.toMatch(/@db\.Enum|track\s+\w+Enum/);
  });

  it("moeda e XP vitalícios/da temporada entram em `users` com default 0; `points` continua (placar do mês)", () => {
    const users = modelBlock("users");
    expect(users).toMatch(/^\s*points\s+Int\s+@default\(0\)/m);
    expect(users).toMatch(/^\s*coins\s+Int\s+@default\(0\)/m);
    expect(users).toMatch(/^\s*xp\s+Int\s+@default\(0\)/m);
  });

  it("`projects` não tem mais saldo de pontos (DEC-215: a economia do projeto saiu do sistema)", () => {
    const projects = modelBlock("projects");
    expect(projects).not.toMatch(/^\s*points\s+Int/m);
  });

  it("troféu tem efeito gravável e o equipado começa desligado (DEC-219)", () => {
    expect(modelBlock("badges")).toMatch(/^\s*effects\s+Json\?/m);
    const userBadges = modelBlock("user_badges");
    expect(userBadges).toMatch(/^\s*equipped\s+Boolean\s+@default\(false\)/m);
  });

  it("as duas trilhas novas de histórico têm ciclo por pessoa com unique de idempotência", () => {
    const monthHistory = modelBlock("month_history");
    expect(monthHistory).toMatch(/month\s+String/);
    expect(monthHistory).toMatch(/@@unique\(\[userId,\s*month\]\)/);
    expect(monthHistory).toMatch(/onDelete:\s*Cascade/);

    const seasonHistory = modelBlock("season_history");
    expect(seasonHistory).toMatch(/year\s+Int/);
    expect(seasonHistory).toMatch(/@@unique\(\[userId,\s*year\]\)/);
    expect(seasonHistory).toMatch(/onDelete:\s*Cascade/);
  });

  it("quem escreve `track` usa a constante do domínio, não literal paralelo", () => {
    // A mesma lição da DEC-90/96: vocabulário em uma fonte só. Um literal `"POINTS"` no adaptador
    // é a segunda cópia da régua, e é assim que o vocabulário diverge sem o tsc ver.
    //
    // V8-5 ampliou a lista com os dois adaptadores que a onda escreveu: o ledger do ajuste manual
    // (ASK-V8-24), que declara a trilha na linha de auditoria, e a loja, que passou a cobrar a
    // trilha moeda (DEC-215/216). O primeiro continua banindo o literal; o segundo é conferido pela
    // coluna que toca, porque a loja não escreve `track` — escreve saldo.
    const trackFiles = [
      "backend/modules/gamification/infrastructure/repositories/prisma-gamification-award-history.port.ts",
      "backend/modules/user-management/infrastructure/repositories/prisma-track-adjustment.port.ts",
    ];
    for (const file of trackFiles) {
      const source = readFileSync(path.join(REPO_ROOT, file), "utf8");
      expect(source).toMatch(/(POINTS|COINS|XP)_GAMIFICATION_TRACK|DEFAULT_GAMIFICATION_TRACK/);
      expect(source).not.toMatch(/track:\s*"/);
    }
  });

  it("a loja cobra e estorna a MOEDA, nunca o placar do mês (DEC-215/216)", () => {
    // O gate é estrutural porque a troca de coluna não tem teste de tipo que a impeça: `points` e
    // `coins` são dois `Int` e o `tsc` aceitaria o errado. Medido na V8-4: enquanto a loja ainda
    // decrementava `points`, o fechamento mensal zerava também o que tinha sido gasto.
    const source = readFileSync(
      path.join(REPO_ROOT, "backend/modules/store/infrastructure/repositories/prisma-purchase.repository.ts"),
      "utf8",
    );
    expect(source).toMatch(/coins:\s*\{\s*decrement/);
    expect(source).toMatch(/coins:\s*\{\s*increment/);
    expect(source).not.toMatch(/(points|weekHours|completedTasks):\s*\{\s*(decrement|increment)/);
  });
});
