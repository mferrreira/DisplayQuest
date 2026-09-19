# 06 · PLAN — auth-sso-ldap

> Contrato de **execucao** da funcionalidade `06`. Deriva da SPEC aprovada
> (`06/SPEC.md`). Define a ordem de implementacao em etapas (batches), cada uma com
> arquivos tocados, done criteria observaveis e gates de verificacao. **A SPEC e a
> fonte de verdade do comportamento; este PLAN e a fonte de verdade da execucao.**
>
> Leia antes: `plan-v2/ARCHITECTURE.md` (processo), `06/SPEC.md` (contrato),
> `docs/04-arquitetura-tecnica.md` e `docs/06-guia-de-manutencao-handover.md` (regras),
> `AGENTS.md` (convencoes e gotchas).

## 1. Escopo

Cobre: (RF-SSO-01) fluxo de login federado DisplayLab/LDAP via assertion consumida pelo
app; (RF-SSO-02) provisionamento/upsert por `users.externalId` unico; (RF-SSO-03)
fallback legacy de `CredentialsProvider` gated por `AUTH_FALLBACK_CREDENTIALS`;
(RF-SSO-04) mapeamento coarse→fine de papeis; (RF-SSO-05) tenure de sessao e logout;
(RF-SSO-06) runbook de operacao. Arquiteturalmente decide (D-06-07) novo modulo
`backend/modules/identity-federation/` com ports `authenticate-with-federation`,
`resolve-actor-identity` e `provision-user-from-external`, mantendo `lib/auth/*` e
`backend/modules/identity-access` intactos como camada RBAC (D-06-02).

Fora de escopo (SPEC §10, repetir o essencial): vendor internals do DisplayLab; SSO em
outros servicos; MFA/SAML; migracao/backfill de usuarios locais para LDAP; mudar
`PERMISSIONS`/`FEATURE_ACCESS`; papel ADMIN; session-store proprio de single-session.

## 2. Dependencias

- Do PLAN-v2: 05 (contrato de identidade/onboarding — **a definir**; pasta 05 vazia;
  drafting refere o contrato, nao codigo). Transitivemente 01-04; 02 (audit) para
  registrar a provisao (`USER/PROVISION_EXTERNAL`, mudanca coordenada no catalogo).
- De runtime/infra: DisplayLab (URL/discovery/JWKS/claims/logout) e/ou LDAP (endpoint,
  bind, base DNs) — fornecidos pelo dono (placeholders no runbook); Postgres local
  para G4/G5; envs novas documentadas no `.env.example`.
- De schema: `users.externalId String? @unique` (1 migracao versionada; sem `db push`).

## 3. Etapas de implementacao (ordem obrigatoria)

Cada etapa e um **lote atomico** com evidencia observavel. Nunca avance sobre lote
vermelho. Etapas em ordem de seguranca incremental: o sistema permanece funcional e
comporta identico a baseline entre as etapas (default `AUTH_FALLBACK_CREDENTIALS=1`,
`FEDERATION_ENABLED=0`).

### Etapa 1 — Congelar baseline e gaps de auth (rastreio/evidencia)

**Objetivo** — Registrar como evidencia o estado atual (ja consolidado na SPEC §2) e
o drift que motiva a feature: autenticacao embutida 100% no next-auth
(`lib/auth/config.ts:10-38` CredentialsProvider-only), users sem `externalId`, e o RBAC
ja isolado em `identity-access`. Nenhum codigo de producao e alterado.

**Arquivos a criar/alterar (caminhos completos):**

```
- plan-v2/06-auth-sso-ldap/SPEC.md     (secao 2 "Contexto atual": inventor de baseline com file:line ja validado)
- plan-v2/06-auth-sso-ldap/STATE.json  (evidencia "baseline-freeze" registrada)
```

**Mudancas de schema (se houver):** nenhuma.

**Done criteria desta etapa (todas observaveis):**
- [ ] DC1.1 — `SPEC.md` §2 cita com file:line reais: `config.ts:10-38` (provider unico),
      `config.ts:21,25` (findUnique/bcrypt), `config.ts:39-87` (JWT 48h+sliding),
      `config.ts:88-137` (session callback re-le users), `server-auth.ts:24-41,54-63`,
      `rbac.ts:5-24` (sem ADMIN), `schema.prisma:13,16,17,21` (email unique,
      password String?, status pending, roles), `docker-compose.yml:30`
      (`NEXTAUTH_SECRET=${...:?}`).
