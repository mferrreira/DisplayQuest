# plan-v4 — subtasks, animação de pontos, inativação de usuário

> Plano das três demandas abertas pelo dono em 2026-10-05, depois do encerramento do plan-v3
> (`6bbf86d`) e da pausa do B6/D4. Formato do plan-v3: medição primeiro, decisões registradas,
> um commit revertível por batch, gates G0–G6.
>
> **Nada aqui está executado.** Este arquivo é a medição + as decisões que o dono precisa tomar.

---

## 1. O que foi medido

### 1.1 Inativar usuário — quase tudo já existe

| fato | evidência |
|---|---|
| `inactive` já é status reconhecido | `prisma/schema.prisma:17` (`status String @default("pending")`, sem enum) |
| login de inativo é bloqueado | `lib/auth/config.ts:30` — `if (user.status !== "active")` |
| API de inativo é bloqueada | `lib/auth/server-auth.ts:36` |
| laboratório recusa inativo | `assertUserCanCreateLabEvent` / `assertUserCanCreateLabNotice` |
| relatórios em lote pulam inativo | `bulk-weekly-reports.use-cases.test.ts:94,190` fixam |
| reset semanal do cron pula inativo | `cron-weekly-reset.golden.test.ts:51` |
| a UI já oferece "Inativo" | `volunteers-management.tsx:404`, `ModernAdminPanel.tsx:491` |
| já existe endpoint de status | `PATCH /api/users/[id]/status` → `UpdateUserStatusUseCase` |
| **nenhuma tela chama `deleteUser`** | grep em `components/` e `features/`: zero `.tsx` |

Conclusão: o caminho "inativar" está pronto de ponta a ponta. O que está quebrado é só o
`DELETE /api/users/[id]`, que nenhuma interface usa.

### 1.2 O DELETE está quebrado para qualquer usuário real

Medido na base de teste com o caminho real (`DeleteUserUseCase` → Prisma real):

```
user 58 (Coordenador): compras 2, logs 1, relatórios 3, sessões 2
  -> P2003 — projects_createdBy_fkey
user 59 (Gerente):     tasks 2, responsabilidades 1, relatórios 2
  -> P2003 — lab_responsibilities_userId_fkey
```

Causa estrutural: **16 das 23 FKs que apontam para `users` são `RESTRICT`** (default do Prisma,
sem `onDelete`). Só 7 têm cascade: `project_members`, `task_assignees`, `task_user_progress`,
`work_sessions`, `weekly_hours_history`, `user_badges.user`, `notifications.user`.

Dois detalhes que mudam a decisão:

- um usuário **recém-registrado** (sem histórico) **consegue** ser excluído hoje — o caso "limpar
  um cadastro de teste" funciona;
- quando falha, a rota devolve **500 com a mensagem crua do Prisma** no corpo
  (`app/api/users/[id]/route.ts:91` faz `error.message || ...`, e `domainErrorResponse` devolve
  `null` para não-DomainError). O corpo inclui o bloco `Invalid prisma.users.delete() invocation`.

### 1.3 Subtasks — não existem, e o `groupTaskId` não serve

- `tasks` (`schema.prisma:80-102`) não tem nada de subtask.
- `groupTaskId` (`:94`) **significa outra coisa**: vincula cópias individuais criadas a partir do
  mesmo template (issue 4 do plano de 2026-09-02). Reutilizá-lo misturaria dois conceitos.
- Pontuação hoje (`backend/domain/task/points-rules.ts`):
  `award = 10 · (adiantada ? 1,5 : 1) − diasAtrasados · 10`, com `POINTS_PER_TASK = 10` fixo
  (DEC-30) e **penalidade sem piso** (DEC-39).
  **A penalidade é fixa por dia (`·10`), não proporcional aos pontos da tarefa** — foi a mudança
  do plan-v3 (OND1-B1). Isso importa para a fórmula do "+10 por subtask".
