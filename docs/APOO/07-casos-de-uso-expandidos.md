# Casos de Uso Expandidos

## 1. Convencoes

- Este documento expande apenas os casos de uso mais impactantes da primeira onda.
- Os fluxos foram escritos com base no comportamento observado na codebase atual.
- Quando houver diferenca entre interface e backend, o backend foi tratado como fonte de verdade.
- Numeracao adotada:
  - fluxo principal: `1.`, `2.`, `3.`
  - fluxo alternativo ligado ao passo 3: `3a.`, `3b.`
  - excecao ligada ao passo 4: `4x.`

## 2. UC-01 Cadastrar usuario no sistema

- Objetivo: permitir que um novo interessado solicite acesso ao sistema.
- Atores primarios: candidato a usuario.
- Pre-condicoes: o candidato acessa a tela publica de cadastro e informa nome, email e senha.
- Pos-condicoes de sucesso: um novo usuario e criado com status `pending`, sem papeis globais e com valores iniciais padronizados.
- Rastreabilidade principal:
  - `app/register/page.tsx`
  - `app/api/auth/register/route.ts`
  - `prisma/schema.prisma`

### Fluxo principal

1. O candidato acessa a tela de cadastro.
2. O sistema solicita nome, email e senha.
3. O candidato informa os dados e confirma o envio.
4. O sistema valida se nome, email e senha foram informados.
5. O sistema valida se a senha possui pelo menos 6 caracteres.
6. O sistema normaliza o email para minusculas e remove espacos excedentes.
7. O sistema verifica se ja existe usuario cadastrado com o mesmo email.
8. O sistema gera hash da senha.
9. O sistema cria o usuario com status `pending`, sem papeis iniciais e com contadores zerados.
10. O sistema confirma a criacao da conta e informa que a solicitacao sera analisada por coordenador ou gerente.

### Fluxos alternativos

4a. Algum campo obrigatorio nao foi informado.
4a.1. O sistema rejeita a solicitacao.
4a.2. O sistema informa que nome, email e senha sao obrigatorios.
4a.3. O caso de uso e encerrado sem criacao da conta.

5a. A senha possui menos de 6 caracteres.
5a.1. O sistema rejeita a solicitacao.
5a.2. O sistema informa a restricao minima da senha.
5a.3. O caso de uso e encerrado sem criacao da conta.

7a. Ja existe usuario com o email informado.
7a.1. O sistema rejeita a solicitacao.
7a.2. O sistema informa que o email ja esta em uso.
7a.3. O caso de uso e encerrado sem criacao da conta.

### Excecoes

8x. Ocorre falha interna durante o processamento do cadastro.
8x.1. O sistema registra o erro.
8x.2. O sistema retorna erro interno do servidor.
8x.3. O caso de uso e encerrado sem garantia de criacao da conta.

## 3. UC-02 Autenticar usuario

- Objetivo: permitir acesso autenticado a usuarios aptos a utilizar o sistema.
- Atores primarios: usuario cadastrado.
- Pre-condicoes: o usuario possui conta previamente criada.
- Pos-condicoes de sucesso: sessao autenticada por JWT iniciada e dados atuais do usuario disponibilizados na sessao.
- Rastreabilidade principal:
  - `app/login/page.tsx`
  - `app/api/auth/[...nextauth]/route.ts`

### Fluxo principal

1. O usuario acessa a tela de login.
2. O sistema solicita email e senha.
3. O usuario informa as credenciais e confirma o envio.
4. O sistema localiza o usuario pelo email normalizado.
5. O sistema verifica a existencia de senha cadastrada para o usuario.
6. O sistema compara a senha informada com o hash armazenado.
7. O sistema verifica se o status do usuario e `active`.
8. O sistema cria a sessao autenticada com estrategia JWT.
9. O sistema redireciona o usuario para o dashboard.

### Fluxos alternativos

4a. O email ou a senha nao foram informados.
4a.1. O sistema interrompe a autenticacao.
4a.2. O sistema informa que email e senha sao obrigatorios.
4a.3. O caso de uso e encerrado.

5a. Nao existe usuario para o email informado, ou nao ha senha cadastrada.
5a.1. O sistema interrompe a autenticacao.
5a.2. O sistema informa que o usuario nao foi encontrado ou nao possui senha definida.
5a.3. O caso de uso e encerrado.

6a. A senha informada nao corresponde ao hash armazenado.
6a.1. O sistema interrompe a autenticacao.
6a.2. O sistema informa que a senha esta incorreta.
6a.3. O caso de uso e encerrado.

7a. O usuario existe, mas seu status nao e `active`.
7a.1. O sistema interrompe a autenticacao.
7a.2. O sistema informa que a conta ainda nao foi aprovada.
7a.3. O caso de uso e encerrado.

## 4. UC-03 Aprovar ou rejeitar cadastro pendente

