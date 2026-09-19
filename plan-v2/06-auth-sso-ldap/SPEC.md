# 06 · SPEC — auth-sso-ldap

> Contrato de **comportamento** da funcionalidade `06`: o "o que" e o "why", sem o
> "como". Esta e a **fonte de verdade** do que sera implementado — se o codigo divergir
> daqui, o codigo esta errado. Qualquer mudanca de requisito abre nova revisao.
>
> Secoes em PT-BR sem acentos (convencao do repo). IDs/enums em ingles.
>
> Decisoes do dono `D-06-01..D-06-06` sao autoritativas e nao se reabrem (ver
> `STATE.json` `decisions[]`). Decisoes de drafting adicionais: `D-06-07..D-06-11`.

## 1. Proposito

Hoje a autenticacao e 100% local: `lib/auth/config.ts` expoe **apenas**
`CredentialsProvider` (email+senha com bcrypt contra `users.password`) e nao existe
nenhuma fonte de identidade externa no app. Os labs do IFNMG exigem **single sign-on**
entre instancias do DisplayQuest e outros servicos IF (federacao), e a organizacao
mantem **LDAP** como diretorio de identidade. Esta funcionalidade move a **verificacao
de quem e o usuario** (autenticacao) para uma **camada de federacao** (DisplayLab e/ou
LDAP), mantendo no app o perfil/badges/gamificacao e o **RBAC do app como autoridade**
para permissoes finas. `users.password` vira opcional/legado e `CredentialsProvider`
permanece apenas como **fallback controlado por env** enquanto os usuarios migram
(`AUTH_FALLBACK_CREDENTIALS`). **Identidade federada != patch no CredentialsProvider**
(D-06-01): compartilhar credencial contra a propria tabela `users` nao e LDAP.

## 2. Contexto atual (linha de base)

Fatos verificados (baseline congelada; nao reavaliar durante implementacao salvo drift):

- **next-auth v4.24.11** (`package.json:71`). `authOptions` em `lib/auth/config.ts`:
  `providers` contem somente `CredentialsProvider` (linhas 10-38). `authorize` busca
  `users` por email (`config.ts:21`), `bcrypt.compare` (`:25`), exige
  `status === "active"` (`:30-32`), remove `password` do objeto retornado (`:34`).
- **Sessao JWT**: `strategy "jwt"`, `maxAge` 48h e sliding window (<24h restando →
  refresh `iat`) em `config.ts:39-87`; callback `session` re-le `users` no banco a cada
  request (`:88-137`) — sessao reflete status/roles atuais do banco.
- **Guardas** (`lib/auth/server-auth.ts`): `requireAuth` (`:24-41`, gate de `status`
  em `:36`), `requireRole` (`:43-51`), `requirePermission` (`:54-63`), `ROLES`
  (`:70-78`). `lib/auth/api-guard.ts:15` delega decisoes de acesso ao modulo
  `identityAccess` (`ensurePermission`/`ensureAnyRole`/`ensureSelfOrPermission`,
  `:40-63`).
- **Modulo RBAC-decision** (`backend/modules/identity-access/`): contrato
  `IdentityActor { id, roles }` (`application/contracts.ts`), port `IdentityAccessGateway`
  com `hasPermission`/`hasAnyRole`/`canAccessSelfOrPermission`, infra
  `rbac-identity-access.gateway.ts` delega em `lib/auth/rbac.ts`. Este modulo **nao faz**
  autenticacao — e puro RBAC.
- **RBAC** (`lib/auth/rbac.ts`): `PERMISSIONS` (MANAGE_*, linhas 15-24); **nao existe
  papel ADMIN** — topo e `COORDENADOR`/`GERENTE`. `ROLE_VALUES` (`:5-13`):
  COORDENADOR, GERENTE, LABORATORISTA, PESQUISADOR, GERENTE_PROJETO, COLABORADOR,
  VOLUNTARIO. `features.ts` espelha. `lib/auth/permissions.ts` **nao existe** no repo.
- **Schema** (`prisma/schema.prisma` `model users`): `email @unique` (`:13`),
  `password String?` (`:16`, ja nullable), `status String @default("pending")` (`:17`),
  `roles UserRole[]` (`:21`). **Nao existe coluna `externalId`**; nenhum provider de
  federacao nas deps de next-auth.
