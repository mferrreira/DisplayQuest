# 05 · PLAN — Multi-Lab as a Service

> Contrato de **execucao** da funcionalidade `05`. Deriva da SPEC aprovada
> (`05/SPEC.md`). Define a ordem de implementacao em etapas (batches), cada uma com
> arquivos tocados, done criteria observaveis e gates de verificacao. **A SPEC e a
> fonte de verdade do comportamento; este PLAN e a fonte de verdade da execucao.**
>
> Leia antes: `plan-v2/ARCHITECTURE.md` (processo), `05/SPEC.md` (contrato),
> `docs/04-arquitetura-tecnica.md` e `docs/06-guia-de-manutencao-handover.md` (regras),
> `AGENTS.md` (convencoes e gotchas — especial: **Writability do container** e
> **infra hardening**).

## 1. Escopo

Cobre: (1) **dominio puro de provisioning** (`backend/modules/provisioning/`:
subdominio, secrets, render de fragmento/env/volume, use-cases `provision-instance`,
`mint-onboarding-token`, `consume-onboarding-token`); (2) **registry no banco da
instancia coordenadora** (`provisioning_records` + `provisioning_tokens`, D-05-06)
+ migracao versionada; (3) **endpoint fino** `/api/provisioning/...` (thin adapter,
single-use burn, idempotencia por `X-Idempotency-Key`, env-gate `INSTANCE_ROLE`);
(4) **seam de branding `INSTANCE_*`** (`lib/config/instance.ts` + consumidores
server: layout, login, notificacao de reporting, CSV); (5) **ops**: CLI
`cli/provision-instance.js` (reusa `cli/guard.js`), fragmento de compose override,
snippet Caddy e runbooks em `docs/05-operacao-deploy.md` / `docs/06-guia-de-manutencao-handover.md`.

Fora de escopo (SPEC §10): row-level multi-tenant, SSO/LDAP (feature 06), DNS/TLS
automatico, delete de instancias, painel web de gestao, migracao de dados de labs legados.

## 2. Dependencias

- Do PLAN-v2: `01` (RBAC estavel para o gate do endpoint), `02` (catalogo `audit` +
  `AuditLogWriter` no root para `INSTANCE/*`), `03` (consumer `INSTANCE_NAME` na
  notificacao de relatorio — seam aditivo), `04`. No `STATE.json`:
  `dependencies.list = ["01", "02", "03", "04"]`, `allDone = false`.
- De runtime/infra: Postgres local (`docker compose up -d postgres` para G4/G5), Prisma
  migracao versionada, next-auth v4 com guards (`lib/auth/server-auth.ts`),
  feature 02 `AuditLogWriter` (port no root).
- De schema: `provisioning_records` + `provisioning_tokens` (Etapa 3) — **sem** `Lab`
  model, **sem** `labId` em tabela existente (D-05-01).
- Bloqueador externo: wildcard DNS `*.displayquest.ifnmg.edu.br` + reverse proxy —
  nao bloqueia codigo; exigido so para o runbook (AC-05-06).

## 3. Etapas de implementacao (ordem obrigatoria)

Cada etapa e um **lote atomico** com evidencia observavel. Nunca avance sobre lote
vermelho.

### Etapa 1 — Manifestar o gap single-instance (leitura/rastreio)

**Objetivo** — Congelar, como evidencia, a realidade single-instance atual
(`docs/05-operacao-deploy.md`, `docker-compose.yml`, schema sem `Lab`/`labId`, brand
hardcoded) que motiva esta feature. Nenhum codigo de producao e alterado.

**Arquivos a criar/alterar (caminhos completos):**

```
- plan-v2/05-multi-lab-saas/SPEC.md            (secao 2 "Contexto atual": inventario com file:line)
- plan-v2/05-multi-lab-saas/STATE.json         (evidencia "gap-manifest" registrada)
```

**Mudancas de schema (se houver):** nenhuma.

**Done criteria desta etapa (todas observaveis):**
- [ ] DC1.1 — `SPEC.md` §2 cita com file:line reais: `docker-compose.yml:26` (ports
      `3000:3000`), `:29` (`NEXTAUTH_URL` hardcoded), `:30`/`:9` (guards `${VAR:?}`);
      `Dockerfile:48-49` (writability so em `/app/public/uploads` e `/app/data/uploads`);
      `prisma/schema.prisma` sem `model Lab` (grep `model Lab` = 0) e
      `laboratory_schedules` (linha 238) / `lab_events` (306) sem `labId`;
      `lib/auth/config.ts:10-38` (CredentialsProvider unico).
