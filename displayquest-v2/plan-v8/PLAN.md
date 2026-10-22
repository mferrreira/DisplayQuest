# plan-v8: gamificação remodelada — trilhas, ciclos, moeda, troféus equipáveis

> Plano aberto em 2026-10-22 a partir do modelo fechado em 6 rodadas de perguntas ao dono
> (mesma data). A fonte de verdade do comportamento é [MODELO.md](./MODELO.md) — este
> PLAN.md é a ordem de execução. Nenhuma onda começou; o `STATE.json` diz `ready`.

- [MODELO.md](./MODELO.md): o sistema remodelado (trilhas, ciclos, aritmética, gramáticas).
- [STATE.json](./STATE.json): estado, decisões, ondas, baseline e perguntas.
- Números medidos em 2026-10-22, salvo indicação contrária.
- Decisões deste plano: **DEC-211..220** reservadas (numeração global contínua — ver o
  bloco de numeração no `AGENTS.md`; a próxima livre depois deste plano é DEC-221). Antes
  de abrir DEC nova, `grep` os **SETE** `STATE.json` (clean-arch, plan-v3, plan-v4,
  plan-v5, plan-v6, plan-v7, plan-v8).

## 1. Objetivo

A gamificação deixa de ser um número só (`users.points`, hoje moeda + ranking + métrica de
entrega ao mesmo tempo) e passa a ser quatro trilhas com ciclos diferentes e um vocabulário
próprio (Pontos, Troféus, Moedas). O pedido do dono: "a gamificação é o motor de motivação
desse sistema, ela tem a obrigação de ser a mais bem modelada possível" — remodelada do
zero, não um remendo sobre os planos antigos.

As trilhas e seus ciclos estão no MODELO.md §1; resumido:

| Trilha | O que é | Ciclo |
|---|---|---|
| Pontos | placar do mês; destaca no ranking | zera todo mês, com snapshot |
| XP | volume bruto da temporada, com boosts e penalidades | temporada = ano; zera no fim do ano, com livro-caixa |
| Elo | rótulo de prestígio derivado do XP da temporada; libera slots de troféu | zera com a temporada |
| Moedas | moeda da loja; ganha só ao concluir atividade de cronograma aprovada | vitalícia |
| Troféus | badges renomeados; honras vitalícias conquistadas por critério, equipáveis com boost | vitalícios |

## 2. O que foi medido antes de planejar

- `users.points` tem triple-role hoje: creditada pelo award idempotente (`history` com
  `GAMIFICATION:<sourceType>:<sourceId>`), gasta pela loja (`prisma-purchase.repository.ts`:
  suficiência, decremento, estorno incrementando pontos) e ajustada pelo painel
  (`set/add/remove`, sem linha de `history`).
- Aritmética congelada que sobrevive intacta: tarefa (DEC-97: base `10 + 5·n`, ×1,5 com
  entrega ≥2 dias civis, −10/dia sem piso — DEC-39, `backend/domain/task/task-rules.ts`),
  sessão golden (`10 + min(40, horas×10) + min(30, 5·tareas)`, `Progression.ts:47`), prêmio
  de atividade (`100 × meses`, ×1,5 / −10% por dia com piso 0, DEC-103/74,
  `cronograma-rules.ts:237` + `activity-rules.ts:41`) e a distribuição Hamilton por membro
  ATIVO (`award-from-activity-completion.use-case.ts`).
- XP/level/elo já existem como derivação dormente sobre `points` (`Progression.ts`:
  `xp = max(0, points)`, elo BRONZE/PRATA/OURO/DIAMANTE em 0/700/1500/2500) com rota
  `GET /api/users/[id]/gamification` **sem nenhum consumidor de UI**. Não sobrevive como
  está.
- Badges hoje: motor `badge-rules.ts` lê `points`/`completedTasks`/`weeklyHours`
  cumulativos; quirks congelados (condição desconhecida = `true`; critério `0` ignorado)
  serão consertados na reescrita. `completedTasks` é cumulativa e continua vitalícia.
