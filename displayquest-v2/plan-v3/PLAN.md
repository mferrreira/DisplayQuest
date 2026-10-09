# plan-v3 — qualidade operacional: sessões, quadro e pontos

> Spec-driven: 1 onda = entregável independente; 1 batch = 1 commit revertível; gates
> completos por batch; evidência em `STATE.json`. Convenção idêntica à do `clean-arch/`
> (PLAN.md + STATE.json), porque é o processo ativo do repo.
>
> Origem: lista do dono em 2026-10-02 — 4 features e 3 fixes relatados por quem usa o
> sistema. Nada aqui vem de suposição sobre o código: cada item abaixo cita o arquivo e a
> linha medidos.

## 1. Propósito

Corrigir a economia de pontos (que hoje zera pontos de quem entrega no prazo), acabar com o
silêncio das pausas automáticas de sessão e tornar o quadro utilizável quando enche.

Não é: subtasks (excluído — DEC-38), redesign do quadro, push server-to-client (Web Push com
VAPID), nem as features de roadmap do `plan-v2`.

## 2. Restrições medidas antes de planejar

Estas restrições definem o que é possível e em que ordem. Todas verificadas no código.

| # | Restrição | Evidência |
|---|---|---|
| R1 | **A instância é HTTP em IP de rede.** Chrome e Firefox **não permitem pedir permissão de notificação fora de secure context**. Notificação nativa é impossível na instância de hoje sem TLS. | decisão do dono; MDN *Using the Notifications API* (rev. 2026-09-02) |
| R2 | Permissão de notificação só pode ser pedida **por gesto do usuário** — não no momento da pausa. | MDN, mesma página |
| R3 | Não existe service worker da aplicação (só `public/mockServiceWorker.js`, que é MSW) nem manifest. | `ls public/` |
| R4 | A pausa automática é **client-side** (cronômetro) e **server-side** (patch de leitura + varredura 23:59). Pausa server-side acontece com a aba fechada: nenhuma notificação de navegador a alcança. | `components/ui/floating-session-timer.tsx:96-127`, `backend/domain/work/session-rules.ts:61-76`, `lib/services/cron-service.ts:86` |
| R5 | A aritmética de atraso existe **em dois lugares com duas matemáticas**: backend conta `ceil(Δt/24h)` sobre a data crua; o frontend parseia data-only como **meio-dia local**. Os dois divergem. | `backend/domain/task/task-rules.ts:114-133` vs `features/tasks/utils/move-rules.ts:130-142` |
| R6 | O quirk "penalty pode exceder os pontos" está **congelado por teste explícito**, inclusive o caso que produz o bug. | `tests/unit/modules/task-management/domain.task-rules.test.ts:120-129` (linha 124: `23h -> ceil 1`) |
| R7 | O delta de pontos creditados **não chega ao cliente**: `withActorProgress` não carrega `awardedPoints`. Sem fonte autoritativa, a animação teria que recalcular e divergir. | `backend/domain/task/task-rules.ts:227-238` |
| R8 | Há **dois formulários de tarefa vivos** com defaults de pontos divergentes: o do quadro (10) e o do detalhe do projeto (50, e 25/50/100/150 por prioridade). | `features/tasks/components/task-dialog.tsx:111,132` vs `components/forms/task-form.tsx:205,225-230` |
| R9 | Importar backlog cria tarefa com **0 pontos** quando a linha não traz `@N`. | `features/tasks/utils/move-rules.ts:184` |
| R10 | `tasks.points` tem default 0 no schema. | `prisma/schema.prisma` (`points Int @default(0)`) |
| R11 | **Nenhum uso de `localStorage`** em código de aplicação hoje. Introduzir estado client-side exige um seam próprio, senão cada componente inventa o seu. | grep `localStorage` em `app components features lib hooks contexts` → zero |
| R12 | A coluna do quadro não tem altura máxima: `min-h-[400px] … overflow-hidden`. O crescimento é vertical e infinito. | `features/tasks/components/board-column.tsx:45` |
| R13 | Cartão concluído não é arrastável para **ninguém**, mas a regra de negócio já permite reverter para líderes — e o menu "Mover para" oferece destinos que o servidor recusaria. | `features/tasks/components/task-card.tsx:232` (`isDragDisabled={task.status === "done"}`) vs `features/tasks/utils/move-rules.ts:39-41` |
| R14 | Frontend importar `backend/domain` **não é proibido** pelo gate (RG-05 só veda Prisma/`lib/database/prisma`), e já é padrão da casa (`lib/auth/features.ts` re-exporta o domínio; `components/layout/nav-config.ts` consome). | `.dependency-cruiser.js:197-198` |
| R15 | **O domínio não pode importar `lib/`.** RG-01 lista `LAYER.lib` entre os proibidos para `backend/domain/` — e hoje zero arquivo do domínio importa `lib/`. Reaproveitar `lib/date-only.ts` na regra de pontos **quebraria o gate G0**. O domínio já tem o precedente próprio de data civil: `spParts`/`SP_OFFSET_MS` em `ReportPeriod.ts` (UTC-3 fixo, sem DST desde 2019). | `.dependency-cruiser.js:57-69`, `grep "from \"@/lib/" backend/domain/` → zero |