- [ ] DC1.2 — `SPEC.md` §2 registra os seats de branding hardcoded ("Display Quest"):
      `components/layout/app-header.tsx:127-128`, `components/layout/mobile-menu.tsx:55-56`
      e a notificacao `prisma-reporting.gateway.ts:738-742`.
- [ ] DC1.3 — Nenhum arquivo de producao alterado (`git status` mostra apenas
      `plan-v2/05-multi-lab-saas/`).

**Gates desta etapa:** `npx eslint --no-eslintrc --config .eslintrc.json plan-v2/05-multi-lab-saas/SPEC.md` · `npx tsc --noEmit` (baseline 0 errors) · `npx vitest run` (baseline 256/257; unico fail conhecido `floating-session-timer`).

### Etapa 2 — Dominio puro de provisioning (provider + use-cases)

**Objetivo** — Criar o dominio `backend/modules/provisioning/` **puro** (sem I/O de
disco, sem Prisma no use case; I/O delegado a ports): `deriveSubdomain`,
`mintInstanceSecrets`, `renderComposeOverride`, `renderDotEnv`, `renderVolumeName`;
use-cases `provision-instance`, `mint-onboarding-token`, `consume-onboarding-token`;
erros tipados. Tests unitarios cobrem RF-MULTI-01/02/03 e os RNFs de seguranca.

**Arquivos a criar/alterar (caminhos completos):**

```
- backend/modules/provisioning/application/subdomain.ts               (NOVO: deriveSubdomain + RESERVED_SUBDOMAINS; puro)
- backend/modules/provisioning/application/secrets.ts                 (NOVO: mintNaSecret (> = 32, base64), mintPostgresPassword (denylist check-env), maskSecret, full-once semantica)
- backend/modules/provisioning/application/contracts.ts               (NOVO: ProvisionInstanceCommand, ProvisionedInstance, OnboardingToken, InstanceDescriptor, errors InvalidSubdomainError/ProvisioningUnavailableError)
- backend/modules/provisioning/application/ports/provisioning-repository.port.ts  (NOVO: createRecord/findBySubdomain/findByIdempotencyKey/consumeAtomic/markFailed)
- backend/modules/provisioning/application/ports/instance-provisioner.port.ts     (NOVO: apply(InstanceDescriptor): Promise<void> — adapter do CLI/disco, fora do dominio)
- backend/modules/provisioning/application/use-cases/provision-instance.use-case.ts      (NOVO: fluxo validar->idempotencia(slug/key)->gerar artefatos em memoria->repositorio (PROVISIONED)->token; FAILED sem token; chama AuditLogWriter)
- backend/modules/provisioning/application/use-cases/mint-onboarding-token.use-case.ts   (NOVO: hash SHA-256 do raw; expiresAt 72h; persisted; retorna raw 1x)
- backend/modules/provisioning/application/use-cases/consume-onboarding-token.use-case.ts (NOVO: burn atomico; 409 se consumido; 410 se expirado)
- backend/modules/provisioning/infrastructure/compose-overrides.generator.ts  (NOVO: puro; render de fragmento override + .env + volume name deterministico de slug)
- backend/modules/provisioning/index.ts                                (NOVO: facade createProvisioningModule; composicao no root — Etapa 4)
- tests/unit/modules/provisioning/subdomain.test.ts                    (NOVO)
- tests/unit/modules/provisioning/secrets.test.ts                      (NOVO)
- tests/unit/modules/provisioning/compose-overrides.generator.test.ts (NOVO)
- tests/unit/modules/provisioning/provisioning.use-case.test.ts        (NOVO)
- tests/unit/modules/provisioning/mint-onboarding-token.test.ts        (NOVO)
```

**Mudancas de schema (se houver):** nenhuma.

**Done criteria desta etapa (todas observaveis):**
- [ ] DC2.1 — `subdomain.ts` e puro (sem process/env/prisma); `deriveSubdomain("lab-de-fisica")`
      → `"lab-de-fisica.displayquest.ifnmg.edu.br"`; invalidos (reservados, charset, hifen
      duplo, 2..63) → `InvalidSubdomainError` (AC-05-03).
