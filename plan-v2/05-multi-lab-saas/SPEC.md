# 05 · SPEC — Multi-Lab as a Service (Multi-tenancy / onboarding de novas instancias)

> Contrato de **comportamento** da funcionalidade `05`: o "o que" e o "why", sem o
> "como". Esta e a **fonte de verdade** do que sera implementado — se o codigo divergir
> daqui, o codigo esta errado. Qualquer mudanca de requisito abre nova revisao.
>
> Secoes em PT-BR sem acentos (convencao do repo). IDs/enums em ingles.

## 1. Proposito

O DisplayQuest hoje e **single-instance/monotab**: um monolite Next.js + Prisma +
Postgres, um unico deploy por laboratorio, roteamento plano em `app/api/...` e schema
Prisma **sem nenhum modelo `Lab`/tenant/org** (decisao D-05-01). Para atender um
**novo laboratorio**, hoje e preciso copiar infraestrutura na mao, sem padronizacao.
Esta funcionalidade entrega o **onboarding self-serve de novas instancias** (padrao
`instance-per-lab`, subdominio privado `*.displayquest.ifnmg.edu.br`): um endpoint de
**provisioning de uso unico** (D-05-02) que gera uma instancia nova (fragmento de
compose override, `.env` com chaves mintadas, volume de DB proprio, secrets de one-time
display), entrega um **onboarding token single-use** ao coordenador e deixa trilha
auditavel na instancia coordenadora. O **roteamento por subdominio vive na infra**
(reverse proxy/Caddy/nginx) e fica documentado em runbook (D-05-04) — o codigo do app
permanece **lab-agnostic**: le apenas `INSTANCE_*` para branding/reporte (RF-MULTI-04).
**Nenhuma regra de dominio** detecta instancia hardcoded. SSO/LDAP federado entre
instancias fica para a feature 06, reutilizando o contrato de identidade aqui definido.

## 2. Contexto atual (linha de base)

Fatos verificados no codigo (baseline desta feature):

- **Schema** (`prisma/schema.prisma`): **nenhum modelo `Lab`/tenant/org**. `users`
  (linha 10), `projects` (50), `project_members` (68), `tasks` (80), `laboratory_schedules`
  (238 — **sem `labId`**), `lab_events` (306 — **sem `labId`**), `history` (248),
  `notifications` (408). Todos os registros sao globais.
- **Deploy** (`docker-compose.yml`): unico servico `app` + `postgres`, `ports`
  `"3000:3000"`, `expose: ["5432"]` (solo intra-rede; loopback via
  `docker-compose.override.yml`), volumes `postgres_data`/`uploads_data`/
  `report_files_data`, guards `${POSTGRES_PASSWORD:?}` (linha 9) e
  `${NEXTAUTH_SECRET:?}` (linha 30). `NEXTAUTH_URL=http://localhost:3000` hardcoded
  (linha 29). Container `app` usa `command` com `prisma migrate deploy` + `node server.js`.
- **Dockerfile**: `USER nextjs` (uid 1001), `chown nextjs:nogroup` **apenas** em
  `/app/public/uploads` e `/app/data/uploads` (linhas 48-49). **Gotcha critico
  (AGENTS.md):** qualquer caminho de escrita novo no container quebra com EACCES —
  esta feature **nao cria** caminho de escrita novo dentro do container (ver RF-MULTI-01).
- **Auth** (`lib/auth/config.ts`): NextAuth v4, `CredentialsProvider` unico, sessao JWT
  com sliding window (linhas 6-7, 47-87). `lib/auth/server-auth.ts`:
  `requireAuth`/`requireRole`/`requirePermission` (linhas 24-63). RBAC em
  `lib/auth/rbac.ts` (`PERMISSIONS`, feature 01); flags em `lib/auth/features.ts`.
- **Branding hardcoded hoje**: `components/layout/app-header.tsx:127-128`
  (`<img src="/LOGO.png" alt="Display Quest">` + texto "Display Quest"),
  `components/layout/mobile-menu.tsx:55-56` (mesmo par), `public/LOGO.png`.
  Notificacao de relatorio em
  `backend/modules/reporting/infrastructure/prisma-reporting.gateway.ts:738-742`
  (`title: "Novo relatório de projeto"`, `message: "${report.label} · ${report.projectName}"`).