- **Rotas/paginas**: `app/api/auth/[...nextauth]/route.ts` (handler padrao NextAuth),
  pagina de login em `app/(auth)/login`, `pages.signIn = "/login"` (`config.ts:43-45`).
- **Infra/secret**: `docker-compose.yml:30` → `NEXTAUTH_SECRET=${NEXTAUTH_SECRET:?}`
  (nunca imprimir/commitar o valor real); `.env.example` documenta
  `NEXTAUTH_SECRET`/`NEXTAUTH_URL`. `npm run check:env` valida secret (>=32, sem
  placeholder) e senha do banco (denylist).
- **RFs de origem** (`docs/APOO/04-requisitos-funcionais.md`): RF-01 (cadastro com
  credencial), RF-02 (status pending na criacao), RF-03 (autenticacao por credenciais),
  RF-04 (bloqueio de acesso de quem nao esta ativo), RF-05 (aprovacao de contas
  pendentes), RF-06 (perfil), RF-07 (papeis globais). RF-05/RF-28 (aprovar/rejeitar
  contas) **nao sao** esta feature.

Lacunas (this feature): (1) zero federacao — senha local e a unica prova de identidade;
(2) `users` sem chave externa estavel — email muda e a identidade quebra no SSO;
(3) sem mapeamento coarse→fine de papeis da federacao para o RBAC do app; (4) auth
embutido no next-auth sem port/contract separado do RBAC (o RBAC ja esta isolado em
`identity-access`; falta o lado de autenticacao); (5) sem runbook de operacao
DisplayLab/LDAP e sem ciclo de vida de secrets da federacao.

## 3. Atores e papeis

| Ator | Papel | Interacao |
|---|---|---|
| Usuario federado (IFNMG) | Identidade vinda de DisplayLab/LDAP | Login via federacao; provisionado por `externalId`; RBAC fine vindo do mapeamento coarse→fine + permissao do app |
| Usuario legado (local) | conta local com `users.password` | Login via `CredentialsProvider` fallback enquanto `AUTH_FALLBACK_CREDENTIALS=1`; `externalId` nullo |
| `COORDENADOR` / `GERENTE` | Gestores amplos (RBAC) | Nao tem papel novo; decidem ativacao local (RF-05) e RBAC manual (RF-07) — inalterados |
| DisplayLab | Emissor de assertion / IdP federado (servico externo, repo separado) | Emite JWT/assertion com claims de identidade e grupos coarse; expoe discovery/JWKS e (se contratado) logout |
| Servidor LDAP | Diretorio de identidade da organizacao | Valida bind (alternativa/adapter de federacao) e fornece grupos coarse (base DN) |
| Operador (`MANAGE_USERS`) | Administra env/secrets/migracao | Roda runbook, alterna `AUTH_FALLBACK_CREDENTIALS`, gerencia ciclo de vida de secrets |

## 4. Requisitos funcionais

### RF-SSO-01 — Fluxo de login federado (DisplayLab/LDAP)

- **Descricao:** login passa por emissao/validacao de uma **assertion** (JWT/sessao
  serializada de identidade) emitida pela federacao; o app valida (`FEDERATION_MODE`
  `displaylab`: discovery + JWKS; `ldap`: bind) — **mecanismo decidido = federacao via
  next-auth JWT** (D-06-01, D-06-08): app→DisplayLab/LDAP emite assertion; o app
  consome, valida e **sincroniza/upserts** `users` por `externalId`; a sessao next-auth
  continua JWT carregando o `users.id` interno. O `CredentialsProvider` **nao** e
  alterado para fazer federacao.
- **Fronteira:** `backend/modules/identity-federation` + `app/api/auth/federation/*`.
- **Entradas/Saidas:** assertion → claims tipados (`FederationClaims`) ou erro tipado
  `FederationAssertionError` (401/403).
- **Cenario principal (Gherkin):**
  ```
  Given uma assertion valida emitida por DisplayLab para o externalId X (claim sub=X)
  When  o callback de federacao valida a assertion
  Then  a identidade e resolvida por X, usuario provisionado/upsertado e uma sessao
        next-auth JWT e estabelecida (token carrega users.id interno)
  ```
