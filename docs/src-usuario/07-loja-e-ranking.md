# Loja, pontos e ranking

Pontos são a moeda interna do sistema. Eles vêm das tarefas aprovadas e são gastos nas recompensas da loja. Horas não compram nada: horas medem trabalho, pontos medem entrega.

## A loja

A **Loja de Recompensas** tem duas abas: **Recompensas**, com o que está disponível, e **Minhas Compras**, com o que você já pediu.

```foto loja-participante titulo="A Loja de Recompensas"
Cada recompensa mostra o custo em pontos. Quando os pontos não cobrem o custo, o botão aparece como **Pontos insuficientes** e não responde ao clique.
```

## Resgatar uma recompensa

1. Abra **Loja** e fique na aba **Recompensas**.
2. Abra a recompensa desejada e confirme o resgate.
3. O pedido entra como **pendente**: os pontos são reservados, mas a recompensa ainda não é sua.

Uma compra pendente pode ser **aprovada** ou **rejeitada** por quem gerencia a loja. Rejeição devolve os pontos. Compra aprovada pode ser **completada**; compra completada não pode ser cancelada.

```foto loja-minhas-compras titulo="A aba Minhas Compras"
A aba mostra cada pedido e em que estágio ele está.
```

::: limite titulo="Recompensa indisponível"
O sistema recusa resgate de recompensa fora de estoque ou marcada como indisponível, com as mensagens *"Esta recompensa está fora de estoque"* e *"Esta recompensa não está disponível"*.
:::

## Gerenciar a loja

Quem tem a permissão de gerenciar recompensas — **Coordenador**, **Gerente** e **Laboratorista** — encontra em **Gerenciar Recompensas** três abas: **Recompensas**, **Solicitações Pendentes** e **Histórico**.

Na aba **Recompensas**, a tabela tem as colunas **Nome**, **Descrição**, **Pontos**, **Status** e **Ações**, e o botão **Nova Recompensa** abre o diálogo com **Nome da Recompensa**, **Descrição**, **Pontos Necessários** e a marca **Disponível para Resgate**.

```foto dialogo-nova-recompensa titulo="O diálogo Nova Recompensa"
O preço é um número não negativo; o preço zero existe e é válido.
```

Na aba **Solicitações Pendentes**, a tabela **Usuário**, **Recompensa**, **Pontos**, **Data** e **Ações** é onde os pedidos são aprovados ou rejeitados.

```foto loja-solicitacoes titulo="A aba Solicitações Pendentes"
Aprovar confirma o resgate; rejeitar devolve os pontos à pessoa.
```

```foto loja-gerenciar titulo="A tela Gerenciar Recompensas, na aba Recompensas"
É aqui que o catálogo é criado, ajustado e retirado de circulação.
```

## O ranking

O **Ranking** ordena as pessoas pelo que produziram. A tela traz o **Quadro de Lideranca** e a **Classificacao completa**, com as colunas **Posicao**, **Usuario**, **Projetos**, **Tarefas concluidas** e **Pontos**.

```foto ranking-participante titulo="O ranking, na classificação completa"
A classificação é visível para qualquer pessoa autenticada.
```

O que alimenta cada coluna:

| Coluna | De onde vem |
| --- | --- |
| **Projetos** | projetos em que a pessoa participou |
| **Tarefas concluidas** | tarefas aprovadas, não as entregues para revisão |
| **Pontos** | pontos creditados pelas aprovações, menos as penalidades de atraso e os gastos já completados |

## Distintivos

Além dos pontos, o sistema concede **distintivos** — marcas de conquista, agrupadas por categoria. Quem tem a permissão de gerenciar distintivos cria e edita os modelos no Painel Administrativo; as pessoas os recebem e os veem no próprio perfil.
