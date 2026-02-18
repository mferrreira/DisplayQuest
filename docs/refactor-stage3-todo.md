# Refatoração Etapa 3 - TODO Executável

## Objetivo
Evoluir do monólito acoplado para módulos de domínio com fronteiras claras, sem quebrar operação atual.

## Concerns Confirmados
- [ ] Separar `Lab` de `Project` de forma explícita.
- [ ] Unificar leitura de relatórios (`ProjectHours`, `WeeklyReport`, `WeeklyHoursHistory`) em um módulo de reporting (weekly reports já migrado para read-model).
- [ ] Tornar `WorkSession` o ponto central da execução do trabalho (daily log de fechamento integrado no fluxo de conclusão e escrita legada descontinuada).
- [ ] Isolar `Gamification` de `Task/WorkSession` por eventos de domínio.
- [ ] Redesenhar fluxo de membros de projeto (voluntário/líder) para reduzir redundância no backend e no front.

## Auditoria de Entidades (estado atual)
### Inconsistências identificadas
- [ ] `projects.createdAt` está como `String`, enquanto o restante usa `DateTime`.
- [ ] `tasks.status`, `tasks.priority` e `tasks.taskVisibility` estão como `String` no banco, mas no domínio usam unions TS.
- [ ] `work_sessions.userName`, `lab_events.userName`, `weekly_reports.userName` são dados derivados e podem divergir de `users.name`.
- [ ] Regras de papel global/projeto ainda se misturam em pontos do código.
- [ ] Fluxo de membership/liderança em projeto ainda depende de múltiplos caminhos de escrita.

### Decisões alvo (propostas)
- [ ] Migrar `projects.createdAt` para `DateTime`.
- [ ] Introduzir enums Prisma para `TaskStatus`, `TaskPriority`, `TaskVisibility` (e mapear gradualmente).
- [ ] Tratar campos `userName` como snapshot opcional de leitura (não fonte de verdade).
- [ ] Consolidar RBAC global e papéis de projeto em contratos de autorização únicos.
- [ ] Definir `ProjectMembership` como agregado único para entrada/saída/roles de membros.

## Relações de Domínio (alvo)
### Núcleos
- [ ] `IdentityAccess` (usuário, autenticação, autorização).
- [ ] `ProjectCollaboration` (projeto, membership, líder, políticas de acesso por projeto).
- [ ] `WorkExecution` (task, work session, daily log).
- [x] `LabOperations` (responsabilidade, agenda do lab, eventos, issues) com módulo raiz consolidado.
- [ ] `Reporting` (read-model consolidado).
- [ ] `Gamification` (xp, nível, elo, missões/desafios/eventos e progressão).
- [ ] `Store` (catálogo da loja e resgate de itens via pontos/moedas).

### Contratos entre domínios
- [ ] `WorkExecution -> Reporting`: publicar eventos de sessão/task concluída.
- [ ] `WorkExecution -> Gamification`: publicar eventos de progresso.
- [ ] `ProjectCollaboration -> WorkExecution`: policy check de membership/liderança.
- [ ] `LabOperations` sem dependência direta de serviços de `ProjectCollaboration`, apenas contratos.

## Fluxo de Membros de Projeto (concern prioritário)
- [ ] Caso de uso único: `UpsertProjectMemberRole`.
- [ ] Caso de uso único: `AssignProjectLeader` (garantindo invariantes de liderança).
- [ ] Caso de uso único: `AddVolunteerToProject`.
- [ ] Endpoint único para gerenciar membros com comando explícito (`add`, `remove`, `set_roles`, `set_leader`).
- [ ] Front consumindo um serviço único de membership (evitar múltiplos endpoints por tela).

## Módulos Piloto (próxima implementação)
### Piloto A - `work-execution`
- [x] Criar pasta `backend/modules/work-execution`.
- [x] Extrair casos de uso:
  - [x] `StartWorkSession`
  - [x] `CompleteWorkSession` (com vínculo de tasks)
  - [x] `CreateDailyLogFromSession`
- [x] Criar gateway de infraestrutura para adaptação dos serviços legados.
- [x] Definir porta de saída para publicação de eventos de domínio.
- [x] Migrar leitura (`GET`) e remoção (`DELETE`) para use-cases do módulo.
- [x] Migrar atualização (`PATCH`) para use-cases do módulo.

### Piloto B - `project-membership` (ProjectCollaboration)
- [x] Criar pasta `backend/modules/project-membership`.
- [x] Extrair casos de uso:
  - [x] `ListProjectMembers`
  - [x] `AddProjectMember`
  - [x] `RemoveProjectMember`
