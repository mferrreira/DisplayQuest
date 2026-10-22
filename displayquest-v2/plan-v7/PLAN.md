# plan-v7: MCP de validação para o agente consumidor

> Revisão de 2026-10-21. A fase de validação mudou o recorte do plano: primeiro um MCP
> que funciona na LAN, com conta de serviço e sem autenticação de cliente; depois a
> credencial local, o TLS e a internet.
>
> O plano nasceu em 2026-10-15 com 59 tools e uma camada de credencial delegada no
> DisplayQuest. A fase de validação não precisa dessa camada e não muda o backend. O que
> o consumidor precisa agora é de um endpoint que responda, tools previsíveis e um
> contrato escrito. O resto fica na fase 2.
>
> Nada foi executado. O `STATE.json` diz `ready`; a primeira onda é V7-0.

- [STATE.json](./STATE.json): estado, decisões, ondas, baseline e perguntas.
- Números medidos em 2026-10-21, salvo indicação contrária.
- Decisões deste plano: DEC-190..210. A DEC-204 é do plan-v6; a próxima livre é DEC-211.

## 1. Objetivo

### 1.1 Fase de validação

Entregar um servidor MCP que o agente do outro projeto consegue usar na rede local para:

1. criar e configurar projetos em linguagem natural (a interpretação fica no agente; o MCP
   expõe operações estruturadas);
2. acompanhar projetos individualmente — tarefas, cronograma, membros, horas e andamento;
3. analisar desempenho e engajamento dos membros;
4. consultar horários e horas trabalhadas;
5. gerar e ler relatórios semanais e técnicos.

O consumidor recebe dois artefatos: `mcp/tools.json` e `mcp/README.md`. O primeiro é o
contrato de máquina; o segundo é o guia de conexão, parâmetros, exemplos, erros e
limitações.

### 1.2 Fora da fase de validação

- Autenticação do consumidor no endpoint do MCP. Nesta fase o endpoint é aberto na LAN.
- TLS, internet, túnel, VPN e rate limit.
- Credencial delegada no DisplayQuest (`api_credentials`, `mcp_audit_log`, CLI).
- Tools de escrita de tarefa, subtask, membro, usuário, ponto, compra, aviso, issue,
  sessão de trabalho, anexo, atestado e relatório de projeto.
- `stdio`. O transporte é Streamable HTTP.

Esses itens ficam na fase 2 (§11). A ordem não é uma promessa de que tudo será feito; é o
backlog mínimo para tirar o MCP da rede local.

## 2. O que foi medido

### 2.1 A conta de serviço já existe

O dono criou a conta em 2026-10-21:

| Campo | Valor |
|---|---|
| E-mail | `mcp-agent@displayquest.local` |
| Senha | `DQ_AGENT_PASSWORD`, só no `.env` (gitignored); nunca no git, no log ou no contrato |
| ID | `1099` |
| Nome | `Diego` |
| Papel | `COORDENADOR` |
| Status | `active` |

`COORDENADOR` tem `MANAGE_USERS`, `MANAGE_PROJECTS`, `MANAGE_TASKS`, `MANAGE_WORK_SESSIONS`
e as permissões de leitura. É uma conta poderosa; o que reduz o risco é a superfície de
tools, não o papel. Nenhuma tool desta fase cria usuário, muda papel, apaga projeto ou
altera pontos.

### 2.2 O login NextAuth funciona de dentro do container

Medido em 2026-10-21, do host e de dentro do container `display-quest`:

| Passo | Resultado |
|---|---|
| `GET http://app:3000/api/auth/csrf` | 200, `{csrfToken}` e cookie `next-auth.csrf-token` |
| `POST http://app:3000/api/auth/callback/credentials` | 200, cookie `next-auth.session-token` |
| `GET http://app:3000/api/users` com o cookie | 200 |

O `NEXTAUTH_URL=http://localhost:3000` do compose **não bloqueou** o login server-to-server.
O NextAuth grava o cookie para o host da requisição; o MCP fala com `app:3000` e devolve o
cookie nas chamadas seguintes. Não há redirect de navegador no caminho.

A sessão é JWT e dura 48 h (`SESSION_MAX_AGE` em `lib/auth/config.ts`). O session callback
renova o `iat` a cada leitura, então a janela desliza enquanto o MCP usa a sessão. Mesmo
assim, o cliente precisa tratar 401: cookie vencido, processo reiniciado, senha trocada ou
usuário suspenso.

### 2.3 O backend não precisa mudar

Todas as 25 tools da fase 1 mapeiam para rotas que já existem. O inventário inclui as rotas
que faltavam no plano original:

- `GET /api/users/statistics`
- `GET /api/weekly-hours-history`
- `GET /api/laboratory-schedule`
- `POST /api/weekly-reports/generate`
- `POST /api/weekly-reports/bulk`

