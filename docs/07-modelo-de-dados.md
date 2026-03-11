# Modelo de Dados

## Objetivo

Registrar as entidades persistidas no sistema, seus campos mais relevantes e os relacionamentos principais, tomando como fonte de verdade o arquivo `prisma/schema.prisma`.

Este documento nao substitui o schema. Ele serve como apoio de leitura para manutencao, onboarding e analise de impacto.

## Fonte de verdade

- `prisma/schema.prisma`

## 1. Usuarios, acesso e perfil

### `users`

Entidade central do sistema. Reune autenticacao, perfil, produtividade e vinculacoes com os demais dominios.

Campos mais relevantes:

- identificacao: `id`, `name`, `email`
- autenticacao: `password`
- situacao de acesso: `status`
- perfil publico: `avatar`, `bio`, `profileVisibility`
- produtividade e gamificacao: `points`, `completedTasks`, `weekHours`, `currentWeekHours`
- autorizacao: `roles[]`
- controle temporal: `createdAt`

Relacionamentos principais:

- criacao e lideranca de projetos
- membership em projetos
- tasks atribuídas e progresso individual em tasks publicas
- sessoes de trabalho, logs diarios e relatorios
- responsabilidades, eventos e horarios individuais
- badges, compras, notificacoes e historico

Observacoes:

- `roles` e um array de `UserRole`
- `profileVisibility` usa o enum `ProfileVisibility`
- o mesmo usuario pode aparecer em relacoes diferentes no dominio de badges: como dono do badge recebido, como criador do badge e como usuario que concedeu a badge

## 2. Projetos e membership

### `projects`

Representa os projetos acompanhados pelo laboratorio.

Campos principais:

- identificacao e descricao: `id`, `name`, `description`
- autoria e lideranca: `createdBy`, `leaderId`
- situacao: `status`
- apoio operacional: `links`
- controle temporal: `createdAt`

Relacionamentos:

- `creator` -> usuario criador
- `leader` -> usuario lider do projeto
- `members` -> membros do projeto
- `tasks` -> tarefas vinculadas ao projeto
- `daily_logs` e `work_sessions` -> registros associados ao projeto

Observacao:

- `createdAt` esta armazenado como `String`, nao como `DateTime`
- `links` e um campo `Json`, usado para reunir referencias externas do projeto

### `project_members`

Tabela de associacao entre usuario e projeto.

Campos principais:

- `projectId`
- `userId`
- `joinedAt`
- `roles[]`

Restricoes:

- `@@unique([projectId, userId])`

Observacao:

- os papeis do membro no projeto tambem usam `UserRole[]`, reaproveitando o mesmo enum de papeis globais

## 3. Tarefas e acompanhamento de execucao

### `tasks`

Tabela principal de tarefas do sistema.

Campos principais:

- conteudo: `title`, `description`
- fluxo: `status`, `priority`, `completed`, `completedAt`
- vinculacao: `projectId`, `assignedTo`
- prazo e pontuacao: `dueDate`, `points`
- visibilidade e escopo: `taskVisibility`, `isGlobal`

Relacionamentos:

- `assignee` -> usuario em `assignedTo`
- `projectObj` -> projeto da task
- `assignees` -> multiatribuicao em `task_assignees`
- `taskProgress` -> progresso individual em `task_user_progress`
- `workSessions` -> relacao com sessoes em `work_session_tasks`

Observacoes:

- `assignedTo` permanece no modelo por compatibilidade com fluxos antigos e como referencia de atribuicao principal
- `taskVisibility` define se a tarefa e `public`, `delegated` ou `private`
- `isGlobal=true` identifica tarefas publicas de laboratorio

### `task_assignees`

Controla a multiatribuicao de tarefas.

Campos principais:

- `taskId`
- `userId`
- `assignedBy`
- `assignedAt`

Restricoes e indices:

- `@@unique([taskId, userId])`
- `@@index([taskId])`
- `@@index([userId])`

Observacao:

- `assignedBy` e armazenado como inteiro simples, sem relacao formal no schema

### `task_user_progress`

Registra o progresso individual do usuario em relacao a uma task, especialmente nas tasks publicas.

Campos principais:

- `taskId`
- `userId`
- `status`
- `pickedAt`
- `completedAt`
- `awardedPoints`
- `createdAt`
- `updatedAt`

Restricoes e indices:

- `@@unique([taskId, userId])`
- `@@index([taskId])`
- `@@index([userId])`
- `@@index([taskId, status])`

## 4. Trabalho, horas e relatorios

### `work_sessions`

Sessao de trabalho aberta por um usuario.

Campos principais:

- autoria: `userId`, `userName`
- execucao: `startTime`, `endTime`, `duration`, `status`
- contexto: `activity`, `location`, `projectId`
- controle temporal: `createdAt`, `updatedAt`

Relacionamentos:

- `user`
- `project`
- `dailyLog`
- `tasks` por meio de `work_session_tasks`

### `work_session_tasks`

Tabela de associacao entre sessoes de trabalho e tarefas.

Campos principais:

- `workSessionId`
- `taskId`
- `createdAt`

Restricoes:

- `@@unique([workSessionId, taskId])`
- `@@index([taskId])`

### `daily_logs`

Registro diario do trabalho realizado.

Campos principais:

- `userId`
- `projectId`
- `date`
- `note`
- `workSessionId`
- `createdAt`

Observacoes:

- `workSessionId` e opcional, mas quando preenchido e unico
- isso cria uma relacao 1:1 opcional entre `daily_logs` e `work_sessions`

### `weekly_reports`

Relatorio semanal por usuario.

Campos principais:

- `userId`
- `userName`
- `weekStart`
- `weekEnd`
- `totalLogs`
- `summary`
- `createdAt`

### `weekly_hours_history`

Historico consolidado de horas semanais por usuario.

Campos principais:

- `userId`
- `userName`
- `weekStart`
- `weekEnd`
- `totalHours`
- `createdAt`

## 5. Operacoes do laboratorio

### `lab_responsibilities`

Registra responsabilidades assumidas no laboratorio.

Campos principais:

- `userId`
- `userName`
- `startTime`
- `endTime`
- `notes`

Observacao:

- `startTime` e `endTime` estao armazenados como `String`

### `lab_events`

Ocorrencias e eventos registrados no laboratorio.

Campos principais:

- `userId`
- `userName`
- `date`
- `note`
- `createdAt`

### `laboratory_schedules`

Grade geral de horarios do laboratorio.

Campos principais:

- `dayOfWeek`
- `startTime`
- `endTime`
- `notes`
- `createdAt`
- `updatedAt`

### `user_schedules`

Horarios individuais por usuario.

Campos principais:

- `userId`
- `dayOfWeek`
- `startTime`
- `endTime`
- `createdAt`

### `issues`

Chamados ou problemas operacionais do laboratorio.

Campos principais:

- conteudo: `title`, `description`, `category`
- fluxo: `status`, `priority`, `resolvedAt`
- autoria e atribuicao: `reporterId`, `assigneeId`
- controle temporal: `createdAt`, `updatedAt`

Observacoes:

- `status` usa o enum `IssueStatus`
- `priority` usa o enum `IssuePriority`

### `kanban_boards`

Tabela presente no schema para quadros Kanban.

Campos principais:

- `name`
- `labId`
- `createdAt`
- `updatedAt`

Observacao:

- apesar de existir no schema, esta tabela aparece menos integrada ao restante do modelo atual e merece ser revisada antes de novas evolucoes

## 6. Gamificacao e loja

### `badges`

Catalogo de badges do sistema.

Campos principais:

- identificacao e exibicao: `name`, `description`, `icon`, `color`
- classificacao: `category`
- criterio: `criteria`
- situacao: `isActive`
- autoria: `createdBy`
- controle temporal: `createdAt`

Observacoes:

- `category` usa o enum `BadgeCategory`
- `criteria` e armazenado em `Json`

### `user_badges`

Tabela de atribuicao de badges a usuarios.

Campos principais:

- `userId`
- `badgeId`
- `earnedAt`
- `earnedBy`

Restricoes:

- `@@unique([userId, badgeId])`

Observacao:

- `earnedBy` e opcional e identifica quem concedeu a badge quando a atribuicao nao foi automatica

### `rewards`

Catalogo de recompensas disponiveis na loja.

Campos principais:

- `name`
- `description`
- `price`
- `available`

### `purchases`

Registro de resgates e compras feitas com pontos.

Campos principais:

- `userId`
- `rewardId`
- `rewardName`
- `price`
- `purchaseDate`
- `status`

Observacoes:

- `purchaseDate` esta armazenado como `String`
- `rewardName` e redundante em relacao ao catalogo, mas preserva o nome da recompensa no momento da compra

## 7. Auditoria e notificacoes

### `history`

Tabela de historico e auditoria generica.

Campos principais:

- alvo da alteracao: `entityType`, `entityId`
- acao: `action`
- autoria: `performedBy`
- momento: `performedAt`
- dados: `oldValues`, `newValues`, `metadata`
- apoio textual: `description`

Indices:

- `@@index([entityType, entityId])`
- `@@index([performedBy])`
- `@@index([performedAt])`
- `@@index([action])`

### `notifications`

Notificacoes direcionadas a um usuario.

Campos principais:

- `userId`
- `type`
- `title`
- `message`
- `data`
- `read`
- `createdAt`
- `readAt`

Observacao:

- `data` e armazenado como `String`, normalmente para carregar informacoes serializadas em JSON

## 8. Enumeracoes relevantes

### `UserRole`

- `COORDENADOR`
- `GERENTE`
- `LABORATORISTA`
- `PESQUISADOR`
- `GERENTE_PROJETO`
- `COLABORADOR`
- `VOLUNTARIO`

### `ProfileVisibility`

- `public`
- `members_only`
- `private`

### `BadgeCategory`

- `achievement`
- `milestone`
- `special`
- `social`

### `IssueStatus`

- `open`
- `in_progress`
- `resolved`
- `closed`

### `IssuePriority`

- `low`
- `medium`
- `high`
- `urgent`

## 9. Observacoes para evolucao

- campos como `projects.createdAt`, `tasks.dueDate`, `lab_responsibilities.startTime`, `lab_responsibilities.endTime` e `purchases.purchaseDate` ainda estao como `String`; qualquer endurecimento do modelo deve considerar migracao cuidadosa
- no dominio de tarefas, novas evolucoes devem priorizar `task_assignees` e `task_user_progress`, sem depender apenas de `assignedTo`
- `kanban_boards` existe no schema, mas precisa ser analisado com cuidado antes de ganhar papel mais central
- este documento deve ser atualizado sempre que houver alteracao estrutural no `schema.prisma`
