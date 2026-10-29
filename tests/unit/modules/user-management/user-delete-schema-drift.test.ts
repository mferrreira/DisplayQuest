// @vitest-environment node
/**
 * V4-1 (DEC-55) — guarda de deriva entre o schema e a contagem de dependências.
 *
 * Por que este arquivo existe: `countBlockingDependencies` enumera, uma por uma, as FKs que
 * apontam para `users` sem `onDelete`. Isso é uma cópia de uma informação que vive no
 * `prisma/schema.prisma`, e cópias divergem. O `tsc` protege contra nome de coluna errado (o
 * cliente Prisma é tipado), mas **não protege contra tabela esquecida**: adicionar uma FK nova
 * para `users` e não contar daqui faz o `delete` voltar a estourar P2003 e a rota voltar a
 * devolver 500 com a mensagem crua do Prisma — exatamente o defeito que este lote corrigiu.
 *
 * O guarda lê os dois lados e compara conjuntos de `modelo.coluna`. Mesma família do guarda que
 * faz grep de `systemActor(` em `app/api/**` em `tests/unit/domain/identity/system-actor.test.ts`:
 * a regra é estrutural, então o teste é estrutural.
 *
 * Roda em ambiente `node` porque lê arquivo do disco.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const REPO_ROOT = path.resolve(__dirname, "../../../..");
const SCHEMA_PATH = path.join(REPO_ROOT, "prisma/schema.prisma");
const REPOSITORY_PATH = path.join(
  REPO_ROOT,
  "backend/modules/user-management/infrastructure/repositories/prisma-user.repository.ts",
);

/**
 * FKs do schema que apontam para `users`.
 *
 * Uma relação é BLOQUEANTE quando o `@relation` para `users` não declara como a exclusão da
 * pessoa resolve a linha: `onDelete: Cascade` apaga a linha e `onDelete: SetNull` desliga a
 * referência. Os dois deixam o `users.delete` funcionar. O default do Prisma é `Restrict`, então
 * ausência de `onDelete` conta como bloqueio.
 *
 * `SetNull` entrou no V5-5 (DEC-155) nas três relações do cronograma com pessoa: a atividade é
 * dado do projeto, e uma linha de cronograma não pode virar motivo de 409 na exclusão de um
 * usuário nem desaparecer junto com ele. Contar SetNull como bloqueio faria o repositório procurar
 * dependência que não bloqueia nada. No V5-10a (DEC-170) entrou a quarta: `certificates.generatedBy`
 * — quem emitiu o atestado não é dono da conta dele.
 */
function blockingRelationsInSchema(): Set<string> {
  const schema = readFileSync(SCHEMA_PATH, "utf8");
  const found = new Set<string>();

  for (const chunk of schema.split("\nmodel ")) {
    // O chunk começa com `tasks {` — o nome é só `tasks`, senão cada relação sai `tasks {.x`.
    const modelName = chunk.split("\n")[0].trim().replace(/\s*\{.*$/, "");
    if (!modelName || modelName === "users") continue;

    for (const line of chunk.split("\n")) {
      if (!line.includes("@relation") || !line.includes("fields:")) continue;
      // O tipo da relação tem de ser `users` / `users?` — não basta a palavra aparecer no nome.
      if (!/^\s*\w+\s+users\??\s+@relation/.test(line)) continue;

      const fields = line.match(/fields:\s*\[([^\]]*)\]/);
      if (!fields) continue;
      // Cascade apaga a linha; SetNull desliga a referência. Os dois resolvem sem bloquear a
      // exclusão da pessoa — só `Restrict` (o default, sem `onDelete`) bloqueia.
      const resolvesWithoutBlocking = /onDelete:\s*(Cascade|SetNull)/.test(line);
      if (resolvesWithoutBlocking) continue;

      for (const field of fields[1].split(",").map((f) => f.trim()).filter(Boolean)) {
        found.add(`${modelName}.${field}`);
      }
    }
  }
  return found;
}

/**
 * O que `countBlockingDependencies` realmente conta, lido do corpo da função.
 *
 * Reconhece `prisma.<modelo>.count(...)` e, dentro do bloco, toda coluna escrita como
 * `coluna: userId`. A forma abreviada `{ userId }` NÃO é reconhecível como coluna — por isso o
 * repositório escreve `userId: userId` por extenso, com um comentário dizendo o motivo.
 */
function countedRelationsInRepository(): Set<string> {
  const source = readFileSync(REPOSITORY_PATH, "utf8");
  const start = source.indexOf("async countBlockingDependencies");
  if (start === -1) throw new Error("countBlockingDependencies não existe no repositório");

  const body = source.slice(start, source.indexOf("\n  }", start));
  const counted = new Set<string>();

  for (const match of body.matchAll(/prisma\.(\w+)\.count\(\{([^]*?)\}\)\s*[,)]/g)) {
    const model = match[1];
    for (const field of match[2].matchAll(/(\w+):\s*userId/g)) {
      counted.add(`${model}.${field[1]}`);
    }
  }
  return counted;
}

