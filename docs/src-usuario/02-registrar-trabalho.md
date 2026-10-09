# Registrar trabalho

A sessão de trabalho é o registro do tempo que você passou no laboratório. É ela que produz as horas que aparecem no seu perfil, nos relatórios e no painel administrativo. Sem sessão aberta, o tempo não é contado: tarefas concluídas geram pontos, mas não geram horas.

## O cronômetro

O controle de sessão fica fixo no canto da tela, em todas as telas internas. Fechado, ele é um botão que muda conforme o estado: relógio com **Sessão de trabalho ativa**, ícone de pausa em âmbar com **Sessão de trabalho pausada**, e um ponto pulsante quando a pausa foi automática. Aberto, ele mostra duas abas: **Sessão** e **Responsabilidade**.

```foto controle-de-sessao titulo="O controle de sessão aberto, com as abas Sessão e Responsabilidade"
O estado aparece escrito ao lado de "Sessão de Trabalho": **Sem sessão**, **Pausada** ou **Ativa**.
```

Na aba **Sessão** o painel mostra o tempo decorrido e, quando há sessão aberta, o aviso da próxima pausa automática, o interruptor **Som ao pausar** e a caixa **Anotações da sessão** (descrita abaixo). A aba **Responsabilidade** é o plantão do laboratório, tratado no capítulo 6.

## Iniciar uma sessão

1. Abra o cronômetro. Se ele estiver fechado, clique no botão no canto da tela — ele mostra o estado da sessão, se houver uma aberta.
2. Em **Projeto**, escolha o projeto em que você vai trabalhar. Coordenadores e gerentes encontram também a opção **Sem projeto específico**, para trabalho que não pertence a nenhum projeto.
3. Opcionalmente preencha **Atividade (opcional)** e **Local (opcional)**. Eles entram no log que a sessão gera ao ser encerrada.
4. Clique em **Iniciar sessão**.

O estado passa a **Ativa** e o cronômetro começa a contar.

Uma pessoa só tem uma sessão de trabalho aberta por vez. Se já existe uma ativa ou pausada, o painel mostra essa sessão em vez do formulário de início.

## Pausar e continuar

- Com a sessão **Ativa**, o botão é **Pausar**. O tempo para de correr e o estado passa a **Pausada**.
- Com a sessão **Pausada**, o botão é **Continuar**. A contagem retoma de onde parou.

O tempo de uma sessão pausada não é contado enquanto ela está pausada. Pausar é o procedimento correto para almoço, reunião ou saída do laboratório.

## Anotações da sessão

Com a sessão aberta, o painel mostra a caixa **Anotações da sessão**, abaixo do relógio. É para escrever ali o que você está fazendo, em blocos, ao longo do dia: ajuste de protocolo, leitura de resultados, discussão de caso.

- Cada sessão tem a sua anotação. Começar outra sessão não traz o texto da anterior, e a anotação da sessão anterior continua guardada.
- O texto fica gravado **neste navegador** enquanto a sessão estiver aberta. Recarregar a página, fechar o painel ou navegar não perde o que já foi escrito.
- Ao clicar em **Parar** — ou em **Encerrar sessão** no aviso de pausa automática — o texto vem para a caixa de log do diálogo, onde você ainda pode ajustar antes de confirmar.

O rascunho **só é apagado quando o encerramento dá certo**. Se a gravação falhar, o diálogo avisa *"Não foi possível encerrar a sessão. Sua anotação foi mantida — tente de novo."* e o texto continua onde estava.

::: nota titulo="Anotação não é o log"
A anotação é rascunho local: só existe neste navegador e some quando a sessão é encerrada com sucesso. O que fica registrado no sistema é o **log diário** que você confirmar no diálogo (capítulo 8).
:::

## Encerrar uma sessão

1. Abra o cronômetro e clique em **Parar**.
2. O sistema abre o diálogo **Finalizar Work Session**. A caixa "Descreva o que foi feito nesta sessão..." já vem com as anotações da sessão, e continua editável.
3. Clique em **Encerrar sessão**.

