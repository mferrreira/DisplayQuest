# Plano de Acao para Documentacao no Formato Wazlawick

## 1. Objetivo deste arquivo

Este documento e um guia operacional para produzir a documentacao formal do sistema `DisplayQuest` segundo uma estrutura inspirada na abordagem de Raul Wazlawick para Analise e Projeto Orientado a Objetos.

Ele existe para permitir que qualquer mantenedor:

- entenda rapidamente o escopo da documentacao
- saiba quais artefatos devem ser escritos
- siga uma ordem de execucao objetiva
- acompanhe o progresso sem recomecar a analise do zero

Este arquivo e temporario e util enquanto a documentacao formal ainda estiver incompleta. Quando todos os artefatos estiverem concluidos e revisados, ele pode ser arquivado ou removido.

## 2. Resultado esperado

Devem ser produzidos dois macroartefatos:

### 2.1 Sumario Executivo

Documento voltado ao entendimento do contexto organizacional e do problema de negocio. Deve responder:

- quem usa o sistema
- por que o sistema existe
- quais dores operacionais ele resolve
- quais setores/papeis sao impactados
- quais processos do laboratorio sao suportados
- quais restricoes organizacionais, tecnicas e operacionais moldam o sistema

### 2.2 Projeto

Documento tecnico-funcional principal. Deve consolidar:

- visao do sistema
- requisitos funcionais e nao funcionais
- glossario
- atores
- casos de uso
- casos de uso expandidos dos fluxos mais impactantes
- regras de negocio
- modelo conceitual e visao de dados
- maquina(s) de estados relevantes
- arquitetura do sistema
- padroes de projeto e convencoes de extensao/manutencao

## 3. Decisao de escopo

Esta documentacao nao deve tentar descrever:

- cada funcao utilitaria
- cada endpoint trivial isoladamente
- cada componente visual
- cada CRUD simples em nivel excessivamente detalhado

Esta documentacao deve descrever:

- fluxos de negocio relevantes
- responsabilidades por dominio
- regras de permissao e visibilidade
- estados importantes de entidades
- integracoes e dependencias entre modulos
- decisoes arquiteturais que afetam manutencao futura

## 4. Achados do sistema apos a varredura inicial

A proposta foi baseada na leitura dos seguintes pontos do repositorio:

- `README.md`
- `app/README.md`
- `backend/README.md`
- `docs/01-visao-geral-sistema.md`
- `docs/03-regras-de-negocio.md`
- `docs/04-arquitetura-tecnica.md`
- `docs/06-guia-de-manutencao-handover.md`
- `backend/composition/root.ts`
- `contexts/api-client.ts`
- `prisma/schema.prisma`
- inventario de rotas em `app/api/*`
- inventario de `use-cases` em `backend/modules/*/application/use-cases/*`

### 4.1 Caracteristicas arquiteturais observadas

- O sistema e um monolito web em `Next.js`, com frontend e backend no mesmo repositorio.
- O backend esta sendo organizado em modulos com Clean Architecture incremental.
- A composicao backend e centralizada em `backend/composition/root.ts`.
- Existe um singleton de composicao via `getBackendComposition()`.
- Nem todo comportamento esta igualmente encapsulado em `use-cases`; parte do sistema ainda depende de repositorios e rotas mais diretas.
- O dominio de `tasks` e o eixo mais sensivel e transversal do sistema.
- O sistema mescla operacao institucional, gestao de projetos, execucao de trabalho e gamificacao.

### 4.2 Dominios funcionais identificados

- identidade, autenticacao e aprovacao de usuarios
- usuarios, perfis, pontuacao e leaderboard
- projetos
- membros de projeto
- tarefas
- execucao de trabalho: sessoes e logs diarios
- relatorios semanais
- operacoes do laboratorio: responsabilidades, issues, horarios, eventos
- gamificacao: pontos, badges, progresso
- loja e compras
- notificacoes

## 5. Estrategia de documentacao

### 5.1 Estrutura proposta dos arquivos

Sugestao de organizacao em `docs/APOO/`:

1. `00-guia-de-leitura.md`
2. `01-sumario-executivo.md`
3. `02-visao-geral-e-escopo.md`
4. `03-atores-e-glossario.md`
5. `04-requisitos-funcionais.md`
6. `05-requisitos-nao-funcionais.md`
7. `06-casos-de-uso-catalogo.md`
8. `07-casos-de-uso-expandidos.md`
9. `08-regras-de-negocio.md`
10. `09-maquinas-de-estado.md`
11. `10-analise-e-modelo-conceitual.md`
12. `11-projeto-arquitetural.md`
13. `12-padroes-de-projeto-e-diretrizes-de-extensao.md`
14. `13-rastreabilidade-e-priorizacao.md`

