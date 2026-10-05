# B6 (D4) — o que falta, medido

> Onde o trabalho de autorização rota→use case está hoje e o que resta.
> Escrito em 2026-10-05 no encerramento do B6-2b (`6d620bd`, mergeado na `dev`), para o plano
> poder ser retomado sem re-medir do zero. Estado vivo em `STATE.json`; este arquivo é a
> **medição** que sustenta os lotes seguintes.

## Onde estamos

Lotes fechados, cada um 1 commit revertível, todos em G0–G4:

| lote | o que fez | commit |
|---|---|---|
| B6-0 | 38 testes de caraterização sobre 13 rotas sem teste | `cd2ffbf` |
| B6-1a | `/api/cron/status` passa a aceitar `GERENTE` (DEC-51) — **única mudança de comportamento do B6** | `72b0fbf` |
| B6-1b | gate do `cron/status` desce para `work-execution` (porta + adaptador sobre o singleton) | `eba53f8` |
| B6-2a | 4 gates `MANAGE_REWARDS` descem (badges ×3, rewards ×4) + `assertPermission` no domínio | `b8e0039` |
| B6-2b | gate de `MANAGE_NOTIFICATIONS` desce + **ator-de-sistema** (`ActorRef`, DEC-54) | `6d620bd` |

Baseline de testes: 65/798 (início do B6) → 68/877 (2a) → 70/909 (2a) → **73/934** (2b); suíte
completa **83/1017**. G0: 748/2817 → **764/2906**.

Restam **33 rotas** em 6 lotes: B6-2c, B6-2d, B6-3, B6-4, B6-5, B6-6, B6-7.

## B6-2c — as 3 rotas self-or-manage

Medidas hoje, exatamente como estão:

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

## B6-2d — `purchases` ×2 (o mais arriscado, ainda sem medição própria)

Medido apenas no B6-0: a regra da rota é `!canManagePurchases && targetUserId !== actor.id`, então
um **VOLUNTARIO comprando para si recebe 201** e só quem compra para terceiro recebe 403. O teste de
caraterização refutou a minha crença anterior. Em autorização, escrever o teste antes de mover o
gate. `listPurchases`/`createPurchase` ainda estão dobrados no teste de caraterização — quando o
lote acontecer, trocam pelo módulo real.

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
