# Perfil e notificações

O **Perfil** é a sua conta vista por dentro: quem você é no laboratório, o que produziu e como os seus dados aparecem para as outras pessoas.

```foto perfil-participante titulo="O perfil de uma pessoa"
O cartão **Meu Perfil** abre com a faixa da capa e traz avatar, nome e as cifras de trabalho; ao lado do nome ficam os medálhões das passivas equipadas (descritos em *Os distintivos no perfil*), e abaixo dele ficam as três abas.
```

## As três abas

| Aba | O que contém |
| --- | --- |
| **Atividade** | o resumo do que você fez: tarefas, sessões, horas |
| **Logs Diários** | o registro dia a dia, alimentado pelas sessões encerradas |
| **Configurações** | os dados da conta: **Nome**, **Email**, **Biografia**, **Visibilidade do Perfil**, **Horas Semanais** |

```foto perfil-configuracoes titulo="A aba Configurações"
**Horas Semanais** é a meta semanal da pessoa, usada nos relatórios e no painel administrativo.
```

## Editar o perfil

Clique em **Editar Perfil**, no cartão **Meu Perfil**. O cartão entra em modo de edição: aparece a marca **Editando** e o botão passa a **Cancelar Edição**. Altere o que precisa e salve; **Cancelar Edição** descarta as mudanças.

Na aba **Configurações**, o modo de edição traz primeiro o bloco **Badges equipáveis**: uma linha por distintivo conquistado que tem passiva, com o medálhão, o nome, o efeito (`+5% pontos` ou `−15% penalidade`) e o botão **Desequipar** — que vira **Equipar** quando a passiva não está ativa. O título do bloco traz o contador **Equipadas (n/3)**. Só a própria pessoa equipar; o bloco só existe em edição do próprio perfil. Equipar obedece três regras: o distintivo tem de ser conquistado, tem de ter passiva (*"Badge sem passiva não é equipável"*), e há no máximo três equipadas — a quarta recebe *"Slots de passiva cheios"*. O aviso chega escrito na tela, abaixo do título. Abaixo do bloco fica o formulário.

```foto perfil-edicao titulo="O perfil em modo de edição: o bloco Badges equipáveis e o formulário"
O bloco traz o medálhão, o nome, o efeito da passiva e o botão **Desequipar**, com o contador **Equipadas (1/3)** no título. O formulário de dados aparece logo abaixo.
```

### Os dados que os documentos pedem

O formulário tem um bloco chamado **Dados para os documentos oficiais**. São os campos que o atestado de frequência e o relatório técnico pedem, e é você quem os escreve:

| Campo | O que é |
| --- | --- |
| **CPF** | o seu, com os dois dígitos verificadores. A tela mostra `246.813.579-28`; um CPF incompleto ou com dígito errado é recusado |
| **Matrícula** | a matrícula no curso, até 40 caracteres |
| **Curso** | o nome do curso, até 120 caracteres |
| **Modalidade de IC** | **PIBIC**, **PIBIC Jr**, **PIBIC Af**, **PIBITI**, **PIBITI Jr**, **BTP**, **Mestrado**, **Doutorado**, **Pós-doc** ou **Voluntário** |
| **Nível** | **Médio**, **Graduação** ou **Pós-graduação** |
| **Instituição de fomento** | **CNPq**, **Fapemig** ou **Outra** — e em **Outra** aparece o campo **Nome da instituição**, até 80 caracteres |

O CPF é o único desses campos que não é aberto: só você e quem gerencia contas o leem, e ele não aparece no perfil aberto por outra pessoa. Os demais são leitura aberta.

::: nota titulo="A visibilidade é regra do servidor (desde outubro/2026)"
Os três valores de **Visibilidade do Perfil** passaram a ser obedecidos pelo servidor. O que cada um esconde, e o que não esconde:

- **Público** — qualquer pessoa autenticada abre o perfil.
- **Apenas Membros** — você, a administração e quem participa de pelo menos um projeto em comum com a pessoa.
- **Privado** — só você e a administração.