- Objetivo: controlar a entrada de novos usuarios no sistema.
- Atores primarios: coordenador, gerente.
- Pre-condicoes: o ator esta autenticado e possui permissao `MANAGE_USERS`.
- Pos-condicoes de sucesso:
  - na aprovacao, o usuario pendente torna-se apto a acessar o sistema;
  - na rejeicao, o usuario e removido do sistema, conforme mensagem da API atual.
- Rastreabilidade principal:
  - `app/api/users/approve/route.ts`
  - `lib/auth/api-guard.ts`
  - modulo `user-management`

### Fluxo principal

1. O ator autorizado acessa a fila de usuarios pendentes.
2. O sistema autentica o ator e valida a permissao de gerenciamento de usuarios.
3. O sistema lista os usuarios pendentes.
4. O ator seleciona um usuario pendente.
5. O ator escolhe aprovar ou rejeitar a solicitacao.
6. O sistema valida o identificador do usuario e a acao informada.
7. O sistema encaminha a solicitacao ao modulo de gerenciamento de usuarios.
8. O sistema atualiza o estado do usuario conforme a acao escolhida.
9. O sistema retorna mensagem de sucesso ao ator.

### Fluxos alternativos

2a. O ator nao esta autenticado.
2a.1. O sistema bloqueia o acesso ao fluxo.
2a.2. O caso de uso e encerrado.

2b. O ator nao possui `MANAGE_USERS`.
2b.1. O sistema nega a operacao.
2b.2. O sistema informa acesso negado.
2b.3. O caso de uso e encerrado.

6a. O identificador do usuario e invalido, ou a acao nao e `approve` nem `reject`.
6a.1. O sistema rejeita a solicitacao.
6a.2. O sistema informa que ID do usuario e acao sao obrigatorios.
6a.3. O caso de uso e encerrado.

### Excecoes

7x. O usuario informado nao e encontrado.
7x.1. O sistema retorna erro de usuario nao encontrado.
7x.2. O caso de uso e encerrado.

## 5. UC-07 Criar projeto

- Objetivo: registrar um novo projeto com gestor inicial, lider opcional e voluntarios opcionais.
- Atores primarios: coordenador, gerente, gerente de projeto.
- Pre-condicoes: o ator esta autenticado e possui permissao `MANAGE_PROJECTS`.
- Pos-condicoes de sucesso: o projeto e criado, o criador e vinculado como `GERENTE_PROJETO`, e lider/voluntarios informados podem ser incorporados ao projeto.
- Rastreabilidade principal:
  - `app/api/projects/route.ts`
  - `backend/modules/project-management/infrastructure/project-management.gateway.ts`

### Fluxo principal

1. O ator autorizado aciona a criacao de projeto.
2. O sistema autentica o ator e valida a permissao para gerenciar projetos.
3. O sistema recebe os dados do projeto, incluindo nome e dados opcionais como descricao, status, lider e links.
4. O sistema valida a presenca do nome do projeto.
5. O sistema cria o projeto registrando o ator como criador.
6. O sistema cria automaticamente o vinculo do criador ao projeto com papel `GERENTE_PROJETO`.
7. Se um lider diferente do criador foi informado, o sistema garante o membership desse lider com papel `GERENTE_PROJETO`.
8. Se voluntarios foram informados, o sistema tenta adiciona-los ao projeto com papel `VOLUNTARIO`, ignorando duplicidade com criador ou lider.
9. O sistema retorna o projeto criado.

### Fluxos alternativos

2a. O ator nao possui permissao para gerenciar projetos.
2a.1. O sistema bloqueia a operacao.
2a.2. O sistema informa falta de permissao.
2a.3. O caso de uso e encerrado.

4a. O nome do projeto nao foi informado.
4a.1. O sistema rejeita a solicitacao.
4a.2. O sistema informa que o nome e obrigatorio.
4a.3. O caso de uso e encerrado.

8a. O sistema falha ao adicionar algum voluntario informado.
8a.1. O sistema registra o erro individualmente.
8a.2. O projeto permanece criado.
8a.3. O fluxo principal segue sem abortar a criacao do projeto.

## 6. UC-11 Adicionar membro ao projeto

- Objetivo: vincular um usuario existente a um projeto com papeis contextuais.
- Atores primarios: coordenador, gerente, gerente do projeto.
- Pre-condicoes: o ator esta autenticado e pode gerenciar membros daquele projeto.
- Pos-condicoes de sucesso: membership criado para o usuario alvo.
- Rastreabilidade principal:
  - `app/api/projects/[id]/members/route.ts`
  - `backend/modules/project-membership/infrastructure/prisma-project-membership.gateway.ts`

### Fluxo principal

