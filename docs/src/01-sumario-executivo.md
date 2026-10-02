# Sumário executivo

## Finalidade do documento

Este documento descreve o sistema DisplayQuest em sua configuração atual. Ele registra o
que o sistema faz, quais regras governam seu comportamento, como seu domínio está
modelado e como sua arquitetura está organizada. A descrição corresponde ao estado do
código, e não a uma intenção de projeto: cada afirmação aqui apresentada é verificável no
repositório, e os comportamentos que divergem entre a especificação original e a
implementação são apontados como tais.

O método de análise e projeto adotado é o da Engenharia de Software Orientada a Objetos,
com a separação explícita entre requisitos, casos de uso, modelo de domínio, regras de
negócio e arquitetura. A notação dos diagramas é UML 2, representada em texto pela
linguagem PlantUML e compilada para SVG no momento da geração deste documento.

## O que é o DisplayQuest

O DisplayQuest é um sistema de apoio à operação de um laboratório de jogos e novas
tecnologias. Ele existe para substituir o registro de trabalho que, sem uma ferramenta
própria, se dispersa em anotações isoladas e planilhas sem consistência. O problema
concreto que o sistema resolve é o seguinte: um laboratório precisa saber quem trabalhou,
por quanto tempo, em qual projeto, sobre o quê, e precisa que esse registro seja confiável
o bastante para sustentar a avaliação de desempenho das pessoas, a prestação de contas e a
atribuição de reconhecimento formal.

O sistema resolve esse problema em torno de sete frentes:

| Frente | O que registra |
| --- | --- |
| Sessão de trabalho | Início, pausa, retomada e conclusão, com duração calculada no servidor |
| Projetos | Agrupamento de pessoas e tarefas, com liderança única |
| Tarefas | Quadro Kanban, atribuição múltipla, envio a revisão e aprovação por terceiro |
| Registros e relatórios | Log diário, relatório semanal e relatório de projeto com anexos |
| Operação do laboratório | Plantão de responsabilidade, grade de horários, eventos e issues |
| Engajamento | Pontos, experiência, distintivos, recompensas e ranking |
| Comunicação | Notificações internas e avisos, sem transporte externo |

## Alcance em números

| Elemento | Quantidade |
| --- | --- |
| Tabelas do modelo de persistência | 25 |
| Enumeradores tipados no esquema | 5 |
| Rotas HTTP sob `app/api` | 77 |
| Páginas da interface | 13 |
| Módulos de domínio no back-end | 11 |
| Casos de uso catalogados | 7 diagramas de caso de uso |
| Papéis de acesso | 7 |
| Permissões de back-end | 8 |
| Chaves de visibilidade de funcionalidade | 24 |

## Como o documento está organizado

O documento segue a ordem clássica de um relatório de análise e projeto, em que cada
capítulo depende do anterior. A arquitetura do sistema ocupa um capítulo próprio e é
tratada com o mesmo detalhe que a modelagem de domínio, por ser a dimensão em que
intervêm as decisões de maior alcance.

| Capítulo | Conteúdo |
| --- | --- |
| 2 | Visão geral, escopo e limites |
| 3 | Atores, papéis e permissões |
| 4 | Requisitos funcionais e não funcionais |
| 5 | Catálogo de casos de uso |
| 6 | Casos de uso expandidos |
| 7 | Regras de negócio |
| 8 | Máquinas de estado |
| 9 | Modelo conceitual |
| 10 | Arquitetura do sistema |
| 11 | Modelo de dados |
| 12 | Padrões e diretrizes |
| 13 | Rastreabilidade e critérios de aceitação |
| 14 | Operação e implantação |
| 15 | Manutenção e continuidade |

## Convenções

**Identificadores.** Requisitos funcionais são `RF-nn` e requisitos não funcionais são
`RNF-nn`. Regras de negócio são `RB-nn`. Casos de uso são nomeados por extenso, sem
código, porque não há código estável que os identifique na implementação.

**Diagramas.** Todo diagrama tem numeração sequencial e é referenciado no texto. As
legendas explicam o que a forma significa naquele diagrama, e não apenas o que ele
representa; um diagrama sem legenda é apenas uma figura.

**Vocabulário de UML.** *Fronteira* designa o sistema do ponto de vista de seus usuários.
*Entidade* designa um conceito do domínio com identidade e ciclo de vida próprios.
*Porta* designa um contrato de acesso a um serviço externo, declarado pelo consumidor e
implementado por um adaptador. *Componente* designa uma unidade substituível do sistema.
*Máquina de estado* designa o conjunto de estados possíveis de uma entidade e as
transições que os conectam.

::: nota titulo="Alcance da verificação"
Todo o conteúdo foi derivado do código, do esquema de persistência e da configuração de
implantação. Onde a implementação preserva um comportamento divergente do que seria
esperado pela regra enunciada, o documento descreve o comportamento implementado e o
sinaliza como herança, em vez de descrever a intenção original.
:::
