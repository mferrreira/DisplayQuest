// @vitest-environment node
/**
 * V4-6b + DEC-96 (2026-10-07) — o vocabulário de status de usuário é um só.
 *
 * Por que este arquivo existe: a base tinha TRÊS vocabulários convivendo, medidos no V4-4c.
 *   1. o do modelo — `pending | active | rejected | suspended` (`entities/user.ts:31`), e é isso
 *      que a rota escreve (`update-user-status.use-case.ts:15-18`);
 *   2. o das regras, filtros e contadores, que citavam `inactive` — mas **nenhum caminho escreve
 *      esse status**; as regras só chegavam nele porque testavam `status !== "active"` com um
 *      valor que a produção não produz;
 *   3. o de `components/features/volunteers-management.tsx` — `active | inactive | on_leave`,
 *      com um filtro que nunca casava (ASK-V4-33).
 *
 * O dono decidiu (2026-10-06): padronizar em `suspended`, sem mudar o enum. Inativar de verdade é
 * "Suspender". O `tsc` não pega isso: `inactive` é string, e um `status: "inactive"` num objeto
 * literal de teste compila enquanto descreve um estado impossível. Então o guarda é estrutural,
 * como o grep de `systemActor(` em `system-actor.test.ts` e o guarda de deriva de schema em
 * `user-delete-schema-drift.test.ts`.
 *
 * O dono respondeu o ASK-V4-33 em 2026-10-07 (DEC-96): **tirar o filtro** da tela de voluntários
 * e padronizá-la no vocabulário real. O backend (`VolunteerEntryOutput.status: "active"` literal,
 * `backend/domain/project/project-rules.ts:273`) nunca escreve outra coisa, então o filtro era um
 * controle morto; `KNOWN_DIVERGENCES` ficou vazio — a dívida foi quitada, não escondida.
 *
 * Roda em ambiente `node` porque lê arquivo do disco.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const REPO_ROOT = path.resolve(__dirname, "../../../..");

/** O vocabulário que o sistema escreve. Nada fora daqui é um status de usuário. */
const REAL_STATUSES = ["pending", "active", "rejected", "suspended"];

/** Onde o vocabulário tem que ser o real: o caminho que decide status de usuário. */
const STRICT_PATHS = [
  "entities/user.ts",
  "backend/domain/identity",
  "backend/modules/user-management",
  "lib/auth",
  "app/api/users",
  "components/admin/ModernAdminPanel.tsx",
];

/**
 * Dívida registrada: NENHUMA desde o DEC-96 (2026-10-07). A tela de voluntários tinha vocabulário
 * próprio (`active | inactive | on_leave`) e um filtro que não podia casar com nada —
 * `toVolunteerEntry` (backend/domain/project/project-rules.ts:295) escreve `status: "active"` para
 * todo mundo, então "Inativo" e "De licença" nunca encontravam ninguém. O dono escolheu tirar o
 * filtro (ASK-V4-33, DEC-96): o controle morto sumiu, a tela passou a falar o vocabulário real e a
 * lista daqui ficou vazia. Um `inactive` novo em qualquer lugar da base quebra o teste 3 — é isso
 * que mantém o registro honesto.
 */
const KNOWN_DIVERGENCES: string[] = [];

/** Um `inactive` usado como VALOR: aspas, `value="…"` ou campo de objeto. Prosa não conta. */
const INACTIVE_AS_VALUE = /["']inactive["']|inactive\s*:/;

function sourceFiles(relPath: string): string[] {
  const absolute = path.join(REPO_ROOT, relPath);
  if (!statSync(absolute).isDirectory()) return [absolute];
  return readdirSync(absolute).flatMap((entry) => {
    const child = path.join(absolute, entry);
    if (statSync(child).isDirectory()) return sourceFiles(path.relative(REPO_ROOT, child));
    return /\.(ts|tsx)$/.test(entry) && !entry.endsWith(".d.ts") ? [child] : [];
  });
}

function hitsFor(pattern: RegExp, relPaths: string[]) {
  return relPaths
    .flatMap((rel) =>
      sourceFiles(rel).map((file) => ({
        file: path.relative(REPO_ROOT, file),
        lines: readFileSync(file, "utf8")
          .split("\n")
          .map((line, index) => ({ line: index + 1, text: line.trim() }))
          .filter((entry) => pattern.test(entry.text)),
      })),
    )
    .filter((entry) => entry.lines.length > 0);
}

describe("o vocabulário de status de usuário (DEC-95 + DEC-96)", () => {
  it("o enum do modelo é exatamente o que o sistema escreve", () => {
    const source = readFileSync(path.join(REPO_ROOT, "entities/user.ts"), "utf8");
    const match = /userStatusSchema\s*=\s*z\.enum\(\[([^\]]*)\]\)/.exec(source);
    expect(match, "userStatusSchema não encontrado em entities/user.ts").not.toBeNull();
    const values = (match![1].match(/"([^"]+)"/g) ?? []).map((v) => v.replace(/"/g, ""));
    expect(values).toEqual(REAL_STATUSES);
  });

  it("nenhum caminho que decide status de usuário usa `inactive` como valor", () => {
    const found = hitsFor(INACTIVE_AS_VALUE, STRICT_PATHS);
    const report = found
      .map((entry) => `${entry.file}:${entry.lines.map((l) => l.line).join(",")}`)
      .join(" | ");
    expect(found, `status inventado em caminho de decisão: ${report}`).toHaveLength(0);
  });

  it("nenhum `inactive` como valor fora do caminho estrito (DEC-96, fecha ASK-V4-33)", () => {
    const found = hitsFor(INACTIVE_AS_VALUE, ["components", "features", "lib", "backend"])
      .map((entry) => entry.file)
      .sort();
    // Dívida quitada desde o DEC-96. O guarda avisa para tirar do registro em vez de deixar o
    // registro mentir: se um `inactive` de valor aparecer, ele cai aqui como divergência.
    expect(found).toEqual([...KNOWN_DIVERGENCES].sort());
  });

  it("o painel oferece os status reais e não oferece o morto (DEC-88 + DEC-95)", () => {
    const source = readFileSync(path.join(REPO_ROOT, "components/admin/ModernAdminPanel.tsx"), "utf8");
    const options = [...source.matchAll(/<SelectItem value="(\w+)">/g)].map((m) => m[1]);
    expect(options).not.toContain("inactive");
  });
});
