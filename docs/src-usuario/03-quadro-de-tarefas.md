# O quadro de tarefas

O Quadro de Tarefas é a tela inicial do sistema. É onde o trabalho do laboratório aparece como cartões, organizados pelo estágio em que estão.

```foto quadro-tarefas titulo="O quadro de tarefas, com as cinco colunas de estado"
Vista de coordenador: o quadro mostra todas as tarefas visíveis, de todos os projetos.
```

## As colunas

| Coluna | O que significa |
| --- | --- |
| **A Fazer** | tarefa criada, ainda não começada |
| **Em Andamento** | alguém está trabalhando nela |
| **Em Revisão** | entregue, esperando aprovação |
| **Ajustes** | a revisão devolveu a tarefa para correção |
| **Concluído** | aprovada; os pontos foram creditados |

Mover um cartão de uma coluna para outra muda o estado da tarefa. Há dois caminhos:

- arrastar o cartão pelo punho à esquerda dele e soltá-lo na coluna de destino;
- abrir o menu do cartão (os três pontos) e escolher o destino em **Mover para**. A lista mostra apenas as colunas que a sua função pode alcançar.

Cada coluna tem altura própria e rola por dentro. Quando uma coluna tem mais cartões do que cabem na tela, a rolagem acontece **dentro dela** — o nome da coluna e a contagem de cartões continuam visíveis no alto. A página inteira não cresce com a quantidade de tarefas; para ver mais cartões de uma vez, use **Compacto** na barra acima do quadro.

## Os filtros

Na barra acima do quadro:

- **Todos os projetos** — restringe o quadro a um projeto.
- **Todas as pessoas** — restringe às tarefas de uma pessoa.
- **Vencimento** — ordena pelo prazo.
- **Compacto** — encolhe os cartões, para ver mais tarefas na tela.

## O que o cartão mostra

Título, projeto, pessoas responsáveis, prazo e prioridade. Além disso:

- **⚡** marca tarefa **pública**: qualquer pessoa pode pegá-la. A mesma marca aparece como coroa no canto do cartão.
- **🌍** marca **Quest Global**: tarefa do laboratório inteiro, sem projeto. Só Coordenador e Gerente criam uma.
- **ATRASADA** aparece em vermelho quando o prazo já passou.
- O selo **10 pts** é o valor base da tarefa, o mesmo para todas.

## Criar uma tarefa

1. Clique em **Nova Tarefa** na barra do quadro.
2. Preencha **Título** e **Descrição**.
3. Escolha o destino: **Quest Global** (sem projeto, visível para todo o laboratório) ou **Projeto**.
4. Em **Responsáveis**, defina quem executa. Com mais de uma pessoa escolhida aparece **Modo de atribuição**: **Individual** (cada responsável recebe uma tarefa independente) ou **Compartilhado** (todos compartilham o mesmo estado).
5. Em **Visibilidade**, escolha **Delegada (responsáveis específicos)**, **Pública (qualquer um pode pegar)** ou **Privada (restrita aos responsáveis)**.
6. Ajuste **Prazo** e **Prioridade** (**Baixa**, **Média**, **Alta**).
7. Salve.

```foto dialogo-nova-tarefa titulo="O diálogo Nova Tarefa"
A opção Quest Global aparece apenas para quem tem permissão de gerenciar contas.
```

Limites que o sistema aplica: título com até 200 caracteres e descrição com até 1000. A pontuação não é preenchida: toda tarefa vale 10 pontos, e quem cria não escolhe o valor.

## Ver, editar e excluir

Clique no título do cartão para abrir o detalhe da tarefa, que traz projeto, visibilidade, descrição, criador, pontos, prioridade, prazo, status e os botões **Editar** e **Excluir**.

```foto dialogo-detalhe-tarefa titulo="O detalhe de uma tarefa"
O detalhe mostra o valor que a tarefa rende se for concluída agora, com o bônus ou a penalidade do prazo.
```

## Enviar para revisão e aprovar

Mover uma tarefa para **Em Revisão** é a entrega: o sistema registra o pedido de revisão e avisa *"📋 Tarefa Enviada para Revisão"*.

A aprovação aparece na própria coluna **Em Revisão**, como dois botões no cartão — **Aprovar** e **Rejeitar**. Eles só aparecem para:

- **Coordenador** e **Gerente**;
- **Gerente de Projeto** do projeto da tarefa — e nunca para aprovar a própria tarefa.

Aprovar move a tarefa para **Concluído** e credita os pontos. Rejeitar devolve para **Ajustes**, com a mensagem *"Retornou para ajustes."*.

::: limite titulo="Pontos e atraso"
Pontos são creditados na aprovação, não na entrega. Toda tarefa vale 10 pontos, com três desfechos: 15 quando é aprovada **antes** do prazo, 10 quando é aprovada **no dia** do prazo ou quando não tem prazo, e 10 menos 10 por dia de atraso quando é aprovada depois. A contagem é por dia de calendário: aprovar no dia do vencimento não gera atraso. O valor resultante pode ser negativo — tarefa muito atrasada reduz o saldo — e o detalhe da tarefa mostra o número sem disfarce. Uma tarefa concluída não volta para revisão por botão: é preciso editá-la.
:::

## Quem pode o quê no quadro

| Ação | Funções |
| --- | --- |
| Ver o quadro | todas |
| Criar tarefa | Coordenador, Gerente, Gerente de Projeto, Pesquisador, Colaborador |
| Editar tarefa | Coordenador, Gerente, Gerente de Projeto, Colaborador |
| Concluir tarefa pública | Coordenador, Gerente, Gerente de Projeto, Colaborador, Voluntário |
| Aprovar / rejeitar | Coordenador, Gerente, Gerente de Projeto do projeto |
| Atribuir a voluntário | Coordenador, Gerente, Gerente de Projeto, Colaborador |

```foto quadro-tarefas-participante titulo="O mesmo quadro, visto por um pesquisador"
A barra de filtros e as colunas são as mesmas; o que muda é o conjunto de tarefas visível e os controles de aprovação, que não aparecem.
```

::: nota titulo="Importar backlog"
Quem cria tarefas também encontra **Inserir backlog** no diálogo de nova tarefa, para trazer um conjunto de tarefas de uma vez. Cada linha vira uma tarefa; os prefixes **!alta**, **!baixa**, **!urgente** e **#25/12** definem prioridade e vencimento. O prefixo antigo **@30** continua aceito, mas é ignorado: toda tarefa vale 10 pontos. O sistema confirma com *"Backlog importado"* ou denuncia o motivo da recusa.
:::
