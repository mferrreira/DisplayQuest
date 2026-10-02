# Casos de uso expandidos

## Finalidade

Este capítulo expande três casos de uso que concentram a maior densidade de regras do
sistema. A escolha não é arbitrária: os três casos selecionados são os únicos em que uma
decisão tomada em uma camada do sistema precisa ser coerente com decisões de outras
camadas, e em que um erro de interpretação produz efeito colateral observável.

Os diagramas de sequência seguem a notação UML de sequência. O lifeline representa um
participante do cenário — um ator externo, uma rota, um caso de uso, um componente de
outro módulo — e não uma classe interna. Os blocos de alternativa representam as decisões
que o caso de uso toma em resposta ao estado do mundo.

## UC-01 · Aprovar cadastro pendente

### Identificação

| Campo | Conteúdo |
| --- | --- |
| Atores primários | Coordenador, Gerente |
| Atores de suporte | Nenhum; a conta pendente é objeto, não ator |
| Pré-condições | Existe ao menos uma conta em situação pendente |
| Pós-condições de sucesso | A contaSituation passa a ativa, ou a conta deixa de existir |
| Gatilho | Decisão administrativa sobre um cadastro recebido |

### Fluxo principal

1. O gestor abre a lista de contas pendentes.
2. O servidor devolve os cadastros aguardando decisão, com o papel e a data de criação.
3. O gestor escolhe aprovar ou recusar.
4. O servidor confirma a sessão e verifica se o ator tem a permissão de gestão de
   usuários.
5. O servidor valida o identificador da conta e a natureza da ação.
6. Aprovar: o sistema localiza a conta, altera sua situação para ativa e devolve a
   projeção pública do cadastro.
7. Recusar: o sistema remove a conta do sistema.
8. O gestor recebe a confirmação.

```figure seq-aprovacao-cadastro titulo="Sequência da decisão administrativa sobre um cadastro pendente"
A sequência evidencia que o ator é derivado da sessão e nunca do corpo da requisição: o
cliente não declara o próprio papel, e portanto não pode agir por ele.

O ponto de maior consequência é o desvio da recusa. A recusa não é uma transição de
estado, e sim uma exclusão. Isso significa que uma conta recusada precisa ser recriada do
zero caso a pessoa volte a se cadastrar, e que não existe caminho para reativá-la.
```

### Extensões

| Condição | Comportamento |
| --- | --- |
| Ator sem permissão de gestão de usuários | Recusa com 403 |
| Identificador ausente, não inteiro ou não positivo | Recusa com 400 |
| Ação diferente de aprovar ou recusar | Recusa com 400 |
| Conta inexistente | Recusa com 404 |

::: limite titulo="Por que a recusa exclui"
A exclusão é uma herança do comportamento original, preservada deliberadamente por ser
observável por quem a sofre. Ela tem duas consequências que a operação deve conhecer: o
endereço de correio fica livre para novo cadastro, e o histórico de tentativas de acesso
desaparece junto com o cadastro. Ambiguidade de navegação ou erro de digitação no
identificador resultam em perda definitiva.
:::

## UC-02 · Aprovar entrega de tarefa

### Identificação

| Campo | Conteúdo |
| --- | --- |
| Atores primários | Gerente de Projeto da tarefa, Coordenador, Gerente |
| Pré-condições | A tarefa está em situação de revisão |
| Pós-condições de sucesso | A tarefa passa a concluída, com instante de conclusão gravado |
| Gatilho | Decisão sobre uma entrega submetida |

### Fluxo principal

1. O aprovador solicita a aprovação de uma tarefa.
2. O sistema carrega a tarefa e, em seguida, o conjunto de responsáveis — a lista de
   responsáveis pode reescrever o responsável principal.
3. O sistema determina se o aprovador pertence ao conjunto de responsáveis.
4. O sistema decide a autoridade por três degraus, nessa ordem: a autoaprovação é vedada
   a quem não administra usuários; quem administra usuários aprova qualquer tarefa; o
   gerente de projeto é autorizado apenas para as tarefas do projeto que lidera; os
   demais, não são autorizados.
5. Quando a decisão é adiada à liderança, o sistema carrega o projeto e confirma se o
   aprovador é de fato o seu líder.
6. O sistema persiste a tarefa com a situação concluída, a marca de conclusão e o
   instante, junto com o conjunto de responsáveis já resolvido.
7. Se a tarefa não for pública nem global, o contador de tarefas concluídas do responsável
   é incrementado — inclusive quando a tarefa não concede pontos.
8. Se a tarefa conceder pontos, o award correspondente é disparado.
9. O responsável recebe a notificação de aprovação.
10. O aprovador recebe a confirmação.

```figure seq-tarefa-revisao titulo="Sequência da aprovação de uma entrega de tarefa em revisão"
A ordem dos testes é significativa e é imposta pelo próprio desenho da regra. A vedação à
autoaprovação é avaliada antes de qualquer concessão de autoridade, de modo que um gerente
de projeto que lidera um projeto é impedido de aprovar a própria entrega mesmo quando
seria, por outro critério, uma autoridade competente.

A permissão de aprovação em duas etapas é a que preserva a legitimidade da decisão: primeiro
o sistema reconhece que há autoridade em abstrato, depois verifica se essa autoridade se
aplica àquela tarefa específica.
```