### O bug de pontos, resolvido antes de planejar

`awardPointsForCompletion = points - daysLate * points`, com `daysLate = ceil((completion − dueDate) / 24h)`.
Uma tarefa com prazo **hoje** entra no banco como data-only, vira meia-noite UTC, e quem entrega às
15h do mesmo dia soma 18 horas → `ceil` = **1 dia de atraso** → penalidade = todos os pontos →
**crédito zero**. É exatamente o que o dono relatou. O valor absurdo visto numa captura
(`60 pts(agora: -37140 pts com penalidade)`) é o mesmo mecanismo aplicado a uma tarefa vencida
há ~620 dias.

Consequência de planejamento: **a Onda 1 vem primeiro**. A animação de pontos (Onda 4) não pode
existir antes de o delta ser correto e vir do servidor.

## 3. Mapa de itens

| ID | Item (como foi pedido) | Onda | Natureza |
|----|---|:--:|---|
| X1 | "Tasks completas no dia dão pontos zerados"; pontuação inteira no dia; multiplicador para entrega adiantada; 10 pontos fixos por task | **1** | regra de domínio + UI |
| F1a | Alerta visual + sonoro quando a sessão pausa | **2** | client |
| F2 | Caixa de notas da sessão salva em localStorage, despejada no log final, limpa só em sucesso | **2** | client + seam |
| X2 | Altura fixa das colunas do quadro com scroll por coluna | **3** | layout |
| X3 | Mover tarefa concluída: retirar a opção onde não é permitido, ou barrar no backend | **3** | UI/regra |
| F3 | Ordenação própria e customizável por coluna, salva por sessão | **3** | client + seam |
| F4 | Animação `+X` verde / `−X` vermelho incrementando ao longo de 1s | **4** | client + contrato |
| F1b | Notificação nativa do navegador | — | **FORA** (DEC-49) |
| — | Subtasks | — | **FORA** (DEC-38) |

## 4. Estrutura de arquivos

```
displayquest-v2/plan-v3/
├── PLAN.md                    este plano
└── STATE.json                 máquina de estados v3.0.0 (ondas, batches, gates, decisões, gaps)

backend/domain/
├── time/civil-day.ts          NOVO: dia civil America/Sao_Paulo (UTC-3 fixo), puro, zero import
└── task/
    ├── points-rules.ts        NOVO: dias de calendário, premiação, multiplicador
    └── task-rules.ts          re-exporta points-rules (mesmo padrão de lib/work-sessions/schedule.ts)

lib/
└── client-storage.ts          NOVO: seam único de estado client-side (SSR-safe, namespace, JSON)

features/tasks/
├── utils/column-order.ts      NOVO: ordenações por coluna + chaves de persistência (puro)
├── utils/move-rules.ts        deixa de duplicar a penalidade; passa a consultar o domínio
└── components/
    ├── board-column.tsx       altura fixa + scroll
    ├── task-board.tsx         ordenação por coluna
    ├── task-card.tsx          menu honesto sobre o que pode mover
    └── task-dialog.tsx        remove o campo de pontos

components/
├── forms/task-form.tsx        remove PRIORITY_POINTS e o campo de pontos
├── ui/points-delta.tsx        NOVO: +X / −X animado
└── ui/session-notes-draft.tsx NOVO: caixa de notas persistida

lib/notifications/
└── browser-notifications.ts   NOVO na Onda 2; sem chamador depois de DEC-49 (ver §5)

tests/
├── unit/modules/task-management/domain.points-rules.test.ts   NOVO
├── unit/lib/client-storage.test.ts                            NOVO
├── unit/lib/browser-notifications.test.ts                     NOVO
├── unit/components/points-delta.test.tsx                      NOVO
├── unit/components/session-notes-draft.test.tsx               NOVO
├── unit/api/tasks-approve-route.test.ts                       NOVO
├── e2e/task-board.spec.ts                                     estendido (altura/scroll/ordenação)
└── integration/tasks-roundtrip.test.ts                        estendido (aprovar no dia do prazo)
```

