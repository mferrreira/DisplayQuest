# plan-v5 — domínio de projetos maduro: cronograma, pontos, relatórios técnicos, atestados

> Demanda do dono em 2026-10-06: amadurecer o domínio de projeto — que hoje é básico
> (nome, descrição, líder, status) — para o desenho completo: dados de edital/processo,
> período de execução, entregáveis, anexos, equipe estendida, cronograma (metas +
> atividades ligadas a tasks), pontos de projeto, relatórios técnicos com rascunho por IA,
> e atestados de frequência mensais com AcroForm. **Refinamento em 2026-10-07**, depois do
> encerramento do plan-v4 (subtasks prontas): hierarquia Atividade → Tasks → subtasks,
> cronograma dentro do wizard de criação, logo/banner de projeto e banner de usuário, e
> **MinIO** (S3-compatible) como destino de todos os blobs novos.
>
> Formo herdado do plan-v3/plan-v4: **medição primeiro, decisões registradas (DEC-99+,
> continuidade da numeração global), um commit revertível por batch, gates G0–G6.**
> **Nada aqui está executado.** O plan-v4 fechou em 2026-10-07 (DEC-78..98), então o
> bloqueio de execução do DEC-73 está cumprido.

## 1. O que foi medido (2026-10-06 e 2026-10-07, antes de planejar)

### 1.1 Projetos hoje — base estreita, mas com wiring pronto

| Fato | Evidência |
|---|---|
| `projects` tem só `name`, `description?`, `createdAt` (String), `createdBy`, `leaderId?`, `status`, `links?` | `prisma/schema.prisma:50-66` |
| `project_members` tem `projectId`, `userId`, `joinedAt`, `roles UserRole[]` (único por par) — **não** tem lattes/carga/matrícula/categoria | `prisma/schema.prisma` (`project_members`) |
| Módulo `project-management` completo (create/update/delete/list/get + ACL) e `project-membership` (add/remove/leader/roles) já existem na clean-arch | `backend/modules/project-management/`, `backend/modules/project-membership/` |
| ACL de gestão congelada: `GLOBAL_PROJECT_MANAGERS = [COORDENADOR, GERENTE]`; membership `GERENTE_PROJETO` também gere | `backend/domain/project/project-rules.ts` |
| 11 rotas `/api/projects/*` já operam via `getBackendComposition()` | `app/api/projects/**` |
| UI de projeto: lista, dialog criar/editar, detail com tabs, gestão de membros — **header do detail é só nome + badge + data** (sem imagem) | `components/features/project-*.tsx`, `components/ui/project-detail-dialog.tsx:136-172` |

**Conclusão:** estender `projects`/`project_members` é o caminho de menor atrito (DEC-61).

### 1.2 Pontos — regra de tarefa mudou no plan-v4; saldo continua só de usuário

| Fato | Evidência |
|---|---|
| Único saldo persistido é `users.points` (Int); "pontos de projeto" atual é a **soma dos points dos membros** (mistura pontos de loja) | `prisma/schema.prisma`; `backend/domain/project/project-rules.ts:294,312` |
| Regra ATUAL (DEC-97,2026-10-06): base `10 + 5·n_subtasks_concluídas` (`POINTS_PER_TASK=10`, `SUBTASK_POINTS=5`), **×1,5 só com ≥2 dias civis de antecedência** (`EARLY_DELIVERY_MIN_DAYS=2`, `Math.round`), atraso `−10/dia` **sem piso** (DEC-39) | `backend/domain/task/points-rules.ts:26-96` |
| O prêmio chega ao cliente na resposta (`awardedPoints`) de `complete-task`/`approve-task` e é publicado via port `onTaskCompleted` (falha de award nunca quebra a conclusão) | `complete-task.use-case.ts:200-206`, `internal/task-view.ts:135` |
| Permissão já sofisticada: `isCompletePermissionDenied`, `isLeaderSelfCompleteDenied`, `approvalDecision` (self → "Líder não pode aprovar a própria tarefa") | `backend/domain/task/task-rules.ts:337-367` |