- `projects.points`: saldo Hamilton exibido como "Pontos do projeto" no detalhe,
  incrementado pelo publicador `TaskCompletedEvent` (DEC-63) — **sai do sistema** (DEC-215).
- Precedente operacional do reset: `ResetWeeklyHoursHistoryUseCase` (cron `'0 0 * * 1'`,
  `systemActor("WEEKLY_RESET")`) — e seu QUIRK-7C (sem deduplicação), que **não** é
  herdado (DEC-212).
- A instância tem ~10 usuários ativos: ligas, matchmaking e classes ficam fora por decisão
  do dono (rodada 1).

## 3. Ondas

Toda onda fecha com G0 (arch:check, allow-list vazia) + G1 (lint) + G2 (tsc 0) + G3
(vitest, nunca abaixo do baseline do STATE.json); ondas que mudam schema ou rotina fecham
com **G4** (roundtrips Prisma só contra `dq-dev-test-db`/5433 — `npm run db:test:up` +
`npm run db:test:setup` primeiro); ondas que mudam comportamento visível fecham com G5
(`docs:build` + `docs:check`); a última onda fecha G6 (recaptura do guia).

### V8-0 — baseline, lineage e reserva de decisões
Re-medir G0–G4 na working tree atual (inclui os três consertos de UI de 2026-10-22:
204 arquivos / 2419 testes na suíte completa medidos neste dia; re-medir a divisão
unit+features). Gravar no STATE.json. Indexar o plan-v8 no `displayquest-v2/README.md` e
no bloco de numeração do `AGENTS.md`. Registrar DEC-211, 212, 213, 214, 215, 216, 217,
218, 219, 220 no decisionRegistry do STATE.json (abertas com o texto do §5).
Sem código.

### V8-1 — schema e virada 1:1
Decisões: DEC-211, DEC-215, DEC-216. `users.coins Int @default(0)`, `users.xp Int
@default(0)`; tabelas `month_history` (snapshot por usuário × mês: pontos, tarefas do mês)
e `season_history` (livro-caixa por usuário × ano); `user_badges.equipped Boolean
@default(false)`; `badges` ganha `effects` (lista fechada de `{verb, tier}`) e cada
critério ganha janela (`mes | temporada | vida`); `history` ganha `track` (POINTS | COINS
| XP, default POINTS) e `pointsAwarded` passa a ler como montante da trilha; **saem**
`projects.points`, o campo da tela do projeto e o publicador `TaskCompletedEvent →
projects.points` (DEC-63). Migration pelo caminho medido do V4-4: `prisma migrate diff
--from-schema-datamodel/--to-schema-datamodel --script`, gravar como migration, `migrate
deploy` na 5432 **e** na 5433, `prisma generate`, reiniciar o dev server (gotcha medido:
`generate` não alcança processo em pé). Data migration 1:1: `users.coins = users.points`
no deploy; placar mensal começa em 0. Entidades zod e fixtures ajustados (gotcha medido:
`.default` no zod exige a chave no tipo de saída). G4 roundtrip: coins/xp/históricos.
Gates: G0–G4.

### V8-2 — ciclo mensal
Decisão: DEC-212. `ResetMonthlyPointsUseCase`: `$transaction` única (snapshot por pessoa
com saldo ≠ 0 **ou** atividade no mês — lista ampla, não só ativos; depois zera a coluna),
idempotente por `(userId, month)` (dedup — não herda o QUIRK-7C semanal), cron
`'0 0 1 * *'` America/Sao_Paulo com `systemActor("MONTHLY_POINTS_RESET")` (padrão DEC-54;
o guarda `system-callers`/`system-actor` continua valendo: nenhuma rota declara ator de
sistema). Snapshot guarda o negativo; a coluna nova começa 0. G4 roundtrip: fechar um mês
no banco de teste, reexecutar, provar que não duplica e que o mês seguinte parte de 0.
Gates: G0–G4.

