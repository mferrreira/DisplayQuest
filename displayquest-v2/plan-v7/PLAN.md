# plan-v7: servidor MCP para os agents do laboratório

> Demanda do dono em 2026-10-15: montar o plan-v7 para a implementação de um MCP
> (Model Context Protocol) de onde os agents do laboratório falam com o DisplayQuest,
> consumido pela coordenação em outro projeto. Ele pediu pesquisa em fonte
> primária, pergunta antes de supor, e nada executado até aprovar este arquivo.
>
> Esta pasta cobre o que ele pediu: como construir, com que tecnologia, quais tools
> entram, como o acesso é protegido, e o contrato que o DisplayQuest vai exigir de um
> IdP/LDAP futuro. Não mexe em tela e não mexe em regra de negócio.
>
> Formo herdado do plan-v3 ao plan-v6: medição primeiro, decisão registrada com
> numeração global, um commit revertível por onda, gates G0–G6. Não há SPEC nesta
> pasta: o contrato de comportamento está na §5 (tools) e na §7 (IdP).
>
> **Nada neste arquivo foi executado.** Lê, discorda, corrige, e aí sim.

- [STATE.json](./STATE.json): estado, decisões, ondas, perguntas abertas.
- Números usados aqui, medidos em 2026-10-15, salvo indicação em contrário.

## 1. O que foi medido

### 1.1 A spec que vale

A revisão corrente do MCP é a **2026-07-28**. O que ela muda em relação ao que a maioria
dos exemplos na internet ainda mostra:

- O núcleo ficou **sem estado**. O handshake `initialize`/`initialized` foi aposentado e o
  cabeçalho `Mcp-Session-Id` saiu. Qualquer requisição pode ser encaminhada para qualquer réplica,
  e a negociação de versão acontece na primeira requisição pelo cabeçalho `MCP-Protocol-Version`.
  Cliente e servidor falam a mesma versão ou o servidor responde 400 `UnsupportedProtocolVersionError`.
- Streamable HTTP agora **exige** `Mcp-Method` em toda requisição e `Mcp-Name` nas chamadas de
  `tools/call`, `resources/read` e `prompts/get`. Requisição sem eles pode ser descartada. Um
  proxy que limpe esses cabeçalhos é o tipo de falha que não aparece em teste local.
- O endpoint `GET` do stream foi **removido**. Nosso servidor responde 405 a `GET` e `DELETE`, e
  o `DELETE` de sessão some junto com o `Mcp-Session-Id`.
- O servidor **deve** validar a linha `Origin` de toda requisição de conexão (proteção contra
  DNS rebinding) e responder 403 quando ela for de outro host. Localmente deve-se publicar só
  em `127.0.0.1`, não em `0.0.0.0`.
- Extensões estáveis nesta revisão: tasks (`io.modelcontextprotocol/tasks`), MCP apps e
  Enterprise-Managed Authorization. Deprecations anunciadas na mesma data com janela mínima de
  12 meses: roots, sampling, logging e o transporte HTTP+SSE antigo. Nenhum deles entra no nosso desenho.
- `resources/read` devolve binário como `blob` em base64, ao lado de `text`. É o caminho natural
  para servir DOCX/PDF pelo MCP, e é o escolhido em DEC-202 (a opção em `resources/read` ganhou da
  alternativa de devolver URL na resposta da tool).

### 1.2 Autenticação na spec

Este é o ponto que decide a arquitetura:

- A autorização é **opcional** na spec e **recomendada** para transportes HTTP. Para `stdio`
  ela **não deve** ser seguida: as credenciais vêm do ambiente do processo.
- O servidor MCP é **resource server** e **nunca** emite token. Ele publica metadado de recurso
  (RFC 9728), devolve 401 com `WWW-Authenticate` contendo `resource_metadata` e `scope`, devolve
  403 `insufficient_scope` quando falta escopo, e **valida a audiência do token** (RFC 8707 /
  OAuth 2.1 §5.2).
- O token recebido **não pode ser repassado** para a API do upstream. Ele deve ser trocado por
  credencial própria do servidor para o recurso de destino, ou o servidor deve ser o próprio
  recurso de destino. Esta regra é o que separa um gateway MCP de um proxy.
- Bearer vai no cabeçalho, nunca em query string.
- Descoberta do AS por RFC 8414 ou OIDC Discovery. Registro de cliente preferencialmente por
  CIMD (o DCR ficou deprecado), ou cliente pré-cadastrado.
- `security-considerations` da spec: todo endpoint de AS e toda redirect URI sobre HTTPS
  (localhost é a única exceção). `iss` conforme RFC 9207.
- Duas formas encaixam no futuro daqui: **EMA** (estável) quando o IdP da coordenação conduz o
  acesso, e **Client Credentials** (rascunho) quando existe um serviço sem pessoa na frente.

Consequência direta: **DisplayQuest não tem hoje nenhum caminho de Bearer, nenhum modelo de
token e nenhum adapter.** Ver §1.5.

### 1.3 SDKs

- Linha v2, que fala a spec 2026-07-28: `@modelcontextprotocol/server@2.3.1`,
  `@modelcontextprotocol/client@2.3.1`, `@modelcontextprotocol/core@2.3.1` (publicados em
  2026-10-05, `engines.node: >=20`).
- Middleware de transporte em pacote separado: `@modelcontextprotocol/node@2.1.1`,
  `@modelcontextprotocol/express@2.0.2`, `@modelcontextprotocol/hono@2.0.2`. Todos `>=20`.
- Linha v1 (`@modelcontextprotocol/sdk@1.32.1`) é legado, só correção de bug. Não usar.
- Os schemas usam Standard Schema, então a linha v2 exige **Zod v4**. O repositório fixa
  `zod 3.24.1` na raiz, e `@prisma/client 6.11.1` está no mesmo `package.json`.
- A imagem da casa é `node:20-alpine` e `engines` é `20.x`, o que bate com o `>=20` do SDK v2.

Portanto: **`mcp/` é um pacote próprio, com `package.json` e lockfile próprios**, e o container
do MCP é um build separado. Ele não divide árvore de dependências com o app, não herda o `zod`
raiz e não obriga rebuild das 25+ minutos do `next build`.

### 1.4 O que o DisplayQuest tem hoje

