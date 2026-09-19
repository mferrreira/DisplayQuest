# clean-arch · SPEC — Arquitetura-alvo (contrato)

> Este documento e o **contrato do que significa "estar conforme"** a Clean
> Architecture no DisplayQuest. As regras da secao 3 sao verificaveis por maquina
> (dependency-cruiser, greps e testes de arquitetura). Os ACs da secao 6 sao os
> criterios de aceitacao da refatoracao como um todo; as ondulas do PLAN derivam
> done criteria destes ACs.

## 1. Principios

Derivados de Clean Architecture (Uncle Bob) + hexagonal (ports & adapters) + DDD
liquido para um monolito Next.js/Prisma:

1. **Dependency Rule**: dependencias apontam para dentro. O nucleo (`domain`) nao
   conhece framework, ORM, HTTP ou banco.
2. **Regras de negocio no lugar certo**: entidades/regras puras no `domain`; caso de
   uso (orquestracao de aplicacao) em `application/use-cases`; I/O e framework em
   `infrastructure`; HTTP em `app/api` — adaptadores finos.
3. **Inversao de dependencia**: `application` declara `ports` (interfaces); a
   `infrastructure` implementa; a **composition root** injeta. Nenhum `new` de
   repositorio fora da composition root/factory.
4. **Inumeravel tipagem**: enums e types de dominio sao puros; o adaptador Prisma
   mapeia; `@prisma/client` nunca aparece em `domain`/`application`.
5. **Erros tipados**: condicoes de negocio lancam erros tipados com status estavel;
   rotas mapeiam, nao engolem (nada de 500 generico para negacao de acesso).
6. **Integracao entre dominios**: via composition root (injecao) e eventos
   in-process — nunca `infrastructure` chamando factory de outro modulo.
7. **Testabilidade**: dominio e use cases sao pure e testaveis com fakes; adapters
   sao testados por contract tests contra a mesma suite.

## 2. Estrutura-alvo

```
backend/
├── composition/
│   └── root.ts                    # composition root (unico ponto de fios)
├── domain/                        # NUCLEO COMPARTILHADO (puro, zero imports externos)
│   ├── identity/                  # User, UserRole, papel, PERMISSIONS/FEATURE_ACCESS, policies
│   ├── project/                   # Project, Membership, papeis de projeto
│   ├── task/                      # Task, status, visibilidade, regras de aprovacao
│   ├── work/                      # WorkSession, DailyLog, schedule (pausas), MAX_STRETCH
│   ├── gamification/              # Badge, Reward, engine de regras (pura)
│   ├── reporting/                 # WeeklyReport, ProjectReport, periodos
│   ├── lab/                       # LabEvent, Issue, schedule, responsibility
│   ├── store/                     # Purchase, Reward, fluxo de aprovacao/completao
│   ├── notification/              # Notification, preferencias
│   ├── errors/                    # DomainError e subclasses tipadas (status estavel)
│   └── index.ts                   # barrel
├── modules/
│   └── <modulo>/
│       ├── domain/                # (opcional) logica pura especifica do modulo
│       ├── application/
│       │   ├── contracts.ts       # tipos de entrada/saida (DOMAIN types apenas)
│       │   ├── ports/             # interfaces que a infra implementa
│       │   └── use-cases/         # casos de uso com a regra de negocio
│       ├── infrastructure/
│       │   ├── <modulo>.gateway.ts   # adapter fino (I/O + mapping)
│       │   ├── repositories/         # implementacoes Prisma (mapping domain<->db)
│       │   ├── events/               # publishers/subscribers in-process
│       │   └── index.ts
│       └── index.ts               # factory do modulo (aceita options para testes)
├── models/   -> (transitorio) entidades migradas para backend/domain ao final
└── repositories/ -> (transitorio) continuam Prisma-backed, apenas consumidos por infrastructure
```

Posicao dos `ports`: mantidos em `application/ports/` (fronteira application/domain,
como hoje). O `domain` continua ser o unico lugar sem dependencia; `application`
depende de `domain` + proprio `ports`.

## 3. Regras de dependencia (verificaveis por maquina)

Regras a configurar no dependency-cruiser (`.dependency-cruiser.js` + script
`npm run arch:check`) e, onde possivel, como `no-restricted-imports` no ESLint e
greps de baseline:

| Regra | Origem | Destino (permitido) | Destino (proibido) |
|---|---|---|---|
| RG-01 domain puro | `backend/domain/**` | node builtins, `backend/domain`, libs de tipo (ts) | `@prisma/client`, `backend/repositories`, `@/lib/database`, `@/lib/auth`, `@/lib/api`, `@/lib/storage`, `backend/modules`, `backend/composition`, `app`, `next` |
| RG-02 domain do modulo | `backend/modules/*/domain/**` | idem RG-01 | idem RG-01 |
| RG-03 application | `backend/modules/*/application/**` | `backend/domain`, proprio modulo (`*/application`, `*/domain`) | `@prisma/client`, `backend/repositories`, `@/lib/database`, `@/lib/auth`, `app`, `next`, outro modulo, proprio `*/infrastructure` |
| RG-04 infrastructure | `backend/modules/*/infrastructure/**` | `@prisma/client`, `@/lib/database/prisma`, `backend/repositories` (transitorio), `backend/domain`, proprio modulo (`application`, `domain`, `ports`) | `backend/composition`, outro modulo, `app`, `next`, factory `create*Module` de outro modulo |
| RG-05 composition | `backend/composition/**` | qualquer | — (e a unica excecao que cruza modulos) |
| RG-06 rotas HTTP | `app/api/**` | `backend/composition/root`, `backend/domain`, `@/lib/auth` (helper de sessao), libs de API | `@prisma/client`, `@/lib/database/prisma`, `backend/repositories`, `backend/modules/*/infrastructure`, `create*Module` |

Regras complementares (nao caem no dep-cruiser, mas sao verificadas por grep/teste):

- RG-07 barrel: cada camada possui `index.ts`; imports entre camadas usam o barrel.
- RG-08 no-`new`: `infrastructure/**` e `domain/**` nao instanciam repositorios
  (`new XRepository()`); injecao via factory options/composition root.
- RG-09 models puros: ao final da Onda 9, `backend/models/**` nao importa
  `@prisma/client` (entidades puras); adapters `fromPrisma`/`toPrisma` vivem em
  `infrastructure/`/`repositories`.
- RG-10 eventos: portas de evento em `application/ports`; implementacoes em
  `infrastructure/events`; subscriptores registrados apenas na composition root.
- RG-11 erros: regra de negocio nao lanca `Error` generico; usa tipo de
  `backend/domain/errors` com `.status` estavel.

## 4. Destinos por grupo de artefatos

### 4.1 Entidades (`backend/models/**`)
- `Backend/models/*` deixam de importar `@prisma/client`.
- `fromPrisma`/`toPrisma` migram para os adapters (repositories/infra) ou param de
  existir (mapping explicito no adapter).
- Conteudo ricco (invariantes, regras de criacao) permanece na entidade pura.

### 4.2 Repositorios (`backend/repositories/**`)
- Continuam seres Prisma-backed, porem consumidos somente por `infrastructure/**`.
- Nenhum `new XRepository()` fora de factories/composition root.
- Retorno sempre em tipos de `backend/domain` (nunca tipos `work_sessions` etc.).

### 4.3 RBAC e autorizacao
- `backend/domain/identity/` ganha enums puros (`UserRole` de dominio), matrizes
  `PERMISSIONS`/`FEATURE_ACCESS` e `hasPermission` pura.
- `lib/auth/rbac.ts` deixa de importar `UserRole` do Prisma (re-exporta do dominio
  ou vira fina).
- UI continua enforendo so presentacionalmente; decisao final no backend (regra
  atual, preservada).

### 4.4 Regras de dominio hoje fora do lugar
- `lib/work-sessions/schedule.ts` (pura) -> `backend/domain/work/schedule.ts`.
- `backend/modules/gamification/domain/engines/*` (repos no construtor) -> regras
  puras em `backend/domain/gamification`; leitura de dados via portas.
- `lib/storage/report-uploads.ts` permanece como seam de exemplo (ver §4.4).

### 4.5 Contratos e portas
- `contracts.ts` e `ports/*` referenciam apenas tipos de `backend/domain` + tipos
  locais; nenhum `@prisma/client`. Lista exata dos pontos a corrigir no PLAN §2.

## 5. Definition of Done (por modulo refatorado)

Um modulo so e `done` quando TODOS:

- [ ] **G0** dep-cruiser verde para o modulo (nenhuma regra RG-01..RG-06 violada).
- [ ] **G1/G2/G3** verdes com baseline capturado (PLAN §4); **G4** quando o
      adapter que toca DB foi reescrito.
- [ ] Golden tests registrados **antes** de mexer, verdes **depois**, com diff de
      saidas ZERO para a matriz congelada (PLAN §4).
- [ ] Contract tests do(s) port(s) passando na implementacao nova (a mesma suite
      que rodava na antiga indexando o seam).
- [ ] Use cases contem a regra de negocio que estava no gateway (verificavel por
      diff de linhas e por evolucao: nenhum `throw new Error` de negocio restante
      na infra; erros tipados).
- [ ] `contracts/ports` sem `@prisma/client`; rota do modulo sem prisma/repos/factory.
- [ ] Cross-modulo somente via composition root/eventos.
- [ ] STATE.json: batch `verified/done`, evidencias, DCs da onda marcadas.

## 6. Acceptance Criteria (ACs) globais

Cada AC Gherkin-avel / verificavel por comando. Registradas no STATE.

| ID | Criterio (verificacao) |
|---|---|
| AC-00-01 | `rg "@prisma/client" backend/domain backend/modules/*/application` retorna zero. (G0 + grep) |
| AC-00-02 | `rg "@prisma/client" backend/models` retorna zero ao final da Onda 9. |
| AC-00-03 | `rg "create\\w+Module\\(" backend/modules` so aparece em `*/index.ts` e `backend/composition/root.ts`. |
| AC-00-04 | `rg "new \\w+Repository\\(" backend/modules` retorna zero em `/application/` e `/domain/`; em `infrastructure/` so em factory (se houver). |
| AC-00-05 | dep-cruiser (G0) exit 0 no repo inteiro. |
| AC-00-06 | `app/api` sem `@prisma/client` e sem `create\\w+Module(` (unica excecao: `getBackendComposition`). |
| AC-00-07 | Rotas de modulos refatorados retornam status HTTP estaveis para condicoes de negocio tipadas (403/404/400/409), nunca 500 generico cattrado. Verificado por rota-test. |
| AC-00-08 | Por modulo: golden tests existem (registro no STATE), contract tests verdes na impl nova, use-case tests puros verdes. |
| AC-00-09 | Enums de dominio puros existem em `backend/domain` e sao a fonte usada por contracts/ports; `lib/auth/rbac.ts` sem `@prisma/client`. |
| AC-00-10 | `backend/domain/**` nao importa `backend/repositories`, DB, auth, api, storage, app, next (G0). |
| AC-00-11 | Cross-modulo: nenhum `infrastructure` importa `backend/modules/<outro>`. |
| AC-00-12 | `lib/work-sessions/schedule.ts` movido/ reexportado via `backend/domain/work` mantendo mesma export funcao (verificavel por teste de import). |
| AC-00-13 | Baseline unit da onda 0 registrado no STATE; ao final de cada onda o numero de testes verdes e >= baseline; zero regressao de testes existentes. |
| AC-00-14 | Nenhuma mudanca no frontend salvo para preservar compilacao/comportamento; toda mudanca necessaria e minima, documentada no PLAN do batch e no STATE (§6). |
| AC-00-15 | `docs/04-arquitetura-tecnica.md` e `backend/README.md` atualizados (Onda 9) descrevendo dominio/modules/composition e a regra de dependencia G0. |

## 7. Fora de escopo (explicito)

- Implementacao das features do `spec-v2` (somente a base).
- Mudanca de framework/ORM (segue Prisma; migrations versionadas).
- Refactor de frontend (features/entities UI); apenas correcao minima se algo quebrar.
- Novo schema/migracao (G5 n/a, salvo necessidade comprovada).
- Troca do processo de deploy/container.

## 8. Criterios para o dono considerar "pronto" (macro)

1. G0-G3 verdes e G4 (quando aplicavel) no ultimo lote da Onda 9.
2. Todas as AC-00-01..15 com evidencia no STATE.json.
3. Nenhuma feature v2 prejudicada: `plan-v2/01` continua planejada; nenhuma AC de
   `plan-v2` quebrada (regressao zero nas suites existentes).
4. Docs atualizados; dicionario de termos e arquitetura-alvo legiveis por terceiros.