Não há migration, schema, rota, guarda ou permissão nova. O MCP é um pacote separado e um
serviço separado no compose.

### 2.4 Baseline do repositório

Medido em 2026-10-21 na `dev`, com as mudanças locais não commitadas do dono:

| Gate | Medida |
|---|---|
| G0 `arch:check` | 1078 módulos / 4608 dependências, allow-list vazia |
| G1 `lint` | exit 0, sem erro (warnings antigos) |
| G2 `tsc --noEmit` | 0 |
| G3 `tests/unit` + `features` | 188 arquivos / 2283 testes |
| G3 suíte completa | 204 arquivos / 2414 testes |
| e2e | fora do escopo; nenhuma tela muda |

O V7-0 re-mede e grava o número do commit em que a fase começou. Se o baseline subir por
trabalho alheio, o gate acompanha; se descer, é regressão deste plano.

## 3. Decisões

A numeração é global. Antes de abrir decisão nova, `grep` os seis `STATE.json`
(clean-arch, plan-v3, plan-v4, plan-v5, plan-v6, plan-v7).

| ID | Decisão | Fase |
|---|---|---|
| DEC-190 | O MCP é um serviço novo em container próprio, fala com as rotas HTTP existentes e não importa `backend/`, Prisma nem `@prisma/client`. | 1 |
| DEC-191 | O ator chega ao use case como `userActor(roles)`, nunca `systemActor`. | 1 |
| DEC-192 | O DisplayQuest ganha `api_credentials`, emitida e revogada por CLI, sem tela. | 2 |
| DEC-193 | Uma credencial de API por instância de agente, com escopo sob medida. | 2 |
| DEC-194 | TLS no endpoint do MCP. | 2 (adiada por DEC-207) |
| DEC-195 | Transporte duplo: Streamable HTTP remoto e `stdio` local. | 1 (o `stdio` sai por DEC-209) |
| DEC-196 | Auditoria em `mcp_audit_log`, consultável por SQL, sem tela. | 2 |
| DEC-197 | As seis famílias de capacidade entram no plano (`read`, `tasks`, `project`, `hours`, `documents`, `people`). | 2 (a fase 1 cobre parte de read/project/hours/documents) |
| DEC-198 | O endpoint publica `/.well-known/oauth-protected-resource` (RFC 9728) quando houver auth. | 2 |
| DEC-199 | A audiência separa o token do app do token do MCP; o MCP não repassa o token recebido ao upstream. | 2 |
| DEC-200 | Certificado real para nome interno, fora da imagem. | 2 |
| DEC-201 | TLS só no endpoint do MCP; o salto MCP→app continua HTTP dentro do compose. | 2 |
| DEC-202 | DOCX/PDF saem por `resources/read` como `blob` base64, não por URL. | 1 |
| DEC-203 | Um único agente, com as seis famílias na mesma credencial. | 2 |
| **DEC-205** | **A conta de serviço é `mcp-agent@displayquest.local`, papel `COORDENADOR`, status `active` (id 1099).** | 1 |
| **DEC-206** | **O MCP autentica no NextAuth com e-mail e senha do ambiente, guarda o cookie em memória e refaz o login em 401.** | 1 |
| **DEC-207** | **Na fase 1 o endpoint não autentica o consumidor; fica restrito à LAN e a HTTP. Autenticação de cliente e TLS são fase 2.** | 1 |
| **DEC-208** | **O contrato do consumidor é `tools.json` gerado do mesmo schema do servidor + `README.md` escrito à mão, cobrindo conexão, tools, parâmetros, exemplos, erros e limitações.** | 1 |
| **DEC-209** | **A fase 1 expõe 25 tools: 15 de leitura/análise e 10 de escrita controlada. O transporte é só Streamable HTTP. O restante do inventário de 59 fica para a fase 2.** | 1 |
| **DEC-210** | **Escrita na fase 1 só em projeto de areia e relatórios; o backend não é alterado. Se uma tool exigir rota nova, a onda para e vira pergunta.** | 1 |

DEC-207 adia DEC-194/200/201 para a fase 2. DEC-209 substitui o `stdio` da DEC-195 e reduz
a superfície da DEC-197 a 25 tools na fase 1. DEC-205/206 são o caminho de identidade da
fase 1, sem tocar DEC-192/193/203.

### 3.1 Perguntas respondidas