- **Regras de negocio:** (1) assertion fora do issuer/discovery, assinatura que nao
  casa com JWKS, `exp` vencido ou `nbf` futuro → rejeitada com `FederationAssertionError`
  e **nada** e provisionado; (2) claims `sub` (externalId) e `email` obrigatorios;
  (3) email continua `@unique`; (4) rota callback **explicita**, fora do catch-all
  `[...nextauth]` (sem shadow routes; "federated auth callback/assert" e rota real
  `app/api/auth/federation/callback`).

### RF-SSO-02 — Provisionamento/upsert por externalId

- **Descricao:** identidades federadas provisionam/atualizam `users` chaveado por
  `externalId` (unico). Invariante: **um usuario por external id** (D-06-04); email
  permanece `@unique`. Upsert atomico; campos locais do app nunca sobrescritos pela
  federacao.
- **Fronteira:** port `provision-user-from-external` do `identity-federation`.
- **Entradas/Saidas:** `ResolvedIdentity` → `users` persistido (created/updated).
- **Cenario principal (Gherkin):**
  ```
  Given usuario inexistente com externalId X e uma assertion valida
  When  a assertion e processada
  Then  um registro users e criado com externalId X, name/email das claims e roles do
        mapeamento coarse→fine (default USUARIO se sem claim) e status "active"
  Given usuario existente com externalId X
  When  nova assertion valida para X chega
  Then  o MESMO registro e atualizado (name/email/roles mapeados) sem duplicar e sem
        tocar points/badges/weekHours/locais
  ```
- **Regras de negocio:** (1) merge atualiza **somente** campos federados (name, email,
  roles mapeados, avatar se claimado); campos locais (points, badges, gamificacao,
  weekly hours) sao intocaveis; (2) provisao nova com `status="active"` por padrao — a
  federacao (DisplayLab/LDAP) e quem autentica = quem aprova a identidade (D-06-09);
  cadastro local continua `pending` + RF-05; (3) invariant `externalId` unico — nenhum
  codigo cria segunda linha para o mesmo X; (4) backfill de usuarios existentes: **sem
  script de migracao de dados** — `externalId null` = conta local fallback (D-06-04).

### RF-SSO-03 — Fallback controlado por env

- **Descricao:** `CredentialsProvider` permanece como provider **legacy/fallback**
  somente, gated por `AUTH_FALLBACK_CREDENTIALS=0|1` (default `1`, D-06-02). Requer
  `users.password` definida. Usuario federado (`externalId` set) **nunca** flui por
  credentials, mesmo com fallback ligado.
- **Fronteira:** `lib/auth/config.ts` (montagem do array de providers) + builder em
  `lib/auth/provider-builder.ts`.
- **Entradas/Saidas:** env `AUTH_FALLBACK_CREDENTIALS` → providers ativos.
- **Cenario principal (Gherkin):**
  ```
  Given AUTH_FALLBACK_CREDENTIALS=1 e usuario local com users.password definida
  When  credenciais corretas
  Then  login local funciona (RF-03 preservado)
  Given AUTH_FALLBACK_CREDENTIALS=0
  When  usuario tenta credenciais locais
  Then  provider ausente; login local recusado com mensagem estavel (sem leak de "existe/não")
  ```
- **Regras de negocio:** (1) fallback so autentica quem tem `password` set (config.ts
  ja nega `!user.password`); (2) `AUTH_FALLBACK_CREDENTIALS` fora de `0|1` → `check:env`
  falha e providers nao montam (config-error explicito); (3) mudanca de `0|1` nao exige
  migracao/downtime — tabela inalterada.

### RF-SSO-04 — Mapeamento coarse→fine da federacao para o RBAC do app

- **Descricao:** a federacao (DisplayLab/LDAP groups) informa roles **coarse**
  (`LF_*`); o app mapeia para seus roles `UserRole` na provisao. **RBAC do app continua
  autoritativo** para permissoes finas (D-06-03): a matriz `PERMISSIONS` de
  `lib/auth/rbac.ts` nao muda; coarse mal mapeado nunca concede alem da matriz.
