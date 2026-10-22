# Reset mensal de pontos + histórico de meses — MODELO

Status: **absorvido** (2026-10-22). O dono decidiu que o reset mensal com histórico entra
como parte do plano de gamificação remodelada: ver `../plan-v8/MODELO.md` (§4). Este
documento continua válido como detalhamento do ciclo mensal (snapshot, transação, cron,
ator de sistema), mas as perguntas de §6 deste arquivo foram respondidas no contexto novo:
o negativo fica guardado no snapshot e a coluna nova começa em 0 (decisão do dono,
`../plan-v8/MODELO.md` §2), e o histórico mensal vira tela dentro do plano (onda de telas
do plan-v8).

Pedido do dono (2026-10-22): "todo mês a pontuação resete, mas que haja um histórico de
meses com o estado do quadro até o último dia do mês".

## 1. A economia medida hoje

### Quem escreve `users.points` (três caminhos)

1. **Premiação idempotente** — `GamificationAwardHistoryPort.awardAndRecord`
   (`backend/modules/gamification/infrastructure/repositories/prisma-gamification-award-history.port.ts`):
   `$transaction` incrementa `users.points` e grava linha em `history`
   (`action: GAMIFICATION_AWARD`, `description: GAMIFICATION:<sourceType>:<sourceId>`,
   `metadata.pointsAwarded`). Os quatro `GamificationSourceType` do domínio
   (`backend/domain/gamification/Progression.ts:16-20`):
   - `WORK_SESSION_COMPLETED` — prêmio por sessão de trabalho concluída
     (`award-from-work-session.use-case.ts`, teto 40 h / bônus 30 tasks no golden);
   - `TASK_COMPLETED` — prêmio da tarefa (base `10 + 5·n` DEC-97, ×1,5 antecipada,
     atraso sem piso DEC-39), nos três caminhos complete/approve/patch-status;
   - `ACTIVITY_COMPLETED` — prêmio do cronograma distribuído por Hamilton
     (`award-from-activity-completion.use-case.ts`, DEC-103/104) — que também escreve
     `projects.points` (DEC-63/74, piso 0);
   - `MANUAL_ADJUSTMENT` — **nome morto no enum**: nenhum use case escreve com ele.
     O ajuste do painel não deixa rastro em `history` (ver §5).
2. **Loja** — `prisma-purchase.repository.ts`: compra decrementa `price` dentro do
   `$transaction` com re-checagem de suficiência (QUIRK-8S7); cancelamento devolve via
   `refundPoints`. Sem linha de `history`.
3. **Painel admin** — `UpdateUserPointsUseCase` (`set`/`add`/`remove`, DEC-60: `set`
   aceita negativo porque a premiação produz totais negativos). Sem linha de `history`.

### Quem lê `users.points`

Sessão/header (`lib/auth/config.ts`; baseline `dq:points-seen:<userId>` e chip
`announcePointsDelta`), ranking (pódio + "Classificação completa"), progressão
(`getUserProgression`), badges (`badge-rules.ts`: critérios numéricos e a condição de
texto "pontos" ≥ 100), suficiência da loja, painel admin / `AdminOverview`, perfil.

### Contadores e saldos vizinhos

- `users.completedTasks`: cumulativo para sempre, incrementado pelo task-management
  (`prisma-task-actors.repository.ts`); nunca é decrementado (DEC-40 congela também o
  `tasks.points` histórico).
- `projects.points`: saldo acumulado por projeto, escrito só pela economia de atividade.
- Ledger parcial: **premiações** têm data + valor em `history`; **compras, estornos e
  ajustes do painel não têm**. Não dá para derivar um mês a partir do ledger como ele é.
- A limpeza diária do feed (V6-11k) nunca apaga linhas `GAMIFICATION_AWARD` — a
  idempotência lê essas linhas e elas atravessam qualquer reset.

### O precedente semanal (a casa já fez isso com horas)