## 5. Ondas

### Onda 0 — setup

Um batch.

- **S0.1** branch `plan/v3-operacional`, tag `pre-plan-v3` no commit base, `STATE.json` v3.0.0
  zerado com baseline medido (64 arquivos / 721 testes, 725 módulos / 2737 dependências,
  allow-list vazia), `displayquest-v2/README.md` e `AGENTS.md` apontando para o plano.

Sem código de aplicação. Gates: nenhum (nada muda).

### Onda 1 — economia de pontos (X1)

Quatro batches. **Caracterização antes de mudança**: o quirk está congelado por teste, e o
plano o descongela deliberadamente — isso precisa estar registrado, não embutido num diff.

- **1.A — golden de caracterização.** Rodar os testes atuais e gravar o comportamento de hoje
  num teste explícito de "estado anterior" (`domain.points-rules.test.ts`, bloco
  `comportamento pré-v3`), incluindo o caso do dia do prazo → 0. Isso torna o batch revertível
  e a mudança auditável.
- **1.B — regra nova no domínio.** `backend/domain/task/points-rules.ts` +
  `backend/domain/time/civil-day.ts` (novo, puro, zero import):
  - `POINTS_PER_TASK = 10`;
  - dias contados por **calendário em `America/Sao_Paulo`** (UTC-3 fixo, sem DST desde 2019),
    no padrão já existente do domínio (`spParts`/`SP_OFFSET_MS` de `ReportPeriod.ts`) — **não**
    via `lib/date-only.ts`, que RG-01 proíbe (R15). Prazo de hoje entregue hoje **não é atraso**;
  - `civilDay(instant): "YYYY-MM-DD"` aceita também data-only cru, porque `tasks.dueDate` é
    `String?` e o formulário do quadro envia `YYYY-MM-DD` (`task-dialog.tsx:200`, `<Input type="date">`);
  - premiação: adiantada `10 × 1.5 = 15`, no dia `10`, sem prazo `10`, atrasada `10 − diasAtrasados × 10`;
  - **sem piso**: a premiação pode ficar negativa (DEC-39). Consequência aceita pelo dono e
    que a UI precisa exibir sem disfarce — ver §7.
  - `task-rules.ts` passa a re-exportar `points-rules.ts`, para não tocar importadores
    (precedente exato: OND0-B5 / DEC-03 — as regras saíram de `lib/work-sessions/schedule.ts`
    para `backend/domain/work/schedule.ts` e o caminho antigo re-exporta até hoje).
- **1.C — mata a duplicação.** `features/tasks/utils/move-rules.ts` deixa de ter `latePenalty`
  e `projectedAward` próprios e passa a chamar o domínio (permitido por R14). Elimina a
  divergência R5 por construção, não por revisão.
- **1.D — 10 pontos fixos na superfície.** Remove o campo de pontos dos dois formulários
  (R8) e o default por prioridade; `parseBacklogLines` continua aceitando `@N` e **ignora o
  valor** (DEC-41 — não quebra backlog que as pessoas já têm escrito); as rotas de criação
  ignoram `points` vindo do cliente e gravam 10 (`app/api/tasks/route.ts:104,120`).
  **Nenhum `UPDATE` em `tasks.points` existente** (DEC-40): o valor gravado deixa de importar,
  e o que foi creditado continua registrado em `task_user_progress.awardedPoints`.