O log é obrigatório: enquanto a caixa estiver vazia o diálogo avisa *"O log é obrigatório para encerrar a sessão."* e o botão fica desabilitado.

Ao encerrar, o sistema:

- soma o tempo ao total de horas da semana e ao total acumulado;
- grava um registro no seu **log diário** (capítulo 8), com o texto que você escreveu;
- se você não escreveu nada aproveitável, o log recebe o formato automático `Sessão de trabalho finalizada - N minutos`, seguido de `Atividade:` e `Local:` quando foram informados no início.

## Pausa automática

O sistema pausa sozinho toda sessão que ainda estiver ativa quando o relógio cruza um destes horários, no fuso de São Paulo:

**09:30 · 12:00 · 15:00 · 17:00**

Enquanto a sessão está ativa, o cronômetro mostra quantos minutos faltam: *"Pausa automática em 1h 20min"*.

Quando a pausa automática acontece, o sistema abre o diálogo **Sessão pausada automaticamente** com a explicação:

> A work session ficou ativa por muito tempo e foi pausada automaticamente. Você pode continuar de onde parou ou encerrar a sessão.

Escolha **Continuar sessão** para retomar o trabalho, ou **Encerrar sessão** para fechar a sessão e escrever o log.

A sessão é pausada **no horário da pausa**, não no momento em que você viu o aviso. Uma sessão iniciada às 11:00 e deixada ativa até as 14:00 é registrada como pausada às 12:00: as duas horas seguintes não contam.

## Como você fica sabendo da pausa

O diálogo **Sessão pausada automaticamente** aparece na tela — mas só se você estiver olhando para ela. Quem deixa a sessão correndo em outra aba precisa de um sinal fora do diálogo, e é isso que o cronômetro passa a dar:

- **Fechado, o botão mostra o estado**: relógio com a sessão ativa, ícone de pausa em âmbar com a sessão pausada.
- **Depois de uma pausa automática**, o botão ganha um ponto pulsante. Ele some quando você abre o painel, retoma a sessão ou a encerra — ou seja, quando o aviso foi visto ou resolvido.
- **Com o som ligado**, a pausa também toca um "plim" agudo e alongado, no volume máximo. O som é **desligado por padrão** e vive no interruptor **Som ao pausar**, dentro da aba **Sessão** do cronômetro.

::: nota titulo="O som depende do navegador"
O navegador só libera áudio depois de um clique seu. Por isso o interruptor toca uma prévia ao ser ligado: se você não ouviu nada, o navegador está bloqueando áudio nesta página — nesse caso, deixe desligado e use o sinal visual. A preferência fica guardada **neste navegador**.
:::

::: limite titulo="Teto de 9 horas"
Um trecho contínuo de sessão ativa conta no máximo 9 horas. Passou disso, o excedente não é somado. O teto existe para impedir que sessão deixada aberta indefinidamente vire hora registrada.
:::

## O que fica aberto durante a noite

Uma varredura diária às **23:59** (fuso de São Paulo) pausa qualquer sessão que tenha sobrado ativa — inclusive as de fim de semana. No dia seguinte o painel mostra a sessão como **Pausada**, e ela conta até o instante em que foi pausada, não até você voltar.

## A sessão de outra pessoa

Quem tem a permissão de gerenciar sessões — **Coordenador**, **Gerente** e **Laboratorista** — vê as sessões ativas e pausadas de todas as pessoas e pode pausar, retomar, finalizar e excluir sessões alheias. As demais pessoas operam apenas as próprias sessões.

::: nota titulo="Sessão não é tarefa"
Registrar trabalho e concluir tarefas são dois registros diferentes. A sessão mede tempo; a tarefa mede entrega e gera pontos. Uma sessão pode ser encerrada sem nenhuma tarefa concluída, e uma tarefa pode ser concluída sem sessão aberta.
:::
