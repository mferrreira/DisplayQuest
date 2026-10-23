# Loja, pontos e ranking

O sistema tem dois saldos, com funções e ciclos diferentes.

- **Pontos** são o placar do mês. Vêm das tarefas aprovadas e alimentam o **Ranking**. Zeram no
  fechamento mensal do dia 1, descrito adiante neste capítulo, e não compram nada.
- **Moedas** são a carteira vitalícia, e são o que a **Loja** cobra. Vêm da atividade do
  cronograma de projeto quando ela é aprovada — uma atividade concluída distribui moedas entre as
  pessoas do projeto, na proporção das tarefas que cada uma entregou. Moeda não zera no fim do mês
  nem no fim do ano.

Horas não compram nada: horas medem trabalho, pontos medem entrega no mês, moedas guardam o que já
foi conquistado.

Cada tarefa aprovada rende 10 pontos — mais 5 por subtask concluída, quando a tarefa tem etapas — multiplicado por 1,5 quando a entrega acontece pelo menos 2 dias antes do prazo, e com 10 pontos descontados por dia de atraso quando acontece depois. O valor não é escolhido na criação da tarefa: é o sistema que calcula.

## A loja

A **Loja de Recompensas** tem duas abas: **Recompensas**, com o que está disponível, e **Minhas Compras**, com o que você já pediu.

```foto loja-participante titulo="A Loja de Recompensas"
Cada recompensa mostra o custo em moedas, e o cabeçalho da tela mostra as **moedas disponíveis**.
Quando as moedas não cobrem o custo, o botão aparece como **Moedas insuficientes** e não responde ao
clique.
```

## Resgatar uma recompensa

1. Abra **Loja** e fique na aba **Recompensas**.
2. Abra a recompensa desejada e confirme o resgate.
3. O pedido entra como **pendente**: as moedas são debitadas na hora, mas a recompensa ainda não é
   sua.

Uma compra pendente pode ser **aprovada** ou **rejeitada** por quem gerencia a loja. Rejeição devolve
as moedas. Compra aprovada pode ser **completada**; compra completada não pode ser cancelada.

```foto loja-minhas-compras titulo="A aba Minhas Compras"
A aba mostra cada pedido e em que estágio ele está.
```

::: limite titulo="Recompensa indisponível"
O sistema recusa resgate de recompensa fora de estoque ou marcada como indisponível, com as mensagens *"Esta recompensa está fora de estoque"* e *"Esta recompensa não está disponível"*.
:::

## Gerenciar a loja

Quem gerencia recompensas — **Coordenador**, **Gerente** e **Laboratorista** — encontra na mesma Loja duas abas a mais: **Aprovações** e **Gerenciar**.

A aba **Gerenciar** é o catálogo. A tabela tem as colunas **Nome**, **Descrição**, **Preço (Moedas)**, **Status** e **Ações**, e o botão
**Adicionar Produto** abre o diálogo **Adicionar Nova Recompensa**, com **Nome da Recompensa**,
**Descrição**, **Preço em Moedas** e a marca **Disponível para compra**.

```foto loja-gerenciar titulo="A aba Gerenciar, com o catálogo de recompensas"
É aqui que o catálogo é criado, ajustado e retirado de circulação.
```

```foto dialogo-nova-recompensa titulo="O diálogo Adicionar Nova Recompensa"
O preço é um número não negativo; o preço zero existe e é válido.
```

A aba **Aprovações** é a fila de pedidos pendentes: cada linha traz a recompensa pedida, quem pediu
e o custo em moedas, e é ali que o pedido é aprovado ou rejeitado — pelos botões **Aprovar** e **Negar**
da linha. O rótulo da aba carrega a contagem do que está esperando (*Aprovações 1*), e a tabela tem as
colunas **Usuário**, **Recompensa**, **Moedas**, **Data da Solicitação**, **Status** e **Ações**.

```foto loja-solicitacoes titulo="A aba Aprovações"
Aprovar confirma o resgate; rejeitar devolve as moedas à pessoa.
```

## O ranking