Nao e obrigatorio dividir exatamente assim, mas a separacao entre contexto executivo, analise funcional e projeto tecnico deve ser mantida.

### 5.2 Ordem recomendada de escrita

1. Sumario Executivo
2. Visao geral, escopo e atores
3. Requisitos funcionais e nao funcionais
4. Catalogo de casos de uso
5. Casos de uso expandidos prioritarios
6. Regras de negocio consolidadas
7. Maquinas de estado
8. Analise/projeto arquitetural e padroes
9. Rastreabilidade final

## 6. Convencoes recomendadas para os casos de uso

As convencoes abaixo seguem uma linha compativel com a forma de descricao expandida atribuida a Wazlawick: fluxo principal enumerado, fluxos alternativos ligados ao passo de origem e excecoes referenciadas pelo passo onde ocorrem.

### 6.1 Identificacao

- Caso de uso: `UC-XX`
- Requisito funcional relacionado: `RF-XX`
- Requisito nao funcional: `RNF-XX`
- Regra de negocio: `RN-XX`
- Maquina de estado: `ME-XX`

### 6.2 Estrutura minima de cada caso de uso do catalogo

- identificador
- nome
- objetivo
- atores primarios
- atores secundarios, se houver
- gatilho
- pre-condicoes
- pos-condicoes
- descricao resumida
- requisitos relacionados
- prioridade

### 6.3 Estrutura recomendada do caso de uso expandido

- identificador e nome
- objetivo
- atores
- pre-condicoes
- pos-condicoes de sucesso
- fluxo principal
- fluxos alternativos
- excecoes
- regras de negocio relacionadas
- observacoes de projeto, quando estritamente necessario

### 6.4 Padrao de numeracao dos fluxos

- Fluxo principal: `1.`, `2.`, `3.`
- Fluxo alternativo derivado do passo 3: `3a.`, `3b.`
- Passos internos do fluxo alternativo `3a`: `3a.1`, `3a.2`
- Excecao ligada ao passo 4: `4x.`
- Passos internos da excecao `4x`: `4x.1`, `4x.2`

### 6.5 Regras de redacao

- descrever a interacao entre ator e sistema, nao a implementacao de interface
- evitar detalhes tecnologicos desnecessarios no fluxo funcional
- manter o fluxo principal sem condicionais embutidas
- mover desvios para fluxos alternativos ou excecoes
- indicar explicitamente quando o fluxo retorna ao passo principal ou quando o caso de uso e abortado

## 7. Criterio para escolher quais casos terao expansao completa

Nem todos os casos de uso devem ser expandidos. Expandir apenas os que atendam a pelo menos um dos criterios abaixo:

- alta criticidade de negocio
- alto risco de regressao
- grande quantidade de regras de permissao
- estados complexos
- dependencias entre modulos
- impacto arquitetural relevante
- frequencia alta de uso
- maior dificuldade de onboarding para novos mantenedores

Casos CRUD simples podem ficar apenas no catalogo resumido.

## 8. Backlog inicial de casos de uso por dominio

Os identificadores abaixo sao provisorios e podem ser refinados durante a escrita. A prioridade define a chance de receber expansao completa.

### 8.1 Acesso e usuarios

- `UC-01` Cadastrar usuario no sistema. Prioridade: alta.
- `UC-02` Autenticar usuario. Prioridade: alta.
- `UC-03` Aprovar ou rejeitar cadastro pendente. Prioridade: alta.
- `UC-04` Atualizar perfil do usuario. Prioridade: media.
- `UC-05` Atualizar papeis globais do usuario. Prioridade: alta.
- `UC-06` Consultar ranking e progresso do usuario. Prioridade: media.

### 8.2 Projetos e membros

- `UC-07` Criar projeto. Prioridade: alta.
- `UC-08` Editar projeto. Prioridade: media.
- `UC-09` Excluir projeto. Prioridade: media.
- `UC-10` Consultar projetos acessiveis ao ator. Prioridade: alta.
- `UC-11` Adicionar membro ao projeto. Prioridade: alta.
- `UC-12` Remover membro do projeto. Prioridade: media.
- `UC-13` Definir papeis do membro no projeto. Prioridade: alta.
- `UC-14` Designar lider de projeto. Prioridade: alta.

### 8.3 Tarefas

- `UC-15` Criar tarefa individual. Prioridade: alta.
- `UC-16` Criar backlog em lote. Prioridade: media.
- `UC-17` Consultar tarefas conforme permissao e escopo. Prioridade: alta.
- `UC-18` Atualizar tarefa. Prioridade: alta.
- `UC-19` Concluir tarefa delegada ou privada. Prioridade: alta.
- `UC-20` Concluir tarefa publica com progresso individual. Prioridade: altissima.
- `UC-21` Aprovar tarefa em revisao. Prioridade: alta.
- `UC-22` Rejeitar tarefa em revisao. Prioridade: alta.
- `UC-23` Excluir tarefa. Prioridade: media.

