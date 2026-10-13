# Projetos

Um projeto agrupa tarefas, define quem participa e concentra as horas registradas. A tela **Projetos** tem duas abas: **Lista de Projetos** e **Voluntários**.

```foto projetos titulo="A tela Projetos, na aba Lista de Projetos"
Cada cartão traz o nome, a data de criação, o status e os links do projeto.
```

## Ver um projeto

Na lista, abra o olho no cartão do projeto. O sistema abre o detalhe, que mostra, nesta ordem:

- a **capa** e o **logo** do projeto, quando houver. Sem capa, o espaço do topo diz *"Sem capa"*;
- o nome, o **Status** (**Ativo**, **Concluído**, **Arquivado**), a data de criação e os botões **Editar** e **Excluir**;
- a **Descrição**, quando o projeto tem descrição;
- **Dados do projeto**: **Início**, **Término**, **Número do edital**, **Número do processo** e **Pontos do projeto**. Esse card só aparece quando algum desses campos foi preenchido;
- **Entregáveis**, cada um com o nome e a quantidade em unidades (**2 un.**);
- **Anexos**, cada um com o nome, o tamanho e o arquivo;
- **Total de Tarefas**, **Concluídas**, **Em Progresso** e **Pendentes**, e o **Progresso Geral** com a taxa de conclusão;
- **Tarefas do Projeto**, com **Importar Backlog** e **Nova Tarefa**;
- **Criado por**, **Data de criação** e **Última atualização**;
- os **Links** cadastrados — quando não há nenhum, a tela diz *"Não há links para esse projeto"*.

```foto dialogo-detalhe-projeto titulo="O detalhe de um projeto"
É pelo detalhe que se vê o andamento real do projeto: quantas tarefas faltam, quantas estão em curso e quantas terminaram.
```

## Criar um projeto

1. Na tela Projetos, clique em **Novo Projeto**.
2. Preencha **Nome do Projeto** e **Descrição**.
3. Informe **Início do projeto** e **Término do projeto**. São datas do calendário, e o término não pode vir antes do início.
4. Informe **Número do edital** e **Número do processo**, se o projeto veio de um.
5. Escolha o **Status**: **Ativo**, **Concluído** ou **Arquivado**.
6. Em **Líder do Projeto**, escolha a pessoa responsável. Sem escolha, o projeto fica com **Sem líder definido**.
7. Em **Voluntários iniciais**, marque quem já entra no projeto.
8. Use **+ Adicionar Link** para cada referência externa que o projeto precisa guardar.
9. Clique em **Criar**.

```foto dialogo-novo-projeto titulo="O diálogo Novo Projeto"
Nome com até 100 caracteres e descrição com até 500.
```

Editar e excluir um projeto são ações do cartão, na lista. O **Pontos do projeto** não é campo do formulário: ele aparece no detalhe quando existe.

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

::: limite titulo="Quem cria e edita projeto"
Criar, editar e gerenciar membros exige **Coordenador**, **Gerente** ou **Gerente de Projeto**. Pesquisador e Colaborador enxergam a lista dos projetos em que entram, mas não criam nem alteram projetos.
:::

::: nota titulo="Quem escreve entregáveis, anexos, capa e logo"
Esses controles aparecem para a liderança e a gerência do projeto. Quem não gerencia vê as listas e os arquivos, sem os botões de escrita. Se o controle aparecer e a pessoa não tiver a gestão do projeto, o sistema responde *"Usuário não tem permissão para gerenciar este projeto"* e nada muda.
:::

## A aba Voluntários

A aba **Voluntários** é a gestão de quem participa de cada projeto: **Equipe de Voluntários** com **Horas Trabalhadas** e **Pontos Conquistados** de cada pessoa, e o vínculo em três estados — **Ativo**, **Inativo** e **Afastado**.

É aqui que um voluntário entra e sai de um projeto, e é por isso que ele aparece no quadro de tarefas e nas horas do projeto.

## O projeto aparece no resto do sistema

- No **Quadro de Tarefas**, o projeto filtra o quadro e aparece em cada cartão como `Projeto: <nome>`.
- Na **sessão de trabalho**, o projeto escolhido no início direciona para onde as horas vão.
- Nos **Relatórios**, o relatório de projeto é um dos dois tipos disponíveis.
- No **Ranking**, a coluna **Projetos** conta em quantos projetos a pessoa trabalhou.
