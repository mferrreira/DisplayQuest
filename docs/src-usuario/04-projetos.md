# Projetos

Um projeto agrupa tarefas, define quem participa e concentra as horas registradas. A tela **Projetos** tem duas abas: **Lista de Projetos** e **Voluntários**.

```foto projetos titulo="A tela Projetos, na aba Lista de Projetos"
Cada cartão traz o nome, a data de criação, o status e os links do projeto.
```

## Ver um projeto

A **Lista de Projetos** mostra todos os projetos do sistema, inclusive os que você não participa. Na lista, abra o olho no cartão do projeto. O sistema abre o detalhe, que mostra, nesta ordem:

- a **capa** e o **logo** do projeto, quando houver. Sem capa, o espaço do topo diz *"Sem capa"*;
- o nome, o **Status** (**Ativo**, **Concluído**, **Arquivado**), a data de criação e os botões **Editar** e **Excluir**;
- a **Descrição**, quando o projeto tem descrição;
- **Dados do projeto**: **Início**, **Término**, **Número do edital**, **Número do processo**, **Número PROPPI** e **Pontos do projeto**. Esse card só aparece quando algum desses campos foi preenchido;
- **Entregáveis**, cada um com o nome e a quantidade em unidades (**2 un.**);
- **Anexos**, cada um com o nome, o tamanho e o arquivo;
- **Cronograma**, com as **Metas do projeto** e a grade de meses (a seção *Cronograma do projeto* abaixo);
- **Total de Tarefas**, **Concluídas**, **Em Progresso** e **Pendentes**, e o **Progresso Geral** com a taxa de conclusão;
- **Tarefas do Projeto**, com **Importar Backlog** e **Nova Tarefa**;
- **Criado por**, **Data de criação** e **Última atualização**;
- os **Links** cadastrados — quando não há nenhum, a tela diz *"Não há links para esse projeto"*.

```foto dialogo-detalhe-projeto titulo="O detalhe de um projeto"
É pelo detalhe que se vê o andamento real do projeto: quantas tarefas faltam, quantas estão em curso e quantas terminaram.
```

## Criar um projeto

A criação tem três passos, e o diálogo diz em qual você está: *"Passo 1 de 3: Dados do projeto"*. **Equipe** e **Cronograma** são opcionais, e o projeto nasce igual sem eles. **Avançar** leva ao passo seguinte, **Voltar** devolve um, e **Criar** aparece no último.

**Passo 1: Dados do projeto**

1. Na tela Projetos, clique em **Novo Projeto**.
2. Preencha **Nome do Projeto** e **Descrição**. Sem nome, **Avançar** fica desabilitado.
3. Informe **Início do projeto** e **Término do projeto**. São datas do calendário, e o término não pode vir antes do início.
4. Informe **Número do edital** e **Número do processo**, se o projeto veio de um.
5. Informe o **Número PROPPI**, se o projeto é do PROPPI. É o número que sai nos dois formulários oficiais.
6. Escolha o **Status**: **Ativo**, **Concluído** ou **Arquivado**.

**Passo 2: Equipe** (opcional)

7. Em **Líder do Projeto**, escolha a pessoa responsável. Sem escolha, o projeto fica com **Sem líder definido**.
8. Em **Voluntários iniciais**, marque quem já entra no projeto.
9. Use **+ Adicionar Link** para cada referência externa que o projeto precisa guardar.

**Passo 3: Cronograma** (opcional)

10. Monte as metas e as etapas, como na seção *Cronograma do projeto* abaixo. Nada aqui é gravado antes de você clicar em **Criar**: o projeto e o cronograma entram juntos.

```foto dialogo-novo-projeto titulo="O passo 1 do diálogo Novo Projeto"
Nome com até 100 caracteres e descrição com até 500. O **Avançar** da foto está desabilitado porque o nome está vazio.
```

Editar e excluir um projeto são ações do cartão, na lista. Editar é uma página só, sem passos: o cronograma da edição se mexe no detalhe, não no formulário. O **Pontos do projeto** não é campo do formulário: ele aparece no detalhe quando existe.

## Capa e logo do projeto

