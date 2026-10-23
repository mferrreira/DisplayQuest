# displayquest-v2 — Planejamento da evolução v2 do DisplayQuest

> Container único do planejamento do DisplayQuest v2 (branch `dev`). Este folder é
> **organizacional**: agrupa, em subpastas independentes, a visão/requisitos, o
> meta-plano de planejamento, o pré-requisito arquitetural e o plano operacional. Cada
> subpasta mantém seu próprio processo e estado — nenhum meta-processo novo existe aqui.

## Estrutura

```
displayquest-v2/
├── spec-v2/       VISÃO: requisitos de alto nível do dono (fonte das features)
├── plan-v2/       PROCESSO: meta-plano Spec-Driven + features 01..06 (cada uma com PLAN/SPEC/AGENT/STATE)
├── clean-arch/    BASE: refatoração do backend para Clean Architecture (pré-requisito das features 01..06)
├── plan-v3/       OPERAÇÃO: correções e features pedidas por quem usa o sistema hoje (sessões, quadro, pontos) — done
├── plan-v4/       OPERAÇÃO: subtasks, animação de pontos, inativação (2026-10-05) — done (2026-10-07, DEC-78..98)
├── plan-v5/       OPERAÇÃO: domínio de projetos maduro — cronograma, pontos, relatórios técnicos, atestados (2026-10-06) — done (2026-10-14, V5-1..V5-12 + V5-fix-1/V5-fix-2; DEC-61..77, 99..104, 126..180)
├── plan-v6/       OPERAÇÃO: linguagem visual UI/UX + redistribuição das telas (2026-10-07, revisado 2026-10-14) — done (2026-10-16, V6-0..V6-11; DEC-105..114, 181..188)
├── plan-v7/       OPERAÇÃO: MCP de validação para o agente consumidor (2026-10-15, revisado 2026-10-21) — planejado, nenhuma onda começada (DEC-190..210, ASK-V7-16..25)
└── plan-v8/       OPERAÇÃO: gamificação remodelada — trilhas (pontos mensais, XP/elo de temporada, moeda vitalícia), troféus equipáveis, reset mensal e temporada anual (2026-10-22) — em andamento: V8-4 done (ciclo mensal do placar, motor de XP da temporada e fechamento de temporada anual: `ResetMonthlyPointsUseCase` com snapshot em `month_history` + cron `0 0 1 * *`, `xp-rules.ts` + `ReviewWeeklyXpUseCase` com cron `10 0 * * 1`, e `season.ts` + `CloseSeasonUseCase` com `season_history`, zeragem de `points`/`xp` e troféu CAMPEÃO + cron `5 0 1 1 *`, os três sem rota nova; DEC-211..221 abertas); regime DEC-221: uma onda por vez autorizada pelo orquestrador, migration só na 5433 até o batch V8-CLOSE (MODELO.md = fonte do comportamento)
```

## Fluxo de dependências (unidirecional)

```
spec-v2 (visão/requisitos)
        └──> plan-v2/01..06 (planejamento e execução das features)
                 ^
                 |
        clean-arch (base arquitetural — precisa estar `done` antes de 01)

plan-v3 (demanda de uso) ──> execução direta, sem depender dos três acima

plan-v4 ──> fecha (V4-4/V4-5 subtasks) ──> plan-v5 (domínio de projetos; ordem por colisão em `tasks`, DEC-73)

plan-v6 (linguagem visual + redistribuição das telas) ──> camada de apresentação só — a
                                 ordem frente ao plan-v5 está resolvida: o plan-v5 fechou
                                 em 2026-10-14, então as colisões que travavam V6-4
                                 (×V5-4), V6-5 (×V5-2) e V6-7 (×V5-3) saíram do caminho.
                                 O bloqueio antigo (DEC-145, uma frente por vez) caiu com
                                 o fechamento do plan-v5. Home sem coluna secundária,
                                 largura toda (DEC-114).

plan-v7 (MCP de validação para o agente consumidor) ──> pacote e serviço separados,
                                 independentes do plan-v6: não toca em tela, não muda
                                 navegação, não muda valor de permissão e não altera o
                                 backend. A fase 1 usa conta de serviço e login NextAuth
                                 por e-mail/senha (DEC-205/206), expõe 25 tools na LAN sem
                                 auth de cliente (DEC-207/209) e entrega tools.json +
                                 README. A credencial local e o TLS ficam na fase 2
                                  (DEC-192/199/200/201).

plan-v8 (gamificação remodelada) ──> nasce do pedido do dono em 2026-10-22 ("repensar do
                                  zero"): a economia vira quatro trilhas com ciclos
                                  próprios — pontos mensais (ranking, com snapshot e reset),
                                  XP e elo da temporada anual (com boosts e penalidades
                                  próprios), moeda vitalícia (loja; vem só de atividade de
                                  cronograma aprovada) e troféus vitalícios equipáveis
                                  (slots liberados pelo elo). `projects.points` sai do
                                  sistema. O `MODELO.md` é a fonte do comportamento, fechado
                                  em 6 rodadas com o dono; o plano executa em ondas
                                  V8-0..V8-8 com G4 obrigatório nas ondas de schema e
                                  rotina.
```

