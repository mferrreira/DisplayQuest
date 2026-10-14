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
- **Dados do projeto**: **Início**, **Término**, **Número do edital**, **Número do processo**, **Número PROPPI**, **Pontos do projeto** e a barra de **Andamento** do período. Esse card só aparece quando algum desses campos foi preenchido;
- **Entregáveis**, cada um com o nome e a quantidade em unidades (**2 un.**);
- **Anexos**, cada um com o nome, o tamanho e o arquivo;
- **Cronograma**, com as **Metas do projeto** e a grade de meses (a seção *Cronograma do projeto* abaixo);
- **Relatórios técnicos**, um texto editável por tipo (a seção *Relatórios técnicos do projeto* abaixo);
- **Atestados de frequência**, um PDF oficial por membro ativo e mês (a seção *Atestados de frequência* abaixo);
- **Total de Tarefas**, **Concluídas**, **Em Progresso** e **Pendentes**, e o **Progresso Geral** com a taxa de conclusão;
- **Tarefas do Projeto**, com **Importar Backlog** e **Nova Tarefa**;
- **Criado por**, **Data de criação** e **Última atualização**;
- os **Links** cadastrados — quando não há nenhum, a tela diz *"Não há links para esse projeto"*.

```foto dialogo-detalhe-projeto titulo="O detalhe de um projeto"
É pelo detalhe que se vê o andamento real do projeto: quantas tarefas faltam, quantas estão em curso e quantas terminaram.
```

A barra de **Andamento**, no card **Dados do projeto**, é o relógio do calendário: o percentual do período já decorrido, e a linha nomeia os dias — *"Faltam 45 dias para o término — 120 de 165 dias decorridos"*. Antes do **Início**, a barra está zerada e a linha diz *"Começa em N dias — término em M dias"*; depois do **Término**, *"Encerrado há N dias"*. O dia exato do término ainda conta como dentro do período. Projeto sem **Término** não mostra barra: sem fim não há relógio a desenhar.

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

1. Clique em **Adicionar atividade**. A linha nasce **sem mês marcado** — ela é um rascunho, e o mês dela será o mês que você clicar.
2. Escreva a descrição da etapa e saia do campo. A linha entra no projeto quando a descrição **e** pelo menos um mês existem, na ordem em que você os fizer: com a descrição já escrita, clicar num mês salva a linha; com o mês já marcado, sair do campo de descrição salva a linha.
3. Clique no mês em que a etapa começa: clicar em mar/2026 faz a etapa começar em mar/2026, não no primeiro mês da grade. Depois estenda: a linha é sempre contínua, sem buraco no meio. Clicar depois do último estende a etapa. Clicar antes do primeiro estende para trás. Clicar num mês do meio faz daquele mês o último. Clicar no último desmarca.
4. Em **Responsável**, escolha quem faz a etapa, ou deixe **Sem responsável**. Na lista só aparece quem participa do projeto.
5. A **Recompensa** acompanha a marcação: 100 pontos por mês marcado. A linha diz quantos meses tem, do lado da descrição: *"out/2026 → nov/2026 · 2 meses"*.
6. Para apagar a linha, use a lixeira; o sistema pede confirmação. Apagar uma etapa não apaga tarefa nenhuma do projeto.

As colunas são o período do projeto. Um projeto de 1º de março a 31 de agosto tem a grade de mar/2026 a ago/2026. Projeto sem datas tem 12 meses a partir do mês atual. Se uma marca cair fora dessas colunas, a grade se alarga para alcançá-la, e com muitos meses a grade tem largura e se move para o lado.

```foto dialogo-detalhe-projeto-cronograma titulo="O card Cronograma, no detalhe de um projeto"
O card anuncia a grade que ele mostra: *"out/2026 a set/2027 — 12 meses na grade"*. A etapa *Revisão da literatura* está marcada em out/2026 e nov/2026, e a linha diz *"out/2026 → nov/2026 · 2 meses"*.
```

```foto dialogo-novo-projeto-cronograma titulo="O passo 3 do Novo Projeto, com uma linha recém-criada"
A linha nova nasce sem mês marcado: o mês dela será o mês que você clicar na grade.
```

### A conclusão de uma etapa

Cada etapa tem duas conclusões: quem conduz o projeto **solicita** a conclusão, com prova anexada, e a gestão do sistema **aprova**. O status diz em que fase a linha está: **Aberta**, **Conclusão solicitada** ou **Concluída**.

