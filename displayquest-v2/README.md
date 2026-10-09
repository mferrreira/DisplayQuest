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
├── plan-v5/       OPERAÇÃO: domínio de projetos maduro — cronograma, pontos, relatórios técnicos, atestados (2026-10-06) — ready (DEC-61..77 e DEC-99..104)
└── plan-v6/       OPERAÇÃO: refatoração visual UI/UX — linguagem DisplayQuest em todas as telas (2026-10-07) — spec-driven, ready (DEC-105..114)
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

plan-v6 (refatoração visual) ──> camada de apresentação só — ordem frente ao plan-v5 resolvida
                                 (DEC-113): nas colisões (V6-4×V5-4, V6-5×V5-2, V6-7×V5-3) o
                                 plan-v5 executa ANTES; V6-0..V6-3 são livres. Home sem coluna
                                 secundária, largura toda (DEC-114)
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
  o que já existe, em 11 ondas revertíveis, com DEC-61..77 e DEC-99..104 contínuas da
  numeração global (DEC-78..98 são do plan-v4 — houve colisão, comentários renumerados).
- `plan-v6/` nasce da leitura da interface real contra as referências da skill
  `displayquest-ui` (`.opencode/skills/displayquest-ui/`): é **spec-driven** (a pasta
  tem `SPEC.md` como fonte de verdade do comportamento + `PLAN.md` da ordem +
  `STATE.json`), só mexe em camada de apresentação, e cobre **todas as telas** em 12
  ondas revertíveis (DEC-105..114 contínuas da numeração global). Ilustrações/texto
  manuscrito ficaram fora (DEC-109); tema escuro passa a ser coberto na skill (DEC-110).
  A ferramenta de execução é `/ui-refactor <tela>` com gate `/ui-review <tela>`.

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