- Fluxo de status: `to-do → in-progress → in-review → done` (+ `adjust`). A porta de entrada em
  revisão é `isReviewRequestTransition` (`task-rules.ts:103`).

### 1.4 Animação — três defeitos distintos, cada um com uma causa

| sintoma | causa medida |
|---|---|
| quem conta é o chip, não o número do cabeçalho | `app-header.tsx:151` renderiza `{points}` direto da sessão; `components/ui/points-delta.tsx` é quem faz os 20 passos |
| o chip não se move em Y | `points-delta.tsx:112` usa **só** `animate-in fade-in` — as variantes com transform foram evitadas de propósito porque **sobrescrevem o `-translate-x-1/2`** e desalinham o chip |
| não anima para quem não pode aprovar | o sinal só nasce de mutação (`use-tasks.ts:92`) e só quando `awardedTo === sessionUserId`. O voluntário nunca é quem aprova, então nunca recebe o delta |

Restrições que já são verdade e ajudam: o contêiner do chip é `hidden md:flex`
(`app-header.tsx:146`), então **o chip já é desktop-only** — o requisito do dono está
meio cumprido e falta só garantir que continue.

O seam de persistência no cliente existe: `lib/client-storage.ts` (namespace `dq:`, leitura
tolerante a conteúdo corrompido, cai no caminho "sem storage" em SSR e em jsdom).

---

## 2. Decisões do dono (respondidas em 2026-10-05)

Todas as quatro perguntas abaixo foram respondidas pelo dono e viraram DEC-55..58 em
`STATE.json`. O que cada uma escolheu:

| id | decisão | escolhida |
|---|---|---|
| **DEC-55** | `DELETE /api/users/[id]` | **recusar com 409** quando houver dependência. Cascade rejeitado explicitamente; remover o endpoint também |
| **DEC-56** | `+10` por subtask × penalidade | **subtask soma à base, penalidade continua fixa por dia** |
| **DEC-57** | trava da mãe | **bloqueio no servidor, com mensagem**; a UI desabilita *além* de bloquear |
| **DEC-58** | animar quem não aprovou | **aceito** — o número passa a significar "o que mudou desde a última vez que você viu" |

Falta só **D-D** (escopo da subtask na v1), registrada no §2.5 abaixo.

### 2.1 D-A. O que acontece com o `DELETE /api/users/[id]` — **DEC-55**

| opção | o que faz | consequência |
|---|---|---|
| **A1 — recusar com 409** ✅ | o use case verifica dependências antes do `delete`; se houver, `ConflictError` com mensagem explicando que se usa inativação | preserva o caso útil (excluir cadastro sem histórico), transforma o 500 com Prisma cru em 409 legível, nenhuma migration |
| A2 — remover o endpoint | apaga rota + use case + testes | nada na UI o usa, mas some uma capacidade de API que hoje funciona para usuário sem histórico |
| A3 — cascade na migration | `onDelete: Cascade` nas 16 FKs | destrói histórico; rejeitado pelo dono na formulação do próprio pedido |

### 2.2 D-B. Como o "+10 por subtask" convive com a penalidade de atraso — **DEC-56**

| opção | fórmula (n = nº de subtasks) | efeito |
|---|---|---|
| **B1 — subtask soma à base, penalidade continua fixa** ✅ | `(10 + 10n) · (adiantada ? 1,5 : 1) − dias · 10` | uma tarefa com 4 subtasks vale 50; um dia de atraso tira 10. Atraso relativo dói menos em tarefa grande |
| B2 — penalidade proporcional à base | `(10 + 10n) · (adiantada ? 1,5 : 1) − dias · (10 + 10n)` | volta à matemática pré-v3, que é justamente o que o plan-v3 corrigiu (DEC-31/32) |

