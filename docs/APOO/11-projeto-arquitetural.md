# Projeto Arquitetural

## 1. Objetivo

Este documento descreve a arquitetura do `DisplayQuest` do ponto de vista de projeto, com enfase em organizacao das camadas, responsabilidades, dependencias entre modulos e orientacoes para evolucao.

## 2. Visao arquitetural geral

O sistema adota uma arquitetura web unificada em monorepo, combinando frontend, backend e persistencia no mesmo projeto.

Camadas principais:

- interface e paginas em `app/*`
- componentes e formularios em `components/*`
- estado e consumo de API em `contexts/*` e `hooks/*`
- rotas HTTP em `app/api/*`
- modulos de negocio em `backend/modules/*`
- persistencia em `repositories` e `Prisma`

## 3. Organizacao estrutural

### 3.1 Frontend

Estruturas mais importantes:

- `app/`
  - paginas e layouts
  - route handlers de API
- `components/ui/`
  - componentes base reutilizaveis
- `components/features/`
  - componentes por dominio funcional
- `components/admin/`
  - interfaces administrativas
- `contexts/`
  - estado global por dominio
- `hooks/`
  - logica reutilizavel de interface e consumo

### 3.2 Backend

Estruturas mais importantes:

- `backend/modules/`
  - modulos por dominio
- `backend/composition/root.ts`
  - composition root
- `backend/repositories/`
  - acesso a dados legado e reutilizavel
- `backend/models/`
  - objetos e entidades de dominio mais visiveis

### 3.3 Persistencia

Fonte de verdade estrutural:

- `prisma/schema.prisma`

## 4. Estilo arquitetural adotado

O backend segue uma forma de Clean Architecture incremental, sem uniformidade absoluta entre todos os modulos, mas com uma direcao arquitetural clara:

- `application`
  - contratos
  - portas
  - use cases
- `infrastructure`
  - gateways concretos
  - adaptadores
  - publicadores de eventos
- `repositories`
  - operacoes persistentes com Prisma

Essa estrutura nao esta aplicada com o mesmo grau de profundidade em todos os dominios, mas funciona como padrao dominante de organizacao.

## 5. Composition Root

Arquivo central:

- `backend/composition/root.ts`

Responsabilidades:

- instanciar os modulos backend
- resolver dependencias cruzadas
- compor publicadores de eventos e integracoes internas
- expor uma instancia unica reutilizavel dos modulos

Decisao arquitetural importante:

- o sistema usa `getBackendComposition()` como singleton de composicao

Consequencia pratica:

- rotas `app/api/*` nao devem instanciar modulos diretamente
- dependencias entre dominios devem ser resolvidas explicitamente na composicao

## 6. Modulos backend atuais

Os modulos principais identificados sao:

- `identity-access`
- `user-management`
- `project-management`
- `project-membership`
- `task-management`
- `work-execution`
- `reporting`
- `gamification`
- `store`
- `notifications`
- `lab-operations`

## 7. Responsabilidades por modulo

### 7.1 Identity Access

Responsavel por:

- verificacoes RBAC
- checagem de permissao
- logica `self or permission`

### 7.2 User Management

Responsavel por:

- consulta e moderacao de usuarios
- aprovacao de pendentes
- mudancas administrativas de status
- indicadores ligados ao usuario

### 7.3 Project Management

Responsavel por:

- criacao, atualizacao, exclusao e consulta de projetos
- verificacao de acesso e gestao do projeto

### 7.4 Project Membership

Responsavel por:

- membros do projeto
- papeis contextuais
- definicao de lider

### 7.5 Task Management

Responsavel por:

- criacao e atualizacao de tarefas
- conclusao e revisao
- atribuicao e progresso individual
- notificacoes ligadas a revisao
- integracao com gamificacao por evento de tarefa

### 7.6 Work Execution

Responsavel por:

- sessoes de trabalho
- associacao de tarefas a sessoes
- geracao ou atualizacao de logs diarios
- disparo de evento de sessao concluida

### 7.7 Reporting

Responsavel por:

- relatorios semanais
- consolidacoes de horas por projeto e usuario
- historico semanal

### 7.8 Lab Operations

Responsavel por:

- responsabilidades do laboratorio
- issues
- eventos
- horarios gerais e individuais

### 7.9 Gamification

Responsavel por:

- premiacao por eventos
- progressao do usuario
- regras de badges