**Testes da onda**

| Teste | O que prova |
|---|---|
| `tests/unit/modules/task-management/domain.points-rules.test.ts` | adiantada 15 / no dia 10 / sem prazo 10 / 1 dia de atraso 0 / 2 dias −10; prazo de hoje entregue hoje = 10 |
| `tests/unit/modules/task-management/domain.task-rules.test.ts` | casos 120-129 reescritos para a nova semântica, com comentário citando a decisão |
| `features/tasks/__tests__/move-rules.test.ts` | frontend e backend produzem o mesmo número para a mesma tarefa |
| `tests/unit/api/tasks-approve-route.test.ts` | `POST /api/tasks/[id]/approve` não aceita `points` do cliente |
| `tests/integration/tasks-roundtrip.test.ts` | Prisma real: aprovar no dia do prazo credita 10 |

**Efeito colateral conhecido:** o detalhe da tarefa hoje mostra `PRIORIDADE High`,
`STATUS to-do` e `PRAZO 21T12:00:00.000Z/01/2025` (defeitos medidos, registrados em
`AGENTS.md`). O campo de pontos sai da tela nesta onda; os outros dois ficam para a Onda 6
(§8), para não misturar layout com regra de negócio.

### Onda 2 — sessão de trabalho: nota e alerta (F2 + F1a)

Três batches.

- **2.A — seam de estado client-side.** `lib/client-storage.ts`: namespace de chaves, leitura
  tolerante a JSON quebrado, sem acesso a `window` fora do cliente. Existe porque R11: sem
  seam, cada componente inventa o seu e o próximo batch herda três implementações diferentes.
- **2.B — caixa de notas da sessão.** `components/ui/session-notes-draft.tsx`, montada no
  cronômetro. Regras:
  - o texto é salvo **por sessão** (chave inclui o id da sessão), com debounce;
  - ao abrir **Finalizar Work Session**, o texto é despejado na caixa de log e continua
    editável ali;
  - **limpa só quando o encerramento tem sucesso**; se a chamada falha, o texto permanece;
  - trocar de sessão não herda a nota da sessão anterior.
- **2.C — alerta de pausa.** Na pausa automática (e na pausa manual), além do diálogo que já
  existe:
  - **alerta visual** sempre (o diálogo atual já cobre; reforça-se o estado no cronômetro
    fechado, que hoje não sinaliza nada);
  - **som** via WebAudio, sem asset binário (DEC-37), opcional e desligável;
  - nada de `window.alert`.

**Testes da onda**

| Teste | O que prova |
|---|---|
| `tests/unit/lib/client-storage.test.ts` | namespace, JSON corrompido não derruba, ausência de `window` não quebra SSR |
| `tests/unit/components/session-notes-draft.test.tsx` | salva, recupera por sessão, despeja no log, **não** limpa em falha, limpa em sucesso |
| `tests/unit/components/floating-session-timer.test.tsx` | estende o existente; mantém o mock de `ResponsibilitiesAPI` (gotcha conhecido da casa) |
| `tests/unit/lib/browser-notifications.test.ts` | sem `Notification` no ambiente, o seam degrada sem lançar |

### Onda 3 — quadro: altura, mover, ordenação (X2 + X3 + F3)

Três batches, na ordem — os três tocam os mesmos arquivos.

- **3.A — altura fixa e scroll por coluna.** `board-column.tsx`: altura máxima derivada da
  janela, `overflow-y: auto` por coluna, cabeçalho da coluna fixo. O scroll passa a ser
  **por coluna**, não da página.
- **3.B — mover tarefa concluída.** Decisão do dono: retirar a opção onde ela não é
  permitida, ou barrar no backend. O caminho mais curto e mais honesto é **retirar a opção**:
  `move-rules.ts` ganha `allowedTargets(task, isLeader)` e o menu do cartão só lista destinos
  que o servidor aceitaria. A regra de negócio (não-líder não reverte `done`) **não muda** —
  ela já está implementada e testada. Arrastar `done` continua desabilitado para todos:
  quem pode reverter usa o menu. Alternativa registrada e rejeitada: abrir arrastar para
  líderes, que criaria dois caminhos para a mesma operação.
