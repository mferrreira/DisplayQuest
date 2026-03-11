# Regras de Negocio

## Objetivo

Consolidar as regras operacionais mais importantes do sistema, com foco em acesso, visibilidade, fluxo de trabalho e manutencao de coerencia funcional entre os dominios.

Este documento resume o comportamento esperado do sistema. Em caso de divergencia, o backend e o modelo de dados devem ser tratados como fonte de verdade.

## 1. Usuarios e aprovacao de acesso

- o cadastro cria usuario com status inicial `pending`
- apenas usuarios com status `active` conseguem autenticar
- aprovacao e rejeicao de cadastros dependem de perfis de gestao
- os papeis globais do usuario sao armazenados em `roles[]`
- a visibilidade do perfil depende de `profileVisibility`

## 2. Papeis e permissoes

O sistema usa um modelo de RBAC baseado em `UserRole`, com mapeamento de permissoes em `lib/auth/rbac.ts`.

Permissoes principais hoje:

- `MANAGE_USERS`
- `MANAGE_NOTIFICATIONS`
- `MANAGE_REWARDS`
- `MANAGE_PURCHASES`
- `MANAGE_WORK_SESSIONS`
- `MANAGE_PROJECTS`
- `MANAGE_PROJECT_MEMBERS`
- `MANAGE_TASKS`

Observacoes:

- a UI pode ocultar ou destacar acoes, mas a validacao efetiva deve acontecer no backend
- alguns fluxos combinam permissao global com vinculo ao projeto ou com hierarquia de papeis

## 3. Projetos e membros

- todo projeto possui criador e pode possuir lider
- o acesso a um projeto pode depender de membership, papeis de gestao ou autoria
- o membership em projeto usa a tabela `project_members`
- o mesmo usuario pode ter papeis diferentes no contexto de projetos distintos
- links e referencias externas do projeto ficam agregados no campo `links`

## 4. Tarefas

O dominio de tarefas combina tres dimensoes que nao devem ser confundidas:

- visibilidade da task
- atribuicao da task
- progresso e conclusao

### 4.1 Tipos de task (`taskVisibility`)

- `public`
  - visivel no escopo correspondente
  - usa progresso individual por usuario
  - a conclusao de um usuario nao encerra automaticamente a experiencia dos demais
- `delegated`
  - visivel no projeto
  - manipulacao normalmente restrita aos atribuídos e a papeis de gestao
- `private`
  - visivel no projeto
  - segue restricao de manipulacao semelhante a `delegated`

### 4.2 Escopo de task publica

- task publica de projeto: `projectId` preenchido e `taskVisibility = public`
- task publica de laboratorio: atualmente representada por `isGlobal = true`

### 4.3 Atribuicao

- a multiatribuicao e feita por `task_assignees`
- `assignedTo` permanece no modelo por compatibilidade e como referencia de atribuicao principal
- mudancas em atribuicao devem considerar os dois mecanismos quando houver fluxo legado envolvido

### 4.4 Progresso individual

- o progresso individual e persistido em `task_user_progress`
- esse mecanismo e especialmente importante para tasks publicas
- pontos concedidos ao usuario podem ser registrados em `awardedPoints`

### 4.5 Fluxo de conclusao e revisao

- task publica pode ser concluida individualmente
- task delegada ou privada depende de atribuicao valida ou de permissao de gestao
- o fluxo de revisao pode mover a task para estados como `in-review`, `done` e `adjust`
- rejeicoes em revisao podem exigir ajuste posterior sem apagar o historico da task

## 5. Pontuacao, badges e ranking

- tasks podem gerar pontos conforme o valor definido em `points`
- a conclusao de atividades influencia ranking e indicadores do usuario
- badges podem ser concedidas de forma automatica ou manual, conforme o fluxo de gamificacao
- resgates na loja dependem do saldo de pontos do usuario e do fluxo de compras

## 6. Sessoes de trabalho, logs e horas

- sessoes registram inicio, encerramento, duracao, atividade, local e, quando aplicavel, projeto
- sessoes podem ser associadas a tarefas por meio de `work_session_tasks`
- logs diarios complementam o registro do trabalho executado
- relatorios e historicos semanais consolidam a producao e a carga horaria

## 7. Relatorios

- relatorios semanais de usuario consolidam o periodo por janela de datas
- o sistema tambem oferece visualizacao de relatorios ligados a projetos no frontend
- a geracao e consulta de relatorios precisa respeitar o escopo de acesso do ator

## 8. Operacoes do laboratorio

O dominio de laboratorio concentra:

- responsabilidades
- agenda e eventos do dia
- quadro de avisos
- horarios do laboratorio
- horarios individuais
- issues operacionais

Regras gerais:

- a visualizacao do ambiente de laboratorio e mais ampla do que a capacidade de edicao
- responsabilidades podem ser vistas por usuarios sem permissao de gerenciamento, mas a transicao de estado depende de permissao
- horarios podem ser visualizados por todos os usuarios autenticados, mas a edicao e restrita a perfis autorizados
- avisos e eventos nao devem ser tratados como a mesma coisa

## 9. Issues e acompanhamento operacional

- issues registram problema, prioridade, categoria e responsaveis
- o fluxo usa estados enumerados em `IssueStatus`
- a prioridade usa `IssuePriority`
- reporter e assignee devem ser tratados como papeis distintos dentro do ciclo da issue

## 10. Historico, notificacoes e auditoria

- alteracoes relevantes podem ser registradas em `history`
- notificacoes sao direcionadas por usuario e possuem controle de leitura
- a trilha de auditoria nao substitui a regra de negocio, mas ajuda a explicar transicoes e operacoes realizadas

## 11. Regras de manutencao com impacto funcional

- rotas HTTP nao devem concentrar regra de negocio complexa
- mudancas em permissao precisam ser validadas no backend, nao apenas na UI
- alteracoes no dominio de tarefas devem considerar sempre:
  - `taskVisibility`
  - `isGlobal`
  - `task_assignees`
  - `task_user_progress`
- mudancas em horarios, responsabilidades e avisos do laboratorio devem preservar a separacao entre leitura ampla e edicao restrita