### V8-3 — motor de XP
Decisão: DEC-214. Regra pura nova `backend/domain/gamification/xp-rules.ts` com as
constantes congeladas do MODELO §4 (+10/+10/+20; boosts semanais 7/7 +40, 5+ tarefas +20,
10+ +40 substitutivo; penalidades −10/−20/−30/−20; piso 0). Credit de XP nos três eventos
(tarefa aprovada, sessão concluída, atividade aprovada — esta por membro da distribuição)
na mesma `$transaction` do award correspondente, track `XP` no `history`. Revisão semanal
`ReviewWeeklyXpUseCase` pelo cron `'10 0 * * 1'` (segunda 00:10, avalia a semana civil
segunda–domingo que acabou de fechar) com `systemActor("WEEKLY_XP_REVIEW")`, idempotente
por `(userId, weekStart)`. G4 roundtrip: semana com constância, semana sem meta, tarefa
atrasada. Gates: G0–G4.

### V8-4 — temporada e campeão
Decisão: DEC-213. `CloseSeasonUseCase` no cron `'5 0 1 1 *'` America/Sao_Paulo
(`systemActor("SEASON_CLOSE")`, roda depois do snapshot mensal do mesmo dia): grava
`season_history` por pessoa (somas mensais, tarefas, XP, elo final, posição), concede o
troféu de **CAMPEÃO da temporada** ao maior somatório de pontos mensais do ano (idempotente
por ano), zera pontos/XP/elo/contagens anuais. Moedas e troféus conquistados não são
tocados. G4 roundtrip: virada com dois anos de dados sintéticos; reexecução não duplica.
Gates: G0–G4.

### V8-5 — moeda e loja
Decisão: DEC-215. Credit do prêmio de atividade (valor intacto, Hamilton intacta) passa a
escrever `users.coins` (track COINS) em vez de pontos; loja (preço, suficiência,
decremento, estorno, approval do painel) migra para a trilha moeda; ajuste manual do painel
nas duas trilhas separadas — `set/add/remove` de PONTOS do mês e de MOEDAS, cada ajuste
gravando linha de `history` (ASK-V8-24 respondida 2026-10-22). Gate: G4 roundtrip da compra
(suficiência em moeda, estorno em moeda) + G0–G3.

### V8-6 — elo, troféus equipáveis e motor novo
Decisões: DEC-217, DEC-218, DEC-219. Elo derivado do XP da temporada com a escada e os
umbrais DEC-217 e slots 0/1/2/2/3/3; use cases de equip/unequip (dono da conta; slots
decididos pelo elo **do momento**; troca de troféu não recalcula credit passado) e rota;
motor de troféus reescrito: critérios com janela (`mes` lê snapshot corrente, `temporada`
lê XP/soma do ano corrente, `vida` lê contadores vitalícios), quirks consertados (condição
desconhecida = `false`; critério `0` avaliado), catálogo existente migrado com janela
`vida`; efeito aplicado no instantâneo do credit (boost de pontos/moedas e redução de
penalidade lidos dos troféus equipados; verbos e tiers fechados no domínio); criação de
troféu no painel com escolha de verbo+tier do menu. `GET /api/users/[id]/gamification` é
re-sigificada para as trilhas novas ou sai. Gates: G0–G4.

### V8-7 — telas
Decisão: DEC-220. Ranking mensal (ordenado por pontos do mês; desempate tarefas → XP →
userId; colunas Pontos, Tarefas (mês), Elo, Troféus equipados/total, Moedas); perfil com
cartão da temporada (pontos do mês, XP/elo, moedas) e seção Troféus com equipar; telas de
histórico mensal e livro-caixa da temporada; troféu de campeão no perfil do campeão;
renomeio "Distintivos" → "Troféus"; ícone do placar do header trocado (**ASK-V8-23
respondida antes da onda**); "Pontos do projeto" sai da tela (se não saiu em V8-1 por
ordem de dependência, sai aqui — o registro diz qual onda fecha). Gates: G0–G3 + e2e do
quadro/shell re-medidos.