- Autenticação: NextAuth `4.24.11`, `CredentialsProvider`, JWT em cookie httpOnly.
- O portão real das rotas é `requireApiActor()` (`lib/auth/api-guard.ts:21`), chamado em **159
  pontos**, espalhados por **100 arquivos de rota** de `app/api/`. Ele chama `requireAuth()`
  (`lib/auth/server-auth.ts:24`), que lê `getServerSession(authOptions)` e nada mais. **Nenhuma
  das duas funções recebe a requisição**: `getUserFromRequest(_req)` recebe e ignora (`_req`).
- `grep` em `app/api/` por `requireAuth()`, `requireRole(`, `requirePermission(`, `getServerSession`
  devolve **0**: todo mundo passa por `requireApiActor`. Ele é o único ponto de entrada.
- Não existe ramo de Bearer em lugar nenhum. O único `Authorization: Bearer` do repositório é de
  saída, para o adaptador de IA do rascunho de relatório (V5-9).
- `prisma/schema.prisma` não tem modelo de adapter (`Account`, `Session`, `VerificationToken`
  não existem). `users.password` é a única credencial, e o `users.id` é `Int` autoincrement.
- 12 módulos de backend, 104 rotas em `app/api/`. O composition root é o único ponto de wiring
  (DEC-21) e desde o B6 o gate mora no use case, com `ActorRef`.
- Guardas em pé que protegem o desenho daqui:
  `tests/unit/domain/identity/system-callers.test.ts` faz grep de `systemActor(` em `app/api/**`
  e derruba o build se uma rota declarar ator de sistema (é o que garante a DEC-191);
  `tests/unit/modules/user-management/user-delete-schema-drift.test.ts` compara o schema com o
  corpo de `countBlockingDependencies` e nomeia a coluna quando falta.
- Contagem de FK bloqueante para `users` hoje: **18** (17ª em V5-2c, 18ª em V5-7a).

### 1.5 O bloqueio que ninguém tinha visto

"Ai age como a pessoa coordenadora" exige uma credencial que sobreviva a um cookie. Ela não
existe. Ou seja, o plan-v7 tem **duas peças**, e o MCP é só a segunda:

1. `api_credentials` no DisplayQuest (V7-1): emite, revoga e valida token de acesso.
2. O servidor MCP em cima (V7-2 em diante).
3. O IdP futuro (§7) é o terceiro consumidor do mesmo seam.

Sem a peça 1, o MCP não tem como atuar por ninguém e a coordenação só conseguiria falar com a
interface de pessoa. Isso muda o tamanho do plano: a V7-1 não é opcional nem é infrastrutura de
luxo, é o que torna o resto possível.

### 1.6 TLS e o que o dono decidiu

- A instância é HTTP em IP de rede. A onda de TLS do plan-v3 foi removida pela DEC-49.
- Na mesma rodada de 2026-10-15 o dono respondeu duas coisas em momentos diferentes: primeiro
  "não, manter HTTP na LAN" (ASK-V7-04) e depois, perguntando especificamente do endpoint do MCP,
  "sim, só no endpoint do MCP" (ASK-V7-07). A resposta posterior e mais específica é a que vale
  e virou DEC-194.
- O que nenhuma das duas perguntas cobriu: **em stdio não existe endpoint de entrada para onde
  colocar certificado**, e o salto do MCP para o app dentro do compose continua em texto puro na
  LAN. O dono respondeu depois (ASK-V7-13): **só o MCP ganha TLS** (DEC-201). O salto em claro fica
  aceito de propósito, a 8787 sai da rede pública do compose e o risco fica registrado na §10.

## 2. Decisões registradas

Numeração global: DEC-01..29 clean-arch, 30..49 plan-v3, 50..54 B6/D4, 55..60 plan-v4,
61..77 e 99..104 e 126..180 plan-v5, 78..98 plan-v4, 105..114 e 181..188 plan-v6, 189 plan-v4
(lote SUB-1, autoridade de subtask, commitado 2026-10-15). **Este plano ocupa DEC-190..203.**
**Próxima livre: DEC-204.**

Registro de uma quase colisão: o plano nasceu reivindicando DEC-189..198 e a conferência dos seis
`STATE.json` mostrou que a 189 já era do plan-v4. O plano foi renumerado para 190..199 antes de
qualquer commit, e as quatro respostas de 2026-10-15 ocuparam DEC-200..203. Vale a regra que já
estava escrita nesta seção: grep nos seis arquivos antes de gravar, não depois.

| ID | Decisão | Origem |
|---|---|---|
| DEC-190 | O MCP é um serviço novo em container próprio que fala com as rotas HTTP existentes. Não importa `backend/`, não tem Prisma, não tem acesso ao banco. | dono, ASK-V7-05 |
| DEC-191 | O agent age como a pessoa coordenadora: o ator chega ao use case como `userActor(roles)`. `systemActor` é proibido no caminho do MCP. | dono, ASK-V7-02 |
| DEC-192 | DisplayQuest ganha credencial delegada `api_credentials`, emitida e revogada por CLI pelo dono. Sem tela de administração. | dono, ASK-V7-08 |
| DEC-193 | Uma credencial de API por instância de agent, com escopo sob medida. | dono, ASK-V7-09 |
| DEC-194 | TLS no endpoint do MCP. | dono, ASK-V7-07 (supera ASK-V7-04) |
| DEC-195 | Transporte duplo: Streamable HTTP remoto e `stdio` local. | dono, ASK-V7-10 |
| DEC-196 | Auditoria em tabela `mcp_audit_log`, consultável por SQL. Nenhuma tela. | dono, ASK-V7-11 |
| DEC-197 | As seis famílias de capacidade entram no plano (leitura, tarefa, projeto/cronograma, horas/sessões, documentos, gestão de pessoas). A ordem e o gate por onda são deste plano. | dono, ASK-V7-03 |
| DEC-198 | O servidor MCP publica `/.well-known/oauth-protected-resource` (RFC 9728) desde a primeira onda de código, antes de existir authorization server. Custo baixo, e a troca futura vira configuração em vez de código. | plano |
| DEC-199 | `audience` separa o token que o app aceita (`audience = api`) do token que o MCP aceita (`audience = mcp`). Os dois lados recusam o token do outro lado, o que é o que impede o passthrough que a spec proíbe. | plano |
| DEC-200 | O certificado do endpoint do MCP é de verdade, emitido para um nome interno. Não há CA para instalar nos hosts dos agents. Consequência medida: o hostname tem que resolver lá, e a V7-3 começa conferindo isso. | dono, ASK-V7-12 |
| DEC-201 | TLS só no endpoint do MCP. O app segue HTTP e o salto do MCP para o app dentro do compose continua em texto puro na rede interna. É aceito de propósito e registrado como risco na §10. | dono, ASK-V7-13 |
| DEC-202 | Documento binário chega ao agent por base64 em `resources/read`, que é o formato da spec. Um contrato só, para DOCX e PDF, em vez de dois por tipo de arquivo. | dono, ASK-V7-15 |
| DEC-203 | Um único agent, com as seis famílias de capacidade na mesma credencial. O mecanismo de escopo por família continua existindo (DEC-193) e continua checado no app, só que a credencial concreta nasce com as seis. | dono, ASK-V7-14 |

