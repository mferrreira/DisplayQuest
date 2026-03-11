# Catalogo de Casos de Uso

## 1. Convencoes

- Identificador de caso de uso: `UC-XX`
- Este catalogo resume os casos de uso do sistema sem expandir todos os fluxos
- Apenas os casos mais relevantes serao detalhados em versao expandida

## 2. Acesso e usuarios

### `UC-01` Cadastrar usuario no sistema

- Objetivo: permitir que um novo usuario solicite acesso ao sistema.
- Atores primarios: candidato a usuario.
- Gatilho: o interessado acessa a tela de cadastro.
- Pre-condicoes: nao possuir conta ativa autenticada para o mesmo fluxo.
- Pos-condicoes: conta criada com status pendente.

### `UC-02` Autenticar usuario

- Objetivo: permitir acesso autenticado ao sistema.
- Atores primarios: usuario cadastrado.
- Gatilho: o usuario informa credenciais validas na tela de login.
- Pre-condicoes: conta cadastrada e apta a acesso.
- Pos-condicoes: sessao autenticada iniciada.

### `UC-03` Aprovar ou rejeitar cadastro pendente

- Objetivo: controlar entrada de novos usuarios.
- Atores primarios: coordenador, gerente.
- Gatilho: o ator acessa a fila de aprovacao.
- Pre-condicoes: existencia de usuarios pendentes e permissao adequada.
- Pos-condicoes: usuario aprovado ou rejeitado.

### `UC-04` Atualizar perfil do usuario

- Objetivo: manter dados de perfil atualizados.
- Atores primarios: usuario autenticado.
- Gatilho: o usuario acessa a area de perfil.
- Pre-condicoes: sessao autenticada.
- Pos-condicoes: perfil persistido com os novos dados validos.

### `UC-05` Atualizar papeis globais do usuario

- Objetivo: ajustar autorizacao global do usuario.
- Atores primarios: coordenador, gerente.
- Gatilho: o ator acessa a gestao de usuarios.
- Pre-condicoes: permissao de administracao de usuarios.
- Pos-condicoes: papeis globais atualizados.

### `UC-06` Consultar ranking e progresso do usuario

- Objetivo: permitir visualizacao de indicadores de engajamento e pontuacao.
- Atores primarios: usuario autenticado, gestores.
- Gatilho: o ator acessa leaderboard ou area de progresso.
- Pre-condicoes: sessao autenticada.
- Pos-condicoes: indicadores exibidos.

## 3. Projetos e membros

### `UC-07` Criar projeto

- Objetivo: registrar um novo projeto no sistema.
- Atores primarios: coordenador, gerente, gerente de projeto.
- Gatilho: o ator aciona a criacao de projeto.
- Pre-condicoes: permissao para gerenciar projetos.
- Pos-condicoes: projeto criado.

### `UC-08` Editar projeto

- Objetivo: manter dados de projeto atualizados.
- Atores primarios: coordenador, gerente, gerente de projeto autorizado.
- Gatilho: o ator seleciona um projeto para edicao.
- Pre-condicoes: projeto existente e permissao adequada.
- Pos-condicoes: projeto atualizado.

### `UC-09` Excluir projeto

- Objetivo: remover projeto do sistema conforme regras de permissao.
- Atores primarios: coordenador, gerente, gerente de projeto autorizado.
- Gatilho: o ator solicita exclusao de projeto.
- Pre-condicoes: projeto existente e permissao adequada.
- Pos-condicoes: projeto excluido.

### `UC-10` Consultar projetos acessiveis ao ator

- Objetivo: listar os projetos que o ator pode visualizar ou gerenciar.
- Atores primarios: usuario autenticado.
- Gatilho: o ator acessa a area de projetos.
- Pre-condicoes: sessao autenticada.
- Pos-condicoes: projetos acessiveis listados.

### `UC-11` Adicionar membro ao projeto

- Objetivo: vincular um usuario a um projeto.
- Atores primarios: coordenador, gerente, gerente de projeto.
- Gatilho: o ator aciona a inclusao de membro.
- Pre-condicoes: projeto existente, usuario existente e permissao adequada.
- Pos-condicoes: membership criado.

### `UC-12` Remover membro do projeto

