# Rastreabilidade e critérios de aceitação

## Cadeia de rastreabilidade

A rastreabilidade deste documento liga cinco níveis: requisito, caso de uso, regra de
negócio, entidade de domínio e módulo do back-end. A correspondência abaixo permite
responder, a partir de qualquer um dos níveis, onde o comportamento é decidido e onde ele
é exercitado.

| Requisito | Casos de uso | Regras | Entidades | Módulos |
| --- | --- | --- | --- | --- |
| RF-01 · Conta sob aprovação | Criar conta, Aprovar conta, Recusar conta, Suspender conta | RB-01, RB-02, RB-03 | Usuário, SituaçãoConta | `user-management`, `identity-access` |
| RF-02 · Papéis e permissões | Gerenciar usuários, Atribuir papéis, Definir papéis no projeto | RB-04, RB-05, RB-06 | Papel, Participação | `identity-access`, `user-management`, `project-membership` |
| RF-03 · Projeto com líder único | Criar projeto, Editar projeto, Definir líder, Gerenciar membros | RB-07 a RB-11 | Projeto, Participação | `project-management`, `project-membership` |
| RF-04 · Tarefa revisada por terceiro | Mover no quadro, Concluir, Submeter, Aprovar, Rejeitar | RB-12 a RB-19, RB-66, RB-71, RB-72 | Tarefa, Responsável, Progresso individual | `task-management` |
| RF-05 · Sessão regida pelo servidor | Iniciar, Pausar, Retomar, Finalizar, Excluir, Vincular tarefas | RB-20 a RB-31 | Sessão de trabalho, Vínculo, Log diário | `work-execution` |
| RF-06 · Relatório com anexo | Criar, Editar, Excluir relatório, Anexar, Baixar | RB-32 a RB-38 | Relatório de projeto, Anexo | `reporting` |
| RF-07 · Plantão único e visível | Assumir, Pausar, Retomar, Encerrar responsabilidade, Abrir e tratar issue | RB-39 a RB-41, RB-44 a RB-50 | Responsabilidade, Issue | `lab-operations` |
| RF-08 · Grade com escrita restrita | Consultar grade, Editar a própria grade, Editar grade de terceiros | RB-42, RB-43 | Grade do laboratório, Grade pessoal | `lab-operations` |
| RF-09 · Pontos, distintivos e recompensa | Consultar progresso, Resgatar, Aprovar compra, Conceder badge | RB-51 a RB-57, RB-67 a RB-70 | Recompensa, Compra, Distintivo, Premiação | `store`, `gamification` |
| RF-10 · Comunicado interno | Transmitir comunicado, Ler notificação, Marcar tudo como lido | RB-58 a RB-61 | Notificação, Público | `notifications` |

## Critérios de aceitação por requisito

Um critério de aceitação é verificável sem interpretação. Os critérios abaixo estão
enunciados na forma de condição observável.

| Requisito | Critério de aceitação |
| --- | --- |
| RF-01 | Uma conta recém-criada não autentica; após aprovação, autentica. Uma conta recusada não pode ser consultada nem reativada. |
| RF-02 | Um ator sem a permissão requerida recebe 403 em rota protegida, mesmo que a requisição seja bem formada. |
| RF-03 | Atribuir a liderança a alguém que já lidera outro projeto produz 409. Excluir um projeto concluído é recusado. |
| RF-04 | Aprovar uma tarefa que não está em revisão produz 409. Um gerente de projeto não aprova a própria entrega. Uma tarefa concluída registra instante de conclusão. Aprovar no dia do prazo credita a base (10, mais 5 por subtask concluída); aprovar pelo menos 2 dias antes multiplica por 1,5; aprovar depois desconta 10 por dia de atraso. Marcar subtask com a tarefa fora de Andamento produz 409 com a mesma frase do aviso na tela. |
| RF-05 | A duração de uma sessão não muda quando o cliente envia um valor diferente do computado. Uma sessão que atravessa 09:30 é pausada nesse instante. Um trecho ativo não excede nove horas. |
| RF-06 | Anexo de relatório não é acessível por endereço direto sem sessão autorizada. Um arquivo com extensão permitida e conteúdo divergente é recusado. |
| RF-07 | Assumir plantão com outro já ativo é recusado. O plantão pausado acumula tempo e o encerrado deixa de aparecer como ativo. |
| RF-08 | Qualquer conta autenticada lê a grade completa. Escrever na grade de terceiros sem a permissão de gestão de usuários produz 403. |
| RF-09 | Resgatar com pontos insuficientes é recusado. Repetir o mesmo evento não credita pontos duas vezes. Comprar congela o preço do item. |
| RF-10 | Uma notificação dirigida aparece apenas para o destinatário. Um comunicado geral aparece para todas as contas ativas. |

## Inventário de rotas

As setenta e sete rotas estão agrupadas por área. Cada grupo indica o verbo HTTP principal
e o nível de autorização aplicado.