### V8-8 — fechamento G5/G6
`docs:build` + `docs:check` com o texto técnico (`docs/src`, novo capítulo de gamificação)
e de usuário (`docs/src-usuario`, vocabulário novo), recaptura das telas do guia que
mudaram (`docs/screens`), re-leitura da prosa (`docs:check` + ruidos). Fecha com o STATE
`done`.

## 4. Linhas duras do plano

- Nenhuma onda executa com sua pergunta em aberto. ASK-V8-23 (ícone do placar) e ASK-V8-24
  (ajuste do painel) foram **respondidas pelo dono em 2026-10-22** e entraram no escopo de
  V8-7 e V8-5; nenhuma pergunta do plano está aberta.
- Cron é chamador sem pessoa: os três jobs novos são `systemActor` e o guarda que faz
  `grep` de `systemActor(` em `app/api/**` continua verde (DEC-54).
- A loja cobra moeda a partir de V8-5; entre V8-1 e V8-4 a moeda existe no schema sem
  fonte — o plano aceita isso por ordem das ondas, e nenhum batch entrega a loja em
  estados intermediários para uso de produção além do que já existe.
- Migration roda na 5432 (dados reais do dono) pelo caminho offline medido no V4-4 — nunca
  `migrate dev` com possível RESET.

## 5. Decisões reservadas (abertas na onda indicada)

- **DEC-211** (V8-1): a gamificação passa a quatro trilhas — pontos mensais (ranking), XP
  de temporada (volume), elo de temporada (prestígio + slots), moeda vitalícia (loja) —
  com troféus vitalícios; vocabulário da UI Pontos / Troféus (renomeia Distintivos) /
  Moedas.
- **DEC-212** (V8-2): ciclo mensal com snapshot por pessoa em `$transaction` única,
  idempotente por `(userId, month)`, cron `'0 0 1 * *'` America/Sao_Paulo,
  `systemActor("MONTHLY_POINTS_RESET")`; negativo guardado no snapshot, coluna começa 0;
  o QUIRK-7C do semanal não é herdado.
- **DEC-213** (V8-4): temporada = ano civil. Fechamento: `season_history` por pessoa +
  troféu CAMPEÃO para o maior somatório de pontos mensais + reset de
  pontos/XP/elo/contagens anuais; moedas e troféus conquistados não resetam; idempotência
  por `(userId, ano)`; cron `'5 0 1 1 *'`, `systemActor("SEASON_CLOSE")`.
- **DEC-214** (V8-3): aritmética de XP própria, constantes congeladas no domínio: +10
  tarefa aprovada, +10 sessão concluída, +20 atividade aprovada por membro; boosts semanais
  7/7 dias com sessão +40, 5+ tarefas +20, 10+ +40 (substitutivo); penalidades semanais
  tarefa atrasada −10, atividade atrasada −20 por membro, atividade aprovada sem sessão do
  membro no período −30, meta semanal não cumprida (`weekHours > 0`) −20; XP com piso 0;
  revisão por cron `'10 0 * * 1'`, `systemActor("WEEKLY_XP_REVIEW")`, idempotente por
  `(userId, weekStart)`.
- **DEC-215** (V8-1/V8-5): moeda vem só de atividade de cronograma aprovada, com o prêmio
  atual intacto (100 × meses, ×1,5 ≥2 dias, −10%/dia piso 0) e a Hamilton intacta;
  `projects.points` sai do sistema (coluna, campo na tela, publicador DEC-63).
- **DEC-216** (V8-1): virada 1:1 no deploy — `users.coins` recebe o saldo atual de
  `points`, `rewards.price` vira preço em moeda mantendo os números, placar mensal começa
  em 0, compras pendentes e estornos seguem a trilha moeda.
