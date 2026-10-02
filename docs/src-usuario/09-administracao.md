# Administração

O **Painel Administrativo** é a tela de quem mantém o sistema funcionando. Está organizado em oito abas: **Visão Geral**, **Usuários**, **Projetos**, **Horas**, **Tarefas**, **Notificações**, **Badges** e **Configurações**.

```foto painel-administrativo titulo="O Painel Administrativo, na aba Visão Geral"
A Visão Geral abre com "Horas Trabalhadas por Usuário (Semana Atual)": **Nome**, **Email**, **Horas Trabalhadas**, **Horas Esperadas** e **Diferença**.
```

::: nota titulo="Quem entra"
O destino **Painel Administrativo** aparece apenas para **Coordenador** e **Gerente**. Parte do que ele contém — distintivos, notificações, sessões — está aberta também ao **Laboratorista**, pelas permissões específicas de cada função.
:::

## Usuários

A aba **Usuários** é onde as contas pendentes são resolvidas e onde as contas nascem.

- **Contas pendentes** aparecem com **Aprovar** e **Rejeitar**. Aprovar é também o momento de definir a **função** da conta e a carga semanal esperada — é essa escolha que decide o que a pessoa verá no resto do sistema.
- **Novo Usuário** cria uma conta diretamente, sem passar pelo cadastro público.
- **Definir Horários** monta a grade de horários da função, a mesma grade da tela Laboratório.
- Os filtros **Todas** e **Todos** reduzem a lista por função e por situação.

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
| **Tarefas** | ver tarefas de todos os projetos, além do que o quadro mostra |
| **Notificações** | enviar aviso para uma pessoa ou para o laboratório |
| **Badges** | criar e editar distintivos: **Nome**, **Descrição**, **Categoria** e quem criou |
| **Configurações** | parâmetros do sistema |

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
| Ver o painel administrativo | sim | sim | — | — |