- **Auditoria (feature 02)**: `audit_logs` append-only + `AuditLogWriter` no
  composition root — base para trackear `INSTANCE/PROVISIONED` (RF-MULTI-05).
- **CLI (A10)** (`cli/guard.js` puro + `cli/index.js` com `--allow-prod`) e
  `scripts/check-env-secrets.js` (valida `NEXTAUTH_SECRET` >= 32 e senha em denylist) —
  precedentes de infra favoraveis ao runner de provisionamento (D-05-03).
- **Docs** (`docs/05-operacao-deploy.md`, 193 linhas; `docs/06-guia-de-manutencao-handover.md`):
  descrevem o fluxo single-instance atual; sem secao de multi-instancia/routing.

**Lacunas identificadas:** (1) sem padrao de onboarding — novo lab copia infra na mao;
(2) sem contrato tipado de provisioning nem tokens single-use; (3) sem registry
auditavel de instancias; (4) sem seam de branding por instancia (`INSTANCE_*`);
(5) sem runbook de roteamento por subdominio (reverse proxy/page).

## 3. Atores e papeis

| Ator | Papel | Interacao |
|---|---|---|
| Coordenador da nova instancia | Dono do lab entrante (COORDENADOR futuro da instancia `member`) | Fornece `labName`/slug no onboarding, consome o token single-use e executa a claim (recebe o handover com chaves de 1a exibicao) |
| Admin da plataforma (instancia coordenadora) | `COORDENADOR` com `MANAGE_USERS` na instancia `coordinator` | Mint/provision via `POST /api/provisioning/instances`; lista/audita o registry; roda o CLI host para materializar artefatos |
| SRE / devops | Operador de infra | Mantem o reverse proxy (Caddy/nginx), os runbooks (docs/05/06) e o layout de `.deploy/labs/<slug>/` |
| Sistema / cron | Ator tecnico | Escritor automatico de auditoria (`system:cron`) se provisioning via CLI automatizada |

Nota: a nova instancia entrante e um **deploy separado** (D-05-01) — o coordenador novo
nao cria dados na instancia coordenadora alem do registry/onboarding.

## 4. Requisitos funcionais

### RF-MULTI-01 — Provisioning de nova instancia (provision-instance)

- **Descricao:** prover uma instancia nova a partir de `{ labName, slug }`: valida o
  subdominio (RF-MULTI-03), deriva um `instanceId`, gera o fragmento de compose
  override, o `.env` (chaves mintadas conforme D-05-05), o nome do volume de DB proprio,
  **minia** `NEXTAUTH_SECRET` (>= 32 chars, sem placeholder) e `POSTGRES_PASSWORD`
  (denylist de `scripts/check-env-secrets.js`), persiste o registro no registry
  (RF-MULTI-05) e devolve o onboarding token (RF-MULTI-02).
- **Fronteira:** dominio puro `backend/modules/provisioning/` (provider `render*`,
  `mint-secrets`, `derive-subdomain`) + adapter `InstanceProvisioner` + endpoint fino
  (D-05-03/06).
- **Entradas/Saidas:**
  `POST /api/provisioning/instances` `{ labName, slug }` → 201 `{ instanceId,
  subdomain, onboardingToken, expiresAt, secretsMasked }`; 400 slug invalido; 409
  subdominio ja PROVISIONED (anti double-provision); 200 se rejogar o mesmo
  `X-Idempotency-Key` (idempotencia de storage, D-05-02).
- **Cenario principal (Gherkin):**
  ```
  Given instancia coordenadora (INSTANCE_ROLE=coordinator) e COORDENADOR com MANAGE_USERS
  When  POST /api/provisioning/instances com { labName: "Lab de Física", slug: "lab-fisica" }
  Then  201; registry ganha provisioning_records SUBDOMAIN=lab-fisica.displayquest.ifnmg.edu.br
        status PROVISIONED; provider gerou fragmento/env/volume; secrets mascaradas no body
        (NEXTAUTH_SECRET nunca em full no mint; full apenas na claim)
  ```
- **Regras de negocio:** (1) slug canonicalizado e validado (RF-MULTI-03); (2) o use
  case e **puro** — nenhum I/O de disco dentro do dominio; a materializacao em disco e
  via CLI no host (`cli/provision-instance.js`) ou path ja-writable
  (`/app/data/uploads/.deploy/<slug>/`, gotcha container, D-05-03); (3) idempotencia por
  `idempotencyKeyHash` unique + subdomain unique (race resolvido pelo constraint: 201 x 409);
  (4) token so e emitido quando status vira PROVISIONED (se provisioner falhar → FAILED
  e sem token); (5) app code lab-agnostic: **nenhum** `IF localStorage`, hostname check
  ou deteccao de instancia em logica de dominio.

