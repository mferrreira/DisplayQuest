# clean-arch — Meta-plano da refatoracao para Clean Architecture

> Este documento e a **fonte de verdade do processo** da refatoracao do backend para
> Clean Architecture. Define o metodo de trabalho (SPEC/PLAN/AGENT/STATE), a maquina
> de estados, os gates de verificacao, a politica de rollback e as convencoes de escrita.
>
> **Este e um documento de planejamento: nada aqui e implementado diretamente.** A
> refatoracao so roda quando o `STATE.json` registrar a fase atual e o proximo lote, um
> lote por vez, com todos os gates do lote verdes e evidencia registrada.

## 1. Proposito

O DisplayQuest segue hoje uma "Clean Architecture incremental" (termo do proprio
`docs/04-arquitetura-tecnica.md`): o esqueleto existe (composition root, layers,
ports, use cases), mas as regras de negocio centrais vivem nos gateways de
`infrastructure/`, as entidades de dominio importam `@prisma/client`, os contracts e
ports vazam tipos de persistencia e a pasta `domain/` (gamification) instancia
repositorios Prisma.

Antes de implementar as features do `spec-v2` (roles-permissions, logging/audit,
project-lifecycle, deep-gamification, multi-lab, SSO/LDAP) — que dependem exatamente
de identidade, sessoes, gamificacao e dominios por projeto — o dominio precisa ser
**de fato** isolado das camadas superiores.

Objetivo deste plano: **zerar as violacoes observaveis** (SPEC §3 e §5) e deixar verificavel
por maquina que o dominio nao conhece infraestrutura, que os use cases contem as regras
de negocio e que a composition root resolve as dependencias. Feito isso, as features v2
entram sem carregar divida arquitetural.

O que este plano **nao** e:

- Nao implementa as features do `spec-v2` — apenas arruma a casa para elas.
- Nao reescreve a UI nem o frontend (`entities/`, contexts, components). Se um
  refactor quebrar um tipo/forma consumido pelo cliente, corrigimos **apenas o
  necessario** para manter compilacao e comportamento identicos (SPEC AC-00-14).
- Nao troca de framework. Segue Node/Next + Prisma, apenas reposicionando camadas.

## 2. Estrutura de pastas deste plano

```
clean-arch/
├── ARCHITECTURE.md   <- este arquivo (o processo)
├── SPEC.md           <- arquitetura-alvo + regras de dependencia verificaveis + ACs
├── PLAN.md           <- ondas/batches com tarefas, arquivos, done criteria e gates
├── AGENT.md          <- guardrails e praticas de operacao do executor
└── STATE.json        <- rastreamento de estado (trello do processo)
```

A pasta `clean-arch/` vive na raiz do repo (decisao do dono 2026-09-19) e e o
pre-requisito de arquitetura para `plan-v2/01..06`. Nao e commitada em branch de
producao sem que `dev` a abrace como parte da base.

## 3. Maquina de estados da refatoracao

A refatoracao inteira e um projeto unico com fases/ondas (`PLAN.md`). Cada **onda** e
uma etapa atomica que evolui por:

```
pending -> in_progress -> verified -> done
                |             |
                |             +--> blocked
                +------> blocked (gate vermelho)
```

| Estado | Defincao | Criterio de permanencia |
|---|---|---|
| `pending` | Lote planejado no PLAN, ainda nao iniciado | PLAN descreve arquivos e done criteria |
| `in_progress` | Execucao em andamento | Confere com PLAN; nenhum gate regride |
| `verified` | Codigo pronto e gates do lote verdes | Evidencias de gates registradas no STATE |
| `blocked` | Parado por gate vermelho ou dependencia | Blocker registrado com acao de desbloqueio |
| `done` | Lote entregue, verificado e com evidencia | G1-G3 (G4/G5 quando aplicavel) verdes + DCs |

Regra: **nunca avanca sem o criterio do estado atual comprovado no `STATE.json`.**
`in_progress -> verified` so apos os gates do lote; `verified -> done` so apos
registro de evidencia (comandos + saidas).

### Ondas (sumario — detalhe completo no PLAN.md)

