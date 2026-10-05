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

### 2.5 D-D. Escopo da subtask na v1 — **em aberto, bloqueia V4-4**

Perguntas abertas, todas com custo real de schema:

1. Subtask tem responsável próprio, ou é sempre da mesma pessoa da mãe?
2. Subtask existe em tarefa pública (`taskVisibility: "public"`) e em quest global (`isGlobal`)?
3. Subtask tem prazo próprio, ou herda o da mãe? (Se tiver prazo próprio, a penalidade de qual
   prazo usa?)
4. A mãe pode ser criada com subtasks, ou subtask só se adiciona depois?
5. Subtask concluída conta para badge/avaliação automática (`evaluateUserBadges`)?

Minha proposta de v1 (a mais pequena que satisfaz o pedido): **sem responsável próprio, sem prazo
próprio, fora de pública e global, criada depois da mãe, sem efeito em badge.**

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
| **V4-3** | animação chega a quem não aprovou (baseline em `dq:points-seen:<userId>`) | médio — é mudança de semântica, DEC-58 já respondida | pendente |
| **V4-4** | subtasks: schema + migration + domínio (`+10` na base, trava de status) | **alto** — schema novo, regra nova, **bloqueia em D-D** | pendente |
| **V4-5** | subtasks na UI (criar/concluir/travar no card e no diálogo) | alto | pendente |

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

Isso é uma inconsistência do produto, não só do teste. Três saídas:

| opção | o que muda |
|---|---|
| **E1 — permitir `set` negativo** | alinha a API com DEC-39; mexe num quirk congelado (3 testes movem) |
| E2 — dar ao e2e uma saída pelo Prisma | o teste recupera o baseline escrevendo direto; a inconsistência do produto continua |
| E3 — aceitar a deriva | o e2e para de restaurar; cada corrida deixa +10 no Coordenador da sua máquina |

Nenhuma foi executada. É decisão do dono.

</content>