> **Substituída em 2026-10-06 pela DEC-78**, ao medir com o dono o que "subtask atrasada" significa.
> A fórmula acima trata a mãe como uma parcela só e ignora **quando** cada subtask foi concluída.
> A regra executada é: cada subtask é pontuada pela mesma regra da mãe, contra o prazo herdado e
> no instante em que ela própria foi concluída — e só as concluídas somam. O que a DEC-56 decidiu
> de verdade continua: o `+10 por subtask` existe e é a base gravada em `tasks.points` (DEC-83).
> Exemplo executado e congelado em teste: prazo 20/10, mãe aprovada em 25/10, subtasks em 19/10,
> 21/10 e 24/10 → mãe −40, subtasks +15, 0, −30, total **−55**.

### 2.3 D-C. O que significa "travar a mãe no Em Andamento" — **DEC-57**

| opção | o que a pessoa vê |
|---|---|
| **C1 — bloqueio no servidor, com explicação** ✅ | arrastar a mãe para "Em Revisão"/"Concluída" com subtask aberta devolve 400 com mensagem ("Conclua as 2 subtasks restantes antes de enviar para revisão") e o card mostra quantas faltam |
| C2 — botão desabilitado na UI, sem checagem no servidor | a UI impede, mas a API aceita — regra que só existe metade |

### 2.4 D-E. Como fazer a animação chegar a quem não aprovou — **DEC-58**

O voluntário conclui → mãe vai para revisão → o líder aprova → o prêmio é creditado ao
voluntário, mas **na sessão do líder**. O cliente do voluntário nunca vê o número.

Escolhido: o cabeçalho guarda o último total que **aquele usuário** viu (`dq:points-seen:<userId>`,
via `lib/client-storage.ts`). Ao montar, se o total da sessão for diferente do guardado, anuncia
o delta. As três ressalvas foram aceitas junto com a decisão:

- **primeira vez não anima** — sem baseline, um usuário com 500 pts não vê contagem a partir de zero;
- **troca de dispositivo/aba** anima de novo (o baseline é por navegador);
- **mudança por outra razão** (admin ajustando pontos, compra aprovada) também anima — o número
  passa a significar "o que mudou desde a última vez que você viu", não "o prêmio desta tarefa".

### 2.5 D-D. Escopo da subtask na v1 — **respondido em 2026-10-05, detalhado em 2026-10-06**

Perguntas abertas, todas com custo real de schema:

1. Subtask tem responsável próprio, ou é sempre da mesma pessoa da mãe?
2. Subtask existe em tarefa pública (`taskVisibility: "public"`) e em quest global (`isGlobal`)?
3. Subtask tem prazo próprio, ou herda o da mãe? (Se tiver prazo próprio, a penalidade de qual
   prazo usa?)
4. A mãe pode ser criada com subtasks, ou subtask só se adiciona depois?
5. Subtask concluída conta para badge/avaliação automática (`evaluateUserBadges`)?

Minha proposta de v1 (a mais pequena que satisfaz o pedido): **sem responsável próprio, sem prazo
próprio, fora de pública e global, criada depois da mãe, sem efeito em badge.**

**Resposta do dono (2026-10-05):** sem responsável próprio, sem prazo próprio (herda da mãe), só
em tarefa delegada, criada JUNTO com a mãe no mesmo formulário, sem efeito em `evaluateUserBadges`.

**As 12 lacunas que essa resposta deixava, respondidas em 2026-10-06 antes de escrever código**
(registradas como DEC-78..83 e ASK-V4-07..20 no STATE.json):

| lacuna | resposta |
|---|---|
| "'só delegada' — e a visibilidade `private`?" | delegada **e** privada; pública e quest global ficam fora (criar com subtask nelas é 400, não ignorado) |
| subtask pode ser criada depois da mãe? | sim — junto com a mãe **e** depois, no card e no diálogo |
| ciclo de vida | concluir, renomear e apagar |
| o que a trava bloqueia, se o quadro deixa arrastar para qualquer coluna? | entrar em `in-review`/`done` vindo de **qualquer** coluna; voltar para A Fazer/Em Andamento/Ajustes é livre |
| mãe já em revisão com subtask aberta: aprovar também é bloqueado? | sim — "nada termina com subtask aberta" nos três caminhos |
| a última subtask concluída move a mãe sozinha? | **sim**, só a partir de Em Andamento, para Em Revisão, com a mesma notificação de um movimento humano |
| quem opera subtask? | a mesma autoridade de editar a mãe |
| aritmética | cada subtask pela mesma regra da mãe, no instante em que ela foi concluída; só as concluídas somam (DEC-78) |
| subtask credita algo por si? | não — nem pontos nem `completedTasks` |
| `tasks.points` | grava 10 + 10·n e fica sincronizado até a mãe concluir (DEC-83) |
| mexer na lista de uma mãe em revisão/concluída? | não — 409 (DEC-80) |
| modo individual (N cópias) e backlog | cada cópia recebe as suas subtasks; backlog não aceita subtask na v1 |