### 2.1 Perguntas respondidas

| ASK | Pergunta | Resposta | Efeito |
|---|---|---|---|
| ASK-V7-01 | Quem executa o agent que consome o MCP? | ainda não definido | o plano aceita os dois caminhos (V7-2) |
| ASK-V7-02 | O agent age em nome de quem? | age como a pessoa coordenadora | DEC-191 |
| ASK-V7-03 | Quais capacidades na primeira leva? | as seis famílias | DEC-197 |
| ASK-V7-04 | Topa HTTPS agora? | não, manter HTTP na LAN | **superada** por ASK-V7-07 |
| ASK-V7-05 | Onde o MCP vive? | container novo chamando a API HTTP | DEC-190 |
| ASK-V7-06 | O IdP já tem escolha? | ainda não decidido | a §7 vira contrato plugável |
| ASK-V7-07 | TLS no endpoint do MCP? | sim, só no endpoint do MCP | DEC-194 |
| ASK-V7-08 | Quem cria a credencial? | o dono, por CLI | DEC-192 |
| ASK-V7-09 | Como as credenciais são distribuídas? | uma por agent, escopo sob medida | DEC-193 |
| ASK-V7-10 | Como o cliente conecta? | os dois transportes | DEC-195 |
| ASK-V7-11 | A auditoria aparece em algum lugar? | só tabela | DEC-196 |
| ASK-V7-12 | De onde vem o certificado do TLS? | certificado real para um nome interno | DEC-200 |
| ASK-V7-13 | O app também ganha TLS? | não, só o MCP | DEC-201 |
| ASK-V7-14 | Quais agents são e o que cada um faz? | um único, fazendo tudo | DEC-203 |
| ASK-V7-15 | Binário por `resources/read` ou pela tool? | base64 em `resources/read` | DEC-202 |

## 3. Ondas

| # | Onda | Depende de | DC | Gate |
|---|---|---|---|---|
| V7-0 | Fechamento do planejamento | - | medir | STATE válido |
| V7-1 | Credencial delegada + tabela de auditoria | - | DEC-192/193/196/199/203 | G0–G4 |
| V7-2 | Container do MCP + transporte + validação | V7-1 | DEC-190/191/195/198 | G0–G3 |
| V7-3 | TLS no endpoint do MCP | V7-1 | DEC-194/200/201 | G0–G3 |
| V7-4 | Tools de leitura | V7-2 | DEC-197 | G0–G3 |
| V7-5 | Tools de tarefa | V7-4 | DEC-197 | G0–G3 |
| V7-6 | Projeto e cronograma | V7-5 | DEC-197 | G0–G3 |
| V7-7 | Horas e sessões | V7-6 | DEC-197 | G0–G3 |
| V7-8 | Documentos | V7-7 | DEC-197/202 | G0–G3 |
| V7-9 | Gestão de pessoas | V7-3 | DEC-197 | G0–G3 |
| V7-10 | Rate limit e revisão de hardening | V7-9 | - | G0–G3 |
| V7-11 | Fechamento G5/G6 | V7-10 | - | G0–G6 |

### 3.1 Regras de avanço

1. Um commit por onda, com a mensagem começando por `v7:<onda>`. Nada de um commit que junte
   duas ondas.
2. Nenhum código antes da V7-1 estar verde. O MCP sem credencial não tem como ser provado.
3. **TLS (V7-3) é o gate de qualquer tool de escrita.** A leitura da V7-4 pode começar antes,
   porque o risco é exatamente o que a interface web já expõe hoje na LAN. Tudo que escreve espera.
4. Cada tool nova no inventário traz o teste que prova o caminho: token válido → rota → 200/401/403
   esperado. Tool sem teste não entra.
5. Toda migration segue a sequência medida do V4-4 (salvar o schema antes, `prisma migrate diff`,
   gravar a migration, `prisma migrate deploy` nas duas portas, `prisma generate`, reiniciar o dev
   server). **Nunca `prisma migrate dev`** na 5432.
6. Deploy é `docker compose up --build`. **Nunca `docker compose down`.**
7. Antes de abrir decisão nova, grep nos **SEIS** `STATE.json` (clean-arch, plan-v3, plan-v4,
   plan-v5, plan-v6, plan-v7).

## 4. Etapas detalhadas

### V7-0 — Fechamento do planejamento

- Gravar este PLAN e o STATE.json, com DEC-190..203 e ASK-V7-01..15.
- Adicionar a linha do `plan-v7` no índice de `displayquest-v2/README.md`.
- Escolher a porta do MCP e medir que está livre no host. **8787 está livre** (medido em
  2026-10-15: 3000 ocupada pelo app, 8787/8080/8443 livres).
- Gravar no `.dependency-cruiser.js` a regra nova: nada em `mcp/` importa `backend/`, `prisma` ou
  `@prisma/client`. O MCP só fala HTTP.
- Escrever a seção do plan-v7 no `AGENTS.md` com o estado e os gotchas que aparecerem nas ondas.

**Feito quando:** STATE.json válido, README indexado, regra do G0 gravada e `npm run arch:check`
com allow-list vazia.

### V7-1 — Credencial delegada + `mcp_audit_log`

Peça 1 da §1.5. Esta onda mexe no app e no schema.

**Schema** (modelo novo, convenções do repositório: `Int` autoincrement, `@@map`, `onDelete` explícito):