1. O ator autorizado acessa a gestao de membros de um projeto.
2. O sistema autentica o ator.
3. O ator informa o usuario alvo e os papeis contextuais desejados.
4. O sistema valida o identificador do projeto.
5. O sistema valida o identificador do usuario alvo e a lista de papeis.
6. O sistema verifica se o ator pode gerenciar membros daquele projeto.
7. O sistema verifica se o projeto existe.
8. O sistema verifica se o usuario alvo existe.
9. O sistema normaliza os papeis informados.
10. O sistema verifica se o usuario ja nao pertence ao projeto.
11. O sistema cria o membership.
12. O sistema retorna os dados do novo membro do projeto.

### Fluxos alternativos

5a. O `userId` e invalido ou a lista de papeis nao foi informada.
5a.1. O sistema rejeita a solicitacao.
5a.2. O sistema informa que `userId` e `roles` sao obrigatorios.
5a.3. O caso de uso e encerrado.

6a. O ator nao pode gerenciar membros daquele projeto.
6a.1. O sistema rejeita a solicitacao.
6a.2. O sistema informa que apenas coordenadores, gerentes ou gerente do projeto podem adicionar membros.
6a.3. O caso de uso e encerrado.

9a. Nenhum papel valido foi informado.
9a.1. O sistema rejeita a solicitacao.
9a.2. O sistema informa que nenhum papel valido foi informado.
9a.3. O caso de uso e encerrado.

10a. O usuario ja e membro do projeto.
10a.1. O sistema rejeita a solicitacao.
10a.2. O sistema informa que o usuario ja e membro daquele projeto.
10a.3. O caso de uso e encerrado.

## 7. UC-15 Criar tarefa individual

- Objetivo: registrar uma nova tarefa no sistema, respeitando escopo, atribuicao e regras de visibilidade.
- Atores primarios: usuarios com permissao `MANAGE_TASKS`.
- Pre-condicoes: ator autenticado com permissao adequada.
- Pos-condicoes de sucesso: tarefa criada e, quando aplicavel, atribuicoes persistidas.
- Rastreabilidade principal:
  - `app/api/tasks/route.ts`
  - `contexts/task-context.tsx`
  - `backend/modules/task-management/infrastructure/task-service.gateway.ts`

### Fluxo principal

1. O ator autorizado aciona o formulario de criacao de tarefa.
2. O sistema autentica o ator e valida a permissao `MANAGE_TASKS`.
3. O ator informa os dados da tarefa.
4. O sistema encaminha os dados para o modulo de gerenciamento de tarefas.
5. O sistema identifica o criador da tarefa.
6. O sistema normaliza a lista de atribuidos, quando houver.
7. Se a tarefa for de projeto, o sistema verifica a existencia do projeto informado.
8. O sistema valida a existencia dos usuarios atribuidos, quando houver.
9. O sistema cria a tarefa.
10. Se a tarefa nao for global, o sistema persiste os atribuidos e sincroniza `assignedTo` e `assigneeIds`.
11. O sistema retorna a tarefa criada.

### Fluxos alternativos

2a. O ator nao possui permissao para criar tarefa.
2a.1. O sistema bloqueia a operacao.
2a.2. O sistema informa falta de permissao.
2a.3. O caso de uso e encerrado.

7a. O projeto informado nao existe.
7a.1. O sistema rejeita a criacao.
7a.2. O sistema informa que o projeto nao foi encontrado.
7a.3. O caso de uso e encerrado.

8a. Algum usuario atribuido nao existe.
8a.1. O sistema rejeita a criacao.
8a.2. O caso de uso e encerrado.

### Excecoes

6x. A tarefa foi marcada como global.
6x.1. O sistema exige que o criador possua permissao de gerenciamento de usuarios.
6x.2. O sistema remove `assignedTo` e `projectId`, define a visibilidade como `public` e zera a lista de atribuicao.
6x.3. O fluxo principal segue a partir do passo 9.

## 8. UC-20 Concluir tarefa publica com progresso individual

- Objetivo: registrar a conclusao individual de uma tarefa publica sem encerrar o progresso de outros usuarios.
- Atores primarios: usuario autenticado elegivel.
- Pre-condicoes: tarefa publica existente e acessivel ao usuario.
- Pos-condicoes de sucesso: progresso individual do usuario e atualizado para `done`, com data de conclusao e pontuacao calculada.
- Rastreabilidade principal:
  - `app/api/tasks/[id]/route.ts`
  - `backend/modules/task-management/infrastructure/task-service.gateway.ts`
  - `prisma/schema.prisma` (`task_user_progress`)

### Fluxo principal

1. O usuario acessa uma tarefa publica no escopo em que possui visibilidade.
2. O usuario aciona a conclusao da tarefa.
3. O sistema identifica o usuario que recebera o credito da conclusao.
4. O sistema localiza a tarefa.
5. O sistema verifica se a tarefa ja nao foi concluida por aquele usuario no progresso individual.
6. O sistema cria ou atualiza o registro de progresso individual do usuario com status `done`.
7. O sistema calcula eventual penalidade por atraso.
8. O sistema calcula os pontos a conceder.
9. Se houver pontuacao diferente de zero, o sistema incrementa o contador de tarefas concluidas do usuario.
10. O sistema publica o evento de premiacao correspondente.
11. O sistema retorna a tarefa com o progresso do ator refletido.

