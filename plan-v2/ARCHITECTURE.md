# plan-v2 — Meta-plano de desenvolvimento Spec-Driven com gerenciamento de estado

> Este documento é a **fonte de verdade do processo** de planejamento do DisplayQuest v2.
> Ele define como cada funcionalidade é planejada (PLAN), especificada (SPEC), repassada ao
> agente (AGENT) e rastreada (STATE), além das regras de rigor: done criteria testáveis,
> gates de verificação, rollback e a máquina de estados dos sub-projetos.
>
> Este é um documento de **planejamento**: nada aqui é implementado diretamente. Cada
> funcionalidade vive em uma subpasta `plan-v2/NN-<nome>/` e só entra em execução quando
> o seu `STATE` atingir `approved + dependencies done`.

## 1. Propósito

O DisplayQuest (repositório DisplayQuest, branch `dev`) é um monolito Next.js +
Prisma que precisa evoluir em seis frentes de grande porte. plan-v2 é o **meta-plano**:
uma pasta de planejamento que registra, para cada uma dessas frentes, o seu ciclo de vida
completo — do draft do problema até a funcionalidade `done` e verificada.

O que plan-v2 **não** é:

- Não é um repositório de código novo — é uma pastinha de planos dentro do repositório
  existente, com artefatos Planejamento/SPEC/Agente/Estado por funcionalidade.
- Não substitui `docs/04-arquitetura-tecnica.md` nem `AGENTS.md` — respeita-os.
- Não determina o roadmap do produto — apenas **organiza e vigia o processo** para que
  cada funcionalidade seja especificada, implementada e verificada com rigor.
- Não é para ser commitado além do branch `dev` (a ramo de desenvolvimento). Multi-lab
  (item 05) e SSO/LDAP (item 06) são projetos de infra em separado, fora deste repo.

## 2. Estrutura de pastas de plan-v2

```
plan-v2/
├── ARCHITECTURE.md       <- este arquivo (o meta-plano)
├── state.json            <- rastreamento global do plan-v2 (o trello do processo)
├── templates/            <- modelos canônicos dos 4 artefatos
│   ├── PLAN.template.md
│   ├── SPEC.template.md
│   ├── AGENT.template.md
│   └── STATE.template.json
├── 01-roles-permissions/            <- RF01 (dependência: indefinida)
├── 02-logging-audit/                <- RF02 (dependência: 01) *
├── 03-project-lifecycle-reports/    <- RF03 (dependência: 01, 02) *
├── 04-deep-gamification/            <- RF04 (dependência: 01, 02, 03) *
├── 05-multi-lab-saas/               <- RF05 (dependência: 01-04) *
└── 06-auth-sso-ldap/                <- RF06 (dependência: 01-05) *
   cada subpasta: PLAN.md, SPEC.md, AGENT.md, STATE.json
```

\* A numeração corresponde à **ordem de implementação recomendada** (ver Seção: Dependências
e ordem de implementação). A ordem é **role-permissions → logging → project-lifecycle →
gamification → multi-lab → auth/SSO**.

## 3. Máquina de estados de funcionalidade

Cada funcionalidade evolui por estados discretos. Toda transição é um **gate**: só
executa quando as evidências do estado anterior estão registradas no `STATE.json`.

```
draft → review → approved → implementing ⇄ verifying → done
                 │              │         │
                 └── blocked ────┘         └── blocked
```

| Estado | Definição | Critério de permanência |
|---|---|---|
| `draft` | A SPEC nasce | SPEC refletindo a intenção, sem drift entre PLAN/SPEC. |
| `review` | Em revisão | Todos os ACs lintáveis, testáveis, não ambíguos. |
| `approved` | SPEC validada por gate | Nenhum gate fuzzy; dependências `done`. |
| `implementing` | Código escrito contra a SPEC aprovada | Cada lote confere com PLAN.md; nenhum gate regride. |
| `verifying` | Verificação ativa contra as ACs | Todas ACs verdes confirmadas por evidência. |
| `blocked` | Parado por dependência ou AC em falta | Blocker registrado no STATE com ação de desbloqueio. |
| `done` | Funcionalidade entregue e verificada | Todas as ACs verdes + evidência no STATE.json. |

Regra: **nunca avança de um estado sem que o critério de permanência do estado atual esteja
comprovado**. Em particular: `review→approved` só após gates verdes; `implementing→verifying`
só após testes escritos e verdes; `verifying→done` só após **todas** as ACs + evidência.

