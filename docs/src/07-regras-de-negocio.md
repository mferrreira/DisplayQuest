# Regras de negócio

## Como as regras estão organizadas

As regras de negócio do sistema residem no núcleo de domínio, em funções puras. Elas não
dependem de banco de dados, deORM, de framework web nem de relógio: recebem o instante
atual como parâmetro e devolvem um resultado ou lançam um erro tipado. Essa forma não é
estilística — é o que permite verificar cada regra por teste sem levantar qualquer
infraestrutura.

As regras abaixo estão agrupadas por área. Cada uma indica o requisito do capítulo 4 que
a realiza.

## RB · Identidade e acesso

| Id | Regra | Realiza |
| --- | --- | --- |
| RB-01 | Uma conta recién-criada fica pendente e não autentica até ser aprovada | RF-01 |
| RB-02 | Recusar uma conta remove o registro, em vez de alterar seu estado | RF-01 |
| RB-03 | Suspender preserva o registro e o histórico, mas bloqueia o acesso | RF-01 |
| RB-04 | A autorização é determinada exclusivamente pelas matrizes do domínio | RF-02 |
| RB-05 | O ator é derivado da sessão; nenhum papel pode ser declarado pelo cliente | RF-02 |
| RB-06 | Quem administra usuários pode agir sobre contas de terceiros; os demais, apenas sobre as próprias | RF-02 |

## RB · Projetos e liderança

| Id | Regra | Realiza |
| --- | --- | --- |
| RB-07 | Uma pessoa lidera no máximo um projeto por vez | RF-03 |
| RB-08 | Um projeto tem no máximo um líder, e a troca para alguém que já lidera outro projeto é recusada | RF-03 |
| RB-09 | Remover um líder que é o único membro com autoridade de projeto deixa o projeto sem gerente, e a operação é recusada | RF-03 |
| RB-10 | Projetos concluídos não podem ser excluídos; o encerramento é por arquivamento ou espera | RF-03 |
| RB-11 | A participação é única por par projeto e pessoa | RF-03 |

## RB · Tarefas e revisão

| Id | Regra | Realiza |
| --- | --- | --- |
| RB-12 | Só é possível aprovar uma tarefa que esteja em revisão | RF-04 |
| RB-13 | Quem administra usuários aprova qualquer tarefa | RF-04 |
| RB-14 | O gerente de projeto aprova apenas as tarefas do projeto que lidera | RF-04 |
| RB-15 | Ninguém aprova a própria entrega, exceto quem administra usuários | RF-04 |
| RB-16 | Tarefas concluídas exigem que a entrega esteja em revisão | RF-04 |
| RB-17 | O contador de tarefas concluídas sobe em aprovação que não seja pública nem global, mesmo sem pontos | RF-04 |
| RB-18 | O award de pontos é creditado na aprovação de toda tarefa, e a pontuação vale 10 por padrão | RF-04, RF-09 |
| RB-19 | O responsável principal é reescrito pelo primeiro elemento da lista de responsáveis, e é esse valor que é persistido | RF-04 |
| RB-66 | A pontuação de uma tarefa é fixa em 10 e não é informada pelo cliente na criação nem na edição | RF-04 |
| RB-67 | A entrega antes do prazo multiplica a pontuação por 1,5, resultando em 15 pontos | RF-09 |
| RB-68 | A entrega sem prazo, ou no próprio dia do prazo, rende a pontuação cheia | RF-09 |
| RB-69 | O atraso é contado em dias de calendário no fuso do laboratório, e cada dia desconta a pontuação da tarefa | RF-09 |
| RB-70 | O award resultante não tem piso: tarefa vencida rende valor negativo, que reduz o saldo | RF-09 |

## RB · Tempo e sessões

| Id | Regra | Realiza |
| --- | --- | --- |
| RB-20 | A duração de uma sessão é calculada pelo servidor a partir do instante de início e do instante efetiva | RF-05 |
| RB-21 | Na atualização de sessão, o instante e a duração declarados pelo cliente servem como gatilho, e o valor computado é sempre o do servidor | RF-05 |
| RB-22 | Na conclusão de sessão, o instante declarado pelo cliente é aceito | RF-05 |
| RB-23 | A pausa é carimbada no instante da última pausa programada atravessada, e não no instante da leitura | RF-05 |
| RB-24 | Um trecho ativo é limitado a nove horas, mesmo que a sessão continue ativa | RF-05 |
| RB-25 | Concluir uma sessão já concluída ou pausada não recalcula a duração | RF-05 |
| RB-26 | Pausar parte de um horário programado ocorre automaticamente, nos quatro horários de pausa | RF-05 |
| RB-27 | A varredura noturna converte em pausada toda sessão ativa remanescente | RF-05 |
| RB-28 | Tarefas só podem ser vinculadas a uma sessão já concluída ou que esteja sendo concluída | RF-05 |
| RB-29 | Toda tarefa vinculada deve estar concluída, ser atribuída ao ator e pertencer ao projeto da sessão | RF-05 |
| RB-30 | Concluir uma sessão sempre produz exatamente um registro diário, localizado pela sessão | RF-05 |
| RB-31 | A semana é consolidada à segunda-feira, às zero hora, no fuso do laboratório | RF-05 |

::: nota titulo="RB-21 e RB-22 parecem contraditórias"
Não são. São dois casos de uso diferentes com contratos diferentes. A atualização de
sessão trata de pausa e retomada, onde a autoridade do servidor precisa prevalecer sobre o
relógio do cliente para que o teto de trecho não possa ser contornado. A conclusão trata
de encerramento, onde o instante declarado pelo cliente é preservado para permitir registrar
o término real de um trabalho feito fora do navegador aberto. A distinção é uma decisão de
produto, e está congelada por teste.
:::