### D-E. Como fazer a animação chegar a quem não aprovou

O voluntário conclui → mãe vai para revisão → o líder aprova → o prêmio é creditado ao
voluntário, mas **na sessão do líder**. O cliente do voluntário nunca vê o número.

Proposta: o cabeçalho guarda o último total que **aquele usuário** viu (`dq:points-seen:<userId>`,
via `lib/client-storage.ts`). Ao montar, se o total da sessão for diferente do guardado, anuncia
o delta. Isso anima no refresh e no login seguinte, sem depender de quem clicou.

Três ressalvas que precisam ser decididas junto:

- **primeira vez não anima** — sem baseline, um usuário com 500 pts não deve ver contagem a
  partir de zero;
- **troca de dispositivo/aba** anima de novo (o baseline é por navegador);
- **mudança por outra razão** (admin ajustando pontos, compra aprovada) também animaria — o
  número passa a significar "o que mudou desde a última vez que você viu", não "o prêmio desta
  tarefa". Aceitar isso é a decisão real.

---

## 3. Sequência proposta (cada linha é 1 commit revertível)

| batch | o que faz | risco | status |
|---|---|---|---|
| **V4-1** | inativação: `DeleteUserUseCase` passa a recusar com `ConflictError` quando há dependência; 409 legível no lugar do 500 com Prisma cru; teste de caraterização do estado atual antes | baixo — nenhuma UI usa o endpoint | **done** (2026-10-05) |
| **V4-2** | animação: o **cabeçalho** passa a contar gradualmente; chip mostra o valor final; chip translada ±10px em Y (para cima no aumento, para baixo na diminuição), desktop-only | médio — toca `points-delta.tsx`, `lib/points-delta.ts`, `app-header.tsx` e os testes que congelam o desenho atual | **done** (2026-10-05) |
| **V4-3** | animação chega a quem não aprovou (baseline em `dq:points-seen:<userId>`) | médio — é mudança de semântica, DEC-58 já respondida | **done** (2026-10-05) |
| **V4-4** | subtasks: schema + migration + domínio (`+10` na base, trava de status) | **alto** — schema novo, regra nova, **bloqueia em D-D** | pendente |
| **V4-5** | subtasks na UI (criar/concluir/travar no card e no diálogo) | alto | pendente |
| **V4-6** | `PATCH points`: `set` aceita negativo (a administração escreve o que a premiação produz) | médio — mexe em quirk congelado e na precedência de dois 400 | **done** (2026-10-05) |

V4-1 está fechado. V4-2 e V4-3 são o mesmo arquivo e devem ir juntos se o dono quiser. V4-4/5
precisam de D-D antes.

---

## 4. Projetos duplicados — já verificado, sem risco de deploy

Medido de novo em 2026-10-05:

- `prisma/seed.ts:12` faz `requireSeedDev("./seed.dev")`, e sob `tsx` **`require.resolve` devolve
  `prisma/seed.dev.js`** — um artefato de 28 de agosto, **com zero `deleteMany`**, enquanto
  `prisma/seed.dev.ts` (29 de agosto) tem **23**. Rodar o seed anexa, nunca limpa. É assim que os
  mesmos projetos aparecem em três conjuntos.
