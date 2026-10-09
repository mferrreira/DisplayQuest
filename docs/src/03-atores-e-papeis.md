# Atores, papéis e permissões

## Atores do sistema

O DisplayQuest reconhece sete papéis e um ator implícito. O ator implícito é o visitante,
que não possui conta e só alcança os casos de uso de criação de conta e autenticação.
Todo o restante da fronteira pressupõe uma conta aprovada.

| Ator | Papel | Descrição |
| --- | --- | --- |
| Visitante | — | Pessoa sem conta, com acesso apenas ao cadastro e à autenticação |
| Voluntário | `VOLUNTARIO` | Participa da operação assumindo tarefas públicas e registrando trabalho |
| Colaborador | `COLABORADOR` | Atua como o voluntário e, adicionalmente, cria e edita tarefas |
| Pesquisador | `PESQUISADOR` | Cria e edita tarefas e acompanha projetos, sem gerir membros |
| Laboratorista | `LABORATORISTA` | Opera o laboratório: plantão, avisos, catálogo de recompensas e compras |
| Gerente de Projeto | `GERENTE_PROJETO` | Lidera no máximo um projeto, gere membros, atribui tarefas e aprova entregas |
| Gerente | `GERENTE` | Gestão administrativa de usuários, compras, sessões e comunicados |
| Coordenador | `COORDENADOR` | Autoridade máxima, com acesso a todas as funções de gestão |

O sistema não possui papel administrativo genérico. A autoridade máxima é o papel de
coordenador, e não há um papel que conceda tudo por construção: cada permissão declara
explicitamente quais papéis a exercem.

## Matriz de permissões de back-end

A matriz de permissões é a autoridade do servidor. Ela é verificada nos casos de uso
autorizados: a decisão de autorização mora no caso de uso que executa a operação, não na
rota que a recebe — quem age entra no comando como ator, e a negação volta como erro de
domínio mapeado. Onde uma rota ainda consulta a matriz antes de ler o corpo, a razão é
medida: preservar a ordem entre o 403 de quem não tem permissão e o 400 de um corpo
inválido. O papel primário de uma pessoa é resolvido por uma ordem de precedência fixa:
coordenador, gerente, laboratorista, gerente de projeto, pesquisador, colaborador e
voluntário.

| Permissão |COORDENADOR | GERENTE | LABORATORISTA | GERENTE_PROJETO | PESQUISADOR | COLABORADOR | VOLUNTARIO |
| --- | :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| `MANAGE_USERS` | sim | sim | — | — | — | — | — |
| `MANAGE_NOTIFICATIONS` | sim | sim | — | — | — | — | — |
| `MANAGE_REWARDS` | sim | sim | sim | — | — | — | — |
| `MANAGE_PURCHASES` | sim | sim | sim | — | — | — | — |
| `MANAGE_WORK_SESSIONS` | sim | sim | sim | — | — | — | — |
| `MANAGE_PROJECTS` | sim | sim | — | sim | — | — | — |
| `MANAGE_PROJECT_MEMBERS` | sim | sim | — | sim | — | — | — |
| `MANAGE_TASKS` | sim | sim | — | sim | sim | sim | — |

## Matriz de visibilidade de funcionalidades

A matriz de visibilidade decide o que aparece na interface. Ela não substitui a matriz de
permissões: uma função pode estar visível e ainda assim ser recusada pelo servidor. As duas
matrizes compartilham a mesma lista de chaves, e essa correspondência é verificada
automaticamente para que o front-end e o back-end não divirjam em silêncio.

| Chave | Quem vê |
| --- | --- |
| `DASHBOARD_ADMIN` | Coordenador, Gerente |
| `DASHBOARD_WEEKLY_REPORTS` | Coordenador, Gerente, Laboratorista |
| `DASHBOARD_PROJETOS` | Coordenador, Gerente, Gerente de Projeto, Pesquisador, Colaborador |
| `VIEW_PROJECT_DASHBOARD` | Todos os papéis, exceto Laboratorista |
| `MANAGE_REWARDS` | Coordenador, Gerente, Laboratorista |
| `MANAGE_USERS` | Coordenador, Gerente |
| `MANAGE_PROJECTS` | Coordenador, Gerente, Gerente de Projeto |
| `MANAGE_TASKS` | Coordenador, Gerente, Gerente de Projeto, Pesquisador, Colaborador |
| `MANAGE_PROJECT_MEMBERS` | Coordenador, Gerente, Gerente de Projeto |
| `MANAGE_SCHEDULE` | Coordenador, Gerente, Laboratorista |
| `MANAGE_BADGES` | Coordenador, Gerente, Laboratorista |
| `VIEW_ALL_DATA` | Coordenador, Gerente, Laboratorista |
| `VIEW_WEEKLY_REPORTS` | Coordenador, Gerente, Laboratorista |
| `EDIT_PROJECT` | Coordenador, Gerente, Gerente de Projeto |
| `EDIT_TASKS` | Coordenador, Gerente, Gerente de Projeto, Colaborador |
| `CREATE_TASK` | Coordenador, Gerente, Gerente de Projeto, Colaborador, Pesquisador |
| `CREATE_PROJECT` | Coordenador, Gerente, Gerente de Projeto |
| `MANAGE_LABORATORY` | Coordenador, Laboratorista |
| `ASSUME_LAB_RESPONSIBILITY` | Coordenador, Laboratorista |
| `COMPLETE_PUBLIC_TASKS` | Voluntário, Colaborador, Gerente de Projeto, Coordenador, Gerente |
| `ASSIGN_TASKS_TO_VOLUNTEERS` | Coordenador, Gerente, Gerente de Projeto, Colaborador |
| `APPROVE_USERS` | Coordenador, Laboratorista |
| `APPROVE_PURCHASES` | Coordenador, Gerente, Laboratorista |
| `VIEW_ALL_LOGS` | Coordenador |
| `EDIT_OWN_LOGS` | Todos os papéis |