| Grupo | Rotas | Autorização |
| --- | --- | --- |
| Autenticação e cadastro | `/auth/[...nextauth]`, `/auth/register` | Pública, com aprovação prévia para acesso |
| Saúde | `/health` | Pública |
| Agenda | `/cron/status` | Autenticada |
| Contas | `/users`, `/users/[id]`, `/users/approve`, `/users/[id]/roles`, `/users/[id]/status`, `/users/[id]/points`, `/users/[id]/deduct-hours` | Permissão de gestão de usuários, ou autoria |
| Perfis | `/users/[id]/profile`, `/users/profiles`, `/users/[id]/avatar`, `/users/avatar`, `/users/statistics`, `/users/leaderboard`, `/users/[id]/gamification` | Autenticada, ou autoria |
| Projetos | `/projects`, `/projects/[id]`, `/projects/stats`, `/projects/[id]/members`, `/projects/[id]/volunteers`, `/projects/[id]/hours`, `/projects/[id]/hours-history`, `/projects/[id]/weekly-hours` | Permissão de gestão de projetos, ou participação |
| Tarefas | `/tasks`, `/tasks/[id]`, `/tasks/[id]/approve`, `/tasks/[id]/reject`, `/tasks/global-progress` | Permissão de gestão de tarefas, ou autoria |
| Sessões | `/work-sessions`, `/work-sessions/[id]` | Autoria, ou permissão de gestão de sessões |
| Registros e relatórios | `/daily_logs`, `/daily_logs/[id]`, `/weekly-reports`, `/weekly-reports/[id]`, `/weekly-reports/bulk`, `/weekly-reports/generate`, `/weekly-hours-history`, `/project-reports`, `/project-reports/[id]`, `/project-reports/[id]/aggregate`, `/project-reports/[id]/export.csv` | Permissão de relatórios, ou autoria |
| Arquivos | `/project-reports/[id]/attachments`, `/attachments/[id]`, `/report-files/[...path]`, `/uploads/avatars/[userId]/[filename]` | Regra de leitura do relatório; avatar por autoria |
| Laboratório | `/responsibilities`, `/responsibilities/[id]`, `/laboratory-schedule`, `/laboratory-schedule/[id]`, `/schedules`, `/schedules/[id]`, `/schedules/bulk`, `/lab-events`, `/lab-events/[id]`, `/lab-events/upcoming`, `/lab-notices`, `/lab-notices/[id]`, `/issues`, `/issues/[id]`, `/issues/[id]/assign`, `/issues/[id]/resolve`, `/issues/[id]/status` | Leitura autenticada; escrita conforme a permissão da área |
| Engajamento | `/badges`, `/badges/[id]`, `/user-badges`, `/user-badges/[userId]/[badgeId]`, `/rewards`, `/rewards/[id]`, `/purchases`, `/purchases/[id]` | Permissão de recompensas, ou autoria |
| Comunicação | `/notifications`, `/notifications/[id]`, `/notifications/mark-all-read` | Autoria |

## Páginas da interface

As treze páginas compõem a superfície visível do sistema. Cada uma é restrita pelas chaves
de visibilidade do capítulo 3.

| Página | Conteúdo |
| --- | --- |
| Raiz | Redirecionamento conforme a sessão |
| Autenticação | Formulário de entrada |
| Cadastro | Formulário de criação de conta |
| Painel | Visão geral do trabalho e do engajamento |
| Painel administrativo | Gestão de contas e da operação |
| Painel de projetos | Lista e detalhe de projetos |
| Painel do laboratório | Plantão, eventos, avisos e issues |
| Relatórios semanais | Geração e consulta consolidada |
| Relatório de projeto | Leitura formatada para impressão |
| Loja | Catálogo de recompensas e resgate |
| Gestão da loja | Catálogo e decisão sobre compras |
| Classificação | Ranking de pontos |
| Perfil | Dados pessoais, avatar e visibilidade |

## Critérios de aceitação da arquitetura

Os critérios abaixo verificam a integridade estrutural, e não o comportamento funcional.
Eles fazem parte do processo de entrega.

| Critério | Verificação |
| --- | --- |
| Nenhuma importação proibida entre camadas | Análise estática de dependências, com lista de exceções vazia |
| Nenhum módulo importa outro módulo dentro da árvore | A mesma análise, nas regras específicas de módulo |
| As regras puras não conhecem infraestrutura | A mesma análise, para o núcleo de domínio |
| As rotas não alcançam o ORM diretamente | A mesma análise, para a superfície HTTP |
| O núcleo não lê o relógio | Revisão e verificação: o instante entra como parâmetro em toda função temporal |
| Toda regra temporal é determinística sob instante fixo | Teste unitário das funções de domínio |

::: nota titulo="Rastreabilidade como instrumento de manutenção"
A cadeia deste capítulo não é um exercício de documentação. Ela é o instrumento que
responde, antes de uma alteração, quais regras, entidades e módulos serão afetados. Uma
mudança em RB-12, por exemplo, alcança o caso de uso de aprovação, a entidade tarefa e o
módulo de gestão de tarefas, e a consulta à tabela mostra isso sem necessidade de leitura do
código.
:::