### Fluxos alternativos

3a. O ator tenta concluir a tarefa em nome de outro usuario sem permissao de gerenciamento de tarefas.
3a.1. O sistema rejeita a operacao.
3a.2. O sistema informa falta de permissao para concluir tarefa para outro usuario.
3a.3. O caso de uso e encerrado.

5a. O usuario ja concluiu essa tarefa publica anteriormente.
5a.1. O sistema rejeita a operacao.
5a.2. O sistema informa que a tarefa publica ja foi concluida por esse usuario.
5a.3. O caso de uso e encerrado.

### Excecoes

4x. A tarefa nao e encontrada.
4x.1. O sistema informa que a tarefa nao foi encontrada.
4x.2. O caso de uso e encerrado.

## 9. UC-21 Aprovar tarefa em revisao

- Objetivo: homologar uma tarefa submetida ao estado `in-review`.
- Atores primarios: coordenador, gerente, ou gerente de projeto lider do projeto da tarefa.
- Pre-condicoes: tarefa existente no estado `in-review`.
- Pos-condicoes de sucesso: tarefa aprovada, marcada como concluida e, quando aplicavel, usuario atribuido notificado e pontuado.
- Rastreabilidade principal:
  - `app/api/tasks/[id]/approve/route.ts`
  - `backend/modules/task-management/infrastructure/task-service.gateway.ts`

### Fluxo principal

1. O aprovador autenticado seleciona uma tarefa em revisao.
2. O sistema localiza a tarefa.
3. O sistema verifica se a tarefa esta no estado `in-review`.
4. O sistema identifica o usuario aprovador.
5. O sistema verifica se o aprovador possui `MANAGE_USERS` ou se e `GERENTE_PROJETO` do projeto da tarefa.
6. O sistema altera o estado da tarefa para `done`.
7. O sistema marca a tarefa como concluida e registra a data de conclusao.
8. Se houver usuario atribuido, o sistema calcula os pontos e atualiza seus indicadores.
9. O sistema publica a premiacao do usuario atribuido.
10. O sistema publica notificacao de aprovacao da tarefa.
11. O sistema retorna a tarefa aprovada.

### Fluxos alternativos

3a. A tarefa nao esta em revisao.
3a.1. O sistema rejeita a aprovacao.
3a.2. O sistema informa que a tarefa nao esta em revisao.
3a.3. O caso de uso e encerrado.

5a. O aprovador e `GERENTE_PROJETO`, mas nao e lider do projeto da tarefa.
5a.1. O sistema rejeita a aprovacao.
5a.2. O sistema informa que o usuario nao e lider do projeto.
5a.3. O caso de uso e encerrado.

5b. O aprovador nao possui permissao suficiente.
5b.1. O sistema rejeita a aprovacao.
5b.2. O sistema informa que o usuario nao tem permissao para aprovar a tarefa.
5b.3. O caso de uso e encerrado.

## 10. UC-22 Rejeitar tarefa em revisao

- Objetivo: devolver uma tarefa para ajuste apos analise.
- Atores primarios: coordenador, gerente, ou gerente de projeto lider do projeto da tarefa.
- Pre-condicoes: tarefa existente no estado `in-review`.
- Pos-condicoes de sucesso: tarefa colocada em `adjust`, sem conclusao registrada, e usuario atribuido notificado quando houver.
- Rastreabilidade principal:
  - `app/api/tasks/[id]/reject/route.ts`
  - `backend/modules/task-management/infrastructure/task-service.gateway.ts`

### Fluxo principal

1. O aprovador autenticado seleciona uma tarefa em revisao.
2. O sistema localiza a tarefa.
3. O sistema verifica se a tarefa esta no estado `in-review`.
4. O sistema identifica o aprovador.
5. O sistema verifica se o aprovador possui permissao para rejeitar a tarefa naquele contexto.
6. O ator informa, opcionalmente, um motivo de rejeicao.
7. O sistema altera o estado da tarefa para `adjust`.
8. O sistema marca a tarefa como nao concluida e remove a data de conclusao.
9. Se houver usuario atribuido, o sistema publica notificacao de rejeicao, com o motivo quando fornecido.
10. O sistema retorna a tarefa rejeitada.

### Fluxos alternativos

3a. A tarefa nao esta em revisao.
3a.1. O sistema rejeita a operacao.
3a.2. O sistema informa que a tarefa nao esta em revisao.
3a.3. O caso de uso e encerrado.

5a. O aprovador nao possui permissao suficiente.
5a.1. O sistema rejeita a operacao.
5a.2. O sistema informa falta de permissao ou ausencia de lideranca no projeto.
5a.3. O caso de uso e encerrado.

## 11. UC-24 Iniciar sessao de trabalho

