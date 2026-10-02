# Modelo conceitual

## Critério de modelagem

O modelo conceitual descreve os conceitos do domínio e suas relações, sem se comprometer
com a forma de armazenamento. Um conceito vira uma **entidade** quando tem identidade
própria e ciclo de vida — um usuário, um projeto, uma tarefa, uma sessão. Vira um **objeto
de valor** ou um **vínculo** quando existe apenas para registrar uma relação ou uma
qualificação — uma participação, um vínculo entre sessão e tarefa, uma concessão de
distintivo.

O modelo está dividido em sete diagramas por área de responsabilidade. A divisão não
implica independência: há entidades que aparecem em mais de um diagrama, e essas
intersecções são a costura do domínio.

Os nomes de classe estão em português, porque este é o vocabulário do domínio do
laboratório. Os nomes de atributo mantêm a forma do campo persistido onde a diferença seria
apenas estilística, para que o modelo permaneça rastreável até o capítulo 11.

## Identidade e acesso

```figure cl-identidade titulo="Modelo conceitual da identidade, do acesso e do perfil"
O usuário é a raiz do modelo. Ele concentra identidade, estado de conta, papéis globais e
os agregados de reconhecimento — distintivos, notificações e trilha de auditoria.

A situação da conta é um enumerador com quatro valores: pendente, ativa, recusada e
suspensa. A presença de recusada no enumerador é uma inconsistência conhecida: como a
recusa remove o registro, nenhuma linha chega a exibir esse estado. O valor permanece
declarado por herança do modelo original.

O distintivo tem critérios armazenados como estrutura livre e um método que os avalia
contra as estatísticas da pessoa. Essa separação permite criar condecorações novas sem
alterar o código: o critério é dado, e não comportamento compilado.
```

## Projetos

```figure cl-projeto titulo="Modelo conceitual do projeto, da participação e dos relatórios"
O projeto agrega três coisas: pessoas, trabalho e relatórios. A participação é o vínculo
que qualifica uma pessoa dentro de um projeto, com papéis próprios que não se confundem com
os papéis globais.

O relatório de projeto tem período tipado — semanal, quinzenal, mensal, semestral e anual —
e é único por combinação de projeto, período, início e autor. A unicidade é uma decisão de
produto: ela impede que duas pessoas produzam relatórios concorrentes para o mesmo período
do mesmo projeto.

O anexo é um objeto de valor do relatório. Ele não tem existência independente: removido o
relatório, removem-se os anexos.
```

## Tarefas

```figure cl-tarefa titulo="Modelo conceitual da tarefa, do responsável e do progresso individual"
A tarefa ilustra a decisão de modelagem mais consequente do domínio. Há duas noções de
responsabilidade convivendo: o responsável principal, um único identificador, e a lista de
responsáveis, que admite várias pessoas. E há um terceiro conceito, o progresso individual,
que registra o estado da tarefa para cada pessoa.

A separação resolve um problema real: várias pessoas podem trabalhar na mesma tarefa, e
cada uma tem o próprio avanço. Sem o progresso individual, o quadro não conseguiria
representar duas pessoas na mesma tarefa sem que uma sobrescrevesse o estado da outra.

A pontuação é um inteiro não negativo na tarefa, mas o cálculo de pontos devidos admite
resultado negativo, porque a multa por atraso é proporcional aos dias de atraso. A
consequência está registrada como limite no capítulo 7.
```

## Trabalho, horas e produtividade

```figure cl-trabalho titulo="Modelo conceitual da sessão de trabalho e dos registros dela derivados"
A sessão de trabalho é o conceito que dá sentido ao sistema. Ela tem início, fim, duração e
situação, e pode estar associada a um projeto. O vínculo entre sessão e tarefa é um objeto
de valor: ele existe apenas para registrar quais tarefas foram concluídas naquela sessão.

O log diário é derivado da sessão e mantém com ela uma relação de unicidade: uma sessão
produz no máximo um log. Essa restrição é o que torna seguro o gesto de concluir uma sessão
repetidamente, porque a gravação do log é uma operação de inserção ou atualização, e não de
duplicação.

O relatório semanal e o histórico de horas são projeções consolidadas. Eles não têm ciclo de
vida independente do trabalho que resumem.
```

## Operação do laboratório

```figure cl-laboratorio titulo="Modelo conceitual da operação do laboratório"
A responsabilidade representa o plantão. Ela guarda o tempo pausado acumulado em
milissegundos e o carimbo da pausa como texto em formato de data — a mesma mistura de
representações que aparece na sessão de trabalho e que será discutida no capítulo 12.

A issue tem o único estado tipado por enumerador entre as entidades de fluxo do sistema.
Ela registra o relatante e o responsável, com o instante de resolução gravado na transição.

As duas grades de horários são conceitos distintos e não devem ser confundidos. A grade do
laboratório descreve o funcionamento do espaço; a grade pessoal descreve a disponibilidade
de uma pessoa. A primeira orienta, a segunda declara.
```

## Engajamento

```figure cl-engajamento titulo="Modelo conceitual do engajamento, da loja e da progressão"
O engajamento é composto por quatro peças que operam em conjunto. A recompensa é o item de
catálogo; a compra é o pedido de resgate, com dados congelados; o distintivo é a
condecoração com critérios avaliáveis; e a premiação é o registro de pontos concedidos.

A premiação merece atenção. Ela não é uma entidade armazenada como tal: é o conceito que
descreve a concessão de pontos a partir de uma origem — sessão concluída, tarefa concluída
ou ajuste manual. A origem e o identificador da origem formam a chave da idempotência, e é
por isso que repetir um evento não credita duas vezes.

A progressão é derivada da soma de experiências. Ela tem nível e elo calculados por função
pura, o que significa que não há estado de progressão a manter coerente: o valor é sempre
recomputável a partir dos lançamentos.
```

## Notificação e auditoria

```figure cl-auditoria titulo="Modelo conceitual da notificação e da trilha de auditoria"
A notificação é um registro dirigido a uma pessoa, com tipo de evento, conteúdo e estado de
leitura. O tipo é uma escolha fechada de oito valores, o que faz da notificação um ponto de
integração estável entre os módulos que a publicam e o módulo que a armazena.

A trilha de auditoria é deliberadamente genérica: ela guarda o tipo e o identificador da
entidade afetada, a ação, o autor, o instante e os valores anterior e posterior. Essa forma
permite auditar qualquer entidade sem que a auditoria conheça cada uma delas, ao custo de a
consulta por entidade depender de índices compostos.

O público de uma notificação é ou uma lista de identificadores, ou todas as contas ativas.
A forma escolhida preserva a distinção entre uma mensagem dirigida e um comunicado geral,
sem exigir duas tabelas.
```

::: nota titulo="Uma entidade, vários diagramas"
O usuário aparece em cinco dos sete diagramas, o projeto em três, a tarefa em três e o
distintivo em dois. Essa repetição é intencional: ela mostra o alcance de cada conceito por
área funcional, o que um diagrama único de duas dezenas de classes tornaria ilegível. A
costura entre os diagramas é feita pelas referências de identificador, e o capítulo 11
apresenta a visão consolidada.
:::