1. Na linha, clique em **Conclusão**. Abre o diálogo *Conclusão da atividade*, com o status da etapa.
2. Em **Provas**, anexe o arquivo que comprova a etapa: escolha o arquivo e clique em **Anexar prova**. A lista mostra nome, tamanho e data da prova, e cada uma pode ser baixada ou apagada.
3. Clique em **Solicitar conclusão**. Sem prova, o sistema recusa — *"Anexe pelo menos uma prova antes de solicitar a conclusão."* — e a linha continua **Aberta**. Com prova, a linha vira **Conclusão solicitada**, e o diálogo diz quem pediu e quando: *"Solicitada em 10/10/2026 por Guia · Participante"*.
4. A aprovação é de **Coordenador** ou **Gerente**. A pessoa abre a mesma linha, lê as provas anexadas e clica em **Aprovar conclusão**. O sistema confirma com o número distribuído — *"Atividade concluída"* seguido de *"N pontos distribuídos entre os membros do projeto."* — e a linha vira **Concluída**.

```foto dialogo-conclusao-atividade-pedido titulo="O diálogo de conclusão de uma etapa aberta, com o botão de solicitar"
A seção *Provas* está vazia, e a dica diz o que falta: *"Anexe pelo menos uma prova antes de solicitar a conclusão."*
```

```foto dialogo-conclusao-atividade-aprovacao titulo="O diálogo de uma etapa pedida, com a prova anexada e o botão de aprovar"
A linha diz *"Conclusão solicitada"* e *"Solicitada em 14/10/2026 por Guia · Participante"*. A prova *parcial.pdf* (200,0 KB) aparece na lista, com botão de download. A dica diz o que a aprovação faz: *"Aprovar conclui a atividade e distribui o prêmio entre os membros ativos do projeto."*
```

::: nota titulo="O que a aprovação faz com os pontos"
Aprovada a etapa, o prêmio dela — 100 pontos por mês marcado — entra nos pontos do projeto e é distribuído entre os membros **Ativo** da lista de membros, proporcional às tarefas que cada um concluiu no projeto. Quem conclui a etapa antes do prazo do último mês marcado recebe um prêmio maior; quem aprova depois do prazo recebe um prêmio menor. Um membro **Inativo** não recebe parte.
:::

::: limite titulo="Quem pede e quem aprova"
Solicitar a conclusão e anexar prova é do líder do projeto e de **Gerente de Projeto**. Aprovar é de **Coordenador** e **Gerente** — e **Gerente** não aprova o que ele mesmo solicitou. O botão **Conclusão** aparece na linha para quem pode fazer qualquer uma das duas coisas.
:::

::: limite titulo="Toda linha gravada precisa de pelo menos um mês"
Desmarcar a única marca de uma linha **gravada** é recusado: o sistema responde *"A atividade precisa de pelo menos um mês marcado"* e a linha fica como estava. A linha ainda não gravada — o rascunho — pode desmarcar tudo e recomeçar noutro mês. No **Novo Projeto**, uma etapa com descrição mas sem mês bloqueia o **Criar**, e a recusa nomeia a linha: *"Atividade 2: a atividade precisa de pelo menos um mês marcado"*.
:::

::: nota titulo="O cronograma do projeto não é o quadro de tarefas"
A grade diz em quais meses a etapa do projeto acontece e quanto ela vale. Tarefa é outra coisa, e continua tendo seu próprio ciclo no quadro. Nenhuma linha do cronograma cria tarefa. Uma tarefa pode ser **ligada** a uma linha — o campo **Atividade do cronograma** na criação da tarefa, no quadro — e apagar uma linha não apaga tarefa nenhuma: a tarefa continua no quadro, sem vínculo.
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

## Relatórios técnicos do projeto

O relatório técnico é o documento que a iniciação científica exige do projeto: **Parcial**, **Técnico-final** e **Final**. No detalhe do projeto, o card **Relatórios técnicos** tem um texto editável por tipo, e o documento oficial é gerado a partir desse texto.

1. Abra o detalhe do projeto e desça até **Relatórios técnicos**.
2. Em **Relatório Parcial**, escreva o texto do relatório no campo abaixo — **Texto do relatório Parcial**. O mesmo vale para **Relatório Técnico-final** e **Relatório Final**.
3. Clique em **Salvar**. O card diz quando aquele texto foi guardado: *"Atualizado em 14/10/2026"*. Tipo sem texto salvo mostra *"Nenhum texto salvo."*.
4. Clique em **Gerar DOCX**. O download de cada documento gerado aparece abaixo, pelo nome da pessoa.