- Objetivo: registrar o inicio de uma nova sessao de trabalho.
- Atores primarios: usuario autenticado.
- Pre-condicoes: usuario autenticado; se informar projeto, deve pertencer a ele ou ter permissao de gerenciamento correspondente.
- Pos-condicoes de sucesso: uma nova sessao ativa e criada para o usuario, encerrando automaticamente outra sessao ativa anterior caso exista.
- Rastreabilidade principal:
  - `hooks/use-work-sessions.ts`
  - `app/api/work-sessions/route.ts`
  - `backend/modules/work-execution/infrastructure/work-session-service.gateway.ts`

### Fluxo principal

1. O usuario autenticado aciona o inicio de uma sessao.
2. O sistema identifica o usuario alvo da sessao.
3. O sistema valida se o ator pode abrir sessao para si mesmo ou, quando permitido, para outro usuario.
4. Se um projeto foi informado, o sistema verifica se o usuario pertence a esse projeto.
5. O sistema verifica se o usuario ja possui uma sessao ativa.
6. Se existir sessao ativa anterior, o sistema a encerra automaticamente como `completed`, calculando sua duracao ate o momento.
7. O sistema cria uma nova sessao com status `active`.
8. O sistema retorna a sessao criada.

### Fluxos alternativos

3a. O ator tenta iniciar sessao para outro usuario sem permissao `MANAGE_WORK_SESSIONS`.
3a.1. O sistema rejeita a operacao.
3a.2. O caso de uso e encerrado.

4a. O usuario nao pertence ao projeto informado.
4a.1. O sistema rejeita a operacao.
4a.2. O caso de uso e encerrado.

## 12. UC-26 Finalizar sessao de trabalho e associar tarefas concluidas

- Objetivo: encerrar uma sessao de trabalho, opcionalmente associando tarefas concluidas e gerando ou atualizando log diario.
- Atores primarios: usuario autenticado.
- Pre-condicoes: sessao existente e pertencente ao usuario alvo da operacao.
- Pos-condicoes de sucesso: sessao concluida, tarefas vinculadas quando permitido, log diario criado ou atualizado e evento de gamificacao publicado ao final.
- Rastreabilidade principal:
  - `hooks/use-work-sessions.ts`
  - `app/api/work-sessions/[id]/route.ts`
  - `backend/modules/work-execution/infrastructure/work-session-service.gateway.ts`
  - `backend/modules/work-execution/application/use-cases/complete-work-session.use-case.ts`

### Fluxo principal

1. O usuario seleciona uma sessao em andamento para finalizacao.
2. O sistema localiza a sessao.
3. O sistema verifica se o ator pode operar sobre a sessao.
4. O sistema recebe os dados de finalizacao, como atividade, local, horario final, projeto, tarefas concluidas e nota do log.
5. Se um projeto foi informado, o sistema verifica se o usuario pertence a esse projeto.
6. Se foram informadas tarefas concluidas, o sistema valida que a sessao sera finalizada e que as tarefas podem ser vinculadas naquele contexto.
7. O sistema define o horario de termino e altera o status da sessao para `completed`.
8. O sistema calcula e acumula a duracao da sessao.
9. O sistema atualiza atividade, local e projeto quando informados.
10. O sistema persiste a sessao concluida.
11. Se houver tarefas informadas, o sistema substitui as associacoes da sessao para refletir a lista recebida.
12. O sistema cria ou atualiza o log diario correspondente a sessao concluida.
13. O sistema publica o evento de sessao concluida para fins de gamificacao.
14. O sistema retorna a sessao concluida.

### Fluxos alternativos

3a. O ator tenta finalizar sessao de outro usuario sem permissao.
3a.1. O sistema rejeita a operacao.
3a.2. O caso de uso e encerrado.

6a. Foram informadas tarefas, mas a sessao nao esta sendo finalizada.
6a.1. O sistema rejeita a operacao.
6a.2. O sistema informa que so e possivel vincular tarefas em sessoes finalizadas.
6a.3. O caso de uso e encerrado.

6b. Alguma tarefa informada nao e valida para a sessao ou para o usuario no contexto do projeto.
6b.1. O sistema rejeita a operacao.
6b.2. O caso de uso e encerrado.

### Excecoes

2x. A sessao nao e encontrada.
2x.1. O sistema informa que a sessao nao foi encontrada.
2x.2. O caso de uso e encerrado.

13x. Ocorre falha na publicacao do evento de gamificacao.
13x.1. O sistema registra o erro.
13x.2. A sessao permanece concluida, pois a falha nao desfaz a finalizacao.

## 13. Observacoes desta primeira onda

- Esta etapa expandiu os casos mais centrais para acesso, projeto, tarefas e sessao de trabalho.
- A lista prioritaria inicial foi concluida nesta versao do documento.
- Os proximos documentos complementares mais importantes sao:
  - consolidacao de regras de negocio
  - maquinas de estado
  - expansao dos casos de uso secundarios