- **3.C — ordenação por coluna.** `features/tasks/utils/column-order.ts` (puro): opções
  `urgência`, `prazo`, `mais recentes`, `pontos`, `alfabética`; padrão atual preservado
  (urgência + prazo). Persistência em `localStorage` via `lib/client-storage.ts`, chave por
  coluna, por pessoa e navegador (DEC-33 — o texto citava DEC-34, que é a decisão do movimento
  para fora de Concluído; corrigido ao executar, em 2026-10-03). O estado de filtro que já é URL
  (`nuqs`) **não** muda: ordenação é preferência, não link compartilhável.

**Testes da onda**

| Teste | O que prova |
|---|---|
| `features/tasks/__tests__/column-order.test.ts` | cada ordenação é estável e determinística; padrão idêntico ao comportamento atual |
| `features/tasks/__tests__/move-rules.test.ts` | `allowedTargets` não oferece destino que a regra bloqueia |
| `features/tasks/__tests__/task-board.test.tsx` | ordenação escolhada é aplicada por coluna e sobrevive a re-render |
| `tests/e2e/task-board.spec.ts` | **único lugar** onde altura fixa e scroll por coluna são verificáveis: jsdom não mede layout |

::: nota
Altura de coluna e scroll **não têm teste unitário honesto possível**: jsdom não calcula
layout. A prova é o spec Playwright contra a instância, medindo `scrollHeight > clientHeight`
na coluna e `clientHeight` limitado. Teste unitário aqui seria teatro.
:::

### Onda 4 — animação de pontos (F4)

Dois batches.

- **4.A — contrato primeiro.** Conclusão e aprovação passam a devolver o prêmio **creditado**:
  `TaskProgressEvents.onTaskCompleted` deixa de devolver `void` e repassa o valor que o award
  creditou (DEC-48), os casos de uso devolvem `TaskCompletionResult { task, awardedTo,
  awardedPoints }`, e o schema de resposta em `lib/api/endpoints/tasks.ts` expõe o par. Sem
  isso, o cliente recalcula e diverge (R7).
  **Correção registrada:** o texto original previa `withActorProgress` carregando `awardedPoints`
  — medido, esse read model é congelado e é o overlay de progresso da *lista*; o valor que ele
  carregaria seria o **pedido**, não o creditado (award já registrado credita 0, `Math.floor`
  sem clamp, award falho é engolido). E `awardedTo` é necessário porque a aprovação credita o
  **responsável** pela tarefa, quase nunca quem aprovou.
- **4.B — animação.** `components/ui/points-delta.tsx`: chip `+15` verde / `−10` vermelho
  ancorado no contador de pontos do cabeçalho (`app-header.tsx:146-150`), com o número
  **incrementando ao longo de 1s** e o contador do cabeçalho acompanhando o valor novo.
  Só anima quando `awardedTo` é a pessoa logada — no resto dos casos o chip não aparece, porque
  o prêmio foi para outra pessoa. Respeita `prefers-reduced-motion` (mostra o valor final sem
  animar).

**Testes da onda**

| Teste | O que prova |
|---|---|
| `tests/unit/api/tasks-approve-route.test.ts` | resposta traz `awardedPoints`/`awardedTo` como o caso de uso devolveu, com `0` ≠ `null` |
| `tests/unit/modules/task-management/task-completion-award.test.ts` | o **creditado** atravessa a porta (não o pedido) e falha de award vira `null` |
| `tests/unit/components/points-delta.test.tsx` | sinal, cor e valor final; com `prefers-reduced-motion`, sem animação |
| `features/tasks/__tests__/task-board.test.tsx` | concluir/aprovar dispara o delta uma única vez, e só quando quem ganhou foi a pessoa logada |

### Onda 5 — notificação nativa (F1b) — removida do plano (DEC-49)

**Não faz mais parte do plano.** O registro fica aqui porque apagar a onda do documento sem
rastro pareceria que ela nunca existiu. Existiu como Onda 5, planejada em 2026-10-02, adiada por
DEC-42 (dependia de TLS, não de código) e **removida em 2026-10-03** por DEC-49, quando o dono
optou por tirar o batch em vez de esperar a infra. Ela saiu de `waves`, de `batches` e de
`blockers` no `STATE.json`, e o que era dela está em `removedItems` com o motivo.

