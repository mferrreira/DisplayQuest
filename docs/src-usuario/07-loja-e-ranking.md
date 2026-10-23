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
e o custo em moedas, e é ali que o pedido é aprovado ou rejeitado.

```foto loja-solicitacoes titulo="A aba Aprovações"
Aprovar confirma o resgate; rejeitar devolve as moedas à pessoa.
```

## O ranking

O **Ranking** ordena as pessoas pelo que produziram. A tela traz o **Quadro de Liderança** e a **Classificação completa**, com as colunas **Posição**, **Usuário**, **Tarefas concluídas** e **Pontos**.

```foto ranking-participante titulo="O ranking, na classificação completa"
A classificação é visível para qualquer pessoa autenticada.
```

No **Quadro de Liderança** os três primeiros têm destaque maior e avatar maior, e o 1º lugar leva mais destaque ainda: quando a pessoa tem **capa** no perfil, a capa aparece como fundo do cartão dela. É a mesma imagem descrita no capítulo 8; o ranking não cria nada, ele mostra o que o perfil tem.

O que alimenta cada coluna:

| Coluna | De onde vem |
| --- | --- |
| **Tarefas concluídas** | tarefas aprovadas, não as entregues para revisão |
| **Pontos** | o placar do mês corrente: pontos creditados pelas aprovações, menos as penalidades de atraso. A loja não entra aqui — ela cobra moedas |

::: nota titulo="O placar fecha no dia 1"
O **Pontos** do ranking é o mês corrente. No dia 1, às 00:00 (fuso do laboratório), o sistema
fecha o mês: o número e a contagem de tarefas daquele mês vão para o histórico da pessoa —
inclusive quando são negativos — e o placar recomeça em zero. Antes o número nunca zerava; hoje
o ranking mostra o mês em curso, e o mês encerrado fica no histórico da pessoa.
O fechamento não é botão nem rota: é a agenda do sistema, e reexecutá-lo não duplica o mês.
:::

## Distintivos

Além dos dois saldos, o sistema concede **distintivos** — marcas de conquista, agrupadas por categoria. Quem tem a permissão de gerenciar distintivos cria e edita os modelos no Painel Administrativo; as pessoas os recebem e os veem no próprio perfil.