## 14. UC-10 Consultar projetos acessiveis ao ator

- Objetivo: listar os projetos que o ator pode visualizar ou gerenciar.
- Atores primarios: usuario autenticado.
- Pre-condicoes: ator autenticado.
- Pos-condicoes de sucesso: o ator recebe a lista de projetos permitidos segundo seu perfil e seus vinculos.
- Rastreabilidade principal:
  - `app/api/projects/route.ts`
  - `backend/modules/project-management/application/use-cases/list-projects-for-actor.use-case.ts`
  - `backend/modules/project-management/infrastructure/project-management.gateway.ts`

### Fluxo principal

1. O ator acessa a area de projetos.
2. O sistema autentica o ator.
3. O sistema identifica os papeis globais do ator.
4. O sistema verifica se o ator possui permissao equivalente a `MANAGE_TASKS`.
5. Se possuir essa permissao, o sistema retorna todos os projetos.
6. Caso contrario, o sistema busca os projetos nos quais o ator e membro.
7. O sistema busca os projetos criados pelo ator.
8. O sistema combina os resultados e remove duplicidades.
9. O sistema retorna a lista final de projetos acessiveis.

### Fluxos alternativos

4a. O ator possui permissao ampla de gestao.
4a.1. O sistema nao restringe a listagem por membership.
4a.2. O fluxo principal segue no passo 5.

6a. O ator nao e membro de nenhum projeto e nao criou projeto algum.
6a.1. O sistema retorna lista vazia.
6a.2. O caso de uso e encerrado.

## 15. UC-13 Definir papeis do membro no projeto

- Objetivo: atualizar os papeis contextuais de um membro em um projeto.
- Atores primarios: coordenador, gerente, gerente do projeto.
- Pre-condicoes: projeto e usuario alvo existem, e o ator pode gerenciar membros do projeto.
- Pos-condicoes de sucesso: o membership e atualizado com os papeis informados, ou criado caso ainda nao exista.
- Rastreabilidade principal:
  - `app/api/projects/[id]/members/route.ts`
  - `backend/modules/project-membership/infrastructure/prisma-project-membership.gateway.ts`

### Fluxo principal

1. O ator autorizado acessa a gestao de membros do projeto.
2. O sistema autentica o ator.
3. O ator informa o usuario alvo e a nova lista de papeis.
4. O sistema valida o identificador do projeto.
5. O sistema valida o identificador do usuario alvo e a lista de papeis recebida.
6. O sistema verifica se o ator pode gerenciar membros daquele projeto.
7. O sistema verifica a existencia do projeto.
8. O sistema verifica a existencia do usuario alvo.
9. O sistema normaliza os papeis informados.
10. O sistema verifica se ja existe membership para aquele usuario no projeto.
11. Se existir membership, o sistema atualiza seus papeis.
12. Se nao existir membership, o sistema cria um novo vinculo com os papeis informados.
13. O sistema retorna os dados atualizados do membership.

### Fluxos alternativos

5a. O `userId` e invalido ou a lista de papeis nao foi informada.
5a.1. O sistema rejeita a solicitacao.
5a.2. O sistema informa que `userId` e `roles` sao obrigatorios.
5a.3. O caso de uso e encerrado.

6a. O ator nao possui permissao para gerenciar membros daquele projeto.
6a.1. O sistema rejeita a operacao.
6a.2. O sistema informa que apenas coordenadores, gerentes ou gerente do projeto podem atualizar papeis.
6a.3. O caso de uso e encerrado.

9a. Nenhum papel valido foi informado.
9a.1. O sistema rejeita a solicitacao.
9a.2. O sistema informa que nenhum papel valido foi informado.
9a.3. O caso de uso e encerrado.

## 16. UC-27 Gerar log diario a partir da sessao

- Objetivo: registrar ou atualizar automaticamente o log diario vinculado a uma sessao de trabalho concluida.
- Atores primarios: usuario autenticado, sistema.
- Pre-condicoes: sessao existente, pertencente ao ator e concluida.
- Pos-condicoes de sucesso: log diario criado ou atualizado, associado a sessao de trabalho.
- Rastreabilidade principal:
  - `backend/modules/work-execution/infrastructure/work-session-service.gateway.ts`
  - `backend/modules/work-execution/application/use-cases/create-daily-log-from-session.use-case.ts`
  - `hooks/use-daily-logs.ts`

### Fluxo principal

1. O usuario conclui uma sessao de trabalho elegivel para gerar log.
2. O sistema identifica a sessao finalizada.
3. O sistema determina a data que sera usada no log.
4. O sistema determina a nota do log.
5. O sistema verifica se ja existe log associado a sessao.
6. Se nao existir log associado, o sistema cria um novo log diario com usuario, projeto, data, nota e referencia da sessao.
7. Se ja existir log associado, o sistema atualiza o log existente com os dados normalizados.
8. O sistema associa o log a sessao de trabalho.
9. O sistema disponibiliza esse registro para consulta nas telas de logs.