- **O que seria o 5.A:** ligar o seam `lib/notifications/browser-notifications.ts` (criado na
  Onda 2) ao fluxo de pausa — botão explícito "ativar avisos" (gesto, por R2), pedido de
  permissão uma vez, dedupe por `tag` para não empilhar, e degradação silenciosa para o alerta
  da Onda 2 quando o contexto não é seguro.
- **Por que não executava:** R1. Em `http://<ip>:3000` o Chrome e o Firefox **recusam o pedido
  de permissão**. O que resolveria, se um dia a notificação nativa voltar: HTTPS por certificado
  válido num domínio, autoassinado com confiança instalada nas máquinas, ou proxy reverso com
  TLS. O que **não** resolve: `http://localhost`, que só vale para quem acessa a própria máquina.
- **O que fica no lugar do sinal:** o alerta da Onda 2 (F1a) — sempre visível no cronômetro e,
  opcional, som ligado por gesto. **Nenhum critério de aceite dependia de F1b** (AC-P3-04 é o
  alerta in-app), então remover a onda não abre nenhuma lacuna de entrega.
- **O que sobra na árvore:** o seam `lib/notifications/browser-notifications.ts` e o seu teste,
  **sem nenhum chamador** (medido em 2026-10-03: zero referências fora do próprio teste). A
  decisão sobre esse código órfão está em §8.

## 6. Gates por batch

Idênticos aos do `clean-arch`, com dois acréscimos porque este plano toca interface e documento.

- **G0** `npm run arch:check` — exit 0, allow-list **vazia**. Import novo de `features/` →
  `backend/domain` é permitido (R14); import novo de `components/` → Prisma derruba o gate.
- **G1** `npx eslint --no-eslintrc --config .eslintrc.json <arquivos>` — exit 0.
- **G2** `npx tsc --noEmit` — 0 erros.
- **G3** `npx vitest run tests/unit features` — sem banco.
- **G4** `npx vitest run` completo contra `dq-dev-test-db` :5433 (`npm run db:test:up` +
  `npm run db:test:setup`). **Nunca** contra `display-quest-db` :5432.
- **G5** `npm run docs:build` + `npm run docs:check` — obrigatório nos batches que mudam
  comportamento visível: o guia do usuário descreve a tela, e tela que muda sem o guia mudar
  torna o guia errado.
- **G6** recaptura quando a captura ficou mentirosa: `node scripts/capture-user-guide.mjs
  --only=<telas>` e rebuild. Vale para Onda 1 (formulário sem campo de pontos), Onda 3
  (quadro com scroll) e Onda 4 (chip de pontos).

Baseline medido no S0.1 (registrado em `STATE.json` → `baseline`): **67 arquivos / 675 testes**,
731 módulos / 2748 dependências, allow-list 0. No encerramento do plano: **75 arquivos / 881
testes**, 748 módulos / 2816 dependências no commit `dbd067e`, com G0–G4 e o e2e do quadro
verdes (7/7).

## 7. Decisões e lacunas

### Registradas (conversadas com o dono em 2026-10-02)

- **DEC-30** — 10 pontos fixos por tarefa; o campo sai dos formulários. A coluna `points`
  permanece no schema como histórico e `task_user_progress.awardedPoints` permanece como
  registro do que foi creditado.
- **DEC-31** — atraso medido em **dias de calendário** no fuso do laboratório, não em fração
  de 24 horas. Entregar no dia do prazo não é atraso.
- **DEC-32** — entrega adiantada multiplica por **1,5** (15 pontos). Sem prazo: 10.
- **DEC-33** — ordenação por coluna persiste em **localStorage**, por pessoa e navegador.
- **DEC-34** — mover para fora de "Concluído": a regra atual de permissão **não muda**; a
  interface deixa de oferecer destino que o servidor recusaria.
- **DEC-35** — notificação split em **F1a** (alerta in-app + som, funciona em HTTP hoje) e
  **F1b** (nativa, exige HTTPS). Nenhuma onda depende de F1b para entregar valor.