### RF-MULTI-02 — Onboarding token single-use (mint + burn)

- **Descricao:** cada provisioning mint um token de onboarding **de uso unico**
  (burn-after-first-call): raw de 32 bytes base64url exibido **uma unica vez**; no
  banco so o hash SHA-256 (`tokenHash`). `expiresAt` (default 72h) e `consumedAt`
  (null ate a claim). A claim atomica marca `consumedAt` na **mesma transacao** em que o
  registro e confirmado — segunda chamada e recusada (single-use invariant).
- **Fronteira:** use-cases `mint-onboarding-token` / `consume-onboarding-token` +
  registry gateway.
- **Entradas/Saidas:** `POST /api/provisioning/onboarding/claim` `{ token }` →
  200 com payload de handover (env completo em first-display unico); 409 se ja
  consumido (GONE); 410 se expirado. `GET /api/provisioning/onboarding/verify` →
  200 `{ valid, consumed, expiresAt }` sem queimar o token.
- **Cenario principal (Gherkin):**
  ```
  Given token mintado de lab-fisica
  When  POST claim com o raw token pela primeira vez
  Then  200; provisioning_tokens.consumedAt setado; payload de handover contem env (full) 1x
  When  POST claim com o mesmo token de novo
  Then  409 conflict; nenhum dado retornado
  ```
- **Regras de negocio:** (1) raw token so existe em memoria no mint e na claim; nunca
  gravado/`logado`/retornado apos consumir (D-05-05); (2) hash via SHA-256 hex; (3) expirado
  nunca consome.

### RF-MULTI-03 — Validacao e derivacao de subdominio

- **Descricao:** `deriveSubdomain(slug)` e **deterministico** e segura o DNS label do
  padrao `*.displayquest.ifnmg.edu.br`: lowercase, so `[a-z0-9]` e hifen interno,
  nao inicia/finaliza com hifen, comprimento 2..63; palavra reservada recusada.
- **Fronteira:** `backend/modules/provisioning/application/subdomain.ts` (puro).
- **Entradas/Saidas:** `slug` → `subdomain` ou erro tipado `InvalidSubdomainError`.
- **Cenario principal (Gherkin):**
  ```
  Given slug "Lab de Física!" ou "www" ou "ab--cd" ou "a" ou string com 70 chars
  When  deriveSubdomain roda
  Then  InvalidSubdomainError (caracteres invalidos / reservado / hifen duplo repetido / curto / longo)
  Given slug "lab-de-fisica"
  When  deriveSubdomain roda
  Then  "lab-de-fisica.displayquest.ifnmg.edu.br"
  ```
- **Regras de negocio:** (1) set `RESERVED_SUBDOMAINS` documentado
  (`www`, `mail`, `api`, `admin`, `auth`, `app`, `status`, `cdn`, `db`, `postgres`,
  `coordinator`, `localhost`); (2) colisoes: `subdomain` unique no registry — coliso entre
  dois mints simultaneos e resolvida pelo constraint (um 201, outro 409); nao ha sufixo
  aleatorio na derivacao (determinismo D-05-03).

### RF-MULTI-04 — Seam de branding por instancia (INSTANCE_*)

- **Descricao:** o app le `INSTANCE_ID`, `INSTANCE_NAME`, `INSTANCE_SUBDOMAIN` e
  `INSTANCE_ROLE` **somente** via `lib/config/instance.ts` (unico leitor de
  `process.env.INSTANCE_*`). Constituicao: valor default identico ao comportamento
  atual quando ausente (zero regressao). Consumidores (server-side): layout do dashboard,
  pagina de login, notificacoes de dominio (`prisma-reporting.gateway.ts:738-742`),
  cabecalho de export CSV. Clients (`app-header.tsx`, `mobile-menu.tsx`) recebem por
  props a partir de layouts server — nunca leem `process.env`.
- **Fronteira:** `lib/config/instance.ts` + consumidores server; `INSTANCE_ROLE`
  controla a exposicao do endpoint de provisioning (D-05-04).