### Fluxos alternativos

3a. O ator informa explicitamente a data do log.
3a.1. O sistema usa a data recebida.
3a.2. O fluxo principal segue no passo 4.

4a. O ator informa explicitamente a nota do log.
4a.1. O sistema usa a nota recebida.
4a.2. O fluxo principal segue no passo 5.

4b. O ator nao informa nota.
4b.1. O sistema gera uma nota padrao com informacoes da sessao, como duracao, atividade e local.
4b.2. O fluxo principal segue no passo 5.

### Excecoes

2x. A sessao nao existe, nao pertence ao ator ou nao esta concluida.
2x.1. O sistema rejeita a geracao do log.
2x.2. O caso de uso e encerrado.

## 17. UC-29 Registrar ou atualizar relatorio semanal

- Objetivo: consolidar a atividade semanal de um usuario em um relatorio persistido.
- Atores primarios: usuario autenticado, laboratorista, gestor autorizado.
- Pre-condicoes: usuario alvo valido, intervalo semanal informado.
- Pos-condicoes de sucesso: relatorio semanal criado ou atualizado com total de logs e resumo consolidado a partir das sessoes concluidas.
- Rastreabilidade principal:
  - `app/api/weekly-reports/route.ts`
  - `contexts/weekly-report-context.tsx`
  - `backend/modules/reporting/infrastructure/prisma-reporting.gateway.ts`

### Fluxo principal

1. O ator acessa a funcionalidade de relatorio semanal.
2. O sistema autentica o ator.
3. O ator informa usuario, semana inicial, semana final e, opcionalmente, um resumo.
4. O sistema valida `userId`, `weekStart` e `weekEnd`.
5. O sistema verifica se o ator pode criar relatorio para aquele usuario.
6. O sistema localiza o usuario alvo.
7. O sistema normaliza o intervalo semanal informado.
8. O sistema busca as sessoes concluidas do usuario dentro da janela semanal.
9. O sistema calcula `totalLogs` a partir dessas sessoes.
10. O sistema monta o resumo final do relatorio.
11. O sistema verifica se ja existe relatorio para o mesmo usuario e mesmo intervalo.
12. Se existir, o sistema atualiza o relatorio.
13. Se nao existir, o sistema cria o relatorio.
14. O sistema retorna o relatorio consolidado.

### Fluxos alternativos

4a. `userId`, `weekStart` ou `weekEnd` sao invalidos ou ausentes.
4a.1. O sistema rejeita a solicitacao.
4a.2. O sistema informa que os campos obrigatorios nao foram atendidos.
4a.3. O caso de uso e encerrado.

5a. O ator tenta criar relatorio para outro usuario sem permissao suficiente.
5a.1. O sistema rejeita a operacao.
5a.2. O sistema informa falta de permissao.
5a.3. O caso de uso e encerrado.

10a. O ator nao informa resumo manual.
10a.1. O sistema gera o resumo a partir das sessoes concluidas recuperadas.
10a.2. O fluxo principal segue no passo 11.

### Excecoes

6x. O usuario informado nao e encontrado.
6x.1. O sistema rejeita a operacao.
6x.2. O sistema informa que o usuario nao foi encontrado.
6x.3. O caso de uso e encerrado.

## 18. UC-33 Assumir ou registrar responsabilidade de laboratorio

- Objetivo: iniciar o registro de responsabilidade ativa sobre o laboratorio e permitir seu acompanhamento.
- Atores primarios: coordenador, gerente, laboratorista.
- Pre-condicoes: ator autenticado com papel permitido; nao deve existir responsabilidade ativa anterior.
- Pos-condicoes de sucesso: nova responsabilidade ativa criada com usuario, horario inicial e observacoes opcionais.
- Rastreabilidade principal:
  - `app/api/responsibilities/route.ts`
  - `app/api/responsibilities/[id]/route.ts`
  - `backend/modules/lab-operations/infrastructure/lab-operations.gateway.ts`

### Fluxo principal

1. O ator autorizado acessa a funcionalidade de responsabilidade do laboratorio.
2. O sistema autentica o ator.
3. O sistema verifica se o ator possui um dos papeis permitidos para iniciar responsabilidade.
4. O ator informa observacoes iniciais, se desejar.
5. O sistema verifica se ja existe responsabilidade ativa em aberto.
6. O sistema cria a responsabilidade com usuario, nome, horario inicial e observacoes.
7. O sistema retorna a responsabilidade criada como responsabilidade ativa.

### Fluxos alternativos

3a. O ator nao possui papel autorizado.
3a.1. O sistema rejeita a operacao.
3a.2. O sistema informa falta de permissao para iniciar responsabilidade.
3a.3. O caso de uso e encerrado.

