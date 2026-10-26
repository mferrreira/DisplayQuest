# Servidor MCP — DisplayQuest (plan-v7, fase 1)

Servidor MCP que expõe o DisplayQuest a um agente validador. Ele fala com o app
**só por HTTP**, autenticando como a conta de serviço do ambiente. Nenhum código de
`app/`, `backend/`, `lib/`, Prisma ou Next é importado aqui (regra `rg11-mcp-no-app`
do G0). O plano está fora do repositório, em
`~/Projetos/displayquest-planos/displayquest-v2/plan-v7/PLAN.md`.

## Conectar

Endpoint: `POST http://<host>:8787/mcp` — Streamable HTTP, stateless (cada POST é
atendido por uma instância nova; `Mcp-Session-Id` não é emitido nem exigido).
`GET` e `DELETE` em `/mcp` respondem `405` com `Allow: POST`. Health: `GET /healthz`.

Headers aceitos (o SDK valida): `MCP-Protocol-Version` (se presente e não suportada,
`400` com `-32020`), `Mcp-Method` (obrigatório no caminho moderno), `Mcp-Name`
(obrigatório em `tools/call` e `resources/read`). `Origin` ausente passa; `Origin`
de fora da lista (loopback + IP do bind + `DQ_ALLOWED_ORIGINS`) responde `403`.
`Host` não é validado — em LAN o Host é o IP da máquina.

Medido: declarar `MCP-Protocol-Version: 2026-07-28` num POST cru exige o envelope da
revisão (`params._meta`); sem ele a resposta é `400`/`-32602` nomeando a chave que
falta. O caminho sem esses headers (o dos exemplos abaixo) é o fallback stateless
atendido a clientes 2025-era, e é o que o SDK negociou nas provas ao vivo.

```bash
curl -sS http://<host>:8787/healthz

curl -sS -X POST http://<host>:8787/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"0"}}}'

curl -sS -X POST http://<host>:8787/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'

curl -sS -X POST http://<host>:8787/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"project_list","arguments":{}}}'
```

Num cliente MCP (Claude, Cursor, SDK), a conversa é: `initialize` → `tools/list` →
`tools/call`. Exemplo com o SDK oficial:

```ts
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client"

const client = new Client({ name: "validador", version: "1.0.0" })
await client.connect(new StreamableHTTPClientTransport(new URL("http://<host>:8787/mcp")))
const tools = await client.listTools() // 25 tools
const result = await client.callTool({ name: "project_overview", arguments: { projectId: 7 } })
```

## Configuração (env do processo `mcp`)

| Variável | Obrigatória | Default | Função |
|---|---|---|---|
| `DQ_API_BASE` | não | `http://127.0.0.1:3000` | base HTTP do app (no compose: `http://app:3000`) |
| `DQ_AGENT_EMAIL` | não | `mcp-agent@displayquest.local` | conta de serviço |
| `DQ_AGENT_PASSWORD` | sim | — | senha da conta; só no ambiente, nunca no git |
| `MCP_PORT` | não | `8787` | porta do servidor |
| `MCP_BIND_IP` | não | `127.0.0.1` | interface; no compose é `0.0.0.0` (LAN) |
| `MCP_REQUEST_TIMEOUT_MS` | não | `15000` | timeout JSON; binário é o dobro (30 s) |
| `DQ_ALLOWED_ORIGINS` | não | — | origens extras no `Origin` (vírgula; hostname ou origem) |

Aliases aceitos: `DASHBOARD_BASE_URL`/`MCP_APP_URL` (base do app) e
`MCP_AGENT_PASSWORD` (senha). O MCP autentica no NextAuth (CSRF + credentials),
guarda o cookie **só em memória**, refaz o login em `401` e renova a sessão
proativamente a cada 24 h. Nenhuma credencial é gravada, logada ou devolvida.

## Tools (25)

