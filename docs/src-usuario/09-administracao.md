# Administração

O **Painel Administrativo** é a tela de quem mantém o sistema funcionando. Está organizado em oito abas: **Visão Geral**, **Usuários**, **Projetos**, **Horas**, **Tarefas**, **Voluntários**, **Notificações** e **Badges**.

```foto painel-administrativo titulo="O Painel Administrativo, na aba Visão Geral"
A Visão Geral abre com "Horas Trabalhadas por Usuário (Semana Atual)": **Nome**, **Email**, **Horas Trabalhadas**, **Horas Esperadas** e **Diferença**.
```

::: nota titulo="Quem entra"
O destino **Painel Administrativo** aparece para **Coordenador** e **Gerente**, e também para o **Gerente de Projeto** — este, porém, só enxerga a aba **Voluntários**, que é onde ele gerencia a equipe dos seus projetos. Parte do que o painel contém — distintivos, notificações, sessões — está aberta também ao **Laboratorista**, pelas permissões específicas de cada função. Cada aba declara a chave que a governa: quem entra sem a chave daquela aba vê o motivo, não uma tela vazia.
:::

## Usuários

A aba **Usuários** é onde as contas pendentes são resolvidas e onde as contas nascem.

- **Contas pendentes** aparecem com **Aprovar** e **Rejeitar**. Aprovar é também o momento de definir a **função** da conta e a carga semanal esperada — é essa escolha que decide o que a pessoa verá no resto do sistema.
- **Novo Usuário** cria uma conta diretamente, sem passar pelo cadastro público.
- **Definir Horários** monta a grade de horários da função, a mesma grade da tela Laboratório.
- Os filtros **Todas** e **Todos** reduzem a lista por função e por situação.
- O ícone de configuração de cada pessoa — o controle tem o nome **Configurar \<nome\>** — abre o diálogo **Configurar Usuário**. Além de função, carga semanal e **saldo**, ele tem o bloco dos dados dos documentos oficiais: **CPF**, **Matrícula**, **Curso**, **Modalidade de IC**, **Nível** e **Instituição de fomento**. São os mesmos campos que a pessoa edita no próprio perfil; aqui, é a gestão que escreve.

  O bloco de saldo ajusta as duas trilhas separadamente, uma por vez: o seletor **Trilha de saldo**
  escolhe **Pontos do mês** ou **Moedas**, o seletor **Ação de saldo** escolhe **Definir**,
  **Adicionar** ou **Remover**, e o campo **Valor de saldo** recebe o número (o rótulo do campo é o
  que o teste e o leitor de tela usam; a linha abaixo dele diz o valor atual da trilha escolhida).
  Na trilha pontos, **Definir** aceita valor negativo — a premiação de tarefa produz total negativo
  e a gestão precisa conseguir escrevê-lo de volta. Na trilha moeda, nenhuma das três ações aceita
  saldo negativo. Cada ajuste fica registrado no histórico da pessoa, com trilha, valor antes e
  valor depois.

```foto admin-usuarios titulo="A aba Usuários"
A lista traz as contas e, abaixo, a grade de horários por função.
```

::: atencao titulo="A conta criada aqui já entra"
Uma conta criada por **Novo Usuário** ou aprovada em **Aprovar** passa a permitir entrada imediata. A senha definida nesse momento é a única credencial da pessoa: entregue por um canal que não seja o chat do laboratório.
:::

## Horas

A aba **Horas** é a leitura consolidada do tempo registrado. As colunas são **Usuário**, **Horas Totais**, **Esta Semana**, **Sessões**, **Duração Média**, **Projetos** e **Produtividade**. Acima da tabela, os filtros **Todas as funções**, **Todos os projetos** e **Esta semana** definem o recorte; **Exportar** produz o arquivo da tabela.

```foto admin-horas titulo="A aba Horas"
É a primeira lugar a consultar quando um número de horas parece errado: ele mostra sessões e duração média, não só o total.
```

## As outras abas

| Aba | Para que serve |
| --- | --- |
| **Projetos** | revisar o conjunto de projetos e seu andamento |
| **Tarefas** | ver tarefas de todos os projetos, além do que o quadro mostra — com a lista de subtasks de cada tarefa em leitura: a contagem (por exemplo *"2/5 concluídas"*) e cada etapa marcada com ✓ ou ○, sem checkbox |
| **Voluntários** | gerenciar a equipe de cada projeto — adicionar e remover pessoas (seção *A aba Voluntários* abaixo) |
| **Notificações** | enviar aviso para uma pessoa ou para o laboratório |
| **Badges** | criar e editar distintivos: **Nome do Badge**, **Descrição**, **Categoria**, **Ícone (emoji ou nome)**, **Cor**, **Badge ativo**, **Janela do critério** com as métricas da janela, **Condição especial** e **Efeitos equipáveis** (seção *A aba Badges* abaixo) |