- **Deploy não roda seed.** `docker-compose.yml:46` e `scripts/db-safe-deploy.sh:23` só executam
  `prisma migrate deploy`. E `prisma/guard.ts:7` lança `"Seed de desenvolvimento bloqueada..."`
  a menos que `NODE_ENV=development`.

Ou seja: a duplicação é local, e não se reproduz no deploy. O `prisma/seed.dev.js` continua na
árvore como fonte do problema — o dono pediu para não mexer; a correção é uma linha (apagar o
`.js` ou resolver para o `.ts`).

---

## 5. A suíte e2e do quadro estava quebrada, e por duas razões (medido 2026-10-05)

O e2e **não faz parte dos gates G0–G4**, e por isso as duas coisas abaixo passaram despercebidas.
Verifiquei que ambas já existiam antes de qualquer mudança do plan-v4: rodei a suíte com as
mudanças guardadas no stash e ela falhou igual.

### 5.1 A suíte assumia que pontos nunca são negativos — o banco refuta

`tests/e2e/task-board.spec.ts` capturava o total do Coordenador e exigia `>= 0`. Medido na
instância real:

```
id 2  Coordenador      -20
id 4  Laboratorista  -6190
id 3  Gerente      -31030
```

A penalidade de atraso **não tem piso** (DEC-39), e o dono usa o sistema de verdade. A suposição
estava errada; o teste parava no primeiro caso. Corrigido no V4-2 para `Number.isFinite`.

### 5.2 A API de pontos não consegue expressar um total negativo — ASK-V4-05

A limpeza do e2e restaura o total do usuário com `PATCH /api/users/[id]/points {action:"set"}`.
Com baseline `-20` isso devolve **400**. Os três caminhos de `UpdateUserPointsUseCase` estão
congelados por teste (`use-cases.user-management.test.ts:307,311`) e nenhum produz negativo:

| ação | regra congelada | efeito num usuário em −20 |
|---|---|---|
| `add` | `Math.max(0, points + delta)` | não pode descer abaixo de zero |
| `remove` | exige `user.points >= command.points` | `-10 >= 10` é falso → rejeitado |
| `set` | rejeita entrada negativa | 400 "Pontos não podem ser negativos" |

Ou seja: **o caminho de premiação escreve totais negativos no banco, e nenhum caminho de
administração consegue escrevê-los de volta.** Um coordenador que ficou em −20 por atraso não pode
ser ajustado para −20 por um administrador — só para 0 ou para cima.

Isso é uma inconsistência do produto, não só do teste. Três saídas foram postas:

| opção | o que muda | decisão |
|---|---|---|
| **E1 — permitir `set` negativo** | alinha a API com DEC-39; mexe num quirk congelado | ✅ **escolhida (DEC-60)** |
| E2 — dar ao e2e uma saída pelo Prisma | o teste recupera o baseline escrevendo direto; a inconsistência do produto continua | rejeitada |
| E3 — aceitar a deriva | cada corrida deixa +10 no Coordenador | rejeitada |

Executado no **V4-6**. A suíte do quadro passou de 4/7 para **7/7**, e a suíte e2e inteira para
**12/12**. Consequência medida antes da correção: cada corrida subia o total do Coordenador em 10
sem restaurar — foi assim que ele foi de −20 para 0. O dono decidiu **não** restaurar para −20.

---

## 6. Aberto pelo V4-6 e ainda não decidido

**`{action:"set", points: null}` zera os pontos de um usuário em vez de ser recusado.**

Causa medida ao escrever o teste do V4-6 — a primeira versão do caso assumiu que `Infinity`
chegava como `Infinity` e passou com 200:

- JSON não tem `Infinity`: `JSON.stringify(Infinity)` devolve `null`;
- `Number(null)` é `0`, que é finito e passa pela checagem `!Number.isFinite(points)`.

Recusar `null` explicitamente é uma linha. Não foi feito porque é mudança de contrato, e o lote
estava autorizado só para o `set` negativo. Está fixado como caraterização em
`tests/unit/api/user-points-negative-set.test.ts` para não desaparecer como surpresa.