```prisma
model api_credentials {
  id          Int       @id @default(autoincrement())
  userId      Int
  label       String
  audience    String    // "api" | "mcp" — DEC-199
  scopes      String[]  // lista fechada, ver §5
  tokenHash   String    @unique // sha256 hex; o token claro nunca é gravado
  expiresAt   DateTime?
  revokedAt   DateTime?
  lastUsedAt  DateTime?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  user users @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@map("api_credentials")
}

model mcp_audit_log {
  id           Int      @id @default(autoincrement())
  at           DateTime @default(now())
  credentialId Int?
  actorId      Int
  audience     String
  transport    String   // "http" | "stdio"
  toolName     String
  protocolVersion String?
  mcpMethod    String?
  mcpName      String?
  ok           Boolean
  httpStatus   Int?
  durationMs   Int?
  detail       Json?    // sem corpo de requisição, sem token, sem documento

  @@index([at])
  @@index([actorId])
  @@map("mcp_audit_log")
}
```

`onDelete: Cascade` em `api_credentials.userId` foi escolhido de propósito: uma conta apagada
não deixa token vivo, e a FK cai fora da contagem de bloqueantes, então o guarda de schema não
deve mudar. **Conferir na onda** se o guarda também conta FK total; se contar, atualizar o corpo
de `countBlockingDependencies` junto e dizer no commit.

**Autenticação.** O portão é `requireApiActor()`, chamado em 159 pontos que moram em 100 arquivos
de rota, e ele não recebe requisição. A proposta é ler o cabeçalho com `await headers()` de
`next/headers` dentro de `requireAuth()`, o que mexe em **zero** chamadores. O repositório ainda
não importa `next/headers` em lugar nenhum, então a **primeira tarefa da onda é um teste de rota
que prova que `headers()` devolve o `Authorization` num route handler do Next 15**. Se não
servir, o fallback é assinar `requireApiActor(req)` **só nas rotas que o MCP vai chamar**: o
inventário da §5 toca **39 rotas** (59 pontos de escopo, um por método), e não 100 arquivos.

Ramada: `Authorization: Bearer <token>` presente → hash sha256 → procura por `tokenHash` →
confere `audience = "api"`, `revokedAt` nulo, `expiresAt` no futuro → monta o objeto de usuário
com `id`, `roles`, `status`, `email` a partir da linha de `users` → segue o mesmo caminho do cookie,
com a checagem A3 de `status !== "active"` intacta. Sem cabeçalho → caminho de cookie inalterado,
comportamento de hoje idêntico.

**Escopo.** `requireApiActor` passa a devolver `scopes?` junto do `actor`. A função nova
`requireScope(actor, scope)` recusa bearer sem o escopo; **sessão de cookie passa sempre**, porque
quem usa cookie é pessoa e não perde nada do que já tem. Só as rotas do inventário da §5 recebem
`requireScope`, uma por onda de tool.

**Credencial concreta (DEC-203).** O dono decidiu um agent só, então a credencial emitida nesta
onda carrega as seis strings de escopo de uma vez. O mecanismo continua pronto para emitir uma por
família: o escopo é coluna, a revogação é por id, e o `requireScope` do app não muda de forma. O
que a DEC-203 muda é quantas credenciais existem hoje, não o que o desenho aceita.

**CLI.** `cli/credential.js` com função pura ao lado de `cli/guard.js`, ligada no `cli/index.js`,
respeitando `--allow-prod`. Subcomandos: `issue --user <id> --audience api|mcp --scopes a,b --ttl 30d`,
`revoke --id <id>`, `list`. O token claro sai **uma vez** na saída do terminal e não volta nunca.

**Env.** O container do MCP recebe a credencial por `DQ_API_CREDENTIAL`. Falta de env valida como
erro, no estilo de `npm run check:env`.

**Testes:** `tests/unit/auth/api-credentials.test.ts` (hash, TTL, revogação, audience, escopo,
status suspenso), `tests/unit/auth/api-guard-bearer.test.ts` (caminho cookie intacto, caminho
bearer, `requireScope`), e um de rota provando o `headers()`. Todos em `tests/unit/`, que o projeto
`unit` do Vitest já inclui.

**Feito quando:** `arch:check`, `lint`, `tsc` zero e `vitest` verde; token emitido por CLI
autentica `GET /api/users` e token revogado/expirado/suspenso devolve o status certo.

### V7-2 — Container do MCP + transporte + validação

- `mcp/package.json` próprio (`private: true`, `engines.node >=20`, `@modelcontextprotocol/server`
  e `@modelcontextprotocol/node`, Zod v4), `mcp/src/` com `server.ts`, `src/tools/`, `src/auth/`,
  `src/audit.ts`, `mcp/Dockerfile` (node:20-alpine, multi-stage) e `.dockerignore`.
- Serviço no `docker-compose.yml`: `mcp-server`, `container_name: display-quest-mcp`,
  `build: ./mcp`, porta **8787**, `depends_on: app`, env `DQ_API_CREDENTIAL`, `DQ_API_BASE=http://app:3000`.
  O container do app **não** ganha acesso ao banco novo nem muda de imagem de app.
- Endpoint único em `POST /mcp`. `GET` e `DELETE` respondem 405 e `Mcp-Session-Id` é ignorado.
- Validação da spec: `MCP-Protocol-Version` contra o corpo (`400`, código `-32020`), `Mcp-Method`
  e `Mcp-Name` obrigatórios, e **`Origin` validado, 403 quando for de outro host**. Os três
  viram teste.
- `/.well-known/oauth-protected-resource` servindo RFC 9728 (DEC-198), apontando para o recurso
  e para os escopos. Sem AS ainda, então 401 na porta com `WWW-Authenticate` contendo
  `resource_metadata`, e aceitação do token de `audience = "api"` **em `Bearer` do próprio MCP**
  enquanto não existe AS (é provisionamento manual do dono, ASK-V7-01 ainda aberto). Quando o
  IdP chegar, o token de `audience = "mcp"` substitui esse caminho sem mexer nas tools.
- Atores: o MCP monta `userActor(roles)` do usuário da credencial e repassa o mesmo Bearer no
  `fetch` para o app. Ele nunca chama `systemActor` e nunca guarda papel próprio.
- `tools/list` e `tools/call` com as duas primeiras tools (`people_list`, `project_list`) só para
  provar o ciclo ponta a ponta. Auditoria gravando linha por chamada.

**Feito quando:** `curl -X POST localhost:8787/mcp` com `tools/list` devolve 200 e as tools;
`Origin` estranho devolve 403; sem token devolve 401 com `resource_metadata`; a linha de
`mcp_audit_log` aparece no banco.

