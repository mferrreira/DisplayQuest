# Analise e Modelo Conceitual

## 1. Objetivo

Este documento apresenta a visao de analise orientada a objetos do `DisplayQuest`, identificando os principais conceitos de dominio, suas responsabilidades e suas relacoes conceituais.

O foco aqui nao e reproduzir o schema fisico do banco, mas explicitar a estrutura do problema de negocio tal como o sistema o representa.

## 2. Visao conceitual geral

O `DisplayQuest` organiza o dominio do laboratorio em torno de quatro eixos principais:

- acesso e identidade
- organizacao de projetos e tarefas
- execucao e registro do trabalho
- operacao e acompanhamento institucional do laboratorio

Esses eixos sao complementados por dois eixos de suporte:

- gamificacao
- notificacoes e auditoria

## 3. Agregados conceituais principais

### 3.1 Usuario

Representa a pessoa que utiliza o sistema.

Responsabilidades conceituais:

- possuir identidade e credenciais de acesso
- possuir status de acesso
- acumular pontos e indicadores
- participar de projetos
- executar tarefas e sessoes de trabalho
- interagir com relatorios, issues, compras, badges e notificacoes

Relacionamentos principais:

- um usuario pode participar de varios projetos
- um usuario pode possuir varias tarefas atribuidas ou progresso em tarefas publicas
- um usuario pode possuir varias sessoes, logs, relatorios, compras e notificacoes

### 3.2 Projeto

Representa uma unidade organizada de trabalho do laboratorio.

Responsabilidades conceituais:

- agrupar membros, tarefas e sessoes relacionadas
- armazenar lideranca, criador e links associados
- representar um ciclo de vida operacional por status

Relacionamentos principais:

- um projeto possui varios membros
- um projeto pode possuir um lider
- um projeto agrega tarefas, sessoes de trabalho e logs

### 3.3 Membership de Projeto

Representa o vinculo entre usuario e projeto.

Responsabilidades conceituais:

- formalizar a participacao do usuario no projeto
- registrar papeis contextuais do usuario naquele projeto
- servir de base para controle de visibilidade e gestao do projeto

Observacao:

O membership e uma entidade conceitual propria, e nao apenas uma relacao tecnica, porque carrega papeis, restricoes e significado de negocio.

### 3.4 Tarefa

Representa uma unidade de trabalho planejada ou em execucao.

Responsabilidades conceituais:

- descrever trabalho a ser feito
- armazenar prioridade, prazo, pontuacao e estado
- indicar escopo e visibilidade
- permitir atribuicao individual ou multipla
- participar de fluxos de aprovacao e gamificacao

Subconceitos associados:

- visibilidade da tarefa
- atribuicao de responsaveis
- progresso individual do usuario

### 3.5 Progresso Individual de Tarefa

Representa o estado de uma tarefa publica para um usuario especifico.

Responsabilidades conceituais:

- registrar o ciclo individual de execucao da tarefa publica
- registrar data de inicio e conclusao individual
- registrar pontos concedidos ao usuario

Observacao:

Este conceito e essencial para distinguir tarefa publica de tarefa delegada.

### 3.6 Sessao de Trabalho

Representa um intervalo de execucao de trabalho por um usuario.

Responsabilidades conceituais:

- registrar inicio, fim, duracao, atividade e local
- associar trabalho a projeto, quando aplicavel
- ligar tarefas concluidas ao trabalho executado
- servir como base para log diario e relatorio semanal

### 3.7 Log Diario

Representa o registro textual do trabalho executado em determinado dia.

Responsabilidades conceituais:

- sintetizar uma sessao de trabalho concluida
- registrar nota descritiva da atividade
- servir de apoio a consulta historica e consolidacoes

### 3.8 Relatorio Semanal

Representa a consolidacao semanal do trabalho de um usuario.

Responsabilidades conceituais:

- resumir a producao do periodo
- referenciar a janela semanal
- apoiar acompanhamento individual e gerencial

### 3.9 Responsabilidade de Laboratorio

Representa a assuncao formal da responsabilidade operacional do laboratorio por um usuario em determinado intervalo.

Responsabilidades conceituais:

- registrar quem responde operacionalmente pelo laboratorio em um dado momento
- registrar inicio, encerramento e observacoes
- permitir consulta da responsabilidade ativa

### 3.10 Issue de Laboratorio

Representa um problema operacional identificado no laboratorio.

Responsabilidades conceituais:

- registrar ocorrencia, prioridade e categoria
- permitir atribuicao de responsavel
- permitir acompanhamento de resolucao

### 3.11 Horario de Laboratorio e Horario Individual

Representam agendas institucionais e agendas individuais.

Responsabilidades conceituais:

- organizar disponibilidade e presenca esperada
- apoiar operacao e consulta de agenda

### 3.12 Evento de Laboratorio

Representa um evento ou ocorrencia registrada no calendario operacional do laboratorio.

