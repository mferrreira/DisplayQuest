# Gamificação remodelada — MODELO

Status: **modelo fechado (rodadas 1–6), não plano**. As regras de §2–§7 vêm das rodadas de
perguntas ao dono (2026-10-22). Nenhuma decisão DEC foi registrada; nada foi implementado.
Sobram apenas calibrações numéricas (§9) e uma pendência de UI (ícone do placar).

Este documento absorve `displayquest-v2/monthly-points-reset/MODELO.md`: o reset mensal
com histórico entrou no plano como parte da temporada mensal (§4).

## 1. O que o sistema vira

A gamificação deixa de ser um número só (`users.points`, hoje moeda + ranking + métrica de
entrega ao mesmo tempo) e passa a ser quatro trilhas com ciclos diferentes:

| Trilha | O que é | Ciclo | Quem reseta |
|---|---|---|---|
| **Pontos** | placar do mês, o que destaca a pessoa no ranking | mensal | zera todo mês, com snapshot |
| **XP** | volume bruto da temporada: o que a pessoa fez, com boosts de produtividade/constância e penalidades | anual (temporada) | zera no fim do ano, com livro-caixa |
| **Elo** | rótulo de prestígio derivado do XP da temporada; decide os slots de troféu equipado | anual | volta ao primeiro degrau no fim do ano |
| **Moedas** | moeda da loja, ganha só ao concluir atividade de cronograma aprovada | vitalícia | nunca |
| **Troféus** (badges renomeados na UI) | honras conquistadas por critério, vitalícias; equipados dão boost | vitalício | nunca |

Vocabulário na UI: **Pontos** (placar, ícone atual de troféu no header — trocar o ícone é
decisão de UI, registrada em §9), **Troféus** (o que hoje se chama Distintivos),
**Moedas**. A palavra "troféu" passa a existir no produto.

## 2. Pontos (placar mensal)

- Fontes, aritmética **congelada** (decisão do dono, rodada 3): tarefa pelo regime DEC-97
  (`10 + 5·n` de subtasks concluídas, ×1,5 com entrega ≥2 dias civis antecipada, −10/dia de
  atraso sem piso — DEC-39) e sessão pelo golden atual
  (`10 + min(40, horas×10) + min(30, 5·tareas)`).
- Atividade de cronograma **não dá pontos** (rodada 2): dá moeda (§5).
- Placar aceita negativo dentro do mês (regra DEC-39 preservada). No fechamento do mês:
  snapshot por pessoa (pontos, tarefas, e o que mais o histórico guardar) e saldo vai a 0.
  O snapshot guarda o negativo; o saldo novo começa limpo — o mês perdoa, o histórico não
  apaga.
- O ciclo mensal é o modelo de `../monthly-points-reset/MODELO.md` (snapshot +
  `$transaction`, cron `'0 0 1 * *'` America/Sao_Paulo, `systemActor("MONTHLY_POINTS_RESET")`,
  precedente semanal `ResetWeeklyHoursHistoryUseCase`). Não herdar o QUIRK-7C do semanal
  (falta de deduplicação): a rotina mensal tem que ser idempotente por mês.
- Contagens de tarefa no ranking passam a ser **do mês** (rodada 5: "tarefas do mês → 0" a
  cada fechamento; rodada 6: fechamento confirmado). `users.completedTasks` **continua
  vitalícia** e serve de métrica para critérios de troféu na janela `vida` (rodada 6); as
  contagens mensais e anuais vêm dos snapshots, não dela.

## 3. Ranking

- Ordena por **pontos do mês**; desempate na ordem **tarefas do mês → XP da temporada →
  userId** (rodada 6).
- Colunas: **Pontos, Tarefas (mês), Elo, Troféus (equipados/total), Moedas** (rodada 6).
- O ranking deixa de ser cumulativo desde sempre: cada mês é um quadro próprio, e o
  histórico mensal é o que dá memória.

## 4. Temporada (anual) e XP