- [ ] DC1.2 — Nenhum arquivo de producao alterado (`git status` mostra apenas
      `plan-v2/06-auth-sso-ldap/`).

**Gates desta etapa:** `npx eslint --no-eslintrc --config .eslintrc.json plan-v2/06-auth-sso-ldap/SPEC.md` · `npx tsc --noEmit` (0 errors) · `npx vitest run` (256/257; unico fail conhecido `floating-session-timer`).

### Etapa 2 — Seams do modulo identity-federation (contracts/ports)

**Objetivo** — Criar o modulo que separa **auth** (verificar identidade) do RBAC
(D-06-02): `backend/modules/identity-federation/` com contratos tipados e tres ports
(SPEC RF-SSO-01/02). Nenhum provider/wiring ainda; pura estrutura de dominio seguindo o
padrao de `identity-access`.

**Arquivos a criar/alterar (caminhos completos):**

```
- backend/modules/identity-federation/index.ts                          (NOVO: IdentityFederationModule + createIdentityFederationModule)
- backend/modules/identity-federation/application/contracts.ts          (NOVO: FederationAssertion, FederationClaims, ResolvedIdentity, FederationError)
- backend/modules/identity-federation/application/ports/authenticate-with-federation.gateway.ts   (NOVO)
- backend/modules/identity-federation/application/ports/resolve-actor-identity.gateway.ts         (NOVO)
- backend/modules/identity-federation/application/ports/provision-user-from-external.gateway.ts   (NOVO)
- tests/unit/modules/identity-federation/contracts-sanity.test.ts       (NOVO: os contratos tipam e os erros sao estaveis)
```

**Contrato a implementar (decisao D-06-08 no STATE):**

```
AuthenticateWithFederationPort.authenticate(assertion): Promise<FederationClaims>
  -> valida issuer/JWKS (ou bind LDAP); lanca FederationAssertionError(401) se invalido/expirado
ResolveActorIdentityPort.resolve(claims): ResolvedIdentity
  -> mapa claims (sub/externalId, email, name, grupos coarse) -> identidade do app
  -> inclui mapeamento coarse->fine (funcao pura; RF-SSO-04)
ProvisionUserFromExternalPort.provision(identity): CreatedOrUpdatedUser
  -> upsert/merge por externalId (invariante 1 usuario/external id; RF-SSO-02)
```

**Mudancas de schema (se houver):** nenhuma (provisao real na Etapa 4).

**Done criteria desta etapa (todas observaveis):**
- [ ] DC2.1 — `contracts.ts` define `FederationAssertion`, `FederationClaims`
      (`sub`, `email`, `name`, `groups`/coarse roles, `exp`), `ResolvedIdentity` e
      `FederationAssertionError` com `status`. Sem import de prisma/next-auth.
- [ ] DC2.2 — Os 3 ports existem com assinaturas por `Promise`; `index.ts` monta um
      module vazio (gateway default que lanca "not implemented") sem quebrar o build.
- [ ] DC2.3 — Teste de sanidade verde em isolamento:
      `npx vitest run tests/unit/modules/identity-federation/contracts-sanity.test.ts`.

**Gates desta etapa:** `npx eslint --no-eslintrc --config .eslintrc.json backend/modules/identity-federation tests/unit/modules/identity-federation/contracts-sanity.test.ts` · `npx tsc --noEmit` · `npx vitest run tests/unit/modules/identity-federation/contracts-sanity.test.ts`.

### Etapa 3 — Fallback gated: CredentialsProvider por AUTH_FALLBACK_CREDENTIALS

**Objetivo** — Tornar o `CredentialsProvider` um provider legacy/fallback controlado
por env (RF-SSO-03, D-06-02), com default `1` (comportamento atual preservado).
`lib/auth/config.ts` passa a montar providers via builder; `check:env` valida `0|1`.

**Arquivos a criar/alterar (caminhos completos):**