O documento oficial é a folha oficial preenchida: a linha do tipo, o período, os dados do projeto, os dados do membro e o seu texto distribuído nas três tabelas da folha — *Descrição das Atividades Desenvolvidas pelo Estudante*, *Principais Resultados Alcançados* e *Comentários Adicionais*. A distribuição segue as linhas de seção do seu texto: uma linha só com **Descrição das Atividades**, uma linha só com **Principais Resultados**, uma linha só com **Comentários Adicionais**. O que vem antes da primeira linha vai na Descrição. Seção sem texto fica vazia no documento — o sistema não fabrica frase.

```foto painel-relatorios-tecnicos titulo="O card Relatórios técnicos, no detalhe de um projeto"
O Relatório Parcial tem as linhas de seção no texto, e a linha do tipo traz os três botões: **Rascunhar com IA**, **Gerar DOCX**, **Salvar**.
```

**Rascunhar com IA.** O **Rascunhar com IA** escreve o primeiro texto para você. O sistema lê as sessões de trabalho do período, as tarefas do projeto e o cronograma, e o texto aparece no editor. Nada é salvo: confira o texto e clique em **Salvar** quando estiver pronto. O rascunho escreve só o que tem apoio nos registros, e seção sem evidência fica vazia. Se você já estava escrevendo um texto não salvo, o rascunho não passa por cima dele: a tela avisa *"O texto em edição não foi sobrescrito — salve ou limpe antes de rascunhar."* e o seu texto continua.

::: nota titulo="Um documento por membro ativo"
**Gerar DOCX** gera um documento oficial por pessoa da lista de membros com **Situação do vínculo** **Ativo** — o relatório é o relatório do estudante, e cada estudante tem o seu documento. O período escrito no documento é o período do projeto, cortado no dia da geração.
:::

::: nota titulo="Gerar DOCX não exige texto salvo"
Sem texto salvo, **Gerar DOCX** gera o documento **pré-preenchido**: cabeçalho, período, pessoas e caixas de tipo certos, e as três tabelas em branco para escrever à mão. Com texto salvo, as tabelas saem com o texto. Se o projeto não tem membro ativo, o sistema responde *"O projeto não tem membros ativos — o relatório é gerado um documento por membro"*.
:::

::: nota titulo="Quem edita os relatórios técnicos"
Os três botões aparecem para o líder e a gestão do projeto. As demais pessoas leem os textos, sem os controles de escrita. Se o controle aparecer e a pessoa não tiver a gestão, o sistema responde *"Usuário não tem permissão para editar o relatório técnico deste projeto"* e nada muda.
:::

## Atestados de frequência

O atestado de frequência é o documento oficial que certifica a frequência de um membro no projeto em um mês. O card **Atestados de frequência** fica no detalhe do projeto, ao lado dos relatórios técnicos.

1. Abra o detalhe do projeto e desça até **Atestados de frequência**.
2. Escolha o **Mês de referência**. O mês proposto é o anterior ao mês atual — o documento atesta o mês inteiro, e o mês em curso ainda não terminou.
3. Na linha de cada membro **Ativo**, clique em **Gerar atestado**. O botão vira **Regenerar**, e o link **Baixar** passa a aparecer na linha.

Um atestado por membro e por mês: regenerar sobrescreve o mesmo PDF, que baixa com o nome *atestado-AAAA-MM-nome-do-projeto.pdf*. O atestado é do vínculo **Ativo** — quem saiu do projeto não aparece na linha, e projeto sem membros ativos diz *"O projeto não tem membros ativos — o atestado é do vínculo ativo."* Quem gera é a própria pessoa ou a gestão do projeto: o botão aparece nos dois casos, e o servidor decide quem gera de verdade.

```foto painel-atestados titulo="O card Atestados de frequência, no detalhe de um projeto"
O **Mês de referência** vem com o mês anterior ao atual, e cada membro ativo da lista tem o botão **Gerar atestado**.
```

::: nota titulo="O que sai na folha oficial"
O PDF é a folha oficial preenchida: título do projeto, número do edital (ou o número PROPPI, quando o edital não existe), nome, CPF, matrícula, nível, modalidade e agência de fomento da pessoa, e os dados do vínculo — **carga horária** (**8h**, **20h** ou **adaptada**, com o número escrito) e categoria (**Bolsista** ou **Voluntário**). A carga que sai no atestado é a **carga contratada do vínculo**, não as horas registradas em sessões (capítulo 8). A descrição sucinta das atividades traz as duas primeiras etapas do cronograma que cruzam o mês de referência.
:::

::: nota titulo="O sino lembra"
Todo dia 19, o sistema avisa o líder do projeto e os **Coordenador** e **Gerente** que o atestado do mês anterior já pode ser gerado — um aviso por projeto, sem o selo **Urgente**.
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
