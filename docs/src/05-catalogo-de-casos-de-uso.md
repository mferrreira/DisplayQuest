# Catálogo de casos de uso

## Como ler os diagramas

Os diagramas deste capítulo seguem a notação de casos de uso. O retângulo tracejado é a
fronteira do sistema: tudo que está dentro dela é responsabilidade do DisplayQuest, e tudo
que está fora pertence a outro sistema ou a um ator. Os elipsos nomeiam comportamento
observável do ponto de vista de quem executa, e não implementação.

Três tipos de relação aparecem entre casos de uso:

| Relação | Significado |
| --- | --- |
| `<<inclui>>` | O caso de uso base sempre executa o caso de uso incluído |
| `<<extensão>>` | O caso de uso incluído só é executado sob uma condição do caso de uso base |
| Associação com ator | O ator participa do caso de uso |

## Panorama

O diagrama de panorama apresenta os sete blocos funcionais do sistema e quem participa de
cada um. Ele serve como índice do capítulo.

```figure uc-panorama titulo="Panorama dos casos de uso do DisplayQuest, organizado nos sete blocos funcionais"
O diagrama mostra a fronteira do sistema e seus atores. Cada ator pode participar de
casos de uso em mais de um bloco, e é essa sobreposição que expressa o caráter
colaborativo da ferramenta: a mesma pessoa pode registrar tempo, trabalhar em tarefa e
participar da operação do laboratório.

A movimentação de tarefa no quadro é a operação de maior frequência, e por isso recebe
nota própria: em tarefas públicas o usuário apenas altera o próprio progresso, enquanto
em tarefas delegadas apenas quem está atribuído ou quem administra o projeto consegue
movimentá-la.
```

## Conta e acesso

Este bloco cobre o ciclo de vida da conta, do cadastro à gestão, além do perfil e do
avatar. É o bloco que estabelece a regra de que nenhuma conta tem acesso antes de ser
aprovada.

```figure uc-conta-acesso titulo="Casos de uso do bloco Conta e acesso"
A aprovação de cadastro é uma extensão do caso de criação de conta: a criação deixa a
conta em situação pendente, e a aprovação é o passo que a libera. Recusar e suspender
complementam o par sem repetir a semântica de exclusão de usuário.

A troca de senha e a gestão de papéis concentram a autoridade administrativa do
sistema, e por isso ficam restritas a coordenador e gerente.
```

## Projetos e participação

O projeto é a unidade de agrupamento do trabalho. Além do seu ciclo de vida, o bloco
cuida da composição de pessoas e da definição de liderança.

```figure uc-projetos titulo="Casos de uso do bloco Projetos e participação"
A liderança é uma relação de cardinalidade limitada em ambas as direções: um projeto tem
no máximo um líder, e uma pessoa lidera no máximo um projeto. A troca de liderança é
recusada quando violaria qualquer uma das duas condições.

Projetos concluídos não podem ser excluídos; o encerramento normal é o arquivamento ou a
movimentação para espera. A regra existe porque a exclusão destruiria o histórico de
sessões e de relatórios associado ao projeto.
```

## Tarefas e revisão

O quadro de tarefas é a interface mais usada do sistema. O bloco abrange desde a criação
até a decisão final sobre a entrega.

```figure uc-tarefas titulo="Casos de uso do bloco Tarefas e fluxo de revisão"
O fluxo de uma tarefa percorre quatro estados: a fazer, em andamento, em revisão e
concluída, com uma quinta situação de retorno para ajuste quando a entrega é recusada.

A aprovação é sempre ato de outra pessoa. O solicitante da revisão não aprova a própria
entrega, salvo se exercer papel administrativo com autoridade sobre a totalidade das
tarefas — a exceção está registrada como limite no capítulo 7.
```

## Trabalho, horas e relatórios

Este bloco implementa o registro de tempo, que é a espinha dorsal do sistema, e os
relatórios derivados dele.

```figure uc-trabalho-relatorios titulo="Casos de uso do bloco Trabalho, horas e relatórios"
A finalização de sessão é autorizada pelo servidor: horário e duração são calculados no
back-end, e o valor enviado pelo cliente serve apenas como gatilho. A sessão pode
carregar as tarefas concluídas na mesma chamada, e nesse caso a award de pontos ocorre
na sequência.

O desconto de horas é uma operação administrativa: existe para corrigir o registro, e
por isso é restrito a quem tem autoridade sobre as sessões.
```

## Operação do laboratório

O bloco reúne a escala de plantão, os eventos, os avisos, as issues e a grade de
horários.

```figure uc-laboratorio titulo="Casos de uso do bloco Operação do laboratório"
Apenas uma responsabilidade pode estar ativa por vez no laboratório, o que torna a
escala visível e inequívoca para quem chegar ao local.

A grade de horários tem leitura aberta: qualquer conta autenticada consulta a grade
inteira, e a escrita é restrita a quem administra usuários. A decisão é deliberada: a
disponibilidade de horário é informação que o laboratório precisa compartilhar, enquanto
a sua alteração é decisão administrativa.
```

## Engajamento e comunicação

O último bloco reúne as mecânicas de reconhecimento e os canais de comunicação interna.

```figure uc-engajamento titulo="Casos de uso do bloco Engajamento e comunicação"
O resgate de uma recompensa debita pontos na mesma transação que grava a compra, e
congela o nome e o preço do item para que uma alteração futura de catálogo não reescreva
o histórico do que foi pago.

Comunicados são entregues no painel interno para todas as contas ativas. O sistema não
dispara correio eletrônico, e a notificação existe apenas dentro da aplicação.
```

::: nota titulo="Cobertura funcional e a ordem dos capítulos"
A cobertura funcional dos casos de uso nos sete diagramas corresponde aos sete blocos
funcionais. O capítulo 6 detalha três desses casos — aprovação de cadastro, aprovação de
tarefa e conclusão de sessão — porque são os que concentram as regras de maior densidade e,
portanto, os de maior risco de interpretação equivocada.
:::