- [ ] DC2.2 — `secrets.ts`: `NEXTAUTH_SECRET` mintado >= 32 chars, sem placeholder;
      `maskSecret` mascara tudo exceto 1o/ultimo char; denylist de
      `scripts/check-env-secrets.js` respeitada (AC-05-08).
- [ ] DC2.3 — `compose-overrides.generator.ts`: do slug, render deterministico do
      fragmento override (volumes `postgres_data_<slug>`, `.env.<slug>`, guard
      `${VAR:?}` preservado); nenhum valor de segredo no fragmento.
- [ ] DC2.4 — `provision-instance`: idempotente por subdomain e
      `idempotencyKeyHash`; sem I/O de disco no use case (provisioner/port fake);
      token so emitido com status PROVISIONED; falha do provisioner → FAILED sem token
      (AC-05-01/07).
- [ ] DC2.5 — `consume-onboarding-token`: single-use burn atomico (consumedAt setado),
      409 em claim repetido, 410 expirado (AC-05-02).
- [ ] DC2.6 — `npx tsc --noEmit` 0 errors; suites novas verdes em isolamento; G3 global
      256/257 + novos.

**Gates desta etapa:** `npx eslint --no-eslintrc --config .eslintrc.json <arquivos do lote>` · `npx tsc --noEmit` · `set -a; source .env; set +a; npx vitest run tests/unit/modules/provisioning`.

### Etapa 3 — Registry no banco da instancia coordenadora (schema + gateway)

**Objetivo** — Materializar a decisao D-05-06: tabelas `provisioning_records` +
`provisioning_tokens` (banco da instancia coordenadora; aditivas e inofensivas em
`member`), migracao versionada `add_provisioning_registry` e o gateway Prisma do
dominio (`provisioning-repository.gateway.ts`) com `consumeAtomic`.

**Arquivos a criar/alterar (caminhos completos):**

```
- prisma/schema.prisma                                   (models provisioning_records/provisioning_tokens da SPEC §6 + relacao em users; sem Lab, sem labId)
- prisma/migrations/<timestamp>_add_provisioning_registry/migration.sql  (gerado + constraints/indices do SPEC §6)
- backend/modules/provisioning/infrastructure/provisioning-repository.gateway.ts  (NOVO: createRecord/findBySubdomain/findByIdempotencyKey/consumeAtomic/markFailed via Prisma)
- tests/integration/provisioning-registry-roundtrip.test.ts              (NOVO: environment node, DB real em localhost:5432)
```

**Mudancas de schema:** `provisioning_records` (instanceId/subdomain/slug/idempotencyKeyHash
uniques; status String; createdBy FK users onDelete SetNull) e `provisioning_tokens`
(recordId 1-1, tokenHash unique, expiresAt, consumedAt). Invariantes no banco
(SPEC §6). **Sem `db push`.**

**Done criteria desta etapa (todas observaveis):**
- [ ] DC3.1 — `npx prisma migrate dev --name add_provisioning_registry` gera migracao
      versionada; `migrate status` sem drift; zero `db push` (G5).
- [ ] DC3.2 — `consumeAtomic` marca token.consumedAt + record.consumedAt/provisionedAt na
      mesma transacao; claim repetido nao persiste nada (constraint + transaction)
      (AC-05-02).
- [ ] DC3.3 — broadcast: `provisioning.use-case.ts` continua verde sem mudar a assinatura
      (gateway satisfaz o port da Etapa 2).
- [ ] DC3.4 — roundtrip integration: mint + claim + double-claim (409) +
      retry idempotency + list no registry contra DB real (AC-05-05/07).
- [ ] DC3.5 — grep zero de `model Lab` e de `labId` novo em tabela de dominio.

**Gates desta etapa:** `npx eslint --no-eslintrc --config .eslintrc.json <arquivos do lote>` · `npx tsc --noEmit` · `set -a; source .env; set +a; npx vitest run` · `docker compose up -d postgres && npx prisma migrate dev` (G4/G5).

### Etapa 4 — Endpoint fino + env-gate `INSTANCE_ROLE` + auditoria (AC-05-05/07/08/11)

**Objetivo** — Expor `/api/provisioning/*` como thin adapter (sem regra de negocio),
gate por `INSTANCE_ROLE=coordinator`, wire do modulo no composition root
(`backend/composition/root.ts`) e eventos `INSTANCE/*` via `AuditLogWriter`
(feature 02). Testes de rota cobrem 400/401/403/404/409/410/201/200 e o payload
mascarado.