- `spec-v2/` registra a visão do dono (gamificação profunda, projeto mais complexo,
  logging/audit, roles/permissions, multi-lab SaaS, SSO/LDAP).
- `plan-v2/` transforma a visão em features planejadas (`NN-<nome>/`) com máquina de
  estados, gates G1-G5 e `state.json` global.
- `clean-arch/` isola o domínio do backend (sem Prisma no core, use cases com as
  regras, infra como adapters) **antes** das features; sem isso, as features v2
  carregariam dívida arquitetural.
- `plan-v3/` **não** nasce da visão do `spec-v2`: nasce do que quem usa o sistema
  relatou em uso — pausas automáticas silenciosas, pontos zerados para quem entrega no
  prazo, quadro que cresce sem limite. É independente das features 01..06 e pode
  executar em paralelo com elas.
- `plan-v4/` nasce do plan-v3 (o dono pediu subtasks e animação de pontos junto);
  `plan-v5/` nasce do desenho completo de domínio de projeto do dono (edital, cronograma,
  pontos de projeto, relatórios técnicos com IA, atestados com AcroForm) — tudo estendendo
  o que já existe, em ondas revertíveis, com DEC-61..77, DEC-99..104 e DEC-126..146 contínuas
  da numeração global (DEC-78..98 são do plan-v4 e DEC-105..125 de plan-v6 e
  clean-arch — houve colisão, comentários renumerados). O V5-1 fechou o bucket
  (SeaweedFS no lugar do MinIO, DEC-131), o V5-1a fechou os templates oficiais como asset
  versionado (`templates/`, guarda de deriva — DEC-128), o V5-2b abriu os dados do projeto
  (período, edital, processo, saldo — datas como data civil, DEC-132), o V5-2c pôs entregáveis e
  anexos do projeto no bucket — primeiro consumidor de produção do seam (DEC-133/134) — e o V5-2d
  deu capa e logo ao projeto, com o header do detalhe e a recaptura do guia (DEC-135), e o V5-2a
  abriu a leitura — qualquer autenticado vê todos os projetos e as partes deles, escrita intacta
  (DEC-136); o V5-2 foi dividido pelo dono em V5-2b/2c/2d/2a. O V5-3 levou o mesmo desenho de
  imagem ao perfil — `users.bannerKey` no bucket, capa no cartão "Meu Perfil" e no cartão do 1º
  lugar do pódio (DEC-137). Antes do V5-4, o dono respondeu em 2026-10-13 as perguntas que
  faltavam e as que estavam abertas em outros registros: dados de pessoa em `users` com CPF de
  leitura restrita (DEC-138), relatório técnico por projeto com DOCX por membro (DEC-139), carga
  no vínculo e PROPPI no projeto (DEC-140), cleanup dos status pré-contrato por migration
  (DEC-141), `backend/models/` encolhido (DEC-142), visibilidade de perfil virando batch V5-12
  (DEC-143), seam órfão fora (DEC-144), plan-v6 depois do plan-v5 (DEC-145) e a CVE do `next`
  registrada sem batch (DEC-146). O plan-v5 rodou as ondas V5-4b a V5-12 entre 2026-10-13 e
  14 (DEC-147..178), fechou em 2026-10-14 com o G5/G6 do guia (V5-close) e levou dois
  consertos depois do encerramento: o atestado em 8pt (V5-fix-1, DEC-179) e o "Gerar DOCX"
  salvando o texto em edição antes de gerar (V5-fix-2, DEC-180).