- **Entradas/Saidas:** env → `InstanceConfig { id, name, subdomain, role, isCoordinator }`.
- **Cenario principal (Gherkin):**
  ```
  Given instancia sem INSTANCE_* 
  When  getInstanceConfig() roda
  Then  { id:"local", name:"Display Quest", subdomain:"localhost", role:"member" } (comportamento atual)
  Given env INSTANCE_NAME="Lab de Fisica - IFNMG", INSTANCE_SUBDOMAIN="lab-fisica"
  When  o layout do dashboard e renderizado com env injetado
  Then  o brand mostra o lab name (testivel SEM router — D-05-04)
  ```
- **Regras de negocio:** (1) nenhum dominio importa `lib/config/instance.ts` para
  logica — branding/reporte apenas; (2) grep-zero de `INSTANCE_` fora de
  `lib/config/instance.ts` e dos consumidores relacionais; (3) `INSTANCE_ROLE` !=
  `coordinator` ⇒ endpoints de provisioning respondem 403 (`ProvisioningUnavailableError`).

### RF-MULTI-05 — Registry de instancias + auditoria (no banco da instancia coordenadora)

- **Descricao:** tabelas novas `provisioning_records` e `provisioning_tokens` no
  **banco da instancia coordenadora/primaria** (decisao D-05-06) — schema aditivo,
  inofensivo em instancias `member` (a mesma migration roda, mas nada usa). Listagem e
  auditoria: `GET /api/provisioning/instances` (mascarado) e evento `INSTANCE/PROVISIONED`
  (extensao do catalogo da feature 02) via `AuditLogWriter`.
- **Fronteira:** `backend/modules/provisioning/` (repository gateway Prisma) + modulo
  `audit` (feature 02).
- **Entradas/Saidas:** registry CRUD-read-only pelo endpoint; evento de auditoria por
  mint, provision e claim.
- **Regras de negocio:** (1) `subdomain` e `tokenHash` e `idempotencyKeyHash` unicos;
  (2) a claim marca token + confirma record na mesma transacao; (3) listagem nunca
  retorna hash, env, nem raw — so metadados e mascaramento.

### RF-MULTI-06 — Onboarding handover + runbook de roteamento

- **Descricao:** o pacote de entrega (handover) ao coordenador do lab novo:
  subdominio, `instanceId`, comandos de install; e os documentos de operacao:
  roteamento `*.displayquest.ifnmg.edu.br → container` via reverse proxy (exemplo
  Caddy), layout do `.deploy/labs/<slug>/` (fragmento de compose override + `.env.<slug>`
  + snippet Caddy), fluxo de claim e rotina de rollback de instancia.
- **Fronteira:** `docs/05-operacao-deploy.md`, `docs/06-guia-de-manutencao-handover.md`,
  arquivos de exemplo em `docs/ops/`.
- **Entradas/Saidas:** documentos + exemplo de config (Caddyfile, fragmento compose).
- **Regras de negocio:** o app **nao** participa do roteamento (D-05-04) — roteamento e
  100% infra; o handover e reproducivel de ponta a ponta a partir do runbook so
  (verificavel em teste CLI + evidencia de doc, AC-05-06).

## 5. Requisitos nao funcionais

| Categoria | RNF | Criterio de verificacao |
|---|---|---|
| Seguranca | Secrets lifecycle: `NEXTAUTH_SECRET` mintado >=32 chars sem placeholder; full apenas na claim (1x); mascarado no resto; nunca logado/commitado | `secrets.test.ts` + `provisioning.api.test.ts` (asserts de payload) |
| Seguranca | Token single-use: so `tokenHash` persiste; burn atomico; expirado nunca consome | `mint-onboarding-token.test.ts` + integration de claim |
| Seguranca | Default no-deny do endpoint: `INSTANCE_ROLE != coordinator` → 403; sem sessao → 401 | `provisioning.api.test.ts` |
| Confiabilidade | Idempotencia de storage: retry de `POST instances` com mesmo `X-Idempotency-Key` devolve o mesmo record sem duplicar | AC-05-07 |
| Confiabilidade | Nenhum caminho de escrita novo no container (gotcha Dockerfile): artefatos em disco so via CLI host ou `/app/data/uploads/.deploy/` (ja-writable) | AC-05-01 + teste do provider (puro) e do CLI (temp dir) nunca container path |
| Manutenibilidade | App lab-agnostic: `INSTANCE_*` lido so em `lib/config/instance.ts`; grep-zero fora | AC-05-09 (grep + teste) |
| Compatibilidade | Sem env → comportamento identico ao atual (brand/notificacoes); serializer idem | AC-05-04 + baseline 256/257 |
| Auditoria (RNF-17) | Cada provisioning/claim gera evento `INSTANCE/...` via `AuditLogWriter` (feature 02) | `provisioning-registry-roundtrip.test.ts` |
| Performance | Mint/claim nao degrada P95: 1-2 INSERT + 1 SELECT dentro da transacao | sem benchmark formal; sem loop de queries |