- **Fronteira:** `application/ports/resolve-actor-identity.gateway.ts` + funcao pura de
  mapeamento (`application/map-federation-roles.ts`).
- **Cenario principal (Gherkin):**
  ```
  Given claims com grupos coarse [LF_COORDENADOR]
  When  a identidade e resolvida
  Then  users.roles recebe [COORDENADOR]
  Given claims sem grupo coarse (ou grupo desconhecido)
  When  a identidade e resolvida
  Then  users.roles = [] e o usuario opera como USUARIO (RBAC default-deny)
  ```
- **Regras de negocio:** mapa `coarse → Role` (tabela em `map-federation-roles.ts`,
  espelhada na docs do runbook):

  | Grupo coarse (federacao) | Role do app |
  |---|---|
  | `LF_COORDENADOR` | `COORDENADOR` |
  | `LF_GERENTE` | `GERENTE` |
  | `LF_LABORATORISTA` | `LABORATORISTA` |
  | `LF_PESQUISADOR` | `PESQUISADOR` |
  | `LF_GRUPO_PROJETO` | `GERENTE_PROJETO` |
  | `LF_COLABORADOR` | `COLABORADOR` |
  | `LF_VOLUNTARIO` | `VOLUNTARIO` |
  | ausente / desconhecido | — (nenhum; `USUARIO`) |

  (1) mapeamento roda **na provisao** (grava `users.roles`), nunca por request;
  (2) role coarse desconhecido e ignorado (nunca vira Role do app); (3) a decisao
  gateway→permission continua 100% via `identity-access`/`lib/auth/rbac.ts`.

### RF-SSO-05 — Tenure de sessao e logout (single-session)

- **Descricao:** a tenure da sessao federada respeita o prazo da assertion
  (`min(assertion.exp, 48h sliding)`); logout local propaga para a federacao quando o
  contrato DisplayLab expor endpoint de logout; single-session concorrente e
  **autoridade da federacao** (DisplayLab revoga sessao concorrente) — o app nao cria
  session-store proprio concorrente (D-06-10).
- **Fronteira:** `app/api/auth/federation/logout` + jwt/session callbacks.
- **Cenario principal (Gherkin):**
  ```
  Given sessao next-auth valida estabelecida via federacao
  When  usuario solicita logout
  Then  a sessao local e destruida E, havendo endpoint de logout no contrato, a sessao
        federada e revogada (melhor esforco — falha de propagacao nao derruba o logout local)
  Given assertion com exp em T
  When  a sessao local e emitida
  Then  a sessao local expira em no maximo min(T, 48h+sliding) — nunca alem do prazo federado
  ```
- **Regras de negocio:** (1) logout local sempre executado, independente da propagacao;
  (2) `exp` federado menor que a janela local encurta a sessao; (3) sem novo store de
  sessao.

### RF-SSO-06 — Runbook de operacao (DisplayLab/LDAP)

- **Descricao:** documentacao operacional versionada: contrato de integracao DisplayLab
  (endpoints discovery, JWKS, claim set, logout), integracao LDAP (bind, base DNs,
  grupo coarse), ciclo de vida de secrets (env `${VAR:?}`, forbidden-list, `check:env`)
  e o plano rollout/rollback da alternancia do fallback sem downtime.
- **Fronteira:** `docs/09-sso-ldap-runbook.md` (novo) + `.env.example` + `check:env`.
- **Rules:** (1) valores reais de secrets nunca aparecem no runbook (apenas nomes de
  var e exemplos abertos); (2) runbook indica quem (MANAGE_USERS/operador) roda cada
  passo; (3) runbook lista a tabela coarse→fine do RF-SSO-04 como fonte operacional.

### RFs que permanecem inalterados (nao-regressao — AC-13)

- `RF-01/RF-02` (cadastro local via `app/api/auth/register`) — intactos; usuarios novos
  locais continuam `pending`.
- `RF-03/RF-04` (credenciais p/ autenticado; bloqueio de nao-ativo) — preservados no
  caminho fallback; `requireAuth` gate de `status` (`server-auth.ts:36`) mantido para
  todos os caminhos.
