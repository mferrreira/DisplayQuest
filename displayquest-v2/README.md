# displayquest-v2 — Planejamento da evolucao v2 do DisplayQuest

> Container unico do planejamento do DisplayQuest v2 (branch `dev`). Este folder e
> **organizacional**: agrupa, em subpastas independentes, a visao/requisitos, o
> meta-plano de planejamento e o pre-requisito arquitetural. Cada subpasta mantem seu
> proprio processo e estado — nenhum meta-processo novo existe aqui.

## Estrutura

```
displayquest-v2/
├── spec-v2/       VISAO: requisitos de alto nivel do dono (fonte das features)
├── plan-v2/       PROCESSO: meta-plano Spec-Driven + features 01..06 (cada uma com PLAN/SPEC/AGENT/STATE)
└── clean-arch/    BASE: refatoracao do backend para Clean Architecture (pre-requisito das features 01..06)
```

## Fluxo de dependencias (unidirecional)

```
spec-v2 (visao/requisitos)
        └──> plan-v2/01..06 (planejamento e execucao das features)
                 ^
                 |
        clean-arch (base arquitetural — precisa estar `done` antes de 01)
```

- `spec-v2/` registra a visao do dono (gamificacao profunda, projeto mais complexo,
  logging/audit, roles/permissions, multi-lab SaaS, SSO/LDAP).
- `plan-v2/` transforma a visao em features planejadas (`NN-<nome>/`) com maquina de
  estados, gates G1-G5 e `state.json` global.
- `clean-arch/` isola o dominio do backend (sem Prisma no core, use cases com as
  regras, infra como adapters) **antes** das features; sem isso, as features v2
  carregariam divida arquitetural.

## Regras do container

- Cada subpasta decide seu proprio processo e estado; este README nao sobrepoe nada.
- Caminhos relativos aos subfolders permanecem validos; referencias externas a
  `plan-v2`/`spec-v2`/`clean-arch` na raiz do repo passam a apontar para
  `displayquest-v2/<subpasta>/`.
- Documentacao fora deste container (`docs/`, `AGENTS.md`) referencia o caminho atual
  quando houver mencao.