`weekly_hours_history` (tabela) + `ResetWeeklyHoursHistoryUseCase` (snapshot por usuário
ativo + zera `currentWeekHours`), disparado pelo cron `'0 0 * * 1'`
America/Sao_Paulo com `systemActor("WEEKLY_RESET")` (DEC-54: rotina é chamador sem
pessoa; `requireActorPermission` passa ator de sistema —
`backend/domain/identity/assert-permission.ts:58`). **QUIRK-7C: sem dedup** — run
repetido cria linha duplicada. O modelo mensal não deve herdar esse quirk.

## 2. O modelo proposto (Opção A — saldo do mês corrente + snapshot)

- `users.points` passa a significar **saldo do mês corrente**. Todo outro uso (loja,
  ranking, header) continua lendo a mesma coluna — o que muda é a semântica, não o
  contrato.
- Uma **run mensal por usuário**: snapshot do estado de fechamento + reset, **num único
  `$transaction`** por usuário. Não existe estado intermediário em que o mês está
  fechado e a coluna ainda aberta, nem o inverso (a ordem "snapshot primeiro, reset por
  último" do DEC-165 é a mesma lição; o tx a torna irrepartível).
- **Idempotência por constraint**: `@@unique([userId, month])` na tabela de histórico.
  Run repetida (redeploy, restart do container, gatilho manual) não duplica e não zera
  de novo: a linha existente diz "este mês já fechou para este usuário". Diferença
  deliberada com o semanal, que não dedupa.
- **Quando roda**: cron `'0 0 1 * *'` America/Sao_Paulo (dia 1, 00:00) — depois do
  sweep das 23:59 que fecha sessões abandonadas: se a sessão fechada no sweep premia,
  o prêmio pertence ao mês que fechou, e entra no snapshot. Mês chave derivado por
  aritmética de `backend/domain/time/cron civil-day.ts` (`civilDayOfInstant` do
  instante da run, mês = `YYYY-MM` anterior), nunca `new Date()` solto (DEC-132).
- **Quem chama**: `systemActor("MONTHLY_POINTS_RESET")` — reason novo na lista de
  `SystemReason` do domínio. Use case `ResetMonthlyPointsUseCase` no módulo de
  gamification, mesma família do `ResetWeeklyHoursHistoryUseCase`.
- **Audiência da snapshot**: precisa de decisão (§6, Q9). O semanal usa
  `findActiveUsers()` — quem está suspenso no instante do fechamento não tem snapshot,
  e o saldo dela desaparece sem histórico. O modelo sugere incluir **todos os usuários
  com saldo ≠ 0 ou atividade no mês**, não só os ativos; mas é pergunta, não decisão.

Esboço da tabela (nome de trabalho, não migration aprovada):

```prisma
model monthly_points_history {
  id             Int      @id @default(autoincrement())
  userId         Int
  userName       String            // denormalizado como no semanal
  month          String            // "2026-10" — mês civil que fechou
  monthStart     String            // data civil "2026-10-01"
  monthEnd       String            // data civil "2026-10-31"
  pointsAtClose  Int               // pode ser negativo (DEC-39)
  completedTasks Int?              // se Q1 responder "contadores também mensais"
  createdAt      DateTime @default(now())
  user           users  @relation(..., onDelete: ...)  // Cascade vs Restrict: Q9
  @@unique([userId, month])
}
```

## 3. O que NÃO muda (invariantes que o reset tem que preservar)

1. **Idempotência de premiação**: descrições em `history` continuam vivas; tarefa já
   premiada nunca é premiada de novo, mesmo depois do reset. A purga do feed continua
   sem tocar `GAMIFICATION_AWARD`.
2. **Regras de tarefa**: base `10 + 5·n` (DEC-97), antecipada ×1,5, atraso sem piso
   (DEC-39), trava de subtask (DEC-80/98), auto-move (DEC-81), `tasks.points` histórico
   intocado (DEC-40).
3. **Badges já concedidos** (`user_badges`).
4. **Compras e estornos**: a compra feita em outubro não some; estorno creditado em
   novembro sai do saldo de novembro (e pode levar novembro ao negativo — DEC-39 já
   aceita negativo).
5. **weekly_hours_history** e o reset semanal de `currentWeekHours`.
6. **Contratos de leitura**: sessão, lista de usuários e ranking continuam lendo
   `points`; nenhuma rota muda de forma.

## 4. Atribuição: o prêmio pertence ao mês do crédito

Com o snapshot no fechamento, a regra cai naturalmente: **o mês de um prêmio é o mês em
que o `$transaction` do award aconteceu**, não o da conclusão. Tarefa concluída em
10/31 e aprovada em 02/11 credita novembro. É consequência automática do desenho (o
snapshot fotografa a coluna no instante do fechamento, e coluna só muda por evento
real), mas precisa ser afirmada porque a pergunta "minha tarefa de outubro sumiu do
meu histórico?" vai chegar. Alternativa (reatribuir ao mês da conclusão) exigiria ledger
completo e re-cálculo retroativo — o modelo não recomenda e registra por quê.

Consequência irmã: tarefa em `in-review` no fechamento não tem prêmio em lugar nenhum —
ela não existe no histórico do mês, só no do mês em que for aprovada. Ver Q2: é o caso
que mais depende do que "estado do quadro" significa.

## 5. Efeitos colaterais medidos no desenho atual

- **Ajuste manual invisível**: `set`/`add`/`remove` do painel escrevem a coluna sem
  linha de `history`. Se um dia se quiser mostrar "ganhos × gastos do mês" derivado de
  ledger, ele não fecha: compras, estornos e ajustes não estão no ledger. O snapshot com
  `pointsAtClose` é honesto justamente porque não promete decomposição. Preencher o
  ledger (registrar loja e ajuste como `MANUAL_ADJUSTMENT`/`PURCHASE` em `history`) é
  batch separado, possível, e o nome do enum já existe parado.
- **Badges**: os critérios leem a coluna. "≥ 100 pontos" (condição de texto congelada)
  vira critério **mensal** depois do reset — badge de carreira fica inatingível para
  quem faz menos de 100/mês. `evaluateUserBadges` roda depois de cada credit, então
  continua funcionando; o que muda de valor é o critério. Q6.
- **Chip e baseline do header**: `dq:points-seen` faz o contador começar do último total
  visto. Na primeira visita depois do reset, a queda 800 → 0 vai se parecer com perda
  (o catch-up anima a diferença). Precisa de um ramo "reset" (rea-tarizar sem anunciar,
  ou anunciar o mês que fechou). Q8.
- **Loja**: hoje pontos são moeda acumulável. Com reset, a capacidade de compra passa a
  ser mensal; recompensa com preço acima da renda mensal típica fica inalcançável e
  guardar some. É a consequência econômica mais pesada do pedido. Q1.
- **`projects.points`** continua acumulado enquanto ninguém decidir o contrário (a
  economia de atividade acompanha o cronograma do projeto, que spane meses). Q3.

## 6. Perguntas ao dono (abertas antes do plano)

1. **Economia da loja** — a mais estrutural. (a) re-precificar recompensas para a
   renda mensal; (b) pontos mensais só para ranking, com a loja usando saldo de outra
   natureza (coluna de vida inteira ou ledger preenchido); (c) aceitar que a loja passa
   a ser consumo do mês. A escolha muda o schema (uma coluna vs duas) e não é
   reversível depois dos primeiros resets rodarem.
2. **O que é "estado do quadro"** — placar de pessoas no fechamento (pontos, e tarefas
   concluídas?), ou as colunas do board como estavam no último dia (contagens por
   status), ou ambos? Medido: o feed `history` é purgado diariamente (V6-11k mantém só o
   dia corrente) — se a resposta incluir colunas, o snapshot é a única oportunidade de
   capturar; reconstruir depois é impossível.
3. **Escopo do reset** — só `users.points`? `users.completedTasks` também reseta
   (ranking mensal coerente) ou continua cumulativo? `projects.points` reseta junto?
4. **Negativos** — `pointsAtClose` negativo (DEC-39) é zerado no reset (perdoa a
   dívida) ou carrega para o mês seguinte (a penalidade continua mordendo)? O snapshot
   guarda o valor de qualquer forma; a pergunta é o que a coluna recebe.
5. **Bootstrap do deploy** — o deploy acontece em outubro com saldos acumulados
   (inclusive negativos do legado). (a) primeiro fechamento 31/10 com o outubro parcial
   (saldo atual vira "2026-10"); (b) snapshot+reset no deploy e o histórico começa
   agora; (c) reset só a partir de 11/01 e o saldo legado nunca aparece em histórico.
   (c) deixa um discontinuity invisível: hoje 800, amanhã 0, sem registro de quando o
   800 virou 0.
6. **Badges** — mensais ou de vida inteira? Se de vida inteira, a avaliação tem que
   ler agregado do histórico (ou o critério numérico congela para sempre em ≥ o maior
   mês já fechado). Precisa decisão explícita; sem ela o sistema de badges muda de
   significado silenciosamente no primeiro reset.
7. **Mês de atribuição do prêmio** — confirmar o mês do crédito (§4) ou exigir mês da
   conclusão com reatribuição retroativa (o modelo desaconselha; registrar a recusa).
8. **Anúncio do reset** — a pessoa é avisada do fechamento (notificação no painel com o
   valor do mês?) ou o mês vira silenciosamente? E o header: o chip sabe que foi reset?
9. **Visibilidade e tela** — quem vê o histórico de quem (o ranking já expõe pontos a
   qualquer autenticado; histórico público é coerente, mas o plano de privacidade do
   perfil — DEC-143/178 — merece checagem explícita)? Onde aparece: seletor de mês no
   ranking, tabela no painel admin (analogia direta com a `WeeklyHoursTable`), "meus
   meses" no perfil, Home? E a FK da tabela de histórico: `Cascade` (apagar usuário apaga
   histórico dele — como no semanal) ou `Restrict`/`SetNull` (histórico sobrevive à
   conta)? O guarda `user-delete-schema-drift` conta toda FK nova para `users` como
   bloqueante a menos que declarada — decisão a registrar no batch.