| ID | Pergunta | Resposta | Decisão |
|---|---|---|---|
| ASK-V7-16 | Onde o consumidor conecta? | LAN agora; internet no futuro. | DEC-207 |
| ASK-V7-17 | HTTP ou HTTPS? | HTTP na fase 1. | DEC-207 |
| ASK-V7-18 | Quem é o ator? | Conta de serviço `COORDENADOR`. | DEC-205 |
| ASK-V7-19 | Pode escrever? | Sim, em projeto de areia e relatórios. | DEC-210 |
| ASK-V7-20 | Pode mudar o backend? | Não na fase 1. | DEC-210 |
| ASK-V7-21 | Quais métricas? | Todas as disponíveis nas rotas de leitura. | DEC-208 |
| ASK-V7-22 | Quais relatórios? | Semanais e técnicos na fase 1; de projeto na fase 2. | DEC-209 |
| ASK-V7-23 | Onde fica a linguagem natural? | No agente consumidor; o MCP expõe tools estruturadas. | DEC-208 |
| ASK-V7-24 | Quais artefatos? | `tools.json` e `README.md`. | DEC-208 |
| ASK-V7-25 | Autenticação definitiva? | Local, não IdP/LDAP. | DEC-192 |

## 4. Ondas

| Onda | Entrega | Depende de | Gate |
|---|---|---|---|
| V7-0 | Contrato, conta, baseline e regra do G0 | — | STATE válido, README indexado, `arch:check` verde |
| V7-1 | Container, login NextAuth, transporte e uma tool | V7-0 | `tools/list` 200, `project_list` 200, login provado |
| V7-2 | 15 tools de leitura e análise | V7-1 | cada tool com caminho feliz, 401 e 403 |
| V7-3 | 10 tools de escrita controlada | V7-2 | projeto de areia criado, configurado e relatado |
| V7-4 | Testes, `tools.json` e `README.md` | V7-3 | contrato e smoke verdes |
| V7-5 | Exposição na LAN e validação do consumidor | V7-4 | consumidor conecta, lista e executa; feedback registrado |

Regras de execução:

1. Um commit por onda. O commit diz o que mudou e como foi medido.
2. Nenhuma onda da fase 1 edita `app/`, `backend/`, `prisma/`, `components/` ou `features/`.
3. Toda escrita roda no projeto `[MCP-VALIDACAO]`, criado pela V7-3. Não tocar em projeto
   existente, usuário existente, ponto, compra ou permissão.
4. Nenhum segredo em git, log, `tools.json`, README ou mensagem de erro.
5. O gate completo roda antes de cada commit: G0, G1, G2, G3 e o gate do MCP.
6. `docker compose down` não é usado. O app, o banco e o bucket continuam no ar.
7. Se uma tool precisar de rota nova, parar e registrar a pergunta. Não criar rota no
   backend para salvar a fase 1.

## 5. Etapas detalhadas

### V7-0 — contrato, conta e baseline

1. Re-medir G0–G3 no commit de partida e gravar em `STATE.json`.
2. Confirmar a conta de serviço com um login descartável e registrar apenas o resultado
   (nunca o cookie).
3. Criar `mcp/tools.json` vazio com o formato final e `mcp/README.md` com o esqueleto.
4. Indexar o plan-v7 em `displayquest-v2/README.md`.
5. Gravar a regra do G0: nada em `mcp/` importa `backend/`, `prisma` ou
   `@prisma/client`; o MCP só fala HTTP.
6. Escolher a porta 8787 e o bind. O default do compose é `127.0.0.1`; para a LAN, o dono
   define `MCP_BIND_IP` com o IP da interface ou `0.0.0.0`.

**Pronto quando:** o `STATE.json` tem baseline, decisões e ondas; o README aponta para o
plano; a regra do G0 passa; o login da conta foi provado sem vazar segredo.

### V7-1 — container, login e transporte

1. Criar `mcp/` como pacote próprio:
   - `package.json` com `"type": "module"` e `engines.node >=20`;
   - `@modelcontextprotocol/server@2.3.1`, `@modelcontextprotocol/node@2.1.1` e `zod@^4`;
   - `@modelcontextprotocol/client@2.3.1` como dependência de teste;
   - lockfile próprio. Não usar o `zod 3.24.1` da raiz.
2. Antes de escrever o handler, conferir a API exata do middleware HTTP no README do
   pacote instalado. O plano fixa o comportamento, não nomes de função inventados.
3. Implementar o cliente do DisplayQuest:
   - `GET /api/auth/csrf` com jar de cookies;
   - `POST /api/auth/callback/credentials` com `csrfToken`, `email`, `password`,
     `callbackUrl` e `json=true`;
   - guardar `next-auth.csrf-token`, `next-auth.callback-url` e
     `next-auth.session-token` em memória;
   - validar a sessão com `GET /api/auth/session`;
   - refazer o login uma vez em 401, com single-flight para não disparar N logins;
   - renovar proativamente depois de 24 h;
   - não persistir cookie em disco.
4. Implementar `dqFetch` com caminho fixo por tool, timeout de 15 s (30 s para binário),
   `Accept: application/json` e tradução de erro do upstream.