- **DEC-36** — som gerado por WebAudio, sem asset binário no repositório.
- **DEC-37** — o quirk "penalidade pode exceder os pontos" é **mantido**: o que muda é a
  contagem de dias (calendário, não fração de 24h), não a permissão de ficar negativo. O teste
  que o congela é preservado e o comportamento anterior é caracterizado na Onda 1.A, porque a
  aritmética de dias **muda** e o batch precisa ser auditável.
- **DEC-38** — subtasks **fora** deste plano.
- **DEC-39** — a premiação **pode ficar negativa**: sem piso na penalidade. Consequência
  aceita explicitamente pelo dono — tarefa muito atrasada produz valor grande negativo, o
  total de pontos da pessoa pode cair e o ranking pode exibir saldo negativo. A UI mostra isso
  sem disfarce (a animação da Onda 4 usa `−X` vermelho exatamente para esse caso).
- **DEC-40** — nenhum `UPDATE` em `tasks.points` existente.
- **DEC-41** — o token `@pontos` do backlog continua aceito e é ignorado.
- **DEC-42** — Onda 5 adiada; as ondas 1–4 executam sem TLS.

### Registradas na execução (mediu-se e corrigiu-se; ver `STATE.json` → `decisionRegistry`)

DEC-43 a DEC-48 nasceram de medir antes de executar: a restrição R15 do gate G0 (DEC-43), a
remoção do gate `points > 0` na aprovação (DEC-44), o log da sessão continuando obrigatório
(DEC-46), o que "Mais recentes" e "Pontos" ordenam de fato (DEC-47) e `awardedPoints` como valor
**creditado**, pareado com `awardedTo` (DEC-48).

- **DEC-49** — **a Onda 5 é removida do plano, junto com o BLK-01.** Decisão do dono em
  2026-10-03, respondendo `ASK-P3-03`: o sinal de pausa aceito em HTTP é o da Onda 2 (F1a),
  sempre visível no cronômetro e, opcional, com som ligado por gesto. A notificação de sistema
  sai do escopo e volta **só** se o dono a pedir com HTTPS no ar. Nenhum critério de aceite
  dependia dela. Consequência registrada: o seam `browser-notifications.ts` fica órfão (§8).

### Lacunas: fechadas (2026-10-02; GAP-P3-02 revisada em 2026-10-03 por DEC-49)

| Gap | Pergunta | Resolução |
|---|---|---|
| GAP-P3-01 | a premiação pode ficar negativa? | **Sim** (DEC-39). Recomendação da casa (piso em zero) foi recusada conscientemente. |
| GAP-P3-02 | HTTPS na instância do laboratório | **Adiado** (DEC-42) e depois **removido do plano** (DEC-49): a notificação nativa saiu do escopo; o alerta da Onda 2 é o sinal aceito em HTTP. |
| GAP-P3-03 | pontos já gravados nas tarefas existentes | **Mantidos** (DEC-40). Nenhum rewrite retroativo. |
| GAP-P3-04 | token `@pontos` do importador de backlog | **Aceito e ignorado** (DEC-41). |

::: limite
Consequência registrada de DEC-39, para não aparecer como surpresa depois: com penalidade
linear sem piso, uma tarefa vencida há 620 dias rende `10 − 6200 = −6190`. O número absurdo
visto na captura do guia **não é um bug isolado** — é esta regra funcionando. O que a Onda 1
conserta é a contagem de dias (entregar no prazo deixa de contar como atraso); o valor grande
negativo em tarefa antiga continua possível, por decisão.
:::

## 8. Fora deste plano, mas na fila

Defeitos medidos na captura do guia (listados em `AGENTS.md`, seção *Defeitos de interface
medidos*) que não pertencem a estas ondas por tocarem outra camada:

- **Onda 6 candidata — legibilidade e consistência de interface:** `<title>` genérico em todas
  as telas; strings sem acento; enum vazado no detalhe da tarefa (`High`, `to-do`); prazo
  renderizado quebrado; `/login` e `/register` sem heading; cabeçalho que se apresenta de duas
  formas conforme o papel. **Densidade do cartão**, medido no 3.A: em visão normal o cartão
  mede 271–360 px de altura, então a coluna limitada (628 px numa janela de 900 px) mostra
  cerca de dois cartões por vez; a visão **Compacto** existe, mas é preciso medir se ela
  devolve densidade suficiente antes de tratar isso como defeito.