10. **Mês fechado aceita correção?** Histórico imutável (o erro se corrige no mês
    corrente com ajuste manual) vs editar o fechamento (auditoria?).
11. **Audiência do snapshot** — ativos só (precedente semanal) ou todo usuário com saldo
    ≠ 0 ou atividade no mês? Suspenso no meio do mês: o saldo dele fecha histórico ou
    evapora? Usuário criado no dia 30 tem linha com 0 ou linha nenhuma?
12. **Idempotência confirmada** — `@@unique([userId, month])` (não herdar o QUIRK-7C do
    semanal). Confirmar que run manual via painel (analogia ao `create_week_history`
    fallback da rota semanal) existe ou não existe — e se existir, com o gate de gestão
    antes do efeito.

## 7. Alternativa registrada e por que não é a primeira

**Opção B — nunca zerar; derivar o mês do ledger.** O ledger de premiações já existe
com data e valor; faltam compras e ajustes. Com o ledger preenchido, "mês" vira view e
nada é destruído — badges de carreira, "ganhos × gastos" e correção retroativa ficam
naturais. Mas contraria o pedido literal ("a pontuação resete"), mantém a loja com moeda
de vida inteira, e exige migrar dois caminhos de escrita antes de qualquer leitura
funcionar. Se a resposta da Q1 for "(b) ranking mensal + loja com saldo próprio", a
Opção A com duas colunas (saldo do mês + saldo de loja) é o meio-termo que mantém o
pedido e a loja funcionando — e a Opção B inteira só volta a ser cogitada se o dono
quiser histórico derivado em tudo.

## 8. Superfícies tocadas (inventário para o futuro plano, não escopo aprovado)

- Schema + migration pela sequência segura da casa (diff offline → `migrate deploy`
  5432 **e** 5433 → `generate` → reiniciar dev server).
- Módulo gamification: use case novo + port; `SystemReason` novo; job no `cron-service`
  + expressão pinada em `tests/unit/services/cron-schedule.test.ts`.
- API de leitura do histórico (shape análogo ao `GET /api/weekly-hours-history?weekStart=`).
- Telas: ranking com mês, tabela mensal no painel (padrão `WeeklyHoursTable`), perfil,
  chip do header. G5/G6 (guia + recaptura) quando o comportamento visível fechar.
- Testes: roundtrip G4 da run mensal (dedup, negativo, suspenso, atribuição na virada),
  guards de constraint e de vocabulário de reason.