## RB · Registros, relatórios e anexos

| Id | Regra | Realiza |
| --- | --- | --- |
| RB-32 | Um anexo só é servido a quem pode ler o relatório que o contém | RF-06, RNF-01 |
| RB-33 | O anexo é gravado fora da pasta servida estaticamente | RNF-01 |
| RB-34 | O anexo é validado por conteúdo, e não pela extensão declarada | RNF-01 |
| RB-35 | Existe um teto de tamanho por anexo, e a validação ocorre antes da gravação | RNF-01 |
| RB-36 | Um relatório de projeto é único por projeto, período, início e autor | RF-06 |
| RB-37 | Ao remover um relatório, seus anexos são removidos junto | RF-06 |
| RB-38 | Arquivos órfãos são eliminados por varredura preguiçosa na leitura | RNF-01, RNF-06 |

## RB · Laboratório

| Id | Regra | Realiza |
| --- | --- | --- |
| RB-39 | Apenas uma responsabilidade pode estar ativa por vez | RF-07 |
| RB-40 | Apenas coordenador e laboratorista assumem plantão | RF-07 |
| RB-41 | O tempo pausado é acumulado em milissegundos, e não em texto | RF-07 |
| RB-42 | A grade de horários é lida por qualquer conta autenticada | RF-08 |
| RB-43 | A escrita da grade de horários, inclusive sobre a de terceiros, exige a permissão de gestão de usuários | RF-08 |
| RB-44 | Uma issue resolvida registra o instante da resolução | RF-07 |
| RB-45 | Uma issue fechada só pode ser reaberta se já estiver fechada; a reabertura limpa o instante de resolução | RF-07 |
| RB-46 | Uma issue fechada não pode ser resolvida, atribuída nem iniciada | RF-07 |
| RB-47 | Atribuir uma issue força o estado em andamento, qualquer que fosse o estado anterior | RF-07 |
| RB-48 | Retirar a atribuição força o estado aberto, qualquer que fosse o estado anterior | RF-07 |
| RB-49 | A descrição da resolução é validada e em seguida descartada, por não haver coluna que a receba | RF-07 |
| RB-50 | Na consulta de issues, os filtros são mutuamente exclusivos e seguem a precedência estado, prioridade, categoria, relatante, atribuída e texto | RF-07 |

## RB · Engajamento

| Id | Regra | Realiza |
| --- | --- | --- |
| RB-51 | O resgate debita pontos e grava a compra na mesma transação | RF-09 |
| RB-52 | Nome e preço do item são congelados no momento da compra | RF-09 |
| RB-53 | Apenas compras pendentes podem ser aprovadas | RF-09 |
| RB-54 | Apenas compras aprovadas podem ser concluídas na entrega | RF-09 |
| RB-55 | A award é idempotente pela descrição canônica do lançamento | RF-09 |
| RB-56 | Uma award já concedida devolve zero pontos e a progressão vigente, nunca zerada | RF-09 |
| RB-57 | Os distintivos são avaliados depois do crédito, e o resultado da avaliação não altera a award | RF-09 |
| RB-58 | Comunicados são entregues apenas a contas ativas | RF-10 |

## RB · Comunicação

| Id | Regra | Realiza |
| --- | --- | --- |
| RB-59 | Toda notificação pertence a uma pessoa ou a todas as contas ativas | RF-10 |
| RB-60 | O sistema não emite correio eletrônico; a notificação existe apenas na aplicação | RF-10 |
| RB-61 | Marcar uma notificação como lida registra o instante da leitura | RF-10 |

## Regras de apresentação

As regras a seguir não alteram o estado do sistema, mas condicionam o que a pessoa vê e,
por isso, estão registradas com o mesmo cuidado.

| Id | Regra |
| --- | --- |
| RB-62 | O quadro usa tema escuro, com colunas em cor sólida por estado, sem degradê |
| RB-63 | O painel de notificações abre em popover e fecha ao clicar fora e ao pressionar a tecla de escape |
| RB-64 | O contraste entre texto e fundo das colunas do quadro é verificado para manter legibilidade |
| RB-65 | O avatar é apresentado em formato quadrado, e o arquivo gravado é WebP |

::: legado titulo="Comportamentos de issue preservados como contrato"
Quatro comportamentos de issue contrariam a intuição e foram deliberadamente mantidos
por serem observáveis por quem usa o sistema.

A atribuição força o estado em andamento, e a retirada da atribuição força o estado
aberto, independentemente do estado anterior. O efeito é que uma issue resolvida ou
fechada volta a ficar aberta quando alguém deixa de ser responsável por ela.

A descrição da resolução é validada e em seguida descartada: o campo é obrigatório
quando informado, mas não existe coluna que o armazene.

A criação de issue sempre resulta em estado aberto, mesmo que outra parte do fluxo peça
em andamento.

Os filtros da consulta são mutuamente exclusivos, e o texto de busca é aplicado em
memória sobre o conjunto já filtrado.
:::

::: limite titulo="Onde a regra e a implementação divergem"
A regra RB-09 prescreve que a remoção de um líder único seja recusada. A implementação
correspondente recusa a operação, mas o enunciado original previa uma transferência
automática de liderança. O comportamento implementado é o que está descrito, e a
divergência é registrada aqui como pendência de produto, não como defeito.
:::
