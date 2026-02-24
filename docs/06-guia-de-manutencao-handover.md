# Guia de Manutencao e Handover

## Objetivo

Facilitar a continuidade do projeto por outros alunos/equipe, reduzindo risco de regressao e perda de contexto.

## 1. Onde comecar (novo mantenedor)

Ordem recomendada de leitura:

1. `README.md`
2. `docs/01-visao-geral-sistema.md`
3. `docs/03-regras-de-negocio.md`
4. `docs/04-arquitetura-tecnica.md`
5. `backend/README.md`
6. `app/README.md`
7. `docs/07-modelo-de-dados.md`

## 2. Checklist de onboarding tecnico

- subir ambiente local (app + banco)
- executar migrations
- entender login/aprovacao
- navegar pelos dashboards principais
- inspecionar `backend/composition/root.ts`
- entender fluxo de `tasks` (principal dominio transversal)

## 3. Como alterar uma funcionalidade com baixo risco

### Passo 1: localizar a fonte de verdade

- UI/state: `contexts/*`, `hooks/*`
- endpoint: `app/api/*`
- regra de negocio: `backend/modules/*`
- persistencia: `backend/repositories/*` + `prisma/schema.prisma`

### Passo 2: alterar em camadas

- rota: parse/auth/HTTP
- modulo/use case: regra de negocio
- repositorio: persistencia
- frontend/context: consumo e estado
- componente: exibicao

### Passo 3: validar impactos

- permissao/role (RBAC)
- projeto vs laboratorio
- task publica vs delegated/private
- mobile/desktop (UI)

## 4. Pontos sensiveis do sistema (atencao)

### 4.1 Tasks

Dominio mais sensivel por envolver:

- permissao
- kanban
- gamificacao/pontos
- progresso individual
- multiatribuicao
- projetos e laboratorio

Ao alterar tasks, revisar:

- `taskVisibility`
- `isGlobal` (compatibilidade)
- `task_assignees`
- `task_user_progress`

### 4.2 Permissoes

- frontend so esconde/mostra UI
- backend e quem deve bloquear de fato
- sempre validar rota + modulo

### 4.3 Banco de dados

- evitar mudar schema sem migration
- conferir impacto em seed dev
- revisar relacoes e deletes em cascata

## 5. Convencoes de manutencao adotadas

- rotas `app/api/*` usam `getBackendComposition()`
- modulos recebem dependencias via composition root (DIP)
- refatoracao incremental (sem reescrever tudo)
- manter compatibilidade quando possivel em mudancas grandes

## 6. Quando criar documentacao nova

Criar/atualizar docs quando houver:

- nova regra de negocio relevante
- mudanca de fluxo de usuario
- mudanca de deploy/operacao
- mudanca estrutural de schema/arquitetura

## 7. Limitacoes e trabalhos futuros (estado atual)

### Limitacoes conhecidas

- parte do dominio de tasks ainda usa compatibilidade com campos legados (`assignedTo`, `isGlobal`)
- nem todos os modulos possuem o mesmo nivel de granularidade em use cases/domain services
- cobertura de testes automatizados pode ser expandida

### Trabalhos futuros sugeridos

- consolidar modelagem de escopo de task (projeto vs laboratorio) sem dependencia de `isGlobal`
- ampliar testes de use case (mocks de ports)
- documentar API por dominio (opcional)
- criar observabilidade/healthchecks mais formais para producao

## 8. Entregaveis de documentacao (TCC)

Para avaliacao e continuidade, os documentos principais recomendados sao:

- visao geral
- manual do usuario
- regras de negocio
- arquitetura tecnica
- operacao/deploy
- guia de manutencao/handover
- modelo de dados