A tela se chama **Quadro de Liderança** e traz o mês no título (*Quadro de Liderança — out/2026*). A
primeira peça é a sua: **Sua posição** com o algarismo grande, a linha de números (*N pontos · N
tarefas no mês · XP N (temporada) · elo Ouro*) e o fio **Seu progresso até o topo**. Abaixo vem o
campeão do mês em bloco maior — quando a pessoa tem **capa** no perfil, a capa entra como fundo do
bloco dela — e os 2º e 3º lugares. A **Classificação completa** começa no 4º (o top 3 já está acima) e
tem as colunas **Posição**, **Usuário**, **Pontos**, **Tarefas (mês)**, **Elo**, **Troféus** e
**Moedas**.

```foto ranking-participante titulo="O ranking, na classificação completa"
A classificação é visível para qualquer pessoa autenticada. Clique em qualquer nome para abrir o
perfil daquela pessoa.
```

O que alimenta cada coluna:

| Coluna | De onde vem |
| --- | --- |
| **Pontos** | o placar do mês corrente: pontos creditados pelas aprovações, menos as penalidades de atraso. A loja não entra aqui — ela cobra moedas |
| **Tarefas (mês)** | as tarefas do mês em curso, contadas das duas formas que creditam a pessoa (a conclusão própria e a aprovação da tarefa que era dela), sem contar a tarefa pública duas vezes |
| **Elo** | o degrau do XP da temporada — não uma coluna à parte: é o XP que decide o elo e o elo que decide quantos troféus a pessoa mantém equipados |
| **Troféus** | quantos a pessoa mantém equipados e quantos tem conquistados (*1 / 3*) |
| **Moedas** | a carteira vitalícia, que o fechamento do mês não toca |

A ordem da régua é **pontos**, depois **tarefas do mês**, depois **XP**, e o último desempate é o
cadastro. Quem aplica a régua é o servidor: a tela mostra a ordem que o quadro devolve e não reordena nada.

::: nota titulo="O placar fecha no dia 1"
O **Pontos** do ranking é o mês corrente. No dia 1, às 00:00 (fuso do laboratório), o sistema
fecha o mês: o número e a contagem de tarefas daquele mês vão para o histórico da pessoa —
inclusive quando são negativos — e o placar recomeça em zero. Antes o número nunca zerava; hoje
o ranking mostra o mês em curso, e o mês encerrado fica no histórico da pessoa (capítulo 8).
O fechamento não é botão nem rota: é a agenda do sistema, e reexecutá-lo não duplica o mês.
:::

O mesmo quadro entrega o **Livro-caixa da temporada**: a tabela do ano que já fechou, com **Posição**,
**Usuário**, **Pontos**, **Tarefas**, **XP** e **Elo** — os números fotografados no fechamento, que a
zeragem de janeiro não apaga. Em 1º lugar está o campeão do ano, que recebe o troféu **CAMPEÃO**.
Enquanto nenhum ano foi fechado, a tabela diz *"Nenhum ano fechado ainda."*.

```foto ranking-livro-caixa titulo="O Livro-caixa da temporada, abaixo da classificação"
O elo desta tabela é o degrau que o ano tinha quando fechou. O elo da classificação acima é o de hoje,
derivado do XP da temporada em curso: os dois podem ser diferentes, e é assim que o ano fica legível
depois da zeragem.
```

## Troféus

Além dos dois saldos, o sistema concede **troféus** — conquistas vitalícias, agrupadas por categoria,
cada uma com um critério que declara a janela que mede: mês em curso, temporada ou vida inteira. Quem
tem a permissão de gerenciar troféus cria e edita os modelos no Painel Administrativo (capítulo 9); as
pessoas os recebem e os veem — e escolhem quais manter equipados — no próprio perfil (capítulo 8). A
conquista não some quando o mês ou o ano fecha: é para sempre.

O troféu pode declarar um efeito, que vale enquanto o troféu está equipado: um acréscimo percentual
sobre os créditos seguintes — pontos de tarefa, pontos de sessão, moedas de atividade — ou a redução
da penalidade de atraso. O credit afetado registra no histórico o troféu que participou do número, e
quantos troféus a pessoa mantém equipados depende do degrau dela na temporada: **Bronze** não abre
slot, **Prata** abre um, **Ouro** e **Platina** abrem dois, **Diamante** e **Desafiante** abrem três.