- Objetivo: retirar um usuario de um projeto.
- Atores primarios: coordenador, gerente, gerente de projeto.
- Gatilho: o ator solicita remocao de membro.
- Pre-condicoes: membership existente e permissao adequada.
- Pos-condicoes: membership removido.

### `UC-13` Definir papeis do membro no projeto

- Objetivo: ajustar papeis contextuais do membro no projeto.
- Atores primarios: coordenador, gerente, gerente de projeto.
- Gatilho: o ator edita o vinculo do membro.
- Pre-condicoes: membership existente e permissao adequada.
- Pos-condicoes: papeis do membership atualizados.

### `UC-14` Designar lider de projeto

- Objetivo: definir ou alterar lideranca do projeto.
- Atores primarios: coordenador, gerente.
- Gatilho: o ator designa lider para o projeto.
- Pre-condicoes: projeto existente e permissao adequada.
- Pos-condicoes: lider registrado no projeto.

## 4. Tarefas

### `UC-15` Criar tarefa individual

- Objetivo: registrar uma nova tarefa no quadro de trabalho.
- Atores primarios: usuarios com permissao de gerenciamento de tarefas.
- Gatilho: o ator aciona o formulario de criacao.
- Pre-condicoes: sessao autenticada e permissao adequada.
- Pos-condicoes: tarefa criada.

### `UC-16` Criar backlog em lote

- Objetivo: registrar varias tarefas de uma vez.
- Atores primarios: usuarios com permissao de gerenciamento de tarefas.
- Gatilho: o ator usa o modo de insercao de backlog.
- Pre-condicoes: permissao adequada.
- Pos-condicoes: conjunto de tarefas criado.

### `UC-17` Consultar tarefas conforme permissao e escopo

- Objetivo: exibir ao ator apenas as tarefas acessiveis dentro de seu contexto.
- Atores primarios: usuario autenticado.
- Gatilho: o ator acessa o quadro ou listas de tarefas.
- Pre-condicoes: sessao autenticada.
- Pos-condicoes: tarefas acessiveis listadas.

### `UC-18` Atualizar tarefa

- Objetivo: alterar atributos de tarefa existente.
- Atores primarios: usuarios autorizados.
- Gatilho: o ator seleciona uma tarefa para edicao.
- Pre-condicoes: tarefa existente e permissao adequada.
- Pos-condicoes: tarefa atualizada.

### `UC-19` Concluir tarefa delegada ou privada

- Objetivo: registrar conclusao de tarefa com manipulacao restrita.
- Atores primarios: atribuido autorizado, gestor autorizado.
- Gatilho: o ator conclui a tarefa no quadro ou fluxo equivalente.
- Pre-condicoes: tarefa visivel ao ator e permissao de manipulacao.
- Pos-condicoes: tarefa concluida ou movida ao estado esperado.

### `UC-20` Concluir tarefa publica com progresso individual

- Objetivo: registrar conclusao individual de tarefa publica.
- Atores primarios: usuario autenticado elegivel.
- Gatilho: o ator interage com tarefa publica no escopo permitido.
- Pre-condicoes: tarefa publica acessivel ao ator.
- Pos-condicoes: progresso individual atualizado.

### `UC-21` Aprovar tarefa em revisao

- Objetivo: homologar tarefa submetida a revisao.
- Atores primarios: gestor autorizado.
- Gatilho: o ator aprova tarefa em revisao.
- Pre-condicoes: tarefa em estado de revisao e permissao adequada.
- Pos-condicoes: tarefa aprovada e refletida nos estados e efeitos derivados.

### `UC-22` Rejeitar tarefa em revisao

- Objetivo: devolver tarefa para ajuste.
- Atores primarios: gestor autorizado.
- Gatilho: o ator rejeita tarefa em revisao.
- Pre-condicoes: tarefa em estado de revisao e permissao adequada.
- Pos-condicoes: tarefa movida ao estado de ajuste ou equivalente.

### `UC-23` Excluir tarefa

- Objetivo: remover tarefa conforme regra de permissao.
- Atores primarios: usuario autorizado.
- Gatilho: o ator solicita exclusao.
- Pre-condicoes: tarefa existente e permissao adequada.
- Pos-condicoes: tarefa excluida.

## 5. Execucao de trabalho

### `UC-24` Iniciar sessao de trabalho