- `RF-05`/`RF-28` (aprovar/rejeitar contas) — **nao** e esta feature; fluxo intacto.
- `RF-06` (perfil) — intacto.
- `RF-07` (papeis globais/RBAC manual via `MANAGE_USERS`) — intacto; RBAC manual
  continua a fonte de roles para contas locais.

## 5. Requisitos nao funcionais

| Categoria | RNF | Criterio de verificacao |
|---|---|---|
| Seguranca | Nenhum segredo (DisplayLab client secret, LDAP bind password, NEXTAUTH_SECRET) e impresso/commentitado/exposto em rota | `check:env` denylist + teste de rota de callback sem log de payload; grep de `console.*secret` |
| Seguranca | Assertion validada criptograficamente (JWKS/discovery por contrato; LDAP via bind) — default-deny | `federation-login.test.ts` rejeita assertion invalida/expirada |
| Seguranca | Fallback e default-deny controlado: `AUTH_FALLBACK_CREDENTIALS=0` bloqueia credencial local | `fallback-gate.test.ts` |
| Disponibilidade | Com federacao indisponivel e `FEDERATION_ENABLED=0`, login local continua operando (fallback 1) | teste de config + gates G3 |
| Privacidade | Claim set minimo (sub, email, name, grupos coarse) documentado no runbook; nada alem e gravado | docs/runbook + reversal code review |
| Compatibilidade | RBAC manual/RF-07, register/RF-01-02, perfil/RF-06 e `PERMISSIONS` intactos; SEM papel ADMIN novo | AC-13 + gates G1–G3 sem regressao (256/257 + novos) |
| Manutenibilidade | Auth (verificar identidade) separado por ports em `identity-federation`; RBAC (`identity-access` + `lib/auth/*`) intacto sem edicao de policy | estrutura de testes por port; diff de `lib/auth/rbac.ts` vazio |
| Observabilidade | Provisionamento/upsert registrado na trilha (consome catalogo de 02: `USER`/acao de provisao, mudanca coordenada) | teste de publisher + nota de integracao 02 |

## 6. Modelo de dados (se aplicavel)

Alteracao minima em `prisma/schema.prisma` (`model users`):

```prisma
externalId String? @unique
```

- Coluna **opcional e unica**: Postgres permite multiplos `NULL`; base existente intacta.
- `password String?` permanece (legado/fallback). `roles`/`status`/`email @unique`
  inalterados.
- Migracao versionada `add_users_external_id_unique` (via `npx prisma migrate dev`);
  **sem `db push`** (gotcha AGENTS.md).
- **Backfill: nenhum.** `externalId null` = conta local fallback (D-06-04). Nenhum dado
  e re-escrito; invariancia de "um usuario por external id" garantida pela constraint
  unique + porta de provisao.
- Nomenclatura: `externalId String` (IDs externos serializaveis como string; sub do
  OIDC pode conter nao-inteiro — nao usar Int).

## 7. Contratos de API e eventos

### 7.1 Endpoints novos/alterados

| Metodo | Rota | Descricao | Permissao |
|---|---|---|---|
| POST | `/api/auth/federation/start` | Inicia fluxo federado (redirect ao provedor DisplayLab; para `FEDERATION_MODE=ldap`, pagina de login chama o bind) | Publico (pre-auth) |
| GET | `/api/auth/federation/callback` | Recebe/valida assertion (`authorization code`/assertion), resolve `ResolvedIdentity`, provisiona por `externalId`, estabelece sessao next-auth JWT. **Rota explicita** (nao shadow em `[...nextauth]`) | Publico (pre-auth) via troca segura |
| POST | `/api/auth/federation/logout` | Destroi sessao local e, se contrato tiver, propaga logout federado (melhor esforco) | Autenticado |
| GET/POST | `/api/auth/[...nextauth]` | **Inalterado** — handler existente; array de providers montado dinamicamente por env | Publico |

Login page (`app/(auth)/login`): mantem o formulario quando fallback cred esteja ativo;
mostra entrada federada quando `FEDERATION_ENABLED=1`; e recusa com mensagem estavel
quando nem federacao nem fallback estao disponiveis. Sem redesign (fora de escopo).

### 7.2 Eventos de dominio publicados/consumidos