**Conclusão:** a economia de **usuário** está fechada e madura; a de **projeto** é nova e
tem escala própria (centenas) — DEC-103/104.

### 1.3 Cronograma — não existe; tasks ainda não ligam a atividade

`grep -rn "cronograma"` em `*.ts`/`*.tsx`: **0 ocorrências**. `tasks` liga ao projeto só
por `projectId Int?` (`schema.prisma:87,98`) e **não tem `activityId`**. Não há tabela de
atividade, meta, período de atividade, nem prêmio de atividade.

### 1.4 Relatórios — dois modelos já vivem lado a lado; o técnico é o terceiro

- `project_reports` (projeto + período, texto, anexos) com painel/dialog/print — **continua**.
- `weekly_reports` (usuário + semana) — fonte de dados de frequência dos atestados,
  junto de `work_sessions`.
- Relatórios técnicos (parcial / técnico-final / final) são um model **novo ao lado** (DEC-70).

### 1.5 Notificações — sem canal de urgência

`notifications`: `userId`, `type`, `title`, `message`, `data`, `read` — **sem prioridade**
(`prisma/schema.prisma:408-420`); polling de 60s no cliente; três caminhos de destinatário
prontos (`USER_IDS`, `findReportManagers`, `ALL_ACTIVE_USERS`).

### 1.6 Cron — node-cron com 3 jobs; dia 19 e varredura de atraso são os 4º e 5º

`lib/services/cron-service.ts` já agenda weekly reset (`0 0 * * 1`), pausas agendadas e o
sweep noturno 23:59.

### 1.7 Subtasks prontas (plan-v4, encerrado em 2026-10-07) — a hierarquia nova

| Fato | Evidência |
|---|---|
| `task_subtasks` existe (sem FK para users, sem prazo próprio) | `prisma/schema.prisma:141-152` |
| Trava da mãe (não entra em `in-review`/`done` com subtask aberta) = 400; janela de edição = 409; última subtask concluída auto-move a mãe | DEC-82/83, AGENTS.md |
| Régua de antecedência NOVA passou a valer para toda tarefa (≥2 dias → ×1,5) | DEC-97 (ver 1.2) |
| **As tasks passam a ser as "subtasks" de uma Atividade do cronograma** (pedido do dono 2026-10-07): Atividade → Tasks → subtasks. A trava da atividade espelha a da mãe (DEC-99) | decisão D-R |

### 1.8 Blobs hoje — dois roots em disco, zero infra S3

| O que | Root | Seam |
|---|---|---|
| Avatares | `public/uploads/avatars/<id>/avatar_<ts>.webp` (sharp → webp 300×300) | `lib/utils/image-processor.ts` |
| Anexos de relatório | `data/uploads/reports/<reportId>/<uuid>.<ext>` (≤20 MB, allowlist de 16 mimes + magic bytes) | `lib/storage/report-uploads.ts` |

- Servidas por `/api/uploads/avatars/...` e `/api/report-files/[...path]` (regra de acesso
  do relatório); Dockerfile só torna graváveis `/app/public/uploads` e `/app/data/uploads`
  (gotcha A11).
- `docker-compose.yml` tem **só `postgres` e `app`**; grep por `minio|@aws-sdk|s3` → 0;
  `sharp` é a única dependência de mídia; nenhum limite de corpo configurado no Next.

**Conclusão:** nenhum serviço de objeto existe; MinIO entra como serviço novo + seam
própria, sem tocar nos dois roots legados na primeira leva (DEC-101).

### 1.9 Telas de imagem — avatar existe; banner e logo, não

- Perfil: `dashboard/profile/page.tsx:140-148` mostra `user.avatar` (campo `users.avatar`).
- Quadro de liderança: `dashboard/leaderboard/page.tsx` — top-3 por pontos, **#1 já ganha
  `h-24` + borda dourada + `Trophy`**, mas só avatar (sem banner/fundo).
- Detalhe do projeto: **nenhuma imagem** (`project-detail-dialog.tsx:136-172`).

### 1.10 Colisão com o plan-v4 resolvida e baseline