## A aba Badges

Um distintivo é criado com **Nome do Badge**, **Descrição**, **Categoria**, **Ícone (emoji ou nome)**, **Cor** e o interruptor **Badge ativo**. O que decide se a pessoa recebe o distintivo é o bloco de critério, e ele começa pela **Janela do critério**:

- **Mês em curso** mede **Pontos** e **Tarefas** do mês que ainda não fechou.
- **Temporada (ano em curso)** mede **Pontos**, **Tarefas** e **XP da temporada** somados do começo do ano até hoje.
- **Vida inteira** mede **Tarefas**, **Moedas**, **Sessões de trabalho**, **Projetos**, **Horas semanais** e **Dias consecutivos**.

Só aparecem no formulário as métricas da janela escolhida: um distintivo de mês não ganha campo de moedas porque a janela de mês não mede moedas. Preencher uma métrica fora da janela é recusado com o nome do campo, e um critério sem métrica nenhuma também é recusado — sem critério, o distintivo não é concedido sozinho. Abaixo das métricas há **Condição especial**, texto livre para as condições que não são contagem, como *"primeiro a completar 100 tarefas"*.

O bloco **Efeitos equipáveis** declara o que o distintivo faz enquanto a pessoa o mantém equipado. Cada efeito tem **Verbo** — *Pontos de tarefa +%*, *Pontos de sessão +%*, *Moedas de atividade +%* ou *Penalidade de atraso −%* — e **Tier**: *Tier 1 (5%)*, *Tier 2 (10%)* ou *Tier 3 (15%)*. O valor vem do tier, e não há número livre a preencher. Um distintivo sem efeito é só conquistável: não muda nenhum credit.

O painel define o catálogo. A escolha de quais distintivos manter equipados ainda não tem tela para a pessoa — o que já vale é o efeito sobre os créditos seguintes, quando o distintivo está equipado.

## A aba Voluntários

A gestão da equipe de cada projeto mora aqui. Comece escolhendo o projeto em **Selecione um projeto**: sem projeto escolhido, a aba não mostra equipe nenhuma. Com o projeto escolhido aparecem **Ações de Gerenciamento** — **Total de Voluntários**, **Horas Trabalhadas**, **Tasks Completadas** e **Pontos do mês** — e a **Equipe de Voluntários**, com **Adicionar voluntário** e **Remover voluntário** em cada pessoa.

```foto admin-voluntarios titulo="A aba Voluntários, antes de escolher o projeto"
O seletor de projeto é o primeiro controle: a equipe só aparece depois de escolher.
```

Quem gerencia a equipe é a gestão do sistema e o **Gerente de Projeto**. Os dados do vínculo de cada pessoa — Lattes, carga contratada, categoria, situação e data de entrada — continuam na aba **Membros** da página do projeto (capítulo 4); aqui é o quadro de quem entra e sai.

## Sessões e semana

Dois controles da Visão Geral mexem no registro de trabalho:

- **Gerenciar sessões** abre a gestão das sessões de trabalho de todas as pessoas — pausar, retomar, finalizar e excluir.
- **Resetar Semana** zera as horas da semana corrente. É uma ação que apaga contagem, não uma correção pontual: para ajustar uma pessoa, corrija a sessão dela, não a semana inteira.

::: limite titulo="O que a administração não faz pelo painel"
Não existe no painel uma forma de reescrever o histórico de um período já relatado, nem de transferir horas de uma pessoa para outra. Correção de registro se faz pela sessão ou pelo log, e o relatório é gerado de novo depois.
:::

## O que cada função administra

| Ação | Coordenador | Gerente | Laboratorista | Gerente de Projeto |
| --- | :-: | :-: | :-: | :-: |
| Aprovar conta | sim | — | sim | — |
| Criar conta | sim | sim | — | — |
| Gerenciar sessões de outros | sim | sim | sim | — |
| Gerenciar loja e recompensas | sim | sim | sim | — |
| Gerenciar distintivos | sim | sim | sim | — |
| Criar e editar projeto | sim | sim | — | sim |
| Criar e editar tarefa | sim | sim | — | sim |
| Definir grade de horários | sim | sim | sim | — |
| Ver logs de todos | sim | — | — | — |
| Ver o painel administrativo | sim | sim | — | só a aba Voluntários |