| Evento | Publisher | Consumidor | Estado |
|---|---|---|---|
| `USER/PROVISION_EXTERNAL` (ou nome definido pelo catalogo de 02) | `identity-federation` (provisao/upsert) | modulo `audit` (02) | Novo; coordenar nova action no catalogo de 02 quando 02 estiver done |

## 8. Casos de teste / evidencia esperada

Novos testes (unit, `tests/unit/**` — incluidos pelo `vitest.config.mts`):

```
- tests/unit/modules/identity-federation/external-id-upsert.test.ts   -> invariante 1 usuario/externalId, merge atomico, campos locais intocaveis (AC-03/04/05)
- tests/unit/modules/identity-federation/federation-login.test.ts     -> assertion valida/invalida/expirada, callback minor/expirada, resolucao (AC-01/02)
- tests/unit/modules/identity-federation/fallback-gate.test.ts        -> matriz env AUTH_FALLBACK_CREDENTIALS x providers x usuarios (AC-06/07)
- tests/unit/modules/identity-federation/rbac-mapping.test.ts         -> tabela coarse→fine completa + desconhecido ignorado (AC-08/09)
- tests/unit/modules/identity-federation/federation-logout.test.ts    -> logout local + propagacao melhor esforco + tenure exp (AC-10)
- tests/unit/modules/identity-federation/provider-builder.test.ts     -> montagem de providers por env (complementa AC-07)
- tests/integration/identity-federation-external-id-roundtrip.test.ts -> DB real localhost:5432: upsert roundtrip + unique (AC-04/05/11)
```

Comandos (ordem dos gates do ARCHITECTURE), com `set -a; source .env; set +a`:

- G1 `npx eslint --no-eslintrc --config .eslintrc.json <arquivos alterados>` — exit 0
- G2 `npx tsc --noEmit` — 0 errors
- G3 `npx vitest run` — **256/257 de base** (unico fail conhecido
  `floating-session-timer`) + todos os testes novos verdes
- G4 `docker compose up -d postgres && npx vitest run` — integration verde
- G5 `npx prisma migrate dev` — versionada, sem `db push`

Ao final: baseline 256/257 + ~7 testes novos unit + 1 integration verde, sem nenhum fail
alem do conhecido.

## 9. Acceptance criteria (definitivos e rastreaveis)

