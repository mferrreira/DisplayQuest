# Atores e Glossario

## 1. Atores do sistema

Os atores abaixo foram identificados a partir dos papeis definidos no sistema e dos fluxos observados no codigo.

### 1.1 Coordenador

Ator com privilegios elevados de administracao institucional. Atua sobre aprovacao de usuarios, gestao ampla do sistema e supervisao da operacao do laboratorio.

### 1.2 Gerente

Ator com privilegios administrativos amplos, semelhante ao coordenador em varios fluxos de gestao, especialmente usuarios, notificacoes, projetos e compras.

### 1.3 Laboratorista

Ator ligado a operacoes cotidianas do laboratorio. Tem relevancia especial em responsabilidades do laboratorio, operacao, horarios, compras e, em partes do sistema, gerenciamento de sessoes de trabalho.

### 1.4 Gerente de Projeto

Ator com foco em organizacao e acompanhamento de projetos. Pode gerenciar projetos, membros e tarefas conforme as regras do sistema.

### 1.5 Pesquisador

Ator participante das atividades de projeto e execucao de tarefas, com papel tecnico e operacional.

### 1.6 Colaborador

Ator que participa da execucao de tarefas e do registro de trabalho, podendo interagir com projetos, issues, sessoes e relatorios conforme permissao.

### 1.7 Voluntario

Ator com participacao operacional mais restrita, sujeito as regras de visibilidade, atribuicao e aprovacao configuradas para o sistema.

## 2. Atores externos ou secundarios

Nesta etapa, nao foram identificados sistemas externos integrados formalmente como atores do modelo. O ator "Sistema" sera usado nos casos de uso para representar respostas automatizadas, validacoes e atualizacoes internas.

## 3. Glossario

### 3.1 Usuario

Pessoa cadastrada no sistema, com status de acesso e um ou mais papeis globais.

### 3.2 Projeto

Unidade de organizacao de trabalho que agrega membros, tarefas, sessoes de trabalho e dados relacionados.

### 3.3 Membro de projeto

Usuario associado a um projeto por meio de um vinculo de membership e possivelmente de papeis especificos naquele contexto.

### 3.4 Tarefa publica

Tarefa visivel no escopo em que foi criada, com progresso individual por usuario. A conclusao por um usuario nao implica conclusao para todos.

### 3.5 Tarefa delegada

Tarefa manipulavel principalmente pelos usuarios a quem foi atribuida, ou por perfis de gestao.

### 3.6 Tarefa privada

Tarefa com restricoes de manipulacao semelhantes as tarefas delegadas, aplicada ao contexto do projeto.

### 3.7 Progresso individual

Registro de estado de uma tarefa publica para um usuario especifico, independente do estado global da tarefa.

### 3.8 Sessao de trabalho

Registro temporal de uma atividade realizada por um usuario, com inicio, fim, duracao, local, atividade e eventual associacao a projeto e tarefas.

### 3.9 Log diario

Registro textual associado ao trabalho realizado em um dia, podendo estar vinculado a uma sessao de trabalho.

### 3.10 Relatorio semanal

Consolidacao periodica das atividades ou producao do usuario dentro de uma janela semanal.

### 3.11 Responsabilidade de laboratorio

Registro de que determinado usuario assumiu a responsabilidade operacional pelo laboratorio em um intervalo de tempo.

### 3.12 Issue

Problema operacional registrado no sistema, como falha de equipamento, software, rede ou outra ocorrencia de laboratorio.

### 3.13 Badge

Condecoracao ou distintivo concedido ao usuario como parte do sistema de gamificacao.

### 3.14 Recompensa

Item disponivel para resgate na loja, normalmente mediante consumo de pontos.

### 3.15 Compra ou resgate

Solicitacao de uso de pontos para obter uma recompensa, sujeita a estados como pendente, aprovada, rejeitada ou concluida.

### 3.16 Notificacao

Mensagem registrada para um usuario, com suporte a consulta e marcacao de leitura.

### 3.17 Composition Root

Ponto central de montagem das dependencias backend, localizado em `backend/composition/root.ts`.

### 3.18 Singleton de composicao

Instancia unica reutilizada dos modulos backend, exposta por `getBackendComposition()`.
