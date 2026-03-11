# Regras de Negocio Consolidadas

## 1. Objetivo

Este documento consolida as regras de negocio mais relevantes do `DisplayQuest`, evitando que elas fiquem dispersas entre casos de uso, rotas e implementacoes backend.

As regras abaixo foram extraidas da codebase atual e devem ser tratadas como referencia operacional do sistema.

## 2. Convencoes

- Identificador de regra de negocio: `RN-XX`
- Quando uma regra depender fortemente de estado, a maquina correspondente deve ser consultada em `09-maquinas-de-estado.md`
- Quando uma regra estiver associada a um caso de uso expandido, o identificador do caso deve ser referenciado na manutencao futura

## 3. Usuarios, acesso e aprovacao

- `RN-01` Todo novo usuario e criado com status `pending`.
- `RN-02` Todo novo usuario e criado sem papeis globais e com contadores iniciais zerados.
- `RN-03` Apenas usuarios com status `active` podem autenticar no sistema.
- `RN-04` A aprovacao ou rejeicao de usuarios pendentes depende de permissao `MANAGE_USERS`.
- `RN-05` Na aprovacao de cadastro pendente, o usuario passa a status `active`.
- `RN-06` Na rejeicao de cadastro pendente, a API atual descreve o resultado como remocao do usuario do sistema.
- `RN-07` A sessao autenticada deve refletir dados atualizados do usuario a partir do banco, inclusive status, roles, points e metricas operacionais.

## 4. Papeis e autorizacao

- `RN-08` O backend e a fonte de verdade para autorizacao.
- `RN-09` Permissoes globais sao avaliadas por papeis RBAC, com destaque para:
  - `MANAGE_USERS`
  - `MANAGE_PROJECTS`
  - `MANAGE_PROJECT_MEMBERS`
  - `MANAGE_TASKS`
  - `MANAGE_WORK_SESSIONS`
  - `MANAGE_REWARDS`
  - `MANAGE_PURCHASES`
- `RN-10` O frontend pode esconder ou exibir acoes, mas nao substitui a validacao backend.
- `RN-11` Em varios fluxos, o sistema combina autorizacao global com verificacao contextual, como membership em projeto ou lideranca do projeto.

## 5. Projetos e membership

- `RN-12` A criacao de projeto exige permissao `MANAGE_PROJECTS`.
- `RN-13` Ao criar um projeto, o criador e automaticamente adicionado como membro com papel `GERENTE_PROJETO`.
- `RN-14` Se um lider for informado na criacao do projeto e for diferente do criador, o sistema garante seu membership com papel `GERENTE_PROJETO`.
- `RN-15` Um usuario pode ser lider de no maximo um projeto por vez.
- `RN-16` Membership de projeto e unico por combinacao `projectId` + `userId`.
- `RN-17` Apenas coordenadores, gerentes ou gerente do projeto podem adicionar membros, remover membros, atualizar papeis ou definir lider.
- `RN-18` Nao e permitido remover o ultimo gerente de projeto quando ele for o ultimo membro com papel `GERENTE_PROJETO`.
- `RN-19` A listagem de projetos acessiveis depende do perfil do ator:
  - atores com permissao ampla veem todos os projetos
  - demais atores veem projetos em que sao membros ou criadores

## 6. Tarefas: modelagem e visibilidade

- `RN-20` O dominio de tarefas distingue visibilidade, atribuicao e conclusao.
- `RN-21` `taskVisibility = public` representa tarefa com progresso individual por usuario.
- `RN-22` `taskVisibility = delegated` ou `private` representa tarefa com manipulacao restrita aos atribuidos ou a gestores autorizados.
- `RN-23` O sistema suporta multiatribuicao por meio de `task_assignees`.
- `RN-24` O campo `assignedTo` e mantido por compatibilidade e normalmente espelha o primeiro atribuido.
- `RN-25` O campo `isGlobal` ainda e utilizado por compatibilidade para modelar tarefas publicas de laboratorio.
- `RN-26` Tarefas globais sao forcadas para `public`, sem `projectId` e sem atribuicao inicial.
- `RN-27` Apenas atores com permissao de gerenciamento apropriada podem criar quests globais.

## 7. Tarefas: manipulacao, conclusao e revisao

