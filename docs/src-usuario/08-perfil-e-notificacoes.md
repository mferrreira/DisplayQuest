# Perfil e notificações

O **Perfil** é a sua conta vista por dentro: quem você é no laboratório, o que produziu e como os seus dados aparecem para as outras pessoas.

```foto perfil-participante titulo="O perfil de uma pessoa"
O cartão **Meu Perfil** abre com a faixa da capa e traz avatar, nome e as cifras de trabalho; abaixo dele ficam as três abas.
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

```foto perfil-edicao titulo="O perfil em modo de edição, no bloco dos dados dos documentos"
O formulário está na aba **Configurações**: o cartão entra em edição e os campos aparecem abaixo do recorte do avatar.
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

Acima do avatar, o cartão **Meu Perfil** tem uma faixa horizontal: é a **capa** da pessoa. Sem capa, a faixa diz *"Sem capa"*.

1. Clique em **Enviar capa** e escolha a imagem. Ela ocupa a faixa do topo do cartão.
2. Para trocar, envie outra imagem: a nova ocupa o lugar da antiga.
3. **Tirar capa** aparece quando a faixa tem imagem, e o sistema pede confirmação.

São imagens, só isso: PDF e vídeo não entram aqui. O arquivo vai para o bucket de objetos do sistema, e a tela o lê por um endereço que entrega a imagem apenas a quem está autenticado.

A capa é sua, e quem a escreve é você — ou quem tem permissão de gerenciar contas. Quem a **vê** é qualquer pessoa autenticada: ela aparece no seu perfil, no perfil aberto por outra pessoa e no cartão de quem está em 1º lugar no ranking.

## As trilhas e os troféus no perfil

O perfil é também onde a pessoa vê e mexe nas quatro trilhas do engajamento (capítulo 7). Abaixo do
cartão **Meu Perfil** ficam três cifras — **Pontos do mês** (*o placar fecha no fim do mês*),
**Tarefas** (*concluídas na vida*) e **Horas na semana** (com a meta da pessoa). Logo depois vem o
cartão da temporada, com **Pontos do mês**, **XP da temporada**, **Moedas** e **Slots de troféu**: o XP
acumula ao longo do ano, o degrau do elo é o que o XP define, e o degrau é o que abre slots.

Mais abaixo, depois das abas, ficam a prateleira de troféus e o histórico dos ciclos.

**Troféus** lista o que a pessoa conquistou. Cada card diz **Equipado** ou **Na prateleira** e tem o
botão **Equipar** / **Desequipar** — quem equipa é a própria pessoa, não a administração. A linha
acima da lista diz quantos slots estão usados (*1 de 2 slots usados*) e o elo que os libera. Quando o
slot está cheio, o botão de equipar não responde; e se ainda assim a recusa vier do sistema, a frase
do degrau aparece como aviso — *"Seu elo Prata permite equipar até 1 troféu."*. Quem fechou um ano em
1º lugar tem a linha **Campeão** com os anos, e o card do troféu **CAMPEÃO** vem marcado. O efeito do
troféu equipado vale enquanto ele está equipado, e o credit que ele altera registra no histórico o
troféu que participou do número.

O histórico vem em duas tabelas: **Meses fechados** (**Mês**, **Pontos**, **Tarefas**) e **Temporadas
fechadas** (**Temporada**, **Posição**, **Pontos**, **Tarefas**, **XP**, **Elo**). São os números
fotografados pelos fechamentos — depois da zeragem, o número do mês encerrado e o do ano fechado só
existem aqui. Um mês encerrado com placar negativo aparece negativo, e a temporada em que a pessoa
fechou em 1º vem destacada. Quando ainda não houve fechamento, a tabela diz *"Nenhum mês fechado
ainda."* ou *"Nenhuma temporada fechada ainda."*



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