5. Subir o servidor:
   - `POST /mcp` com JSON-RPC;
   - `GET` e `DELETE` em `/mcp` → 405 com `Allow: POST`;
   - `GET /healthz` → `{status, upstream, version}` sem segredo;
   - `MCP-Protocol-Version` validado quando presente; versão explícita não suportada →
     400 `UnsupportedProtocolVersionError`;
   - `Mcp-Method` obrigatório; `Mcp-Name` obrigatório em `tools/call` e `resources/read`;
   - `Origin` ausente é aceito; `Origin` presente e estranho → 403;
   - `Mcp-Session-Id` é ignorado, não emitido e não exigido.
6. Expor `tools/list` e uma única tool: `project_list`.
7. Empacotar:
   - `mcp/Dockerfile` em `node:20-alpine`, multi-stage, usuário não-root;
   - serviço `mcp` / container `display-quest-mcp` no compose;
   - `depends_on: app` com healthcheck;
   - envs `DQ_API_BASE=http://app:3000`, `DQ_AGENT_EMAIL`, `DQ_AGENT_PASSWORD`,
     `MCP_PORT=8787`, `MCP_BIND_IP`, `DQ_ALLOWED_ORIGINS` opcional;
   - sem `DATABASE_URL`, sem `S3_*`, sem `NEXTAUTH_SECRET`;
   - healthcheck em `http://127.0.0.1:8787/healthz`;
   - `restart: unless-stopped`; sem volume.

**Pronto quando:** o container sobe, `tools/list` responde, `project_list` devolve os
projetos, um 401 simulado refaz o login e o log não mostra senha nem cookie.

### V7-2 — leitura e análise

Implementar as 15 tools de leitura (§6.2). Cada uma:

1. valida entrada com Zod v4 e recusa id inválido antes de chamar o upstream;
2. chama a rota fixa e mapeia a resposta para `structuredContent`;
3. devolve `content` textual curto para o agente e o JSON completo em
   `structuredContent`;
4. em erro do upstream, devolve `isError: true` com `{status, code, message}` e não
   derruba o processo.

As duas tools compostas (`project_overview` e `member_performance`) chamam as rotas
existentes em paralelo e devolvem `warnings` quando uma seção falha. Elas não recalculam
regra de negócio; agregam leitura.

**Pronto quando:** as 15 respondem no projeto de areia recém-criado, com dados reais; 401
de cookie vencido refaz o login; 403 de permissão não refaz e vira erro de tool.

### V7-3 — escrita controlada

Implementar as 10 tools de escrita (§6.3). O projeto de areia nasce aqui:

1. `project_create` com nome `[MCP-VALIDACAO] <data> <hora>`. Quem cria vira
   `GERENTE_PROJETO` do projeto (medido em `create-project.use-case.ts`), então a conta de
   serviço gerencia o projeto de areia sem depender de ser o líder.
2. Preencher descrição, datas, edital, processo, PROPPI, líder e dois membros de teste
   (quando o dono indicar os IDs; não criar usuário).
3. Criar entregáveis e duas atividades no cronograma.
4. Gerar um relatório semanal e um técnico de teste.
5. Apagar o projeto de areia é **fase 2**: não existe tool de delete. Se o dono quiser
   limpar, apaga pela interface.

Regras de escrita:

- `project_update` não escreve `points` (a rota não aceita).
- `activity_update` não muda `status` (conclusão é fluxo de duas fases, fora da fase 1).
- `technical_report_generate` devolve 503 se o bucket não estiver configurado; o MCP
  propaga a mensagem sem inventar arquivo.
- Toda escrita é idempotente o bastante para repetir sem duplicar: relatório semanal é
  upsert; relatório técnico é um por projeto × tipo; projeto de areia é identificado pelo
  prefixo.

**Pronto quando:** o projeto de areia existe com cronograma, tarefas de leitura, horas e
dois relatórios; o consumidor consegue fazer o mesmo caminho pelas tools.

### V7-4 — testes e contrato

1. Testes unitários em `mcp/tests/` (projeto próprio) para:
   - parse de cookie e múltiplos `Set-Cookie`;
   - login, 401, single-flight, expiração e senha errada;
   - validação de `Mcp-Method`/`Mcp-Name`/`Origin`/versão;
   - cada tool: caminho feliz, 400 local, 401 do upstream, 403 do upstream, 404.
2. Teste de contrato com `@modelcontextprotocol/client`:
   - `tools/list` bate com `mcp/tools.json`;
   - cada tool aceita o exemplo mínimo do README;
   - `resources/read` do DOCX devolve `blob` base64 e content-type.
3. Script `npm --prefix mcp run tools:json` gera `tools.json` do mesmo schema do servidor.
   Teste falha se o arquivo commitado divergir.
4. `README.md` com:
   - URL, headers, exemplo `curl` e exemplo de conversa do cliente;
   - tabela de tools com parâmetros, retorno e erros;
   - recursos;
   - limites: sem auth de cliente, HTTP, LAN, 25 tools, português nos dados;
   - como rotacionar a senha e reiniciar o container.
