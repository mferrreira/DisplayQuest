# Regras de Negocio (Resumo Operacional)

## 1. Usuarios e aprovacao

- cadastro cria usuario com status `pending`
- login somente para usuarios `active`
- aprovacao/rejeicao de usuarios e responsabilidade de perfis de gestao (ex.: coordenacao/gerencia)

## 2. Papéis e permissões (RBAC)

O sistema usa papeis (`UserRole`) e permissões agrupadas.

Permissoes principais (resumo):

- `MANAGE_USERS`
- `MANAGE_PROJECTS`
- `MANAGE_PROJECT_MEMBERS`
- `MANAGE_TASKS`
- `MANAGE_WORK_SESSIONS`
- `MANAGE_REWARDS`
- `MANAGE_PURCHASES`
- `MANAGE_NOTIFICATIONS`

Obs.: conferir fonte da verdade em `lib/auth/rbac.ts`.

## 3. Projetos e membros

- projetos possuem criador, lider (`leaderId`) e membros
- membership define visibilidade e acesso a fluxos por projeto
- membros podem ter papeis distintos por projeto

## 4. Tarefas (regra central)

## 4.1 Conceitos separados

- visibilidade da task
- atribuicao (quem pode manipular)
- progresso/conclusao (global vs individual)

## 4.2 Tipos de task (`taskVisibility`)

- `public`
  - visivel no escopo
  - progresso individual por usuario
  - conclusao de um usuario nao conclui para os demais
- `delegated`
  - visivel no projeto
  - manipulacao restrita aos atribuídos (ou gestao)
- `private`
  - visivel no projeto
  - manipulacao restrita aos atribuídos (ou gestao)

## 4.3 Escopo de task publica

- publica de projeto: `projectId` definido + `taskVisibility = public`
- publica de laboratorio (quest global): modelada atualmente com `isGlobal = true`

## 4.4 Multiatribuicao

- suportada via `task_assignees`
- `assignedTo` permanece como compatibilidade (primeiro atribuÍdo)

## 4.5 Progresso individual

- suportado via `task_user_progress`
- usado principalmente para tasks publicas (projeto/laboratorio)

## 4.6 Fluxo de conclusao

- task publica: conclusao individual por usuario
- task delegada/privada: conclusao depende de atribuicao/permissao
- tasks podem exigir aprovacao/revisao conforme status e papel do aprovador

## 5. Pontuacao e gamificacao

- tasks possuem `points`
- conclusao de tasks pode gerar pontuacao
- pode haver penalidade por atraso (dependendo do fluxo da task)
- pontuacao alimenta loja/ranking e indicadores de usuario

## 6. Sessoes de trabalho e logs

- sessoes registram inicio/fim, duracao, atividade, local e projeto
- logs diarios complementam a descricao da atividade
- tarefas podem ser associadas a sessoes via `work_session_tasks`

## 7. Relatorios

- relatorios semanais consolidam producao do usuario
- relatorios de projeto possuem fluxo de visualizacao/exportacao no frontend

## 8. Operacoes do laboratorio

Dominios suportados:

- responsabilidades do laboratorio
- eventos
- horarios (laboratorio e usuario)
- issues (equipamento/software/rede/outros)

## 9. Regras de manutencao (negocio + tecnica)

- rotas nao devem concentrar regra de negocio complexa
- mudancas em tarefa/permissao devem considerar:
  - `taskVisibility`
  - `isGlobal` (legado/compatibilidade)
  - `task_assignees`
  - `task_user_progress`
