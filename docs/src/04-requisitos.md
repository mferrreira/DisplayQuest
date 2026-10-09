# Requisitos

## Convenção de identificação

Cada requisito funcional recebe a identificação `RF-nn` e cada requisito não funcional
recebe `RNF-nn`. A identificação é estável e é usada nas demais partes do documento para
referência cruzada: um requisito que aparece no capítulo de regras de negócio, no modelo
de domínio ou na arquitetura é sempre o mesmo requisito.

Os requisitos abaixo descrevem o sistema implementado. Onde um requisito enunciado em
especificação anterior não corresponde ao comportamento atual, o texto reflete o
comportamento e a divergência é tratada no capítulo 13.

## Requisitos funcionais

| Id | Requisito | Verificável por |
| --- | --- | --- |
| RF-01 | Nenhuma conta tem acesso ao sistema antes de ser aprovada por uma pessoa autorizada | Sequência de aprovação de cadastro; estado inicial `pending` |
| RF-02 | A autorização de uma ação é determinada por papéis, e a matriz que a define pertence ao domínio | Matrizes de permissões e de visibilidade |
| RF-03 | Um projeto tem no máximo um líder, e uma pessoa lidera no máximo um projeto | Regras de liderança de projeto |
| RF-04 | Uma tarefa só é concluída por decisão de outra pessoa, vedada a autoaprovação | Regras de aprovação de tarefa |
| RF-05 | A duração de uma sessão de trabalho é calculada pelo servidor, e não declarada pelo cliente | Regras de pausa e conclusão de sessão |
| RF-06 | Um relatório de projeto pode receber anexos, servidos apenas a quem pode ler o relatório | Rotas de anexo e regra de acesso |
| RF-07 | Apenas uma pessoa pode estar de plantão no laboratório por vez | Máquina de estados da responsabilidade |
| RF-08 | A grade de horários é lida por qualquer conta autenticada, e escrita apenas por quem administra usuários | Rotas de grade e guarda de permissão |
| RF-09 | Pontos são creditados a partir de fatos verificados: conclusão de sessão e conclusão de tarefa aprovada | Sequência de conclusão e award |
| RF-10 | A comunicação do sistema é interna e não depende de serviço de correio eletrônico | Publicação de avisos e notificações |

## Requisitos não funcionais

| Id | Requisito | Verificável por |
| --- | --- | --- |
| RNF-01 | Arquivo enviado pelo usuário nunca é servido como recurso estático público | Rota autenticada de anexos e raiz de gravação fora da pasta pública |
| RNF-02 | O banco de dados não é alcançável a partir da rede externa | Declaração de exposição sem publicação de porta |
| RNF-03 | A dependência entre camadas segue uma direção única, e a violação é detectada automaticamente | Verificação de dependências entre camadas |
| RNF-04 | O comportamento das regras é verificável por teste sem infraestrutura de apoio | Regras puras com instante e efeitos externos como parâmetros |
| RNF-05 | A planta de implantação é reproduzível a partir de arquivos versionados, sem passos manuais | Arquivos de orquestração de contêineres |
| RNF-06 | Os dados e os arquivos enviados sobrevivem a reconstrução e recriação de contêiner | Volumes nomeados declarados na orquestração |

## Rastreabilidade

O diagrama abaixo liga cada requisito aos casos de uso que o realizam. O elemento
tracejado representa um caso de uso do catálogo do capítulo 5; um requisito sem caso de uso
associado indicaria funcionalidade especificada e não entregue.

```figure req-rastreabilidade titulo="Requisitos funcionais e não funcionais rastreados até os casos de uso que os realizam"
O diagrama separa os requisitos funcionais, que descrevem o que o sistema faz, dos não
funcionais, que descrevem as qualidades que o sistema precisa preservar.

As arestas de `RF-01` a `RF-10` representam a rastreabilidade de primeiro nível: cada
requisito funcional aponta para ao menos um caso de uso do catálogo. As arestas de `RNF-01`
a `RNF-06` indicam qual funcionalidade exercita cada restrição estrutural, o que permite
avaliar o impacto de uma mudança de qualidade sobre o comportamento observável.

A densidade do requisito `RF-05` merece destaque: ele reúne as decisões de maior alcance
antifraude do sistema e é o requisito que mais restringe a implementação do back-end.
```

## Priorização

A priorização reflete o quanto a ausência de um requisito comprometeria a operação do
laboratório, e não o esforço de implementação.

| Faixa | Requisitos | Critério |
| --- | --- | --- |
| Essencial | RF-01, RF-02, RF-05, RNF-01, RNF-03 | Sem eles o sistema perde a confiabilidade que justifica sua existência |
| Importante | RF-03, RF-04, RF-06, RF-07, RF-09, RNF-02, RNF-06 | Afetam a operação diária e a integridade dos dados |
| Desejável | RF-08, RF-10, RNF-04, RNF-05 | Melhoram a operação e a qualidade do produto |

::: nota titulo="Critério depriorização de RF-04"
A aprovação por terceiro é o requisito que individualiza o produto: sem ele, o quadro de
tarefas passaria a ser uma lista de verificação sem autoridade. Ele é classificado como
importante, e não essencial, porque a operação do laboratório pode prosseguir com revisão
informal — ao custo de perder a verificação que o sistema se propõe a oferecer.
:::