5. Smoke script que sobe o MCP contra o app real e executa o caminho de leitura e o de
   escrita no projeto de areia. Não roda no CI sem app; roda no V7-5.

**Pronto quando:** `tools.json` é reproduzível, o teste de contrato passa, o README permite
um terceiro conectar sem ler o código.

### V7-5 — exposição e validação

1. Subir com `MCP_BIND_IP` no IP da LAN e confirmar que a porta não está aberta na
   internet.
2. Entregar ao consumidor:
   - URL `http://<ip-da-lan>:8787/mcp`;
   - `mcp/tools.json`;
   - `mcp/README.md`;
   - projeto de areia como alvo.
3. Acompanhar a primeira sessão do consumidor e registrar:
   - tools que falharam e por quê;
   - parâmetros ambíguos;
   - respostas grandes demais;
   - erros de autenticação;
   - tempo de resposta.
4. Corrigir só o que impede a validação. Melhoria de tool nova é fase 2.
5. Ao fim, parar o container ou manter na LAN conforme decisão do dono. Rotacionar a senha
   da conta de serviço.

**Pronto quando:** o consumidor conecta, lista as tools, executa o caminho de leitura e o
de escrita no projeto de areia, e o feedback está registrado no `STATE.json`.

## 6. Inventário de tools

São 25 tools. Todas mapeiam para rotas existentes. O nome é estável; o consumidor programa
contra ele.

### 6.1 Convenções

- IDs são inteiros positivos.
- Datas civis são `YYYY-MM-DD`; meses do cronograma são `YYYY-MM`.
- Toda resposta de sucesso tem `structuredContent`. Toda falha de tool tem
  `isError: true` e `structuredContent: {status, code, message}`.
- Nenhuma tool aceita caminho arbitrário, URL ou método HTTP. O caminho é fixo no código.
- Nenhuma tool devolve cookie, senha, CPF ou token.
- Tools de leitura são `readOnlyHint: true`. Tools de escrita são `readOnlyHint: false`,
  `destructiveHint: false`.

### 6.2 Leitura e análise (15)

| Tool | Rota | Parâmetros | Retorno |
|---|---|---|---|
| `people_list` | `GET /api/users` | nenhum | usuários com id, nome, e-mail, papéis, status, avatar, capa e meta semanal. Sem CPF. |
| `people_statistics` | `GET /api/users/statistics` | `type?` | contagens e estatísticas de usuários. Exige `MANAGE_USERS`. |
| `leaderboard_get` | `GET /api/users/leaderboard` | `type?: "points"\|"tasks"` (default `points`), `limit?` | ranking. |
| `project_list` | `GET /api/projects` | nenhum | todos os projetos visíveis ao autenticado. |
| `project_get` | `GET /api/projects/[id]` | `projectId` | registro do projeto. |
| `project_overview` | composta | `projectId`, `sections?` | projeto + membros + entregáveis + atividades + tarefas + horas + relatórios técnicos + estatísticas. Seções opcionais: `members`, `deliverables`, `activities`, `tasks`, `hours`, `technicalReports`, `stats`. Falha parcial vira `warnings`. |
| `member_performance` | composta | `projectId?`, `userId`, `weekStart?`, `weekEnd?` | pessoa, tarefas concluídas, pontos, horas, sessões e posição no ranking. Devolve dados crus + contagens simples; a interpretação fica no agente. |
| `task_list` | `GET /api/tasks` | `projectId?` | tarefas visíveis ao ator, com subtasks quando a autoridade permite. |
| `global_progress_get` | `GET /api/tasks/global-progress` | nenhum | progresso global das tarefas. Exige `MANAGE_USERS`. |
| `hours_get` | `GET /api/projects/[id]/hours` | `projectId`, `weekStart?`, `weekEnd?` | horas agregadas do projeto. |
| `work_sessions_list` | `GET /api/work-sessions` | `userId?`, `projectId?`, `status?: "active"\|"paused"\|"completed"`, `active?` | sessões de trabalho no escopo do ator. |
| `weekly_hours_history_get` | `GET /api/weekly-hours-history` | `weekStart?`, `userId?`, `stats?` | histórico semanal ou estatísticas quando `stats=true`. |
| `laboratory_schedule_get` | `GET /api/laboratory-schedule` | nenhum | horários do laboratório. |
| `weekly_report_list` | `GET /api/weekly-reports` | `userId?`, `weekStart?`, `weekEnd?` | relatórios semanais. |
| `technical_report_list` | `GET /api/projects/[id]/technical-reports` | `projectId` | relatórios técnicos do projeto (um por tipo). |

Notas medidas:

- `people_list` não devolve CPF. O CPF tem rota própria (`/api/users/[id]/profile`) e
  autoridade própria; não entra na fase 1.
- `task_list` pode devolver `subtasks: []` para quem não é dono nem gestão da mãe. Isso é
  a regra DEC-189 funcionando, não erro.