**`components/admin/ModernAdminPanel.tsx` (~1000 linhas) não tem teste nenhum**, e o V4-6 tocou
nele: o input de pontos passou a ter `min` condicionado à ação. A mudança está coberta só pelo
gate de tipos.

**Status dos dois, em 2026-10-06:** o primeiro foi corrigido (DEC-84 — `{action:"set", points:null}`
passa a ser recusado com 400, e a caraterização virou teste de recusa). O segundo foi aceito como
trabalho: virou a onda **V4-4b**, a ser executada antes do V4-5.

---

## 7. V4-4 executado (2026-10-06) — subtasks: schema, domínio, read model e os três caminhos da trava

### 7.1 O que a medição mudou em relação ao plano

| o plano dizia | o que foi medido |
|---|---|
| "a mãe não sai de **Em Andamento** enquanto houver subtask aberta" | a mãe entra em `in-review` por **três** portas — `PUT status`, `PATCH action=complete` e `POST approve` — e o quadro oferece **qualquer** coluna a partir de qualquer uma, inclusive `A Fazer → Em Revisão` direto (`move-rules.ts:71`). A trava passou a governar o **destino**, não a origem, e entrou nos três casos de uso. |
| "+10 por subtask na **base** da mãe" (DEC-56) | o dono, ao ver o exemplo numérico, escolheu outra aritmética: cada subtask é pontuada pela mesma regra da mãe, no instante em que **ela** foi concluída (DEC-78). A fórmula da DEC-56 está substituída; o `+10` continua existindo como base gravada em `tasks.points` (DEC-83). |
| subtask é detalhe do cartão (V4-5) | o cartão e o diálogo de detalhe **calculam o prêmio no cliente** (`projectedAward`). Sem as subtasks no JSON, uma tarefa de 3 subtasks continuaria anunciando 10 pontos. Por isso o read model veio para o V4-4 (DEC-79). |
| "trava devolve 400" | duas regras com naturezas diferentes: a **trava** é 400 (a transição pedida é inválida) e a **janela** — mexer na lista de uma mãe em revisão/concluída — é 409 (o estado do mundo é que está em conflito, a mesma natureza de "Tarefa já concluída"). DEC-80. |

### 7.2 O que entrou

- **schema**: `task_subtasks (id, taskId, title, completed, completedAt, createdAt)`, FK para
  `tasks` com `onDelete: Cascade` (igual a `task_assignees`/`task_user_progress`), índices
  `(taskId)` e `(taskId, completed)`. Migration `20261006171259_add_task_subtasks`, aplicada em
  5432 e 5433. **Sem FK para `users`** — subtask não tem responsável próprio, e por isso o guarda
  de deriva do V4-1 (`user-delete-schema-drift`) não é tocado.
- **domínio** (`backend/domain/task/subtask-rules.ts` + acréscimo em `points-rules.ts`): título
  obrigatório com o mesmo teto da tarefa (200), `subtaskBasePoints`, `openSubtasksCount`,
  `assertSubtasksAllowTransition`, `canEditSubtasksOf`, `shouldAutoMoveMotherToReview`,
  `supportsSubtasks`, `normalizeNewSubtasks`, `awardPointsForSubtask`, `totalAwardForCompletion`.
- **casos de uso**: `CreateTaskSubtaskUseCase`, `UpdateTaskSubtaskUseCase`,
  `DeleteTaskSubtaskUseCase`; `CreateTaskUseCase` passa a criar a lista junto com a mãe (e dá a
  cada cópia do modo individual a sua); `UpdateTaskUseCase`, `CompleteTaskUseCase` e
  `ApproveTaskUseCase` passam pela trava; `GetTaskByIdUseCase` e `ListTasksForActorUseCase`
  anexam as subtasks (em lote no quadro).
