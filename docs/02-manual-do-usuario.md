# Manual do Usuario

## Perfis de usuario

O sistema trabalha com os seguintes perfis:

- `COORDENADOR`
- `GERENTE`
- `LABORATORISTA`
- `GERENTE_PROJETO`
- `PESQUISADOR`
- `COLABORADOR`
- `VOLUNTARIO`

As permissoes efetivas dependem das regras aplicadas no backend.

## Acesso ao sistema

### Cadastro

1. Acesse `/register`
2. Informe nome, email e senha
3. A conta sera criada com status `pending`
4. Aguarde a aprovacao da coordenacao ou da gerencia

### Login

1. Acesse `/login`
2. Informe email e senha
3. Apenas usuarios com status `active` conseguem entrar

## Navegacao principal

- `/dashboard`: quadro principal de tarefas
- `/dashboard/projetos`: projetos e acompanhamento
- `/dashboard/laboratorio`: responsabilidades, eventos, horarios e issues
- `/dashboard/weekly-reports`: relatorios semanais
- `/dashboard/loja`: recompensas e compras
- `/dashboard/profile`: perfil, badges, logs e sessoes
- `/dashboard/admin`: painel administrativo (conforme permissao)

## Projetos

### O que pode ser feito

- visualizar projetos acessiveis
- ver membros e detalhes
- acompanhar tarefas por projeto
- (gestao/lideranca) gerenciar membros e configuracoes

### Dicas de uso

- se um projeto nao aparecer, verifique se voce e membro ou se possui permissao de gestao
- tarefas publicas de projeto sao visiveis aos membros do projeto

## Tarefas (Kanban)

### Tipos de task

- `public`: visivel no escopo (projeto/laboratorio) e com progresso individual
- `delegated`: visivel no projeto, mas manipulacao restrita a atribuídos
- `private`: visivel no projeto, com restricao de manipulacao semelhante a delegated

## Comportamento do quadro

- tarefas publicas podem ser assumidas durante a movimentacao no quadro
- tarefas delegadas/privadas exigem atribuicao para movimentacao por usuarios comuns
- tarefas concluidas antigas (mais de 1 semana) saem da coluna `Concluido`
- tarefas antigas ficam em `Historico de tarefas` abaixo do quadro

## Insercao de backlog

Para usuarios com permissao:

- abrir dialogo de tarefas
- alternar para `Insercao de Backlog`
- informar uma task por linha
- opcional: `Titulo | Descricao`
- definir metadados comuns (projeto, tipo, prazo, pontos etc.)

## Horas, sessoes e logs

- usuario pode iniciar/encerrar sessao de trabalho
- logs diarios registram atividades
- relatorios semanais consolidam producao do periodo

## Responsabilidades do laboratorio

- exibem responsavel, inicio/fim e observacoes
- responsabilidades ativas podem ser acompanhadas no dashboard de laboratorio

## Loja e gamificacao

- tarefas concluidas geram pontos (conforme regras)
- badges podem ser atribuidos automaticamente ou manualmente, conforme o fluxo adotado
- pontos podem ser usados na loja para resgates

## Relatorios semanais

- relatorio de usuario pode ser visualizado em modal e exportado
- relatorio de projeto segue fluxo semelhante

## Problemas comuns

### "Nao consigo entrar"

- conta pode estar `pending`
- senha incorreta
- email nao cadastrado

### "Nao consigo mover task no quadro"

- task pode estar delegada para outro usuario
- task concluida pode ter restricoes de movimentacao
- voce pode nao ter permissao de gestao/manipulacao

### "Nao vejo um projeto/task"

- verifique se faz parte de um projeto
- verifique perfil/permissoes
- recarregue a tela apos alteracoes recentes (ctrl + shift + r)