## 4. Produção de done criteria

Cada done criterion deve ser **mensurável e observável**, nunca subjetivo:

1. **Testável**: pode ser validado por um teste automatizado, um comando, ou uma query.
2. **Verificável por terceiro**: um observador independente (humano ou agente) consegue
   confirmar a partir do STATE + evidências.
3. **Granular**: sem "etc." ou "suporte a ...", sem agrupar comportamentos não relacionados.
4. **Rastreável**: toda done criterion referencia sua AC na SPEC (ex.: `AC-07`).
5. **Sem acoplamento acidental**: não mistura requisito funcional com escolha de
   implementação; implementação aparece apenas em PLAN.md (o "como"), nunca na SPEC.

Formato padrão de uma AC (Gherkin-ável):

```
AC-07 — Aprovar sem gerente
Given  um projeto com líder L, uma task de staff tal, L logado com GERENTE_PROJETO
When   L aprova a task
Then   a task passa a done, a task é delegada/revisada, e o dono recebe pontos
```

## 5. Gates de qualidade (inegociáveis)

Antes de marcar `verifying → done`, rodar (na ordem):

| # | Gate | Comando | Critério |
|---|---|---|---|
| G1 | Lint | `npx eslint --no-eslintrc --config .eslintrc.json <arquivos>` | exit 0 |
| G2 | Typecheck | `npx tsc --noEmit` | 0 errors |
| G3 | Unit | `npx vitest run` (com env: `set -a; sset;a`) | 256/257 (único fail conhecido) + novos testes verdes |
| G4 | Integração | `docker compose up -d postgres && npx vitest run` (com env) | n/a quando não tocar DB |
| G5 | Migração | `npx prisma migrate dev` (local) / `deploy` (prod) | sem `db push` |

Regra: **G1–G3 sempre; G4–G5 quando a etapa tocar schema/DB/infra**.
"Todos os gates verdes da etapa" é pré-condição para `verifying → done`. Sem isso,
o rollback é disparado.

## 6. Política de rollback

- **Gatilho**: qualquer gate vermelho, qualquer regressão, qualquer divergência de SPEC
  não aprovada.
- **Ação**: `git checkout -- <caminho>`, `git reset --hard <checkpoint>` + re-spc. Repensa,
  refaz. Nunca commitar sobre base vermelha.
- **Registro**: cada rollback fica no `STATE.json` (`rollbacks[]`).

## 7. Dependências e ordem de implementação

- **Independências (paralelizáveis entre si):** `01-roles-permissions` e estrutura-base
  são trabalhos iniciais; a ordem de 02→03→04 é estritamente dependente.
- **Dependências (ordem obrigatória):**
  - 02 → 03: o ciclo de vida do projeto (lifecycle) consome relatórios; sudo.
  - 03 → 04: a gamificação profunda consome `project-reports` e `history`.
  - 05: usa o que 01-04 entregarem, mas a infra (provisioning/tenant) é isolável
    arquiteturalmente e pode ter design em paralelo.
  - 06: **projeto de identidade diferente** (SSO/LDAP). Depende do contrato de identidade
    do 05 (quem é o usuário federado já reforçado no DisplayQuest).

Sequência canônica do gate: `01 → 02 → 03 → 04 → 05 → 06`.

## 8. Dicionário de termos

| Termo | Significado |
|---|---|
| SPEC | Contrato de comportamento aprovado (SPEC.md) |
| PLAN | Ordem de execução com done criteria (PLAN.md) |
| AGENT | Regras e contexto para o agente executor (AGENT.md) |
| STATE | Rastreamento de progresso com evidências (STATE.json) |
| AC | Acceptance Criterion (critério de aceitação na SPEC) |
| RF0n | Requisito Funcional n do documento de visão |
| done | Estado terminal de uma funcionalidade (todas ACs verdes + gates) |

## 9. Convenções de escrita

- Português (BR) sem acentos, consistente com o restante do repo.
- IDs e enums em inglês (padrão do repo: `UserRole`, `TaskVisibility`, etc.).
- Nomes de pastas: `NN-<nome>-em-pt-br-sem-acentos`.
- Nomes de arquivos: `PLAN.md`, `SPEC.md`, `AGENT.md`, `STATE.json` (exatamente).
- Uma funcionalidade por pasta; uma pasta por funcionalidade. Sem exceções.