- **Temporada = ano** (rodada 5 do dono: "a temporada é ANUAL, o mês reseta os pontos, mas
  não é uma season"). Ciclo na virada do ano: pontos → 0, XP → 0, elo → primeiro degrau,
  contagens anuais → 0. **Moedas e troféus conquistados não resetam.**
- O resultado da temporada "fica marcado" (rodada 5): **livro-caixa anual** por pessoa
  (pontos e tarefas de cada mês, XP total, elo final, posição) + **troféu de CAMPEÃO da
  temporada** para o primeiro colocado. Campeão = **maior soma dos pontos mensais do ano**
  (rodada 6) — o mesmo placar que o ranking mostra, acumulado mês a mês no livro-caixa.
- **XP mede volume bruto com boost e penalidade** (rodada 5), com aritmética própria
  congelada no domínio e constantes planas (rodada 6):
  - volume por evento: tarefa aprovada **+10**, sessão concluída **+10**, atividade
    aprovada **+20 por membro** ATPV da distribuição;
  - boost semanal, rotina de cron (domingo à noite, ator de sistema, precedente do weekly
    reset): 7/7 dias civis da semana com sessão concluída **+40**; 5+ tarefas aprovadas na
    semana **+20**; 10+ tarefas **+40** (substitui o de 5+, não soma);
  - penalidade: tarefa atrasada **−10** flat; atividade atrasada **−20** por membro;
    atividade aprovada sem sessão do membro no período da atividade **−30**; semana sem
    cumprir a meta (`weekHours > 0` e horas trabalhadas abaixo) **−20**;
  - XP nunca abaixo de 0 (piso por pessoa, dentro da temporada).
- XP da temporada alimenta o elo; XP de temporadas passadas existe só no livro-caixa.

## 5. Moedas (loja)

- Fonte única: **aprovação de conclusão de atividade do cronograma** (rodada 1). O motor
  Hamilton já distribui prêmio por membro ATIVO do vínculo
  (`award-from-activity-completion.use-case.ts`); a mudança é o destino do crédito: sai do
  trilho de pontos e entra no de moedas. **Valor: o prêmio atual, intacto** (rodada 6):
  `100 × meses marcados`, com ×1,5 antecipada ≥2 dias civis e −10%/dia de atraso com piso 0
  (DEC-103/74) — zero aritmética nova de moeda.
- Loja cobra moeda: `rewards.price` vira preço em moeda; transação de compra (suficiência,
  decremento, estorno) migra de trilha.
- **Virada 1:1** (rodada 2): no deploy, saldo atual de pontos vira saldo de moeda 1:1 e os
  preços do catálogo mantêm os números. Compras pendentes seguem válidas; estorno devolve
  moeda. Herda a inflação antiga por decisão, corrigível depois com redutor.
- `projects.points` **sai do sistema** (rodada 5): coluna sai, campo "Pontos do projeto"
  sai da tela do detalhe, e o publicador `TaskCompletedEvent → projects.points` (DEC-63)
  sai junto. A distribuição Hamilton continua, agora como distribuidora de moeda.

## 6. Troféus (badges)

- Renomeados na UI de Distintivos para **Troféus** (rodada 4). Catálogo admin continua.
- **Conquista automática por critério** (motor reescrito, idempotente, vitalícia: um troféu
  por pessoa, nunca se re-conquista) e **a pessoa equipa** quais dos conquistados ficam
  ativos, no perfil (rodada 4).
- **Slots por elo** (rodada 4): BRONZE 0, PRATA 1, OURO 2, PLATINA 2, DIAMANTE 3,
  DESAFIANTE 3. O elo do momento manda: quem subiu a OURO em março equipou 2 a partir de
  março; a virada da temporada zera o elo e os slots voltam ao degrau novo.
- **Boosts com gramática fechada** (rodada 4): o admin cria troféu ESCOLHENDO verbo e tier
  de uma lista congelada no domínio — nenhum número livre. Verbos propostos (confirmar em
  §9): `pontos_tarefa +%`, `pontos_sessao +%`, `moedas_atividade +%`,
  `penalidade −%` (reduz penalidade de atraso), tiers Tier1/Tier2/Tier3 com valores fixos.
  O boost é lido no instante do credit (o que já foi creditado não se recalcula).
- **Motor reescrito** (rodada 3): critérios passam a ler as trilhas novas (pontos da
  temporada mensal, XP da temporada, moedas, contagens, constância semanal), e os quirks
  congelados são consertados de brinde: condição desconhecida deixa de tratar-se como
  verdadeira; critério `0` deixa de ser ignorado.
- Cada critério declara a **janela** que mede (rodada 6): `mes` (lê o snapshot do mês
  corrente), `temporada` (lê XP e soma de pontos acumulados do ano corrente) ou `vida`
  (contadores vitalícios, ex.: `completedTasks`, sessões totais, moedas ganhas na vida).
  Conquista é vitalícia mesmo quando a janela é `mes` ou `temporada`: vale a primeira vez
  que o critério fecha.

## 7. Elo

- 6 degraus: BRONZE → PRATA → OURO → PLATINA → DIAMANTE → DESAFIANTE (rodada 4).
- Derivado do **XP da temporada** (rodada 4 corrigida: "elo mede a temporada"), zera com a
  temporada. Rótulo colorido no perfil e ao lado do nome no ranking (rodada 2).
- Umbrais sobre o XP da temporada (rodada 6, calibrar com dados do primeiro ano):
  **BRONZE 0, PRATA 400, OURO 900, PLATINA 1500, DIAMANTE 2400, DESAFIANTE 3600** —
  estimados para que um participante médio feche a temporada em OURO e o dedicado chegue a
  DIAMANTE/DESAFIANTE. Os atuais 0/700/1500/2500 medem pontos vitalícios e não valem mais.
- O motor derivado atual (`Progression.ts`: xp espelhando points, level, elo) não sobrevive
  como está: ou vira a implementação do elo novo, ou sai. A rota
  `GET /api/users/[id]/gamification` não tem consumidor de UI hoje.

## 8. O que sai do sistema

- `projects.points` + campo na tela + publicador DEC-63 (§5).
- Derivação atual de XP/level/elo sobre `users.points` (§7).
- O triple-role de `users.points`: a coluna continua existindo como placar mensal, deixa de
  ser moeda da loja e deixa de ser métrica cumulativa de ranking.
- Vocabulário "Distintivos" na UI (vira "Troféus").
- Quirks do motor de badge: condição desconhecida = true; critério 0 ignorado.

## 9. Fechado na rodada 6; o que sobra

As perguntas da rodada 6 foram respondidas pelo dono (2026-10-22) e entraram em §2–§7:
tabela do XP (constantes planas + cron semanal), moeda = prêmio atual, umbrais de elo
0/400/900/1500/2400/3600, janelas de critério `mes`/`temporada`/`vida` com
`completedTasks` vitalícia, desempate do ranking e campeão pela soma de pontos.

Sobram, e nenhum deles trava a abertura do plano:

1. **Calibração numérica**: constantes do XP e umbrais de elo são estimativa da primeira
   temporada; revisitar com dados reais do primeiro ano (o dono aceitou "calibrar depois").

Resolvidas em 2026-10-22 (respostas do dono):

- **Ícone do placar no header** (hoje `Trophy` em `components/layout/app-header.tsx:78`):
  troca para moeda/raio; `Trophy` passa a pertencer só aos troféus equipáveis.
- **Ajuste manual de trilha no painel admin**: as duas trilhas, separadas —
  `set/add/remove` de pontos do mês e de moedas — cada ajuste gravando linha de `history`
  para auditoria.

## 10. Estado das rodadas

- Rodada 1 (trilhas, fontes, classes fora, troféus "como estão") — respondida.
- Rodada 2 (pontos mensais tarefa+sessão, atividade só moeda, conversão 1:1, elo no XP,
  tarefas na temporada) — respondida.
- Rodada 3 (vocabulário inicial, motor reescrito com quirks, números congelados, histórico
  mensal entra no plano) — respondida; `projects.points` não respondida direto, resolvida
  na rodada 5 como "sai do sistema".
- Rodada 4 (vocabulário Pontos + Troféus + Moedas, conquista automática + pessoa equipa,
  verbos fechados, slots por elo 0/1/2/2/3/3) — respondida; o elo foi re-ancorado na
  rodada 5.
- Rodada 5 (temporada ANUAL com reset de tudo menos moedas, XP volume+boost−penalidade,
  conquistados vitalícios com elo do momento, livro-caixa + troféu de campeão,
  `projects.points` sai) — respondida; o mapa de ciclos foi confirmado.
- Rodada 6 (tabela do XP com constantes planas + cron semanal, moeda = prêmio atual,
  umbrais 0/400/900/1500/2400/3600, janelas `mes`/`temporada`/`vida`, desempate e campeão
  pela soma de pontos) — respondida. **Modelagem fechada.**