- `RN-28` Criacao de tarefa exige permissao `MANAGE_TASKS`.
- `RN-29` Ao criar ou atualizar uma tarefa, o sistema valida a existencia do projeto e dos usuarios atribuidos quando esses dados sao informados.
- `RN-30` Em tarefas publicas com suporte a progresso individual, atualizacoes limitadas de status podem ser registradas no progresso do ator sem alterar o estado global da tarefa.
- `RN-31` Um usuario comum nao pode mover uma tarefa publica em nome de outro usuario, salvo se possuir permissao administrativa correspondente.
- `RN-32` Para mover progresso individual de tarefa publica vinculada a projeto, o usuario deve pertencer ao projeto, salvo permissao administrativa.
- `RN-33` Para tarefas delegadas ou privadas, usuarios sem permissao ampla so podem manipular tarefas nas quais estejam atribuidos.
- `RN-34` Tarefas concluidas nao podem ser modificadas livremente; o sistema restringe alteracoes a papeis ou contextos autorizados.
- `RN-35` Quando uma tarefa delegada ou privada e concluida por usuario elegivel, ela vai para `in-review`, salvo nos casos tratados como publicos ou globais.
- `RN-36` Quando uma tarefa publica ou global e concluida, o estado resultante tende a `done`.
- `RN-37` Tarefa publica nao pode ser concluida duas vezes pelo mesmo usuario no progresso individual.
- `RN-38` Lider de projeto nao pode concluir a propria tarefa se for o atribuido dela; a regra exige delegacao a outro membro.
- `RN-39` Quando uma tarefa entra em `in-review`, o sistema pode notificar o lider do projeto para revisao.
- `RN-40` Apenas coordenadores, gerentes ou o lider do projeto da tarefa podem aprovar ou rejeitar tarefa em revisao.
- `RN-41` Aprovacao de tarefa em revisao altera seu estado para `done`.
- `RN-42` Rejeicao de tarefa em revisao altera seu estado para `adjust`.

## 8. Tarefas: pontuacao e penalidade

- `RN-43` Tarefas podem conceder pontos ao usuario.
- `RN-44` O sistema calcula penalidade por atraso em determinados fluxos de conclusao.
- `RN-45` A premiacao por tarefa concluida gera evento de gamificacao e atualizacao de indicadores do usuario.
- `RN-46` O sistema evita premiacao duplicada por origem de evento na camada de gamificacao.

## 9. Sessoes de trabalho e logs

- `RN-47` Uma sessao de trabalho e criada inicialmente com status `active`.
- `RN-48` Ao iniciar nova sessao para um usuario, o sistema encerra automaticamente uma sessao ativa anterior desse mesmo usuario.
- `RN-49` Se uma sessao informar projeto, o usuario deve pertencer ao projeto correspondente.
- `RN-50` Apenas o proprio usuario ou ator com permissao de gerenciamento pode operar sobre a sessao.
- `RN-51` Vinculo de tarefas concluidas a uma sessao so e permitido em sessoes finalizadas.
- `RN-52` Ao concluir uma sessao, o sistema calcula duracao, altera o status para `completed` e pode substituir a lista de tarefas vinculadas.
- `RN-53` Ao concluir uma sessao, o sistema cria ou atualiza automaticamente um log diario associado.
- `RN-54` A criacao, edicao e remocao manual de logs foi descontinuada no frontend; o log deve ser ajustado pela sessao de trabalho associada.
- `RN-55` Conclusao de sessao pode disparar premiacao gamificada para o usuario.

## 10. Relatorios semanais

- `RN-56` Relatorio semanal depende de `userId`, `weekStart` e `weekEnd`.
- `RN-57` Usuarios comuns so podem criar ou consultar seus proprios relatorios.
- `RN-58` Gestores autorizados e laboratoristas podem criar ou consultar relatorios de outros usuarios.
- `RN-59` O relatorio semanal e consolidado a partir de sessoes concluidas dentro do intervalo informado.
- `RN-60` Para o mesmo usuario e o mesmo intervalo semanal, o sistema faz `upsert`, e nao cria duplicata.
- `RN-61` O resumo final do relatorio pode ser derivado automaticamente das sessoes, quando nao informado manualmente.

## 11. Operacoes do laboratorio: responsabilidades