**Arquivos a criar/alterar (caminhos completos):**

```
- lib/config/instance.ts             (NOVO na Etapa 5; esta etapa le INSTANCE_ROLE via getInstanceConfig já existente ou leva env direto no root — ver DC4.1)
- backend/composition/root.ts        (instancia o modulo provisioning — createProvisioningModule — e injeta AuditLogWriter existente + repository gateway)
- app/api/provisioning/instances/route.ts              (NOVO: POST mint+provision; GET list; gateway env-gate; idempotency X-Idempotency-Key; 201/200/400/403/409)
- app/api/provisioning/instances/[subdomain]/route.ts  (NOVO: GET status; 404 inexistente)
- app/api/provisioning/onboarding/verify/route.ts      (NOVO: GET verifica sem queimar)
- app/api/provisioning/onboarding/claim/route.ts       (NOVO: POST burn; handover full 1x; 409/410)
- backend/modules/audit/action-catalog.ts              (ADICIONA INSTANCE/PROVISIONED, INSTANCE/TOKEN_ISSUED, INSTANCE/TOKEN_CONSUMED — aditivo, feature 02)
- tests/unit/modules/provisioning/provisioning.api.test.ts  (NOVO: matriz HTTP)
```

**Mudancas de schema (se houver):** nenhuma.

**Done criteria desta etapa (todas observaveis):**
- [ ] DC4.1 — endpoint gate: `INSTANCE_ROLE != coordinator` → **403**
      `ProvisioningUnavailableError`; sem sessao → 401; nao-COORDENADOR/sem
      `MANAGE_USERS` → 403 (AC-05-11). O `lib/config/instance.ts` da Etapa 5 SERVE o
      `isCoordinator`; nesta etapa minimo: leitura de `INSTANCE_ROLE` via seam provisorio
      em `backend/composition/root.ts` — mover para `instance.ts` na Etapa 5.
- [ ] DC4.2 — POST instances: 201 com `secretsMasked` (sem full); 200 replay de
      `X-Idempotency-Key`; 409 subdominio PROVISIONED; 400 slug invalido (AC-05-01/07).
- [ ] DC4.3 — claim: 200 com handover full 1x; 409 usado; 410 expirado; verify: 200
      `{ valid, consumed, expiresAt }` sem queimar (AC-05-02).
- [ ] DC4.4 — eventos `INSTANCE/PROVISIONED`, `INSTANCE/TOKEN_ISSUED`,
      `INSTANCE/TOKEN_CONSUMED` gravados via `AuditLogWriter` (catalogo feature 02);
      verificado no roundtrip (AC-05-05).
- [ ] DC4.5 — `.env` e secrets nunca logados: assert nos tests de rota que o body/console
      nao contem o full secret apos o mint (AC-05-08).
- [ ] DC4.6 — `npx tsc --noEmit` 0 errors; suites novas verdes; G3 256/257 + novos.

**Gates desta etapa:** `npx eslint --no-eslintrc --config .eslintrc.json <arquivos do lote>` · `npx tsc --noEmit` · `set -a; source .env; set +a; npx vitest run` · `docker compose up -d postgres && npx vitest run` (G4 roundtrip).

### Etapa 5 — Seam de branding `INSTANCE_*` (lab-agnostic; AC-05-04/09)

**Objetivo** — Entregar `lib/config/instance.ts` como **unico leitor** de
`process.env.INSTANCE_*`, com defaults identicos ao comportamento atual (zero
regressao), e amarrar os consumidores server (layout dashboard, login, notificacao de
reporting, cabecalho CSV). Clients recebem por props. Grep-zero de `INSTANCE_` fora do
seam e consumidores.

**Arquivos a criar/alterar (caminhos completos):**

```
- lib/config/instance.ts                                              (NOVO: getInstanceConfig(); id/name/subdomain/role/isCoordinator; defaults "local"/"Display Quest"/"localhost"/"member")
- app/(dashboard)/layout.tsx                                          (via getInstanceConfig().name -> prop instanceName para app-header/mobile-menu)
- app/(auth)/login/page.tsx                                           (brand do login via getInstanceConfig().name)
- components/layout/app-header.tsx                                    (linhas 127-128: usa prop instanceName; sem leitura de process.env)
- components/layout/mobile-menu.tsx                                   (linhas 55-56: idem)
- backend/modules/reporting/infrastructure/prisma-reporting.gateway.ts (linhas 738-742: titulo/mensagem com prefixo opcional de INSTANCE_NAME; default inalterado)
- app/api/project-reports/[id]/export.csv/route.ts                    (cabecalho CSV opcional com INSTANCE_NAME; default inalterado)
- tests/unit/lib/config/instance.test.ts                              (NOVO: defaults == hoje; env injetado; role gate)
```

