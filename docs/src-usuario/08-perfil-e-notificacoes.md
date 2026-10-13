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

```foto perfil-edicao titulo="O perfil em modo de edição"
O avatar aceita imagem enviada pelo sistema; o endereço mostrado é o que o sistema devolve, não um caminho livre.
```

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

## Os logs diários

Os **Logs Diários** são o rastro das sessões encerradas. Você edita os seus próprios logs. **Coordenador** é a única função que enxerga os logs de todas as pessoas.

::: nota titulo="O log nasce da sessão"
O texto do log é o que você escreveu ao encerrar a sessão. Se nada foi escrito, o sistema grava o formato automático `Sessão de trabalho finalizada - N minutos`. Editar o log depois não altera as horas já contadas.
:::

## O controle de sessão no perfil

O botão **Abrir controle de sessao** abre o mesmo cronômetro descrito no capítulo 2. Ele existe para você iniciar ou encerrar uma sessão sem sair do perfil.

## Notificações

O sino no cabeçalho guarda os avisos do sistema: tarefa aprovada, tarefa rejeitada, compra aprovada, conta aprovada, reclamação atribuída. Quando há avisos não lidos, o sino mostra a contagem.

```foto painel-notificacoes titulo="O painel de notificações aberto"
Com a caixa vazia, o painel diz apenas "Nenhuma notificação".
```

O painel é um popover: fecha ao clicar fora dele e fecha com **Escape**. Também é alcançável pelo teclado a partir do sino.

## O perfil visto de fora

```foto perfil titulo="O perfil aberto pela administração"
A mesma tela, aberta por quem tem permissão de gerenciar contas, mostra o perfil de quem foi aberto — não o próprio.
```