- **HTTP**: `POST /api/tasks/[id]/subtasks`, `PATCH`/`DELETE /api/tasks/[id]/subtasks/[subtaskId]`,
  e `subtasks` no corpo de `POST /api/tasks`. As rotas novas não têm `ensurePermission`: seguem o
  formato das 20 rotas já migradas — a rota autentica e mapeia erro, quem decide quem pode é o
  caso de uso (DEC-82).
- **cliente**: `entities/task.ts` valida `subtasks` com `default([])`, `lib/api/endpoints/tasks.ts`
  ganha os três métodos, `projectedAward` passa a somar as subtasks, e o selo de pontos do cartão
  diz a base real quando há subtask.

### 7.3 Testes escritos antes do código

| arquivo | contra a produção vigente |
|---|---|
| `tests/unit/modules/task-management/subtask-rules.test.ts` | falhou 20/20 — nada existia |
| `tests/unit/modules/task-management/subtask-use-cases.test.ts` | falhou 25/25 — cobertura **nova**: o módulo `task-management` não tinha teste nenhum de caso de uso sobre portas falsas |
| `tests/unit/api/task-subtasks.test.ts` | módulo REAL sobre portas falsas (a lição do B6-2a), 16 casos de status e precedência |
| `tests/integration/tasks-roundtrip.test.ts` | ganhou o caso com Prisma real: base 30, trava sem escrever, auto-move com notificação no banco, aprovação destravada, janela recusando, cascade |

### 7.4 Gates

G0 781 módulos / 3021 dependências, zero violação, allow-list vazia · G1 sem erro · G2 0 erros ·
G3 81 arquivos / 1050 testes · G4 suíte completa 91 arquivos / 1135 testes (integração 10 / 85) ·
e2e do quadro 2 passando + 1 falha conhecida + 5 "did not run" (**confirmado com `git stash`: o
baseline falha idêntico**) · shell 5/5.

G5/G6 (docs) **não** rodam neste lote: a interface de subtask — criar, concluir, o campo no
formulário — existe a partir do V4-5, e é então que o guia passa a descrever telas novas. O que
mudou de visível aqui foi o texto do selo de pontos do cartão.

### 7.5 Colisão de numeração de decisão (medida ao escrever este lote)

`displayquest-v2/plan-v5/` (PLAN.md + STATE.json + README alterado), criado pelo dono em
2026-10-06 e **ainda não commitado**, já ocupava **DEC-61..77**. O V4-4 ia usar DEC-61..64. As
decisões do V4-4 foram renumeradas para **DEC-78..84** e os 28 comentários de código
acompanharam. Antes de abrir decisão nova, `grep` os três `STATE.json`.

### 7.6 ASK-V4-06 fechado (DEC-84) — commit separado, no mesmo dia

O §6 ficou aberto porque o V4-6 estava autorizado só para o `set` negativo. Respondido em
2026-10-06: `PATCH /api/users/[id]/points` passa a ler o número do **valor bruto** do corpo, não de
`Number(body.points)`. `{action:"set", points:null}` deixa de zerar os pontos e passa a ser recusado
com 400. A checagem é de **tipo** antes de ser de valor, porque `Number(null)`, `Number("")` são `0` e
`Number(true)` é `1`. O que não mudou: string numérica continua aceita (`"12"` vale 12) e a mensagem de
rejeição é a mesma. A caraterização do V4-6 foi convertida em teste de recusa.

## 8. O que vem depois (ordem decidida pelo dono em 2026-10-06)

1. **V4-4b** — testes de UI em `components/admin/ModernAdminPanel.tsx` (~1000 linhas, zero testes, já
   tocado duas vezes). O dono pediu antes do V4-5.
2. **V4-5** — subtasks na UI: criar/renomear/concluir/apagar no cartão e no diálogo, campo no
   formulário de nova tarefa, e a UI **desabilitando** o movimento além de bloqueá-lo. Entra aqui o
   **GAP-P3-05** (o toast da conclusão direta, `task-card.tsx:256`, passa a anunciar o valor
   CREDITADO pela resposta, não o projetado) e os gates **G5/G6** do guia.