- Objetivo: registrar o inicio de uma atividade de trabalho.
- Atores primarios: usuario autenticado.
- Gatilho: o ator inicia uma nova sessao.
- Pre-condicoes: sessao autenticada e condicoes validas para abertura.
- Pos-condicoes: sessao ativa criada.

### `UC-25` Atualizar sessao de trabalho em andamento

- Objetivo: ajustar dados da sessao ativa.
- Atores primarios: usuario autenticado.
- Gatilho: o ator altera informacoes da sessao.
- Pre-condicoes: sessao ativa existente.
- Pos-condicoes: sessao atualizada.

### `UC-26` Finalizar sessao de trabalho e associar tarefas concluidas

- Objetivo: encerrar a sessao e refletir os efeitos relacionados.
- Atores primarios: usuario autenticado.
- Gatilho: o ator encerra a sessao.
- Pre-condicoes: sessao ativa existente.
- Pos-condicoes: sessao concluida e tarefas associadas processadas.

### `UC-27` Gerar log diario a partir da sessao

- Objetivo: transformar a sessao concluida em registro textual diario.
- Atores primarios: usuario autenticado, sistema.
- Gatilho: a sessao concluida dispara o fluxo de log.
- Pre-condicoes: sessao concluida elegivel para log.
- Pos-condicoes: log diario criado ou atualizado conforme regra.

### `UC-28` Consultar sessoes e logs

- Objetivo: permitir acompanhamento historico de trabalho.
- Atores primarios: usuario autenticado, gestor autorizado.
- Gatilho: o ator acessa profile ou visoes de acompanhamento.
- Pre-condicoes: sessao autenticada.
- Pos-condicoes: sessoes e logs exibidos.

## 6. Relatorios

### `UC-29` Registrar ou atualizar relatorio semanal

- Objetivo: consolidar producao do usuario em uma semana.
- Atores primarios: usuario autenticado.
- Gatilho: o ator preenche ou atualiza relatorio semanal.
- Pre-condicoes: sessao autenticada.
- Pos-condicoes: relatorio persistido.

### `UC-30` Gerar relatorio semanal consolidado

- Objetivo: obter consolidacao semanal para acompanhamento.
- Atores primarios: usuario autenticado, gestor autorizado.
- Gatilho: o ator solicita geracao ou consolidacao semanal.
- Pre-condicoes: dados disponiveis para o periodo.
- Pos-condicoes: consolidacao retornada ao ator.

### `UC-31` Consultar relatorios semanais

- Objetivo: listar relatorios disponiveis.
- Atores primarios: usuario autenticado, gestor autorizado.
- Gatilho: acesso a area de relatorios.
- Pre-condicoes: sessao autenticada.
- Pos-condicoes: relatorios listados.

### `UC-32` Excluir relatorio semanal

- Objetivo: remover relatorio conforme regra aplicavel.
- Atores primarios: usuario autorizado.
- Gatilho: o ator solicita exclusao.
- Pre-condicoes: relatorio existente e permissao adequada.
- Pos-condicoes: relatorio excluido.

## 7. Operacoes do laboratorio

### `UC-33` Assumir ou registrar responsabilidade de laboratorio

- Objetivo: registrar quem esta responsavel pelo laboratorio em determinado intervalo.
- Atores primarios: laboratorista, coordenador.
- Gatilho: o ator inicia responsabilidade ou consulta responsabilidade ativa.
- Pre-condicoes: permissao adequada.
- Pos-condicoes: responsabilidade ativa ou historico atualizado.

### `UC-34` Registrar e acompanhar issue de laboratorio

- Objetivo: permitir que problemas operacionais sejam reportados e acompanhados.
- Atores primarios: usuario autenticado.
- Gatilho: o ator registra ou consulta issue.
- Pre-condicoes: sessao autenticada.
- Pos-condicoes: issue registrada ou acompanhada.

### `UC-35` Atualizar status de issue

- Objetivo: refletir o andamento do tratamento de uma issue.
- Atores primarios: usuario autorizado.
- Gatilho: o ator altera o status.
- Pre-condicoes: issue existente e permissao adequada.
- Pos-condicoes: status atualizado.

### `UC-36` Resolver issue

- Objetivo: registrar a resolucao de um problema operacional.
- Atores primarios: usuario autorizado.
- Gatilho: o ator marca a issue como resolvida.
- Pre-condicoes: issue existente, aberta e elegivel a resolucao.
- Pos-condicoes: issue resolvida.

