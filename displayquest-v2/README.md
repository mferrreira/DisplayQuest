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
└── plan-v3/       OPERAÇÃO: correções e features pedidas por quem usa o sistema hoje (sessões, quadro, pontos)
```

## Fluxo de dependências (unidirecional)

```
spec-v2 (visão/requisitos)
        └──> plan-v2/01..06 (planejamento e execução das features)
                 ^
                 |
        clean-arch (base arquitetural — precisa estar `done` antes de 01)

plan-v3 (demanda de uso) ──> execução direta, sem depender dos três acima
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