- `plan-v6/` nasce da leitura da interface real contra as referências da skill
  `displayquest-ui` (`.opencode/skills/displayquest-ui/`) e foi **revisado em 2026-10-14**,
  depois do plan-v5. Além da linguagem visual, o plano redistribui **o que aparece em cada
  página**: relatórios unificados na página de Relatórios (DEC-181), aba Voluntários para o
  Painel Administrativo (DEC-182), as 5 abas do detalhe do projeto (DEC-183) e a saída da
  aba `settings` do admin (DEC-184). As **quatro perguntas abertas foram respondidas pelo
  dono** em 2026-10-14 (DEC-185..188: a rota de Relatórios não muda; a aba Dashboard de
  Projetos passa à chave `DASHBOARD_PROJECT_MANAGER` — era bug; nomes de terceiros em tela
  de gestão ficam fora do escopo; título do navegador por tela, por efeito no cliente), então
  o plano **não executa onda com pergunta em aberto**. É **spec-driven** (`SPEC.md` = fonte de verdade do
  comportamento, `PLAN.md` = ordem, `STATE.json` = andamento), só mexe em apresentação e
  navegação — **sem** migrar para RSC —, e cobre **todas as telas** em 13 ondas revertíveis
  (V6-0..V6-11, com V6-6a/V6-6b), contínuas da numeração global (DEC-105..114 e
  DEC-181..188). Ilustrações/texto manuscrito ficaram fora (DEC-109); tema escuro passa a ser
  coberto na skill (DEC-110). A ferramenta de execução é `/ui-refactor <tela>` com gate
  `/ui-review <tela>`.
- `plan-v7/` nasce da demanda do dono em 2026-10-15 e foi reescrito em 2026-10-21:
  um servidor **MCP** (Model Context Protocol) que o agente do outro projeto usa para falar
  com o DisplayQuest. Não vem do `spec-v2` (que previa SSO/LDAP, mas não MCP): vem de uso,
  como o plan-v3. A fase de validação não muda o backend: usa a conta de serviço
  `mcp-agent@displayquest.local` (`COORDENADOR`, id 1099), entra pelo NextAuth com
  e-mail/senha do ambiente e mantém o cookie em memória (DEC-205/206). O endpoint é
  Streamable HTTP, sem auth de cliente, restrito à LAN e HTTP (DEC-207/209), com 25 tools
  — 15 de leitura/análise e 10 de escrita controlada — sobre rotas que já existem. O
  consumidor recebe `mcp/tools.json` e `mcp/README.md` (DEC-208). A credencial local
  (`api_credentials`/CLI), o TLS, a internet e as 59 tools completas são fase 2
  (DEC-192/199/200/201). Decisões **DEC-190..210**, perguntas **ASK-V7-16..25** (todas
  respondidas; nenhuma aberta), ondas **V7-0..V7-5** na fase 1 e **V7-6..V7-9** adiadas.
  É **planejado** — nenhuma onda começou.