A regra governa a **leitura de perfil**: o cartão da pessoa (biografia, capa, dados pessoais) e a **lista de pessoas** — quem está escondido pela visibilidade não aparece na lista para quem não pode vê-lo; a administração sempre vê todos, porque é na lista que ela gerencia as contas. O que a regra **não** alcança: o **ranking** mostra nome e pontos de quem tem histórico (é a regra do pódio, capítulo 5), e a tela de **Membros** de um projeto mostra o vínculo de quem participa daquele projeto. Perfil de pessoa pendente, rejeitada ou suspensa não é leitura aberta em nenhuma visibilidade: a escolha descreve quem está dentro do sistema.
:::

A **Visibilidade do Perfil** tem três valores:

| Valor | Quem enxerga o perfil |
| --- | --- |
| **Público** | qualquer pessoa autenticada |
| **Apenas Membros** | quem participa dos mesmos projetos |
| **Privado** | só você e a administração |

Editar o próprio perfil é sempre permitido. Editar o perfil de outra pessoa exige permissão de administração, e sem ela o sistema recusa com *"Não autorizado"*. O avatar tem regra mais apertada: a rota que remove avatar é só da própria pessoa — nem quem gerencia contas remove o avatar de outra.

## A capa do perfil

Acima do avatar, o cartão **Meu Perfil** tem uma faixa horizontal: é a **capa** da pessoa. A faixa é 21:9 — uma moldura larga e baixa, como a capa de uma rede social. Sem capa, a faixa diz *"Sem capa"*.

O clique na faixa abre a lista de opções — **Enviar capa**, **Tirar capa**, **Enviar avatar**, **Tirar avatar**. A lista só existe em **modo de edição** (o botão **Editar Perfil** de hoje); fora da edição, a faixa não abre nada. Os controles não somem: viraram itens da lista, pelos mesmos rótulos, pelas mesmas rotas; a escrita continua sendo a autoridade da pessoa (ou de quem gerencia contas).

1. Entre em edição, clique na **faixa da capa** e escolha **Enviar capa**; escolha a imagem: o arquivo sobe para o bucket e passa a ocupar a faixa. **Tirar capa** aparece quando a faixa tem imagem, e o sistema pede confirmação.
2. **Enviar avatar** sobe o arquivo para o bucket, e o avatar escolhido aparece no perfil, no pódio do ranking, no cabeçalho, no menu do aplicativo e na lista de pessoas. Quem não tem avatar no bucket cai no avatar de arquivo de hoje. **Tirar avatar** aparece quando há avatar, e o sistema pede confirmação.

São imagens, só isso: PDF e vídeo não entram aqui. O arquivo vai para o bucket de objetos do sistema, e a tela o lê por um endereço que entrega a imagem apenas a quem está autenticado.

Os rótulos da lista não aparecem no extrato do DOM — o gatilho da faixa é ícone sem texto; o nome dos itens vem da interface medida pelo teste.

```foto perfil-com-capa titulo="A capa do perfil na faixa 21:9"
A faixa tem a altura da moldura 21:9, largura plena; abaixo dela ficam as cifras da semana. Os controles estão na lista que o clique da faixa abre, só em modo de edição.
```

```foto capa-menu-perfil titulo="A lista de opções aberta pelo clique na faixa, em modo de edição: Enviar capa, Tirar capa, Enviar avatar, Tirar avatar"
```

A capa é sua, e quem a escreve é você — ou quem tem permissão de gerenciar contas. Quem a **vê** é qualquer pessoa autenticada: ela aparece no seu perfil, no perfil aberto por outra pessoa e no cartão de quem está em 1º lugar no ranking.

## Os distintivos no perfil