**Mudancas de schema (se houver):** nenhuma.

**Done criteria desta etapa (todas observaveis):**
- [ ] DC5.1 — sem env, `getInstanceConfig()` devolve exatamente os valores atuais
      (brand "Display Quest", subdomain "localhost", role "member"); logo/texto das
      linhas 127-128 e 55-56 identicos (AC-05-04, sem regressao).
- [ ] DC5.2 — com env injetado (INSTANCE_NAME "Lab de Eletronica - IFNMG"), o render
      server do brand mostra o lab name — teste SEM router (D-05-04).
- [ ] DC5.3 — notificacao `PROJECT_REPORT_SUBMITTED` com INSTANCE_NAME ausente = string
      atual; com env = prefixo `[Lab ...]`; suites de reporting existentes verdes
      (AC-05-04/10).
- [ ] DC5.4 — grep `INSTANCE_` fora de `lib/config/instance.ts` e consumidores = 0
      (AC-05-09); `lib/config/instance.ts` e a unica origem de `process.env.INSTANCE_*`.
- [ ] DC5.5 — `npx tsc --noEmit` 0 errors; suites `instance.*` verdes; G3 256/257 + novos.

**Gates desta etapa:** `npx eslint --no-eslintrc --config .eslintrc.json <arquivos do lote>` · `npx tsc --noEmit` · `set -a; source .env; set +a; npx vitest run`.

### Etapa 6 — Ops: CLI de provisioning + runbooks + exemplo de roteamento (AC-05-06)

**Objetivo** — Entregar o runner infra: `cli/provision-instance.js` (reuso de
`cli/guard.js` e `--allow-prod`, padrao A10) que materializa artefatos em disco
(`.deploy/labs/<slug>/`), escreve o runbook de roteamento (`*.displayquest.ifnmg.edu.br`
→ container via Caddy), o exemplo de fragmento override e o handover; atualiza
`docs/05` e `docs/06`.

**Arquivos a criar/alterar (caminhos completos):**

```
- cli/provision-instance.js          (NOVO: CLI wrapper do provider; flags --slug --lab-name --deploy-dir; reusa cli/guard.js; nunca imprime secret full alem da claim)
- cli/README.md                      (atualizar: comando novo + flags)
- docs/ops/caddy-routing.example     (NOVO: snippet Caddy/Caddyfile wildcard *.displayquest.ifnmg.edu.br -> porta do container lab)
- docs/ops/compose-fragment.example  (NOVO: exemplo do fragmento de override gerado p/ um lab (sem secrets reais))
- docs/05-operacao-deploy.md         (nova secao: provisioning self-serve, fluxo claim, layout .deploy/labs/<slug>/, rollback de instancia)
- docs/06-guia-de-manutencao-handover.md (nova secao: handover do lab novo — subdominio, env, secrets 1a exibicao, DNS/TLS)
```

**Mudancas de schema (se houver):** nenhuma.

**Done criteria desta etapa (todas observaveis):**
- [ ] DC6.1 — `cli/provision-instance.js --slug lab-ele --lab-name ... --deploy-dir <tmp>`
      gera `<tmp>/compose.override.yml`, `<tmp>/.env.lab-ele` (chaves mintadas) e
      `<tmp>/caddy-snippet.conf`; sem secret full em stdout (so masked) (AC-05-06/08).
- [ ] DC6.2 — CLI com `NODE_ENV=production` e sem `--allow-prod` → exit 1 antes de
      escrever (padrao A10 `cli/guard.js`).
- [ ] DC6.3 — runbook de roteamento: exemplo Caddy documenta wildcard
      `*.displayquest.ifnmg.edu.br` → container; docs/05 e docs/06 ganham as secoes;
      playbook de onboarding reproduzivel de ponta a ponta (AC-05-06).
- [ ] DC6.4 — nenhum caminho de escrita novo no container (CLI roda no host; docs
      explicitam que endpoint so materializa em `/app/data/uploads/.deploy/` se
      configurado) (gotcha AGENTS.md).