## 6. Modelo de dados (se aplicavel)

**Decisao D-05-06:** o registry vive no **banco da instancia coordenadora/primaria**
(e em qualquer instancia que rode a base de codigo — tabelas aditivas e inofensivas em
`member`). Motivo: burn single-use precisa de **transacao atomica** (token + record), o
que filesystem/out-of-band nao oferece; e a trilha via feature 02 fica no mesmo banco.
Rejeita-se registry em filesystem puro (sem atomicidade, mais facil de perder, sem
audit).

Novos modelos em `prisma/schema.prisma` (nomes snake_case, padrao do repo):

```prisma
model provisioning_records {
  id                 Int      @id @default(autoincrement())
  instanceId         String   @unique
  subdomain          String   @unique
  labName            String
  slug               String   @unique
  status             String   @default("PROVISIONING") // PROVISIONING | PROVISIONED | FAILED
  idempotencyKeyHash String?  @unique
  createdBy          Int?
  createdAt          DateTime @default(now())
  provisionedAt      DateTime?
  consumedAt         DateTime?
  createdByUser      users?   @relation("ProvisioningCreatedBy", fields: [createdBy], references: [id], onDelete: SetNull)

  @@index([status])
  @@index([createdAt])
}

model provisioning_tokens {
  id          Int      @id @default(autoincrement())
  recordId    Int      @unique
  tokenHash   String   @unique
  expiresAt   DateTime
  consumedAt  DateTime?
  record      provisioning_records @relation(fields: [recordId], references: [id], onDelete: Cascade)

  @@index([expiresAt])
}
```

- Relacao nova em `users`: `provisioningRecords provisioning_records[] @relation("ProvisioningCreatedBy")`.
- Invariantes: (1) `subdomain`/`slug`/`instanceId` unicos — anti double-provision na
  storage (D-05-02); (2) `tokenHash` unico e `recordId` 1-1 — um token por instancia;
  (3) single-use = `consumedAt` null ate a claim, que marca o token e o record
  (`consumedAt`/`provisionedAt`) **na mesma transacao**; (4) `idempotencyKeyHash`
  unique — retry devolve o mesmo record.
- `status`/campos como `String` (nao enum Postgres): valores do catalogo TS do modulo
  `provisioning`; sem migracao para adicionar estados.
- Migracao versionada `add_provisioning_registry` (G5): `CREATE TABLE` + indices +
  constraints acima; **sem** `prisma db push`. Nenhuma coluna `labId` e adicionada a
  tabela de dominio existente (D-05-01).
- `history`/`audit_logs` intocados; evento `INSTANCE/PROVISIONED`, `INSTANCE/TOKEN_ISSUED`,
  `INSTANCE/TOKEN_CONSUMED` entram no **catalogo** do modulo `audit` (feature 02)
  — aditivo (campos String), zero migracao extra.

## 7. Contratos de API e eventos

### 7.1 Endpoints novos/alterados

| Metodo | Rota | Descricao | Permissao |
|---|---|---|---|
| POST | `/api/provisioning/instances` | Mint+provision nova instancia (subdomain, secrets, token); idempotente por `X-Idempotency-Key`; anti double-provision | `COORDENADOR` com `MANAGE_USERS` **na instancia `coordinator`** (`INSTANCE_ROLE=coordinator`); senao 403 |
| GET | `/api/provisioning/instances` | Lista o registry (subdomain, labName, status, datas); mascarado | idem |
| GET | `/api/provisioning/instances/[subdomain]` | Status de um record | idem; 404 se inexistente |
| POST | `/api/provisioning/onboarding/claim` | Queima o token (single-use) e devolve o handover (env full, 1x) | posse do token (sem sessao) |
| GET | `/api/provisioning/onboarding/verify` | Verifica status do token sem queimar | posse do token |