1. Abra o detalhe do projeto.
2. Clique em **Enviar capa** e escolha a imagem. Ela ocupa a faixa do topo do diálogo.
3. Clique em **Enviar logo** e escolha a imagem. O logo aparece redondo, sobre a capa.
4. Para trocar, envie outra imagem: a nova ocupa o lugar da antiga.
5. **Tirar capa** e **Tirar logo** aparecem quando o slot tem imagem, e o sistema pede confirmação.

São imagens, só isso: PDF e vídeo não entram aqui. O arquivo vai para o bucket de objetos do sistema, e a tela o lê por um endereço que entrega a imagem apenas a quem tem acesso ao projeto.

## Entregáveis

Entregável é o que o projeto se compromete a entregar, com quantidade.

1. No detalhe do projeto, escreva o **Nome do entregável**.
2. Em **Unidades**, informe a quantidade. Deixar o campo em branco conta como 1.
3. Clique em **Adicionar entregável**.
4. Para mudar um entregável já listado, abra o lápis: **Novo nome** e **Nova quantidade**, depois **Salvar entregável**.
5. Para apagar, use a lixeira; o sistema pede confirmação.

## Anexos

1. No detalhe do projeto, escolha o arquivo em **Arquivo do anexo**.
2. Clique em **Enviar anexo**. O arquivo entra no topo da lista, com o tamanho escrito em **1,5 KB** ou **3,2 MB**.
3. Clique no nome do arquivo para abrir o anexo.
4. Para apagar, use a lixeira; o sistema pede confirmação.

Imagem aceita até 5 MB, PDF até 20 MB e vídeo até 100 MB. O sistema confere o conteúdo do arquivo, não apenas o nome: um arquivo que não é o que declara ser é recusado, e a lista continua como estava.

## Cronograma do projeto

O cronograma é o calendário do projeto. São duas listas no mesmo card: as **Metas do projeto** e a grade de etapas por mês.

**Metas.** Cada meta é uma linha com a descrição e, se você quiser, um número. O número existe porque a brochura tem objetivo que se conta (dois artigos, um dataset), mas meta sem número é meta normal. **Adicionar meta** cria a linha, e ela só entra no projeto quando você escreve a descrição e sai do campo.

**A grade.** Cada linha é uma etapa, e a duração da etapa é a contagem dos meses marcados:

1. Clique em **Adicionar atividade**. A linha nasce com um mês marcado, o primeiro da grade.
2. Escreva a descrição da etapa e saia do campo: é aí que a linha entra no projeto.
3. Clique nos meses que a etapa ocupa. A linha é sempre contínua, sem buraco no meio. Clicar depois do último estende a etapa. Clicar antes do primeiro estende para trás. Clicar num mês do meio faz daquele mês o último. Clicar no último desmarca.
4. Em **Responsável**, escolha quem faz a etapa, ou deixe **Sem responsável**. Na lista só aparece quem participa do projeto.
5. A **Recompensa** acompanha a marcação: 100 pontos por mês marcado. A linha diz quantos meses tem, do lado da descrição: *"out/2026 → nov/2026 · 2 meses"*.
6. Para apagar a linha, use a lixeira; o sistema pede confirmação. Apagar uma etapa não apaga tarefa nenhuma do projeto.

As colunas são o período do projeto. Um projeto de 1º de março a 31 de agosto tem a grade de mar/2026 a ago/2026. Projeto sem datas tem 12 meses a partir do mês atual. Se uma marca cair fora dessas colunas, a grade se alarga para alcançá-la, e com muitos meses a grade tem largura e se move para o lado.

```foto dialogo-detalhe-projeto-cronograma titulo="O card Cronograma, no detalhe de um projeto"
O card anuncia a grade que ele mostra: *"out/2026 a set/2027 — 12 meses na grade"*. A etapa *Revisão da literatura* está marcada em out/2026 e nov/2026, e a linha diz *"out/2026 → nov/2026 · 2 meses"*.
```

```foto dialogo-novo-projeto-cronograma titulo="O passo 3 do Novo Projeto, com uma linha recém-criada"
A linha nova já nasce com o primeiro mês da grade marcado, porque etapa sem mês não existe.
```

::: limite titulo="Toda linha precisa de pelo menos um mês"
Desmarcar a única marca de uma linha é recusado: o sistema responde *"A atividade precisa de pelo menos um mês marcado"* e a linha fica como estava.
:::