### V7-3 — TLS no endpoint do MCP

Desbloqueada por DEC-200 (certificado real, emitido para um nome interno) e DEC-201 (TLS só no
endpoint do MCP).

- Primeiro passo medido: **o hostname tem que resolver nos hosts dos agents**. Sem isso o
  certificado é válido e ninguém consegue chamar, então a onda começa conferindo a resolução antes
  de montar qualquer proxy.
- Env `TLS_CERT_PATH`/`TLS_KEY_PATH` apontando para volume montado, fora da imagem. Certificado e
  chave não entram no `git` nem no `Dockerfile`.
- Proxy TLS na frente do 8787 (nginx no compose ou outro), porta 8443. O endereço de produção
  passa a ser `https://<nome-interno>:8443/mcp`.
- Configuração medida para Streamable HTTP: **`proxy_buffering off`**, resposta SSE com
  `X-Accel-Buffering: no`, sem reescrever nem remover `Mcp-*`, `MCP-Protocol-Version` e
  `WWW-Authenticate`, keep-alive com comentários de 15 s.
- A porta 8787 **passa a ser só interna na rede do compose** (DEC-201). Só a 8443 fica publicada.
- O salto do MCP para o app continua em `http://app:3000` dentro da rede do compose, sem TLS, e
  isso é aceito de propósito (DEC-201, risco 8 da §10). A credencial trafega por esse salto, e é
  por isso que a rede do compose não recebe host externo nenhum.
- Teste de atravessamento: `tools/call` que devolve stream atravessa o proxy sem buffering e
  chega inteiro ao cliente.

**Feito quando:** `curl https://<nome-interno>:8443/mcp` completa o handshake com o certificado
real, o stream de `tools/call` chega inteiro pelo proxy, e a 8787 não responde mais de fora da
rede do compose.

### V7-4 — Tools de leitura (escopo `read`)

Tabela da §5, família `read`. Cada tool: `mcp/src/tools/read.ts`, mapeamento para a rota medida,
e teste cobrindo caminho feliz, 401 e 403. `requireScope("read")` entra nas rotas dessa família.

**Primeira tarefa da onda, antes de escrever tool nenhuma:** reconferir cada par rota/método da
tabela contra o arquivo de rota, do mesmo jeito que este plano foi reconferido (a §5 registra dois
contratos que a primeira leitura errou). Tool sem confirmação do arquivo não é escrita.

**Feito quando:** as 16 tools respondem e o escopo negado recusa com 403.

### V7-5 — Tools de tarefa (escopo `tasks`)

Criação, edição, movimento, conclusão, aprovação/rejeição e subtasks, sobre as rotas medidas em
`/api/tasks*`. Duas armadilhas de contrato já medidas: o movimento é `PUT` com `{status}`, e o
`PATCH` é conclusão (`{action:"complete"}`), nunca movimento. Aqui entra também o teste da trava de
subtask e da janela de `in-review`/`done`: a tool não pode reabrir o que a interface trava.

Terceira armadilha, medida depois: a **autoridade de subtask mudou na DEC-189** (lote SUB-1 do
plan-v4, 2026-10-15). `canActorOperateSubtasksDecision` decide marcar e ver: quem não é dono da
mãe nem gestão recebe a tarefa com `subtasks: []` no `GET` e na lista, sem 403 que confirme a
existência da lista. Para o MCP isso significa que `subtask_list` devolve vazia quando o usuário da
credencial não é dono nem gestão, e isso é o sistema funcionando. A onda cobre os dois lados.

**Feito quando:** o fluxo completo de tarefa (criar, mover, concluir, aprovar) passa pelo MCP e as
travas de subtask respondem com o mesmo código que a API.

### V7-6 — Projeto e cronograma (escopo `project`)

Projetos, entregáveis, metas, atividades do cronograma, pedido e aprovação de conclusão, prova de
atividade. A aprovação é ação de gestão (`GLOBAL_PROJECT_MANAGERS`), então o teste de 403 para
membro comum é obrigatório.

**Feito quando:** criar atividade, pedir conclusão e aprovar funcionam, e a recusa para quem não
gerencia é 403.

### V7-7 — Horas e sessões (escopo `hours`)

`POST/PATCH/DELETE /api/work-sessions` e `PATCH /api/responsibilities/[id]` com
`{action: "pause" | "resume" | "end" | "updateNotes"}` (medido em
`app/api/responsibilities/[id]/route.ts:31-48`). As rotas de leitura de horas já entram na V7-4.

**Feito quando:** iniciar sessão, pausar, retomar e finalizar funcionam, e o teto de 9h por trecho
e a varredura noturna continuam valendo (nada aqui pode burlar a anti-farm).

### V7-8 — Documentos (escopo `documents`)

Desbloqueada por DEC-202: o binário chega por `resources/read`, como recurso MCP com `blob` em
base64, que é o formato da spec. Um contrato só, para DOCX e PDF, em vez de dois por tipo.

Relatórios técnicos, atestados, anexos e relatórios semanais.

- Recurso `dq://documents/<caminho>` que o MCP resolve baixando do app com o mesmo Bearer. O
  download autenticado do app continua exigindo o token, então o arquivo não fica alcançável sem
  credencial.
- **Teto de tamanho.** O `blob-store` do V5 aceita até 20 MB de PDF e 100 MB de vídeo (DEC-131),
  e base64 infla ~33% em cima disso. Resposta de dezenas de megabytes não serve para um agent.
  A onda mede o tamanho real dos relatórios e atestados da instância e fixa o teto em teste;
  acima dele a tool recusa com mensagem nomeando o tamanho.
- A prova é byte a byte, não só status: `resources/read` devolve DOCX e PDF iguais aos que a rota
  do app serviria.

**Feito quando:** baixar um DOCX e um PDF pelo MCP devolve o arquivo byte a byte, e um arquivo
acima do teto é recusado com a mensagem medida.

### V7-9 — Gestão de pessoas (escopo `people`)

**Depende da V7-3 (TLS), por DEC-197.** Usuários, aprovação, status, papéis, pontos e vínculo de
projeto. Aqui o risco é maior: `PATCH /api/users/[id]/points` aceita negativo por DEC-60, e a
regra de excluir usuário devolve 409 com dependência (DEC-55). O vínculo entra e sai por
`PATCH .../members` com `{action:"add" | "remove"}`; não há `DELETE` nessa rota.