| Onda | Nome | Conteudo | Depende |
|---|---|---|---|
| 0 | Fundacoes | enforcement (dep-cruiser+barris), nucleo puro `backend/domain/`, DomainError, RBAC puro, limpeza tipografica de contracts, infra de teste/baseline | — |
| 1 | Piloto | `notifications` (modulo de menor risco valida o padrao completo) | 0 |
| 2 | Identidade e usuarios | `identity-access` + `user-management` | 0 |
| 3 | Execucao de trabalho | `work-execution` (sessoes/logs, pausas, anti-farm) | 2 |
| 4 | Gestao de tarefas | `task-management` (o maior gateway; compat legado) | 2, 3 |
| 5 | Projetos | `project-management` + `project-membership` | 2, 4 |
| 6 | Gamificacao | engines para dominio puro, portas de progresso/eventos | 2, 3, 4 |
| 7 | Relatorios | `reporting` (weekly + project reports) | 3, 5 |
| 8 | Loja e laboratorio | `store` + `lab-operations` | 2 |
| 9 | Cleanup e fechamento | retirada de legado, docs, gates finais | 1-8 |

## 4. Gates de qualidade (inegociaveis)

| # | Gate | Comando | Criterio |
|---|---|---|---|
| G0 | Arquitetura | `npx depcruise bin` (via `npm run arch:check`) | exit 0 (regras da SPEC §3) |
| G1 | Lint | `npx eslint --no-eslintrc --config .eslintrc.json <modificados>` | exit 0 |
| G2 | Typecheck | `npx tsc --noEmit` | 0 errors |
| G3 | Unit | `set -a; source .env; set +a; npx vitest run` | baseline do lote inteiro verde; nada regride; contagem so sobe |
| G4 | Integracao | `docker compose up -d postgres && set -a; source .env; set +a; npx vitest run` | green (quando o lote tocar adapter via DB) |
| G5 | Migracao | `npx prisma migrate dev` (local) / `deploy` (prod) | sem `db push`; n/a quando nao tocar schema |

Regra: G0-G3 **sempre**; G4 quando o lote reescrever um adapter que conversa com o
Postgres real; G5 somente se o schema mudar (nao previsto nesta refatoracao).

**Baseline de unit (importante):** o checkout atual nao possui a suite local das
mitigacoes (o unico teste rastreado e `tests/unit/entities/wire-task-schema.test.ts`;
`tests/setup.ts` referenciado no `vitest.config.mts` nao existe). A Onda 0 portanto
**reconstroi a infra de teste e captura o baseline real** antes de qualquer ondas de
refatoracao. Nunca codificar numeros magicos de "256/257" — o numero e o baseline
capturado e registrado no STATE na onda 0 (SPEC AC-00-13).

## 5. Politica de rollback

- **Gatilho**: qualquer gate vermelho, qualquer regressao observada, qualquer
  divergencia entre SPEC e codigo nao aprovada.
- **Acao**: `git checkout -- <caminhos>` e/ou `git reset --hard <checkpoint-verde>`;
  repensar, refazer, re-verificar. Nunca commitar sobre base vermelha.
- **Registro**: cada rollback entra no `STATE.json` (`rollbacks[]`) com motivo e
  acao tomada.

## 6. Convencoes de escrita

- Portugues (BR) sem acentos, consistente com `displayquest-v2/plan-v2/ARCHITECTURE.md`.
- IDs, enums e codigo em ingles (padrao do repo: `UserRole`, `TaskVisibility`).
- Nomes de arquivos canonicos: `ARCHITECTURE.md`, `SPEC.md`, `PLAN.md`, `AGENT.md`,
  `STATE.json`.
- Todo lote cita caminhos completos e done criteria observaveis; nada de "etc.".
- Decisoes arquiteturais relevantes sao registradas em `STATE.json.decisions[]`.

## 7. Relacao com os demais documentos

- `AGENTS.md` (raiz): gotchas reais e gates do repo — este plano respeita e nao
  contradiz.
- `docs/04-arquitetura-tecnica.md` e `backend/README.md`: serao atualizados na Onda 9
  para refletir a arquitetura-alvo.
- `plan-v2/`: as features 01-06 partem deste plano como pre-requisito; este plano
  precede `01` na ordem de implementacao do meta-plano.