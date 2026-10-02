# Máquinas de estado

## Por que existem tantas

O sistema registra o trabalho de pessoas ao longo do tempo, e quase todo conceito relevante
tem um ciclo de vida: uma conta nasce pendente e precisa ser aprovada; uma tarefa percorre
o quadro até ser aceita; uma sessão de trabalho é aberta, pausada e encerrada; uma compra
é solicitada, aprovada e entregue. Formalizar esse ciclo de vida como máquina de estado é
o que permite responder, sem ambiguidade, perguntas como *em que estado esta entidade
pode aceitar esta operação* e *qual é o efeito de uma transição sobre os demais campos*.

As máquinas abaixo estão agrupadas pela mesma lógica do catálogo de casos de uso. Onde o
estado é armazenado como texto livre, e não como enumerador, isso está registrado, porque a
distinção tem consequência prática na verificação de integridade.

```figure est-conta titulo="Máquina de estados da conta de usuário"
A conta nasce pendente e só alcança o estado ativo pela decisão administrativa. O
retângulo com moldura distinta marca o estado de erro: a recusa é representada como
exclusão, porque é isso que ocorre no banco — o registro deixa de existir.

Suspender e reativar formam o único ciclo reversível do agregado. A suspensão preserva o
histórico de trabalho e de reconhecimento, e por isso é o mecanismo correto para
interromper o acesso sem perder o que foi feito.
```

```figure est-projeto titulo="Máquina de estados do projeto"
O estado do projeto é uma coluna de texto com quatro valores em uso. O estado arquivado é
o encerramento normal, e o estado em espera é a pausa. Projetos concluídos permanecem
inalterados no que diz respeito à exclusão: a operação é recusada, e não há caminho que
leve um projeto concluído de volta a ativo sem intervenção direta.

A ausência de transição de retorno é deliberada. Ela garante que a conclusão de um projeto
tenha peso: uma vez concluído, o conjunto de dados que sustenta os relatórios daquele
período está fechado.
```

```figure est-tarefa titulo="Máquina de estados da tarefa, com o retorno por ajuste"
O fluxo cobre cinco estados. O retorno de em revisão para em ajuste existe para que uma
entrega recusada tenha um lugar explícito para onde voltar, em vez de retornar à origem e
apagar o trabalho de revisão já feito.

Os valores gravados são `to-do`, `in-progress`, `in-review`, `adjust` e `done`. Nomes
antigos que o banco ainda pode conter — `pending`, `completed` e `in_progress` — são
tolerados na entrada, mas não fazem parte do contrato: o sistema normaliza-os na leitura e
nunca os escreve.

A conclusão é o estado terminal. Uma tarefa concluída não retorna pelo fluxo: ela só sai
desse estado por reabertura explícita, autorizada a coordenador, gerente, laboratorista e
líder do projeto. O instante de conclusão e os pontos creditados são gravados na transição
e passam a fazer parte do histórico.
```

```figure est-sessao titulo="Máquina de estados da sessão de trabalho"
A sessão tem três estados e duas formas de encerramento. A conclusão explícita é o que o
usuário solicita; a varredura noturna é o que o sistema faz quando ninguém encerrou o
registro. Ambas produzem uma sessão que não cresce mais.

A característica central da máquina é o congelamento do tempo na pausa. Enquanto a sessão
está ativa, a duração cresce; na pausa, ela para. A pausa pode ser solicitada pelo usuário
ou produzida automaticamente quando o registro atravessa um dos quatro horários marcados.
Em ambos os casos, o instante carimbado é o da pausa, e não o instante em que o sistema
percebeu a travessia.
```

```figure est-responsabilidade titulo="Máquina de estados da responsabilidade pelo laboratório"
A responsabilidade registra o plantão pelo laboratório. A máquina repete, em menor escala,
a disciplina da sessão de trabalho: o tempo corre no estado ativo, para na pausa e deixa de
existir no encerramento.

A diferença é o escopo. O sistema admite apenas uma responsabilidade ativa por vez no
laboratório, e é essa restrição que dá sentido à pergunta cotidiana *quem está de plantão
agora*.
```

```figure est-compra titulo="Máquina de estados da compra de recompensa"
A compra é um pedido de resgate, e não uma troca instantânea. O estado pendente é o pedido
aguardando decisão; aprovada autoriza a entrega; concluída registra que a entrega ocorreu.

As guardas de aprovação e de recusa exigem o estado pendente, e a guarda de entrega exige o
estado aprovado. A guarda de cancelamento é expressa por negação — ela recusa apenas a
compra já concluída —, o que torna o cancelamento aceito a partir da pendência e da
aprovação e, formalmente, também a partir de uma compra já recusada ou cancelada, caso em
que não há reembolso a fazer.

O reembolso acompanha o estado: devolve os pontos na recusa e no cancelamento de uma compra
pendente ou aprovada, e não devolve em nenhuma outra situação.

O preço e o nome do item ficam congelados na criação da compra. O catálogo pode mudar
depois, e o histórico do pedido permanece fiel ao que foi solicitado.
```

```figure est-issue titulo="Máquina de estados da issue do laboratório"
A issue percorre quatro estados, do relato à resolução e ao fechamento. A reabertura
devolve a issue ao estado aberto e limpa o instante de resolução, o que permite que uma
ocorrência reaparecida seja tratada como um novo ciclo.

Dois comportamentos desta máquina fogem ao fluxo canônico e estão preservados como
contrato. Atribuir uma issue força o estado em andamento, e retirar a atribuição força o
estado aberto, independentemente do estado em que a issue se encontrava. O efeito prático
é que a atribuição governa o estado enquanto existe, e a sua remoção sobrepõe o estado à
situação anterior.
```

::: legado titulo="Máquinas sem representação gráfica própria"
Duas entidades têm ciclo de vida relevante mas simples demais para um diagrama dedicado.

O **log diário** não tem estado, mas tem um vínculo de unicidade: ele é único por sessão de
trabalho. Concluir uma sessão grava o log se ele não existir e atualiza o log se já
existir, de modo que a correspondência entre sessão e log é preservada indefinidamente.

A **notificação** tem o par de estados lida e não lida, com o instante de leitura gravado
na transição. O estado não tem transição de retorno: uma notificação lida pode ser
excluída, mas não volta a ser não lida.
:::

::: nota titulo="Estados como texto e estados como enumerador"
Apenas dois conceitos do sistema têm estado tipado por enumerador no banco: a issue e a
prioridade da issue. Conta, projeto, tarefa, sessão, responsabilidade e compra armazenam
o estado como texto. A consequência é que a integridade desses estados depende
inteiramente do código que escreve, e não de uma restrição do banco. As máquinas deste
capítulo são, por isso, a especificação efetiva dos valores válidos.
:::