- `work_sessions_list` decide escopo pelo ator: gestor vê todos, usuário comum vê os
  próprios. O MCP não amplia isso.
- `weekly_hours_history_get` com `stats=true` chama a mesma rota e devolve o bloco
  `stats`.
- `member_performance` usa `weekStart`/`weekEnd` para horas e relatórios; as rotas de
  sessão e de tarefa não aceitam filtro de data, então o recorte temporal só vale para a
  parte de horas. O README diz isso para o agente não inferir o que a tool não mede.

### 6.3 Escrita controlada (10)

| Tool | Rota | Parâmetros | Efeito |
|---|---|---|---|
| `project_create` | `POST /api/projects` | `name` obrigatório; `description`, `status`, `leaderId`, `links[{label,url}]`, `startDate`, `endDate`, `editalNumber`, `processNumber`, `proppiNumber`, `volunteerIds[]`, `cronograma.goals[{description,target?}]`, `cronograma.activities[{description,firstMonth,lastMonth,responsibleId?}]` | cria projeto e, opcionalmente, cronograma. |
| `project_update` | `PUT /api/projects/[id]` | `projectId` + os mesmos campos, parciais | atualiza o projeto. `points` não é aceito. |
| `deliverable_create` | `POST /api/projects/[id]/deliverables` | `projectId`, `name`, `quantity` | cria entregável. |
| `activity_create` | `POST /api/projects/[id]/activities` | `projectId`, `description`, `firstMonth`, `lastMonth`, `responsibleId?` | cria linha do cronograma. |
| `activity_update` | `PATCH /api/projects/[id]/activities/[activityId]` | `projectId`, `activityId`, `description?`, `firstMonth?`, `lastMonth?`, `responsibleId?` | atualiza a linha. Não muda status. |
| `weekly_report_generate` | `POST /api/weekly-reports/generate` | `userId`, `weekStart`, `weekEnd` | gera/atualiza o relatório da pessoa na semana. |
| `weekly_report_bulk_generate` | `POST /api/weekly-reports/bulk` | `periodType: weekly\|biweekly\|monthly\|semiannual\|annual`, `from`, `to` | gera para todos os usuários ativos no período. |
| `technical_report_save` | `PUT /api/projects/[id]/technical-reports` | `projectId`, `type: parcial\|tecnico-final\|final`, `content` | salva o texto único do projeto × tipo. |
| `technical_report_generate` | `POST /api/projects/[id]/technical-reports/[segment]/generate` | `projectId`, `type` | gera um DOCX por membro ativo no bucket. 503 sem bucket. |
| `technical_report_draft` | `POST /api/projects/[id]/technical-reports/[segment]/draft` | `projectId`, `type` | devolve rascunho de IA. 502 se a IA estiver fora. Não salva. |

Notas:

- `weekly_report_bulk_generate` é a única tool que escreve para todos os usuários ativos.
  Rodar só no projeto de areia e com período curto (uma semana). É o ponto mais sensível da
  fase 1.
- `technical_report_generate` grava no bucket. O download é por `resources/read`, não por
  tool.
- `project_update` não aceita `points`, `logoKey` nem `bannerKey`. Imagem de projeto é fase 2.
- Nenhuma tool apaga. Não há `project_delete`, `activity_delete` ou `deliverable_delete` na
  fase 1.

### 6.4 Recursos (1 template)

| URI | Leitura | Retorno |
|---|---|---|
| `dq://projects/{projectId}/technical-reports/{reportId}/file?userId={userId}` | `resources/read` | DOCX como `blob` base64, com `mimeType` e nome do arquivo. |

O `reportId` e o `userId` saem de `technical_report_list` e de `project_overview.members`.
Não há recurso de arquivo arbitrário nem de anexo nesta fase.

## 7. Contrato do consumidor

### 7.1 `tools.json`

Gerado do schema do servidor, não escrito à mão. Formato:

```json
{
  "name": "displayquest-mcp",
  "version": "0.1.0",
  "protocolVersion": "2026-07-28",
  "endpoint": "http://<host>:8787/mcp",
  "transport": "streamable-http",
  "clientAuth": { "mode": "none", "scope": "LAN only" },
  "tools": [
    {
      "name": "project_overview",
      "title": "Visão geral do projeto",
      "description": "Projeto, membros, cronograma, tarefas, horas e relatórios em uma chamada.",
      "inputSchema": { "type": "object", "properties": {}, "required": [] },
      "annotations": { "readOnlyHint": true, "destructiveHint": false },
      "returns": "structuredContent com seções e warnings",
      "errors": [400, 401, 403, 404, 502, 503]
    }
  ],
  "resources": [
    {
      "uriTemplate": "dq://projects/{projectId}/technical-reports/{reportId}/file?userId={userId}",
      "mimeType": "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    }
  ]
}
```

O arquivo commitado é o mesmo que o servidor usa. O teste de contrato compara os dois.