- plan-v4 **encerrado em 2026-10-07** (V4-1..V4-5d, V4-6b, POS-1; DEC-78..98) → o
  bloqueio "executa depois do plan-v4" (DEC-73) está **cumprido**.
- **Numeração:** DEC-61..77 = este plano (2026-10-06); DEC-78..98 = plan-v4 (houve
  colisão, comentários renumerados — AGENTS.md); **as decisões novas começam em DEC-99**.
- **Baseline medido em 2026-10-07:** G0 `arch:check` **787 módulos / 3077 dependências,
  zero violação, allow-list vazia**; G3 **87 arquivos / 1107 testes verdes** (22,4s);
  suíte completa **97 / 1192**; e2e do quadro **2 passando + 1 falha conhecida + 5 "did
  not run"** (cartão a mais na coluna, dado legítimo da instância) e shell **5 passando**.

## 2. Decisões do dono

### 2.1 Rodada de 2026-10-06 (D-A..D-Q → DEC-61..77)

| # | Pergunta | Escolhida | DEC |
|---|---|---|---|
| D-A | Schema novo vs estender | Estender `projects`/`project_members` | **DEC-61** |
| D-B | Escopo do plano | Tudo, em ondas independentes e revertíveis | **DEC-62** |
| D-C | Origem dos pontos de projeto | Campo próprio `projects.points` | **DEC-63** |
| D-D | Forma da notificação urgente | In-app com prioridade/destaque | **DEC-64** |
| D-E | Provider de IA | Modelo local do lab, OpenAI-compatible, por env genérica | **DEC-65** |
| D-F | Certificate × relatório de frequência | Certificate = atestado com AcroForm; Reports = artigos | **DEC-66** |
| D-G | Fórmula da premiação da atividade | Reusar `points-rules` — **superada por DEC-103** | **DEC-67** |
| D-H | Divisão entre membros | Integral — **superada por DEC-104** | **DEC-68** |
| D-I | Member × `project_members` | Estender `project_members` | **DEC-69** |
| D-J | Relatório técnico liga a quê | Por projeto + tipo | **DEC-70** |
| D-K | AcroForm na v1 | Sistema gera e valida (pdf-lib) | **DEC-71** |
| D-L | Lembrete dia 19 | Coordenadores/gerentes + líderes | **DEC-72** |
| D-M | Relação com o plan-v4 | plan-v5 espera o plan-v4 — **cumprido em 2026-10-07** | **DEC-73** |
| D-N | Piso dos pontos de projeto | **Piso em 0** (usuários seguem sem piso, DEC-39) | **DEC-74** |
| D-O | Status do atestado | **Não implementar** — status do projeto cobre | **DEC-75** |
| D-P | Quem conclui/aprova atividade | Duas fases: líder/gerente de projeto **solicita** com provas; gerente/coordenador **aprova** | **DEC-76** |
| D-Q | Solicitante aprova a própria? | **Só se for COORDENADOR**; GERENTE não | **DEC-77** |

### 2.2 Rodada de 2026-10-07 (D-R..D-W → DEC-99..104), após o encerramento do plan-v4

| # | Pergunta | Escolhida | DEC |
|---|---|---|---|
| D-R | Atividade com task pendente pode ser concluída? | **Trava**: só solicitar conclusão com **todas** as tasks da atividade prontas (análogo à trava da mãe, DEC-82). Tasks = subtasks da atividade | **DEC-99** |
| D-S | Cronograma na criação do projeto | **Passo opcional no wizard** (dados → equipe opcional → cronograma opcional → cria); pula e monta depois no detail | **DEC-100** |
| D-T | Escopo MinIO | **Bucket desde o começo** (V5-1) para **todos** os blobs novos do plano, atrás de port/seam; migração dos existentes (avatares, anexos) fica para depois. Vídeo: **só infra preparada** (mimes no allowlist), nenhuma tela de vídeo no plan-v5 | **DEC-101** |
| D-U | Imagens | Projeto ganha **logo + banner** (página/detalhe estilo Facebook/LinkedIn); usuário mantém o **avatar** (existe) e ganha **banner novo**; o **top #1 do quadro** ganha o tratamento com as imagens, e o perfil mostra as duas | **DEC-102** |
| D-V | Escala e peso da economia de projeto | Base da atividade = **100 × meses de duração** (ex.: 3 meses → 300); atraso = **fração da recompensa por dia (−10%/dia)** — muito mais pesado que os −10/dia do usuário; piso 0 (DEC-74); antecedência ×1,5 com ≥2 dias (régua DEC-97). Tasks continuam premiando **indivíduos**; a atividade premia **os membros ativos do projeto** | **DEC-103** |
| D-W | Distribuição aos membros | **Proporcional às tasks que cada membro concluiu no projeto** (pool = membros ativos; sem tasks → 0). Substitui a divisão integral da DEC-68 | **DEC-104** |