- [x] Criar gateway de infraestrutura Prisma para regras de acesso/membership.
- [x] Migrar rotas `app/api/projects/[id]/members*` para o módulo.
- [x] Adicionar `UpsertProjectMemberRole` e `AssignProjectLeader`.
- [x] Publicar contrato único para front (`add/remove/set_roles/set_leader`).
- [x] Migrar componentes principais de membros para consumir ações unificadas (`ProjectMembersManagement`, `ProjectMembersManager`).
- [x] Remover endpoint legado de remoção por rota separada (`members/[membershipId]`).
- [x] Criar camada cliente/hook para membership (`lib/api/project-members.ts`, `hooks/use-project-members.ts`).

### Piloto C - `gamification`
- [x] Criar pasta `backend/modules/gamification`.
- [x] Definir modelo inicial:
  - [x] `user_progress` (`xp`, `level`, `elo`) via projeção derivada de `users.points` (compatibilidade)
  - [ ] `missions`, `challenges`, `events` (com janela de datas)
- [x] Consumir eventos de `work-execution` sem acoplamento direto.
- [x] Pontuar por `WORK_SESSION_COMPLETED` e `TASK_COMPLETED` com idempotência.
- [x] Publicar endpoint de leitura de progressão (`/api/users/[id]/gamification`).
- [x] Migrar `badges` e `user-badges` para operações do módulo de gamificação.
- [x] Remover `BadgeController` legado.
- [x] Mover engines de badges para dentro de `backend/modules/gamification/domain/engines` (removendo dependência de `backend/services`).

### Piloto D - `store`
- [x] Criar pasta `backend/modules/store`.
- [x] Encapsular `rewards` e `purchases` em gateway/módulo de loja.
- [x] Migrar rotas `rewards*` e `purchases*` para o módulo `store`.
- [x] Corrigir fluxo de pontos da compra (débito no resgate e estorno em rejeição/cancelamento elegível).
- [ ] Preparar evolução para múltiplas moedas (separar `points` de `store_coins` no próximo ciclo).

### Piloto E - `task-management`
- [x] Criar pasta `backend/modules/task-management`.
- [x] Encapsular operações de tasks em gateway/módulo.
- [x] Migrar rotas `tasks*` (`/api/tasks`, `/api/tasks/[id]`, `approve`, `reject`) para o módulo.
- [x] Desacoplar API de tasks de instanciação direta de `TaskService`/repositories.

### Piloto F - `project-management`
- [x] Criar pasta `backend/modules/project-management`.
- [x] Encapsular CRUD de projetos e estatísticas de voluntários em gateway/módulo.
- [x] Migrar rotas `projects*` (`/api/projects`, `/api/projects/[id]`, `/api/projects/[id]/volunteers`) para o módulo.
- [x] Extrair política de acesso ao projeto (`canActorAccessProject`) para ponto único reutilizado nas rotas de horas.

### Piloto G - `lab-operations`
- [x] Criar módulo raiz `backend/modules/lab-operations`.
- [x] Consolidar operações de `lab-events`, `laboratory-schedule`, `responsibilities` e `lab-issues` em um ponto único.
- [x] Migrar rotas de laboratório para usar `createLabOperationsModule`.
- [x] Remover caminho duplicado (`lab-issues`) para manter somente `lab-operations` como módulo ativo do domínio.

### Piloto H - `identity-access`
- [x] Criar módulo `backend/modules/identity-access` para política única de autorização (permission, any-role, self-or-permission).
- [x] Centralizar `api-guard` em cima do módulo de `identity-access`.
- [x] Remover dependência de `requirePermission` legado nas rotas restantes de usuários.
- [x] Remover checagens hardcoded de role nos serviços críticos (`TaskService`, `UserService`, `ProjectService`, `WeeklyReportService`, `UserScheduleService`, `HistoryService`, `LabResponsibilityService`, `LaboratoryScheduleService`, `LabEventService`).

### Piloto I - `user-management`
- [x] Criar pasta `backend/modules/user-management`.
- [x] Encapsular operações de usuários em gateway/módulo (`UserService` + query de listagem para actor).
- [x] Migrar rotas `users*` principais para o módulo (`/api/users`, `/api/users/[id]`, `profile`, `avatar`, `points`, `deduct-hours`, `roles`, `status`, `approve`, `leaderboard`, `statistics`, `profiles`).

## Estratégia de Migração
- [ ] Strangler pattern: rotas atuais passam a chamar use-cases novos gradualmente.
- [ ] Manter contratos HTTP estáveis durante migração.
- [ ] Criar testes de caracterização para fluxos críticos antes da troca.
- [ ] Remover código legado só após cobertura mínima de comportamento.