### Extensões

| Condição | Comportamento |
| --- | --- |
| Tarefa inexistente | Recusa com 404 |
| Tarefa que não está em revisão | Recusa com 409 |
| Aprovador inexistente | Recusa com 404 |
| Autoaprovação sem autoridade administrativa | Recusa com 403, com texto que indica procurar um superior |
| Aprovador sem autoridade e sem projeto associado | Recusa com 403 |
| Gerencia de projeto que não lidera o projeto da tarefa | Recusa com 403 |

### Regras de efeito colateral

| Efeito | Condição |
| --- | --- |
| Incremento do contador de tarefas concluídas | Tarefa não pública e não global, com responsável resolvido |
| Award de pontos | Tarefa com pontuação maior que zero |
| Notificação ao responsável | Tarefa com responsável resolvido |

Os três efeitos ocorrem fora da transação que persiste a aprovação e são absorvidos em
caso de falha. A aprovação é um fato consumado: uma falha na notificação não a desfaz e
não a faz repetir.

## UC-03 · Concluir sessão de trabalho

### Identificação

| Campo | Conteúdo |
| --- | --- |
| Atores primários | Qualquer conta autenticada, para as próprias sessões |
| Atores de suporte | Coordenador, Gerente, Laboratorista, para sessões alheias |
| Pré-condições | Existe uma sessão de trabalho em situação ativa, pausada ou concluída |
| Pós-condições de sucesso | A sessão está concluída, com registro diário correspondente e award disparado |
| Gatilho | Encerramento do trabalho registrado |

### Fluxo principal

1. O usuário solicita a conclusão da sessão.
2. O sistema carrega a sessão. Se ela não existir, a operação é recusada com 404.
3. Se a sessão pertencer a outra pessoa, o sistema exige a permissão de gestão de
   sessões; sem ela, a operação é recusada com 403.
4. Se o cliente declarar um projeto, o sistema exige a permissão de gestão de sessões ou a
   condição de membro do projeto informado.
5. Se o cliente declarar tarefas concluídas, o sistema exige que a sessão esteja ou
   fique concluída, normaliza os identificadores e confere, para cada tarefa, que ela foi
   concluída, que está atribuída ao ator e que pertence ao projeto da sessão.
6. O sistema determina o instante de encerramento. Quando o cliente o declara, o valor é
   aceito; quando não, o relógio do servidor prevalece.
7. O sistema recalcula a duração, mas somente se a sessão ainda estava ativa. Uma sessão
   pausada ou já concluída mantém a duração que já tinha.
8. O sistema persiste a conclusão e substitui o conjunto de tarefas vinculadas.
9. O sistema grava ou atualiza o registro diário correspondente à sessão.
10. O sistema publica o evento de conclusão.
11. O publicador chama a award da sessão e, em seguida, a award de cada tarefa concluída.
12. A award verifica se o fato já foi concedido. Se já foi, não credita nada e devolve a
    progressão vigente; se não foi, calcula os pontos, credita, lê a progressão e avalia
    os distintivos.
13. O usuário recebe a sessão atualizada.

```figure seq-sessao-premio titulo="Sequência da conclusão de uma sessão e da award de pontos correspondente"
A conclusão é idempotente. A duração só é recalculada quando a sessão ainda estava ativa,
o que impede que a repetição da chamada reconte o mesmo trecho. A data e a hora enviadas
pelo cliente são aceitas neste caso de uso, ao contrário do caso de uso de atualização de
sessão; a diferença é registrada no capítulo 7.

A award é idempotente pela descrição canônica do lançamento, e não por consulta de
estado. Quando o fato já foi concedido, a progressão devolvida é a vigente — nunca
zerada —, de modo que reexecutar o fluxo não apaga o progresso acumulado.
```

### Extensões

| Condição | Comportamento |
| --- | --- |
| Sessão inexistente | Recusa com 404 |
| Sessão alheia sem permissão de gestão | Recusa com 403 |
| Projeto declarado sem condição de membro | Recusa com 403 |
| Tarefas declaradas em sessão que não será concluída | Recusa com 400 |
| Tarefa não concluída, não atribuída ao ator ou de outro projeto | Recusa com 400, Invalidando a operação inteira |
| Instante de encerramento em formato inválido | Recusa com 400 |
| Award já concedida anteriormente | Credita zero e devolve a progressão vigente |

### Ordem dos efeitos

A ordem importa e é garantida pela implementação. A conclusão é persistida, o registro
diário é gravado, e só então o evento é publicado. Uma falha no award não desfaz o
trabalho registrado nem o registro diário, porque ambos já foram confirmados quando a
publicação ocorre.

::: nota titulo="Absorção de falha como decisão de projeto"
O sistema escolhe absorver falhas nos efeitos colaterais em vez de propagá-las. A
consequência é que um award perdido não é retomado automaticamente: ele depende de o
evento ser reemitido. A escolha favorece a coerência entre o que o usuário fez e o que o
sistema registrou, em vez da completude automática dos efeitos colaterais.
:::
