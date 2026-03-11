# Sumario Executivo

## 1. Apresentacao

O `DisplayQuest` e uma plataforma web voltada ao apoio operacional do `IFNMG Campus Januaria`, desenvolvida para o `Laboratorio de Jogos e Novas Tecnologias Display`. A proposta do sistema e concentrar em um unico ambiente processos que normalmente ficam dispersos entre planilhas, mensagens, memoria operacional da equipe e ferramentas isoladas.

O sistema combina gestao de usuarios, projetos, tarefas, horas trabalhadas, relatorios, operacao do laboratorio e elementos de gamificacao. Seu objetivo principal e dar visibilidade, rastreabilidade e continuidade aos fluxos internos do laboratorio.

## 2. Problema que o sistema busca resolver

O contexto identificado no repositorio indica a necessidade de resolver, ao mesmo tempo, problemas de organizacao e de continuidade:

- dificuldade para acompanhar tarefas e responsabilidades em andamento
- fragmentacao do controle de projetos e membros
- pouca padronizacao no registro de horas, sessoes e logs diarios
- necessidade de aprovacao e controle de acesso por papeis
- ausencia de uma trilha estruturada para relatorios e acompanhamento de produtividade
- risco de perda de contexto institucional e tecnico quando ha troca de mantenedores

## 3. Objetivos do sistema

Os objetivos centrais do `DisplayQuest` sao:

- centralizar a operacao do laboratorio em uma unica plataforma
- organizar atividades de projeto e de laboratorio em fluxos rastreaveis
- controlar acesso ao sistema por status de usuario, papeis e permissoes
- registrar execucao de trabalho por sessoes, logs e relatorios
- oferecer mecanismos de acompanhamento gerencial
- incentivar engajamento por meio de pontuacao, badges, ranking e loja
- reduzir dependencia de conhecimento informal para continuidade do sistema

De forma mais especifica, o sistema busca:

- auxiliar na organizacao de projetos e tarefas
- facilitar a obtencao de informacoes e links dos projetos
- implementar gamificacao por meio de points, badges e leaderboard
- facilitar a criacao e consulta de relatorios
- apoiar a coordenacao no acompanhamento do desempenho dos projetos e da equipe

## 4. Publico-alvo

Os perfis de usuario identificados no sistema sao:

- coordenacao
- gerencia
- laboratoristas
- gerentes de projeto
- pesquisadores
- colaboradores
- voluntarios

Esses perfis interagem com o sistema com diferentes niveis de permissao, visibilidade e responsabilidade operacional.

## 5. Capacidades de negocio suportadas

O sistema suporta, em nivel executivo, os seguintes grupos de capacidade:

- cadastro, autenticacao e aprovacao de usuarios
- gerenciamento de projetos e membros
- organizacao de tarefas com regras distintas de visibilidade e atribuicao
- registro de sessoes de trabalho, logs diarios e relatorios semanais
- controle de responsabilidades, horarios, eventos e issues do laboratorio
- acompanhamento de pontuacao, badges, recompensas e compras
- emissao e leitura de notificacoes

Essas capacidades atendem a uma proposta de centralizacao e organizacao de ferramentas de gerencia de projetos e gestao em uma unica plataforma, com personalizacao voltada ao contexto do laboratorio e uso de gamificacao como mecanismo de engajamento.

## 6. Beneficios esperados

Os principais beneficios esperados com a utilizacao do sistema sao:

- melhor visibilidade sobre atividades e responsaveis
- maior controle sobre quem pode acessar e executar cada fluxo
- historico mais consistente de trabalho e produtividade
- apoio a tomada de decisao da gestao do laboratorio
- melhor onboarding de novos alunos ou mantenedores
- base mais robusta para evolucao arquitetural e funcional

## 7. Visao geral da solucao

Do ponto de vista tecnologico, o sistema foi implementado como uma aplicacao web unificada, com frontend, backend e persistencia integrados no mesmo repositorio. A solucao adota:

- interface web para uso cotidiano
- backend modular com organizacao por dominios
- banco relacional para persistencia das entidades principais
- controle de autenticacao e autorizacao baseado em sessao e papeis

## 8. Premissas e restricoes iniciais

No contexto atual do projeto, foram informadas as seguintes premissas:

- o sistema foi prototipado inicialmente para operacao em rede local do proprio laboratorio
- as praticas de seguranca adotadas nesta fase sao mais simples do que as esperadas para uma implantacao aberta em rede externa
- a LGPD deve ser considerada de forma basica nesta versao documental, com aprofundamento indicado como trabalho futuro

Essas premissas devem ser levadas em conta ao interpretar os requisitos nao funcionais e as decisoes arquiteturais registradas nos demais documentos.

## 9. Limites desta versao do sumario

Este sumario executivo foi produzido a partir da base de codigo e da documentacao tecnica existente. Portanto, ele descreve com seguranca:

- o que o sistema faz
- quem aparenta usar o sistema
- quais processos sao suportados
- quais preocupacoes arquiteturais e operacionais estao presentes

Permanecem como pontos que podem ser refinados em versoes futuras:

- detalhamento de requisitos de privacidade e conformidade ligados a LGPD
- endurecimento de seguranca para ambientes alem da rede local
- definicao de indicadores formais de sucesso e adocao
- eventual mapeamento de processos externos ou integracoes futuras