### `UC-37` Gerenciar horarios do laboratorio

- Objetivo: manter a agenda geral do laboratorio.
- Atores primarios: usuario autorizado.
- Gatilho: o ator cria, edita ou exclui horario geral.
- Pre-condicoes: permissao adequada.
- Pos-condicoes: agenda geral atualizada.

### `UC-38` Gerenciar agenda ou horario individual

- Objetivo: manter a agenda individual de usuarios.
- Atores primarios: usuario autorizado.
- Gatilho: o ator cria, edita ou remove horario individual.
- Pre-condicoes: permissao adequada.
- Pos-condicoes: agenda individual atualizada.

### `UC-39` Registrar evento de laboratorio

- Objetivo: manter eventos ou ocorrencias do laboratorio.
- Atores primarios: usuario autenticado ou autorizado, conforme regra.
- Gatilho: o ator registra evento.
- Pre-condicoes: sessao autenticada.
- Pos-condicoes: evento registrado.

## 8. Gamificacao, loja e notificacoes

### `UC-40` Consultar progressao gamificada do usuario

- Objetivo: exibir pontos, badges e progresso associado.
- Atores primarios: usuario autenticado.
- Gatilho: o ator acessa sua area de progresso.
- Pre-condicoes: sessao autenticada.
- Pos-condicoes: progressao exibida.

### `UC-41` Conceder pontos e badges por conclusao de atividade

- Objetivo: refletir efeitos de gamificacao a partir de eventos relevantes.
- Atores primarios: sistema, modulos de negocio.
- Gatilho: conclusao de tarefa ou sessao elegivel.
- Pre-condicoes: evento elegivel e regras de gamificacao satisfeitas.
- Pos-condicoes: pontos e badges concedidos quando aplicavel.

### `UC-42` Consultar recompensas disponiveis

- Objetivo: permitir ao usuario visualizar itens resgataveis.
- Atores primarios: usuario autenticado.
- Gatilho: o ator acessa a loja.
- Pre-condicoes: sessao autenticada.
- Pos-condicoes: recompensas exibidas.

### `UC-43` Solicitar resgate de recompensa

- Objetivo: registrar pedido de uso de pontos.
- Atores primarios: usuario autenticado.
- Gatilho: o ator solicita uma recompensa disponivel.
- Pre-condicoes: pontuacao suficiente e recompensa disponivel.
- Pos-condicoes: compra criada com estado inicial adequado.

### `UC-44` Aprovar compra ou resgate

- Objetivo: autorizar entrega de recompensa solicitada.
- Atores primarios: usuario autorizado.
- Gatilho: o ator aprova compra pendente.
- Pre-condicoes: compra pendente e permissao adequada.
- Pos-condicoes: compra aprovada.

### `UC-45` Rejeitar ou cancelar compra ou resgate

- Objetivo: encerrar negativamente um pedido de recompensa.
- Atores primarios: usuario autorizado, sistema, usuario solicitante em casos permitidos.
- Gatilho: o ator rejeita ou cancela a compra.
- Pre-condicoes: compra em estado compativel.
- Pos-condicoes: compra rejeitada ou cancelada.

### `UC-46` Consultar notificacoes

- Objetivo: exibir notificacoes registradas ao usuario.
- Atores primarios: usuario autenticado.
- Gatilho: o ator acessa o painel de notificacoes.
- Pre-condicoes: sessao autenticada.
- Pos-condicoes: notificacoes listadas.

### `UC-47` Marcar notificacoes como lidas

- Objetivo: atualizar o estado de leitura das notificacoes.
- Atores primarios: usuario autenticado.
- Gatilho: o ator marca uma ou todas as notificacoes como lidas.
- Pre-condicoes: notificacoes existentes para o usuario.
- Pos-condicoes: notificacoes atualizadas para o estado de leitura.

## 9. Casos prioritarios para expansao

Os seguintes casos devem receber descricao expandida antes dos demais:

- `UC-01`
- `UC-02`
- `UC-03`
- `UC-07`
- `UC-10`
- `UC-11`
- `UC-13`
- `UC-15`
- `UC-17`
- `UC-20`
- `UC-21`
- `UC-22`
- `UC-24`
- `UC-26`
- `UC-27`
- `UC-29`
- `UC-33`
- `UC-34`
- `UC-41`
