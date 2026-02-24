# Manual do Usuario

## Perfis de usuario (visao pratica)

Perfis usados no sistema:

- `COORDENADOR`
- `GERENTE`
- `LABORATORISTA`
- `GERENTE_PROJETO`
- `PESQUISADOR`
- `COLABORADOR`
- `VOLUNTARIO`

Obs.: a permissao final depende das regras RBAC configuradas no backend.

## Acesso ao sistema

### Cadastro

1. Acesse `/register`
2. Informe nome, email e senha
3. A conta sera criada com status `pending`
4. Aguarde aprovacao de coordenacao/gerencia

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

### O que e possivel fazer

- visualizar projetos acessiveis
- ver membros e detalhes
- acompanhar tarefas por projeto
- (gestao/lideranca) gerenciar membros e configuracoes

### Dicas de uso

- se um projeto nao aparecer, verifique se voce e membro ou se possui permissao de gestao
- tarefas publicas de projeto sao visiveis aos membros do projeto

## Tarefas (Kanban)

## Tipos de task (visao do usuario)

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
- badges podem ser atribuuidos automaticamente/manualmente (conforme fluxo)
- pontos podem ser usados na loja para resgates

## Relatorios semanais

- relatorio de usuario e visualizado em modal com exportacao
- relatorio de projeto segue fluxo semelhante (visualizacao + exportacao)

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

- verifique membership no projeto
- verifique perfil/permissoes
- recarregue a tela apos alteracoes recentes