::: nota titulo="O cronograma do projeto não é o quadro de tarefas"
A grade diz em quais meses a etapa do projeto acontece e quanto ela vale. Tarefa é outra coisa, e continua tendo seu próprio ciclo no quadro. Nenhuma linha do cronograma cria tarefa, e apagar uma linha não apaga tarefa.
:::

::: limite titulo="Quem cria e edita projeto"
Criar, editar e gerenciar membros exige **Coordenador**, **Gerente** ou **Gerente de Projeto**. **Pesquisador**, **Colaborador** e **Voluntário** não criam nem alteram projeto.
:::

::: nota titulo="Quem enxerga os projetos"
A **Lista de Projetos** e o detalhe são de qualquer pessoa autenticada: você vê todos os projetos do sistema, inclusive os que não participa, e neles lê entregáveis, anexos, capa, logo, horas, cronograma e a lista de quem participa. O que continua fechado é a escrita.
:::

::: nota titulo="Quem escreve entregáveis, anexos, capa, logo e cronograma"
Esses controles aparecem para a liderança e a gerência do projeto. Quem não gerencia vê as listas, os arquivos e a grade, sem os botões de escrita. Se o controle aparecer e a pessoa não tiver a gestão do projeto, o sistema responde *"Usuário não tem permissão para gerenciar este projeto"* e nada muda.
:::

## A aba Voluntários

A aba **Voluntários** é a gestão de quem participa de cada projeto. Comece escolhendo o projeto em **Selecionar Projeto**: sem projeto escolhido, a aba não mostra equipe nenhuma. Com o projeto escolhido aparecem **Ações de Gerenciamento** — **Total de Voluntários**, **Horas Trabalhadas**, **Tasks Completadas** e **Pontos Conquistados** — e a **Equipe de Voluntários**, com **Adicionar voluntário** e **Remover voluntário** em cada pessoa.

Os dados do vínculo estão no diálogo **Gestão Completa**, aberto pelo botão de mesmo nome:

1. Abra **Gestão Completa**.
2. Em **Liderança do Projeto**, escolha a pessoa e clique em **Salvar líder**.
3. Na linha de cada pessoa, escolha o papel em **Papel do membro** e clique em **Salvar papel**. **Horas** abre as horas da pessoa no projeto; **Remover** tira a pessoa do projeto, com confirmação.
4. Abaixo da linha está o bloco **Dados do vínculo**, com os campos daquele vínculo: **Currículo Lattes**, **Carga contratada (h/semana)**, **Categoria do vínculo** (**Sem categoria**, **Bolsista** ou **Voluntário**), **Situação do vínculo** (**Ativo** ou **Inativo**) e **Data de entrada**.
5. Clique em **Salvar vínculo**. Só o que você mexeu é gravado: o que ficou como estava não é apagado, e mexer sem mudar nada não grava nada.

```foto painel-membros titulo="O bloco Dados do vínculo, no diálogo Gestão Completa"
A tela avisa: *"A carga contratada é a que sai no atestado; a meta semanal da pessoa é editada no perfil dela."* São dois números diferentes, e os dois continuam existindo ao mesmo tempo.
```

Quem não gerencia o projeto não vê os campos de escrita: vê uma linha resumo abaixo da pessoa, com o que existe — carga contratada, categoria, situação, a data em que entrou e o Lattes. Vínculo sem dado nenhum não ganha linha vazia.

::: nota titulo="Inativo não é sair do projeto"
**Situação do vínculo** é estado de registro: **Ativo** ou **Inativo**. Quem sai do projeto é removido, e o vínculo deixa de existir — as horas que a pessoa já registrou continuam nas sessões de trabalho dela. Vínculo novo entra como **Ativo**.
:::

## O projeto aparece no resto do sistema

- No **Quadro de Tarefas**, o projeto filtra o quadro e aparece em cada cartão como `Projeto: <nome>`.
- Na **sessão de trabalho**, o projeto escolhido no início direciona para onde as horas vão.
- Nos **Relatórios**, o relatório de projeto é um dos dois tipos disponíveis.
- No **Ranking**, a coluna **Projetos** conta em quantos projetos a pessoa trabalhou.