### 3.13 Recompensa e Compra

Representam, respectivamente:

- o item disponivel para resgate
- a solicitacao de resgate realizada pelo usuario

Responsabilidades conceituais:

- controlar disponibilidade de recompensa
- debitar pontos do usuario
- acompanhar o ciclo do resgate ate sua conclusao ou cancelamento

### 3.14 Badge e Progressao Gamificada

Representam a camada de engajamento do sistema.

Responsabilidades conceituais:

- reconhecer marcos e desempenho do usuario
- calcular nivel, elo e progresso
- reforcar motivacao e visibilidade de desempenho

### 3.15 Notificacao

Representa mensagem direcionada a um usuario em decorrencia de eventos relevantes do sistema.

### 3.16 Historico

Representa trilha de alteracoes e eventos importantes, especialmente para rastreabilidade e auditoria funcional.

## 4. Relacoes conceituais centrais

As relacoes abaixo sintetizam o modelo conceitual principal:

- Usuario participa de Projeto por meio de Membership de Projeto.
- Projeto agrega Tarefa.
- Projeto agrega Sessao de Trabalho e Log Diario.
- Usuario executa Sessao de Trabalho.
- Sessao de Trabalho pode referenciar Projeto.
- Sessao de Trabalho pode referenciar varias Tarefas.
- Sessao de Trabalho gera ou atualiza Log Diario.
- Usuario conclui Tarefa de forma global ou por Progresso Individual, dependendo da visibilidade.
- Usuario registra Relatorio Semanal a partir do trabalho realizado.
- Usuario registra ou acompanha Issue de Laboratorio.
- Usuario assume Responsabilidade de Laboratorio.
- Usuario acumula pontos, badges e progressao gamificada.
- Usuario solicita Compra de Recompensa.
- Sistema emite Notificacao para Usuario.

## 5. Classes conceituais prioritarias para analise

Do ponto de vista de APOO, as classes conceituais mais relevantes para compreender o sistema sao:

- Usuario
- Projeto
- MembershipProjeto
- Tarefa
- ProgressoTarefaPublica
- SessaoTrabalho
- LogDiario
- RelatorioSemanal
- ResponsabilidadeLaboratorio
- Issue
- Recompensa
- Compra
- Badge
- Notificacao

Essas classes formam o nucleo do entendimento funcional e arquitetural do sistema.

## 6. Subdominios identificados

### 6.1 Subdominio de acesso

Conceitos principais:

- Usuario
- Papel
- Permissao
- Sessao autenticada

### 6.2 Subdominio de gestao de projetos

Conceitos principais:

- Projeto
- MembershipProjeto
- LiderProjeto
- LinkProjeto

### 6.3 Subdominio de execucao de tarefas

Conceitos principais:

- Tarefa
- Atribuicao
- ProgressoIndividual
- Revisao de tarefa

### 6.4 Subdominio de execucao de trabalho

Conceitos principais:

- SessaoTrabalho
- LogDiario
- RelatorioSemanal

### 6.5 Subdominio de operacao do laboratorio

Conceitos principais:

- ResponsabilidadeLaboratorio
- Issue
- EventoLaboratorio
- HorarioLaboratorio
- HorarioUsuario

### 6.6 Subdominio de gamificacao e incentivo

Conceitos principais:

- Pontuacao
- Progressao
- Badge
- Recompensa
- Compra

## 7. Invariantes conceituais relevantes

As seguintes invariantes resumem restricoes importantes do modelo:

- todo usuario nasce pendente
- so usuario ativo pode acessar o sistema
- membership de projeto e unico para um usuario em um projeto
- uma tarefa publica admite progresso individual
- uma tarefa delegada ou privada depende de atribuicao para manipulacao por usuario comum
- so pode haver uma responsabilidade ativa de laboratorio por vez
- uma compra de recompensa nasce pendente
- a mesma origem de evento nao deve premiar o usuario duas vezes na gamificacao

## 8. Pontos de atencao do modelo atual

O modelo atual possui algumas tensoes de evolucao que devem ser explicitadas:

- o dominio de tarefas combina modelagem nova e compatibilidade legado, especialmente com `assignedTo` e `isGlobal`
- o estado global da tarefa nem sempre e suficiente para explicar o comportamento; em tarefas publicas, o progresso individual e indispensavel
- parte da semantica de sessao de trabalho existe tanto no backend quanto em convencoes da UI
- o dominio de issues apresenta pequena divergencia entre o estado inicial da entidade e o estado inicial persistido no fluxo de criacao

## 9. Resultado desta etapa de analise

O sistema pode ser entendido, conceitualmente, como uma plataforma centrada em `Usuario`, `Projeto`, `Tarefa` e `SessaoTrabalho`, cercada por camadas de operacao institucional, acompanhamento, notificacao e gamificacao.

Essa visao deve orientar tanto a manutencao da arquitetura atual quanto a extensao futura por novos dominios ou casos de uso.
