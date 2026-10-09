# Visão geral, escopo e limites

## Problema e proposta

O laboratório de jogos e novas tecnologias reúne pessoas com perfis distintos: pesquisadores,
colaboradores, voluntários, laboratoristas e gestores. Cada uma dessas pessoas trabalha de
forma diferente e responde a métricas diferentes. Um voluntário precisa de um canal para
assumir tarefas e acompanhar sua evolução; um gerente de projeto precisa de visibilidade
sobre o andamento das tarefas de seu projeto; um coordenador precisa de um retrato
consolidado da operação.

A ausência de uma ferramenta compartilhada produz três consequências previsíveis. O
registro de trabalho fica dependente da boa vontade de quem o anota. A duração das
tarefas passa a ser estimada em vez de medida. E o reconhecimento do esforço deixa de ter
lastro verificável, porque não existe um histórico contra o qual conferir.

O DisplayQuest foi construído para tornar o registro de trabalho a atividade central do
sistema, e para fazer dele a base sobre a qual as demais mecânicas se apoiam. A cadeia é
deliberada: uma pessoa registra uma sessão de trabalho, associa tarefas que concluiu
durante ela, e o sistema credita os pontos correspondentes, evaluate os distintivos e
atualiza a progressão.

## O que o sistema entrega

| Capacidade | Descrição |
| --- | --- |
| Autenticação e papéis | Sete papéis, oito permissões de back-end, aprovação de cadastro obrigatória |
| Projetos | Criação, edição, arquivamento, liderança única e gestão de membros com papéis por projeto |
| Tarefas | Quadro Kanban, visibilidade pública, delegada ou privada, atribuição múltipla e revisão por terceiro |
| Tempo | Sessões de trabalho com relógio do servidor, pausa programada, teto por trecho e varredura noturna |
| Registros | Log diário vinculado à sessão, relatório semanal e relatório de projeto por período |
| Arquivos | Avatares públicos em WebP e anexos de relatório em área privada, servidos por rota autenticada |
| Laboratório | Plantão de responsabilidade, grade de horários, eventos e ciclo de vida de issues |
| Engajamento | Pontos, experiência, níveis, distintivos com critérios avaliáveis, loja de recompensas e ranking |
| Comunicação | Notificações internas por evento e avisos gerais |
| Operação | Agenda interna de reinício semanal, pausa programada e varredura noturna |

## Limites explícitos

Os pontos abaixo não são omissões do documento nem funcionalidades em construção. São
fronteiras deliberadas da solução, e estão registradas aqui para que nenhuma expectativa
se forme a partir de silêncio.

::: limite titulo="O que o sistema não faz"
**Não envia correio eletrônico.** Toda comunicação é interna e aparece no painel de
notificações da aplicação. Não há servidor de mensagens, nem integração com provedor
externo.

**Não executa trabalho fora da aplicação.** O sistema registra o que as pessoas declaram
que fizeram; ele não observa, não integra e não valida o resultado fora do que é
declarado nas descrições de tarefa.

**Não é multi-inquilino.** Há um único laboratório por implantação. Não existe separação
por organização, por unidade ou por tenant.

**Não possui fluxo financeiro.** O preço de uma recompensa é um número inteiro sem
moeda. Não há cobrança, pagamento, nota fiscal nem conciliação.

**Não escala horizontalmente na configuração de referência.** A agenda de tarefas
periódicas roda dentro do processo do servidor web. Uma implantação com mais de uma
réplica executaria a mesma agenda uma vez por réplica. A implantação documentada no
capítulo 10 é deliberadamente de réplica única.

**Não tem aplicativo móvel.** A interface é web, responsiva, e não há produto nativo nem
aplicação de Progressive Web App instalada.
:::

## Contexto de implantação

O sistema é implantado como uma aplicação web monolítica modular. O servidor web e o
banco de dados rodam em contêineres separados, em uma rede privada de bridge. O banco não
publica porta para a rede externa. Os arquivos enviados pelos usuários são gravados em
volumes nomeados, que sobrevivem a reconstruções e recriações de contêiner.

O capítulo 14 descreve os procedimentos de operação, incluindo as condições que derrubam
a aplicação na inicialização e as armadilhas de manutenção que a configuração atual
introduz.

## Premissas de projeto

As premissas abaixo sustentam decisões estruturais do sistema. Elas estão registradas
porque a violação de qualquer uma delas invalida decisões de arquitetura, e não apenas um
requisito isolado.

| Premissa | Consequência se não se sustenta |
| --- | --- |
| O laboratório opera em um único fuso horário | A agenda periódica e a data de corte da semana passam a exigir parametrização |
| O registro de tempo é declarado pelo usuário e conferido pelo servidor | A antifraude passa a depender de instrumentação adicional |
| A escala do laboratório é gerida por pessoas com papel específico | A unicidade do plantão deixa de ser exigível |
| Os arquivos enviados não contêm informação que exija criptografia em repouso | A proteção dos anexos precisa ser reforçada |
| O volume de dados cabe em um banco relacional único | Particionamento e leitura separada passam a ser requisitos |

## Definição de termos

| Termo | Significado no sistema |
| --- | --- |
| Sessão de trabalho | Intervalo de registro de atividade, delimitado por início e por pausa, retomada ou conclusão |
| Trecho | Porção contínua de uma sessão em estado ativo, sujeita a teto de duração |
| Plantão | Estado em que uma pessoa assume a responsabilidade pelo laboratório |
| Responsabilidade | Registro de plantão, distinto de sessão de trabalho |
| Tarefa | Unidade de trabalho com estado, prioridade, visibilidade e pontuação |
| Progressão | Pontos de experiência, nível e elo acumulados por uma pessoa |
| Award | Concessão de pontos e experiência oriunda de um fato verificado |
| Distintivo | Condecoração com critérios avaliáveis sobre as estatísticas da pessoa |
| Recompensa | Item do catálogo de resgate, adquirido com pontos |
| Compra | Pedido de resgate, com estado próprio e dados do item congelados |
| Issue | Ocorrência relatada sobre o laboratório, com ciclo de vida próprio |
| Papel | Atribuição de responsabilidade conferida a uma pessoa, de escopo global ou por projeto |
| Permissão | Capacidade de back-end verificada em rota, com chave e tabela de papéis |
| Chave de funcionalidade | Entrada da matriz que decide a visibilidade de uma função na interface |