```
- lib/auth/provider-builder.ts         (NOVO: buildAuthProviders(config): AuthProvider[]; CredentialsProvider so com fallback=1)
- lib/auth/config.ts                   (ALTERADO: providers = buildAuthProviders(...); sem mudanca de authorize/callbacks)
- .env.example                         (ALTERADO: documenta AUTH_FALLBACK_CREDENTIALS=0|1 default 1; FEDERATION_ENABLED=0|1 default 0)
- docker-compose.yml                   (ALTERADO: adiciona AUTH_FALLBACK_CREDENTIALS=${AUTH_FALLBACK_CREDENTIALS:-1} e FEDERATION_ENABLED=${FEDERATION_ENABLED:-0})
- check:env (script/arquivo do gate, onde estiver) (ALTERADO: valida AUTH_FALLBACK_CREDENTIALS in {0,1}; FEDERATION_ENABLED in {0,1})
- tests/unit/modules/identity-federation/fallback-gate.test.ts   (NOVO: matriz env x providers x usuario credencial)
```

**Mudancas de schema (se houver):** nenhuma.

**Done criteria desta etapa (todas observaveis):**
- [ ] DC3.1 — com `AUTH_FALLBACK_CREDENTIALS=1` (default) o comportamento de login e
      identico ao baseline: credenciais validas geram sessao e invalidas geram erro
      estavel (256/257 nao regride).
- [ ] DC3.2 — com `AUTH_FALLBACK_CREDENTIALS=0` o provider de credenciais nao existe no
      array (`provider-builder.test.ts`); nenhum teste de login por credencial verde
      nessa config (expressao: testes de fallback usam `vi.mock` de env).
- [ ] DC3.3 — `check:env` falha quando `AUTH_FALLBACK_CREDENTIALS` != `0|1`; `.env.example`
      e compose atualizados e `docker compose up` segue funcional com default.
- [ ] DC3.4 — Usuario com `externalId` set nunca e elegivel por credencial (gate no
      `authorize`: se `user.externalId` presente → nega), mesmo com fallback=1.

**Gates desta etapa:** `npx eslint --no-eslintrc --config .eslintrc.json lib/auth/provider-builder.ts lib/auth/config.ts .env.example docker-compose.yml tests/unit/modules/identity-federation/fallback-gate.test.ts` · `npx tsc --noEmit` · `npx vitest run`.

### Etapa 4 — Schema users.externalId + upsert/merge de provisao

**Objetivo** — Migrar `users.externalId String? @unique` (SPEC §6, RF-SSO-02,
D-06-04) e implementar o port `provision-user-from-external` com upsert atomico,
invariante "um usuario por external id", backfill nenhum.

**Arquivos a criar/alterar (caminhos completos):**

```
- prisma/schema.prisma                              (ALTERADO: users ganha externalId String? @unique)
- prisma/migrations/<data>_add_users_external_id_unique/migration.sql   (NOVO: ALTER TABLE users ADD COLUMN "externalId" TEXT; CREATE UNIQUE INDEX)
- backend/modules/identity-federation/infrastructure/prisma-identity-provision.gateway.ts  (NOVO: implementa ProvisionUserFromExternalPort)
- backend/modules/identity-federation/index.ts      (ALTERADO: injeta o gateway de provisao)
- tests/unit/modules/identity-federation/external-id-upsert.test.ts    (NOVO: AC-03/04/05)
- tests/integration/identity-federation-external-id-roundtrip.test.ts  (NOVO: DB real localhost:5432; AC-04/05/11)
```

**Mudancas de schema:** `users.externalId String? @unique`; `password`/`roles`/`status`
intactos; **backfill nenhum**; migracao via `npx prisma migrate dev`, nunca `db push`.

**Merge/USPERT invariante (documentar no codigo e no teste):**
```
upsert:
  where externalId = X
  create: { externalId, name, email, roles: mappedRoles, status: "active" }
  update: { name, email, roles: mappedRoles }   // nunca points/badges/weekHours/locais
```

**Done criteria desta etapa (todas observaveis):**
- [ ] DC4.1 — `externalId String? @unique` presente no schema; migracao versionada e
      aplicada (`npx prisma migrate dev` exit 0); G5 sem `db push`.
- [ ] DC4.2 — provisao create: linha nova com externalId X, name/email claims, roles
      mapeadas, `status="active"`; provisao update: mesmo registro, campos locais
      intocados (AC-03/04).
- [ ] DC4.3 — invariant: upsert por X nunca duplica; email continua unico; sem backfill
      de dados existentes (externalId null = fallback).