**Feito quando:** os quatro testes de recusa (status inválido, ponto insuficiente, usuário com
dependência, sem escopo) passam, e nenhuma operação dessa família é alcançável sem TLS.

### V7-10 — Rate limit e revisão de hardening

- Limite por credencial por minuto, no MCP, com 429.
- Revisar o que a `mcp_audit_log` grava e provar em teste que token e corpo de documento não
  aparecem nela.
- Confirmar que nenhuma rota fora do inventário recebeu `requireScope` por engano.
- `check:env` cobrindo `DQ_API_CREDENTIAL`.

**Feito quando:** exceder o limite devolve 429, grep de token no log não acha nada, e a
lista de rotas com `requireScope` bate com a §5.

### V7-11 — Fechamento

- Capítulo do documento técnico em `docs/src` cobrindo o MCP, o fluxo de credencial e o contrato
  da §7. `npm run docs:build` + `npm run docs:check`.
- **G6 não se aplica:** nenhuma tela muda neste plano. Registrar isso no STATE em vez de fingir
  recaptura.
- Estado `done`, última DEC registrada, `openQuestions` só com o que realmente ficou aberto.

## 5. Inventário de tools

Seis famílias (DEC-197), uma string de escopo por família. As rotas e métodos abaixo foram
medidos no `app/api/` em 2026-10-15 (104 rotas no total).

### `read` (V7-4, 16 tools)

| tool | rota | método |
|---|---|---|
| `people_list` | `/api/users` | GET |
| `person_get` | `/api/users/[id]` | GET |
| `leaderboard_get` | `/api/users/leaderboard` | GET |
| `project_list` | `/api/projects` | GET |
| `project_get` | `/api/projects/[id]` | GET |
| `project_stats` | `/api/projects/stats` | GET |
| `task_list` | `/api/tasks` | GET |
| `task_get` | `/api/tasks/[id]` | GET |
| `global_progress_get` | `/api/tasks/global-progress` | GET |
| `cronograma_get` | `/api/projects/[id]/cronograma` | GET |
| `deliverables_list` | `/api/projects/[id]/deliverables` | GET |
| `hours_get` | `/api/projects/[id]/hours` | GET |
| `work_sessions_list` | `/api/work-sessions` | GET |
| `weekly_report_list` | `/api/weekly-reports` | GET |
| `project_report_list` | `/api/project-reports` | GET |
| `notification_list` | `/api/notifications` | GET |

### `tasks` (V7-5, 10 tools)

Cuidado medido nesta família: **não existe rota de movimento**. `PUT /api/tasks/[id]` edita a
tarefa e é ele que carrega `{status}`; quem não tem `MANAGE_TASKS` só consegue editar exatamente
`{status, assignedTo}` por ali (`app/api/tasks/[id]/route.ts:13-15`). E `PATCH /api/tasks/[id]`
**não é movimento**, é conclusão: o corpo tem de ser `{action: "complete"}`, senão a rota responde
400 (`route.ts:94-95`).

| tool | rota | método / corpo |
|---|---|---|
| `task_create` | `/api/tasks` | POST |
| `task_update` | `/api/tasks/[id]` | PUT |
| `task_move` | `/api/tasks/[id]` | PUT `{status, assignedTo}` |
| `task_complete` | `/api/tasks/[id]` | PATCH `{action:"complete"}` |
| `task_delete` | `/api/tasks/[id]` | DELETE |
| `task_approve` | `/api/tasks/[id]/approve` | POST |
| `task_reject` | `/api/tasks/[id]/reject` | POST |
| `subtask_create` | `/api/tasks/[id]/subtasks` | POST |
| `subtask_update` | `/api/tasks/[id]/subtasks/[subtaskId]` | PATCH |
| `subtask_delete` | `/api/tasks/[id]/subtasks/[subtaskId]` | DELETE |

### `project` (V7-6, 8 tools)

| tool | rota | método |
|---|---|---|
| `project_create` | `/api/projects` | POST |
| `project_update` | `/api/projects/[id]` | PUT |
| `deliverable_create` | `/api/projects/[id]/deliverables` | POST |
| `deliverable_update` | `/api/projects/[id]/deliverables/[deliverableId]` | PUT |
| `activity_create` | `/api/projects/[id]/activities` | POST |
| `activity_update` | `/api/projects/[id]/activities/[activityId]` | PATCH |
| `activity_request_completion` | `/api/projects/[id]/activities/[activityId]/request-completion` | POST |
| `activity_approve_completion` | `/api/projects/[id]/activities/[activityId]/approve-completion` | POST |

### `hours` (V7-7, 7 tools)

| tool | rota | método / corpo |
|---|---|---|
| `session_start` | `/api/work-sessions` | POST |
| `session_update` | `/api/work-sessions/[id]` | PATCH |
| `session_delete` | `/api/work-sessions/[id]` | DELETE |
| `responsibility_pause` | `/api/responsibilities/[id]` | PATCH `{action:"pause"}` |
| `responsibility_resume` | `/api/responsibilities/[id]` | PATCH `{action:"resume"}` |
| `responsibility_end` | `/api/responsibilities/[id]` | PATCH `{action:"end"}` |
| `responsibility_update_notes` | `/api/responsibilities/[id]` | PATCH `{action:"updateNotes"}` |

### `documents` (V7-8, 8 tools)

| tool | rota | método |
|---|---|---|
| `technical_report_list` | `/api/projects/[id]/technical-reports` | GET |
| `technical_report_save` | `/api/projects/[id]/technical-reports` | PUT |
| `technical_report_draft` | `/api/projects/[id]/technical-reports/[segment]/draft` | POST |
| `technical_report_generate` | `/api/projects/[id]/technical-reports/[segment]/generate` | POST |
| `technical_report_download` | `/api/projects/[id]/technical-reports/[segment]/file` | GET |
| `certificate_list` | `/api/projects/[id]/certificates` | GET |
| `certificate_download` | `/api/projects/[id]/certificates/[certificateId]/file` | GET |
| `attachment_download` | `/api/projects/[id]/attachments/[attachmentId]/file` | GET |

### `people` (V7-9, 10 tools)

