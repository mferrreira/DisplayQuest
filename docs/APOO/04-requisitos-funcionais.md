# Requisitos Funcionais

## 1. Convencoes

- Identificador de requisito funcional: `RF-XX`
- Sempre que possivel, cada requisito deve se ligar a um ou mais casos de uso
- Requisitos derivados diretamente do comportamento observado no codigo podem ser refinados durante a fase de casos de uso expandidos

## 2. Acesso e usuarios

- `RF-01` O sistema deve permitir o cadastro de novos usuarios com nome, email e senha.
- `RF-02` O sistema deve registrar novos usuarios com status inicial pendente de aprovacao.
- `RF-03` O sistema deve permitir autenticacao por credenciais para usuarios aprovados.
- `RF-04` O sistema deve impedir acesso autenticado a usuarios sem status ativo.
- `RF-05` O sistema deve permitir a aprovacao ou rejeicao de contas pendentes por perfis autorizados.
- `RF-06` O sistema deve permitir atualizar dados de perfil do usuario.
- `RF-07` O sistema deve permitir a atribuicao ou atualizacao de papeis globais conforme permissao.
- `RF-08` O sistema deve permitir consultar ranking e indicadores de usuarios.

## 3. Projetos e membros

- `RF-09` O sistema deve permitir criar projetos com dados basicos e estado associado.
- `RF-10` O sistema deve permitir consultar projetos conforme as permissoes e memberships do ator.
- `RF-11` O sistema deve permitir editar projetos existentes.
- `RF-12` O sistema deve permitir excluir projetos conforme permissao.
- `RF-13` O sistema deve permitir adicionar usuarios a projetos.
- `RF-14` O sistema deve impedir duplicidade de membership para o mesmo usuario no mesmo projeto.
- `RF-15` O sistema deve permitir remover membros de projetos.
- `RF-16` O sistema deve permitir definir ou atualizar papeis do membro no contexto do projeto.
- `RF-17` O sistema deve permitir designar lider para um projeto.

## 4. Tarefas

- `RF-18` O sistema deve permitir criar tarefas individuais.
- `RF-19` O sistema deve permitir criacao em lote de tarefas para backlog.
- `RF-20` O sistema deve suportar tarefas publicas, delegadas e privadas.
- `RF-21` O sistema deve permitir multiatribuicao de usuarios em tarefas.
- `RF-22` O sistema deve manter compatibilidade com o campo legado `assignedTo`.
- `RF-23` O sistema deve permitir consultar tarefas conforme escopo, visibilidade e permissao do ator.
- `RF-24` O sistema deve permitir atualizar tarefas.
- `RF-25` O sistema deve permitir concluir tarefas delegadas ou privadas conforme atribuicao e permissao.
- `RF-26` O sistema deve registrar progresso individual de usuarios em tarefas publicas.
- `RF-27` O sistema deve permitir aprovar tarefas em revisao.
- `RF-28` O sistema deve permitir rejeitar tarefas em revisao.
- `RF-29` O sistema deve permitir excluir tarefas.
- `RF-30` O sistema deve manter a semantica atual de tarefas globais de laboratorio por compatibilidade com `isGlobal`.

## 5. Execucao de trabalho

- `RF-31` O sistema deve permitir iniciar sessao de trabalho.
- `RF-32` O sistema deve permitir atualizar dados de sessao em andamento.
- `RF-33` O sistema deve permitir encerrar sessao de trabalho.
- `RF-34` O sistema deve permitir associar tarefas a sessoes de trabalho.
- `RF-35` O sistema deve permitir gerar log diario a partir de sessao concluida.
- `RF-36` O sistema deve permitir consultar sessoes de trabalho.
- `RF-37` O sistema deve permitir consultar logs diarios.
- `RF-38` O sistema deve permitir excluir sessao de trabalho conforme regra aplicavel.

## 6. Relatorios

- `RF-39` O sistema deve permitir registrar ou atualizar relatorios semanais.
- `RF-40` O sistema deve permitir consultar relatorios semanais.
- `RF-41` O sistema deve permitir recuperar relatorio semanal por identificador.
- `RF-42` O sistema deve permitir excluir relatorios semanais.
- `RF-43` O sistema deve permitir gerar consolidacoes relacionadas a horas e acompanhamento semanal.

## 7. Operacoes do laboratorio

- `RF-44` O sistema deve permitir registrar e consultar responsabilidades de laboratorio.
- `RF-45` O sistema deve permitir indicar responsabilidade ativa no laboratorio.
- `RF-46` O sistema deve permitir registrar issues com dados de categoria, prioridade e contexto.
- `RF-47` O sistema deve permitir atualizar status de issue.
- `RF-48` O sistema deve permitir atribuir issue a um responsavel.
- `RF-49` O sistema deve permitir resolver issues conforme regra de permissao.
- `RF-50` O sistema deve permitir gerenciar horarios gerais do laboratorio.
- `RF-51` O sistema deve permitir gerenciar horarios individuais de usuarios.
- `RF-52` O sistema deve permitir registrar e consultar eventos de laboratorio.

## 8. Gamificacao, loja e notificacoes

- `RF-53` O sistema deve permitir consultar a progressao gamificada do usuario.
- `RF-54` O sistema deve permitir conceder pontos por conclusao de atividades elegiveis.
- `RF-55` O sistema deve permitir conceder badges conforme regras do sistema.
- `RF-56` O sistema deve permitir consultar recompensas disponiveis.
- `RF-57` O sistema deve permitir solicitar resgate de recompensa.
- `RF-58` O sistema deve permitir aprovar, rejeitar, concluir ou cancelar compras conforme permissao e estado.
- `RF-59` O sistema deve permitir consultar notificacoes do usuario.
- `RF-60` O sistema deve permitir marcar uma notificacao como lida.
- `RF-61` O sistema deve permitir marcar todas as notificacoes do usuario como lidas.

## 9. Rastreabilidade inicial com os casos de uso

O mapeamento detalhado entre requisitos funcionais e casos de uso sera consolidado na fase seguinte, no catalogo e na matriz de rastreabilidade.