### 7.10 Store

Responsavel por:

- recompensas
- compras e resgates
- transicoes de status de compra

### 7.11 Notifications

Responsavel por:

- publicacao e leitura de notificacoes do usuario

## 8. Fluxo arquitetural de requisicao

O fluxo mais comum no sistema e:

1. o cliente interage com pagina ou componente
2. contexto ou hook chama wrapper em `contexts/api-client.ts`
3. a requisicao atinge uma rota em `app/api/*`
4. a rota resolve o ator autenticado e faz validacoes iniciais
5. a rota obtem o modulo adequado via `getBackendComposition()`
6. o modulo delega o comportamento ao gateway ou use case
7. a infraestrutura consulta repositorios e banco
8. o resultado sobe de volta ate a resposta HTTP

## 9. Fronteiras arquiteturais

### 9.1 Fronteira HTTP

As rotas em `app/api/*` devem concentrar:

- parse da requisicao
- autenticacao
- autorizacao inicial
- mapeamento de erro para HTTP
- serializacao da resposta

### 9.2 Fronteira de negocio

Os modulos backend devem concentrar:

- regra de negocio
- validacoes contextuais
- orquestracao entre entidades e repositorios

### 9.3 Fronteira de persistencia

Repositorios e Prisma devem concentrar:

- armazenamento
- consultas
- mapeamento de entidades persistentes

## 10. Arquitetura da interface

No frontend, o projeto adota um modelo pragmatico com providers e hooks:

- `SessionProvider` e base da autenticacao na UI
- `ThemeProvider` cuida do tema
- `UserProvider`, `ProjectProvider` e `TaskProvider` distribuem estado compartilhado no dashboard
- outros dominios usam contextos especificos ou hooks dedicados

Essa abordagem organiza a interface por dominio funcional, e nao apenas por hierarquia visual.

## 11. Integracoes internas entre modulos

As principais integracoes internas observadas sao:

- `task-management -> notifications`
  - pedidos de revisao, aprovacao e rejeicao
- `task-management -> gamification`
  - premiacao por progresso de tarefa
- `work-execution -> gamification`
  - premiacao por conclusao de sessao
- `user-management -> identity-access`
  - verificacao de permissao
- `lab-operations -> notifications`
  - notificacoes ligadas a issues

## 12. Padroes arquiteturais relevantes

Padroes mais visiveis na implementacao atual:

- modularizacao por dominio
- composition root
- singleton de composicao
- gateways de infraestrutura
- repositorios para acesso a dados
- ports/interfaces para desacoplamento
- publicacao de eventos internos para gamificacao

## 13. Decisoes arquiteturais importantes para manutencao

- `DA-01` O dominio de tarefas deve ser tratado como transversal e sensivel.
- `DA-02` Novas regras de negocio nao devem ser empurradas para componentes visuais.
- `DA-03` Novas dependencias cruzadas devem ser compostas no root central, e nao instanciadas ad hoc.
- `DA-04` Compatibilidades legadas de tarefas devem ser preservadas conscientemente ate sua retirada formal.
- `DA-05` A documentacao deve ser atualizada sempre que houver mudanca estrutural relevante em dominio, fluxo ou estado.

## 14. Riscos arquiteturais atuais

Os principais riscos observados sao:

- coexistencia entre modelagem mais nova e campos legados em tarefas
- variacao no nivel de encapsulamento entre modulos
- parte da semantica operacional distribuida entre UI, rota e backend
- diferencas pontuais entre modelo conceitual e implementacao efetiva de alguns fluxos

Esses riscos nao invalidam a arquitetura, mas exigem disciplina de manutencao.

## 15. Direcao de evolucao recomendada

Para evoluir o sistema com baixo risco:

- manter a composicao central como unico ponto de montagem de dependencias
- fortalecer use cases onde o dominio ainda estiver disperso
- reduzir gradualmente compatibilidades legadas em tarefas
- manter regras de estado explicitadas na documentacao
- adicionar novos dominios seguindo o padrao de modulo, contrato, gateway e exposicao via composicao

## 16. Resultado desta etapa

Arquiteturalmente, o `DisplayQuest` pode ser visto como um monolito modular orientado a dominios, com composicao explicita, acoplamento controlado entre modulos e foco de negocio concentrado em tarefas, projetos, execucao de trabalho e operacao do laboratorio.