Registro longo (com alternativas e consequências) está no `STATE.json` → `decisionRegistry`.

## 3. Mapeamento do domínio pedido → onde vive

| Pedido no domínio | Hoje | Depois do plan-v5 |
|---|---|---|
| `Projeto.título` | `projects.name` | fica |
| `Projeto.início/término` | — | `projects.startDate?/endDate?` |
| `Projeto.nº Edital`, `nº processo` | — | `projects.editalNumber?/processNumber?` |
| `Projeto.pontos` | inexistente (só agregado de tela) | `projects.points Int @default(0)` (piso 0 na escrita, DEC-74) |
| `Projeto.relatorios Report[ ]` | `project_reports` (outro conceito) | novo `technical_reports` (projeto × tipo) |
| `Projeto.atestados Certificate[ ]` | — | novo `certificates` (sem status próprio, DEC-75) |
| `Projeto.cronograma` | — | `project_goals` + `project_activities`; **também no wizard de criação** (DEC-100) |
| `Projeto.anexos Blob[ ]` | — | `project_attachments` → **bucket MinIO** (DEC-101) |
| `Projeto.entregáveis Deliverable[ ]` | — | `project_deliverables (name, quantity)` |
| logo/banner do projeto | não existe | `projects.logoKey?/bannerKey?` no bucket; header do detail + lista (DEC-102) |
| `Projeto.equipe Member[ ]` | `project_members` | estendido: `lattes`, `cargaHorariaSemanal`, `categoria`, `situacao`, `dataEntrada`, `matricula` |
| banner do usuário | só avatar (`users.avatar`) | `users.bannerKey?` no bucket; perfil + pódio #1 (DEC-102) |
| `Certificate.template Blob` | — | AcroForm gerado (pdf-lib) → bucket |
| `Activity.task Task[ ]` | **não existe** | `tasks.activityId?` + trava DEC-99 (todas prontas p/ solicitar) |
| `Activity.recompensa` | — | **derivada: 100 × meses do período** (DEC-103), guardada para leitura |
| `Activity.prova Blob[ ]` | — | bucket (`projects/<id>/activities/<id>/`) |
| `Member.usuario` | `project_members.userId` | fica |
| qualquer blob novo | disco do container | **MinIO** (DEC-101) — nenhum `writeFile` novo fora do bucket |

`Report` (3 tipos) vira **3 registros por projeto**, um por tipo (DEC-70), cada um com
`content` + `file`.

## 4. Sequência proposta (cada linha = 1 commit revertível)

