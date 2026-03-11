# Maquinas de Estado

## 1. Objetivo

Este documento descreve os estados mais importantes do sistema e as transicoes observadas na codebase atual.

O objetivo nao e desenhar cada tabela, mas explicitar o comportamento de negocio das entidades que concentram regra e manutencao sensivel.

## 2. Convencoes

- Identificador de maquina de estado: `ME-XX`
- Cada maquina lista:
  - estados conhecidos
  - estado inicial observado
  - transicoes principais
  - restricoes relevantes

## 3. ME-01 Estado de Usuario

- Entidade principal: `users.status`
- Estados observados:
  - `pending`
  - `active`
  - `rejected`
  - `suspended`
  - `inactive`
- Estado inicial: `pending`

### Transicoes principais

- `pending -> active`
  - gatilho: aprovacao de cadastro pendente
- `pending -> rejected`
  - gatilho: rejeicao de cadastro pendente ou moderacao equivalente
- `active -> suspended`
  - gatilho: fluxo administrativo de mudanca de status
- `suspended -> active`
  - gatilho: reativacao administrativa
- `inactive -> active`
  - gatilho: reativacao administrativa

### Restricoes

- Apenas `active` pode autenticar no sistema.
- O status inicial de qualquer novo cadastro e `pending`.

## 4. ME-02 Estado de Projeto

- Entidade principal: `projects.status`
- Estados observados:
  - `active`
  - `completed`
  - `archived`
  - `on_hold`
- Estado inicial mais comum: `active`

### Transicoes principais

- `active -> completed`
  - gatilho: atualizacao administrativa do projeto
- `active -> archived`
  - gatilho: arquivamento administrativo
- `active -> on_hold`
  - gatilho: pausa administrativa
- `on_hold -> active`
  - gatilho: retomada administrativa
- `archived -> active`
  - gatilho: reativacao administrativa, se adotada pela equipe

### Restricoes

- Exclusao de projeto e permitida apenas quando o status estiver em `active`, `archived` ou `on_hold`.
- Um usuario informado como lider nao pode liderar mais de um projeto simultaneamente.

## 5. ME-03 Estado Global de Tarefa

- Entidade principal: `tasks.status`
- Estados observados:
  - `to-do`
  - `in-progress`
  - `in-review`
  - `adjust`
  - `done`
- Estado inicial mais comum: `to-do`

### Transicoes principais

- `to-do -> in-progress`
  - gatilho: inicio da execucao da tarefa
- `in-progress -> in-review`
  - gatilho: conclusao de tarefa delegada ou privada, sujeita a aprovacao
- `in-review -> done`
  - gatilho: aprovacao de tarefa
- `in-review -> adjust`
  - gatilho: rejeicao de tarefa em revisao
- `adjust -> in-progress`
  - gatilho: retomada para correcoes
- `to-do -> done`
  - gatilho: conclusao direta de tarefa publica ou global em certos fluxos

### Restricoes

- Tarefas em `in-review` so podem ser aprovadas ou rejeitadas por atores autorizados.
- Tarefas concluidas (`done`) passam a ter restricoes adicionais de edicao.
- Em tarefas delegadas e privadas, usuario comum so manipula a tarefa se estiver atribuido.

## 6. ME-04 Estado de Progresso Individual de Tarefa Publica

- Entidade principal: `task_user_progress.status`
- Estados observados:
  - `to-do`
  - `in-progress`
  - `in-review`
  - `adjust`
  - `done`
- Estado inicial: `to-do`

### Transicoes principais

- `to-do -> in-progress`
  - gatilho: usuario assume ou inicia a tarefa publica
- `in-progress -> done`
  - gatilho: conclusao individual da tarefa publica
- `done`
  - estado terminal no fluxo de premiacao individual atual

### Restricoes

- A mesma tarefa publica nao pode ser concluida duas vezes pelo mesmo usuario.
- O progresso individual nao implica conclusao global para outros usuarios.

## 7. ME-05 Estado de Sessao de Trabalho

- Entidade principal: `work_sessions.status`
- Estados observados na persistencia principal:
  - `active`
  - `completed`
- Estados manipulados pela UI/hook:
  - `paused`
- Estado inicial: `active`

### Transicoes principais

- `active -> completed`
  - gatilho: encerramento da sessao
- `active -> completed` da sessao anterior
  - gatilho: inicio de uma nova sessao para o mesmo usuario
- `active -> paused`
  - gatilho: acao de pausa na UI
- `paused -> active`
  - gatilho: retomada na UI

### Restricoes

