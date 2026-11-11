# Loja, pontos e ranking

Pontos são a moeda interna do sistema. Eles vêm das tarefas aprovadas e são gastos nas recompensas da loja. Horas não compram nada: horas medem trabalho, pontos medem entrega.

Cada tarefa aprovada rende 10 pontos — mais 5 por subtask concluída, quando a tarefa tem etapas — multiplicado por 1,5 quando a entrega acontece pelo menos 2 dias antes do prazo, e com 10 pontos descontados por dia de atraso quando acontece depois. O valor não é escolhido na criação da tarefa: é o sistema que calcula.

## A loja

A **Loja de Recompensas** tem duas abas: **Recompensas**, com o que está disponível, e **Minhas Compras**, com o que você já pediu.

```foto loja-participante titulo="A Loja de Recompensas"
Cada recompensa mostra o custo em pontos. Quando os pontos não cobrem o custo, o botão aparece como **Pontos insuficientes** e não responde ao clique.
```

Com uma passiva de bônus equipada, a recompensa mostra o preço duas vezes: o preço efetivo, em destaque, e o preço da tabela riscado, escrito `de 100`. O **Resgatar** obedece o preço efetivo — e **Pontos insuficientes** é a comparação com ele. O resgate reserva os pontos do preço efetivo.

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

Quem gerencia recompensas — **Coordenador**, **Gerente** e **Laboratorista** — encontra na mesma Loja duas abas a mais: **Aprovações** e **Gerenciar**.

A aba **Gerenciar** é o catálogo. A tabela tem as colunas **Nome**, **Descrição**, **Preço (Pontos)**, **Status** e **Ações**, e o botão **Adicionar Produto** abre o diálogo **Adicionar Nova Recompensa**, com **Nome da Recompensa**, **Descrição**, **Preço em Pontos** e a marca **Disponível para compra**.

```foto loja-gerenciar titulo="A aba Gerenciar, com o catálogo de recompensas"
É aqui que o catálogo é criado, ajustado e retirado de circulação.
```

```foto dialogo-nova-recompensa titulo="O diálogo Adicionar Nova Recompensa"
O preço é um número não negativo; o preço zero existe e é válido.
```

A aba **Aprovações** é a fila de pedidos pendentes: cada linha traz a recompensa pedida, quem pediu e o custo em pontos, e é ali que o pedido é aprovado ou rejeitado.

```foto loja-solicitacoes titulo="A aba Aprovações"
Aprovar confirma o resgate; rejeitar devolve os pontos à pessoa.
```

## O ranking

O **Quadro de Liderança** tem três abas: **Pessoas**, **Projetos** e **Temporada** — a de **Pessoas** abre por primeira. Na aba **Pessoas** está a classificação que ordena as pessoas pelo que produziram, com as colunas **Posição**, **Usuário**, **Tarefas concluídas** e **Pontos**; na aba **Projetos** está o **leaderboard de projetos** por pontos; na aba **Temporada** está a classificação anual.

Na aba **Projetos**, o painel ordena os projetos pela pontuação: o campeão em bloco destacado, com a capa, o **logo em círculo**, o período, a barra de andamento, a pilha de avatares dos membros, a contagem de membros e o líder; o 2º lugar com a medalha **prata** e o 3º com a medalha **bronze**, cada um com contagem de membros e barra; e a classificação completa a partir do 4º, em tabela com Posição, Projeto, Progresso, Membros e Pontos. Os projetos em que você participa aparecem com o rótulo **Seu projeto**. O seletor do painel escolhe o recorte, e **Todos os projetos** reúne o conjunto todo; escolher um projeto no painel abre a página dedicada dele. Cada peça do leaderboard abre o detalhe do projeto.

```foto dashboard-projetos titulo="A aba Projetos do Quadro de Liderança, só com o leaderboard e o seletor"
Barra de andamento é o tempo decorrido quando o projeto tem início e término; sem período, a barra segue a proporção de tarefas concluídas. O recorte do painel independe dos filtros da tela Projetos.
```

```foto ranking-participante titulo="A aba Pessoas: a classificação completa"
A classificação é visível para qualquer pessoa autenticada.
```