| Batch | O que faz | Risco | Status |
|---|---|---|---|
| **V5-1** | **MinIO + seam de blob**: serviço `minio` no compose (volume, API 9000 / console 9001 em loopback), envs (`MINIO_ENDPOINT/ACCESS_KEY/SECRET_KEY/BUCKET`), dependência `@aws-sdk/client-s3`, seam `lib/storage/blob-store.ts` + port para os módulos (allowlist de imagens/pdf/**vídeo**), sem consumidor de produção ainda | baixo — infra nova, zero mudança de comportamento | pendente |
| **V5-2** | **Dados do projeto + imagens**: migration (`startDate`, `endDate`, `editalNumber`, `processNumber`, `points`, `logoKey?`, `bannerKey?`) + `project_deliverables` + anexos **no bucket** + **logo/banner do projeto** com upload (validação de imagem) + header do detail com banner/logo (estilo FB/LinkedIn) | médio — tela visível (G5/G6) | pendente |
| **V5-3** | **Banner de usuário + pódio**: `users.bannerKey?`, upload no perfil, perfil mostra avatar+banner, **top #1 do quadro** ganha o tratamento com as imagens (avatar `h-24` já existe; entra o banner/fundo) | médio — tela visível (G5/G6) | pendente |
| **V5-4** | **Equipe estendida**: colunas novas em `project_members` (lattes, carga horária, categoria, situação, data de entrada, matrícula), use cases e UI de gestão | baixo | pendente |
| **V5-5** | **Cronograma**: `project_goals` + `project_activities` (ordem, descrição, responsável, período, **recompensa derivada 100×meses**, status `OPEN → COMPLETION_REQUESTED → DONE`, provas no bucket), regras puras de período/ordem, CRUD + aba no detail, **wizard de criação com passo opcional de cronograma (DEC-100)** | médio — modelagem nova + tela (G5/G6) | pendente |
| **V5-6** | **Task × atividade**: `tasks.activityId?`, no form a atividade do período atual vem **pré-selecionada** e só dá para escolher futuras, filtro no quadro, e a **trava DEC-99** (solicitar conclusão só com todas as tasks prontas) | médio — mexe no form do quadro (G5/G6) | pendente |
| **V5-7** | **Economia de projeto**: `request-activity-completion` (líder/membro gestor + provas) e `approve-activity-completion` (só `GLOBAL_PROJECT_MANAGERS`; auto-aprova só COORDENADOR — DEC-77); prêmio = `100×meses × (1,5 se ≥2d adiantada) − 10%/dia de atraso`, **piso 0** (DEC-103/74); distribuição **proporcional às tasks concluídas de cada membro** (DEC-104); tarefa concluída de projeto também incrementa `projects.points`; idempotência + histórico | **alto** — economia | pendente |
| **V5-8** | **Atraso urgente**: coluna `priority` em `notifications` + destaque na UI; varredura diária no cron: atividade vencida e não aprovada → **1** notificação prioritária (`overdueNotifiedAt`) para líder + coordenadores/gerentes | médio | pendente |
| **V5-9** | **Relatórios técnicos + IA**: `technical_reports` (projeto × tipo, texto + arquivo no bucket), permissão gestão/líder, `ReportDraftPort` + adapter OpenAI-compatible por env (`AI_BASE_URL/AI_API_KEY/AI_MODEL`, default `http://localhost:8080/v1`), rascunho a partir de `work_sessions` do período | médio | pendente |
| **V5-10** | **Atestados**: módulo `attestation` — `certificates` (sem status, DEC-75), AcroForm gerado+validado com `pdf-lib` (arquivo no bucket), frequência de `weekly_reports`/`work_sessions`, lembrete dia 19 (`0 9 19 * *`) para coordenadores/gerentes + líderes | médio-alto — dependência nova + PDF (G5/G6) | pendente |
| **V5-11** | **Tela de andamento**: gráfico `data_final − dia_de_hoje` + exibição de `projects.points` (agora real) | baixo | pendente |

Ordem: **V5-1 primeiro** (tudo que gravar blob depende dele). V5-2, V5-3 e V5-4 são
independentes entre si. V5-5 → V5-6 → V5-7 → V5-8 encadeiam. V5-9 e V5-10 correm quando
quiser depois de V5-1. V5-11 espera V5-2 (`endDate`) e V5-7 (`points`). A espera pelo
plan-v4 caiu: ele fechou em 2026-10-07.

## 5. Estrutura de arquivos prevista

```
docker-compose.yml                        +serviço minio (volume, 127.0.0.1:9000/9001 no override)
package.json                              +@aws-sdk/client-s3 (e presigner se precisar de URL)
prisma/schema.prisma                      +cols em projects/users/project_members/tasks/notifications
prisma/migrations/                        migrations por batch (nullable; sem backfill)
lib/storage/blob-store.ts                 (novo) seam de blob: put/get/remove/allowlist (imgs/pdf/vídeo)
backend/domain/project/
  project-rules.ts                        + regras de período/ordem/atraso (puras)
  activity-rules.ts                       (novo) recompensa = 100×meses, fração −10%/dia, distribuição proporcional
backend/domain/attestation/               (novo) regras de atestado/mês/validação de campos
backend/modules/project-management/
  application/use-cases/                 + request/approve-activity-completion, entregáveis/anexos, wizard, cronograma
  application/ports/                     + project-activities.port, blob-store.port (quadrar com seam lib/)
  infrastructure/repositories/           prisma-* correspondentes
backend/modules/attestation/             (novo) certificates + AcroForm + lembrete dia 19
backend/modules/reporting/               + technical-reports + ReportDraftPort + adapter openai-compatible
backend/composition/root.ts              wiring dos ports novos (DEC-21)
lib/services/cron-service.ts             + job de atraso (diário) + lembrete dia 19
app/api/projects/route.ts                criação via wizard (cronograma opcional, DEC-100)
app/api/projects/[id]/{deliverables,attachments,cronograma,activities,images}/route.ts
app/api/projects/[id]/{logo,banner}/route.ts   (upload → bucket)
app/api/users/banner/route.ts            (upload → bucket; espelho do avatar)
app/api/technical-reports/...  app/api/certificates/...
features/projects/…                      wizard, header com banner/logo, aba cronograma
features/tasks/…                         seletor de atividade (V5-6)
app/(dashboard)/dashboard/profile/…      banner do usuário
app/(dashboard)/dashboard/leaderboard/…  pódio #1 com banner
components/ui/notifications-panel.tsx    destaque de prioridade
```

## 6. Gates por batch

| Gate | Comando — critério |
|---|---|
| **G0** | `npm run arch:check` — exit 0, **allow-list vazia**. Baseline 2026-10-07: 787/3077 |
| **G1** | `npm run lint` — 0 erros (em worktree: `npx eslint --no-eslintrc --config .eslintrc.json <arquivos>`) |
| **G2** | `npx tsc --noEmit` — 0 erros |
| **G3** | `npx vitest run tests/unit features` — zero failure. **Baseline 87/1107** |
| **G4** | migration + roundtrip só contra `dq-dev-test-db` em `127.0.0.1:5433` (`npm run db:test:up` + `db:test:setup`; `g4-normalize.sql` obrigatório) — suíte completa. **Migrations novas seguem o protocolo do V4-4:** `migrate diff` offline + `migrate deploy`, **nunca** `migrate dev` contra a 5432 (risco de RESET nos dados reais) |
| **G5** | `npm run docs:build` + `docs:check` — obrigatório em V5-2, V5-3, V5-5, V5-6, V5-8, V5-9, V5-10, V5-11 |
| **G6** | recapturar telas do guia quando a captura deixa de representar a tela (V5-2 muda o detail do projeto; V5-3 muda perfil e quadro) |

Regra de fechamento: **batch não entra em `done` com gate vermelho ou lacuna aberta de
que ele mesmo dependa.** MinIO precisa estar no ar para V5-2+ (`docker compose up minio`);
sem ele o batch falha em dev — provisionar junto do serviço.

## 7. Regras a congelar em teste **antes** do código

1. **Recompensa da atividade = 100 × meses civis do período** (`100 × ceil(duração em
   meses)` — ver ASK-V5-05 sobre arredondamento), função pura em `activity-rules.ts`.
2. **Prêmio na aprovação**: `award = recompensa × (1,5 se ≥2 dias adiantada) − 0,10 ×
   recompensa × diasAtraso`, **piso em 0** (DEC-103 + DEC-74). Antecedência usa a mesma
   régua de ≥2 dias da DEC-97; atraso é fração diária, **não** os −10 fixos do usuário.
3. **Distribuição**: `parte_i = award × (tasksConcluídas_i_noProjeto ÷ tasksConcluídas_doProjeto)`;
   denominador 0 → divisão igual entre membros ativos; soma das partes = `award`
   (DEC-104). Membro sem task leva 0.
4. **Trava da atividade (DEC-99)**: solicitar conclusão com task pendente → 400, frase
   própria (análogo à trava da mãe).
5. **Duas fases (DEC-76)**: solicitar = líder/membro gestor + provas; aprovar =
   `GLOBAL_PROJECT_MANAGERS`; **auto-aprovação só para COORDENADOR** (DEC-77);
   idempotência `GAMIFICATION:ACTIVITY_COMPLETED:<id>`; o prêmio **nunca** cai na
   solicitação.
6. Tarefa concluída de projeto incrementa `projects.points` com o valor creditado ao
   usuário (mantém DEC-63); escrita do saldo com **piso 0**; nenhum `UPDATE` direto de UI.
7. Atraso: atividade vencida e não aprovada gera **uma** notificação prioritária por
   atividade (`overdueNotifiedAt`), líder + coordenadores/gerentes (DEC-64).
8. Criação de task: atividade do período atual pré-selecionada; seletor só com futuras +
   vigente; sem atividade vigente = vazio (não quebra).
9. Wizard: criar projeto **sem** cronograma é válido e idêntico ao criação simples de
   antes; com cronograma, cria projeto + goals + atividades numa transação (rollback
   completo se qualquer linha falhar).
10. Atestado: validação dos campos do AcroForm antes do upload; sem coluna de status
    (DEC-75); lembrete dia 19 só no dia 19, audiência da DEC-72.
11. **Imagens**: logo/banner validados (mime imagem, ≤5 MB, magic bytes — mesmo padrão do
    avatar); servidas com regra de acesso de projeto (logo/banner podem ser públicos?
    decidir no batch; default = mesma regra do projeto).
12. **Nenhum blob novo fora do bucket** (DEC-101): qualquer `writeFile` de arquivo novo
    é bug — e qualquer caminho de escrita novo em disco precisa `mkdir`+`chown` no
    Dockerfile (gotcha A11), o que justifica o MinIO.

## 8. Perguntas ao dono

Respondidas — D-A..D-W (2026-10-06 e 2026-10-07), registro no `STATE.json`
(`answeredInstructions` para os ASK, `decisionRegistry` para as DEC). As duas que
**substituíram decisões antigas**: DEC-103 pisa na DEC-67 (reusar `points-rules`) e
DEC-104 pisa na DEC-68 (divisão integral) — a economia de projeto tem escala própria.

Em aberto:

- **ASK-V5-05** (antes de V5-7): arredondamento da duração em meses da atividade —
  **ceil** (fração de mês já conta; 45 dias → 2 meses → 200), floor (mês cheio só) ou
  proporcional aos dias? Proposta v1: **ceil**, coerente com "quem começa paga o mês".

Fora deste plano (na fila, não esquecer):

- **Migração dos blobs existentes** (avatares em `public/uploads/`, anexos em
  `data/uploads/reports/`) para o bucket — leva própria depois do plan-v5 (DEC-101).
- **Tela de vídeo** (upload/player na página do projeto) — bucket já aceita (DEC-101).
- Troca de provider de IA no multilab (spec-v2 feature 05) — o adapter por env já abre a
  porta; descoberta/seleção de modelo por laboratório é escopo do spec-v2.
- Polimento do prompt do rascunho de IA — iteração posterior ao V5-9.

## 9. Como o estado é monitorado

`STATE.json` nesta pasta é a fonte de verdade: `status` (`ready` → `in_progress` →
`done`), `waves[]` (V5-1..V5-11 com `status`/`decisions`/`scope`), `decisionRegistry`
(DEC-61..77 + DEC-99..104; **DEC-78..98 são do plan-v4**), `batchLog[]` (só batch
executado entra, com gates aferidos e gotchas), `openQuestions` (ASK-V5-05),
`answeredInstructions` (ASK-V5-01..04), `blockers` (vazio — plan-v4 fechou). A numeração
de decisões **continua** a global: a próxima é a **DEC-115** — o plan-v6 consumiu
DEC-105..114 em 2026-10-07 —; antes de abrir decisão nova, `grep` os `STATE.json`
(clean-arch, plan-v3, plan-v4, plan-v5, plan-v6; lição da colisão DEC-61..64 do V4-4).