Contrato completo em `tools.json` (gerado do schema; `npm run tools:json`). Sucesso:
`content` com resumo curto + `structuredContent` com o JSON da resposta. Erro:
`isError: true` + `structuredContent: {status, code, message}`.

### Leitura e análise (15)

| Tool | Rota | Parâmetros |
|---|---|---|
| `people_list` | `GET /api/users` | nenhum |
| `people_statistics` | `GET /api/users/statistics` | `type?: roles\|status\|general` |
| `leaderboard_get` | `GET /api/users/leaderboard` | `type?: points\|tasks`, `limit?` |
| `project_list` | `GET /api/projects` | nenhum |
| `project_get` | `GET /api/projects/[id]` | `projectId` |
| `project_overview` | composta | `projectId`, `sections?` |
| `member_performance` | composta | `userId`, `projectId?`, `weekStart?`, `weekEnd?` |
| `task_list` | `GET /api/tasks` | `projectId?` |
| `global_progress_get` | `GET /api/tasks/global-progress` | nenhum |
| `hours_get` | `GET /api/projects/[id]/hours` | `projectId`, `weekStart?`, `weekEnd?` |
| `work_sessions_list` | `GET /api/work-sessions` | `userId?`, `projectId?`, `status?`, `active?` |
| `weekly_hours_history_get` | `GET /api/weekly-hours-history` | `weekStart?`, `userId?`, `stats?` |
| `laboratory_schedule_get` | `GET /api/laboratory-schedule` | nenhum |
| `weekly_report_list` | `GET /api/weekly-reports` | `userId?`, `weekStart?`, `weekEnd?` |
| `technical_report_list` | `GET /api/projects/[id]/technical-reports` | `projectId` |

### Escrita controlada (10)

| Tool | Rota | Parâmetros |
|---|---|---|
| `project_create` | `POST /api/projects` | `name` + campos do projeto + `volunteerIds?` + `cronograma?` |
| `project_update` | `PUT /api/projects/[id]` | `projectId` + campos parciais |
| `deliverable_create` | `POST /api/projects/[id]/deliverables` | `projectId`, `name`, `quantity` |
| `activity_create` | `POST /api/projects/[id]/activities` | `projectId`, `description`, `firstMonth`, `lastMonth`, `responsibleId?` |
| `activity_update` | `PATCH /api/projects/[id]/activities/[activityId]` | `projectId`, `activityId` + campos parciais |
| `weekly_report_generate` | `POST /api/weekly-reports/generate` | `userId`, `weekStart`, `weekEnd` |
| `weekly_report_bulk_generate` | `POST /api/weekly-reports/bulk` | `periodType`, `from`, `to` |
| `technical_report_save` | `PUT /api/projects/[id]/technical-reports` | `projectId`, `type`, `content` |
| `technical_report_generate` | `POST /api/projects/[id]/technical-reports/[tipo]/generate` | `projectId`, `type` |
| `technical_report_draft` | `POST /api/projects/[id]/technical-reports/[tipo]/draft` | `projectId`, `type` |

Nenhuma tool apaga. Não há tool de usuário, subtask, anexo, atestado ou imagem na
fase 1. IDs são inteiros positivos; datas `YYYY-MM-DD`; meses `YYYY-MM`.

## Recurso (1)

| URI | Leitura | Retorno |
|---|---|---|
| `dq://projects/{projectId}/technical-reports/{reportId}/file?userId={userId}` | `resources/read` | DOCX em `blob` base64 com `mimeType` do WordprocessingML |

`reportId` e `userId` saem de `technical_report_list` (geração) e do vínculo do
projeto. O download **nunca** é por tool nem por URL: o binário vem no `blob`.
Arquivo não gerado → erro de protocolo `-32602` com `data.uri`; bucket desligado ou
falha do app → `-32603` com a mensagem do app.

## Erros

Tool que falha: `isError: true` e `structuredContent: {status, code, message}`.

