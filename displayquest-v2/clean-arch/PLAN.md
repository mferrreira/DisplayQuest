# repo-cleanup — Plano de limpeza (dívida legado + código morto)

> Spec-driven: 1 lote = 1 commit revertível, gates completos por lote, evidencia no
> `STATE.json`. O plano anterior (refatoração clean-arch, ondas 0–9, 41 batches,
> AC-00-01..15, DEC-01..25) foi CONCLUÍDO em 2026-09-30 e seu conteúdo integral está
> preservado no git: tag `pre-cleanup` (commit `12d9d6c`). O registro de decisões e
> gaps foi carregado para o `STATE.json` v2.0.0 — comentários de código que citam
> `DEC-NN` continuam resolvíveis.

## 1. Propósito

Mapear e eliminar as dívidas de fluxo legado (código que ainda roda pelo caminho
pré-clean-arch) e o código morto (não está e não será utilizado), com malha de testes
e rollback por lote. Origem: auditoria de 4 dimensões em 2026-09-30 (fidelidade
arquitetural, rastreabilidade, manutenibilidade, extensibilidade) + varredura de
órfãos em 2026-10-01.

Não é: remoção do legado golden/contract (ADIADA — DEC-26), drop de tabela
`kanban_boards` (EXCLUÍDO — DEC-27), features do `plan-v2` (roadmap próprio).

## 2. Mapa de dívidas (medido em 2026-10-01)

| ID | Dívida | Evidência | Lote |
|----|--------|-----------|------|
| D1 | Cron weekly reset com Prisma cru, zero testes, exposto via `POST /api/cron/status` | `lib/services/cron-service.ts:89-156` | B3 |
| D2 | Expressões cron duplicam `SCHEDULED_PAUSE_TIMES` do domínio | `cron-service.ts:29-34` vs `backend/domain/work/schedule.ts` | B3 |
| D3 | api-guard instancia módulo fora do composition root (2ª instância RBAC em prod) | `lib/auth/api-guard.ts:15` | B4 |
| D4 | 16 rotas com autorização de `lib/auth/rbac` na rota (duplicada com o domínio) | grep medido: daily_logs, issues×4, purchases×2, tasks×2, user-badges×2, users/[id], weekly-reports×2, work-sessions | B6 |
| D5 | 9 rotas sem `domainErrorResponse`; `purchases/[id]` transforma NotFoundError tipado em 500 com mensagem interna | grep medido (lista no STATE.json `debtRegistry`) | B5 |
| D6 | 4 rotas sem composition root (auth, cron/status, health, avatars — 3 são infra legítima) | grep medido | B3 (só cron/status) |
| D7 | Imports cruzados de fallback em `index.ts` (task-management:19, lab-operations:69-72,195) | zona fora de RG-03/RG-04 | B7 |
| D8 | Porta-fachada gorda do notifications (6 use cases dependem de `NotificationsGateway`) | `notifications/application/ports/notifications.gateway.ts` | B10 |
| D9 | GAP-02 aberto: `WorkSession.status`/`User.status` como `string` | `backend/domain/work/WorkSession.ts:23`, `identity/User.ts:35` | B10 |
| D10 | 112 blocos try/catch+mapper idênticos em 77 rotas | grep medido | B10 |
| D11 | Cópia de `MAX_STRETCH_SEC` no cliente | `contexts/work-sessions-context.tsx:93` | B10 |

## 3. Lotes (1 lote = 1 commit)

| Lote | Escopo | Status |
|------|--------|--------|
| B0 | Setup: branch `cleanup/repo-sweep`, tag `pre-cleanup`, reset da pasta clean-arch (este plano + STATE v2.0.0 zerado) | ✅ concluído |
| B1 | Código morto Tier A: 24 componentes frontend órfãos + `lib/api/endpoints/work-sessions.ts` | ✅ concluído |
| B2 | Dependências npm mortas (Tier B, após verificação CSS/config) | ✅ concluído |
| B3 | D1+D2: cron weekly reset → `ResetWeeklyHoursHistoryUseCase`; horários cron derivados do domínio. Golden ANTES de mexer; unit + roundtrip depois | ✅ concluído (achados: gatilho legado disparava 15:30 vs domínio 15:00; 4 rotas `[id]` com assinatura Next-14 corrigidas — 2 quebradas em runtime) |
| B4 | D3: api-guard → `getBackendComposition().identityAccess` | aprovado, aguardando |
| B5 | D5: mapper nas 9 rotas sem `domainErrorResponse` (urgente: `purchases/[id]` 500→404/409) + rota-tests | aprovado, aguardando |
| B6 | D4: autorização rota→use case, módulo a módulo (16 rotas), rota-test antes de cada migração | aprovado, aguardando |
| B7 | D7: remover fallbacks cruzados dos 2 `index.ts` (harnesses injetam explicitamente) | aprovado, aguardando |
| B8 | OND9-B1: remover gateways legados + legacy-engines + `backend/repositories` + golden/contract (~9.000 linhas + 667 testes) | ⏸️ ADIADO (DEC-26) — só após B3-B7 verdes e quirks re-pinnados |
| B9 | Docs: corrigir `docs/APOO/12` §4.1 ("regra no gateway" → use case/domain), `docs/06` (fonte de persistência), `docs/03` (anti-farm), `AGENTS.md`; `verify.sh` + `arch:check`; plugar `scripts/assert-test-db.js` nos gates; doc "como adicionar funcionalidade" | aprovado, aguardando |
| B10 | Opcionais: D8 portas finas notifications, D9 GAP-02, D10 `withRouteHandler`, D11 constante do cliente | backlog opcional |
| B11 | Tabela `kanban_boards` | ❌ FORA (DEC-27 — tabela mantida) |

## 4. Gates por lote (todos verdes antes do commit)

- **G0** `npm run arch:check` (exit 0, allow-list vazia)
- **G1** `npx eslint --no-eslintrc --config .eslintrc.json <arquivos>` (exit 0)
- **G2** `npx tsc --noEmit` (0 erros)
- **G3** `npx vitest run tests/unit features` sem banco
- **G4** `npx vitest run` completo com `$env:DATABASE_URL="postgresql://dq_dev:dq_dev_local_only@127.0.0.1:5433/dq_dev_test"` (NUNCA 5432 — DEC-10)
- Lotes que mexem em dependência/build: + `npm run build`

## 5. Rollback

- Tag `pre-cleanup` = `12d9d6c` (estado verde pré-limpeza).
- Cada lote é 1 commit com mensagem `chore|fix|refactor(cleanup-Bn): ...` →
  `git revert <commit>` desfaz exatamente um lote.
- Vermelho em qualquer gate após um lote → revert imediato e registro em
  `STATE.json.rollbacks` antes de tentar de novo.

## 6. Guardrails (herdados do AGENT.md da refatoração — continuam válidos)

- Nada de lógica de negócio em route handler; use cases detêm regras; infra faz I/O.
- Dependência sempre para dentro (RG-01..RG-06); Prisma só em `infrastructure/`.
- Nenhum `new XRepository()` fora de factory/options. Erros tipados para negócio.
- Golden tests ANTES de mexer em comportamento; paridade old-vs-new só com decisão
  registrada (precedente DEC-23).
- Não tocar nos containers `display-quest`/`display-quest-db`; G4 só na 5433.
- `infrastructure/*.gateway.ts` e `application/ports/*.gateway.ts` são seams de
  golden/contract (DEC-15/19/25) — NÃO são código de produção e NÃO devem ser
  editados "para corrigir bug".