### 8.4 Execucao de trabalho

- `UC-24` Iniciar sessao de trabalho. Prioridade: alta.
- `UC-25` Atualizar sessao de trabalho em andamento. Prioridade: media.
- `UC-26` Finalizar sessao de trabalho e associar tarefas concluidas. Prioridade: altissima.
- `UC-27` Gerar log diario a partir da sessao. Prioridade: alta.
- `UC-28` Consultar sessoes e logs. Prioridade: media.

### 8.5 Relatorios

- `UC-29` Registrar ou atualizar relatorio semanal. Prioridade: alta.
- `UC-30` Gerar relatorio semanal consolidado. Prioridade: alta.
- `UC-31` Consultar relatorios semanais. Prioridade: media.
- `UC-32` Excluir relatorio semanal. Prioridade: baixa.

### 8.6 Operacoes do laboratorio

- `UC-33` Assumir ou registrar responsabilidade de laboratorio. Prioridade: alta.
- `UC-34` Registrar e acompanhar issue de laboratorio. Prioridade: alta.
- `UC-35` Atualizar status de issue. Prioridade: alta.
- `UC-36` Resolver issue. Prioridade: media.
- `UC-37` Gerenciar horarios do laboratorio. Prioridade: media.
- `UC-38` Gerenciar agenda/horario individual. Prioridade: baixa.
- `UC-39` Registrar evento de laboratorio. Prioridade: baixa.

### 8.7 Gamificacao, loja e notificacoes

- `UC-40` Consultar progressao gamificada do usuario. Prioridade: media.
- `UC-41` Conceder pontos e badges por conclusao de atividade. Prioridade: alta.
- `UC-42` Consultar recompensas disponiveis. Prioridade: baixa.
- `UC-43` Solicitar resgate de recompensa. Prioridade: media.
- `UC-44` Aprovar compra/resgate. Prioridade: media.
- `UC-45` Rejeitar ou cancelar compra/resgate. Prioridade: baixa.
- `UC-46` Consultar notificacoes. Prioridade: baixa.
- `UC-47` Marcar notificacoes como lidas. Prioridade: baixa.

## 9. Casos de uso candidatos a expansao completa na etapa inicial

Se a documentacao for feita por etapas, estes devem vir primeiro:

- `UC-01` Cadastrar usuario no sistema
- `UC-02` Autenticar usuario
- `UC-03` Aprovar ou rejeitar cadastro pendente
- `UC-07` Criar projeto
- `UC-10` Consultar projetos acessiveis ao ator
- `UC-11` Adicionar membro ao projeto
- `UC-13` Definir papeis do membro no projeto
- `UC-15` Criar tarefa individual
- `UC-17` Consultar tarefas conforme permissao e escopo
- `UC-20` Concluir tarefa publica com progresso individual
- `UC-21` Aprovar tarefa em revisao
- `UC-22` Rejeitar tarefa em revisao
- `UC-24` Iniciar sessao de trabalho
- `UC-26` Finalizar sessao de trabalho e associar tarefas concluidas
- `UC-27` Gerar log diario a partir da sessao
- `UC-29` Registrar ou atualizar relatorio semanal
- `UC-33` Assumir ou registrar responsabilidade de laboratorio
- `UC-34` Registrar e acompanhar issue de laboratorio
- `UC-41` Conceder pontos e badges por conclusao de atividade

## 10. Maquinas de estado que devem ser documentadas

Estas maquinas de estado sao mais importantes do que diagramar cada entidade secundaria.

- `ME-01` Estado de usuario: `pending`, `active`, `rejected`, `suspended`, `inactive`
- `ME-02` Estado de projeto: `active`, `completed`, `archived`, `on_hold`
- `ME-03` Estado de tarefa: `to-do`, `in-progress`, `in-review`, `done`, `adjust`
- `ME-04` Estado de progresso individual de tarefa publica
- `ME-05` Estado de sessao de trabalho: `active`, `completed`
- `ME-06` Estado de compra/resgate: `pending`, `approved`, `rejected`, `completed`, `cancelled`
- `ME-07` Estado de issue: `open`, `in_progress`, `resolved`, `closed`

## 11. Padroes e decisoes arquiteturais que exigem secao propria

Esta parte nao deve ficar diluida dentro dos casos de uso. Deve haver uma secao especifica para orientar manutencao futura.

Pontos obrigatorios:

- composition root central em `backend/composition/root.ts`
- singleton de composicao via `getBackendComposition()`
- modularizacao por dominio em `backend/modules/*`
- separacao `application` / `infrastructure` / `ports`
- coexistencia entre arquitetura modular e repositorios legados
- uso de contextos frontend como adaptadores de consumo de API
- fronteira entre regra de negocio, rota HTTP e persistencia