Status: `201` mint; `200` idempotent replay / claim 200; `400` slug/token invalido;
`403` instancia nao-coordenadora ou sem permissao; `404` subdomain desconhecido;
`409` subdominio ja PROVISIONED ou token ja consumido; `410` token expirado.

### 7.2 Eventos de dominio publicados/consumidos

| Evento | Publisher | Consumidor | Estado |
|---|---|---|---|
| `INSTANCE/PROVISIONED` | provisioning (use case `provision-instance`) | modulo `audit` via `AuditLogWriter` | novo (catalogo feature 02, aditivo) |
| `INSTANCE/TOKEN_ISSUED` | provisioning (`mint-onboarding-token`) | `audit` | novo |
| `INSTANCE/TOKEN_CONSUMED` | provisioning (`consume-onboarding-token`) | `audit` | novo |
| `PROJECT_REPORT_SUBMITTED` | reporting (`notifyManagersOfSubmission`, `prisma-reporting.gateway.ts:732-744`) | notifications | **inalterado**, mas `message` pode receber prefixo de `INSTANCE_NAME` (RF-MULTI-04) |

## 8. Casos de teste / evidencia esperada

Novos testes (unit sob `tests/unit/**`, integration sob `tests/integration/**`):

```
- tests/unit/modules/provisioning/subdomain.test.ts                     (RF-MULTI-03; charset/reserved/length/derivacao)
- tests/unit/modules/provisioning/secrets.test.ts                       (RNF secrets; >=32, denylist, mask, full-once)
- tests/unit/modules/provisioning/compose-overrides.generator.test.ts   (RF-MULTI-01; fragmento/env/volume deterministicos)
- tests/unit/modules/provisioning/provisioning.use-case.test.ts         (RF-MULTI-01/02; fluxo mint->registry->token; idempotencia; anti double; FAILED sem token)
- tests/unit/modules/provisioning/mint-onboarding-token.test.ts         (RF-MULTI-02; hash-only, single-use burn, expiry)
- tests/unit/modules/provisioning/provisioning.api.test.ts              (rotas: 400/401/403/404/409/410/201/200; env-gate coordinator)
- tests/unit/lib/config/instance.test.ts                                (RF-MULTI-04; defaults == hoje; env injetado; role gate)
- tests/integration/provisioning-registry-roundtrip.test.ts             (DB real: mint+claim atomic, double-claim 409, idempotency replay)
```

Comandos (ordem dos gates do ARCHITECTURE), com `set -a; source .env; set +a`:

- G1 `npx eslint --no-eslintrc --config .eslintrc.json <arquivos alterados>` — exit 0
- G2 `npx tsc --noEmit` — 0 errors
- G3 `npx vitest run` — **256/257 de base** (unico fail conhecido `floating-session-timer`)
  + novos verdes
- G4 `docker compose up -d postgres && npx vitest run` — integration do registry
- G5 `npx prisma migrate dev` (local) / `deploy` (prod) — **sem `db push`**

Contagem esperada ao final: baseline 256/257 + ~8 unit novos + 1 integration verde.

## 9. Acceptance criteria (definitivos e rastreaveis)