## Progresso Notificações (Event-Driven)
- [x] Criado módulo `backend/modules/notifications` com contrato de evento e audiência (`USER_IDS`, `ALL_ACTIVE_USERS`).
- [x] Rotas `/api/notifications*` migradas para módulo novo + `api-guard`.
- [x] Suporte a emissão administrativa de notificações para todos ou usuários específicos.
- [x] `TaskService` migrado para publicar eventos de notificação via módulo novo (`TASK_REVIEW_REQUEST`, `TASK_APPROVED`, `TASK_REJECTED`).
- [x] Removido legado órfão de notificações (`NotificationController`, `NotificationService`, `NotificationRepository`, `Notification` model).
- [ ] Migrar notificações de domínio restantes (projetos/convites/atribuições) para módulo novo.

## Progresso Reporting Read-Model
- [x] Criado módulo `backend/modules/reporting`.
- [x] Rotas `weekly-reports` (`GET`, `POST`, `GET/:id`, `DELETE/:id`, `generate`) migradas para módulo `reporting`.
- [x] Fonte de leitura dos detalhes/geração semanal baseada em `work_sessions` concluídas (não mais em `daily_logs`).
- [x] Rotas de horas de projeto migradas para `reporting` (`projects/[id]/hours`, `projects/[id]/weekly-hours`, `projects/[id]/hours-history`, `users/[id]/project-hours`, `projects/stats`).
- [x] Rota `weekly-hours-history` migrada para `reporting` (listagem, stats, reset, create_week_history).
- [x] Removido legado órfão de horas (`ProjectHoursService`, `WeeklyHoursHistoryController`).

## Domínios Depreciados
- [x] `History/Audit` removido do sistema (rotas, controller, model, repository e service).

## Critérios de Conclusão da Etapa 3
- [x] Pelo menos 2 domínios em módulos novos (`work-execution`, `project-membership`).
- [ ] Membership de projeto com fluxo único e sem lógica duplicada.
- [ ] Reporting consolidado com uma fonte de leitura.
- [ ] Front com consumo simplificado para ações de projeto e execução de trabalho.
- [ ] Front com redução progressiva de providers/contexts globais.

## Progresso de Segurança (RBAC)
- [x] Guard server-side centralizado criado em `lib/auth/api-guard.ts`.
- [x] Rotas `work-sessions` migradas para guard central (`requireApiActor` + regras de self/permission).
- [x] Permissões de projeto adicionadas ao RBAC central (`MANAGE_PROJECTS`, `MANAGE_PROJECT_MEMBERS`, `MANAGE_TASKS`).
- [x] Rotas base de `tasks` (`/api/tasks`, `/api/tasks/[id]`) migradas para guard central com checagens de owner/projeto/permissão.
- [x] Rotas base de `projects` (`/api/projects`, `/api/projects/[id]`, `/api/projects/[id]/volunteers`) migradas para guard central.
- [x] Rotas `daily_logs*` migradas para guard central e validação de acesso por owner/permissão.
- [x] Rotas `weekly-reports*` migradas para guard central e validação de acesso por owner/permissão.
- [x] Rota `weekly-hours-history` migrada para `ensurePermission(MANAGE_USERS)`.
- [x] Rota `cron/status` migrada para `ensureAnyRole(["COORDENADOR"])`.
- [x] Rotas `issues*` migradas para guard central com regra de mutação por owner/assignee/permissão.
- [x] Rotas `badges*` migradas para guard central com `ensurePermission(MANAGE_REWARDS)` para escrita.
- [x] Rotas `history*` migradas para guard central com `ensurePermission(MANAGE_USERS)`.
- [x] Rotas `users` e `users/approve` migradas para guard central e permissão de gestão.
- [x] Rotas de laboratório (`lab-events`, `laboratory-schedule`, `responsibilities`) migradas para guard central com identidade do ator no server.
- [x] `app/api` sem uso direto de `getServerSession` e `roles.includes(...)` em handlers.
- [x] Rotas que usavam `requireAuth` migradas para `requireApiActor` + checks explícitos de permissão (padronização final).
- [x] `NotificationProvider` removido da árvore global (`app/client-layout`) com migração para hook local (`useNotification`).
- [x] `TaskService` deixa de conceder pontos diretamente; gamificação passa a ser a fonte de ganho de pontos de task.
- [x] `TaskService` desacoplado de gamificação por porta de eventos (`TaskProgressEvents`), mantendo fluxo por publicação.
