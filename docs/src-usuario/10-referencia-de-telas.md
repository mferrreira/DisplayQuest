# Referência de telas

Esta é a lista completa das telas do sistema, com o endereço de cada uma e quem chega até ela. Serve para localizar um procedimento que este guia descreve e para conferir se uma tela que você não encontra deveria mesmo aparecer para você.

| Tela | Endereço | O que contém | Quem vê |
| --- | --- | --- | --- |
| Entrada | `/login` | e-mail, senha, link de cadastro | qualquer pessoa, autenticada ou não |
| Cadastro | `/register` | nome completo, e-mail, senha | qualquer pessoa |
| Quadro de Tarefas | `/dashboard` | quadro Kanban, filtros, criação de tarefa | todas as funções |
| Projetos | `/dashboard/projetos` | lista de projetos, detalhe com cronograma, relatórios técnicos e atestados | todas as funções |
| Laboratório | `/dashboard/laboratorio` | agenda, responsabilidade, grade de horários, reclamações | todas as funções |
| Relatórios | `/dashboard/weekly-reports` | relatórios por usuário, relatórios de projeto e atestados | Coordenador, Gerente, Laboratorista |
| Painel Administrativo | `/dashboard/admin` | oito abas de gestão, incluindo a aba **Voluntários** | Coordenador e Gerente; o Gerente de Projeto só a aba **Voluntários** |
| Loja | `/dashboard/loja` | recompensas disponíveis e minhas compras; abas **Aprovações** e **Gerenciar** para quem gerencia | todas as funções; as abas de gestão para Coordenador, Gerente e Laboratorista |
| Ranking | `/dashboard/leaderboard` | quadro de liderança e classificação por tarefas e pontos | todas as funções |
| Perfil | `/dashboard/profile` | capa e avatar do **Meu Perfil**, Atividade, Logs Diários, Configurações | todas as funções |

## Controles que não são telas

| Controle | Onde está | O que faz |
| --- | --- | --- |
| Cronômetro de sessão | canto da tela, em todas as telas internas | iniciar, pausar, continuar e encerrar a sessão de trabalho; anotar o que está sendo feito; ligar o som de pausa |
| Painel de notificações | sino no cabeçalho | avisos não lidos; fecha com clique fora ou **Escape** |
| Menu da pessoa | botão com as iniciais no cabeçalho | **Meu Perfil**, **Meus Premios**, **Sair** |
| **Abrir menu** | cabeçalho em janela estreita | os mesmos grupos de navegação |
| **Alternar tema** | cabeçalho | claro e escuro, guardado no navegador |
| Menu do cartão de tarefa | três pontos no cartão | **Mover para** (só os destinos permitidos), **Ver detalhes**, **Editar** |
| Menu de ordenação da coluna | duas setas no cabeçalho da coluna | **Ordenar por** — Urgência, Prazo, Mais recentes, Pontos, Alfabética; vale só para aquela coluna e fica guardado no navegador |
| Selo do prêmio | em cima do contador de pontos, no cabeçalho | o quanto entrou ou saiu da sua pontuação (**+10** verde, **−10** vermelho), contando o número por cerca de um segundo; aparece só quando o crédito é seu |

## Estados possíveis

| Coisa | Estados |
| --- | --- |
| Tarefa | A Fazer, Em Andamento, Em Revisão, Ajustes, Concluído |
| Projeto | Ativo, Concluído, Arquivado |
| Sessão de trabalho | Sem sessão, Ativa, Pausada |
| Compra de recompensa | pendente, aprovada, rejeitada, completada |
| Reclamação | Aberto, Em Andamento, Resolvido, Fechado |
| Conta | pendente, ativa, rejeitada, suspensa |
| Vínculo com projeto | Ativo, Inativo |
| Etapa do cronograma | Aberta, Conclusão solicitada, Concluída |
| Categoria do vínculo | Bolsista, Voluntário, sem categoria |
| Relatório técnico | Parcial, Técnico-final, Final |
| Visibilidade do perfil | Público, Apenas Membros, Privado — a regra que obedece a escolha existe e decide a leitura de perfil (capítulo 8) |