- **DEC-217** (V8-6): elo derivado do XP da temporada em 6 degraus — BRONZE 0, PRATA 400,
  OURO 900, PLATINA 1500, DIAMANTE 2400, DESAFIANTE 3600 — calibráveis com o primeiro ano
  (ASK-V8-22); slots de troféu 0/1/2/2/3/3 pelo elo do momento.
- **DEC-218** (V8-6): troféus conquistados por critério (idempotente, vitalício, nunca
  re-conquistado), pessoa equipa até os slots do elo atual; efeitos com verbos fechados
  (`pontos_tarefa +%`, `pontos_sessao +%`, `moedas_atividade +%`, `penalidade −%`) e tiers
  Tier1/Tier2/Tier3 congelados no domínio; o admin escolhe verbo e tier do menu, sem
  número livre; boost lido no instantâneo do credit.
- **DEC-219** (V8-1/V8-6): motor de critérios reescrito com janela por critério
  (`mes | temporada | vida`); `completedTasks` continua vitalícia; catálogo existente
  migrado com janela `vida`; quirks consertados: condição desconhecida = `false` (era
  `true`), critério `0` avaliado (era ignorado).
- **DEC-220** (V8-7): ranking mensal ordena por pontos do mês, desempate tarefas → XP →
  userId; colunas Pontos / Tarefas (mês) / Elo / Troféus / Moedas; histórico mensal e
  livro-caixa viram telas; troféu de campeão no perfil.

## 6. Perguntas

- **ASK-V8-23** — respondida em 2026-10-22: o ícone do placar no header (hoje `Trophy`,
  `app-header.tsx:78`) troca para moeda/raio; `Trophy` passa a pertencer só aos troféus
  equipáveis (header, menu mobile, cartões do admin e do perfil).
- **ASK-V8-24** — respondida em 2026-10-22: o ajuste manual do painel admin (hoje
  `set/add/remove` de pontos) passa a cobrir **as duas trilhas, separadas** — pontos do mês
  e moedas — cada ajuste gravando linha de `history` para auditoria.
- **ASK-V8-21 / ASK-V8-22** (depois do plano, primeiro ano de dados): calibração das
  constantes de XP (DEC-214) e dos umbrais de elo (DEC-217). O dono aceitou estimar agora
  e calibrar com dados reais; ficam em `deferredItems`.

## 7. Fora do escopo

- Classes de personagem, matchmaking, ligas e divisões (decisão do dono, rodada 1).
- Migrar avatar para o bucket; qualquer mudança em `public/uploads/avatars`.
- Multi-lab, SSO/LDAP, economia entre projetos.
- Redutor de inflação da virada 1:1 (o dono aceitou herdar o saldo antigo; corrigível
  depois com dados).

## 8. Riscos e gotchas conhecidos que o plano carregou

- Roundtrips G4 só na 5433 isolada (`db:test:up` + `db:test:setup` + `g4-normalize.sql`),
  nunca na 5432; o runner lê `process.env`.
- Migration da 5432 pelo caminho `migrate diff` → gravar migration → `migrate deploy`
  (medido no V4-4; `migrate dev` pode pedir RESET e a 5432 é a produção local do dono).
- `prisma generate` não alcança processo em execução — reiniciar o dev server depois de
  gerar (medido no V4-4).
- Zod `.default` muda o tipo de saída (`Task`/`User` literais de fixture precisam das
  chaves novas — medido no V4-4).
- Rejeição não tratada em `onClick` quebra o gate do Vitest, não só o console (medido no
  V4-4b) — toda tela nova de troféu/equipar captura erros e mostra `role="alert"`.
- Rotinas de cron chamam use cases sem pessoa: desenhar o `systemActor` antes de mover
  checagem para dentro do use case (DEC-54, medido 4 vezes).
- O e2e do quadro depende do dado da instância (cartão a mais em coluna quebra por strict
  mode violation; `git stash` antes de chamar de regressão).