### 7.2 `README.md`

Seções obrigatórias:

1. **O que é** — MCP de validação, não produção.
2. **Conectar** — URL, `POST`, headers `Content-Type`, `Accept`, `MCP-Protocol-Version`,
   `Mcp-Method`, `Mcp-Name`; exemplo `curl` de `tools/list` e `tools/call`.
3. **Tools** — nome, para que serve, parâmetros, exemplo mínimo, retorno, erros.
4. **Recursos** — template do DOCX e exemplo de `resources/read`.
5. **Erros** — tabela `status`, `code`, `message`, o que fazer.
6. **Limites** — sem auth de cliente, HTTP, LAN, 25 tools, sem delete, sem usuário, sem
   tarefa, sem anexo, sem internet.
7. **Operação** — health, logs, rotação de senha, reinício, como parar.
8. **Projeto de areia** — id, prefixo, o que pode ser tocado.

### 7.3 Erros

| Camada | Situação | Resposta |
|---|---|---|
| Transporte | JSON inválido | JSON-RPC `-32700`, HTTP 400 |
| Transporte | método desconhecido | `-32601`, HTTP 200 |
| Transporte | parâmetro inválido | `-32602`, HTTP 200 |
| Transporte | versão não suportada | `-32020`, HTTP 400 |
| Transporte | `Mcp-Method`/`Mcp-Name` ausente ou divergente | HTTP 400 |
| Transporte | `Origin` estranho | HTTP 403 |
| Tool | entrada inválida | `isError: true`, `code: "invalid_input"` |
| Tool | login falhou | `isError: true`, `code: "upstream_auth_failed"` |
| Tool | 401 depois do re-login | `isError: true`, `code: "upstream_unauthorized"` |
| Tool | 403 do upstream | `isError: true`, `code: "upstream_forbidden"` |
| Tool | 404 do upstream | `isError: true`, `code: "not_found"` |
| Tool | 409 do upstream | `isError: true`, `code: "conflict"` |
| Tool | 5xx/rede | `isError: true`, `code: "upstream_error"` |
| Tool | IA fora | `isError: true`, `code: "ai_unavailable"` |
| Tool | bucket fora | `isError: true`, `code: "bucket_unavailable"` |

O MCP não devolve 401 de cliente na fase 1. Quem estiver na LAN e alcançar a porta usa a
conta de serviço. Isso é aceito por decisão (DEC-207) e limitado por rede.

## 8. Segurança

### 8.1 Risco aceito na fase 1

O endpoint não tem autenticação de cliente. Qualquer host que alcance `:8787` na LAN pode
chamar as 25 tools como `COORDENADOR`. As mitigações:

- bind no IP da LAN, não em `0.0.0.0` quando o IP for conhecido; sem port forwarding, sem
  DNS público, sem exposição na internet;
- firewall do host liberando só o IP do consumidor, se possível;
- nenhuma tool de usuário, papel, ponto, compra, delete ou permissão;
- escrita só no projeto de areia;
- container parado ao fim da validação, se o dono não quiser mantê-lo;
- senha rotacionada depois da validação.

O risco residual é alto o bastante para não manter o serviço ligado sem necessidade. O
`STATE.json` registra isso; não é para "resolver depois" sem decisão.

### 8.2 Segredos

- `DQ_AGENT_PASSWORD` só no `.env` (gitignored) e no ambiente do container.
- Nunca imprimir senha, `csrfToken`, `Cookie` ou `Set-Cookie`.
- Erros de login são genéricos para o consumidor: "falha ao autenticar no DisplayQuest".
  O log interno pode dizer o status HTTP, nunca o corpo com credencial.
- `tools.json` e README não contêm senha, cookie ou URL com token.

### 8.3 Fronteira com o backend

O MCP não importa `backend/`, não usa Prisma e não tem `DATABASE_URL`. A regra do G0 falha
o build se alguém tentar. Toda escrita passa pelas rotas, com a autoridade do ator de
serviço; o MCP não escreve no banco.

## 9. Gates

| Gate | Comando | Critério |
|---|---|---|
| G0 | `npm run arch:check` | exit 0, allow-list vazia; regra `mcp/` sem backend/Prisma |
| G1 | `npm run lint` | exit 0, sem erro |
| G2 | `npx tsc --noEmit` | 0 |
| G3 | `npx vitest run` | zero failure; nunca abaixo de 188/2283 em `tests/unit` + `features` |
| G4 | roundtrips Prisma | não se aplica na fase 1; nenhum schema muda |
| G5 | `docs:build` + `docs:check` | não se aplica na fase 1; o README do MCP é o documento |
| G6 | recaptura de telas | não se aplica; nenhuma tela muda |
| GMCP | `npm --prefix mcp test` + smoke | unitários verdes; `tools/list` e uma tool real verdes |
| GContrato | `npm --prefix mcp run tools:json -- --check` | `tools.json` reproduzível e igual ao commitado |