Cuidado medido nesta família: a rota de vínculo **não tem método DELETE**. As cinco ações passam
por `POST` ou `PATCH /api/projects/[id]/members` com `{action}`: `add`, `remove`, `set_roles`,
`set_leader`, `set_profile` (`app/api/projects/[id]/members/route.ts:78-133`). O `PATCH` exige
`action` explícita (`resolveAction` com `strictAction`); o `POST` mantém a compatibilidade legada
por forma do corpo.

| tool | rota | método / corpo |
|---|---|---|
| `person_create` | `/api/users` | POST |
| `person_update` | `/api/users/[id]` | PUT |
| `person_delete` | `/api/users/[id]` | DELETE |
| `person_set_status` | `/api/users/[id]/status` | PATCH |
| `person_set_roles` | `/api/users/[id]/roles` | PATCH |
| `person_set_points` | `/api/users/[id]/points` | PATCH |
| `person_approve` | `/api/users/approve` | POST |
| `member_add` | `/api/projects/[id]/members` | PATCH `{action:"add"}` |
| `member_set_profile` | `/api/projects/[id]/members` | PATCH `{action:"set_profile"}` |
| `member_remove` | `/api/projects/[id]/members` | PATCH `{action:"remove"}` |

**Total: 59 tools, sobre 39 rotas distintas** (uma rota com vários métodos serve várias tools, por
isso o escopo é aplicado por método, dentro do handler). Nenhuma tool corresponde a rota fora desta
lista sem decisão registrada. As duas tabelas acima com coluna `método / corpo` não são preciosismo:
foram os dois lugares onde a leitura inicial do inventário errou o contrato, e é exatamente por isso
que a V7-4 começa medindo a rota antes de escrever a tool.

## 6. Segurança

Controles que este plano põe, e por quê:

1. **Token em sha256 no banco**, nunca em texto claro, nunca em URL (a spec proíbe bearer em
   query string), nunca em log. O claro sai uma vez, no CLI.
2. **`audience` (DEC-199)**: o app só aceita `api`, o MCP só aceita `mcp`. É o que impede o
   passthrough que a spec proíbe e mantém o token do agente inútil fora do caminho dele.
3. **TTL, revogação e `lastUsedAt`** na credencial, com `revoke` no CLI.
4. **Checagem A3 a cada requisição**: conta suspensa/rejeitada/pendente perde acesso na hora,
   mesmo com token válido, do mesmo jeito que a sessão de cookie.
5. **`Origin` validado no servidor MCP** (exigência normativa da spec), 403 em origem estranha.
6. **Cabeçalhos da spec conferidos**: `MCP-Protocol-Version`, `Mcp-Method`, `Mcp-Name`.
7. **TLS no endpoint do MCP (DEC-194), com o salto MCP→app em aberto por decisão (DEC-201)**.
   A 8787 fica só na rede interna do compose e nenhum host externo entra nela, que é a condição
   que faz o salto em claro ser aceitável.
8. **Escopo por família**, aplicado no app com `requireScope`, não só no MCP: se a credencial
   vazar, o dano fica limitado ao que ela tem.
9. **`mcp_audit_log`** por chamada, com campos de cabeçalho e status, sem corpo e sem token.
10. **Container sem banco**: o G0 proíbe `mcp/` de importar `backend/` ou Prisma, e o compose não
    passa `DATABASE_URL` para o serviço do MCP.
11. **Rate limit por credencial** (V7-10).
12. **`stdio` sem endpoint de entrada**: credencial só no ambiente do processo, o que é
    exatamente o que a spec prescreve para esse transporte.

O que **não** está aqui: tela de administração de credencial (fora por DEC-192), token rotativo,
mTLS, e SSO. Os três primeiros entram se o uso pedir; o quarto é a §7.

## 7. Contrato com o IdP futuro

O dono não decidiu o IdP (ASK-V7-06) e o plano não escolhe um. O que fica fixo é o que o
DisplayQuest exige de **qualquer** um deles. Quando o IdP aparecer, só o emissor muda.

**Autenticação é do IdP. Autorização continua sendo do DisplayQuest.** Quem chega validado ainda
passa pela ACL local: `users.roles`, `users.status` e a porta `requireScope`. Nenhum papel vindo
de fora entra sem passar por `normalizeRoles` daqui.

Requisitos mínimos que o MCP e a V7-1 vão esperar:

| # | Requisito | Onde a spec exige |
|---|---|---|
| 1 | Documento de descoberta por OIDC Discovery ou RFC 8414, alcançável por HTTPS | §1.2 |
| 2 | Endpoint de token | OAuth 2.1 |
| 3 | `iss` presente e confiável no token | RFC 9207 |
| 4 | `aud` batendo com o recurso do MCP | RFC 8707, obrigatório |
| 5 | `sub` estável, mapeável para `users.id` (por e-mail ou coluna `sub` nova) | nossa necessidade |
| 6 | `scope` cobrindo as seis strings da §5 | §1.2 |
| 7 | `exp`, `iat` e `jti` | OAuth 2.1 |
| 8 | Registro de cliente por CIMD (DCR está deprecado) ou pré-cadastro | §1.2 |
| 9 | Metadado de recurso publicado no MCP | RFC 9728 |

Formas que já cabem no contrato: **EMA** (estável), quando a coordenação conduz o acesso e a
pessoa por trás do token é declarada pelo IdP; **Client Credentials** (rascunho), quando existe
um serviço sem pessoa na frente e o mapeamento de `sub` para usuário passa a ser um cadastro
explícito. As duas são plugáveis: mudam quem emite, não mudam como o DisplayQuest valida.

O LDAP isolado **não** resolve: LDAP não emite access token nem publica discovery de AS. Ele
precisa de um IdP OIDC na frente (Keycloak com federação LDAP, Dex ou Authentik). Isso entra
aqui como nota, não como escolha.

## 8. Gates

- **G0** `npm run arch:check`, allow-list vazia. Regra nova: `mcp/` não importa `backend/` nem
  Prisma (V7-0).
- **G1** `npm run lint`. Em worktree: `npx eslint --no-eslintrc --config .eslintrc.json <arquivos>`.
- **G2** `npx tsc --noEmit`, **zero**. A dívida que existia em
  `features/laboratorio/__tests__/floating-timer-tabs.test.tsx:105` foi consertada no lote SUB-1 do
  plan-v4 (2026-10-15), então o gate voltou ao original: nenhuma onda pode deixar `tsc` com erro.