- [ ] DC4.4 — integration verde com Postgres no ar (`docker compose up -d postgres`):
      roundtrip create → update → releitura; tentativa de duplicar → unique falha.
- [ ] DC4.5 — `map-federation-roles` ainda nao usada aqui? **nao**: o mapping e da
      Etapa 5; nesta etapa roles entram como parametro do comando (funcao stub vazia).

**Gates desta etapa:** `npx eslint --no-eslintrc --config .eslintrc.json prisma/schema.prisma backend/modules/identity-federation tests/unit/modules/identity-federation/external-id-upsert.test.ts tests/integration/identity-federation-external-id-roundtrip.test.ts` · `npx tsc --noEmit` · `npx vitest run` · `npx prisma migrate dev` (G5) · `docker compose up -d postgres && npx vitest run tests/integration/identity-federation-external-id-roundtrip.test.ts` (G4).

### Etapa 5 — Login federado: provider + callback + resolucao de identidade

**Objetivo** — Implementar RF-SSO-01: assertion DisplayLab/LDAP consumida no callback,
validacao, resolucao de identidade (claims→ResolvedIdentity) e estabelecimento da
sessao next-auth JWT. Provider federado registrado em `buildAuthProviders` quando
`FEDERATION_ENABLED=1`. Rota callback **explicita** (sem shadow route).

**Arquivos a criar/alterar (caminhos completos):**

```
- backend/modules/identity-federation/infrastructure/displaylab-federation.gateway.ts  (NOVO: implementa AuthenticateWithFederationPort contra o CONTRATO DisplayLab: discovery/JWKS, validacao, claims; endpoint/credenciais via env)
- backend/modules/identity-federation/infrastructure/ldap-federation.gateway.ts        (NOVO: implementa o mesmo port via bind LDAP (FEDERATION_MODE=ldap); grupos coarse da base DN)
- backend/modules/identity-federation/application/provide-actor-identity.ts            (NOVO: orquestra authenticate -> resolve -> provision)
- app/api/auth/federation/start/route.ts                                               (NOVO: POST — inicio do fluxo)
- app/api/auth/federation/callback/route.ts                                            (NOVO: GET — assertion; sem shadow routes)
- lib/auth/provider-builder.ts                                                         (ALTERADO: registra provider "federation" quando FEDERATION_ENABLED=1 e FEDERATION_MODE valido)
- app/(auth)/login/page.tsx                                                            (ALTERADO: gate minimo — entrada federada quando FEDERATION_ENABLED=1; banner estavel quando nem federacao nem fallback)
- tests/unit/modules/identity-federation/federation-login.test.ts                      (NOVO: AC-01/02)
- tests/unit/modules/identity-federation/federation-callback.route.test.ts             (NOVO: rotas; AC-01/02; mock de getBackendComposition)
```

**Mudancas de schema (se houver):** nenhuma.

**Makeup de env (Etapa 5):** `FEDERATION_ENABLED`, `FEDERATION_MODE=displaylab|ldap`,
`FEDERATION_DISPLAYLAB_ISSUER_URL`, `FEDERATION_DISPLAYLAB_JWKS_URL`,
`FEDERATION_DISPLAYLAB_CLIENT_ID`, `LDAP_URL`, `LDAP_BIND_DN`, `LDAP_BIND_PASSWORD`,
`LDAP_USER_BASE_DN`, `LDAP_GROUP_BASE_DN`. `check:env` valida combinacao
(`FEDERATION_ENABLED=1` exige modo valido e vars minimas; sem credencial impressa).

**Done criteria desta etapa (todas observaveis):**
- [ ] DC5.1 — assertion valida de DisplayLab resolve → sessao next-auth JWT com
      `users.id`; assertion invalida/expirada → 401 e nada provisionado (AC-01/02).
- [ ] DC5.2 — callback e rota explicita fora do catch-all (o handler `[...nextauth]`
      permanece intacto); nenhum log de payload/segredo na rota (grep de
      `console.*authorization|secret|password` limpo).
- [ ] DC5.3 — `FEDERATION_ENABLED=0` (default) nao altera o login atual nenhum provider
      federado montado; login page nao mostra entrada federada.
- [ ] DC5.4 — LDAP adapter implementa o mesmo port (bind + grupos da base DN), testado
      com mocks (sem LDAP real).

