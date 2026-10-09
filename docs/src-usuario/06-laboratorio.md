# Laboratório

A tela **Laboratório** reúne o que diz respeito ao espaço físico: a **Agenda** do que acontece nele, a **Responsabilidade** de quem está atendendo no momento e as **Reclamações** sobre o que está errado.

```foto laboratorio titulo="A tela Laboratório, na aba Agenda"
A agenda semanal e, abaixo, a grade de horários por função.
```

## Agenda

A agenda é uma tabela com as colunas **Dia da Semana**, **Horário**, **Notas** e **Ações**, organizada por dia. Cada linha é um horário do dia, e o botão **Adicionar evento** abre o diálogo **Adicionar Evento** para preencher **Horário** e **Descrição**.

```foto laboratorio-agenda titulo="O diálogo Adicionar Evento"
O evento entra no horário indicado e aparece na linha correspondente da semana.
```

::: nota titulo="Quem escreve na agenda"
Criar evento exige **Coordenador** ou **Laboratorista**. As demais funções leem a agenda, e a coluna **Ações** não aparece para elas.
:::

## Responsabilidade

A aba **Responsabilidade** mostra quem está responsável pelo laboratório agora. É o plantão: enquanto alguém está marcado como responsável, o sistema associa a essa pessoa o atendimento que acontecer nesse horário.

Os controles da aba:

- **Novo aviso** — publica um aviso visível no painel;
- **Adicionar notas** e **Editar notas** — registram o que aconteceu durante o turno;
- **Não sou mais responsável** — encerra a sua responsabilidade e libera o posto.

```foto laboratorio-responsabilidade titulo="A aba Responsabilidade"
O painel mostra a pessoa responsável e os avisos ativos do laboratório.
```

Assumir a responsabilidade exige **Coordenador** ou **Laboratorista**. Quem não tem essa função vê o painel, mas o sistema recusa a tomada de responsabilidade.

## Grade de horários

A grade diz em quais horários cada função costuma estar no laboratório. Ela é **aberta à leitura**: qualquer pessoa autenticada vê todos os horários. A escrita é restrita a **Coordenador**, **Gerente** e **Laboratorista**, que usam **Adicionar Horário** e **Definir Horários** para montar e alterar a grade.

```foto laboratorio-participante titulo="A mesma tela, vista por um pesquisador"
A grade aparece com os horários de cada função, sem a coluna Ações e sem os controles de escrita.
```

::: limite titulo="Função sem horário"
Uma função listada como `(sem horario)` não tem grade cadastrada. Isso não impede a pessoa de registrar trabalho: a grade é referência de cobertura, não autorização.
:::

## Reclamações

A aba **Reclamações** é o canal para reportar problema do laboratório. **Nova Reclamação** abre o formulário; os filtros **Todos** e **Todas** reduzem a lista por estado e por tipo; **Atribuir a Mim** coloca a reclamação no seu nome.

Cada reclamação percorre quatro estados: **Aberto**, **Em Andamento**, **Resolvido**, **Fechado**. As regras que o sistema aplica:

- só reclamação **Aberta** pode ser iniciada;
- resolver exige **descrição da resolução**;
- só reclamação **Fechada** pode ser reaberta.

```foto laboratorio-reclamacoes titulo="A aba Reclamações"
A lista mostra as reclamações abertas e em andamento, com o filtro acima.
```

## O plantão também aparece no cronômetro

O cronômetro de sessão de trabalho tem a aba **Responsabilidade**, que é o mesmo painel do plantão. Quem está atendendo o laboratório e quer registrar o tempo faz as duas coisas no mesmo lugar: assume a responsabilidade e inicia a sessão.
