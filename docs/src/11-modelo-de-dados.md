# Modelo de dados

## Da modelagem conceitual à persistência

Este capítulo apresenta a materialização do modelo conceitual em um banco relacional. A
tradução preserva os conceitos, mas introduz decisões de armazenamento que não existiam no
capítulo 9: tipos de coluna, restrições de unicidade, índices e regras de remoção em
cascata.

O esquema tem vinte e cinco tabelas e cinco enumeradores. Duas dessas tabelas merecem
observação imediata, porque fogem ao padrão das demais.

A primeira é a tabela de notificações, que é a única mapeada com nome próprio e que
armazena o conteúdo variável como texto em formato de estrutura. A segunda é a trilha de
auditoria, que é deliberadamente polimórfica: ela guarda o tipo e o identificador da
entidade afetada, em vez de ter uma chave estrangeira para cada entidade auditável.

## Núcleo de identidade, projetos e tarefas

```figure er-nucleo titulo="Modelo entidade-relacionamento do núcleo: pessoas, projetos, tarefas e responsáveis"
O diagrama mostra as entidades do núcleo e suas cardinalidades. O usuário é o eixo do
modelo: quase toda tabela se liga a ele.

Três relações merecem atenção. A relação entre usuário e projeto tem dois caminhos: um
pela criação e outro pela liderança, e é a existência do segundo caminho que sustenta a
regra de liderança única. A relação entre tarefa e usuário também tem dois caminhos: o
responsável principal e a lista de responsáveis por associação. E a progressão individual
existe como tabela própria, com unicidade por par tarefa e pessoa.

A coluna de data de criação do projeto é texto, e não um tipo de data. A consequência é que
comparações e ordenações por data dependem do formato do texto, e não do banco. A
divergência é registrada como herança do modelo original.
```

## Operação do laboratório e engajamento

```figure er-laboratorio-engajamento titulo="Modelo entidade-relacionamento da operação do laboratório e do engajamento"
O diagrama reúne as entidades que registram a operação cotidiana e as que produzem o
reconhecimento. A sessão de trabalho ocupa o centro: ela se liga ao usuário, ao projeto e,
por associação, às tarefas concluídas.

A compra guarda uma cópia do nome e do preço do item. Essa duplicação é intencional e é a
razão pela qual o histórico de resgates permanece íntegro quando o catálogo muda.

A issue é a única entidade de fluxo com estado e prioridade tipados por enumerador. As
demais máquinas de estado descritas no capítulo 8 vivem em colunas de texto, o que
transfere ao código toda a responsabilidade pela integridade dos valores.

A responsabilidade pelo laboratório acumula o tempo pausado em milissegundos e guarda o
carimbo da pausa como texto. É a mesma disciplina da sessão de trabalho, com a mesma
mistura de representações.
```

## Restrições de integridade

As restrições abaixo são garantidas pelo banco, e não apenas pelo código. A distinção
importa: uma restrição de banco não pode ser contornada por um caminho de escrita novo.

| Tabela | Restrição | Efeito |
| --- | --- | --- |
| `users` | Endereço de correio único | Impede duas contas com o mesmo endereço |
| `project_members` | Par projeto e usuário único | Impede participação duplicada |
| `task_assignees` | Par tarefa e usuário único | Impede responsável duplicado |
| `task_user_progress` | Par tarefa e usuário único | Impede dois progressos para a mesma pessoa e tarefa |
| `work_session_tasks` | Par sessão e tarefa único | Impede vínculo duplicado |
| `daily_logs` | Sessão única | Garante um registro diário por sessão |
| `project_reports` | Projeto, período, início e autor únicos | Impede relatórios concorrentes para o mesmo período |
| `user_badges` | Par usuário e distintivo único | Impede concessão duplicada |

As remoções em cascata seguem a dependência de existência. Remover uma pessoa remove suas
participações em projetos, atribuições de tarefa, progressos individuais, notificações,
sessões de trabalho, histórico de horas e concessões de distintivo; remover uma tarefa
remove suas atribuições, progressos e vínculos com sessões; remover um relatório remove
seus anexos; remover um distintivo remove as concessões correspondentes.

Nem toda remoção é em cascata. O histórico de uma pessoa sobrevive à sua saída em diversas
tabelas: a trilha de auditoria, as compras, os registros diários sem sessão, as
responsabilidades de plantão, os eventos de laboratório, os relatórios semanais, os
relatórios de projeto de sua autoria, os horários declarados e as issues que relatou ou
resolveu permanecem. A regra é deliberada: o que documenta a operação do laboratório não
pode desaparecer junto com a conta de quem o produziu.

## Índices

Os índices declarados refletem os padrões de consulta observados. As entidades de
associação têm índice pela chave estrangeira dos dois lados, o que sustenta tanto a leitura
por tarefa quanto a leitura por pessoa. A progressão individual tem um índice adicional por
par tarefa e estado, que atende à consulta do quadro.

A trilha de auditoria tem quatro índices: pela entidade afetada, pelo autor, pelo instante e
pela ação. É o maior número de índices declarado em uma única tabela, e é proporcional ao
número de formas de consultá-la.

## Representações de data e hora

O esquema mistura três representações de tempo, e a distinção é relevante para quem for
manter o sistema.

| Representação | Onde aparece | Consequência |
| --- | --- | --- |
| Data e hora tipada | Sessões, logs, notificações, issues, auditoria | Comparação e ordenação corretas no banco |
| Texto em formato de data | Criação do projeto, compra, pausa da responsabilidade | Comparação depende do formato; ordenação frágil |
| Texto em formato de hora | Grades de horário | Comparação lexicográfica funciona para o formato de 24 horas |

A terceira linha é a única em que a escolha de texto é segura: o formato de hora com dois
dígitos por campo ordena corretamente como texto. As duas primeiras são heranças que
deveriam ser convertidas em colunas tipadas caso o sistema venha a fazer consultas
temporais complexas sobre essas tabelas.

## Volume e crescimento

As tabelas que crescem com o uso são, em ordem: a trilha de auditoria, as notificações, os
logs diários, as sessões de trabalho e a progressão individual. A trilha de auditoria
cresce a cada operação auditada e é a candidata natural a uma política de retenção.

As tabelas de catálogo — recompensas e distintivos — são pequenas e mudam raramente. As
tabelas de configuração — grades — são pequenas e mudam por decisão administrativa.

::: nota titulo="Auditoria sem política de retenção"
A trilha de auditoria não tem política de retenção definida. Em uma operação longa, ela se
torna a maior tabela do banco e a principal fonte de crescimento. Uma política de retenção
é a intervenção de menor custo para conter esse crescimento, e a decisão de adotá-la
pertence à operação.
:::