5a. Ja existe uma responsabilidade ativa.
5a.1. O sistema rejeita a abertura de nova responsabilidade.
5a.2. O sistema informa que a responsabilidade atual deve ser finalizada antes da criacao de outra.
5a.3. O caso de uso e encerrado.

### Excecoes

6x. O usuario autenticado nao e encontrado no repositorio de usuarios.
6x.1. O sistema rejeita a operacao.
6x.2. O sistema informa que o usuario nao foi encontrado.
6x.3. O caso de uso e encerrado.

## 19. UC-34 Registrar e acompanhar issue de laboratorio

- Objetivo: permitir que problemas operacionais do laboratorio sejam registrados e acompanhados.
- Atores primarios: usuario autenticado.
- Pre-condicoes: ator autenticado.
- Pos-condicoes de sucesso: issue criada com dados basicos e status inicial adequado; issues podem ser listadas e filtradas para acompanhamento.
- Rastreabilidade principal:
  - `app/api/issues/route.ts`
  - `app/api/issues/[id]/route.ts`
  - `app/api/issues/[id]/status/route.ts`
  - `app/api/issues/[id]/resolve/route.ts`
  - `backend/modules/lab-operations/infrastructure/lab-operations.gateway.ts`

### Fluxo principal

1. O usuario acessa a funcionalidade de issues do laboratorio.
2. O sistema autentica o usuario.
3. O usuario informa titulo, descricao e, opcionalmente, categoria, prioridade e responsavel.
4. O sistema valida titulo, descricao e reporter.
5. O sistema valida a prioridade informada.
6. O sistema cria a issue com o ator autenticado como reporter e com status inicial `in_progress`.
7. O sistema registra a issue no repositorio.
8. O sistema publica a notificacao correspondente, quando aplicavel.
9. O sistema retorna a issue criada.
10. Em consultas posteriores, o usuario pode listar issues por filtros como status, prioridade, categoria, reporter, responsavel ou busca textual.

### Fluxos alternativos

4a. Titulo, descricao ou reporter nao sao validos.
4a.1. O sistema rejeita a criacao.
4a.2. O sistema informa qual obrigatoriedade nao foi atendida.
4a.3. O caso de uso e encerrado.

5a. A prioridade informada nao pertence ao conjunto permitido.
5a.1. O sistema rejeita a criacao.
5a.2. O sistema informa que a prioridade e invalida.
5a.3. O caso de uso e encerrado.

10a. O usuario consulta issues sem informar filtros.
10a.1. O sistema retorna todas as issues.
10a.2. O caso de uso segue como consulta completa.

10b. O usuario informa filtro textual.
10b.1. O sistema busca correspondencia em titulo, descricao e categoria.
10b.2. O sistema retorna apenas as issues correspondentes.

## 20. UC-41 Conceder pontos e badges por conclusao de atividade

- Objetivo: aplicar efeitos de gamificacao apos eventos elegiveis, como conclusao de tarefa ou finalizacao de sessao de trabalho.
- Atores primarios: sistema.
- Pre-condicoes: evento elegivel disparado; usuario alvo existente.
- Pos-condicoes de sucesso: pontos e XP aplicados quando ainda nao houve premiacao para a mesma origem; badges elegiveis sao avaliados.
- Rastreabilidade principal:
  - `backend/modules/gamification/infrastructure/prisma-gamification.gateway.ts`
  - `backend/modules/work-execution/application/use-cases/complete-work-session.use-case.ts`
  - `backend/modules/task-management/infrastructure/task-service.gateway.ts`
  - `app/api/users/[id]/gamification/route.ts`

### Fluxo principal

1. O sistema detecta a conclusao de uma atividade elegivel.
2. O sistema identifica o usuario, o tipo de origem e o identificador da origem.
3. O sistema verifica se a premiacao daquela origem ja foi aplicada anteriormente.
4. Se ainda nao houve premiacao, o sistema calcula os pontos e o XP correspondentes.
5. O sistema aplica a premiacao ao usuario.
6. O sistema registra historico de gamificacao para evitar duplicidade futura.
7. O sistema recalcula a progressao do usuario.
8. O sistema avalia badges elegiveis para o usuario.
9. O sistema retorna o resultado da premiacao e a nova progressao.

### Fluxos alternativos

3a. A origem ja foi premiada anteriormente.
3a.1. O sistema nao aplica nova premiacao.
3a.2. O sistema retorna a progressao atual indicando que a premiacao ja havia ocorrido.
3a.3. O caso de uso e encerrado.

4a. A origem e uma sessao de trabalho.
4a.1. O sistema calcula pontos com base em pontos base, duracao da sessao e quantidade de tarefas concluidas vinculadas.
4a.2. O fluxo principal segue no passo 5.

4b. A origem e uma tarefa concluida.
4b.1. O sistema calcula pontos a partir do valor da tarefa ou usa valor padrao quando necessario.
4b.2. O fluxo principal segue no passo 5.
