# Rastreabilidade e Priorizacao

## 1. Objetivo

Este documento relaciona os principais requisitos, casos de uso, dominios e pontos arquiteturais do sistema.

O objetivo nao e criar uma matriz exaustiva e burocratica, mas uma visao rastreavel o suficiente para:

- localizar rapidamente a fonte de comportamento
- priorizar manutencao e evolucao
- avaliar impacto de mudancas

## 2. Convencoes

- `RF`: requisito funcional
- `RNF`: requisito nao funcional
- `UC`: caso de uso
- `RN`: regra de negocio
- `ME`: maquina de estado

## 3. Priorizacao macro dos dominios

### Criticidade alta

- tarefas
- execucao de trabalho
- projetos e membership
- acesso e usuarios

### Criticidade media

- operacoes do laboratorio
- relatorios
- gamificacao

### Criticidade media/baixa

- loja e compras
- notificacoes

## 4. Matriz resumida por dominio

| Dominio | Requisitos principais | Casos de uso principais | Regras/Estados criticos | Modulos principais |
| --- | --- | --- | --- | --- |
| Acesso e usuarios | `RF-01` a `RF-08` | `UC-01` a `UC-06` | `RN-01` a `RN-11`, `ME-01` | `user-management`, `identity-access`, auth |
| Projetos e membros | `RF-09` a `RF-17` | `UC-07` a `UC-14` | `RN-12` a `RN-19`, `ME-02` | `project-management`, `project-membership` |
| Tarefas | `RF-18` a `RF-30` | `UC-15` a `UC-23` | `RN-20` a `RN-46`, `ME-03`, `ME-04` | `task-management`, `notifications`, `gamification` |
| Execucao de trabalho | `RF-31` a `RF-38` | `UC-24` a `UC-28` | `RN-47` a `RN-55`, `ME-05` | `work-execution` |
| Relatorios | `RF-39` a `RF-43` | `UC-29` a `UC-32` | `RN-56` a `RN-61`, `ME-06` | `reporting` |
| Operacoes do laboratorio | `RF-44` a `RF-52` | `UC-33` a `UC-39` | `RN-62` a `RN-78`, `ME-07`, `ME-08` | `lab-operations` |
| Gamificacao | `RF-53` a `RF-55` | `UC-40`, `UC-41` | `RN-79` a `RN-85`, `ME-10` | `gamification` |
| Loja e compras | `RF-56` a `RF-58` | `UC-42` a `UC-45` | `RN-86` a `RN-95`, `ME-09` | `store` |
| Notificacoes | `RF-59` a `RF-61` | `UC-46`, `UC-47` | regras distribuidas em fluxo e notificacao | `notifications` |

## 5. Casos de uso mais sensiveis para regressao

Os casos abaixo devem ser considerados de impacto alto em qualquer alteracao:

- `UC-03` Aprovar ou rejeitar cadastro pendente
- `UC-07` Criar projeto
- `UC-11` Adicionar membro ao projeto
- `UC-13` Definir papeis do membro no projeto
- `UC-15` Criar tarefa individual
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

## 6. Matriz resumida de impacto arquitetural

| Mudanca | Dominios impactados | Risco |
| --- | --- | --- |
| Alterar semantica de roles/permissoes | usuarios, projetos, tarefas, relatorios, operacoes do laboratorio, compras | alto |
| Alterar visibilidade ou atribuicao de tarefas | tarefas, projetos, gamificacao, sessoes | altissimo |
| Alterar fluxo de conclusao de tarefa | tarefas, gamificacao, notificacoes, metricas do usuario | altissimo |
| Alterar fluxo de sessao de trabalho | sessoes, logs, relatorios, gamificacao | altissimo |
| Alterar membership de projeto | projetos, tarefas, horas por projeto, acesso | alto |
| Alterar status de issue | operacoes do laboratorio, notificacoes | medio |
| Alterar fluxo de compra/resgate | loja, pontos do usuario | medio |

## 7. Priorizacao de manutencao futura

### Prioridade imediata

- manter coerencia do dominio de tarefas
- preservar a composicao central do backend
- documentar toda alteracao de estado ou permissao

### Prioridade de consolidacao

- reduzir divergencias entre semantica conceitual e implementacao pontual
- ampliar isolamento de regras onde ainda houver mistura entre rota e gateway

### Prioridade evolutiva

- revisar compatibilidades legadas de tarefas
- ampliar testes de regressao nos fluxos criticos
- endurecer seguranca para ambientes alem da rede local

## 8. Relacao entre artefatos da documentacao

Leitura recomendada para analise de impacto:

1. `04-requisitos-funcionais.md`
2. `06-casos-de-uso-catalogo.md`
3. `07-casos-de-uso-expandidos.md`
4. `08-regras-de-negocio.md`
5. `09-maquinas-de-estado.md`
6. `10-analise-e-modelo-conceitual.md`
7. `11-projeto-arquitetural.md`
8. `12-padroes-de-projeto-e-diretrizes-de-extensao.md`

## 9. Resultado desta etapa

Com esta matriz, a documentacao deixa de ser apenas descritiva e passa a apoiar decisao de manutencao.

Ela indica:

- onde o sistema e mais critico
- quais artefatos consultar primeiro
- quais mudancas exigem maior rigor de revisao