Abaixo das três abas, o perfil tem o bloco **Badges**. O bloco é leitura: os conquistados aparecem em cartões com o **medálhão**, o nome e a categoria; ao passar o cursor, o cartão explica a conquista e, quando o distintivo tem passiva, diz `Passiva: +5% pontos` — ou `Equipada: +5% pontos` quando ela está ativa. A passiva ativa se destaca no cartão: o contorno fica em destaque e o efeito aparece escrito ao lado do nome. Equipar não acontece aqui — é na aba **Configurações**, em modo de edição, no bloco **Badges equipáveis**.

O medálhão é o desenho do distintivo: quando a gestão enviou a imagem do badge, ela aparece no círculo, na cor do distintivo; sem imagem enviada, o círculo mostra o glifo do catálogo, e sem glifo, o ícone da categoria. Os medálhões das equipadas também aparecem no cartão de identidade, ao lado do nome — só as equipadas, no máximo três, a passiva mais recente por primeiro; ao passar o cursor, o medálhão explica o distintivo. A vitrine é a mesma no perfil aberto por outra pessoa.

O bloco lista também os distintivos ainda não conquistados, sob o rótulo **Em progresso**, cada chip com o nome e o número `X de Y` da sua condição. Quem não tem nenhum conquistado vê só essa lista; quando não há progresso a mostrar, o bloco diz *"Nenhum badge conquistado ainda"*.

```foto perfil-badges titulo="O bloco Badges no perfil: a passiva equipada e a lista Em progresso"
O chip de progresso mostra o nome do distintivo e `X de Y`; a passiva ativa aparece marcada no cartão, com o efeito escrito. Nenhum cartão do bloco tem botão — o equipar mora na edição da aba Configurações.
```

## Os logs diários

Os **Logs Diários** são o rastro das sessões encerradas. Você edita os seus próprios logs. **Coordenador** é a única função que enxerga os logs de todas as pessoas.

::: nota titulo="O log nasce da sessão"
O texto do log é o que você escreveu ao encerrar a sessão. Se nada foi escrito, o sistema grava o formato automático `Sessão de trabalho finalizada - N minutos`. Editar o log depois não altera as horas já contadas.
:::

## O controle de sessão no perfil

O botão **Abrir controle de sessao** abre o mesmo cronômetro descrito no capítulo 2. Ele existe para você iniciar ou encerrar uma sessão sem sair do perfil.

## Notificações

O sino no cabeçalho guarda os avisos do sistema: tarefa aprovada, tarefa rejeitada, compra aprovada, conta aprovada, reclamação atribuída. Quando há avisos não lidos, o sino mostra a contagem.

```foto painel-notificacoes titulo="O painel de notificações aberto, com um aviso prioritário"
A notificação *"Atividade atrasada"* chega com o selo vermelho **Urgente**, ícone de alerta e borda vermelha.
```

O cronograma também avisa pelo sino. Quando uma etapa do projeto passa do seu último mês sem ser concluída, o sistema avisa o líder do projeto e os **Coordenador** e **Gerente** — um aviso por etapa, não um por dia. Esses avisos chegam com o selo **Urgente**, e o selo continua depois de lidos.

O painel é um popover: fecha ao clicar fora dele e fecha com **Escape**. Também é alcançável pelo teclado a partir do sino.

## O perfil visto de fora

```foto perfil titulo="O perfil aberto pela administração"
A mesma tela, aberta por quem tem permissão de gerenciar contas, mostra o perfil de quem foi aberto — não o próprio.
```

O perfil de outra pessoa também se abre pelo **Ranking**: clique na pessoa e a tela abre o cartão **Perfil do Usuário**, com o botão **Voltar**. Nesse cartão, abaixo do nome e do e-mail, aparece **Dados para os documentos**: **Curso**, **Matrícula**, **Modalidade de IC**, **Nível** e **Instituição de fomento** de quem foi aberto.

```foto perfil-de-outra-pessoa titulo="O perfil de outra pessoa, com os dados dos documentos"
O CPF não aparece aqui, e isso não é descuido: é o único campo dos documentos cuja leitura é restrita.
```