| `code` | Quando |
|---|---|
| `invalid_input` | 400 — entrada rejeitada pelo schema ou pela rota |
| `upstream_auth_failed` | 401 — login da conta de serviço falhou |
| `upstream_unauthorized` | 401 — sessão expirou e o re-login não resolveu |
| `upstream_forbidden` | 403 — a conta não tem a permissão da rota |
| `not_found` | 404 — id inexistente |
| `conflict` | 409 — estado do registro impede a escrita |
| `upstream_error` | 502/504 — app fora do ar ou tempo esgotado |
| `ai_unavailable` | 502 — rascunho de IA (`technical_report_draft`) |
| `bucket_unavailable` | 503 — geração/leitura de DOCX sem bucket |
| `internal_error` | o que não se encaixa acima |

No transporte: JSON inválido `-32700`/400; método desconhecido `-32601`; parâmetro
inválido `-32602`; versão explícita não suportada `-32020`/400; `Origin` estranho
`403`.

Duas fronteiras de validação, medidas (fixadas em `tests/readme-examples.test.ts`):
o argumento fora do `inputSchema` anunciado é cortado antes de chegar à tool —
`isError: true` com o texto `Invalid arguments for tool <nome>: <campo>: ...` e
**sem** `structuredContent`. O que o schema aceita e a rota recusa (formato de mês
em `activity_create`, datas em `weekly_report_generate`) chega à tool e sai no
formato de cima: `isError: true` com `structuredContent {status: 400, code:
"invalid_input"}`. O MCP não duplica a aritmética do app.

## Limites

- **Sem auth de cliente na fase 1** (DEC-207): quem alcança a porta usa o MCP. A
  barreira é a rede — HTTP, LAN, porta `8787` não exposta na internet.
- O ator é a conta de serviço `COORDENADOR` (DEC-205). O MCP **não amplia**
  permissão nenhuma: o que a conta não pode, a tool responde `upstream_forbidden`.
- `people_list` **não** devolve CPF nem campos de senha, mesmo quando o ator pode
  vê-los.
- `task_list` pode devolver `subtasks: []` para quem não é dono nem gestão da mãe
  (DEC-189) — não é erro.
- `member_performance` usa `weekStart`/`weekEnd` **só** em horas e relatórios; as
  rotas de sessão e tarefa não aceitam filtro de data.
- `weekly_report_bulk_generate` escreve para **todos** os usuários ativos: é o ponto
  mais sensível da fase 1. Período curto, uma vez, só com o projeto de areia como
  contexto.
- `project_update` não aceita `points`, `logoKey` nem `bannerKey`.
- `project_overview`: falha de seção vira `warnings`; a falha do projeto derruba a
  tool.

## Projeto de areia

Toda escrita roda no projeto `[MCP-VALIDACAO] <data> <hora>` (DEC-210). Quem cria
via `project_create` vira `GERENTE_PROJETO` do projeto, então a conta de serviço
gerencia a areia sem ser líder dela. Não existe tool de exclusão: apagar a areia é
pela interface, e isso é fase 2.

## Operação

```bash
# subir (compose): exige DQ_AGENT_PASSWORD no .env
docker compose up -d --build mcp
docker compose logs -f mcp

# local, contra o app em 3000
npm --prefix mcp ci
npm --prefix mcp run dev
npm --prefix mcp run smoke   # sobe o MCP e percorre leitura + escrita na areia

# contrato e testes
npm --prefix mcp run tools:json          # reescreve tools.json do schema
npm --prefix mcp run tools:json -- --check
npm --prefix mcp test
npm --prefix mcp run typecheck
```

**Rotacionar a senha:** criar a nova senha (`openssl rand -base64 24`), atualizar a
senha da conta no app (painel de usuários), gravar em `DQ_AGENT_PASSWORD` no `.env`
e `docker compose up -d mcp`. O MCP renova a sessão sozinho; sem reinício, a sessão
velha ainda vale até expirar (48 h).