**Gates desta etapa:** `npx eslint --no-eslintrc --config .eslintrc.json backend/modules/identity-federation app/api/auth/federation lib/auth/provider-builder.ts app/(auth)/login tests/unit/modules/identity-federation` · `npx tsc --noEmit` · `npx vitest run`.

### Etapa 6 — Mapeamento coarse→fine + wiring na provisao

**Objetivo** — Implementar RF-SSO-04: funcao pura `map-federation-roles` com a tabela
do SPEC §4, usada no `resolve-actor-identity`; RBAC do app inalterado e autoritativo.

**Arquivos a criar/alterar (caminhos completos):**

```
- backend/modules/identity-federation/application/map-federation-roles.ts                (NOVO: funcao pura LF_* -> Role[]; tabela da SPEC)
- backend/modules/identity-federation/application/ports/resolve-actor-identity.gateway.ts  (ALTERADO: usa map-federation-roles)
- tests/unit/modules/identity-federation/rbac-mapping.test.ts                            (NOVO: AC-08/09; matriz completa + desconhecido ignorado + RBAC intacto)
```

**Tabela (fonte unica, espelha SPEC §4 / runbook):**
`LF_COORDENADOR→COORDENADOR`, `LF_GERENTE→GERENTE`, `LF_LABORATORISTA→LABORATORISTA`,
`LF_PESQUISADOR→PESQUISADOR`, `LF_GRUPO_PROJETO→GERENTE_PROJETO`,
`LF_COLABORADOR→COLABORADOR`, `LF_VOLUNTARIO→VOLUNTARIO`, demais → ignorado.

**Mudancas de schema (se houver):** nenhuma.

**Done criteria desta etapa (todas observaveis):**
- [ ] DC6.1 — `mapFederationRoles([])` e cada `LF_*` da tabela mapeiam exatamente;
      grupo desconhecido/ausente → `[]` (AC-08).
- [ ] DC6.2 — `lib/auth/rbac.ts`/`features.ts` com diff vazio (RBAC autoritativo;
      AC-09); nenhum papel novo (sem ADMIN).
- [ ] DC6.3 — provisao grava `users.roles = mappedRoles` (fluxo Etapa 4 + este mapa
      comprovado por teste de integracao do roundtrip).

**Gates desta etapa:** `npx eslint --no-eslintrc --config .eslintrc.json backend/modules/identity-federation tests/unit/modules/identity-federation/rbac-mapping.test.ts` · `npx tsc --noEmit` · `npx vitest run`.

### Etapa 7 — Tenure de sessao/logout + runbook de operacao

**Objetivo** — RF-SSO-05 (logout local + propagacao melhor esforco + tenure
`min(exp, 48h)`); RF-SSO-06 (runbook versionado com contrato DisplayLab, LDAP, ciclo
de vida de secrets e plano de rollout/rollback).

**Arquivos a criar/alterar (caminhos completos):**

```
- app/api/auth/federation/logout/route.ts                              (NOVO: POST — destroi sessao local; propagacao federada melhor esforco)
- lib/auth/config.ts        (ALTERADO: jwt/session callbacks respeitam exp federado; tenure min(exp, 48h+sliding))
- tests/unit/modules/identity-federation/federation-logout.test.ts     (NOVO: AC-10)
- docs/09-sso-ldap-runbook.md                                          (NOVO: RF-SSO-06)
- .env.example / README-env (ALTERADO: notas do runbook sobre FEDERATION_* e LDAP_*)
```

**Runbook cobre:** contrato DisplayLab (discovery, JWKS, claim set, logout, placeholders
de URL do dono), integracao LDAP (bind DN, base DNs, grupos coarse), ciclo de vida de
secrets (`${VAR:?}`, forbidden list — DisplayLab client secret / LDAP bind password /
NEXTAUTH_SECRET nunca impressos/committados), plano rollout/rollback de
`AUTH_FALLBACK_CREDENTIALS` (alternancia sem downtime) e tabela coarse→fine.

**Mudancas de schema (se houver):** nenhuma.

**Done criteria desta etapa (todas observaveis):**
- [ ] DC7.1 — logout local sempre executa; propagacao falha nao derruba o logout local
      (teste).
- [ ] DC7.2 — sessao local nasce encurtada quando `assertion.exp` < janela local; nunca
      ultrapassa `min(exp, 48h+sliding)` (AC-10).