- `plan-v8/` nasce do pedido do dono em 2026-10-22: remodelar a gamificação do zero — "ela
  tem a obrigação de ser a mais bem modelada possível". A modelagem fechou em 6 rodadas de
  perguntas no mesmo dia e está congelada em `MODELO.md` (fonte de verdade do
  comportamento, no formato spec-driven do plan-v6): quatro trilhas — **pontos** mensais
  (placar do ranking, reset mensal com snapshot — DEC-212), **XP** e **elo** da temporada
  anual (aritmética própria de volume com boosts de constância e penalidades — DEC-214;
  escada de 6 elos com umbrais a calibrar — DEC-217), **moedas** vitalícias (loja; única
  fonte: atividade de cronograma aprovada, prêmio atual intacto distribuído pela Hamilton —
  DEC-215) e **troféus** vitalícios (badges renomeados na UI; conquistados por critério,
  pessoa equipa até os slots do elo; efeitos com verbos fechados e tiers congelados —
  DEC-218/219). A virada converte saldo 1:1 (pontos → moeda, preços mantidos — DEC-216);
  `projects.points` e o publicador DEC-63 saem do sistema; a temporada zera tudo menos
  moedas e troféus e deixa livro-caixa anual + troféu de campeão (DEC-213). Decisões
  **DEC-211..221** (as 211..220 abertas na V8-0; **DEC-221** é o regime de execução assinado
  pelo dono no mesmo dia: ondas autorizadas pelo orquestrador, uma por vez, merge só no fim do
  plano pelo PR único `plan-v8/gamificacao` → `dev`, migration **só na 5433** durante o plano e
  deploy na 5432 real apenas no batch **V8-CLOSE**), perguntas **ASK-V8-23** (ícone do placar) e
  **ASK-V8-24**
  (ajuste do painel) **respondidas pelo dono em 2026-10-22**, calibrações adiadas
  **ASK-V8-21/22**. **V8-0 done** em 2026-10-22: baseline re-medido (188 arquivos / 2288 testes
  em `tests/unit` + `features` + `entities`, 204 / 2419 na suíte completa, G4 16 / 131 contra a
  5433, G0 1106 módulos / 4703 dependências com allow-list vazia, `tsc` 0, lint exit 0) e as
  dez decisões abertas no registry. **V8-1 done** em 2026-10-22: `users.coins`/`users.xp`,
  `month_history`/`season_history` (unique por `(userId, month)` e `(userId, year)`, Cascade),
  `history.track`, `badges.effects`, `user_badges.equipped` e a saída de `projects.points`
  (coluna, campo na tela, `incrementPoints` e a `TaskProjectPointsPort` da DEC-63); migration pelo
  caminho offline do V4-4 e data migration da virada 1:1, ambas **só na 5433** (23 linhas em
  `_prisma_migrations`; `sum(points)` 14 → 0 e `sum(coins)` 0 → 14). Gates da onda: 189 arquivos /
  2289 testes no projeto unit, 206 / 2427 na suíte completa, G4 17 / 138, G0 1109 módulos / 4713
  dependências, `tsc` 0, lint exit 0. O deploy na 5432 real e a virada lá ficam no **V8-CLOSE**.
  **V8-2 done** em 2026-10-22: o fechamento mensal sem rota — regras puras em
  `backend/domain/gamification/monthly-cycle.ts` (mês anterior a `now`, janela `[start,
  endExclusive)` em dia civil de `America/Sao_Paulo`, audiência "saldo ≠ 0 OU atividade no mês"),
  port + adapter com `$transaction` (snapshot em `month_history` e depois `users.points = 0`, P2002
  virando `already-closed`), `ResetMonthlyPointsUseCase` com gate `MANAGE_USERS`, e o job
  `'0 0 1 * *'` com `systemActor("MONTHLY_POINTS_RESET")`. Gates da onda: 192 arquivos / 2317
  testes no projeto unit, 210 / 2460 na suíte completa, G4 18 / 143, G0 1117 módulos / 4741
  dependências, `tsc` 0, lint exit 0 com 15 warnings, G5 `docs:build` + `docs:check` verdes
  (rodado porque a onda mudou rótulo visível: "Pontos do mês"). Nenhuma migration nova.
  **V8-3 done** em 2026-10-22: o motor de XP sem rota e sem tela nova — regras puras em
  `backend/domain/gamification/xp-rules.ts` (+10 tarefa, +10 sessão, +20 atividade por membro; boosts
  semanais 40 de constância em 7 dias, 20 em 5+ tarefas, 40 em 10+ **substituindo** o de 5+; penalidades
  −10/−20/−30/−20 por unidade; piso 0; semana civil `[segunda 00:00 SP, +7d)`). O credit entra no
  **mesmo `$transaction`** do prêmio, como segunda linha de `history` com `track "XP"` e chave
  `GAMIFICATION:XP:<sourceType>:<sourceId>` (sourceId vem de tabelas diferentes). `ReviewWeeklyXpUseCase`
  idempotente por `(userId, weekStart)` **sem tabela nova** — a linha do próprio ledger
  `GAMIFICATION:XP:WEEKLY_REVIEW:<userId>:<weekStart>` é a chave, lida antes de escrever e reconfirma
  dentro da transação; semana sem ajuste não escreve linha. O adapter entrega fatos (sessões `completed`
  por dia civil, as duas famílias de tarefa da V8-2, atividades lidas do ledger da semana com
  `activityPeriod`/`daysLateForTask` e sessão solapante no mesmo projeto para o −30). Gates da onda:
  195 arquivos / 2347 testes no projeto unit, 214 / 2495 na suíte completa, G4 19 / 148, G0 1125 módulos
  / 4770 dependências, `tsc` 0, lint exit 0 (17 warnings pré-existentes, re-contados com `git stash`),
  G5 com a nona entrada da agenda nos dois inventários de `docs/src`. Nenhuma migration nova; 5432
  intocada.
  **V8-4 done** em 2026-10-22: o fechamento de temporada anual sem rota e sem tela nova — regras puras em
  `backend/domain/gamification/season.ts` (o ano fechado é o ANTERIOR ao do `now` em dia civil SP; audiência "mês
  fotografado no ano OU `xp ≠ 0`"; régua pontos → tarefas → XP → userId, que `userId` único torna TOTAL, então o
  campeão é um só). `SeasonCyclePort` agrega o ano em duas queries e escreve `season_history` + `users.points = 0`
  + `users.xp = 0` no MESMO `$transaction` (moeda, contador vitalício e `user_badges` fora da instrução); o troféu
  **CAMPEÃO** é concedido pela `SeasonChampionPort` com a chave `GAMIFICATION:SEASON_CHAMPION:<ano>:<pessoa>` —
  sem tabela nova, e o troféu é vitalício pela unique `(userId, badgeId)`: campeão em dois anos tem um troféu e
  duas linhas de auditoria. O campeão é lido DO LIVRO (`listSeasonStandings`) depois das escritas. O troféu entra
  no catálogo pela data migration `prisma/data-migrations/v8-4-badge-campeao.sql` com **`criteria` nulo** — com
  critério nulo o motor atual não concede nada, e uma `specialCondition` nova cairia no QUIRK-6C e daria o
  troféu a todo mundo. `elo` nasce nulo: a escada com umbrais é a DEC-217 (V8-6). Gates da onda: 198 arquivos /
  2378 testes no projeto unit, 218 / 2532 na suíte completa, G4 20 / 154, G0 1135 módulos / 4808 dependências,
  `tsc` 0, lint exit 0 (17 warnings pré-existentes), G5 com a décima entrada da agenda nos dois inventários de
  `docs/src`. Nenhuma migration de schema (23 linhas em `_prisma_migrations`); a data migration do troféu aplicada
  **só na 5433** e conferida idempotente (INSERT 0 1, depois INSERT 0 0); 5432 intocada. Onda encerrada e
  reportada ao orquestrador; próxima: **V8-5** (moeda e loja, DEC-215).

## Regras do container

- Cada subpasta decide seu próprio processo e estado; este README não sobrepõe nada.
- Caminhos relativos aos subfolders permanecem válidos; referências externas a
  `plan-v2`/`spec-v2`/`clean-arch`/`plan-v3` na raiz do repo passam a apontar para
  `displayquest-v2/<subpasta>/`.
- Documentação fora deste container (`docs/`, `AGENTS.md`) referencia o caminho atual
  quando houver menção.
- Toda subpasta de plano mantém `PLAN.md` + `STATE.json`. O `STATE.json` é a fonte de
  verdade do andamento: batch não entra em `done` com gate vermelho ou lacuna aberta de
  que ele mesmo dependa.
