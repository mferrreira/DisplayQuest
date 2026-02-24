# Backend Clean Architecture (Incremental)

## Objetivo

Deixar a arquitetura limpa mais explicita no backend, principalmente a inversao de dependencias:

- `application` depende de `ports` (interfaces), nao de implementacoes concretas
- `infrastructure` implementa os ports
- composicao de dependencias acontece em um `composition root`

## O que foi ajustado

- Gateways de infraestrutura de modulos-chave (`task-management`, `project-management`, `lab-operations`, `user-management`) nao criam mais modulos concretos cruzados internamente.
- As dependencias (ex.: `identityAccess`, `notifications`, `taskProgressEvents`) passaram a ser injetadas via factories com `gatewayDependencies`.
- Foi criado `backend/composition/root.ts` para centralizar a montagem do grafo de dependencias de todos os modulos backend.
- Rotas `app/api/*` foram migradas para consumir `getBackendComposition()` em vez de instanciar modulos localmente.

## Regra de ouro (pratica)

Nao fazer isso dentro de infraestrutura:

- `createXGateway()` chamando `createYModule()` para resolver regra de negocio cruzada

Fazer isso:

- infraestrutura recebe dependencias por construtor/factory
- `backend/composition/root.ts` monta e injeta

## Padrao para novos modulos

1. `application/ports/*` define as interfaces
2. `application/use-cases/*` depende apenas de `ports`
3. `infrastructure/*` implementa `ports`
4. `index.ts` do modulo monta use cases com um gateway injetavel
5. `backend/composition/root.ts` orquestra dependencias entre modulos

## Proximos passos recomendados

1. Aplicar o mesmo padrao nos modulos restantes que ainda instanciam `createXModule()` dentro de adapters/gateways.
2. Extrair regras de negocio que hoje estao em gateways grandes para services de `domain`/`application` (mantendo gateway focado em IO).
3. Adicionar testes de unidade por use case com mocks de ports (sem Prisma).
