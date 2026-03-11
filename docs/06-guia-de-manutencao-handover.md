# Guia de Manutencao e Handover

## Objetivo

Facilitar a continuidade do projeto por novos alunos, bolsistas ou mantenedores, reduzindo perda de contexto e risco de regressao em mudancas futuras.

## 1. Por onde comecar

Ordem recomendada de leitura:

1. `README.md`
2. `docs/01-visao-geral-sistema.md`
3. `docs/03-regras-de-negocio.md`
4. `docs/04-arquitetura-tecnica.md`
5. `docs/07-modelo-de-dados.md`
6. `backend/README.md`
7. `app/README.md`
8. `docs/APOO/00-guia-de-leitura.md`

Observacao:

- a pasta `docs/APOO/` concentra a documentacao formal mais completa do sistema

## 2. Primeiros passos do novo mantenedor

- subir o ambiente local com aplicacao e banco
- executar as migrations necessarias
- validar login, cadastro e aprovacao de usuario
- navegar pelas areas principais do dashboard
- inspecionar `backend/composition/root.ts`
- entender o dominio de tarefas, que e o mais transversal do sistema

## 3. Como localizar uma mudanca

### 3.1 Fonte de verdade por camada

- interface e estado: `contexts/*`, `hooks/*`, componentes e paginas
- HTTP: `app/api/*`
- regra de negocio: `backend/modules/*`
- persistencia: `backend/repositories/*` e `prisma/schema.prisma`

### 3.2 Sequencia recomendada de analise

1. identificar a tela ou fluxo onde o problema aparece
2. localizar o provider, hook ou chamada em `contexts/api-client.ts`
3. localizar a rota correspondente em `app/api/*`
4. localizar o modulo backend responsavel
5. confirmar o modelo de dados envolvido em `prisma/schema.prisma`

## 4. Como alterar uma funcionalidade com menor risco

### Passo 1. Confirmar o comportamento atual

- validar o que a interface mostra
- confirmar o que a rota realmente aceita
- confirmar o que o backend efetivamente permite

### Passo 2. Alterar em camadas

- rota: parse, autenticacao, autorizacao e resposta HTTP
- modulo backend: regra de negocio e orquestracao
- repositorio ou gateway: persistencia e integracao
- provider, hook ou contexto: consumo no frontend
- componente ou pagina: exibicao e interacao

### Passo 3. Revisar impactos

- papel e permissao do usuario
- escopo de projeto vs escopo de laboratorio
- estados e transicoes do fluxo
- reflexo em mobile e desktop, quando houver interface responsiva

## 5. Pontos mais sensiveis do sistema

### 5.1 Tarefas

Esse e o dominio com maior potencial de regressao porque cruza:

- permissao
- quadro Kanban
- gamificacao e pontuacao
- progresso individual
- multiatribuicao
- integracao com projetos, laboratorio e sessoes de trabalho

Ao mexer em tarefas, revisar sempre:

- `taskVisibility`
- `isGlobal`
- `assignedTo`
- `task_assignees`
- `task_user_progress`

### 5.2 Permissoes

- a UI pode esconder ou exibir acoes, mas nao e a fonte de verdade
- a validacao real precisa existir no backend
- sempre conferir rota, modulo e regra de RBAC em conjunto

### 5.3 Laboratorio

O dominio de laboratorio mistura varias frentes:

- responsabilidades
- agenda e eventos
- quadro de avisos
- horarios do laboratorio
- horarios individuais
- issues

Ao alterar essa area, evitar misturar conceitos diferentes no mesmo fluxo ou na mesma persistencia.

### 5.4 Banco de dados

- nao alterar schema sem migration correspondente
- revisar impacto em seeds e scripts operacionais
- confirmar tipos, indices, relacoes e cascatas

## 6. Convencoes de manutencao adotadas

- rotas em `app/api/*` devem usar `getBackendComposition()`
- dependencias entre modulos devem ser resolvidas no composition root
- regra de negocio importante nao deve ficar presa ao route handler
- compatibilidade pode ser mantida em evolucoes grandes, desde que fique explicita
- alteracoes estruturais relevantes devem refletir na documentacao

## 7. Quando atualizar a documentacao

Atualize a documentacao sempre que houver:

- nova regra de negocio relevante
- mudanca de fluxo de usuario
- alteracao de permissao ou visibilidade
- mudanca estrutural de schema
- mudanca de arquitetura, deploy ou operacao

Referencias principais:

- `docs/03-regras-de-negocio.md`
- `docs/04-arquitetura-tecnica.md`
- `docs/07-modelo-de-dados.md`
- `docs/APOO/`

## 8. Limitacoes e pontos de atencao atuais

- parte do dominio de tarefas ainda convive com campos de compatibilidade, como `assignedTo` e `isGlobal`
- nem todos os modulos backend possuem o mesmo nivel de separacao interna entre contrato, use case e gateway
- alguns campos do schema ainda usam `String` onde um modelo temporal mais forte seria desejavel
- a cobertura de testes automatizados ainda pode ser ampliada

## 9. Trabalhos futuros sugeridos

<<<<<<< HEAD
- consolidar melhor a modelagem de escopo de tasks, reduzindo dependencia de `isGlobal`
- ampliar testes nos fluxos mais sensiveis, especialmente tarefas, laboratorio e permissoes
- endurecer tipos temporais do schema onde hoje ainda existem `String`
- evoluir observabilidade e verificacoes operacionais para ambientes alem do uso local
=======
## 8. Entregaveis de documentacao
>>>>>>> origin/main

## 10. Pacote documental recomendado para continuidade

Para manutencao cotidiana:

- `README.md`
- `app/README.md`
- `backend/README.md`
- `docs/03-regras-de-negocio.md`
- `docs/04-arquitetura-tecnica.md`
- `docs/07-modelo-de-dados.md`

Para leitura formal e institucional:

- `docs/01-visao-geral-sistema.md`
- `docs/02-manual-do-usuario.md`
- `docs/APOO/`