- `RN-62` Apenas atores com papel de coordenacao, gerencia ou laboratorista podem iniciar responsabilidade de laboratorio pela API.
- `RN-63` No gateway atual, a regra final de abertura de responsabilidade aceita apenas coordenador ou gerente.
- `RN-64` So pode existir uma responsabilidade ativa por vez.
- `RN-65` Uma responsabilidade ativa so pode ser encerrada pelo proprio responsavel ou por ator autorizado conforme a regra de encerramento.
- `RN-66` Atualizacao de notas de responsabilidade segue a mesma logica de permissao do encerramento.

## 12. Operacoes do laboratorio: issues

- `RN-67` Criacao de issue exige titulo, descricao e reporter validos.
- `RN-68` A prioridade de issue deve pertencer ao conjunto `low`, `medium`, `high` ou `urgent`.
- `RN-69` A implementacao atual cria a issue com status `in_progress`, embora o modelo base da entidade use `open` como valor inicial.
- `RN-70` Atribuir um responsavel a uma issue move seu status para `in_progress`.
- `RN-71` Remover atribuicao de issue devolve o status para `open`.
- `RN-72` Apenas issues `open` podem ser explicitamente iniciadas pelo fluxo de progresso.
- `RN-73` Issues `closed` nao podem ser resolvidas nem fechadas novamente.
- `RN-74` Reabrir issue e permitido apenas quando o estado atual e `closed`.
- `RN-75` Ao reabrir uma issue, o sistema zera `resolvedAt`.

## 13. Operacoes do laboratorio: horarios e eventos

- `RN-76` Criacao e atualizacao de horario geral do laboratorio exigem permissao de gerenciamento correspondente.
- `RN-77` Eventos de laboratorio exigem usuario existente e com status `active`.
- `RN-78` Horarios individuais podem ser gerenciados pelo proprio usuario ou por ator com permissao de administracao de usuarios, conforme o fluxo.

## 14. Gamificacao

- `RN-79` Pontos acumulados do usuario funcionam tambem como XP da progressao.
- `RN-80` O nivel do usuario e derivado de faixas de XP com passo de 100 pontos.
- `RN-81` O elo do usuario e derivado de limiares de XP.
- `RN-82` Premiacao por sessao considera base fixa, duracao e quantidade de tarefas concluidas vinculadas.
- `RN-83` Premiacao por tarefa concluida considera os pontos da tarefa ou valor padrao quando necessario.
- `RN-84` O sistema registra historico de premiacao para impedir duplicidade por origem.
- `RN-85` Apos premiacao, o sistema reavalia badges do usuario.

## 15. Loja e compras

- `RN-86` Para solicitar resgate, o usuario deve existir, a recompensa deve existir, estar disponivel e ter estoque quando aplicavel.
- `RN-87` O usuario deve possuir pontos suficientes para o resgate.
- `RN-88` Ao criar uma compra, os pontos do usuario sao debitados imediatamente e a compra nasce com status `pending`.
- `RN-89` Apenas compras `pending` podem ser aprovadas.
- `RN-90` Apenas compras `pending` podem ser rejeitadas.
- `RN-91` Rejeicao de compra `pending` gera estorno dos pontos ao usuario.
- `RN-92` Apenas compras `approved` podem ser completadas.
- `RN-93` Compras `completed` nao podem ser canceladas.
- `RN-94` Cancelamento de compra `pending` ou `approved` gera estorno dos pontos.
- `RN-95` Cancelamento de compra pode ser feito pelo proprio usuario apenas no fluxo `cancel`, ou por gestor de compras.

## 16. Regras de coerencia arquitetural

- `RN-96` Rotas HTTP devem permanecer finas, concentrando parse, autenticacao, autorizacao inicial e serializacao.
- `RN-97` Regras de negocio relevantes devem permanecer em modulos, gateways e servicos de dominio, e nao dispersas em componentes de interface.
- `RN-98` A composicao backend deve continuar centralizada em `backend/composition/root.ts`.
- `RN-99` Dependencias cruzadas entre dominios devem ser resolvidas pela composicao central sempre que possivel.
- `RN-100` O dominio de tarefas deve ser tratado com especial cuidado, por ser transversal a projetos, sessoes, relatorios e gamificacao.
