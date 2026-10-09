#!/usr/bin/env node
/**
 * scripts/assert-test-db.js — guarda dos gates que tocam banco (G4 integracao, G5 migracao).
 *
 * POR QUE ISTO EXISTE
 *   O deploy deste projeto publica o Postgres oficial em 127.0.0.1:5432 (docker-compose base
 *   + docker-compose.override.yml), e os testes de integracao do repo usam Prisma real contra
 *   localhost:5432. Um `DATABASE_URL` errado no shell transforma `npx vitest run` ou
 *   `npx prisma migrate dev` em escrita no banco de producao. Documentar a porta certa nao
 *   evita isso; recusar a porta errada sim.
 *
 * SEMANTICA
 *   - DATABASE_URL apontando para fora da allow-list de teste  -> exit 1 (BLOCKED).
 *   - DATABASE_URL ausente                                      -> aviso, exit 0.
 *     (sem URL o Prisma falha sozinho; nao ha como alcancar o deploy por acidente)
 *   - --require                                                 -> ausente tambem e falha
 *     (usado por G4/G5, onde o banco precisa estar no ar)
 *   - --self-test                                               -> roda os casos internos
 *
 * A allow-list e por host:porta, nunca por sufixo de string: `postgres:5432` (o hostname
 * interno do compose) e `127.0.0.1:5432` sao sempre recusados, com credenciais diferentes
 * nao importa.
 *
 * Saindo daqui com exit 0 a unica coisa garantida e que o URL nao e o alvo proibido. O resto
 * do gate (migrate, seed, vitest) continua sendo comando explicito do executor.
 */

"use strict";

/** Alvos onde o gate PODE escrever. Adicionar uma porta aqui e decisao de dono de infra. */
const TEST_ALLOW_LIST = [
  "127.0.0.1:5433",
  "localhost:5433",
  "host.docker.internal:5433",
];

/**
 * Alvos recusados mesmo se aparecam validos para outro script. Lista separada de proposito:
 * a mensagem de erro nomeia o que esta sendo protegido, e nao só "nao esta na allow-list".
 */
const FORBIDDEN_TARGETS = [
  "127.0.0.1:5432",
  "localhost:5432",
  "postgres:5432",
  "db:5432",
  "display-quest-db:5432",
];

const CANONICAL_TEST_URL = "postgresql://dq_dev@127.0.0.1:5433/dq_dev_test";

function parseTarget(raw) {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") return null;
    const host = url.hostname || "";
    const port = url.port || "5432";
    return { host, port, target: `${host}:${port}` };
  } catch {
    return null;
  }
}

function explain(parsed) {
  return [
    "",
    `  DATABASE_URL  : ${parsed ? parsed.target : "(ausente ou nao parseavel)"}`,
    `  allow-list    : ${TEST_ALLOW_LIST.join(", ")}`,
    `  recusado      : ${FORBIDDEN_TARGETS.join(", ")}`,
    "",
    "  O harness e declarativo: docker-compose.test.yml (npm run db:test:up).",
    `  URL canonico do gate: ${CANONICAL_TEST_URL}`,
    "",
  ].join("\n");
}

/**
 * @param {string|undefined} url valor de process.env.DATABASE_URL
 * @param {{ requireUrl?: boolean }} [options]
 * @returns {{ code: number, message: string }}
 */
function assertTestDatabase(url, options = {}) {
  const parsed = parseTarget(url);

  if (!parsed) {
    if (url === undefined || url === null || url === "") {
      if (options.requireUrl) {
        return {
          code: 1,
          message:
            "assert-test-db: DATABASE_URL ausente e o gate exige banco de teste no ar." +
            explain(null),
        };
      }
      return {
        code: 0,
        message:
          "assert-test-db: DATABASE_URL ausente — nenhum gate vai alcancar o deploy. " +
          "Os suites de integracao vao falhar por ausencia de banco (comportamento esperado).",
      };
    }
    return {
      code: 1,
      message: "assert-test-db: DATABASE_URL nao e um alvo postgres parseavel." + explain(null),
    };
  }

  if (FORBIDDEN_TARGETS.includes(parsed.target) || parsed.port === "5432") {
    return {
      code: 1,
      message:
        `assert-test-db: BLOCKED — ${parsed.target} e o Postgres do DEPLOY ` +
        "(docker-compose base + override). G4/G5 escrevem aqui. " +
        explain(parsed) +
        "  Nenhum comando deste gate roda contra 5432.",
    };
  }

  if (!TEST_ALLOW_LIST.includes(parsed.target)) {
    return {
      code: 1,
      message:
        `assert-test-db: BLOCKED — ${parsed.target} nao esta na allow-list de teste. ` +
        explain(parsed),
    };
  }

  return {
    code: 0,
    message: `assert-test-db: ok — ${parsed.target} e o banco de teste isolado (G4/G5 liberado).`,
  };
}

function selfTest() {
  const cases = [
    { url: "postgresql://dq_dev@127.0.0.1:5433/dq_dev_test", expect: 0, label: "harness trust" },
    { url: "postgresql://dq_dev:senha@127.0.0.1:5433/dq_dev_test", expect: 0, label: "harness com credencial" },
    { url: "postgresql://dq_dev@localhost:5433/dq_dev_test", expect: 0, label: "localhost:5433" },
    { url: "postgresql://u:p@127.0.0.1:5432/db", expect: 1, label: "deploy loopback" },
    { url: "postgresql://u@localhost:5432/display-quest", expect: 1, label: "deploy localhost" },
    { url: "postgresql://u:p@postgres:5432/display-quest", expect: 1, label: "hostname interno do compose" },
    { url: "postgresql://u:p@10.0.0.9:5432/db", expect: 1, label: "outra maquina em 5432" },
    { url: "postgresql://u:p@10.0.0.9:5499/db", expect: 1, label: "porta fora da allow-list" },
    { url: "sqlite://local.db", expect: 1, label: "nao postgres" },
    { url: "not a url", expect: 1, label: "nao parseavel" },
    { url: undefined, expect: 0, label: "ausente (G3 tolerant)" },
  ];

  let failures = 0;
  for (const testCase of cases) {
    const result = assertTestDatabase(testCase.url, { requireUrl: false });
    const ok = result.code === testCase.expect;
    if (!ok) failures += 1;
    console.log(
      `${ok ? "ok  " : "FAIL"} [${testCase.label}] esperado=${testCase.expect} obtido=${result.code}`,
    );
  }

  const required = assertTestDatabase(undefined, { requireUrl: true });
  const requiredOk = required.code === 1;
  if (!requiredOk) failures += 1;
  console.log(
    `${requiredOk ? "ok  " : "FAIL"} [--require com URL ausente] esperado=1 obtido=${required.code}`,
  );

  console.log(`\nassert-test-db: self-test ${failures === 0 ? "verde" : `${failures} falha(s)`}`);
  return failures === 0 ? 0 : 1;
}

function main(argv) {
  if (argv.includes("--self-test")) return selfTest();
  const result = assertTestDatabase(process.env.DATABASE_URL, {
    requireUrl: argv.includes("--require"),
  });
  if (result.code === 0) console.log(result.message);
  else console.error(result.message);
  return result.code;
}

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}

module.exports = { assertTestDatabase, parseTarget, TEST_ALLOW_LIST, FORBIDDEN_TARGETS, CANONICAL_TEST_URL };
