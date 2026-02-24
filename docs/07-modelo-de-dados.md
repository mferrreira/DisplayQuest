# Modelo de Dados (Resumo)

## Objetivo

Documentar as entidades principais e suas relacoes para facilitar manutencao e evolucao do banco.

Fonte de verdade:

- `prisma/schema.prisma`

## 1. Nucleo de usuarios e acesso

### `users`

Campos relevantes:

- identificacao: `id`, `name`, `email`
- autenticacao: `password`
- status: `status`
- perfil: `avatar`, `bio`, `profileVisibility`
- produtividade/gamificacao: `points`, `completedTasks`, `weekHours`, `currentWeekHours`
- autorizacao: `roles[]`

Relacionamentos:

- projetos, tasks, sessoes, logs, compras, badges, notificacoes, etc.

## 2. Projetos

### `projects`

- `createdBy` (criador)
- `leaderId` (lider do projeto)
- `status`
- `links` (JSON)

### `project_members`

Tabela de membership entre projeto e usuario:

- `projectId`
- `userId`
- `roles[]` (papel no contexto do projeto)

Restricao:

- `@@unique([projectId, userId])`

## 3. Tarefas

### `tasks`

Campos principais:

- `title`, `description`
- `status`, `priority`
- `assignedTo` (compatibilidade / primeiro atribuido)
- `projectId`
- `dueDate`
- `points`
- `completed`, `completedAt`
- `taskVisibility` (`public`, `delegated`, `private`)
- `isGlobal` (compatibilidade para task publica de laboratorio)

### `task_assignees`

Multiatribuicao:

- `taskId`
- `userId`
- `assignedBy`
- `assignedAt`

Restricao:

- `@@unique([taskId, userId])`

### `task_user_progress`

Progresso individual por usuario (principalmente tasks publicas):

- `taskId`
- `userId`
- `status`
- `pickedAt`
- `completedAt`
- `awardedPoints`

Restricao:

- `@@unique([taskId, userId])`

## 4. Trabalho e produtividade

### `work_sessions`

- sessao de trabalho por usuario
- pode estar `active` ou `completed`
- inclui atividade, local, projeto, duracao

### `work_session_tasks`

Relacao N:N entre sessoes e tasks.

### `daily_logs`

Logs diarios por usuario (opcionalmente ligados a projeto e sessao).

### `weekly_reports`

Relatorios semanais por usuario (janela de datas + resumo).

### `weekly_hours_history`

Historico consolidado de horas por semana.

## 5. Operacoes do laboratorio

### `lab_responsibilities`

- responsavel atual/passado
- inicio/fim
- observacoes

### `lab_events`

- eventos/ocorrencias registradas no laboratorio

### `laboratory_schedules`

- horarios gerais do laboratorio

### `user_schedules`

- horarios individuais de usuarios

### `issues`

- chamados/problemas operacionais
- status, prioridade, categoria, reporter/assignee

## 6. Gamificacao e loja

### `badges` / `user_badges`

- catalogo de badges e atribuicoes a usuarios

### `rewards` / `purchases`

- catalogo de recompensas e resgates

## 7. Auditoria e notificacoes

### `history`

- trilha de alteracoes por entidade
- armazena `oldValues`, `newValues`, `metadata` (JSON)

### `notifications`

- notificacoes por usuario
- leitura (`read`, `readAt`)

## 8. Observacoes de evolucao

- `assignedTo` e `isGlobal` ainda sao usados por compatibilidade e integracao com fluxos legados
- novas evolucoes em tarefas devem priorizar `task_assignees` e `task_user_progress`