- [ ] DC6.5 — `npx eslint --no-eslintrc --config .eslintrc.json cli/provision-instance.js` (exit 0) · `npx tsc --noEmit` 0 errors.

**Gates desta etapa:** `npx eslint --no-eslintrc --config .eslintrc.json cli/provision-instance.js` · `npx tsc --noEmit` · `set -a; source .env; set +a; npx vitest run` (sem regressao das suites existentes; CLI testado com temp dir em test unit da Etapa 2).

### Etapa 7 — Integracao + gates finais (fecha AC-05-05/07/10)

**Objetivo** — Rodar a verificacao completa em cadeia: roundtrip do registry, single-use,
idempotencia, eventos de auditoria, e confirmar regressao zero das features 01-04;
registrar tudo no `STATE.json`.

**Arquivos a criar/alterar (caminhos completos):**

```
- tests/integration/provisioning-registry-roundtrip.test.ts  (fechar AC-05-02/05/07: mint, claim, double-claim 409, retry idempotent, eventos audit)
- plan-v2/05-multi-lab-saas/STATE.json                        (evidencias, gates, ACs, blockers, decisions, timeline)
```

**Mudancas de schema (se houver):** nenhuma nesta etapa (migracao ja versionada na 3).

**Done criteria desta etapa (todas observaveis):**
- [ ] DC7.1 — G1 verde para todos os arquivos alterados; G2 0 errors.
- [ ] DC7.2 — G3: baseline **256/257** (unico fail `floating-session-timer`) + ~8 unit
      novos verdes; G4: 1+ integration verde (roundtrip com `localhost:5432`).
- [ ] DC7.3 — G5: `prisma migrate status` sem drift; **sem** `db push`.
- [ ] DC7.4 — suites de 01-04 sem regressao (AC-05-10): RBAC, audit, reporting,
      gamification verdes.
- [ ] DC7.5 — `STATE.json` finalizado: ACs com `status`/`testRef`, `gates`,
      `evidence[]`, timeline, blockers (DNS wildcard/reverse proxy), decisions.

**Gates desta etapa:** checklist da secao 4 abaixo.

## 4. Verificacao (final)

Assim que todas as etapas estiverem verdes, executar na ordem (com `set -a; source .env; set +a`):

```
npx eslint --no-eslintrc --config .eslintrc.json <todos arquivos alterados>  # G1
npx tsc --noEmit                                                              # G2
npx vitest run                                                                # G3 (256/257; unico fail conhecido floating-session-timer)
docker compose up -d postgres && npx vitest run                                # G4 (integration: registry roundtrip)
npx prisma migrate dev || npx prisma migrate deploy                            # G5 (sem db push; sem drift)
grep -rn "INSTANCE_" --include="*.ts" --include="*.tsx" lib backend app components | grep -v "lib/config/instance.ts"   # anti-scatter (AC-05-09)
```

## 5. Rollback

- **Se** qualquer gate falhar (ou se `SPEC` divergir), `git checkout -- <caminhos>` e
  `git reset --hard <checkpoint-verde>`; nao siga adiante.
- **Depois** volte a SPEC, repense, re-implemente, re-verifique.
- **Registro**: rollback vai para `STATE.json` (secao `rollbacks`) — motivo + acao tomada.
- Rollback de migracao: reverter `schema.prisma` + `npx prisma migrate dev` com downgrade
  local; **nunca** editar uma migracao ja aplicada (nova migracao corrige); em prod,
  `migrate resolve --rolled-back` so quando previsto no deploy.
- Artefatos `.deploy/labs/<slug>/` sao regeneraveis (nunca commitados; fora do repo).

## 6. Entregaveis de conclusao

Checklist que, tudo verde, marca `05` como `done`:

- [ ] Todos os gates (G1–G5; G4/G5 aplicaveis — toca schema/DB) verdes
- [ ] Todas as AC-05-01..AC-05-11 da SPEC com teste/evidencia mapeada
- [ ] Migracao versionada `add_provisioning_registry` sem `db push`
- [ ] Anti-scatter: grep `INSTANCE_` fora de `lib/config/instance.ts` + consumidores = 0
- [ ] Nenhum `model Lab`/`labId` novo em tabela de dominio (D-05-01)
- [ ] Runbooks (docs/05, docs/06, docs/ops/) entregues com exemplo Caddy e fragmento
- [ ] `STATE.json` atualizado (eventos, evidencias, rollbacks, decisions, blockers)