## 12. Estrategia para escrever com fidelidade ao sistema atual

Para cada secao, usar sempre esta ordem de verificacao:

1. telas em `app/dashboard/*`
2. componentes/contexts da feature
3. endpoints em `app/api/*`
4. modulo backend correspondente
5. schema Prisma e entidades envolvidas
6. regras e restricoes observadas no codigo

Nunca inventar fluxo apenas com base na interface. Confirmar no backend quando houver duvida sobre permissao, estado ou persistencia.

## 13. Forma de trabalho recomendada para continuidade da escrita

### 13.1 Metodo por iteracoes

Executar em lotes pequenos:

1. escolher um dominio
2. listar atores, entidades, regras e endpoints
3. consolidar os casos de uso resumidos
4. expandir apenas os casos prioritarios
5. registrar lacunas e decisoes em aberto
6. seguir para o proximo dominio

### 13.2 Regra de atualizacao deste arquivo

Ao finalizar um bloco relevante de documentacao:

- atualizar o status na secao 14
- registrar os arquivos produzidos
- registrar pendencias reais, nao suposicoes vagas

## 14. Rastreador de progresso

Status permitidos:

- `nao iniciado`
- `em andamento`
- `concluido`
- `revisao pendente`

### 14.1 Artefatos principais

| Item | Status | Observacoes |
| --- | --- | --- |
| Sumario Executivo | concluido | Primeira versao criada em `docs/APOO/01-sumario-executivo.md` |
| Visao geral e escopo | concluido | Criado em `docs/APOO/02-visao-geral-e-escopo.md` |
| Atores e glossario | concluido | Criado em `docs/APOO/03-atores-e-glossario.md` |
| Requisitos funcionais | concluido | Criado em `docs/APOO/04-requisitos-funcionais.md` |
| Requisitos nao funcionais | concluido | Criado em `docs/APOO/05-requisitos-nao-funcionais.md` |
| Catalogo de casos de uso | concluido | Primeira versao criada em `docs/APOO/06-casos-de-uso-catalogo.md` |
| Casos de uso expandidos prioritarios | concluido | Primeira onda prioritaria consolidada em `docs/APOO/07-casos-de-uso-expandidos.md` |
| Regras de negocio consolidadas | concluido | Criado em `docs/APOO/08-regras-de-negocio.md` |
| Maquinas de estado | concluido | Criado em `docs/APOO/09-maquinas-de-estado.md` |
| Analise/modelo conceitual | concluido | Criado em `docs/APOO/10-analise-e-modelo-conceitual.md` |
| Projeto arquitetural | concluido | Criado em `docs/APOO/11-projeto-arquitetural.md` |
| Padroes de projeto e diretrizes de extensao | concluido | Criado em `docs/APOO/12-padroes-de-projeto-e-diretrizes-de-extensao.md` |
| Rastreabilidade final | concluido | Criado em `docs/APOO/13-rastreabilidade-e-priorizacao.md` |

### 14.2 Dominios

| Dominio | Status | Observacoes |
| --- | --- | --- |
| Acesso e usuarios | concluido | Escopo principal consolidado nos artefatos da pasta `docs/APOO/` |
| Projetos e membros | concluido | Escopo principal consolidado nos artefatos da pasta `docs/APOO/` |
| Tarefas | concluido | Escopo principal consolidado; segue como dominio mais critico e transversal |
| Execucao de trabalho | concluido | Escopo principal consolidado nos artefatos da pasta `docs/APOO/` |
| Relatorios | concluido | Escopo principal consolidado nos artefatos da pasta `docs/APOO/` |
| Operacoes do laboratorio | concluido | Escopo principal consolidado nos artefatos da pasta `docs/APOO/` |
| Gamificacao | concluido | Escopo principal consolidado nos artefatos da pasta `docs/APOO/` |
| Loja e compras | concluido | Escopo principal consolidado nos artefatos da pasta `docs/APOO/` |
| Notificacoes | concluido | Escopo principal consolidado nos artefatos da pasta `docs/APOO/` |

## 15. Fontes externas consultadas para alinhar o formato

Foram verificadas referencias publicas para manter o padrao de casos de uso expandido coerente com a abordagem atribuida a Wazlawick:

- pagina do livro na UFSC: <https://www.inf.ufsc.br/~raul/livro/>
- material resumindo casos de uso expandidos e fluxo principal/alternativo: <https://livrozilla.com/doc/465230/05-modelagem-de-intera%C3%A7%C3%A3o---casos-de-uso-expandidos>

Inferencia aplicada a partir dessas referencias: adotar numeracao do fluxo principal, alternativos ligados ao passo de origem e excecoes separadas por passo, sem descrever detalhes de interface ou tecnologia dentro do caso de uso funcional.