| ID | Done criterion (Given/When/Then) | Evidencia para verificar | Rastreia |
|---|---|---|---|
| AC-05-01 | Given slug valido de lab; When `provision-instance` roda com provisioner fake; Then subdomain derivado, fragmento/env/volume gerados, secrets mintados, registry ganha record `PROVISIONED` e token emitido — sem nenhum I/O de disco dentro do use case | `provisioning.use-case.test.ts` + `compose-overrides.generator.test.ts` | RF-MULTI-01 |
| AC-05-02 | Given token mintado; When claim roda pela 1a vez; Then 200, `consumedAt` setado e payload handover full enviado 1x; When claim de novo; Then 409 e nenhum dado | `mint-onboarding-token.test.ts` + integration roundtrip | RF-MULTI-02 |
| AC-05-03 | Given slugs invalidos (caracteres/reservados/curto/longo/hifen duplo) e validos; When `deriveSubdomain` roda; Then invalidos → `InvalidSubdomainError`, validos → `slug.displayquest.ifnmg.edu.br` deterministico | `subdomain.test.ts` | RF-MULTI-03 |
| AC-05-04 | Given env `INSTANCE_*` injetado; When UI de brand e notificacao de reporting renderizam; Then exibem lab name; sem env, valores default identicos ao comportamento atual (sem regressao) — tudo testavel SEM router | `instance.test.ts` + prova de consumer server | RF-MULTI-04 / D-05-04 |
| AC-05-05 | Given instancia provisionada e token consumido; When `GET /api/provisioning/instances` e trilha de auditoria consultada; Then registry listavel (mascarado) + eventos `INSTANCE/PROVISIONED` e `INSTANCE/TOKEN_CONSUMED` gravados via `AuditLogWriter` | `provisioning.api.test.ts` + integration (feature 02) | RF-MULTI-05 / RNF-17 |
| AC-05-06 | Given runbook e arquivos de exemplo; When onboarding executado de ponta a ponta a partir do doc (CLI + claim); Then subdominio + env + fragmento compose + volume + snippet Caddy gerados reproduzivelmente e com secreto mascarado/mostrado 1x | evidencia de docs/05/06 + `cli/provision-instance.js` em temp dir | RF-MULTI-06 |
| AC-05-07 | Given retry de `POST instances` com mesmo `X-Idempotency-Key`; Then mesmo record devolvido sem duplicar; Given segundo mint para subdominio ja PROVISIONED; Then 409 | `provisioning.api.test.ts` + integration | RF-MULTI-01/02 (idempotencia D-05-02) |
| AC-05-08 | Given fluxo mint→list→claim; Then `NEXTAUTH_SECRET` nunca aparece em full fora do payload unico de claim; mascarado no GET/list; nada em logs | `secrets.test.ts` + `provisioning.api.test.ts` | RNF seguranca / D-05-05 |
| AC-05-09 | Given base de codigo apos a feature; Then grep `INSTANCE_` fora de `lib/config/instance.ts` (e consumidores de branding server) = 0; nenhum modelo novo `Lab`/labId em tabela existente | comando grep + G2/G3 | RF-MULTI-01/04 (lab-agnostic, D-05-01) |
| AC-05-10 | Given fluxos das features 01-04; When a feature 05 entra; Then sem regressao: baseline unit = 256/257 + novos verdes, G5 sem drift | suites existentes + G1–G5 | não-regressão |
| AC-05-11 | Given instancia `member` (`INSTANCE_ROLE` != coordinator) e chamada a endpoint de provisioning; Then 403 (`ProvisioningUnavailableError`); sem sessao → 401 | `provisioning.api.test.ts` | RF-MULTI-04 |

## 10. Fora de escopo (desta versao)

- **Row-level multi-tenant em DB unico** (schema compartilhado com `Lab` row / `labId`):
  rejeitado por D-05-01 — nao ha migracao de dados nem drizzle antiga para "arrendar" tabelas.
- **SSO/LDAP / federacao de identidade** entre instancias (feature 06); reutiliza o
  contrato de identidade aqui definido.
- **Rewrite do app para queries multi-tenant** (nao necessario — instancia = deploy separado).
- **DNS/wildcard automatico, TLS auto ou Terraform/Ansible** de orquestracao externa de
  instancias (fora da fronteira; runbook documenta o padrao, nao automatiza DNS).
- **API de delete/desativacao de instancias** (solo registro; rollback manual via runbook).
- **Painel web de gestao multi-instancia** na instancia coordenadora (somente API +
  CLI).
- **Migracao de dados** de um lab legado para o padrao novo — fica no runbook como playbook.

## 11. Dependencias e bloqueadores

| Item | Tipo (dep/bloqueador externo) | Estado |
|---|---|---|
| `01-roles-permissions` (RBAC `MANAGE_USERS` estavel para o gate do endpoint) | dep do plan-v2 | pendente (consumo leitura, sem reabrir matrizes) |
| `02-logging-audit` (catalogo `audit` para `INSTANCE/*`; `AuditLogWriter` no root) | dep do plan-v2 | pendente (aditivo no catalogo) |
| `03-project-lifecycle-reports` (consumer de `INSTANCE_NAME` na notificacao de relatorio) e `04-deep-gamification` | dep do plan-v2 | pendentes (nao bloqueiam o provider; seam aditivo) |
| Postgres local ligado (G4/G5) | runtime | `docker compose up -d postgres` |
| Wildcard DNS `*.displayquest.ifnmg.edu.br` + reverse proxy disponivel | **bloqueador externo (dono/ops)** | nao bloqueia codigo; necessario para o runbook (AC-05-06) |
| `floating-session-timer` (fail conhecido) | teste legado | nao bloqueador (baseline 256/257) |