- [ ] DC7.3 — runbook versionado documenta os 5 topicos da SPEC §4/RF-SSO-06 com nomes
      de var; grep de segredos reais no docs limpo; `check:env` listado no runbook.
- [ ] DC7.4 — nenhum codigo novo fora do fluxo auth; `server-auth.ts`/`api-guard.ts`
      com diff vazio (RBAC intocado).

**Gates desta etapa:** `npx eslint --no-eslintrc --config .eslintrc.json app/api/auth/federation lib/auth/config.ts docs/09-sso-ldap-runbook.md tests/unit/modules/identity-federation/federation-logout.test.ts` · `npx tsc --noEmit` · `npx vitest run`.

### Etapa 8 — Testes completos + gates finais + STATE

**Objetivo** — Verificacao completa em cadeia (AC-01..AC-14), regressao zero das
baselines (RF-01-07, RF-05/RF-28) e registro total no `STATE.json`.

**Arquivos a criar/alterar (caminhos completos):**

```
- (revisar) tests/unit/modules/identity-federation/*.test.ts      (amarrar cada AC ao teste)
- (revisar) tests/integration/identity-federation-external-id-roundtrip.test.ts
- plan-v2/06-auth-sso-ldap/STATE.json                             (evidencias, gates, ACs, timeline, decisions)
```

**Mudancas de schema (se houver):** nenhuma nova (G5 ja aplicado na Etapa 4).

**Done criteria desta etapa (todas observaveis):**
- [ ] DC8.1 — G1 verde (exit 0) para todos os arquivos alterados; G2 verde
      (`npx tsc --noEmit`, 0 errors).
- [ ] DC8.2 — G3 verde: baseline **256/257** (unico fail conhecido
      `floating-session-timer`) + **todos** os testes novos verdes (spec §8: ~7 unit +
      1 integration).
- [ ] DC8.3 — G4 verde com Postgres (`docker compose up -d postgres`); G5 registrado
      (`npx prisma migrate dev`, sem `db push`).
- [ ] DC8.4 — AC-01..AC-14 todas com teste/evidencia mapeada no STATE (status
      verified/pending) e secao `gates` com resultado final; timeline com eventos.

## 4. Verificacao (final)

Assim que todas as etapas estiverem verdes, executar na ordem (com `set -a; source .env; set +a`):

```
npx eslint --no-eslintrc --config .eslintrc.json <todos arquivos alterados>  # G1
npx tsc --noEmit                                                              # G2
npx vitest run                                                                # G3 (256/257; unico fail conhecido floating-session-timer)
docker compose up -d postgres && npx vitest run                               # G4 (quando tocar DB/infra)
npx prisma migrate dev                                                        # G5 (migracao versionada; sem db push)
```

## 5. Rollback

- **Se** qualquer gate falhar (ou se `SPEC` divergir), `git checkout -- <caminhos>` e
  `git reset --hard <checkpoint-verde>`; nao siga adiante.
- **Depois** volte a SPEC, repense, re-implemente, re-verifique.
- **Rollback operacional de auth** (runbook, Etapa 7): `AUTH_FALLBACK_CREDENTIALS=1` e
  `FEDERATION_ENABLED=0` reconstroem o comportamento pre-feature sem migracao — nunca
  remover a coluna `externalId` como rollback (independente do env).
- **Registro**: rollback vai para o cache em `STATE.json` (secao `rollbacks`) — motivo + acao tomada.

## 6. Entregaveis de conclusao

Checklist que, tudo verde, marca `06` como `done`:

- [ ] Todos os gates (G1–G5) verdes
- [ ] Todas as AC-06-01..AC-06-14 com teste/evidencia mapeada no STATE
- [ ] Migracao `add_users_external_id_unique` versionada, sem `db push`
- [ ] `lib/auth/rbac.ts`, `features.ts`, `server-auth.ts`, `api-guard.ts` e
      `identity-access` com diff vazio (RBAC/autorizacao intocados — D-06-02)
- [ ] Nenhum segredo (DisplayLab client secret, LDAP bind password, NEXTAUTH_SECRET)
      impresso/committado; `check:env` verde
- [ ] Runbook `docs/09-sso-ldap-runbook.md` entregue
- [ ] STATE.json atualizado (eventos, evidencias, rollbacks, decisions D-06-01..11)