3. **plan-v5** só executa depois que o plan-v4 fechar (DEC-73).

---

## 9. V4-4b executado (2026-10-06) — testes de UI do `ModernAdminPanel`

`components/admin/ModernAdminPanel.tsx`: 1063 linhas, zero testes, já tocado duas vezes. O dono
pediu cobertura antes de mexer nele de novo. Resultado: **10 testes** em
`tests/unit/components/admin-panel-user-settings.test.tsx` e **seis defeitos achados**, quatro
corrigidos neste lote.

### 9.1 Como os testes montam o painel

Medido ao escrever: **o painel não renderiza sozinho.** Ele monta `ManageWorkSessionsDialog`
(linha 1054) e `UserApproval` (linha 499) sempre, e os dois chamam contexto no primeiro render —
`useWorkSessions deve ser usado dentro de um WorkSessionsProvider`, depois
`useProject deve ser usado dentro de um ProjectProvider`. O teste usa a stack real do app
(`app/client-layout.tsx:26-34`): `UserProvider > ProjectProvider > WorkSessionsProvider`.

Seams mockados: `useAuth` (é dele que o painel tira a permissão testada — sem mock,
`canManageUsers` é `false` e a aba de usuários renderiza vazia, e o teste passaria provando o
oposto do que pretende), `useTask` e `useRouter`. O painel, os diálogos e o `Select`/`Dialog` do
Radix são os reais. A rede é MSW gravando o corpo recebido — é assim que "chegou à API" é provado.

### 9.2 Os seis defeitos que os testes acharam

| # | o que está medido | o que foi feito |
|---|---|---|
| 1 | **DEC-60 inacabada.** O V4-6 abriu o negativo na rota, no use case e no `min` do input; o guard do salvamento ainda era `pointsNum >= 0`. O administrador digitava `-20` (o input deixava) e a chamada era **pulada em silêncio**. Mesma regra em três cópias, duas receberam a correção. | **corrigido** — `set` aceita negativo, `add`/`remove` continuam não-negativos; caso congelado em teste |
| 2 | `Number("")` é `0`, `!isNaN(0)` e `0 >= 0`: esvaziar o campo de pontos enviava `{action:"set", points:0}` e **zerava a conta** de um usuário. É o mesmo quirk que a DEC-84 recusou no servidor, do lado do cliente. | **corrigido** — vazio não é número; caso congelado em teste |
| 3 | `saveUserSettings` e `updateUserStatus` **lançavam** em toda falância e ninguém capturava: diálogo aberto sem mensagem de erro, rejeição não tratada no console e **`npx vitest run` saindo com exit 1** por "Unhandled Rejection" — o defeito quebrava o gate de entrega. | **corrigido (DEC-85)** — o erro do servidor aparece em `<p role="alert">` dentro do diálogo |
| 4 | Os três controles do caminho não tinham nome acessível: botão da linha era só o ícone `Settings`; o `Select` de ação sem `aria-label`; o input de valor sem `id` nem rótulo associado (o único "Pontos" próximo é o título da seção, sem `htmlFor`). | **corrigido (DEC-86)** — `aria-label` nos três |
| 5 | O `confirm` do botão "Rejeitar" diz *"Esta ação irá removê-lo do sistema"*. Medido: `reject` faz `status = "rejected"` e a linha **continua**. O guia já diz a verdade (`docs/src-usuario/12-perguntas-frequentes.md:47`). | **não corrigido** — `ASK-V4-26`, é texto visível e toca G5/G6 |
| 6 | O filtro de status do painel só oferece Ativo/Pendente/Inativo. `rejected` e `suspended` — os dois status que o próprio painel cria — não aparecem em **nenhum** filtro específico, só em "Todos". | **não corrigido** — `ASK-V4-27` |

### 9.3 Gates

G0 782 módulos / 3031 dependências, zero violação · G1 sem erro · G2 0 erros ·
G3 **82 arquivos / 1060 testes** · G4 completa **92 / 1145** · e2e shell 5/5.