- **Onda 7 candidata — dados de lixo na instância real:** tarefas `rewqr` e `asfsa`, projeto
  `asdfasdf`.

### Fica na árvore sem destino — decisão do dono (medido em 2026-10-03)

`lib/notifications/browser-notifications.ts` (134 linhas) e o seu teste (231 linhas) existem
porque a Onda 2 os criou como costura para a F1b, e a F1b saiu do plano (DEC-49). **`grep -rn
browser-notifications` devolve só o próprio teste: zero chamadores em código de aplicação.**
As duas saídas honestas são **manter** (costura pronta e testada, sem quem a invoque — o que o
cap. 15 de `docs/` já registra como divergência consciente) ou **apagar o seam e o teste
juntos** (batch pequeno, só código, sem infra, com G0–G3). Enquanto o dono não escolher, fica
como está.

## 9. Ordem e por quê

```
0 setup
1 pontos        (corrige a economia; pré-requisito da animação)
2 sessão        (a reclamação mais alta; independente do resto)
3 quadro        (três itens nos mesmos arquivos, numa ordem que evita conflito)
4 animação      (depende do contrato da onda 1)
```

Onda 2 e Onda 3 são independentes entre si e da Onda 1: se for preciso inverter por urgência
de uso, inverte-se sem quebrar nada. O único encadeamento duro é **1 → 4**. Havia uma quinta
onda (notificação nativa), que dependia de HTTPS e saiu do plano por DEC-49 — a ordem acima é a
que foi executada, do começo ao fim.

## 10. Como o estado é monitorado

`STATE.json` (v3.0.0) é a fonte. Campos:

- `waves[]` / `batches[]` com `status` (`planned` → `in_progress` → `done`), `gates`, `evidence`;
- `baseline` medido no S0.1 e atualizado a cada batch concluído;
- `decisionRegistry` (DEC-30..49) e `gapRegistry` (GAP-P3-01..05; GAP-P3-05 segue **aberto** e
  não bloqueia nenhum critério de aceite — ver §11);
- `blockers` — vazio desde DEC-49;
- `removedItems` — o que saiu do plano, com a decisão que tirou, o motivo e o que ficou na árvore;
- `answeredInstructions` — perguntas já respondidas pelo dono; a que estiver pendente fica em
  `awaitingInstruction` (hoje: nenhuma);
- `rollbacks` — tag `pre-plan-v3` mais um commit por batch;
- `awaitingInstruction` — o que está parado esperando resposta do dono.

Regra de fechamento: **batch não entra em `done` com gate vermelho ou lacuna aberta que ele
mesmo depende.**

## 11. Encerramento

O plan-v3 foi encerrado em **2026-10-03** (`STATE.json` → `status: done`, `activeWave` e
`activeBatch` nulos): **13 batches** executados — S0.1, 1.A–1.D, 2.A–2.C, 3.A–3.C, 4.A–4.B —
com G0–G4 verdes e e2e do quadro 7/7, e a Onda 5 removida por DEC-49. Os **10 critérios de
aceite continuam cobertos**: nenhum deles era sobre notificação nativa.

Duas coisas seguem **abertas de propósito**, e nenhuma delas é pendência do plano:

- **GAP-P3-05** — o toast da conclusão direta ainda anuncia o número *projetado*
  (`features/tasks/components/task-card.tsx:256`) em vez do creditado pela resposta. Não abre
  nenhum AC (AC-P3-09 é sobre o delta exibido no contador, que vem da resposta, via o chip da
  4.B) e corrigi-lo move o aviso para depois da mutação, mexendo em OND1-C.
- **Seam órfão da F1b** — `lib/notifications/browser-notifications.ts` sem chamador (§8), à
  espera de o dono dizer se fica ou se sai.

Rollback de cada batch: um commit por batch na branch `plan/v3-operacional`, mais a tag
`pre-plan-v3` (`8d78812`) marcando o ponto anterior ao plano inteiro.