describe("guarda de deriva — as FKs que bloqueiam excluir usuário (DEC-55)", () => {
  const inSchema = blockingRelationsInSchema();
  const counted = countedRelationsInRepository();

  it("o schema tem as 18 FKs RESTRICT para users que a medição contou", () => {
    // Fixa o tamanho da lista: se o número mudar, alguém mexeu no schema e o repositório precisa
    // acompanhar — é exatamente o aviso que este teste existe para dar.
    // 16 desde 2026-10-05; a 17ª entrou no V5-2c (`project_attachments.uploadedBy`, DEC-61/101):
    // o anexo é dado do projeto, então apagar quem o subiu continua bloqueado, como o autor de
    // relatório. A 18ª entrou no V5-7a (`project_activity_files.uploadedBy`, DEC-134/162): a
    // prova da atividade é dado do projeto, não de quem a subiu.
    expect([...inSchema].sort()).toEqual(
      [
        "badges.createdBy",
        "daily_logs.userId",
        "history.performedBy",
        "issues.assigneeId",
        "issues.reporterId",
        "lab_events.userId",
        "lab_responsibilities.userId",
        "project_activity_files.uploadedBy",
        "project_attachments.uploadedBy",
        "project_reports.authorId",
        "projects.createdBy",
        "projects.leaderId",
        "purchases.userId",
        "tasks.assignedTo",
        "tasks.createdBy",
        "user_badges.earnedBy",
        "user_schedules.userId",
        "weekly_reports.userId",
      ].sort(),
    );
  });

  it("toda FK bloqueante do schema é contada pelo repositório", () => {
    const missing = [...inSchema].filter((rel) => !counted.has(rel));
    expect(missing).toEqual([]);
  });

  it("o repositório não conta FK que o schema resolve por cascade", () => {
    const extra = [...counted].filter((rel) => !inSchema.has(rel));
    expect(extra).toEqual([]);
  });

  it("as FKs com cascade continuam fora da lista — é o que deixa cadastro novo ser excluído", () => {
    // Se alguém trocar `onDelete` de uma dessas para Restrict, este teste falha junto com a
    // contagem: o caso "excluir um cadastro sem histórico" deixaria de funcionar.
    const cascading = new Set([
      "project_members",
      "task_assignees",
      "task_user_progress",
      "work_sessions",
      "weekly_hours_history",
      "notifications",
      // V5-10a (DEC-170): o atestado é documento regenerável — apagar a pessoa apaga o
      // atestado dela, e a conta não fica bloqueada por ele.
      "certificates",
      // plan-v9 S02 (DEC-225, ADR-003): a linha do mês fechado sai com a conta, como o histórico
      // semanal de horas. Se alguém trocar o `onDelete` para o default `Restrict`, a coluna entra
      // em `inSchema` sem entrar na contagem do repositório — e o teste de cima falha nomeando-a.
      "month_history",
    ]);
    for (const model of cascading) {
      for (const rel of counted) {
        expect(rel.startsWith(`${model}.`)).toBe(false);
      }
    }
    // `user_badges.userId` é cascade, mas `user_badges.earnedBy` não é: as duas coexistem.
    expect(counted.has("user_badges.earnedBy")).toBe(true);
    expect(counted.has("user_badges.userId")).toBe(false);
  });

  it("FK `onDelete: SetNull` do cronograma não bloqueia e não é contada (DEC-155)", () => {
    // As três relações do cronograma com pessoa existem no schema e resolvem por SetNull: a
    // linha sobrevive sem responsável. Se alguém trocar uma delas para o default `Restrict`, ela
    // entra em `inSchema` sem entrar em `countBlockingDependencies` — e o teste de cima ("toda FK
    // bloqueante é contada") falha nomeando a coluna, que é o aviso certo.
    const schema = readFileSync(SCHEMA_PATH, "utf8");
    const nullifying = new Set<string>();
    for (const chunk of schema.split("\nmodel ")) {
      const modelName = chunk.split("\n")[0].trim().replace(/\s*\{.*$/, "");
      if (!modelName || modelName === "users") continue;
      for (const line of chunk.split("\n")) {
        if (!/^\s*\w+\s+users\??\s+@relation/.test(line)) continue;
        if (!/onDelete:\s*SetNull/.test(line)) continue;
        for (const field of (line.match(/fields:\s*\[([^\]]*)\]/)?.[1] ?? "")
          .split(",")
          .map((entry) => entry.trim())
          .filter(Boolean)) {
          nullifying.add(`${modelName}.${field}`);
        }
      }
    }

    expect([...nullifying].sort()).toEqual(
      [
        "certificates.generatedBy",
        "project_activities.approvedBy",
        "project_activities.requestedBy",
        "project_activities.responsibleId",
      ].sort(),
    );
    for (const rel of nullifying) {
      expect(inSchema.has(rel), rel).toBe(false);
      expect(counted.has(rel), rel).toBe(false);
    }
  });
});