Na aba **Pessoas**, os três primeiros têm destaque maior e avatar maior, e o 1º lugar leva mais destaque ainda: quando a pessoa tem **capa** no perfil, a capa aparece como fundo do cartão dela. É a mesma imagem descrita no capítulo 8; o ranking não cria nada, ele mostra o que o perfil tem.

Na aba **Pessoas**, o quadro mostra o **placar do mês**, separado dos pontos que você guarda para resgatar recompensas. A cada mês, os pontos creditados entram nas duas contagens. Comprar na loja altera o saldo disponível, mas não muda o placar do mês. A **Classificação completa** continua usando os pontos acumulados e as tarefas concluídas.

No seletor ao lado do título, escolha um mês já fechado para consultar o resultado daquele período. O quadro informa o mês e diz que o valor e a posição foram congelados no fechamento; consultar um mês anterior não recalcula nem altera o resultado. O cartão do campeão do mês fechado usa, como fundo, a capa da conta que ficou em 1º naquele mês.

```foto quadro-lideranca-mes-fechado titulo="O Quadro de Liderança em um mês fechado"
O seletor identifica o período e o aviso explica que valor e posição estão congelados.
```

## A temporada

A **Temporada** é o conjunto dos 12 quadros de liderança do ano. A aba **Temporada** tem um seletor de ano, com **temporada em curso** e as temporadas já fechadas. Em curso, o pódio e a tabela ordenam as pessoas pelo **saldo de pontos** que elas têm — o número que a coluna **Pontos da temporada** mostra é o saldo acumulado da pessoa, não o placar de um mês. O 1º lugar tem o mesmo cartão destacado do quadro mensal, com a capa do perfil como fundo.

Ao virada de ano, a temporada do ano que terminou fecha: o quadro do ano congela o saldo de cada pessoa em valor e posição, como o fechamento de mês congela o placar, e a contagem de pontos recomeça do zero para todos. O pódio da temporada fechada fica consultável no seletor de anos, e o aviso diz que valor e posição estão congelados.

```foto ranking-temporada titulo="A aba Temporada, com o pódio pelo saldo acumulado e o seletor de ano"
A coluna da aba Temporada é o saldo da pessoa; a coluna da aba Pessoas é o placar do mês. São duas contagens diferentes na mesma tela.
```

| Coluna | De onde vem |
| --- | --- |
| **Tarefas concluídas** | tarefas aprovadas, não as entregues para revisão |
| **Pontos** | pontos do placar mensal creditados pelas aprovações, menos penalidades e correções do painel; compras da loja não alteram esse placar |
| **Pontos da temporada** | saldo de pontos da pessoa — a contagem que a temporada ordena |

## Distintivos

Além dos pontos, o sistema concede **distintivos** — marcas de conquista, agrupadas por categoria. Quem tem a permissão de gerenciar distintivos cria e edita os modelos no Painel Administrativo; as pessoas os recebem e os veem no próprio perfil.

O catálogo traz 50 distintivos. Cada um é concedido quando a pessoa atinge as condições dele — tarefas concluídas, sessões, horas, semanas, dias seguidos, compras, atestados, issues resolvidos, eventos de laboratório, subtasks, meses no quadro. A concessão acontece no episódio: uma compra na loja, um atestado gerado, um issue resolvido, um mês fechado no quadro — a pessoa recebe o distintivo ali, sem precisar de tarefa.

Alguns distintivos têm **passiva** — um efeito permanente que a pessoa escolhe ativar: **+X% pontos** nas premiações, **−X% de penalidade**, e, nas de bônus, desconto no preço da loja. Os botões **Equipar** e **Desequipar**, o contador **Equipadas (n/3)** e as regras de ativação estão descritos no capítulo 8, no bloco **Badges equipáveis** da aba Configurações, em modo de edição.

Os distintivos ainda não conquistados não aparecem no perfil — o bloco Badges lista só os que a pessoa possui. A condição de cada distintivo é medida no episódio: quando o número chega ao alvo, o distintivo é concedido no episódio seguinte.