- O backend de conclusao trata `completed` como estado final relevante.
- Associacao de tarefas concluidas a sessao so e permitida quando a sessao sera ou ja estiver `completed`.
- Apenas o proprietario da sessao ou gestor autorizado pode altera-la.

## 8. ME-06 Estado de Relatorio Semanal

- Entidade principal: `weekly_reports`
- Estados explicitos: nao ha enum de status.
- Comportamento observado:
  - inexistente
  - existente para o intervalo
  - atualizado para o intervalo

### Transicoes principais

- `inexistente -> existente`
  - gatilho: criacao do relatorio semanal
- `existente -> atualizado`
  - gatilho: `upsert` para mesmo usuario e mesmo intervalo
- `existente -> inexistente`
  - gatilho: exclusao do relatorio

### Restricoes

- O sistema evita duplicidade de relatorio para mesmo usuario e mesma faixa semanal.

## 9. ME-07 Estado de Responsabilidade de Laboratorio

- Entidade principal: `lab_responsibilities`
- Estados inferidos a partir da presenca de `endTime`:
  - `active`
  - `completed`
- Estado inicial: `active`

### Criterio de estado

- `active`: `endTime = null`
- `completed`: `endTime != null`

### Transicoes principais

- `active -> completed`
  - gatilho: encerramento da responsabilidade

### Restricoes

- So pode existir uma responsabilidade ativa por vez.
- Abertura e encerramento dependem de permissao contextual.

## 10. ME-08 Estado de Issue

- Entidade principal: `issues.status`
- Estados observados:
  - `open`
  - `in_progress`
  - `resolved`
  - `closed`
- Estado inicial conceitual da entidade: `open`
- Estado inicial observado no fluxo de criacao atual: `in_progress`

### Transicoes principais

- `open -> in_progress`
  - gatilho: inicio de tratamento ou atribuicao
- `in_progress -> resolved`
  - gatilho: resolucao da issue
- `resolved -> closed`
  - gatilho: fechamento posterior
- `closed -> open`
  - gatilho: reabertura
- `in_progress -> open`
  - gatilho: remocao da atribuicao no fluxo atual

### Restricoes

- Apenas issues `open` podem ser explicitamente iniciadas pelo fluxo `startIssueProgress`.
- `closed` nao pode ser resolvida ou fechada novamente.
- Reabrir limpa `resolvedAt`.
- Ha divergencia entre o modelo base e o fluxo de criacao atual:
  - a entidade `Issue.create` define `open`
  - o gateway de criacao persiste `in_progress`

## 11. ME-09 Estado de Compra ou Resgate

- Entidade principal: `purchases.status`
- Estados observados:
  - `pending`
  - `approved`
  - `rejected`
  - `completed`
  - `cancelled`
- Estado inicial: `pending`

### Transicoes principais

- `pending -> approved`
  - gatilho: aprovacao da compra
- `pending -> rejected`
  - gatilho: rejeicao da compra
- `approved -> completed`
  - gatilho: conclusao da entrega
- `pending -> cancelled`
  - gatilho: cancelamento
- `approved -> cancelled`
  - gatilho: cancelamento

### Restricoes

- Apenas `pending` pode ser aprovada.
- Apenas `pending` pode ser rejeitada.
- Apenas `approved` pode ser completada.
- `completed` nao pode ser cancelada.
- Rejeicao e certos cancelamentos geram estorno de pontos.

## 12. ME-10 Estado de Progressao Gamificada do Usuario

- Entidade principal: progressao derivada de `users.points`
- Componentes observados:
  - `points`
  - `xp`
  - `level`
  - `elo`
  - `progressToNextLevel`

### Dinamica principal

- Pontos ganhos em tarefas e sessoes alimentam `points`.
- `xp` acompanha os pontos acumulados.
- `level` cresce por faixas de 100 pontos.
- `elo` e derivado de limiares de XP:
  - `BRONZE`
  - `PRATA`
  - `OURO`
  - `DIAMANTE`

### Restricoes

- Premiacao por mesma origem nao deve ocorrer duas vezes.
- Toda premiacao bem-sucedida reavalia badges.

## 13. Inconsistencias e observacoes relevantes

- `ME-05`: a UI trata `paused`, mas o backend principal de sessao enfatiza `active` e `completed`.
- `ME-08`: o fluxo atual de criacao de issue inicia em `in_progress`, embora a entidade base sugira `open`.
- `ME-03` e `ME-04`: parte das regras de tarefa depende da combinacao entre estado global, visibilidade e progresso individual, e nao apenas do campo `tasks.status`.
