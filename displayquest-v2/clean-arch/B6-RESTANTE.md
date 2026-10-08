# B6 (D4) — o que falta, medido

> Onde o trabalho de autorização rota→use case está hoje e o que resta.
> Escrito em 2026-10-05 no encerramento do B6-2b (`6d620bd`, mergeado na `dev`), para o plano
> poder ser retomado sem re-medir do zero. **Re-medido em 2026-10-07 na retomada** (ver §"O que
> mudou"): a contagem corrigida é **35 rotas**, não 33 — as somas dos próprios lotes já davam 35.
> Estado vivo em `STATE.json`; este arquivo é a **medição** que sustenta os lotes seguintes.

## Onde estamos

Lotes fechados, cada um 1 commit revertível, todos em G0–G4:

| lote | o que fez | commit |
|---|---|---|
| B6-0 | 38 testes de caraterização sobre 13 rotas sem teste | `cd2ffbf` |
| B6-1a | `/api/cron/status` passa a aceitar `GERENTE` (DEC-51) — **única mudança de comportamento do B6** | `72b0fbf` |
| B6-1b | gate do `cron/status` desce para `work-execution` (porta + adaptador sobre o singleton) | `eba53f8` |
| B6-2a | 4 gates `MANAGE_REWARDS` descem (badges ×3, rewards ×4) + `assertPermission` no domínio | `b8e0039` |
| B6-2b | gate de `MANAGE_NOTIFICATIONS` desce + **ator-de-sistema** (`ActorRef`, DEC-54) | `6d620bd` |
| B6-2c | 3 rotas self-or-manage do gamification descem (DEC-115: `ActorRef.user` com `id`, `requireActorSelfOrPermission`, GET user-badges = leitura aberta por decisão do dono) | commit deste registro |

Baseline de testes no encerramento do B6-2b (2026-10-05): 65/798 (início do B6) → 73/934 (2b);
suíte completa **83/1017**. G0: 748/2817 → 764/2906.

**Baseline medido na retomada (2026-10-07, após plan-v3/v4 + lote POS-1):** G0 **787 módulos /
3077 deps**, allow-list vazia (rodado ao vivo); G3 **87 arquivos / 1107 testes**, suíte completa
**97 / 1192** (documentado no `plan-v4/STATE.json` do lote POS-1). Os testes de caraterização do
B6 continuam todos verdes: `authorization-characterization.test.ts` 39/39 rodado ao vivo em
2026-10-07.

Restam **30 rotas** em 4 lotes — **41 originais − 11 já migradas** (`cron/status`, `badges` ×2,
`rewards` ×2, `notifications`, `user-badges` ×2, `users/[id]/gamification`, `purchases` ×2):

| lote | módulo (composition) | rotas | arquivos |
|---|---|---|---|
| ~~B6-2c~~ | ~~gamification~~ | ~~3~~ | ✅ fechado 2026-10-08 (DEC-115) |
| ~~B6-2d~~ | ~~store~~ | ~~2~~ | ✅ fechado 2026-10-08 (gate cross-actor + escopo lendo o ActorRef) |
| B6-3 | reporting + projectManagement | 8 | `weekly-reports` ×4, `weekly-hours-history`, `users/statistics`, `projects`, `projects/stats` |
| B6-4 | userManagement | 8 | `users`, `users/[id]`, `[id]/status`, `[id]/roles`, `[id]/profile`, `[id]/points`, `[id]/project-hours`, `users/approve` |
| B6-5 | workExecution | 4 | `work-sessions` ×2, `daily_logs` ×2 |
| B6-6 | labOperations | 7 | `issues` ×4, `responsibilities` ×2, `schedules/bulk` |
| B6-7 | taskManagement | 3 | `tasks`, `tasks/[id]`, `tasks/global-progress` |

Os 5 lotes restantes somam 32, e a distribuição por módulo bate **exatamente** com a do DEC-50
(user-management 8, reporting 7, lab-operations 7, work-execution 4, task-management 3; gamification
5 → 0 depois das migrações do B6-2a/2b/2c e store 4 → 2 depois do B6-2d). Os 3 call sites do cron
ficam em B6-3
(`resetWeeklyHoursHistory`/WEEKLY_RESET), B6-5 (`listWorkSessions`/NIGHTLY_SWEEP) e B6-6
(`pauseResponsibilityForUser`/SCHEDULED_PAUSE) — como previsto no DEC-54.

## O que mudou desde 2026-10-05 (re-medição 2026-10-07)

- **Retomada acordada com o dono (2026-10-07):** escopo do fechamento = **B6 restante + B9**
  (B10 fica como backlog opcional registrado; B11 excluído, DEC-27). Execução em **branch nova
  com merge fast-forward na dev** no fim, como no B6-0..2b (tag de rollback no ponto de partida).
- **A árvore estava suja na retomada:** o lote **POS-1** do plan-v4 (DEC-97/98, 41 arquivos) está
  modificado **não commitado**, e `plan-v5/` + `plan-v6/` estão **untracked**. O dono decidiu
  **não commitar nada agora** — a árvore precisa estar limpa antes do primeiro commit do B6, e
  essa resolução é dele.
- **Numeração de decisão é global e avançou:** DEC-01..29 clean-arch, 30..49 plan-v3, 50..54
  B6/D4, 55..98 plan-v4 (com o POS-1), 99..104 plan-v5, 105..114 plan-v6. **Próxima decisão
  livre: DEC-115.** Antes de abrir DEC nova, grep os **cinco** `STATE.json` (clean-arch, plan-v3,
  plan-v4, plan-v5, plan-v6) — a nota do AGENTS.md que diz "três" está velha.
- **Planos novos no meio do B6:** plan-v3 e plan-v4 **encerrados**; plan-v5 (domínio de projetos)
  e plan-v6 (refatoração visual UI/UX) **criados, nada executado**. O plan-v6 vai tocar em
  praticamente todas as telas, e o plan-v5 estende `projects`/`project_members` — os gates que o
  B6-3/B6-4/B6-7 vão mover estão em rotas que esses planos vão ler. Não há dependência de
  execução, mas se um dos dois começar antes do B6 terminar, re-medir as listas dos lotes afetados.
- **Rota nova desde a medição original: `POST /api/tasks/[id]/subtasks`** (plan-v4 V4-4) — já
  nasceu no **formato certo** (rota só autentica e mapeia; a autoridade é
  `assertCanOperateSubtasks` em `internal/task-view.ts:207`, que checa `MANAGE_TASKS`/`MANAGE_USERS`
  + as portas da tarefa mãe). **Fora do D4** e serve de **modelo** do estado final dos lotes.
- **`GET /api/user-badges` — RESPONDIDO pelo dono (2026-10-07) e executado no B6-2c:** leitura
  aberta, só exige sessão. Fixado em teste (`user-badges-authorization.test.ts`): se algum dia
  ganhar gate, o teste quebra.

## B6-2c — as 3 rotas self-or-manage ✅ EXECUTADO 2026-10-08 (DEC-115)

O que a execução fez, além do que a medição abaixo previa: `AwardBadgeCommand`/`RemoveUserBadge`
passaram a exigir `actor: ActorRef`; `AssertCanManageUserBadgesUseCase` é chamado pela rota ANTES
de ler corpo/params (as duas rotas validam depois do gate hoje); `ReadUserProgressionUseCase` foi
separado de `GetUserProgressionUseCase` porque este último tem chamadores internos (award flows);
`ActorRef.user` ganhou `id` e o domínio ganhou `requireActorSelfOrPermission`. A medição original
estava certa nos três pontos: ordem diferente por rota, leitura aberta na primeira, nenhum chamador
interno nos alvos.

Medidas na época, exatamente como estavam:

| rota | gate de hoje | ordem medida |
|---|---|---|
| `POST /api/user-badges` | `hasPermission(roles, "MANAGE_USERS")` → `403 {error:"Acesso negado"}` | gate **antes** do parse; depois `400 "badgeId e userId são obrigatórios"` |
| `DELETE /api/user-badges/[userId]/[badgeId]` | idem | gate **antes**; depois `400 "Parâmetros inválidos"` |
| `GET /api/users/[id]/gamification` | `ensureSelfOrPermission(actor, userId, "MANAGE_USERS")` → `403 {error:"Acesso negado"}` | **validação do id ANTES do gate** — `400 "Usuário inválido"` primeiro |

### As três coisas que a medição mudou no que o plano assumia

1. **A ordem não é a mesma nas três.** Em `users/[id]/gamification` o `userId` é validado
   **antes** do gate; nas outras duas o gate vem antes. Migrar as três com o mesmo molde troca a
   ordem em uma delas. Escrever o teste de caraterização antes, como no B6-2b.

2. **`GET /api/user-badges` não tem gate nenhum.** Qualquer autenticado lê os badges de **qualquer**
   `userId` que passar na query. Não é buraco novo — é o contrato de hoje — mas é a primeira rota do
   D4 em que "adicionar o gate" seria **mudar comportamento**, não mover decisão. Decisão do dono
   antes de mexer: deixar como leitura aberta (e fixar em teste que é aberta, como foi feito com
   `GET /api/badges` no B6-2a) ou gatear.

3. **Nenhum dos 3 use cases alvo tem chamador interno** (medido: `awardBadge`, `removeUserBadge`,
   `getUserProgression` têm 1 chamador cada, a rota). Então o `ActorRef` do DEC-54 entra neles sem
   risco de quebrar rotina de sistema — ao contrário do B6-2b. `evaluateUserBadges` não tem rota
   nenhuma: é interno do módulo, fora do escopo do D4.

### O que o DEC-54 já resolveu para este lote

`ensureSelfOrPermission` é a regra "o ator age em si mesmo **ou** tem a permissão". Ela já delega
em `identityAccess().canAccessSelfOrPermission`, que já é domínio. Falta só o **enforcement no use
case** — que é o D4 inteiro. O desenho provável: o comando passa a levar `actor: ActorRef` e o use
case decide `self || MANAGE_USERS`. Como o `ActorRef` já existe, a parte de "quem é o ator" está
pronta; falta a variante *self*, que ainda não tem forma no domínio.

### Lacuna de teste medida

`gamification-routes.test.ts` dobra o módulo **e** o guard. A única asserção de 403 do arquivo é a
de `POST /api/user-badges`, e ela vem do `hasPermission` dobrado — ou seja, **nenhum 403 desta rota
é exercitado de verdade**. É o mesmo defeito que o B6-2a achou nos badges. O lote precisa de um
`tests/unit/api/user-badges-authorization.test.ts` com módulo real sobre porta falsa, no molde de
`badge-authorization.test.ts`.

## B6-2d — `purchases` ×2 ✅ EXECUTADO 2026-10-08

Medido apenas no B6-0: a regra da rota é `!canManagePurchases && targetUserId !== actor.id`, então
um **VOLUNTARIO comprando para si recebe 201** e só quem compra para terceiro recebe 403. O teste de
caraterização refutou a minha crença anterior. Em autorização, escrever o teste antes de mover o
gate. `listPurchases`/`createPurchase` ainda estão dobrados no teste de caraterização — quando o
lote acontecer, trocam pelo módulo real.

O que a execução confirmou e acrescentou: os 6 métodos das 2 rotas têm **quatro ordens diferentes**
(POST 400→403; GET 404→403; PUT/DELETE 403→404; PATCH 404→gate-por-ação→400/409), o gate de POST é
`requireActorSelfOrPermission`, o escopo A2 passou a ler o `ActorRef` (o veredito
`canManagePurchases` pré-calculado pela rota era a dívida com outra grafia), e o PUT precisou de
`AssertCanManagePurchasesUseCase` para preservar o 403-antes-do-parse (padrão do B6-2b). Registro
completo em `STATE.json` (batch B6-2d).

## B6-5 — o cron, agora com resposta pronta

`lib/services/cron-service.ts` chama 3 use cases sem ator: `workExecution.listWorkSessions`
(:69,:70,:90), `labOperations.pauseResponsibilityForUser` (:76), `reporting.resetWeeklyHoursHistory`
(:109). O DEC-54 já definiu como isso passa: `systemActor("NIGHTLY_SWEEP")`,
`systemActor("SCHEDULED_PAUSE")`, `systemActor("WEEKLY_RESET")`. Falta aplicar.

Aviso que continua válido: `work-execution` é o único módulo **sem factory** — instancia use case
inline por chamada (`GatewayCall`), então a migração nele custa mais que nos outros seis.

## Regras que valem para todos os lotes restantes

- **Um duplo de módulo não faz o teste falhar — faz o 403 desaparecer.** Montar o módulo real sobre
  portas falsas dentro do factory do `vi.mock("@/backend/composition/root")`, que é lazy.
- `createStoreModule`/`createGamificationModule` constroem **todos** os use cases: todas as portas
  precisam existir; usar duplo que lança `"porta X não deveria ser usada"` para as não exercitadas.
- `requireApiActor` normaliza com `normalizeRoles`: `login("COORDENADOR")` (string) vira `[]` e
  nega todo mundo. Sempre array.
- Antes de confiar num status fixado por duplo, conferir o que o caminho **real** faz com aquele
  payload (o B6-0 fixou 201 para um payload que a produção rejeita com 400).
- Gate migrado → corpo do 403 ganha `code`/`details` (DEC-53). Asserções de corpo exato viram
  `toMatchObject`.
- Gate que desce **não pode** deixar uma validação de rota com mensagem própria passando na frente
  dele (B6-2b).
- Ler o **wiring**, não a assinatura do port: o default no-op de `TaskNotificationsPort` esconde o
  módulo real injetado em `backend/composition/root.ts:39`.
