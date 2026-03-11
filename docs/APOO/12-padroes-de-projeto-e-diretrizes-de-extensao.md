# Padroes de Projeto e Diretrizes de Extensao

## 1. Objetivo

Este documento registra os padroes de projeto mais relevantes observados no `DisplayQuest` e estabelece diretrizes para extensao do sistema sem degradar sua arquitetura.

O foco e pragmatico: orientar quem vai manter e evoluir o sistema.

## 2. Padroes e estruturas recorrentes

## 2.1 Composition Root

Arquivo central:

- `backend/composition/root.ts`

Papel no sistema:

- montar todos os modulos backend
- conectar dependencias cruzadas
- explicitar o acoplamento entre dominios

Por que isso importa:

- evita instanciacao dispersa de modulos
- torna o acoplamento rastreavel
- reduz dependencia oculta

Diretriz:

- qualquer nova dependencia cruzada relevante deve ser resolvida nesse ponto

## 2.2 Singleton de composicao

Implementacao observada:

- `getBackendComposition()`

Papel no sistema:

- manter uma instancia unica reutilizavel dos modulos backend

Vantagem pratica:

- simplifica o uso pelas rotas
- evita recomposicao ad hoc por requisicao no modelo atual

Diretriz:

- nao criar novas instancias de modulos diretamente nas rotas quando a composicao central ja resolver o caso

## 2.3 Modulo por dominio

Padrao observado:

- cada dominio relevante possui um modulo proprio em `backend/modules/*`

Papel no sistema:

- encapsular capacidades de negocio por contexto funcional
- reduzir espalhamento de logica
- favorecer evolucao incremental por dominio

Diretriz:

- novas funcionalidades devem ser encaixadas primeiro em um dominio existente
- criar modulo novo apenas quando houver fronteira de negocio clara

## 2.4 Use Case como fachada de aplicacao

Padrao observado:

- muitos modulos expoem casos de uso explicitamente por `application/use-cases/*`

Papel no sistema:

- nomear operacoes relevantes do dominio
- desacoplar a chamada externa da implementacao concreta

Limite observado:

- nem todo modulo tem o mesmo nivel de granularidade ou isolamento

Diretriz:

- ao adicionar comportamento novo relevante, preferir criar ou ajustar um use case em vez de empurrar logica para a rota

## 2.5 Gateway de infraestrutura

Padrao observado:

- cada modulo depende de um gateway concreto em `infrastructure/*`

Papel no sistema:

- concentrar implementacao concreta
- orquestrar repositorios, regras, validacoes e dependencias externas

Diretriz:

- logica de negocio complexa pode existir no gateway enquanto o modulo estiver em arquitetura incremental
- ainda assim, a rota nao deve virar o lugar dessa logica

## 2.6 Repositorio

Padrao observado:

- repositorios em `backend/repositories/*`

Papel no sistema:

- isolar persistencia com Prisma
- centralizar consultas e mutacoes mais reutilizadas

Diretriz:

- nao duplicar consulta de persistencia em varios pontos quando ela puder ser promovida a repositorio

## 2.7 Adapter HTTP fino

Padrao observado:

- route handlers em `app/api/*` atuam como adaptadores HTTP

Responsabilidades esperadas:

- autenticar
- autorizar inicialmente
- converter request em comando ou query
- devolver resposta HTTP apropriada

Diretriz:

- rotas devem permanecer finas
- regra de negocio nao deve crescer nos handlers alem do necessario para o protocolo HTTP

## 2.8 Publicacao de eventos internos

Padrao observado:

- eventos internos conectando `task-management` e `work-execution` com `gamification`

Exemplos:

- premiacao por conclusao de tarefa
- premiacao por conclusao de sessao

Papel no sistema:

- reduzir acoplamento direto entre dominio principal e efeitos derivados

Diretriz:

- novos efeitos derivados, como notificacoes ou metricas, devem preferir eventos internos quando isso reduzir acoplamento

## 2.9 Provider e Hook por dominio no frontend

Padrao observado:

- `contexts/*` encapsulam estado compartilhado e chamadas REST
- `hooks/*` encapsulam fluxos especificos da interface

Papel no sistema:

- organizar a UI por dominio funcional
- reduzir fetch disperso por componente

Diretriz:

- se uma funcionalidade for usada por varias telas, prefira provider ou hook de dominio antes de fazer fetch local repetido

## 3. Padroes que merecem cuidado especial

## 3.1 Compatibilidade legado no dominio de tarefas

Elementos observados:

- `assignedTo`
- `assigneeIds`
- `task_assignees`
- `isGlobal`
- `task_user_progress`

Risco:

- alterar apenas uma representacao e esquecer as demais

Diretriz:

- qualquer evolucao em tarefas deve revisar explicitamente:
  - visibilidade
  - atribuicao
  - progresso individual
  - compatibilidade legado
  - efeitos de gamificacao

## 3.2 Regras distribuidas entre UI, rota e backend

Risco:

- duplicacao ou conflito entre comportamento visual e comportamento real

Diretriz:

- ao alterar fluxo importante, revisar:
  - componente ou tela
  - contexto ou hook
  - rota HTTP
  - modulo backend
  - modelo ou persistencia afetada

## 3.3 Diferencas entre semantica conceitual e implementacao atual

Exemplos observados:

- issue nasce conceitualmente `open`, mas o gateway atual cria `in_progress`
- a UI trabalha com `paused` para sessao, enquanto a persistencia principal enfatiza `active` e `completed`

Diretriz:

- se houver divergencia, documentar antes de corrigir
- evitar "corrigir no impulso" sem revisar impacto em telas, filtros e regras

## 4. Como adicionar nova funcionalidade com baixo risco

## 4.1 Dentro de modulo existente

Passos recomendados:

1. identificar o dominio correto
2. definir contrato de entrada e saida
3. criar ou ajustar use case
4. implementar regra no gateway
5. ajustar repositorio, se necessario
6. expor a operacao no modulo
7. criar ou ajustar rota HTTP
8. conectar provider, hook ou componente da UI
9. atualizar documentacao correspondente

## 4.2 Em modulo novo

Passos recomendados:

1. criar pasta em `backend/modules/<novo-modulo>`
2. definir contratos e ports
3. implementar gateway concreto
4. criar `index.ts` do modulo
5. registrar no `backend/composition/root.ts`
6. expor rotas e consumo de UI
7. atualizar documentacao APOO

## 5. Diretrizes de extensao por camada

## 5.1 Backend

- preferir nomear novos comportamentos como use cases
- manter regras de permissao no backend
- evitar chamar Prisma diretamente em muitos pontos fora de repositorios e gateways
- manter dependencias cruzadas explicitas

## 5.2 Frontend

- nao espalhar chamadas `fetch` em diversos componentes se ja houver provider ou hook de dominio
- manter estado global apenas quando o dado for realmente compartilhado
- manter componente visual focado em exibicao e interacao

## 5.3 Banco e schema

- toda mudanca estrutural deve passar por migration
- toda mudanca sensivel em entidades de tarefa, usuario, compra, issue ou sessao deve revisar maquinas de estado e regras de negocio

## 6. Anti-padroes a evitar

- instanciar modulo direto em rota ignorando o composition root
- inserir regra de negocio relevante em componente React
- alterar apenas a UI achando que isso resolve autorizacao
- criar novo fluxo em tarefa sem revisar gamificacao e progresso individual
- alterar schema sem refletir isso na documentacao funcional
- duplicar validacoes de negocio inconsistentes em varios pontos

## 7. Checklist de manutencao antes de entregar nova funcionalidade

- o dominio certo foi escolhido?
- a rota continua fina?
- a autorizacao backend foi mantida?
- a composicao central continua sendo a fonte de montagem?
- os efeitos derivados foram revisados?
- as maquinas de estado foram respeitadas?
- a documentacao APOO relevante foi atualizada?

## 8. Resultado desta etapa

Os padroes de projeto predominantes do `DisplayQuest` nao formam uma arquitetura academica "pura", mas formam um conjunto pragmatico e coerente: monolito modular, composicao central, gateways, use cases, repositorios, eventos internos e providers por dominio.

Esses padroes devem ser preservados para que a evolucao futura continue compreensivel e de baixo risco.