| ID | Done criterion (Given/When/Then) | Evidencia para verificar | Rastreia |
|---|---|---|---|
| AC-06-01 | Given assertion valida emitida por DisplayLab para X; When `federation/callback` processa; Then identidade resolvida por X e sessao next-auth JWT estabelecida carregando `users.id` | `federation-login.test.ts` + `federation-callback` route test | RF-SSO-01 |
| AC-06-02 | Given assertion invalida/expirada/nao-assinada pelo JWKS do contrato; When callback processa; Then `FederationAssertionError`, status 401, **nada** provisionado | `federation-login.test.ts` | RF-SSO-01 |
| AC-06-03 | Given externalId X inexistente; When assertion valida processada; Then `users` criado com externalId X, name/email das claims, roles coarse→fine e status active | `external-id-upsert.test.ts` + integration | RF-SSO-02 |
| AC-06-04 | Given externalId X ja existente; When assertion valida processada; Then o mesmo registro e atualizado sem duplicar e campos locais (points/badges/weekHours) intocados | `external-id-upsert.test.ts` + integration roundtrip | RF-SSO-02 |
| AC-06-05 | Given tabela `users` com externalId unico; When upsert concorrente/duplicado para o mesmo X; Then constraint unique impele e o codigo cai no update (invariante 1 usuario por external id) | integration (roundtrip planejado com bulk) | RF-SSO-02 |
| AC-06-06 | Given `AUTH_FALLBACK_CREDENTIALS=1` e usuario local com password; When credenciais corretas; Then login local funciona (RF-03); Given `externalId` set; When credenciais tentadas; Then recusado (fallback so para local) | `fallback-gate.test.ts` | RF-SSO-03 |
| AC-06-07 | Given `AUTH_FALLBACK_CREDENTIALS=0`; When usuario tenta credencial local; Then provider ausente e login recusado com mensagem estavel; env invalido → `check:env` falha | `fallback-gate.test.ts` + `check:env` | RF-SSO-03 |
| AC-06-08 | Given claims coarse [LF_COORDENADOR]; When identidade resolvida; Then `users.roles` = [COORDENADOR]; para cada linha da tabela coarse→fine o mapeamento e exato; grupo desconhecido ignorado | `rbac-mapping.test.ts` | RF-SSO-04 |
| AC-06-09 | Given RBAC do app; Then `PERMISSIONS`/`FEATURE_ACCESS` inalterados, sem papel ADMIN novo, e a decisao gateway→permission continua via `identity-access` (diff de `lib/auth/rbac.ts` vazio) | `rbac-mapping.test.ts` + diff no PR | RF-SSO-04, RNF compatibilidade |
| AC-06-10 | Given sessao federada valida; When logout; Then sessao local destruida e propagacao federada melhor esforco; sessao local nunca ultrapassa `min(assertion.exp, 48h sliding)` | `federation-logout.test.ts` | RF-SSO-05 |
| AC-06-11 | Given migracao `add_users_external_id_unique`; Then `users.externalId String? unique` no schema e migracao versionada aplicada (G5, sem `db push`); backfill nenhum (externalId null = fallback) | G5 + `external-id-upsert.test.ts` | RF-SSO-02, modelo |
| AC-06-12 | Given operacao de federacao; Then nenhum valor real de segredo (DisplayLab client secret, LDAP bind password, NEXTAUTH_SECRET) impresso/committed; `check:env` valida novos vars e denylist | runbook + `check:env` (grep de segredo em git) | RF-SSO-06, RNF seguranca |
| AC-06-13 | Given fluxos existentes RF-01-07,R-05/RF-28 (register, perfil, papeis globais, aprovacao de contas); When feature entra; Then comportamentos intactos, RBAC manual autoritativo para contas locais, unit = 256/257 + novos verdes | G1–G3 + suites existentes | nao-regressao |
| AC-06-14 | Given runbook `docs/09-sso-ldap-runbook.md`; Then documenta contrato DisplayLab (discovery/JWKS/claims/logout), integracao LDAP (bind/base DN/grupos), ciclo de vida de secrets e o plano de rollout/rollback do fallback | arquivo presente + checklist `check:env` | RF-SSO-06 |

## 10. Fora de escopo (desta versao)

- **Vendor internals do DisplayLab**: repo externo separado, URL fornecida pelo dono,
  com contrato documentado nesta SPEC/runbook; nao se implementa DisplayLab aqui.
- Implementar SSO para outros servicos/instancias (o app so consome a federacao).
- MFA/2FA nativo, password reset federado, protocolo SAML dedicado nesta versao.
- Migracao/historico de usuarios locais para LDAP: **provision runtime only**
  (D-06-04); sem script de backfill de senhas.
- Mudar matrizes `PERMISSIONS`/`FEATURE_ACCESS`; criar papel `ADMIN`.
- Session-store proprio de single-session concorrente (autoridade e da federacao).
- Redesign da pagina de login alem do gate minimo (form fallback + entrada federada).
- `lib/auth/permissions.ts` — nao existe no repo e nao sera criado.
- Alterar `server-auth.ts`/`api-guard.ts`/`rbac.ts` no que for RBAC-decision.

## 11. Dependencias e bloqueadores

| Item | Tipo (dep/bloqueador externo) | Estado |
|---|---|---|
| 05 (contrato de identidade/onboarding) | dep de plano | Pendente — SPEC/PLAN de 05 ainda nao escritos (pasta vazia); este drafting referencia o contrato a definir, nao codigo de 05 |
| 02 (audit) para registrar provisao | dep de plano (acao nova no catalogo) | Coordenacao — quando 02 done, adicionar a action de provisao ao catalogo e publicar no publisher |
| DisplayLab (URL, discovery/JWKS, claims, logout) | bloqueador externo (infra) | Fornecido pelo dono via contrato; runbook registra placeholders |
| LDAP (endpoint, bind DN, base DNs, grupos) | bloqueador externo (infra) | Fornecido pelo dono; runbook registra placeholders |
| Postgres local para G4/G5 | runtime | `docker compose up -d postgres` |
| `NEXTAUTH_SECRET`/envs para vitest em worktree | runtime | Gotcha AGENTS.md (`set -a; source .env; set +a`) |