O G3 do repositório não inclui `mcp/tests` se o pacote tiver projeto próprio. O GMCP cobre
esse buraco e entra no checklist de commit como gate separado.

## 10. Riscos

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Endpoint aberto na LAN | Alta (por desenho) | Alto | Bind restrito, firewall, sem internet, parar ao fim, rotacionar senha |
| NextAuth mudar o cookie ou o fluxo | Baixa | Médio | Teste de login no V7-1; parse por `Set-Cookie`, não por nome fixo; erro claro |
| Sessão de 48 h vencer no meio | Média | Baixo | Renovação proativa em 24 h e re-login em 401 |
| Conta de serviço aparecer em ranking/lista | Alta | Baixo | Aceito na fase 1; fase 2 estuda conta de sistema oculta |
| `weekly_report_bulk_generate` escrever em todos | Média | Médio | Só no projeto de areia, período curto, uma vez |
| Resposta grande demais (projeto com muitas tarefas) | Média | Médio | `sections` no overview; paginação não existe nas rotas, então o README avisa |
| DOCX base64 grande | Média | Baixo | Limitar a um arquivo por leitura; README avisa |
| Zod v4 conflitar com a raiz | Baixa | Médio | Pacote e lockfile separados; não adicionar ao workspace da raiz |
| `next build` não ser afetado | Alta | Baixo | O MCP não entra no build do Next |
| Divergência entre `tools.json` e servidor | Média | Alto | GContrato e geração do mesmo schema |
| Consumidor usar a conta para outra coisa | Baixa | Alto | Senha só no ambiente; rotação; sem tools de usuário |

## 11. Fase 2 (depois da validação)

Não executar agora. É o backlog para internet e produção.

### V7-6 — credencial local e auth de cliente

- `api_credentials` com hash, escopos, expiração, revogação e `lastUsedAt`.
- `mcp_audit_log` com ator, tool, alvo, status e latência.
- CLI `cli/credential.js` (`issue`, `revoke`, `list`) com `--allow-prod`.
- Ramo Bearer em `requireAuth`/`requireApiActor`, sem quebrar o caminho de cookie.
- O MCP passa a autenticar no DisplayQuest com Bearer; a conta de serviço vira conta de
  sistema oculta ou é aposentada.
- O consumidor autentica no MCP com token local (não OAuth, não IdP).

### V7-7 — TLS e internet

- Certificado real para nome interno, fora da imagem.
- Proxy TLS na frente do 8787; `proxy_buffering off`; `X-Accel-Buffering: no`.
- Tailscale/VPN como opção de menor mudança; se houver porta pública, TLS obrigatório.
- Firewall, rate limit e limite de corpo.

### V7-8 — superfície completa

- Tarefas: criar, editar, mover, concluir, aprovar/rejeitar, subtasks.
- Membros e vínculo: adicionar, perfil, remover.
- Anexos, imagens, atestados e relatórios de projeto.
- Sessões de trabalho: iniciar, pausar, retomar, finalizar.
- Notificações e issues.
- As 59 tools originais, revisadas uma a uma.

### V7-9 — hardening

- Auditoria consultável, retenção de log, alerta de falha de login.
- Rotação de segredo sem downtime.
- Teste de carga e limite de concorrência.
- Runbook de incidente e rollback.
- Capítulo técnico em `docs/src` e `docs:build`/`docs:check`.

## 12. Rollback

- V7-1..V7-5: parar o serviço `mcp` e remover o container. O app, o banco e o bucket não
  são tocados.
- `mcp/` é uma pasta nova; remover a pasta e a entrada do compose desfaz a fase 1.
- Nenhuma migration, nenhuma alteração de schema, nenhuma rota nova. Não há rollback de
  banco.
- O projeto de areia fica no banco; se o dono quiser, apaga pela interface. Não criar tool
  de delete só para limpar.

## 13. Ordem de execução

```
V7-0  contrato, conta, baseline
  └─ V7-1  container, login, transporte, project_list
       └─ V7-2  15 tools de leitura/análise
            └─ V7-3  10 tools de escrita controlada
                 └─ V7-4  testes, tools.json, README
                      └─ V7-5  LAN, consumidor, feedback
```

Cada seta é um commit. Não começar a próxima onda com gate vermelho.

## 14. Entregáveis

1. `mcp/` — servidor, cliente do DisplayQuest, schemas e testes.
2. `mcp/Dockerfile` e serviço no `docker-compose.yml`.
3. `mcp/tools.json` — contrato de máquina.
4. `mcp/README.md` — contrato humano.
5. Projeto `[MCP-VALIDACAO]` com dados de teste.
6. `STATE.json` atualizado com baseline, medições e feedback do consumidor.
7. Nenhuma mudança em `app/`, `backend/`, `prisma/`, `components/` ou `features/`.