::: nota titulo="Discrepância intencional entre as duas matrizes"
`APPROVE_USERS` concede a aprovação de cadastro ao Laboratorista, enquanto `MANAGE_USERS`,
que rege a mesma família de operações na rota de aprovação, restringe a Coordenador e
Gerente. Na prática, a rota que aprova contas exige `MANAGE_USERS`, de modo que a chave de
visibilidade concede ao Laboratorista um botão cuja ação o servidor recusa. A divergência
está registrada aqui como fato observado, e não corrigida.
:::

## Papéis por projeto

Além do papel global, uma pessoa pode receber papéis no escopo de um projeto. A associação
é única por par projeto e pessoa, o que impede duplicidade de participação. O papel atribuído
no projeto não amplia o poder global: ele descreve a função da pessoa dentro daquele
projeto, e a verificação de autoridade continua consultando a combinação do papel global
com a liderança do projeto.

| Papel no projeto | Efeito prático |
| --- | --- |
| Membro | Participa, vê membros e acompanha as horas do projeto |
| Líder | Detém a liderança formal; só pode liderar um projeto por vez |
| Colaborador do projeto | Participa com indicação de atuação |

## Regras de autorização de referência

O servidor avalia a autorização em dois níveis, e a decisão pertence ao caso de uso que
executa a operação — a rota autentica, valida a forma da entrada e traduz o resultado.
Onde uma rota consulta a matriz antes do caso de uso, é para preservar uma ordem medida
entre o 403 de autorização e os 400 de entrada, não porque a decisão more nela.

| Nível | Verificação | Aplicação típica |
| --- | --- | --- |
| Autenticação | Existência de sessão válida com usuário inteiro e positivo | Todas as rotas da aplicação |
| Papel ou permissão | `hasPermission` ou `hasAnyRole` sobre a matriz de permissões | Operações administrativas |
| Autoria ou permissão | O ator é o dono do recurso, ou tem a permissão exigida | Operações de sessão, log e perfil |

A terceira forma é a mais frequente nas rotas de recurso individual: o sistema permite
que uma pessoa altere o próprio registro sem concessão específica, e permite que um
gestor altere o de qualquer outra desde que tenha a permissão de gestão. É o que torna a
operação de sessões viável por um gestor sem que este precise ser dono da sessão.

### Quem age quando não há uma pessoa

Há uma quarta forma, e ela não aparece em nenhuma rota. Alguns casos de uso são chamados
por rotinas do próprio sistema: a varredura noturna que fecha sessões deixadas abertas, a
pausa agendada de responsabilidade, a reposição do histórico semanal de horas, e os eventos
que descrevem algo que já aconteceu — uma issue do laboratório reportada, um relatório
enviado, uma tarefa que entrou em revisão. Nessas chamadas não existe ator com papel, e a
permissão exigida pelo caso de uso não tem a quem ser aplicada.

O sistema resolve isso declarando o ator, em vez de dispensar a verificação. Toda chamada de
um caso de uso autorizado informa quem age, e a informação é uma de duas formas: um ator de
pessoa, construído a partir dos papéis da sessão, ou um ator de sistema, que nomeia a rotina
que fez a chamada. Um ator de sistema passa sem checagem de permissão, porque uma varredura
agendada não tem papel a segurar — e inventar uma permissão para ela seria uma concessão que
ninguém pode revogar. O que limita esse caminho é que a rota só sabe construir o ator de
pessoa, a partir da sessão, e uma verificação automática falha a construção do sistema se
alguma rota HTTP declarar um ator de sistema.

::: limite titulo="O ator de sistema não é uma permissão"
O motivo declarado junto do ator de sistema é rótulo de auditoria: ele identifica a rotina que
chamou, e nenhuma decisão de autorização o consulta. A garantia de que ele não é usado por
uma rota vem de uma varredura de texto sobre as rotas da aplicação, não do tipo.
:::

## Situação da conta

O estado da conta é um atributo do usuário e controla o acesso antes de qualquer
permissão ser considerada. Uma conta pendente não autentica, e a tentativa de entrada
produz uma mensagem explícita de que a conta ainda não foi aprovada.

| Situação | Efeito |
| --- | --- |
| Pendente | Conta criada, sem acesso ao sistema |
| Ativa | Acesso liberado conforme papéis e permissões |
| Recusada | Conta removida do sistema |
| Suspensa | Conta preservada com histórico, mas sem acesso |

A recusa de uma conta é uma exclusão, e não uma transição de estado. A distinção é
relevante: uma conta recusada precisa ser recriada do zero caso a pessoa volte a se
cadastrar, e não pode ser reativada.

## Avatar e visibilidade de perfil

O avatar é uma imagem quadrada, recortada em 300 por 300 pixels e convertida para WebP
antes da gravação. O arquivo resultante é servido como recurso estático, imutável por um
ano, com os cabeçalhos de segurança aplicados na borda da aplicação.

A visibilidade do perfil tem três níveis: público, restrito a membros e privado. O nível é
uma preferência declarada pela pessoa e não tem efeito sobre a autorização: ele rege a
apresentação de perfil, não o acesso a dados de trabalho.