- **G3** `npx vitest run`, zero failure e nunca abaixo de **157 arquivos / 2143 testes**
  (unit + features; 140/1999 só `tests/unit`). O `mcp/` fica fora do `include` do projeto `unit`
  (que é `tests/unit/**`, `features/**/__tests__/**`, `entities/**`), então os testes do MCP vivem
  em `tests/unit/mcp/` para rodarem sem mexer no `vitest.config.mts`.
- **G4** roundtrips Prisma só no banco de teste `dq-dev-test-db` na 5433. Aplica à V7-1, que é a
  única onda que toca schema.
- **G5** `docs:build` + `docs:check`, em V7-11.
- **G6** **não se aplica**: nenhuma tela muda. Registrar no STATE.

## 9. Rollback

- Um commit por onda. Reverter a onda inteira é `git revert` do commit dela.
- A migration da V7-1 é aditiva (dois `model` novos) e não mexe em coluna existente. O rollback
  é `prisma migrate deploy` da migration inversa, e **nunca** `prisma migrate dev`.
- O container do MCP é apagado removendo o serviço do compose. O app continua no ar em qualquer
  ponto do plano: ele só ganha um ramo de autenticação que, sem cabeçalho, é o caminho de sempre.
- **Nunca `docker compose down`.** Deploy é `docker compose up --build`.

## 10. Riscos conhecidos

1. **`headers()` de `next/headers` nunca foi usado no repositório.** Se não devolver o
   `Authorization` no route handler, o fallback toca até 39 rotas. É a primeira tarefa da V7-1 e
   é a coisa mais provável de derrubar a onda.
2. **A spec endureceu cabeçalhos.** `Mcp-Method`/`Mcp-Name` fora do proxy funcionam e dentro de
   um proxy mal configurado somem. Só aparece em produção, por isso o teste de atravessamento da
   V7-3 não é opcional.
3. **Escopo aplicado só no MCP não protege nada.** Se `requireScope` ficar de fora de uma rota do
   inventário, a credencial vazada tem acesso total daquela pessoa. A V7-10 confere a lista.
4. **Rebuild do app é caro** (>25 min, `next build`). Todo trabalho daqui vive no `mcp/` e nas
   rotas pontuais, então não deve haver rebuild de imagem a cada onda.
5. **Falhas de e2e do quadro não são deste plano.** O 3º teste do spec é serial e quebra por dado
   legítimo da instância; `git stash` confirma sempre.
6. **ASN/IdP decididos depois mudam a V7-2?** Não: as tools não sabem quem emite. O que muda é
   a origem do token.
7. **Auditoria só em tabela** pode ficar invisível. Se o dono quiser ver, é uma consulta SQL
   pronta, não uma tela nova (DEC-196).
8. **O salto MCP→app em claro é aceito por decisão (DEC-201), não ignorado.** A credencial
   `mcp` trafega em texto puro dentro da rede do compose. O que torna aceitável é a 8787 sair da
   rede pública do compose e nenhum host externo entrar nela. Se um dia o app ganhar porta exposta
   ou a rede do compose receber host de fora, essa decisão tem que ser revista antes de qualquer
   outra coisa.
9. **Base64 de arquivo grande não cabe num contexto de agent.** O `blob-store` do V5 aceita até
   20 MB de PDF (DEC-131) e base64 infla ~33%, ou seja ~27 MB numa resposta só. Por isso a
   DEC-202 vem com teto de tamanho medido na V7-8; sem o teto, o primeiro anexo grande vira um
   `resources/read` que ninguém consegue ler.

## 11. Regras de numeração

- Decisões: **DEC-190..203 neste plano. Próxima livre: DEC-204.** Antes de abrir uma nova, grep
  nos **seis** `STATE.json` (clean-arch, plan-v3, plan-v4, plan-v5, plan-v6, plan-v7). A regra já
  valeu uma vez: a DEC-189 foi parar no plan-v4 (SUB-1) enquanto este plano já a reivindicava.
- Perguntas: **ASK-V7-01..15, todas respondidas**, gravadas na §2.1. Duas receberam resposta
  "ainda não definido" (ASK-V7-01 quem executa o agent, ASK-V7-06 qual IdP) e não travam onda
  nenhuma: a primeira está coberta pelo duplo transporte da DEC-195 e a segunda pelo contrato da §7.
- Ondas: **V7-0..V7-11.** Lote de execução numerado `V7-<onda>`.

## 12. Como executar

```bash
# 1. ver a onda atual
cat displayquest-v2/plan-v7/STATE.json | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const s=JSON.parse(d);console.log(s.status,s.activeWave)})"

# 2. implementar a onda (agente build), um commit: v7:<onda>

# 3. gates técnicos
npm run arch:check
npm run lint
npx tsc --noEmit
npx vitest run

# 4. G4 só para a V7-1, no banco de teste
docker start dq-dev-test-db
export DATABASE_URL="postgresql://dq_dev:dq_dev_local_only@127.0.0.1:5433/dq_dev_test"
npx vitest run tests/integration

# 5. deploy, quando houver mudança de imagem
docker compose up --build
```

## 13. Entregáveis

- Servidor MCP em container próprio, `stdio` + Streamable HTTP, 59 tools nas seis famílias.
- Credencial delegada com emissão, revogação e escopo por CLI.
- Tabela de auditoria consultável.
- TLS no endpoint do MCP.
- Documento do capítulo do MCP em `docs/src`.
- Contrato do IdP escrito e estável, para quando o dono escolher um.

## 14. Perguntas abertas

**Nenhuma.** As quatro que ainda estavam aqui foram respondidas pelo dono em 2026-10-15 e viraram
decisão na §2.1:

| ASK | Resposta do dono | Decisão |
|---|---|---|
| ASK-V7-12 | certificado real, emitido para um nome interno | DEC-200 |
| ASK-V7-13 | não, TLS só no endpoint do MCP | DEC-201 |
| ASK-V7-14 | um único agent, fazendo tudo | DEC-203 |
| ASK-V7-15 | base64 em `resources/read` | DEC-202 |

O que segue indefinido sem travar onda nenhuma: quem executa o agent (ASK-V7-01, coberto pelo
duplo transporte da DEC-195, já que os dois caminhos continuam implementados) e qual IdP/LDAP
(ASK-V7-06, contrato plugável da §7, cuja escolha é decisão futura).
